// The "Entre proyectos" block: reads what canal-interno keeps in ~/.claude/canal-interno and shapes it for the column.
// Pure logic, no `$`: register.tsx hands over a minimal port built from closures over `$`.
// Every "today" is the local calendar day (`new Date(ms)`), not UTC: Hans is in Costa Rica.

import type { CanalVista, ConsultaLeida, ParejaVista } from '../types'
import { ANSWER_ROOM, CANAL_LIMPIADO, CONSULTA_EXPIRA_MS, TOPE_DIARIO_USD } from './config'
import type { Cache, ReadPort } from './entries'
import { listSafe, readCached, readJson } from './entries'
import { ago, errorText, short } from './model'

export type { CanalVista, ConsultaLeida, ParejaVista } from '../types'

const dos = (n: number): string => String(n).padStart(2, '0')

const dayOf = (ms: number): string => {
  const date = new Date(ms)

  return `${date.getFullYear()}-${dos(date.getMonth() + 1)}-${dos(date.getDate())}`
}

const previousDay = (ms: number): string => {
  const date = new Date(ms)

  return dayOf(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime())
}

const isToday = (ms: number, ahora: number): boolean => dayOf(ms) === dayOf(ahora)

/** A consulta left running past the limit is lost (the app closed on it): it reads as failed, not as running. */
const asOf = (consulta: ConsultaLeida, ahora: number): ConsultaLeida =>
  consulta.estado === 'corriendo' && ahora - consulta.iniciada > CONSULTA_EXPIRA_MS ? { ...consulta, estado: 'fallo' } : consulta

const LAST_ROOM = 140

const oneLine = (text: string): string => {
  const plain = text.replace(/\s+/g, ' ').trim()

  return plain.length > LAST_ROOM ? `${plain.slice(0, LAST_ROOM - 1)}…` : plain
}

// Hans decides in the rating (`decisionesDeHans`): from then on the decisions of that consulta no longer wait for him.
const waiting = (consulta: ConsultaLeida): number =>
  (consulta.decisionesDeHans ?? '').trim() === '' && Number.isFinite(consulta.decisionesPendientes) ? Math.max(0, consulta.decisionesPendientes) : 0

const pairOf = (clave: string, consultas: ConsultaLeida[], ahora: number): ParejaVista | null => {
  const last = consultas.at(-1)
  if (last === undefined) return null

  return {
    clave,
    titulo: `${last.de.nombre} → ${last.a.nombre}`,
    ultima: oneLine(last.pregunta ?? ''),
    estado: last.estado === 'respondio' && last.sirvio === false ? 'no-sirvio' : last.estado,
    hace: ago(Math.max(0, ahora - (last.terminada ?? last.iniciada))),
    decisiones: consultas.reduce((sum, consulta) => sum + waiting(consulta), 0),
    consultas,
  }
}

/**
 * The block: one card per pair (thread), the most recent first, with the state of its last consulta.
 * It keeps the consultas of today and the ones still running (one that began at 23:55 runs at 00:03), and hides
 * a pair whose last consulta began before `limpiado` unless it is running.
 */
export const vistaCanal = (
  consultas: ConsultaLeida[],
  limpiado: number,
  abierta: string | null,
  tope: boolean,
  ahora: number,
): CanalVista => {
  const byThread = new Map<string, ConsultaLeida[]>()
  const kept = consultas
    .map(consulta => asOf(consulta, ahora))
    .filter(consulta => consulta.estado === 'corriendo' || isToday(consulta.iniciada, ahora))
    .sort((a, b) => a.iniciada - b.iniciada)
  for (const consulta of kept) byThread.set(consulta.hilo, [...(byThread.get(consulta.hilo) ?? []), consulta])

  const parejas = [...byThread]
    .filter(([, list]) => {
      const last = list.at(-1)

      return last !== undefined && (last.estado === 'corriendo' || last.iniciada >= limpiado)
    })
    .sort(([, a], [, b]) => (b.at(-1)?.iniciada ?? 0) - (a.at(-1)?.iniciada ?? 0))
    .flatMap(([clave, list]) => pairOf(clave, list, ahora) ?? [])

  return { parejas, abierta: parejas.some(pareja => pareja.clave === abierta) ? abierta : null, topeAlcanzado: tope }
}

/** What today cost reached the daily limit. Counted over every consulta that began today, cleared ones included. */
export const topeAlcanzado = (consultas: ConsultaLeida[], topeDiarioUsd: number, ahora: number): boolean =>
  consultas.reduce((sum, consulta) => (isToday(consulta.iniciada, ahora) ? sum + (consulta.costoUsd ?? 0) : sum), 0) >= topeDiarioUsd

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** When the Limpiar button was pressed, from the mark file's JSON (`{ at }`): 0 when there is no valid mark. */
export const limpiadoEn = (mark: unknown): number => {
  const at = isObject(mark) ? numberOrNull(mark['at']) : null

  return at !== null && at > 0 ? at : 0
}

const STATES: ReadonlySet<unknown> = new Set<ConsultaLeida['estado']>(['corriendo', 'respondio', 'fallo'])

const nameOf = (side: unknown): string | null => (isObject(side) ? textOrNull(side['nombre']) : null)

/** The answer as far as the column shows it: a whole answer would ride in `$.state` on every redraw. */
const answerOf = (value: unknown): string | null => (typeof value === 'string' ? short(value.trim(), ANSWER_ROOM) : null)

/** The part of a consulta file the block reads, or null when the file is not a consulta. */
const comoConsulta = (data: unknown): ConsultaLeida | null => {
  if (!isObject(data)) return null

  const id = textOrNull(data['id'])
  const hilo = textOrNull(data['hilo'])
  const de = nameOf(data['de'])
  const a = nameOf(data['a'])
  const iniciada = numberOrNull(data['iniciada'])
  const estado = data['estado']
  if (id === null || hilo === null || de === null || a === null || iniciada === null || !STATES.has(estado)) return null

  const pendientes = numberOrNull(data['decisionesPendientes'])

  return {
    id,
    hilo,
    de: { nombre: de },
    a: { nombre: a },
    pregunta: textOrNull(data['pregunta']) ?? '',
    estado: estado as ConsultaLeida['estado'],
    iniciada,
    terminada: numberOrNull(data['terminada']),
    respuesta: answerOf(data['respuesta']),
    costoUsd: numberOrNull(data['costoUsd']),
    sirvio: typeof data['sirvio'] === 'boolean' ? data['sirvio'] : null,
    decisionesPendientes: pendientes === null ? 0 : Math.max(0, Math.floor(pendientes)),
    decisionesDeHans: textOrNull(data['decisionesDeHans']),
  }
}

// Notepad and PowerShell begin a file with a BOM, which JSON.parse refuses. Written with its code, not as a raw character.
const BOM = String.fromCharCode(0xfeff)
const withoutBom = (text: string): string => (text.startsWith(BOM) ? text.slice(1) : text)

/** The daily limit from proyectos.json's text. */
const topeDe = (text: string | null): number => {
  try {
    const config: unknown = JSON.parse(withoutBom(text ?? ''))
    const tope = isObject(config) ? numberOrNull(config['topeDiarioUsd']) : null

    return tope !== null && tope >= 0 ? tope : TOPE_DIARIO_USD
  } catch {
    return TOPE_DIARIO_USD
  }
}

export type CanalPort = ReadPort & { ahora: () => Promise<number> }

const CONSULTA_FILE = /^(\d{4}-\d{2}-\d{2})-.+\.json$/

// The reads are cached by mtimeMs, like readEntries; what leaves the window of two days is forgotten.
const cache: Cache = new Map()

const nowOf = async (port: CanalPort): Promise<number> => {
  try {
    return await port.ahora()
  } catch {
    return Date.now()
  }
}

const textOf = async (port: CanalPort, path: string): Promise<string | null> => {
  try {
    return await port.leer(path)
  } catch {
    return null
  }
}

/**
 * Everything the block needs from canal-interno's registry: the consultas of today and of yesterday (one that began
 * before midnight may still run) and the daily limit. It never throws: what cannot be read is left out.
 */
export const leerCanal = async (port: CanalPort, home: string): Promise<{ consultas: ConsultaLeida[]; topeDiarioUsd: number }> => {
  const base = `${home.replace(/\\/g, '/').replace(/\/+$/, '')}/.claude/canal-interno`
  const ahora = await nowOf(port)
  const days = new Set([dayOf(ahora), previousDay(ahora)])
  const folder = `${base}/consultas`
  const consultas: ConsultaLeida[] = []
  const seen = new Set<string>()

  for (const entry of await listSafe(port, folder)) {
    const day = CONSULTA_FILE.exec(entry.name)?.[1]
    if (entry.kind !== 'file' || day === undefined || !days.has(day)) continue

    const path = `${folder}/${entry.name}`
    seen.add(path)
    const consulta = comoConsulta(await readCached(port, cache, path, entry.mtimeMs))
    if (consulta !== null) consultas.push(asOf(consulta, ahora))
  }
  for (const path of [...cache.keys()]) if (path.startsWith(`${folder}/`) && !seen.has(path)) cache.delete(path)

  return {
    consultas: consultas.sort((a, b) => a.iniciada - b.iniciada),
    topeDiarioUsd: topeDe(await textOf(port, `${base}/proyectos.json`)),
  }
}

export type RefrescoPort = CanalPort & {
  /** What `$.state` holds of the block now. Throws a TypeError when the engine has no `$.state` (a `claude -p`). */
  estado: () => Promise<CanalVista | undefined>
  guardar: (vista: CanalVista) => Promise<unknown>
  /** Writes a failure in the mod's log. */
  fallo: (error: unknown) => Promise<unknown>
}

/** What the next cycle compares with: the view last written and the last failure logged. */
export type CanalMemo = { texto: string; error: string }

// With no `$.state` there is nowhere to keep the view and asking for it throws a TypeError: the canal waits there.
const hayEstado = async (port: RefrescoPort): Promise<boolean> => {
  try {
    await port.estado()
    return true
  } catch (error) {
    return !(error instanceof TypeError)
  }
}

/**
 * One cycle of the block: reads the registry, builds the view and writes it to the state only if it changed.
 * It never throws. A failure goes to the log once while its message repeats (a cycle runs every 3 s); with no
 * `$.state` or no folder yet it waits without a word. The open pair is read last, so a click on a card between the
 * disk reads and the write is not overwritten.
 */
export const refrescarCanal = async (
  port: RefrescoPort,
  lugar: { home: string; dir: string | null },
  memo: CanalMemo,
  ahora: number,
): Promise<void> => {
  try {
    if (lugar.dir === null || !(await hayEstado(port))) return

    const { consultas, topeDiarioUsd } = await leerCanal(port, lugar.home)
    const limpiado = limpiadoEn(await readJson(port, `${lugar.dir}/${CANAL_LIMPIADO}`))
    const vista = vistaCanal(consultas, limpiado, (await port.estado())?.abierta ?? null, topeAlcanzado(consultas, topeDiarioUsd, ahora), ahora)
    const texto = JSON.stringify(vista)
    if (texto !== memo.texto) {
      await port.guardar(vista)
      memo.texto = texto
    }
    memo.error = ''
  } catch (error) {
    const mensaje = errorText(error)
    if (mensaje === memo.error) return
    memo.error = mensaje
    try {
      await port.fallo(error)
    } catch {
      // The log is best effort: a failure to write it must not stop the mod.
    }
  }
}

/**
 * A click on a card (or on Volver, with `null`): the pair open in the column goes to the state and the next cycle
 * respects it. A pair that is not in the block cannot be opened. The memo is cleared so that cycle writes the view
 * again, which mends one a refresh wrote between the read and the write here.
 */
export const fijarAbierta = async (port: Pick<RefrescoPort, 'estado' | 'guardar'>, memo: CanalMemo, abierta: string | null): Promise<void> => {
  const vista = await port.estado()
  if (vista === undefined || (abierta !== null && !vista.parejas.some(pareja => pareja.clave === abierta))) return

  await port.guardar({ ...vista, abierta })
  memo.texto = ''
}
