import { expect, test } from 'claude-code/testing'

import type { Marks, SessionRecord, TareaDeFondo } from '../types'
import { AGENTE_MAX_MS, COMANDO_MAX_MS, enFondo, fondoDe, lineaDeFondo } from './fondo'
import { buildView, newlyWaiting } from './model'

const NOW = 1_800_000_000_000
const noMarks: Marks = { removed: {}, seen: {} }
// The app's isRunning is false once the turn ended, background work or not.
const live = { ids: new Set(['tienda']), running: new Set<string>() }

const record = (patch: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'tienda',
  title: 'Tienda',
  group: 'Software',
  link: 'claude://claude.ai/epitaxy/tienda',
  cwd: 'D:\\Clientes\\Tienda',
  phase: 'termino',
  phaseAt: NOW - 60_000,
  activatedAt: NOW - 120_000,
  summary: 'El arreglo del Deshacer ya está hecho',
  ...patch,
})

const tarea = (patch: Partial<TareaDeFondo> = {}): TareaDeFondo => ({
  id: 't1',
  tipo: 'subagent',
  nombre: 'Re-revisar lote T1+T2',
  desde: NOW - 60_000,
  ...patch,
})

// As `classic.Stop` sends them.
const revisor = { id: 't1', type: 'subagent', status: 'running', description: '  Re-revisar\nlote T1+T2 ' }
const vigilancia = {
  id: 'w1',
  type: 'artifact-auto-react',
  status: 'running',
  description: 'live updates for artifact https://claude.ai/artifact/PaginaDeEjemplo123 (re-armed on session start)',
}
const servidor = { id: 's1', type: 'shell', status: 'running', description: 'Levantar el sitio', command: 'cd app && npm run dev' }

test('a turn that ends with background work running notes each task, named, from when it was first seen', () => {
  const { tareas, vistas } = fondoDe([revisor], {}, NOW)

  expect(tareas).toEqual([{ id: 't1', tipo: 'subagent', nombre: 'Re-revisar lote T1+T2', desde: NOW }])
  expect(vistas).toEqual({ t1: NOW })
  expect(fondoDe([], { t1: NOW }, NOW)).toEqual({ tareas: null, vistas: {} })
  expect(fondoDe(undefined, {}, NOW)).toEqual({ tareas: null, vistas: {} })
})

test('a task seen at an earlier turn end keeps the time it was first seen', () => {
  const later = NOW + 30 * 60_000

  expect(fondoDe([revisor], { t1: NOW, viejo: NOW - 1 }, later)).toEqual({
    tareas: [{ id: 't1', tipo: 'subagent', nombre: 'Re-revisar lote T1+T2', desde: NOW }],
    vistas: { t1: NOW },
  })
})

test('watching a published page for comments is no work', () => {
  expect(fondoDe([vigilancia], {}, NOW).tareas).toBeNull()
  expect(fondoDe([{ ...vigilancia, type: 'monitor' }], {}, NOW).tareas).toBeNull()
  expect(fondoDe([{ ...vigilancia, description: 'Página' }], {}, NOW).tareas).toBeNull()
  expect(fondoDe([vigilancia, revisor], {}, NOW).tareas?.map(one => one.id)).toEqual(['t1'])
})

test('a dev server left running is no work', () => {
  for (const command of ['npm run dev', 'npx next dev -p 3100', 'pnpm dev', 'python -m http.server 8000', 'vite --port 5173']) {
    expect(fondoDe([{ ...servidor, command, description: command }], {}, NOW).tareas).toBeNull()
  }
  expect(fondoDe([{ ...servidor, command: 'npm test', description: 'Correr las pruebas' }], {}, NOW).tareas).not.toBeNull()
})

test('a session that answered and still runs background work is working, with a half dot and a line saying so', () => {
  const view = buildView([record({ tareas: [tarea()] })], noMarks, live, null, NOW)

  expect(view.espera).toEqual([])
  expect(view.trabajando.map(row => row.id)).toEqual(['tienda'])
  expect(view.trabajando[0]?.isBackground).toBe(true)
  expect(view.trabajando[0]?.summary).toBe('Te respondió · sigue con 1 tarea: Re-revisar lote T1+T2')
})

test('the line counts the tasks when there are several or the one has no name', () => {
  expect(lineaDeFondo([tarea(), tarea({ id: 't2' }), tarea({ id: 't3' })])).toBe('Te respondió · sigue con 3 tareas en segundo plano')
  expect(lineaDeFondo([tarea({ nombre: null })])).toBe('Te respondió · sigue con 1 tarea en segundo plano')
})

test('with no background work left the answer waits for you as before', () => {
  for (const tareas of [null, undefined]) {
    const view = buildView([record({ tareas })], noMarks, live, null, NOW)
    expect(view.espera.map(row => row.id)).toEqual(['tienda'])
    expect(view.espera[0]?.summary).toBe('El arreglo del Deshacer ya está hecho')
    expect(view.espera[0]?.isBackground).toBe(false)
  }
})

test('a record written by 0.6.0 or 0.6.1, with the old shape, counts no background work', () => {
  const old = record({ tareas: { cuantas: 1, nombre: 'cd app && cat launch.json' } as never })

  expect(buildView([old], noMarks, live, null, NOW).espera.map(row => row.id)).toEqual(['tienda'])
})

test('a question asked while background work runs still waits on you', () => {
  const view = buildView([record({ phase: 'pide', tareas: [tarea()] })], noMarks, live, null, NOW)

  expect(view.espera[0]?.isAsking).toBe(true)
})

test('a session back to working after a question, its background work still running, is not taken for stuck', () => {
  const view = buildView([record({ phase: 'trabajando', phaseAt: NOW - 10 * 60_000, tareas: [tarea()] })], noMarks, live, null, NOW)

  expect(view.trabajando[0]?.isBackground).toBe(true)
})

test('an agent counts as work for hours; past that the answer waits for you', () => {
  expect(enFondo(record({ tareas: [tarea({ desde: NOW - AGENTE_MAX_MS + 60_000 })] }), NOW)).toBe(true)
  expect(enFondo(record({ tareas: [tarea({ desde: NOW - AGENTE_MAX_MS - 1 })] }), NOW)).toBe(false)
})

test('a command counts as work its first minutes only: one still running later is a server left on or stuck', () => {
  const comando = (desde: number) => tarea({ id: 'b1', tipo: 'shell', nombre: 'cd app && cat launch.json', desde })

  expect(enFondo(record({ tareas: [comando(NOW - COMANDO_MAX_MS + 60_000)] }), NOW)).toBe(true)
  const stuck = record({ tareas: [comando(NOW - COMANDO_MAX_MS - 1)] })
  expect(enFondo(stuck, NOW)).toBe(false)
  expect(buildView([stuck], noMarks, live, null, NOW).espera.map(row => row.id)).toEqual(['tienda'])
  const mixed = buildView([record({ tareas: [comando(NOW - 5 * 3_600_000), tarea()] })], noMarks, live, null, NOW)
  expect(mixed.trabajando[0]?.summary).toBe('Te respondió · sigue con 1 tarea: Re-revisar lote T1+T2')
})

test('no toast while the background work runs; one once the session really waits for you', () => {
  const working = buildView([record({ phase: 'trabajando', phaseAt: NOW - 5_000 })], noMarks, live, null, NOW)
  const inBackground = buildView([record({ tareas: [tarea()] })], noMarks, live, null, NOW)
  const done = buildView([record({ phaseAt: NOW })], noMarks, live, null, NOW)

  expect(newlyWaiting(working, inBackground)).toEqual([])
  expect(newlyWaiting(inBackground, done).map(row => row.id)).toEqual(['tienda'])
})
