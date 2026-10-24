import type { SessionRecord, Tareas } from '../types'

// Background work keeps a session working this long at most after its turn ended. Past it, the app most likely closed
// over the work (its tasks die with it) and the session counts as finished.
export const FONDO_MAX_MS = 3 * 3_600_000

const NAME_ROOM = 90

type BackgroundTask = { type?: string; description?: string }

// A session that published a page keeps watching it for comments and new versions, for days, re-armed at every start.
// The app lists that watch with the background tasks, but it is no work. Seen in a real transcript as type
// `artifact-auto-react`, described "live updates for artifact <url> (re-armed on session start)".
const isPageWatch = (task: BackgroundTask): boolean =>
  /artifact/i.test(task.type ?? '') || /^live updates for artifact\b/i.test((task.description ?? '').trim())

/** What `classic.Stop` says of the background work a turn leaves running: how many, and the one's name when it is one. */
export const tareasDe = (tasks: readonly BackgroundTask[] | undefined): Tareas | null => {
  const work = (tasks ?? []).filter(task => !isPageWatch(task))
  if (work.length === 0) return null
  const name = work.length === 1 ? (work[0]?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_ROOM) : ''

  return { cuantas: work.length, nombre: name.length > 0 ? name : null }
}

/** It answered you, or got an answer to its question, and still runs background work: it is working, not waiting. */
export const enFondo = (record: SessionRecord, now: number): boolean =>
  (record.tareas?.cuantas ?? 0) > 0 &&
  (record.phase === 'termino' || record.phase === 'trabajando') &&
  now - record.phaseAt <= FONDO_MAX_MS

/** The line under its name: that it answered, and what it still runs. */
export const lineaDeFondo = ({ cuantas, nombre }: Tareas): string => {
  if (cuantas > 1) return `Te respondió · sigue con ${cuantas} tareas en segundo plano`

  return `Te respondió · sigue con 1 tarea${nombre === null ? ' en segundo plano' : `: ${nombre}`}`
}
