import type { McpToolResult } from 'claude-code'

import type { Actions, Bucket, Marks, Phase, Row, SessionRecord, View } from '../types'

export const textOf = (result: McpToolResult): string => {
  const block = result.content.find(one => one.type === 'text') as { text?: string } | undefined

  return block?.text ?? ''
}

export const errorText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

export const ago = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)

  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`

  return `${Math.floor(minutes / (60 * 24))} d`
}

export const folderName = (cwd: string): string => {
  const parts = cwd.split(/[\\/]+/).filter(part => part.length > 0)

  return parts.at(-1) ?? cwd
}

export const displayTitle = (title: string | null, cwd: string): string =>
  title !== null && title.trim().length > 0 ? title : folderName(cwd)

// A session with no movement for this long leaves the list by itself; the mod cannot delete files, so it ignores them.
const STALE_MS = 30 * 86_400_000

export const isListed = (record: SessionRecord, marks: Marks, now?: number): boolean =>
  record.activatedAt !== null &&
  record.activatedAt > (marks.removed[record.id] ?? 0) &&
  (now === undefined || now - record.phaseAt <= STALE_MS)

// The app's isRunning says a turn runs right now. It only overrules a "trabajando" this old,
// left by a session that stopped mid-turn; a newer one may just be ahead of the app's list.
const STUCK_WORKING_MS = 2 * 60_000

export const bucketOf = (record: SessionRecord, marks: Marks, isRunning: boolean, now: number): Bucket => {
  if (record.phase === 'trabajando') {
    return !isRunning && now - record.phaseAt > STUCK_WORKING_MS ? 'quieta' : 'trabajando'
  }
  if (record.phase === 'pide') return 'espera'
  if (record.phase === 'termino') {
    return (marks.seen[record.id] ?? 0) >= record.phaseAt ? 'quieta' : 'espera'
  }

  return 'quieta'
}

export type Live = { ids: ReadonlySet<string>; running: ReadonlySet<string> } | null

/** One row of the app's session list, as list_sessions and get_session answer it. */
export type SessionInfo = {
  sessionId: string
  title?: string
  cwd?: string
  link?: string
  isRunning?: boolean
  isArchived?: boolean
  group?: { name?: string } | null
}

/** One session as get_session answers it, or null when the answer is no session. */
export const parseSessionInfo = (text: string): SessionInfo | null => {
  try {
    const data: unknown = JSON.parse(text)
    const isSession = typeof data === 'object' && data !== null && typeof (data as SessionInfo).sessionId === 'string'
    return isSession ? (data as SessionInfo) : null
  } catch {
    return null
  }
}

/** The app answers a list too large to send with a plain-text notice, not JSON: that is no list. */
export const parseSessionList = (text: string): SessionInfo[] | null => {
  try {
    const data: unknown = JSON.parse(text)
    return Array.isArray(data) ? (data as SessionInfo[]) : null
  } catch {
    return null
  }
}

export const buildView = (
  records: readonly SessionRecord[],
  marks: Marks,
  live: Live,
  selfId: string | null,
  now: number,
): View => {
  const view: View = { espera: [], trabajando: [], quieta: [] }
  const newestFirst = [...records].sort((a, b) => b.phaseAt - a.phaseAt)

  for (const record of newestFirst) {
    const isSelf = record.id === selfId
    const isKnown = isSelf || live === null || live.ids.has(record.id)

    if (!isKnown || !isListed(record, marks, now)) continue

    const isRunning = isSelf || live === null || live.running.has(record.id)
    const bucket = bucketOf(record, marks, isRunning, now)
    const row: Row = {
      id: record.id,
      title: displayTitle(record.title, record.cwd),
      group: record.group,
      link: record.link,
      isAsking: bucket === 'espera' && record.phase === 'pide',
      isSelf,
      ago: ago(Math.max(0, now - record.phaseAt)),
      summary: bucket === 'espera' ? (record.summary ?? null) : null,
    }
    view[bucket].push(row)
  }
  // A question waits on you more than a finished answer does: those come first, each kind newest first.
  view.espera.sort((a, b) => Number(b.isAsking) - Number(a.isAsking))

  return view
}

/** Rows that started waiting since the last view, the current session's left out: what is worth a toast. */
export const newlyWaiting = (before: View | null, after: View): Row[] => {
  if (before === null) return []
  const waited = new Set(before.espera.map(row => row.id))

  return after.espera.filter(row => !row.isSelf && !waited.has(row.id))
}

export const countRows = (view: View): number =>
  view.espera.length + view.trabajando.length + view.quieta.length

/** A restart cuts off the work in progress; a question or a result left behind still waits for you. */
export const phaseAfterRestart = (phase: Phase): Phase => (phase === 'trabajando' ? 'quieta' : phase)

/** Listed sessions the app's recent list left out: older ones, to look up one by one so none passes for archived. */
export const missingFromList = (
  records: readonly SessionRecord[],
  marks: Marks,
  knownIds: ReadonlySet<string>,
  selfId: string | null,
  now?: number,
): string[] =>
  records
    .filter(record => record.id !== selfId && isListed(record, marks, now) && !knownIds.has(record.id))
    .map(record => record.id)

export type EntrySuffix = 'json' | 'removed' | 'seen'

/** The files a session writes in the shared folder; anything else there (a log) is no entry. */
export const entryOf = (name: string): { id: string; suffix: EntrySuffix } | null => {
  const match = /^(.+)\.(json|removed|seen)$/.exec(name)

  return match === null ? null : { id: match[1] ?? '', suffix: match[2] as EntrySuffix }
}

export const openCommand = (isWindows: boolean, link: string): string[] =>
  isWindows ? ['rundll32.exe', 'url.dll,FileProtocolHandler', link] : ['open', link]

export type RowSet = { group: string | null; rows: Row[] }

/** A block's rows gathered by group, each group where its newest row stood; sessions with no group gather too. */
export const groupRows = (rows: readonly Row[]): RowSet[] => {
  const sets = new Map<string | null, Row[]>()
  for (const row of rows) sets.set(row.group, [...(sets.get(row.group) ?? []), row])

  return [...sets].map(([group, members]) => ({ group, rows: members }))
}

/** The name and group the app shows now win over the ones a record saved: sessions get renamed and regrouped. */
export const withAppInfo = (record: SessionRecord, info: SessionInfo | undefined): SessionRecord =>
  info === undefined ? record : { ...record, title: info.title ?? record.title, group: info.group?.name ?? null }

/** A session's own record as it starts: who it is from the app, where it stood from what it saved. */
export const recordFromApp = (info: SessionInfo, before: SessionRecord | null, cwd: string, now: number): SessionRecord => ({
  id: info.sessionId,
  title: info.title ?? null,
  group: info.group?.name ?? null,
  link: info.link ?? null,
  cwd,
  phase: before === null ? 'quieta' : phaseAfterRestart(before.phase),
  phaseAt: before?.phaseAt ?? now,
  activatedAt: before?.activatedAt ?? null,
  summary: before?.summary ?? null,
})

const SUMMARY_ROOM = 90

/** An answer in one line: the question it ends on, else its opening sentence, with the markdown left out. */
export const summaryOf = (text: string): string | null => {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-+]|\d+\.)\s+/gm, '')
    .replace(/[*_~>#|]/g, '')
  const sentences = plain
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0)
  const chosen = [...sentences].reverse().find(sentence => sentence.endsWith('?')) ?? sentences[0]
  if (chosen === undefined) return null

  return chosen.length > SUMMARY_ROOM ? `${chosen.slice(0, SUMMARY_ROOM - 1)}…` : chosen
}

/** What a session asking for something asks: its question, a plan to approve, or a tool's permission. */
export const askingSummary = (tool: string, input: unknown): string => {
  if (tool === 'AskUserQuestion') {
    const question = (input as { questions?: Array<{ question?: string }> }).questions?.[0]?.question
    return question ?? 'Te hace una pregunta'
  }
  if (tool === 'ExitPlanMode') return 'Tiene un plan listo para que lo apruebes'

  return `Pide permiso para usar ${tool}`
}

// Cells a row spends besides its name: the card's edges and padding (4), the dot and its gap (2), the gap before the
// time (1), the remove mark and its gap (2).
const ROW_FIXED = 9
const ROW_ROOM_MIN = 8
const ROW_ROOM_MAX = 40
const ROW_ROOM_UNKNOWN = 34

/** What a pane button does, found by its key: on the desktop the first click only focuses it, so its focus acts. */
export const actionForElement = (element: string, view: View): ((act: Actions) => unknown) | null => {
  if (element === 'limpiar-quieta') return act => act.clear(view.quieta)
  if (element === 'volver-canal') return act => act.volverCanal()
  if (element === 'limpiar-canal') return act => act.limpiarCanal()
  const pair = /^pareja-(.+)$/.exec(element)
  if (pair !== null) return act => act.abrirPareja(pair[1] ?? '')
  const match = /^(ir|quitar)-(.+)$/.exec(element)
  const rows = [...view.espera, ...view.trabajando, ...view.quieta]
  const row = match === null ? undefined : rows.find(one => one.id === match[2])
  if (match === null || row === undefined) return null

  return match[1] === 'ir' ? act => act.jump(row) : act => act.remove(row)
}

const REPEAT_MS = 1_500

/** Lets one action through, then skips any other for a moment: the focus of a click already acted, and a second
 *  click (habit, or one landing on a row the list just moved there) must not act again. */
export const actionGate = (windowMs: number = REPEAT_MS, clock: () => number = Date.now): (() => boolean) => {
  let last = Number.NEGATIVE_INFINITY

  return () => {
    const now = clock()
    if (now - last < windowMs) return false
    last = now
    return true
  }
}

// A light hairline: the theme's own border color drew too dark around every card.
export const CARD_EDGE = '#E3E1D9'

/** A text cut to `room` characters, its last one an ellipsis. */
export const short = (title: string, room: number): string => (title.length > room ? `${title.slice(0, room - 1)}…` : title)

// The terminal squares every edge, so a pill's round edge is the desktop's. Neither surface takes a smaller
// type size in this build (Text size is refused), so secondary text is set apart by dimming alone.
export type Look = { edgeOf: (pill: string) => { borderStyle?: string; borderColor?: string } }

export const lookFor = (surface: string): Look =>
  surface === 'desktop' ? { edgeOf: pill => ({ borderStyle: 'round', borderColor: pill }) } : { edgeOf: () => ({}) }

/** How many characters of a name fit in a row of a column this wide, so the time and the remove mark stay inside. */
export const titleRoom = (bodyColumns: number | undefined, timeLabel: string): number =>
  bodyColumns === undefined
    ? ROW_ROOM_UNKNOWN
    : Math.max(ROW_ROOM_MIN, Math.min(ROW_ROOM_MAX, bodyColumns - ROW_FIXED - timeLabel.length))
