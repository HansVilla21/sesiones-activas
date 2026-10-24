import { expect, test } from 'claude-code/testing'

import type { Marks, SessionRecord } from '../types'
import { enFondo, FONDO_MAX_MS, lineaDeFondo, tareasDe } from './fondo'
import { buildView, newlyWaiting } from './model'

const NOW = 1_800_000_000_000
const noMarks: Marks = { removed: {}, seen: {} }
// The app's isRunning is false once the turn ended, background work or not.
const live = { ids: new Set(['muebleria']), running: new Set<string>() }

const record = (patch: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'muebleria',
  title: 'Mueblería',
  group: 'Software',
  link: 'claude://claude.ai/epitaxy/muebleria',
  cwd: 'D:\\Clientes\\Mueblería',
  phase: 'termino',
  phaseAt: NOW - 60_000,
  activatedAt: NOW - 120_000,
  summary: 'El arreglo del Deshacer ya está hecho',
  ...patch,
})

const UNA = { cuantas: 1, nombre: 'Re-revisar lote T1+T2' }

test('a turn that ends with background work running counts it, and names it when it is one', () => {
  const revisor = { id: 't1', type: 'subagent', status: 'running', description: '  Re-revisar\nlote T1+T2 ' }
  expect(tareasDe([revisor])).toEqual(UNA)
  expect(tareasDe([{ description: 'a' }, { description: 'b' }, { description: 'c' }])).toEqual({ cuantas: 3, nombre: null })
  expect(tareasDe([{ description: '' }])).toEqual({ cuantas: 1, nombre: null })
  expect(tareasDe([])).toBeNull()
  expect(tareasDe(undefined)).toBeNull()
})

test('a session that answered and still runs background work is working, with a half dot and a line saying so', () => {
  const view = buildView([record({ tareas: UNA })], noMarks, live, null, NOW)

  expect(view.espera).toEqual([])
  expect(view.trabajando.map(row => row.id)).toEqual(['muebleria'])
  expect(view.trabajando[0]?.isBackground).toBe(true)
  expect(view.trabajando[0]?.summary).toBe('Te respondió · sigue con 1 tarea: Re-revisar lote T1+T2')
})

test('the line counts the tasks when there are several or the one has no name', () => {
  expect(lineaDeFondo({ cuantas: 3, nombre: null })).toBe('Te respondió · sigue con 3 tareas en segundo plano')
  expect(lineaDeFondo({ cuantas: 1, nombre: null })).toBe('Te respondió · sigue con 1 tarea en segundo plano')
})

test('with no background work left the answer waits for you as before', () => {
  for (const tareas of [null, undefined]) {
    const view = buildView([record({ tareas })], noMarks, live, null, NOW)
    expect(view.espera.map(row => row.id)).toEqual(['muebleria'])
    expect(view.espera[0]?.summary).toBe('El arreglo del Deshacer ya está hecho')
    expect(view.espera[0]?.isBackground).toBe(false)
  }
})

test('a question asked while background work runs still waits on you', () => {
  const view = buildView([record({ phase: 'pide', tareas: UNA })], noMarks, live, null, NOW)

  expect(view.espera[0]?.isAsking).toBe(true)
})

test('a session back to working after a question, its background work still running, is not taken for stuck', () => {
  const view = buildView([record({ phase: 'trabajando', phaseAt: NOW - 10 * 60_000, tareas: UNA })], noMarks, live, null, NOW)

  expect(view.trabajando[0]?.isBackground).toBe(true)
})

test('background work with no news for hours is taken for cut off: the answer waits for you', () => {
  const old = record({ phaseAt: NOW - FONDO_MAX_MS - 1, tareas: UNA })

  expect(enFondo(old, NOW)).toBe(false)
  expect(buildView([old], noMarks, live, null, NOW).espera.map(row => row.id)).toEqual(['muebleria'])
})

test('no toast while the background work runs; one once the session really waits for you', () => {
  const working = buildView([record({ phase: 'trabajando', phaseAt: NOW - 5_000 })], noMarks, live, null, NOW)
  const inBackground = buildView([record({ tareas: UNA })], noMarks, live, null, NOW)
  const done = buildView([record({ phaseAt: NOW })], noMarks, live, null, NOW)

  expect(newlyWaiting(working, inBackground)).toEqual([])
  expect(newlyWaiting(inBackground, done).map(row => row.id)).toEqual(['muebleria'])
})
