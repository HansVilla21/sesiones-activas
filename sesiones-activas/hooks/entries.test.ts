import { expect, test } from 'claude-code/testing'

import type { SessionRecord } from '../types'
import { CANAL_LIMPIADO } from './config'
import type { Cache, Entry, ReadPort, WritePort } from './entries'
import { appendLog, entryPath, leaveMarks, leaveStamp, readCached, readEntries, readJson, readRecord, saveRecord } from './entries'

const DIR = 'C:/Users/prueba/.claude/sesiones-activas'

type Files = Record<string, { text: string; mtimeMs?: number; kind?: string }>

const world = (files: Files) => {
  const reads: string[] = []
  const port: ReadPort = {
    listar: async folder => {
      const prefix = `${folder}/`
      return Object.entries(files)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, file]): Entry => ({ name: path.slice(prefix.length), kind: file.kind ?? 'file', mtimeMs: file.mtimeMs }))
    },
    leer: async path => {
      reads.push(path)
      return files[path]?.text ?? null
    },
  }

  return { files, reads, port }
}

const record = (id: string) => JSON.stringify({ id, phase: 'quieta' })

test('records and marks are read from the shared folder, anything else there is left alone', async () => {
  const { port } = world({
    [`${DIR}/a.json`]: { text: record('a'), mtimeMs: 1 },
    [`${DIR}/a.removed`]: { text: '{"at": 7}', mtimeMs: 1 },
    [`${DIR}/b.seen`]: { text: '{"at": 9}', mtimeMs: 1 },
    [`${DIR}/_errores.log`]: { text: 'x', mtimeMs: 1 },
    [`${DIR}/carpeta.json`]: { text: record('c'), mtimeMs: 1, kind: 'dir' },
    [`${DIR}/roto.json`]: { text: '{"id"', mtimeMs: 1 },
  })

  const { records, marks } = await readEntries(port, DIR, new Map())
  expect(records.map(one => one.id)).toEqual(['a'])
  expect(marks).toEqual({ removed: { a: 7 }, seen: { b: 9 } })
})

test('a folder the port cannot list, or no folder yet, is an empty answer', async () => {
  const roto: ReadPort = { listar: () => Promise.reject(new Error('EPERM')), leer: async () => null }
  expect(await readEntries(roto, DIR, new Map())).toEqual({ records: [], marks: { removed: {}, seen: {} } })
  expect(await readEntries(world({}).port, null, new Map())).toEqual({ records: [], marks: { removed: {}, seen: {} } })
})

test('a file whose mtimeMs did not change is not read again, one that changed is', async () => {
  const { files, reads, port } = world({ [`${DIR}/a.json`]: { text: record('a'), mtimeMs: 10 } })
  const cache: Cache = new Map()

  await readEntries(port, DIR, cache)
  await readEntries(port, DIR, cache)
  expect(reads).toHaveLength(1)

  files[`${DIR}/a.json`] = { text: record('a2'), mtimeMs: 11 }
  expect((await readEntries(port, DIR, cache)).records.map(one => one.id)).toEqual(['a2'])
  expect(reads).toHaveLength(2)
})

test('the 2.1.280 engine lists files with no mtimeMs: the read goes on and nothing is cached', async () => {
  const { files, reads, port } = world({ [`${DIR}/a.json`]: { text: record('a') } })
  const cache: Cache = new Map()

  // Before: `hit?.mtimeMs === entry.mtimeMs` was true for two undefined and `hit.data` threw a TypeError.
  expect((await readEntries(port, DIR, cache)).records.map(one => one.id)).toEqual(['a'])
  files[`${DIR}/a.json`] = { text: record('a2') }
  expect((await readEntries(port, DIR, cache)).records.map(one => one.id)).toEqual(['a2'])
  expect(reads).toHaveLength(2)
  expect(cache.size).toBe(0)
})

test('an mtimeMs that is not a finite number counts as no mtimeMs', async () => {
  for (const mtimeMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const { reads, port } = world({ [`${DIR}/a.json`]: { text: record('a'), mtimeMs } })
    const cache: Cache = new Map()

    await readEntries(port, DIR, cache)
    await readEntries(port, DIR, cache)
    expect(reads).toHaveLength(2)
    expect(cache.size).toBe(0)
  }
})

test('readCached asks the cache only when it has a time to compare, and keeps what it read', async () => {
  const { files, reads, port } = world({ [`${DIR}/x.json`]: { text: '{"n": 1}' } })
  const cache: Cache = new Map()

  expect(await readCached(port, cache, `${DIR}/x.json`, 5)).toEqual({ n: 1 })
  files[`${DIR}/x.json`] = { text: '{"n": 2}' }
  expect(await readCached(port, cache, `${DIR}/x.json`, 5)).toEqual({ n: 1 })
  expect(await readCached(port, cache, `${DIR}/x.json`, undefined)).toEqual({ n: 2 })
  expect(reads).toHaveLength(2)
  expect(cache.get(`${DIR}/x.json`)).toEqual({ mtimeMs: 5, data: { n: 1 } })
})

test('readJson gives null for a file that is missing, unreadable or not JSON', async () => {
  const { port } = world({ [`${DIR}/a.json`]: { text: '{"a": 1}' }, [`${DIR}/b.json`]: { text: 'no es json' } })
  expect(await readJson(port, `${DIR}/a.json`)).toEqual({ a: 1 })
  expect(await readJson(port, `${DIR}/b.json`)).toBeNull()
  expect(await readJson(port, `${DIR}/c.json`)).toBeNull()
  expect(await readJson({ listar: async () => [], leer: () => Promise.reject(new Error('EBUSY')) }, `${DIR}/a.json`)).toBeNull()
})

const writer = () => {
  const writes: Array<[string, string]> = []
  const port: WritePort & ReadPort = {
    escribir: async (path, text) => void writes.push([path, text]),
    listar: async () => [],
    leer: async path => (path === `${DIR}/a.json` ? record('a') : null),
  }

  return { writes, port }
}

const session = (id: string): SessionRecord => ({ id, title: null, group: null, link: null, cwd: 'D:/x', phase: 'quieta', phaseAt: 1, activatedAt: null })

test('the error log keeps the last lines and the new one, and is never written with no folder', async () => {
  const written: Array<[string, string]> = []
  const log = (text: string | null): WritePort & ReadPort => ({
    escribir: async (path, content) => void written.push([path, content]),
    listar: async () => [],
    leer: async () => text,
  })

  await appendLog(log('uno\ndos\n\ntres\n'), DIR, 'cuatro', 3)
  await appendLog(log(null), DIR, 'primero', 3)
  await appendLog(log('uno\n'), null, 'nada', 3)
  expect(written).toEqual([
    [`${DIR}/_errores.log`, 'dos\ntres\ncuatro\n'],
    [`${DIR}/_errores.log`, 'primero\n'],
  ])
})

test('a path in the shared folder is never built before the folder is known: no "null/…"', () => {
  expect(entryPath(null, 'a', 'json')).toBeNull()
  expect(entryPath(DIR, 'a', 'json')).toBe(`${DIR}/a.json`)
  expect(entryPath(DIR, 'local a/b:c', 'seen')).toBe(`${DIR}/local_a_b_c.seen`)
})

test('with no folder, saving a record or leaving a mark writes nothing, whoever asks', async () => {
  const { writes, port } = writer()

  await saveRecord(port, null, session('a'))
  await leaveMarks(port, null, ['a', 'b'], 'removed', 5)
  expect(writes).toEqual([])
  expect(await readRecord(port, null, 'a')).toBeNull()
})

test('with the folder, a record goes to its own file and a mark is left for each id', async () => {
  const { writes, port } = writer()

  await saveRecord(port, DIR, session('a'))
  await leaveMarks(port, DIR, ['a', 'b'], 'seen', 5)
  expect(writes).toEqual([
    [`${DIR}/a.json`, JSON.stringify(session('a'))],
    [`${DIR}/a.seen`, '{"at":5}'],
    [`${DIR}/b.seen`, '{"at":5}'],
  ])
  expect((await readRecord(port, DIR, 'a'))?.phase).toBe('quieta')
  expect(await readRecord(port, DIR, 'z')).toBeNull()
})

test('the mark of the canal Limpiar button is one file of the shared folder holding { at }, never written with no folder', async () => {
  const { writes, port } = writer()

  await leaveStamp(port, null, CANAL_LIMPIADO, 7)
  expect(writes).toEqual([])
  await leaveStamp(port, DIR, CANAL_LIMPIADO, 7)
  expect(writes).toEqual([[`${DIR}/canal.limpiado`, '{"at":7}']])
})
