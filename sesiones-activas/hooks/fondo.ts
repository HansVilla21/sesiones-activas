import type { SessionRecord, TareaDeFondo } from '../types'

// How long a task counts as work from when a turn's end first listed it. An agent or a workflow ends by itself and
// may take an hour; past this the app most likely closed over it (its tasks die with it).
export const AGENTE_MAX_MS = 3 * 3_600_000
// A command or a monitor still running this long after the answer is most likely a server left on or a command stuck
// waiting: seen for real, a subagent's command hung on `cat` for hours after the subagent had finished.
export const COMANDO_MAX_MS = 15 * 60_000

const NAME_ROOM = 90

type BackgroundTask = { id?: string; type?: string; description?: string; command?: string }

// A session that published a page keeps watching it for comments and new versions, for days, re-armed at every start.
// The app lists that watch with the background tasks, but it is no work. Seen in a real transcript as type
// `artifact-auto-react`, described "live updates for artifact <url> (re-armed on session start)".
const isPageWatch = (task: BackgroundTask): boolean =>
  /artifact/i.test(task.type ?? '') || /^live updates for artifact\b/i.test((task.description ?? '').trim())

// A dev server never ends: it is left on, not worked on.
const SERVER = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)|(?:next|nuxt|astro|remix)\s+dev|vite|nodemon|uvicorn|http\.server|flask\s+run|tail\s+-f)\b/i

const isServer = (task: BackgroundTask): boolean => SERVER.test(`${task.command ?? ''} ${task.description ?? ''}`)

const isAgentWork = (tipo: string): boolean => /agent|workflow/i.test(tipo)

/**
 * What `classic.Stop` says of the background work a turn leaves running, page watches and servers left out: each task
 * with the time it was first seen, carried over from `vistas`, the first-seen times of the turn end before.
 */
export const fondoDe = (
  tasks: readonly BackgroundTask[] | undefined,
  vistas: Readonly<Record<string, number>>,
  now: number,
): { tareas: TareaDeFondo[] | null; vistas: Record<string, number> } => {
  const work = (tasks ?? []).filter(task => !isPageWatch(task) && !isServer(task))
  const tareas = work.map((task, index): TareaDeFondo => {
    const id = task.id ?? `sin-id-${index}`
    const nombre = (task.description ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_ROOM)

    return { id, tipo: task.type ?? '', nombre: nombre.length > 0 ? nombre : null, desde: vistas[id] ?? now }
  })

  return { tareas: tareas.length > 0 ? tareas : null, vistas: Object.fromEntries(tareas.map(one => [one.id, one.desde])) }
}

/** The tasks that still count as work now; a record in the shape of 0.6.0 and 0.6.1 has none. */
export const tareasVivas = (record: SessionRecord, now: number): TareaDeFondo[] =>
  Array.isArray(record.tareas)
    ? record.tareas.filter(one => now - one.desde <= (isAgentWork(one.tipo) ? AGENTE_MAX_MS : COMANDO_MAX_MS))
    : []

/** It answered you, or got an answer to its question, and still runs background work: it is working, not waiting. */
export const enFondo = (record: SessionRecord, now: number): boolean =>
  (record.phase === 'termino' || record.phase === 'trabajando') && tareasVivas(record, now).length > 0

/** The line under its name: that it answered, and what it still runs. */
export const lineaDeFondo = (tareas: readonly TareaDeFondo[]): string => {
  if (tareas.length > 1) return `Te respondió · sigue con ${tareas.length} tareas en segundo plano`
  const nombre = tareas[0]?.nombre ?? null

  return `Te respondió · sigue con 1 tarea${nombre === null ? ' en segundo plano' : `: ${nombre}`}`
}
