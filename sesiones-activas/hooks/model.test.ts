import { expect, test } from 'claude-code/testing'

import type { Marks, SessionRecord } from '../types'
import {
  actionForElement,
  actionGate,
  ago,
  askingSummary,
  buildView,
  displayTitle,
  entryOf,
  groupRows,
  isListed,
  missingFromList,
  newlyWaiting,
  parseSessionInfo,
  parseSessionList,
  phaseAfterRestart,
  recordFromApp,
  summaryOf,
  titleRoom,
  withAppInfo,
} from './model'

const NOW = 1_800_000_000_000
const noMarks: Marks = { removed: {}, seen: {} }

const record = (id: string, patch: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  title: id,
  group: null,
  link: `claude://claude.ai/epitaxy/${id}`,
  cwd: `D:\\Proyectos\\${id}`,
  phase: 'quieta',
  phaseAt: NOW - 60_000,
  activatedAt: NOW - 120_000,
  ...patch,
})

test('ago reads minutes, hours and days', () => {
  expect(ago(10_000)).toBe('ahora')
  expect(ago(5 * 60_000)).toBe('5 min')
  expect(ago(3 * 3_600_000)).toBe('3 h')
  expect(ago(2 * 86_400_000)).toBe('2 d')
})

test('a session with no title shows its folder name', () => {
  expect(displayTitle(null, 'D:\\Trabajo\\0. Clientes\\Tienda')).toBe('Tienda')
  expect(displayTitle('  ', 'C:/a/b/')).toBe('b')
  expect(displayTitle('CEO', 'C:/a/b')).toBe('CEO')
})

test('a session never written to is not listed', () => {
  expect(isListed(record('a', { activatedAt: null }), noMarks)).toBe(false)
})

test('a removed session is hidden until written to again', () => {
  const removed: Marks = { removed: { a: NOW - 60_000 }, seen: {} }

  expect(isListed(record('a', { activatedAt: NOW - 120_000 }), removed)).toBe(false)
  expect(isListed(record('a', { activatedAt: NOW - 1_000 }), removed)).toBe(true)
})

test('phases land in the buckets of option B', () => {
  const view = buildView(
    [
      record('working', { phase: 'trabajando' }),
      record('asking', { phase: 'pide' }),
      record('done', { phase: 'termino' }),
      record('idle', { phase: 'quieta' }),
    ],
    noMarks,
    null,
    null,
    NOW,
  )

  expect(view.trabajando.map(row => row.id)).toEqual(['working'])
  expect(view.espera.map(row => row.id).sort()).toEqual(['asking', 'done'])
  expect(view.espera.find(row => row.id === 'asking')?.isAsking).toBe(true)
  expect(view.quieta.map(row => row.id)).toEqual(['idle'])
})

test('a finished session moves to quieta once seen', () => {
  const done = record('done', { phase: 'termino', phaseAt: NOW - 30_000 })
  const seen: Marks = { removed: {}, seen: { done: NOW - 10_000 } }

  expect(buildView([done], seen, null, null, NOW).quieta.map(row => row.id)).toEqual(['done'])
})

test('a session stuck working for minutes with no turn running is quieta, an archived one is gone', () => {
  const live = { ids: new Set(['stopped']), running: new Set<string>() }
  const view = buildView(
    [
      record('stopped', { phase: 'trabajando', phaseAt: NOW - 10 * 60_000 }),
      record('archived', { phase: 'trabajando' }),
    ],
    noMarks,
    live,
    null,
    NOW,
  )

  expect(view.quieta.map(row => row.id)).toEqual(['stopped'])
  expect(view.trabajando).toEqual([])
})

test('a session that just started working stays working before the app list catches up', () => {
  const live = { ids: new Set(['fresh']), running: new Set<string>() }
  const view = buildView([record('fresh', { phase: 'trabajando', phaseAt: NOW - 20_000 })], noMarks, live, null, NOW)

  expect(view.trabajando.map(row => row.id)).toEqual(['fresh'])
})

test('a finished session waits for you although the app runs no turn in it', () => {
  // The app's isRunning means a turn is running right now, not that the session is open.
  const live = { ids: new Set(['done', 'asking']), running: new Set<string>() }
  const view = buildView(
    [record('done', { phase: 'termino' }), record('asking', { phase: 'pide' })],
    noMarks,
    live,
    null,
    NOW,
  )

  expect(view.espera.map(row => row.id).sort()).toEqual(['asking', 'done'])
  expect(view.quieta).toEqual([])
})

test('the current session is listed even though the app list leaves it out', () => {
  const live = { ids: new Set<string>(), running: new Set<string>() }
  const view = buildView([record('self', { phase: 'trabajando' })], noMarks, live, 'self', NOW)

  expect(view.trabajando[0]?.isSelf).toBe(true)
})

test('rows are newest first', () => {
  const view = buildView(
    [
      record('old', { phase: 'trabajando', phaseAt: NOW - 50_000 }),
      record('new', { phase: 'trabajando', phaseAt: NOW - 5_000 }),
    ],
    noMarks,
    null,
    null,
    NOW,
  )

  expect(view.trabajando.map(row => row.id)).toEqual(['new', 'old'])
})

test('a session list the app could not send whole is no list', () => {
  const oversized = 'Error: result (88,956 characters across 2,347 lines) exceeds maximum allowed tokens.'

  expect(parseSessionList(oversized)).toBe(null)
  expect(parseSessionList('{"sessionId":"a"}')).toBe(null)
  expect(parseSessionList('[{"sessionId":"a","isRunning":true}]')?.[0]?.sessionId).toBe('a')
})

test('a session answer that is not one is no session', () => {
  expect(parseSessionInfo('Error: something went wrong')).toBe(null)
  expect(parseSessionInfo('[]')).toBe(null)
  expect(parseSessionInfo('{"sessionId":"local_a","title":"CEO"}')?.title).toBe('CEO')
})

test('a restart ends the work in progress but keeps what waits for you', () => {
  expect(phaseAfterRestart('trabajando')).toBe('quieta')
  expect(phaseAfterRestart('pide')).toBe('pide')
  expect(phaseAfterRestart('termino')).toBe('termino')
})

test('listed sessions the recent list left out are looked up, the rest are not', () => {
  const removed: Marks = { removed: { gone: NOW }, seen: {} }
  const records = [
    record('old'),
    record('recent'),
    record('self'),
    record('never', { activatedAt: null }),
    record('gone', { activatedAt: NOW - 60_000 }),
  ]

  expect(missingFromList(records, removed, new Set(['recent']), 'self')).toEqual(['old'])
})

test('only the files a session writes are read as entries', () => {
  expect(entryOf('local_a.json')).toEqual({ id: 'local_a', suffix: 'json' })
  expect(entryOf('local_a.seen')).toEqual({ id: 'local_a', suffix: 'seen' })
  expect(entryOf('_errores.log')).toBe(null)
})

test('sessions of one group gather together, in the order the newest of each came', () => {
  const view = buildView(
    [
      record('crm-1', { phase: 'termino', group: 'CRM', phaseAt: NOW - 1_000 }),
      record('pm', { phase: 'termino', group: 'PM', phaseAt: NOW - 2_000 }),
      record('crm-2', { phase: 'termino', group: 'CRM', phaseAt: NOW - 3_000 }),
      record('loose', { phase: 'termino', group: null, phaseAt: NOW - 4_000 }),
    ],
    noMarks,
    null,
    null,
    NOW,
  )

  expect(groupRows(view.espera).map(set => [set.group, set.rows.map(row => row.id)])).toEqual([
    ['CRM', ['crm-1', 'crm-2']],
    ['PM', ['pm']],
    [null, ['loose']],
  ])
})

test('a renamed or regrouped session takes the name and group the app has now', () => {
  const saved = record('local_a', { title: 'Funcionamiento de mods', group: null, phase: 'termino' })
  const synced = withAppInfo(saved, { sessionId: 'local_a', title: 'Mod - Sesiones activas', group: { name: 'Software' } })

  expect([synced.title, synced.group, synced.phase]).toEqual(['Mod - Sesiones activas', 'Software', 'termino'])
  expect(withAppInfo(saved, undefined)).toEqual(saved)
})

test('a session starting up takes its name from the app and its state from what it saved', () => {
  const saved = record('local_a', { title: 'viejo', phase: 'pide', phaseAt: NOW - 5_000, activatedAt: NOW - 9_000 })
  const info = { sessionId: 'local_a', title: 'nuevo', group: { name: 'CRM' }, link: 'claude://x' }

  expect(recordFromApp(info, saved, 'D:/x', NOW)).toEqual({
    id: 'local_a',
    title: 'nuevo',
    group: 'CRM',
    link: 'claude://x',
    cwd: 'D:/x',
    phase: 'pide',
    phaseAt: NOW - 5_000,
    activatedAt: NOW - 9_000,
    summary: null,
  })
  expect(recordFromApp(info, null, 'D:/x', NOW).phase).toBe('quieta')
})

test('within Te espera a question comes before a finished answer, each kind newest first', () => {
  const view = buildView(
    [
      record('done-new', { phase: 'termino', phaseAt: NOW - 1_000 }),
      record('asks-old', { phase: 'pide', phaseAt: NOW - 9_000 }),
      record('asks-new', { phase: 'pide', phaseAt: NOW - 2_000 }),
    ],
    noMarks,
    null,
    null,
    NOW,
  )

  expect(view.espera.map(row => row.id)).toEqual(['asks-new', 'asks-old', 'done-new'])
})

test('a session with no movement for 30 days leaves the list by itself', () => {
  const view = buildView(
    [record('old', { phase: 'termino', phaseAt: NOW - 31 * 86_400_000, activatedAt: NOW - 32 * 86_400_000 })],
    noMarks,
    null,
    null,
    NOW,
  )

  expect(view.espera).toEqual([])
})

test('only sessions that just started waiting, and never the current one, are announced', () => {
  const before = buildView([record('a', { phase: 'trabajando' }), record('b', { phase: 'termino' })], noMarks, null, 'me', NOW)
  const after = buildView(
    [record('a', { phase: 'termino' }), record('b', { phase: 'termino' }), record('me', { phase: 'termino' })],
    noMarks,
    null,
    'me',
    NOW,
  )

  expect(newlyWaiting(before, after).map(row => row.id)).toEqual(['a'])
  expect(newlyWaiting(null, after)).toEqual([])
})

test('an answer sums up to the question it ends on, else to its opening sentence, markdown left out', () => {
  const asks = 'Listo, revisé todo.\n\n## Detalle\n- algo\n\n¿Querés que revise también **pagos**?'
  expect(summaryOf(asks)).toBe('¿Querés que revise también pagos?')
  expect(summaryOf('**Listo:** pasé las 4 trampas al skill. Después sigo con lo demás.')).toBe('Listo: pasé las 4 trampas al skill.')
  expect(summaryOf('   ')).toBe(null)
  expect(summaryOf('a'.repeat(200))?.length).toBe(90)
})

test('a session asking for something says what it asks', () => {
  expect(askingSummary('AskUserQuestion', { questions: [{ question: '¿Activo el saludo nuevo?' }] })).toBe('¿Activo el saludo nuevo?')
  expect(askingSummary('ExitPlanMode', {})).toBe('Tiene un plan listo para que lo apruebes')
  expect(askingSummary('Bash', {})).toBe('Pide permiso para usar Bash')
})

test('only the rows that wait on you carry their summary', () => {
  const view = buildView(
    [record('waits', { phase: 'termino', summary: 'Listo.' }), record('works', { phase: 'trabajando', summary: 'algo' })],
    noMarks,
    null,
    null,
    NOW,
  )

  expect(view.espera[0]?.summary).toBe('Listo.')
  expect(view.trabajando[0]?.summary).toBe(null)
})

test('the name gets the room the column leaves after the dot, the time and the remove mark', () => {
  expect(titleRoom(40, 'ahora')).toBe(26)
  expect(titleRoom(20, 'aquí · 10 min')).toBe(8)
  expect(titleRoom(200, '5 min')).toBe(40)
  expect(titleRoom(undefined, '5 min')).toBe(34)
})

test('a pane button is found by its key: open, remove, or clear the quiet ones', () => {
  const view = buildView(
    [record('a', { phase: 'termino' }), record('q', { phase: 'quieta' })],
    noMarks,
    null,
    null,
    NOW,
  )
  const calls: string[] = []
  const act = {
    jump: (row: { id: string }) => calls.push(`jump ${row.id}`),
    remove: (row: { id: string }) => calls.push(`remove ${row.id}`),
    clear: (rows: Array<{ id: string }>) => calls.push(`clear ${rows.map(row => row.id).join(',')}`),
    openAll: () => calls.push('openAll'), abrirPareja: () => 0, volverCanal: () => 0, limpiarCanal: () => 0,
  }

  actionForElement('ir-a', view)?.(act)
  actionForElement('quitar-a', view)?.(act)
  actionForElement('limpiar-quieta', view)?.(act)

  expect(calls).toEqual(['jump a', 'remove a', 'clear q'])
  expect(actionForElement('ir-nadie', view)).toBe(null)
  expect(actionForElement('ver-todas', view)).toBe(null)
})

test('a second action right after the first is taken for a repeat and skipped', () => {
  let now = 1_000
  const isFresh = actionGate(1_500, () => now)

  expect(isFresh()).toBe(true)
  now += 200
  expect(isFresh()).toBe(false)
  now += 2_000
  expect(isFresh()).toBe(true)
})
