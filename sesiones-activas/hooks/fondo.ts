import type { SessionRecord, Tareas } from '../types'

// Background work keeps a session working this long at most after its turn ended. Past it, the app most likely closed
// over the work (its tasks die with it) and the session counts as finished.
export const FONDO_MAX_MS = 3 * 3_600_000

const NAME_ROOM = 90

/** What `classic.Stop` says of the background work a turn leaves running: how many, and the one's name when it is one. */
export const tareasDe = (tasks: ReadonlyArray<{ description?: string }> | undefined): Tareas | null => {
  if (tasks === undefined || tasks.length === 0) return null
  const name = tasks.length === 1 ? (tasks[0]?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_ROOM) : ''

  return { cuantas: tasks.length, nombre: name.length > 0 ? name : null }
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
