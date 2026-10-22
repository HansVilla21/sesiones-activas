import { expect, test } from 'claude-code/testing'

import type { ConsultaLeida } from '../types'
import { leerCanal } from './canal'

// Lo que `canal-interno` guarda de una consulta, más de lo que este mod lee (el contrato vive en esa carpeta).
type Consulta = Omit<ConsultaLeida, 'de' | 'a'> & {
  version: 1
  de: { nombre: string; carpeta: string; sesion: string | null }
  a: { nombre: string; carpeta: string; conConversacion: boolean }
  tipo: string
  error: string | null
  porQue: string | null
}

// Las fechas de los nombres de archivo son las locales de Hans: se arman con el constructor local, no con UTC.
const NOW = new Date(2026, 9, 17, 20, 0, 0).getTime()
const dos = (n: number): string => String(n).padStart(2, '0')
const idDe = (ms: number, hex: string): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}-${hex}`
}
const nombreDe = (id: string): string => `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}-${id}.json`

const consulta = (iniciada: number, hex: string, patch: Partial<Consulta> = {}): Consulta => ({
  version: 1,
  id: idDe(iniciada, hex),
  hilo: 'tienda__mentor',
  de: { nombre: 'Tienda', carpeta: 'D:\\Clientes\\Tienda', sesion: null },
  a: { nombre: 'Mentor', carpeta: 'D:\\Proyectos\\CRM', conConversacion: true },
  tipo: 'pregunta',
  pregunta: '¿Cómo valido la firma?',
  estado: 'respondio',
  iniciada,
  terminada: iniciada + 60_000,
  respuesta: 'Con la llave pública.',
  error: null,
  costoUsd: 1.5,
  decisionesPendientes: 0,
  sirvio: null,
  porQue: null,
  decisionesDeHans: null,
  ...patch,
})

// Cada prueba tiene su propia carpeta de inicio: la caché de `leerCanal` guarda por ruta.
let pruebas = 0
type Archivos = Record<string, { texto: string; mtimeMs?: number }>

const armar = (relativos: (home: string) => Archivos, opciones: { ahora?: number; home?: string } = {}) => {
  pruebas += 1
  const home = opciones.home ?? `C:/Users/prueba${pruebas}`
  const base = `${home.replace(/\\/g, '/').replace(/\/+$/, '')}/.claude/canal-interno`
  const archivos = Object.fromEntries(Object.entries(relativos(home)).map(([ruta, a]) => [`${base}/${ruta}`, a])) as Archivos
  const lecturas: string[] = []
  const puerto = {
    ahora: async () => opciones.ahora ?? NOW,
    listar: async (carpeta: string) => {
      const prefijo = `${carpeta}/`
      return Object.entries(archivos)
        .filter(([ruta]) => ruta.startsWith(prefijo) && !ruta.slice(prefijo.length).includes('/'))
        .map(([ruta, a]) => ({ name: ruta.slice(prefijo.length), kind: 'file', mtimeMs: a.mtimeMs }))
    },
    leer: async (ruta: string) => {
      lecturas.push(ruta)
      return archivos[ruta]?.texto ?? null
    },
  }

  return { home, base, archivos, lecturas, puerto, leer: () => leerCanal(puerto, home) }
}

const archivoDe = (c: Consulta, mtimeMs: number | undefined = 1): Archivos[string] => ({ texto: JSON.stringify(c), mtimeMs })

test('it reads the consultas of today and of yesterday, nothing older, and no other file', async () => {
  const hoy = consulta(NOW - 60_000, 'aaaa')
  const ayer = consulta(NOW - 86_400_000, 'bbbb')
  const antes = consulta(NOW - 2 * 86_400_000, 'cccc')
  const mundo = armar(() => ({
    [`consultas/${nombreDe(hoy.id)}`]: archivoDe(hoy),
    [`consultas/${nombreDe(ayer.id)}`]: archivoDe(ayer),
    [`consultas/${nombreDe(antes.id)}`]: archivoDe(antes),
    [`consultas/${nombreDe(hoy.id).replace('.json', '.md')}`]: { texto: '# legible', mtimeMs: 1 },
    'consultas/notas.json': { texto: '{}', mtimeMs: 1 },
  }))

  const { consultas } = await mundo.leer()
  expect(consultas.map(x => x.id)).toEqual([ayer.id, hoy.id])
  expect(mundo.lecturas.filter(ruta => ruta.includes('/consultas/'))).toHaveLength(2)
})

test('the day is the local one: at 20:00 in Costa Rica yesterday is still yesterday', async () => {
  const anteayer = consulta(NOW - 2 * 86_400_000, 'dddd')
  const ayer = consulta(NOW - 86_400_000, 'eeee')
  const mundo = armar(() => ({ [`consultas/${nombreDe(anteayer.id)}`]: archivoDe(anteayer), [`consultas/${nombreDe(ayer.id)}`]: archivoDe(ayer) }))

  expect((await mundo.leer()).consultas.map(x => x.id)).toEqual([ayer.id])
})

test('it keeps only what the block reads of a consulta', async () => {
  const c = consulta(NOW - 1_000, 'ffff', { sirvio: false, decisionesPendientes: 2, decisionesDeHans: 'B', error: 'x', porQue: 'y' })
  const { consultas } = await armar(() => ({ [`consultas/${nombreDe(c.id)}`]: archivoDe(c) })).leer()
  expect(consultas[0]).toEqual({
    id: c.id,
    hilo: 'tienda__mentor',
    de: { nombre: 'Tienda' },
    a: { nombre: 'Mentor' },
    pregunta: '¿Cómo valido la firma?',
    estado: 'respondio',
    iniciada: c.iniciada,
    terminada: c.terminada,
    respuesta: 'Con la llave pública.',
    costoUsd: 1.5,
    sirvio: false,
    decisionesPendientes: 2,
    decisionesDeHans: 'B',
  })
})

test('a long answer is cut when read, to what the column shows, so the state never carries whole answers', async () => {
  const c = consulta(NOW - 1_000, 'aaaa', { respuesta: `  ${'palabra '.repeat(1_000)}` })
  const { consultas } = await armar(() => ({ [`consultas/${nombreDe(c.id)}`]: archivoDe(c) })).leer()
  const respuesta = consultas[0]?.respuesta ?? ''
  expect(respuesta.length).toBe(1_500)
  expect(respuesta.startsWith('palabra')).toBe(true)
  expect(respuesta.endsWith('…')).toBe(true)
})

test('a file that is broken or not a consulta is skipped and the rest is still read', async () => {
  const buena = consulta(NOW - 1_000, 'aaaa')
  const mundo = armar(() => ({
    [`consultas/${nombreDe(buena.id)}`]: archivoDe(buena),
    [`consultas/${nombreDe(idDe(NOW - 2_000, 'bbbb'))}`]: { texto: '{"id": "a', mtimeMs: 1 },
    [`consultas/${nombreDe(idDe(NOW - 3_000, 'cccc'))}`]: { texto: '[]', mtimeMs: 1 },
    [`consultas/${nombreDe(idDe(NOW - 4_000, 'dddd'))}`]: { texto: JSON.stringify({ ...buena, estado: 'quizas' }), mtimeMs: 1 },
    [`consultas/${nombreDe(idDe(NOW - 5_000, 'eeee'))}`]: { texto: JSON.stringify({ id: 'x' }), mtimeMs: 1 },
  }))

  expect((await mundo.leer()).consultas.map(x => x.id)).toEqual([buena.id])
})

test('a consulta left running past the limit reads as failed', async () => {
  const vieja = consulta(NOW - 700_000, 'aaaa', { estado: 'corriendo', terminada: null, respuesta: null })
  const reciente = consulta(NOW - 60_000, 'bbbb', { estado: 'corriendo', terminada: null, respuesta: null })
  const { consultas } = await armar(() => ({ [`consultas/${nombreDe(vieja.id)}`]: archivoDe(vieja), [`consultas/${nombreDe(reciente.id)}`]: archivoDe(reciente) })).leer()
  expect(consultas.map(x => x.estado)).toEqual(['fallo', 'corriendo'])
})

test('a file whose mtimeMs did not change is not read again, and one that changed is', async () => {
  const c = consulta(NOW - 1_000, 'aaaa')
  const ruta = `consultas/${nombreDe(c.id)}`
  const mundo = armar(() => ({ [ruta]: archivoDe(c, 10) }))
  await mundo.leer()
  await mundo.leer()
  expect(mundo.lecturas.filter(x => x.endsWith(nombreDe(c.id)))).toHaveLength(1)

  mundo.archivos[`${mundo.base}/${ruta}`] = archivoDe({ ...c, sirvio: true }, 11)
  expect((await mundo.leer()).consultas[0]?.sirvio).toBe(true)
  expect(mundo.lecturas.filter(x => x.endsWith(nombreDe(c.id)))).toHaveLength(2)
})

test('the 2.1.280 engine lists files with no mtimeMs: they read fine, every time, and are never cached', async () => {
  const c = consulta(NOW - 1_000, 'aaaa')
  const ruta = `consultas/${nombreDe(c.id)}`
  for (const mtimeMs of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    const mundo = armar(() => ({ [ruta]: { texto: JSON.stringify(c), mtimeMs } }))
    expect((await mundo.leer()).consultas.map(x => x.id)).toEqual([c.id])
    mundo.archivos[`${mundo.base}/${ruta}`] = { texto: JSON.stringify({ ...c, sirvio: false }), mtimeMs }
    expect((await mundo.leer()).consultas[0]?.sirvio).toBe(false)
  }
})

test('the daily tope comes from proyectos.json, and is 25 when the file is missing, broken or odd', async () => {
  const con = (texto: string | null) => armar((): Archivos => (texto === null ? {} : { 'proyectos.json': { texto, mtimeMs: 1 } })).leer()

  expect((await con('{"topeDiarioUsd": 10}')).topeDiarioUsd).toBe(10)
  expect((await con('{"topeDiarioUsd": 0}')).topeDiarioUsd).toBe(0)
  expect((await con(null)).topeDiarioUsd).toBe(25)
  expect((await con('{"topeDiarioUsd": 1')).topeDiarioUsd).toBe(25)
  expect((await con('')).topeDiarioUsd).toBe(25)
  expect((await con('[]')).topeDiarioUsd).toBe(25)
  expect((await con('{"topeDiarioUsd": "mucho"}')).topeDiarioUsd).toBe(25)
  expect((await con('{"topeDiarioUsd": -3}')).topeDiarioUsd).toBe(25)
  expect((await con('{"aLaVez": 3}')).topeDiarioUsd).toBe(25)
})

test('proyectos.json written by PowerShell or Notepad, with a BOM, is read all the same', async () => {
  const { topeDiarioUsd } = await armar(() => ({ 'proyectos.json': { texto: '\uFEFF{"topeDiarioUsd": 12}', mtimeMs: 1 } })).leer()
  expect(topeDiarioUsd).toBe(12)
})

test('it never throws: what the port cannot give is left out', async () => {
  const c = consulta(NOW - 1_000, 'aaaa')
  const roto = { ahora: async () => NOW, listar: async (): Promise<never> => Promise.reject(new Error('EPERM')), leer: async (): Promise<never> => Promise.reject(new Error('EBUSY')) }
  expect(await leerCanal(roto, 'C:/Users/rota')).toEqual({ consultas: [], topeDiarioUsd: 25 })

  const mundo = armar(() => ({ [`consultas/${nombreDe(c.id)}`]: archivoDe(c) }))
  const sinLeer = { ...mundo.puerto, leer: async (): Promise<never> => Promise.reject(new Error('EBUSY')) }
  expect(await leerCanal(sinLeer, mundo.home)).toEqual({ consultas: [], topeDiarioUsd: 25 })
  expect((await leerCanal({ ...mundo.puerto, ahora: async (): Promise<never> => Promise.reject(new Error('reloj')) }, mundo.home)).topeDiarioUsd).toBe(25)
})

test('a home written with backslashes reaches the same folders', async () => {
  const c = consulta(NOW - 1_000, 'aaaa')
  const mundo = armar(() => ({ [`consultas/${nombreDe(c.id)}`]: archivoDe(c) }), { home: 'C:\\Users\\hans\\' })
  const { consultas } = await leerCanal(mundo.puerto, 'C:\\Users\\hans\\')
  expect(consultas.map(x => x.id)).toEqual([c.id])
})

test('a file that leaves the listing is forgotten: if it comes back it is read again', async () => {
  const c = consulta(NOW - 1_000, 'aaaa')
  const ruta = `consultas/${nombreDe(c.id)}`
  const mundo = armar(() => ({ [ruta]: archivoDe(c, 5) }))
  const completo = mundo.archivos[`${mundo.base}/${ruta}`]
  await mundo.leer()
  delete mundo.archivos[`${mundo.base}/${ruta}`]
  expect((await mundo.leer()).consultas).toEqual([])

  if (completo) mundo.archivos[`${mundo.base}/${ruta}`] = completo
  expect((await mundo.leer()).consultas).toHaveLength(1)
  expect(mundo.lecturas.filter(x => x.endsWith(nombreDe(c.id)))).toHaveLength(2)
})
