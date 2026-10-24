import type { Marks, SessionRecord } from '../types'
import { isStartupRace, LOG_LINES } from './config'
import type { EntrySuffix } from './model'
import { entryOf, errorText } from './model'

/** One line of a folder listing. The 2.1.280 engine leaves `mtimeMs` out. */
export type Entry = { name: string; kind: string; mtimeMs?: number }

/** The least the readers need from the engine: closures over `$` built in register.tsx, so no `$` comes in here. */
export type ReadPort = {
  listar: (folder: string) => Promise<Entry[]>
  /** The text of the file, or `null` when it is not there. */
  leer: (path: string) => Promise<string | null>
}

export type Cache = Map<string, { mtimeMs: number; data: unknown }>

/** The folder's entries, or none when it cannot be listed. */
export const listSafe = async (port: ReadPort, folder: string): Promise<Entry[]> => {
  try {
    return await port.listar(folder)
  } catch {
    return []
  }
}

/** The file as JSON, or `null` when it is missing, cannot be read or is not JSON. */
export const readJson = async (port: ReadPort, path: string): Promise<unknown> => {
  try {
    return JSON.parse((await port.leer(path)) ?? '')
  } catch {
    return null
  }
}

/**
 * A file's JSON, read again only when its `mtimeMs` changed. An `mtimeMs` that is no finite number (the 2.1.280 engine
 * leaves it out) is no time to compare: the file is read every time and nothing is kept for it.
 */
export const readCached = async (port: ReadPort, cache: Cache, path: string, mtimeMs: number | undefined): Promise<unknown> => {
  if (mtimeMs === undefined || !Number.isFinite(mtimeMs)) return readJson(port, path)

  const hit = cache.get(path)
  if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit.data

  const data = await readJson(port, path)
  cache.set(path, { mtimeMs, data })

  return data
}

/** What every session wrote in the shared folder: their records and the removed and seen marks. */
export const readEntries = async (port: ReadPort, dir: string | null, cache: Cache) => {
  const records: SessionRecord[] = []
  const marks: Marks = { removed: {}, seen: {} }
  const entries = dir === null ? [] : await listSafe(port, dir)

  for (const entry of entries) {
    const found = entryOf(entry.name)
    if (entry.kind !== 'file' || found === null) continue

    const data = await readCached(port, cache, `${dir}/${entry.name}`, entry.mtimeMs)
    if (data === null) continue

    const { id, suffix } = found
    if (suffix === 'json') records.push(data as SessionRecord)
    if (suffix === 'removed' || suffix === 'seen') marks[suffix][id] = (data as { at: number }).at
  }

  return { records, marks }
}

export type WritePort = { escribir: (path: string, text: string) => Promise<unknown> }

/** `<dir>/<id>.<suffix>`, or `null` while the folder is not known yet: nothing is ever built as "null/…". */
export const entryPath = (dir: string | null, id: string, suffix: EntrySuffix): string | null =>
  dir === null ? null : `${dir}/${id.replace(/[^\w-]/g, '_')}.${suffix}`

/** A session's record as it saved itself, or `null`. */
export const readRecord = async (port: ReadPort, dir: string | null, id: string): Promise<SessionRecord | null> => {
  const path = entryPath(dir, id, 'json')

  return path === null ? null : ((await readJson(port, path)) as SessionRecord | null)
}

/** Writes a session's record in its own file; nothing when the folder is not known. */
export const saveRecord = async (port: WritePort, dir: string | null, record: SessionRecord): Promise<void> => {
  const path = entryPath(dir, record.id, 'json')
  if (path !== null) await port.escribir(path, JSON.stringify(record))
}

/** Adds a line to `_errores.log`, keeping the last `keep` lines; nothing when the folder is not known. */
export const appendLog = async (port: ReadPort & WritePort, dir: string | null, line: string, keep: number): Promise<void> => {
  if (dir === null) return

  const path = `${dir}/_errores.log`
  const before = ((await port.leer(path)) ?? '').split('\n').filter(one => one.length > 0).slice(-(keep - 1))
  await port.escribir(path, `${[...before, line].join('\n')}\n`)
}

/** Adds what failed and where to the error log, with its time. A call made before the app's tools connect is retried,
 *  not an error; nothing when the folder is not known. Best effort: a failure to write the log never stops the mod. */
export const logFailure = async (
  port: ReadPort & WritePort & { ahora: () => Promise<number> },
  dir: string | null,
  where: string,
  error: unknown,
): Promise<void> => {
  if (dir === null || isStartupRace(errorText(error))) return
  try {
    await appendLog(port, dir, `${new Date(await port.ahora()).toISOString()} ${where}: ${errorText(error)}`, LOG_LINES)
  } catch {
    // The log is best effort: a failure to write it must not stop the mod.
  }
}

/** Leaves `{ at }` as the `suffix` mark of every id; nothing when the folder is not known. */
export const leaveMarks = async (port: WritePort, dir: string | null, ids: readonly string[], suffix: 'removed' | 'seen', at: number): Promise<void> => {
  for (const id of ids) {
    const path = entryPath(dir, id, suffix)
    if (path !== null) await port.escribir(path, JSON.stringify({ at }))
  }
}

/** Leaves `{ at }` in the file `name` of the shared folder, the canal's Limpiar mark; nothing when the folder is not known. */
export const leaveStamp = async (port: WritePort, dir: string | null, name: string, at: number): Promise<void> => {
  if (dir !== null) await port.escribir(`${dir}/${name}`, JSON.stringify({ at }))
}
