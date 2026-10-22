import { expect, test } from 'claude-code/testing'

import type { CanalVista, ParejaVista } from '../types'
import type { CanalMemo, RefrescoPort } from './canal'
import { fijarAbierta, refrescarCanal } from './canal'

const NOW = new Date(2026, 9, 17, 14, 0, 0).getTime()
const DIR = 'C:/Users/prueba/.claude/sesiones-activas'
const LUGAR = { home: 'C:/Users/prueba', dir: DIR }
const BASE = `${LUGAR.home}/.claude/canal-interno`

const dos = (n: number): string => String(n).padStart(2, '0')
const idDe = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}-ab12`
}
const consulta = (hilo: string, iniciada: number, patch: Record<string, unknown> = {}) => ({
  id: idDe(iniciada) + hilo.length,
  hilo,
  de: { nombre: 'Tienda' },
  a: { nombre: 'Mentor' },
  pregunta: '¿Cómo valido la firma?',
  estado: 'respondio',
  iniciada,
  terminada: iniciada + 30_000,
  respuesta: 'Con la llave pública.',
  costoUsd: 1,
  sirvio: null,
  decisionesPendientes: 0,
  decisionesDeHans: null,
  ...patch,
})
const nombreDe = (c: { id: string }): string => `${c.id.slice(0, 4)}-${c.id.slice(4, 6)}-${c.id.slice(6, 8)}-${c.id}.json`

type Opciones = { abierta?: string | null; hayEstado?: boolean; guardaFalla?: () => Error | null }

// El mtimeMs sube con cada archivo puesto, en todas las pruebas: `leerCanal` guarda por ruta y mtimeMs.
let reloj = 1

// Un puerto que no hace nada, para las pruebas que solo miran un hueco.
const mudo = (patch: Partial<RefrescoPort> = {}): RefrescoPort => ({
  ahora: async () => NOW,
  listar: async () => [],
  leer: async () => null,
  estado: async () => undefined,
  guardar: async () => undefined,
  fallo: async () => undefined,
  ...patch,
})

// El mundo de abajo: archivos en memoria y un registro de lo que el puerto vio, en orden.
const armar = (opciones: Opciones = {}) => {
  const archivos = new Map<string, { texto: string; mtimeMs: number }>()
  const llamadas: string[] = []
  const guardadas: CanalVista[] = []
  const fallos: unknown[] = []
  const poner = (ruta: string, objeto: unknown) => archivos.set(ruta, { texto: typeof objeto === 'string' ? objeto : JSON.stringify(objeto), mtimeMs: (reloj += 1) })
  const puerto: RefrescoPort = {
    ahora: async () => NOW,
    listar: async carpeta => {
      llamadas.push('listar')
      return [...archivos].filter(([ruta]) => ruta.startsWith(`${carpeta}/`)).map(([ruta, a]) => ({ name: ruta.slice(carpeta.length + 1), kind: 'file', mtimeMs: a.mtimeMs }))
    },
    leer: async ruta => archivos.get(ruta)?.texto ?? null,
    estado: async () => {
      llamadas.push('estado')
      // Sin `$.state` (un claude -p) pedirlo lanza un TypeError.
      if (opciones.hayEstado === false) throw new TypeError("undefined is not an object (evaluating '$.state.get')")
      return { parejas: [], abierta: opciones.abierta ?? null, topeAlcanzado: false }
    },
    guardar: async vista => {
      llamadas.push('guardar')
      const falla = opciones.guardaFalla?.() ?? null
      if (falla !== null) throw falla
      guardadas.push(vista)
    },
    fallo: async error => {
      fallos.push(error)
    },
  }
  const memo: CanalMemo = { texto: '', error: '' }
  const ciclo = () => refrescarCanal(puerto, LUGAR, memo, NOW)
  const agregar = (c: ReturnType<typeof consulta>) => poner(`${BASE}/consultas/${nombreDe(c)}`, c)

  return { archivos, llamadas, guardadas, fallos, memo, ciclo, agregar, poner }
}

test('the view is written to the state only when it changed', async () => {
  const mundo = armar()
  mundo.agregar(consulta('tienda__mentor', NOW - 60_000))

  await mundo.ciclo()
  await mundo.ciclo()
  expect(mundo.guardadas).toHaveLength(1)
  expect(mundo.guardadas[0]?.parejas.map(p => p.clave)).toEqual(['tienda__mentor'])

  mundo.agregar(consulta('cont__intel', NOW - 30_000))
  await mundo.ciclo()
  expect(mundo.guardadas).toHaveLength(2)
  expect(mundo.guardadas[1]?.parejas.map(p => p.clave)).toEqual(['cont__intel', 'tienda__mentor'])
})

test('the open pair goes through as the pane left it, and resets to null when its pair left the block', async () => {
  const abierta = armar({ abierta: 'tienda__mentor' })
  abierta.agregar(consulta('tienda__mentor', NOW - 60_000))
  await abierta.ciclo()
  expect(abierta.guardadas[0]?.abierta).toBe('tienda__mentor')

  const ausente = armar({ abierta: 'otra__pareja' })
  ausente.agregar(consulta('tienda__mentor', NOW - 60_000))
  await ausente.ciclo()
  expect(ausente.guardadas[0]?.abierta).toBeNull()
})

test('the open pair is read after the disk and just before the write, so a click in between is not overwritten', async () => {
  const mundo = armar()
  mundo.agregar(consulta('tienda__mentor', NOW - 60_000))

  await mundo.ciclo()
  expect(mundo.llamadas).toEqual(['estado', 'listar', 'estado', 'guardar'])
})

test('what was cleared leaves the block, and the tope of proyectos.json is passed on', async () => {
  const mundo = armar()
  mundo.agregar(consulta('tienda__mentor', NOW - 60_000, { costoUsd: 3 }))
  mundo.poner(`${LUGAR.dir}/canal.limpiado`, { at: NOW - 30_000 })
  mundo.poner(`${BASE}/proyectos.json`, '\uFEFF{"topeDiarioUsd": 3}')

  await mundo.ciclo()
  expect(mundo.guardadas[0]).toEqual({ parejas: [], abierta: null, topeAlcanzado: true })
})

test('an error in the canal part never reaches the caller, and the same message is logged once while it repeats', async () => {
  let error: Error | null = new Error('EBUSY: state')
  const mundo = armar({ guardaFalla: () => error })
  mundo.agregar(consulta('tienda__mentor', NOW - 60_000))

  await mundo.ciclo()
  await mundo.ciclo()
  await mundo.ciclo()
  expect(mundo.fallos).toHaveLength(1)

  error = new Error('EPERM: otra cosa')
  await mundo.ciclo()
  expect(mundo.fallos).toHaveLength(2)

  error = null
  await mundo.ciclo()
  expect(mundo.guardadas).toHaveLength(1)

  error = new Error('EPERM: otra cosa')
  mundo.agregar(consulta('cont__intel', NOW - 10_000))
  await mundo.ciclo()
  expect(mundo.fallos).toHaveLength(3)
})

test('a failed write is tried again on the next cycle', async () => {
  let falla = true
  const mundo = armar({ guardaFalla: () => (falla ? new Error('EBUSY') : null) })
  mundo.agregar(consulta('tienda__mentor', NOW - 60_000))

  await mundo.ciclo()
  expect(mundo.guardadas).toHaveLength(0)
  falla = false
  await mundo.ciclo()
  expect(mundo.guardadas).toHaveLength(1)
})

test('a log that cannot be written does not break it either', async () => {
  const memo: CanalMemo = { texto: '', error: '' }
  const puerto = mudo({ guardar: () => Promise.reject(new Error('EBUSY')), fallo: () => Promise.reject(new Error('el registro tampoco')) })

  await refrescarCanal(puerto, LUGAR, memo, NOW)
  expect(memo.error).toContain('EBUSY')
})

test('with no $.state (a claude -p) nothing is read, saved or logged', async () => {
  const mundo = armar({ hayEstado: false })
  mundo.agregar(consulta('tienda__mentor', NOW - 60_000))

  await mundo.ciclo()
  await mundo.ciclo()
  expect(mundo.llamadas).toEqual(['estado', 'estado'])
  expect(mundo.fallos).toEqual([])
  expect(mundo.memo).toEqual({ texto: '', error: '' })
})

test('a state that fails in another way than being absent is one logged error, not one every cycle', async () => {
  const fallos: unknown[] = []
  const memo: CanalMemo = { texto: '', error: '' }
  const roto = mudo({
    estado: async () => {
      throw new Error('estado roto')
    },
    fallo: async error => void fallos.push(error),
  })

  await refrescarCanal(roto, LUGAR, memo, NOW)
  await refrescarCanal(roto, LUGAR, memo, NOW)
  expect(fallos).toHaveLength(1)
})

test('before the shared folder is known the canal part waits', async () => {
  const llamadas: string[] = []
  const memo: CanalMemo = { texto: '', error: '' }
  const puerto = mudo({
    listar: async () => {
      llamadas.push('listar')
      return []
    },
    guardar: async () => void llamadas.push('guardar'),
  })

  await refrescarCanal(puerto, { home: LUGAR.home, dir: null }, memo, NOW)
  expect(llamadas).toEqual([])
  expect(memo.texto).toBe('')
})

test('a click opens a pair keeping the rest of the view, and the next cycle writes the view again', async () => {
  const pareja: ParejaVista = { clave: 'tienda__mentor', titulo: 'Tienda → Mentor', ultima: '', estado: 'respondio', hace: 'ahora', decisiones: 0, consultas: [] }
  const vista: CanalVista = { parejas: [pareja], abierta: null, topeAlcanzado: true }
  const guardadas: CanalVista[] = []
  const puerto = mudo({ estado: async () => vista, guardar: async nueva => void guardadas.push(nueva) })
  const memo: CanalMemo = { texto: 'lo último escrito', error: '' }

  await fijarAbierta(puerto, memo, 'tienda__mentor')
  await fijarAbierta(puerto, memo, null)
  await fijarAbierta(puerto, memo, 'otra__pareja')
  expect(guardadas).toEqual([{ ...vista, abierta: 'tienda__mentor' }, { ...vista, abierta: null }])
  expect(memo.texto).toBe('')

  memo.texto = 'lo último escrito'
  await fijarAbierta(mudo({ guardar: async nueva => void guardadas.push(nueva) }), memo, 'tienda__mentor')
  expect(guardadas).toHaveLength(2)
  expect(memo.texto).toBe('lo último escrito')
})
