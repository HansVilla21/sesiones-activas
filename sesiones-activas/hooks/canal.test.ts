import { expect, test } from 'claude-code/testing'

import type { ConsultaLeida } from '../types'
import { limpiadoEn, topeAlcanzado, vistaCanal } from './canal'

// La hora local de Hans: las pruebas arman las fechas con el constructor local para no depender de la zona.
const NOW = new Date(2026, 9, 17, 14, 0, 0).getTime()
const AYER = new Date(2026, 9, 16, 14, 0, 0).getTime()

const NOMBRES: Record<string, [string, string]> = {
  tienda__mentor: ['Tienda', 'Mentor'],
  cont__intel: ['Contabilidad', 'Inteligencia'],
}

const c = (id: string, hilo: string, estado: ConsultaLeida['estado'], iniciada: number, patch: Partial<ConsultaLeida> = {}): ConsultaLeida => {
  const [de, a] = NOMBRES[hilo] ?? hilo.split('__')
  return {
    id,
    hilo,
    de: { nombre: de ?? hilo },
    a: { nombre: a ?? hilo },
    pregunta: `pregunta ${id}`,
    estado,
    iniciada,
    terminada: estado === 'corriendo' ? null : iniciada + 30_000,
    respuesta: estado === 'respondio' ? `respuesta ${id}` : null,
    costoUsd: null,
    sirvio: null,
    decisionesPendientes: 0,
    decisionesDeHans: null,
    ...patch,
  }
}

test('one card per pair, newest first, with the state of its last consulta', () => {
  const v = vistaCanal([c('1', 'tienda__mentor', 'respondio', NOW - 60_000), c('2', 'tienda__mentor', 'corriendo', NOW - 5_000), c('3', 'cont__intel', 'fallo', NOW - 9_000)], 0, null, false, NOW)
  expect(v.parejas.map(p => [p.clave, p.estado])).toEqual([['tienda__mentor', 'corriendo'], ['cont__intel', 'fallo']])
  expect(v.parejas[0]?.titulo).toBe('Tienda → Mentor')
})

test('a consulta rated as not helpful paints its pair coral, and pending decisions are counted', () => {
  const v = vistaCanal([{ ...c('1', 'tienda__mentor', 'respondio', NOW), sirvio: false, decisionesPendientes: 2 }], 0, null, false, NOW)
  expect(v.parejas[0]).toEqual(expect.objectContaining({ estado: 'no-sirvio', decisiones: 2 }))
})

test('yesterday and what was cleared leave the block, a running one never does', () => {
  const v = vistaCanal([c('1', 'a__b', 'respondio', NOW - 86_400_000), c('2', 'c__d', 'respondio', NOW - 10_000), c('3', 'e__f', 'corriendo', NOW - 20_000)], NOW - 5_000, null, false, NOW)
  expect(v.parejas.map(p => p.clave)).toEqual(['e__f'])
})

test('the day is the local one: what ran at 23:55 is still running at 00:03, what finished then is gone', () => {
  const pasadaLaMedianoche = new Date(2026, 9, 17, 0, 3, 0).getTime()
  const desde = new Date(2026, 9, 16, 23, 55, 0).getTime()
  const v = vistaCanal(
    [c('1', 'tienda__mentor', 'corriendo', desde), c('2', 'tienda__mentor', 'respondio', desde - 3_600_000), c('3', 'cont__intel', 'respondio', desde)],
    0,
    null,
    false,
    pasadaLaMedianoche,
  )
  expect(v.parejas.map(p => [p.clave, p.estado])).toEqual([['tienda__mentor', 'corriendo']])
  expect(v.parejas[0]?.consultas.map(x => x.id)).toEqual(['1'])
})

test('a running consulta that outlived the limit is shown as failed, on the pair and in its list', () => {
  const lleva = (ms: number) => vistaCanal([c('1', 'tienda__mentor', 'corriendo', NOW - ms)], 0, null, false, NOW).parejas[0]
  expect(lleva(660_000)?.estado).toBe('corriendo')
  expect(lleva(660_001)?.estado).toBe('fallo')
  expect(lleva(700_000)?.consultas[0]?.estado).toBe('fallo')
})

test('an expired running consulta from yesterday is gone like any other from yesterday', () => {
  const v = vistaCanal([c('1', 'tienda__mentor', 'corriendo', new Date(2026, 9, 16, 23, 40, 0).getTime())], 0, null, false, new Date(2026, 9, 17, 0, 20, 0).getTime())
  expect(v.parejas).toEqual([])
})

test('a card says its last question and how long ago it was answered', () => {
  const v = vistaCanal([c('1', 'tienda__mentor', 'respondio', NOW - 10 * 60_000, { terminada: NOW - 5 * 60_000 }), c('2', 'tienda__mentor', 'corriendo', NOW - 20_000, { pregunta: '¿Dónde\nse guarda   la clave?' })], 0, null, false, NOW)
  expect(v.parejas[0]?.ultima).toBe('¿Dónde se guarda la clave?')
  expect(v.parejas[0]?.hace).toBe('ahora')
  const respondida = vistaCanal([c('1', 'tienda__mentor', 'respondio', NOW - 10 * 60_000, { terminada: NOW - 5 * 60_000 })], 0, null, false, NOW)
  expect(respondida.parejas[0]?.hace).toBe('5 min')
})

test('the consultas of a pair read in order, the first question first', () => {
  const v = vistaCanal([c('2', 'tienda__mentor', 'respondio', NOW - 1_000), c('1', 'tienda__mentor', 'respondio', NOW - 90_000)], 0, null, false, NOW)
  expect(v.parejas[0]?.consultas.map(x => x.id)).toEqual(['1', '2'])
})

test('pending decisions are those of every consulta of the pair that Hans has not decided yet', () => {
  const v = vistaCanal(
    [
      c('1', 'tienda__mentor', 'respondio', NOW - 90_000, { decisionesPendientes: 2 }),
      c('2', 'tienda__mentor', 'respondio', NOW - 60_000, { decisionesPendientes: 3, decisionesDeHans: 'Usar el proveedor B' }),
      c('3', 'tienda__mentor', 'respondio', NOW - 30_000, { decisionesPendientes: 1 }),
    ],
    0,
    null,
    false,
    NOW,
  )
  expect(v.parejas[0]?.decisiones).toBe(3)
})

test('only a pair that is in the block can be the open one, and the tope flag goes through', () => {
  const lista = [c('1', 'tienda__mentor', 'respondio', NOW - 1_000)]
  expect(vistaCanal(lista, 0, 'tienda__mentor', true, NOW)).toEqual(expect.objectContaining({ abierta: 'tienda__mentor', topeAlcanzado: true }))
  expect(vistaCanal(lista, 0, 'otra__pareja', false, NOW).abierta).toBeNull()
  expect(vistaCanal([], 0, null, false, NOW)).toEqual({ parejas: [], abierta: null, topeAlcanzado: false })
})

test('the tope is reached when what today cost gets to the daily limit, and yesterday does not count', () => {
  const hoy = (usd: number | null) => c('h', 'tienda__mentor', 'respondio', NOW - 1_000, { costoUsd: usd })
  const ayer = c('y', 'tienda__mentor', 'respondio', AYER, { costoUsd: 100 })
  expect(topeAlcanzado([hoy(10), hoy(14.99), ayer], 25, NOW)).toBe(false)
  expect(topeAlcanzado([hoy(10), hoy(15), ayer], 25, NOW)).toBe(true)
  expect(topeAlcanzado([hoy(null), ayer], 25, NOW)).toBe(false)
  expect(topeAlcanzado([hoy(30)], 25, NOW)).toBe(true)
  expect(topeAlcanzado([], 25, NOW)).toBe(false)
})

test('the day counted for the tope starts at local midnight', () => {
  const ahora = new Date(2026, 9, 17, 0, 3, 0).getTime()
  const anoche = c('y', 'tienda__mentor', 'respondio', new Date(2026, 9, 16, 23, 55, 0).getTime(), { costoUsd: 30 })
  expect(topeAlcanzado([anoche], 25, ahora)).toBe(false)
})

test('what was cleared is read from the mark file: a number in at, else zero', () => {
  expect(limpiadoEn({ at: 1_800_000_000_000 })).toBe(1_800_000_000_000)
  expect(limpiadoEn(null)).toBe(0)
  expect(limpiadoEn({})).toBe(0)
  expect(limpiadoEn({ at: 'ayer' })).toBe(0)
  expect(limpiadoEn({ at: Number.NaN })).toBe(0)
  expect(limpiadoEn('x')).toBe(0)
})
