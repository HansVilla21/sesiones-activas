import type { EngineInterface, Register } from 'claude-code'

import type { CanalVista, Marks, Row, SessionRecord, View } from '../types'
import { fijarAbierta, refrescarCanal } from './canal'
import { ASKING_TOOLS, CANAL_LIMPIADO, EMPTY, EMPTY_CANAL, IDENTIFY_EVERY_MS, LIVE_EVERY_MS, LIVE_LIMIT, PANE, READ_EVERY_MS, TITLE } from './config'
import { leaveMarks, leaveStamp, logFailure, readEntries, readRecord, saveRecord } from './entries'
import { fondoDe } from './fondo'
import { actionForElement, actionGate, askingSummary, buildView, countRows, missingFromList, newlyWaiting, openCommand, parseSessionInfo, parseSessionList, recordFromApp, summaryOf, textOf, withAppInfo } from './model'
import type { Live, SessionInfo } from './model'
import { bandTree, paneTree } from './ui'
import type { Actions } from './ui'

const VIEW = { plugin: 'sesiones-activas', key: 'view' } as const
const CANAL = { plugin: 'sesiones-activas', key: 'canal' } as const

// The engine may load this module again without a session.start: every entry point readies these through ensureReady.
let home = ''
let dir: string | null = null
let isChild = false // a process the canal launched to answer (CANAL_INTERNO_RESPONDE): it leaves no trace here
let self: SessionRecord | null = null
let pending: Partial<SessionRecord> = {}
let live: Live = null
let liveInfo = new Map<string, SessionInfo>()
let liveAt = 0
let identifyAt = 0
let hasTimer = false
let hasOpened = false
let isRefreshing = false
let lastView = ''
let shownView: View | null = null
const cache = new Map<string, { mtimeMs: number; data: unknown }>()
const canalMemo = { texto: '', error: '' }
// One action at a time: a click's focus already acted, so the press of a second click right after is skipped.
const isFresh = actionGate()

const logError = ($: EngineInterface, where: string, error: unknown) => logFailure(portOf($), dir, where, error)

const askApp = async ($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<string | null> => {
  const result = await $.mcp.call('ccd_session_mgmt', tool, args)
  return result.isError ? null : textOf(result)
}

// What entries.ts and canal.ts get of the engine: closures over `$`, so none of them sees `$` itself.
const portOf = ($: EngineInterface) => ({
  listar: (folder: string) => $.fs.list(folder),
  leer: (path: string) => $.fs.read(path).catch(() => null),
  escribir: (path: string, text: string) => $.fs.write(path, text),
  ahora: () => $.clock.now(),
  estado: async () => (await $.state.get(CANAL)).value,
  guardar: (vista: CanalVista) => $.state.set(CANAL, vista),
  fallo: (error: unknown) => logError($, 'canal', error),
})

const identify = async ($: EngineInterface) => {
  const text = await askApp($, 'get_session', { session_id: 'self' })
  const info = text === null ? null : parseSessionInfo(text)
  if (info === null || dir === null) return

  const before = await readRecord(portOf($), dir, info.sessionId)
  self = { ...recordFromApp(info, before, info.cwd ?? (await $.session.cwd()), await $.clock.now()), ...pending }
  pending = {}
  await saveRecord(portOf($), dir, self)
}

const ensureReady = async ($: EngineInterface) => {
  isChild = (await $.env.get('CANAL_INTERNO_RESPONDE')) === '1'
  if (isChild) return
  if (dir === null) {
    home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.').replace(/\\/g, '/')
    dir = `${home}/.claude/sesiones-activas`
  }
  if (!hasTimer) {
    hasTimer = true
    $.clock.every(READ_EVERY_MS, () => void refresh($))
  }

  const now = await $.clock.now()
  if (self !== null || now - identifyAt < IDENTIFY_EVERY_MS) return
  identifyAt = now
  try {
    await identify($)
  } catch (error) {
    await logError($, 'identify', error)
  }
}

// The app's list leaves out the session asking, so its own name and group are asked for apart.
const syncSelf = async ($: EngineInterface) => {
  const info = self === null ? null : parseSessionInfo((await askApp($, 'get_session', { session_id: 'self' })) ?? '')
  if (self === null || info === null) return
  const synced = withAppInfo(self, info)
  if (synced.title === self.title && synced.group === self.group) return
  self = synced
  await saveRecord(portOf($), dir, self)
}

const loadLive = async ($: EngineInterface, records: SessionRecord[], marks: Marks) => {
  await syncSelf($)
  const text = await askApp($, 'list_sessions', { limit: LIVE_LIMIT })
  const rows = text === null ? null : parseSessionList(text)
  if (rows === null) {
    await logError($, 'list_sessions', `la app no devolvió una lista: ${(text ?? '').slice(0, 80)}`)
    return
  }

  const known = new Map(rows.map(row => [row.sessionId, row]))
  for (const id of missingFromList(records, marks, new Set(known.keys()), self?.id ?? null, await $.clock.now())) {
    const info = parseSessionInfo((await askApp($, 'get_session', { session_id: id })) ?? '')
    if (info !== null && info.isArchived !== true) known.set(id, info)
  }
  liveInfo = known
  const all = [...known.values()]
  live = { ids: new Set(known.keys()), running: new Set(all.filter(row => row.isRunning === true).map(row => row.sessionId)) }
}

const refresh = async ($: EngineInterface) => {
  if (isRefreshing) return
  isRefreshing = true

  try {
    await ensureReady($)
    if (isChild) return
    const now = await $.clock.now()
    const { records, marks } = await readEntries(portOf($), dir, cache)
    if (now - liveAt > LIVE_EVERY_MS) {
      liveAt = now
      await loadLive($, records, marks)
    }

    const fresh = records.filter(record => record.id !== self?.id).map(record => withAppInfo(record, liveInfo.get(record.id)))
    const view = buildView(self === null ? fresh : [...fresh, self], marks, live, self?.id ?? null, now)
    for (const row of newlyWaiting(shownView, view)) $.ui.toast(`${row.title} ${row.isAsking ? 'te pregunta algo' : 'terminó'}`)
    shownView = view
    const text = JSON.stringify(view)
    if (text !== lastView) {
      lastView = text
      await $.state.set(VIEW, view)
    }
    await refrescarCanal(portOf($), { home, dir }, canalMemo, now)
  } catch (error) {
    await logError($, 'refresh', error)
  } finally {
    isRefreshing = false
  }
}

const saveSelf = async ($: EngineInterface, patch: Partial<SessionRecord>) => {
  await ensureReady($)
  if (isChild) return
  if (self === null) {
    pending = { ...pending, ...patch }
    return
  }

  self = { ...self, ...patch }
  await saveRecord(portOf($), dir, self)
  await refresh($)
}

const setPhase = async ($: EngineInterface, phase: SessionRecord['phase'], summary: string | null = null) =>
  saveSelf($, { phase, phaseAt: await $.clock.now(), summary })

const leaveMark = async ($: EngineInterface, ids: readonly string[], suffix: 'removed' | 'seen') => {
  await ensureReady($)
  if (isChild) return
  await leaveMarks(portOf($), dir, ids, suffix, await $.clock.now())
  await refresh($)
}

// The app needs ~3 s to hand a link over: the link leaves first, a toast says so, the seen mark runs meanwhile.
const jump = async ($: EngineInterface, row: Row) => {
  const link = row.isSelf ? null : row.link
  if (link !== null) $.ui.toast(`Abriendo ${row.title}…`)
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const opening = link === null ? Promise.resolve() : $.process.run(openCommand(isWindows, link))
  await leaveMark($, [row.id], 'seen')
  await opening
}

// The block's buttons: the open pair lives in the canal's state, the next cycle respects it; Limpiar leaves its mark and runs a cycle.
const openPair = async ($: EngineInterface, abierta: string | null) => {
  if (!isChild) await fijarAbierta(portOf($), canalMemo, abierta)
}

const clearCanal = async ($: EngineInterface) => {
  await ensureReady($)
  if (isChild) return
  await leaveStamp(portOf($), dir, CANAL_LIMPIADO, await $.clock.now())
  await refresh($)
}

const actionsFor = ($: EngineInterface): Actions => ({
  jump: row => isFresh() && jump($, row),
  remove: row => isFresh() && leaveMark($, [row.id], 'removed'),
  clear: rows => isFresh() && leaveMark($, rows.map(row => row.id), 'removed'),
  openAll: () => $.ui.open({ id: PANE, title: TITLE }),
  abrirPareja: clave => isFresh() && openPair($, clave),
  volverCanal: () => isFresh() && openPair($, null),
  limpiarCanal: () => isFresh() && clearCanal($),
})

// Opened once per load, and only once the app has attached to the session: before that there is nowhere to draw.
const openOnce = async ($: EngineInterface) => {
  if (hasOpened || (await $.session.surfaces()).length === 0) return
  try {
    hasOpened = (await $.ui.open({ id: PANE, title: TITLE })).isPlaced
  } catch (error) {
    await logError($, 'ui.open', error)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void openOnce($).then(() => refresh($))

    return started
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await ensureReady($)
    await openOnce($)
    if (self !== null) await leaveMark($, [self.id], 'seen')

    return attached
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta !== true) {
      const now = await $.clock.now()
      await saveSelf($, { activatedAt: now, phase: 'trabajando', phaseAt: now, tareas: null })
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await saveSelf($, { phase: 'trabajando', phaseAt: await $.clock.now(), summary: null, tareas: null })

    return next(e)
  })

  // A turn that ends with background work running answered you but keeps working: the app wakes it when the work ends.
  on('classic.Stop', async ($, e, next) => {
    await saveSelf($, fondoDe(e.background_tasks, self?.vistas ?? {}, await $.clock.now()))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await setPhase($, e.reason === 'aborted' ? 'quieta' : 'termino', summaryOf(done.text))

    return done
  })

  on('tool.call', async ($, e, next) => {
    if (ASKING_TOOLS.has(e.tool)) await setPhase($, 'pide', askingSummary(e.tool, e))
    const ran = await next(e)
    if (self?.phase === 'pide') await setPhase($, 'trabajando')

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await setPhase($, 'pide', askingSummary(e.tool_name, e.tool_input))

    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') await setPhase($, 'pide', e.message)

    return next(e)
  })

  // On the desktop the first click on a pane button only moves the focus to it; that focus acts as the press.
  on('ui.focus', async ($, e, next) => {
    const moved = await next(e)
    if (e.plugin !== 'sesiones-activas' || e.origin.kind !== 'person' || e.element === undefined) return moved
    const run = actionForElement(e.element, (await $.state.get(VIEW)).value ?? EMPTY)
    if (run !== null) await run(actionsFor($))

    return moved
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [{ value: view = EMPTY }, { value: canal = EMPTY_CANAL }] = await Promise.all([$.state.get(VIEW), $.state.get(CANAL)])

    return paneTree($.ui.resolve(e), view, actionsFor($), e.surface, e.props.bodyColumns, canal)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: view = EMPTY } = await $.state.get(VIEW)
    if (e.props.hasSurvey || countRows(view) === 0) return next(e)

    return bandTree($.ui.resolve(e), view, actionsFor($))
  })
}
