import { expect, test } from 'claude-code/testing'

import type { Actions, Row, View } from '../types'
import { bandTree, paneTree } from './ui'

const PLUGIN = 'sesiones-activas'
const PANE_PROPS = { title: 'Sesiones activas', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: {} } as never
const SURFACES = ['terminal', 'desktop'] as const

const row = (id: string, patch: Partial<Row> = {}): Row => ({
  id,
  title: id,
  group: 'Equipo central',
  link: `claude://claude.ai/epitaxy/${id}`,
  isAsking: false,
  isSelf: false,
  ago: '5 min',
  summary: null,
  ...patch,
})

const VIEW: View = {
  espera: [row('local_mentor', { isAsking: true }), row('local_aqui', { isSelf: true })],
  trabajando: [row('local_ceo')],
  quieta: [],
}

const noop: Actions = {
  jump: () => undefined,
  remove: () => undefined,
  openAll: () => undefined,
  clear: () => undefined,
  abrirPareja: () => undefined,
  volverCanal: () => undefined,
  limpiarCanal: () => undefined,
}

test('the pane lists every row with a button to jump and one to remove', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'prueba' }, ($, e) => paneTree($.ui.resolve(e), VIEW, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'prueba', props: PANE_PROPS })
    expect(await ui.find({ key: 'ir-local_mentor' })).toBeDefined()
    expect(await ui.find({ key: 'quitar-local_ceo' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Te espera · 2/ })).toBeDefined()
    await ui.unmount()
  }
})

test('every group heads its sessions, a lone session included', async ($, on) => {
  const grouped: View = {
    espera: [row('local_a'), row('local_b'), row('local_c', { group: 'Mi CRM' })],
    trabajando: [],
    quieta: [],
  }
  on('ui.render', { component: 'Pane', requestId: 'grupos' }, ($, e) => paneTree($.ui.resolve(e), grouped, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'grupos', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /^Equipo central · 2$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Mi CRM$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Mi CRM · 5 min/ })).toBeUndefined()
    expect(await ui.find({ key: 'ir-local_b' })).toBeDefined()
    await ui.unmount()
  }
})

test('soft style: each block heads with a pastel pill and each group sits in a rounded card', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'colores' }, ($, e) => paneTree($.ui.resolve(e), VIEW, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'colores', props: PANE_PROPS })
    const waiting = await ui.find({ key: 'titulo-espera' })
    const working = await ui.find({ key: 'titulo-trabajando' })
    const card = await ui.find({ key: 'grupo-trabajando-Equipo central' })
    expect(waiting?.props.backgroundColor).toBe('#FAEEDA')
    expect(working?.props.backgroundColor).toBe('#EAF3DE')
    expect(waiting?.text).toBe('Te espera · 2')
    expect(card?.props.borderStyle).toBe('round')
    expect(card?.props.borderColor).toBe('#E3E1D9')
    await ui.unmount()
  }
})

test('polish: rounded pills on the desktop, long names cut short', async ($, on) => {
  const long = 'Llevar las trampas del cliente a la skill del equipo'
  const polished: View = { espera: [row('local_largo', { title: long }), row('local_b')], trabajando: [], quieta: [] }
  on('ui.render', { component: 'Pane', requestId: 'pulido' }, ($, e) => paneTree($.ui.resolve(e), polished, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'pulido', props: PANE_PROPS })
    const isDesktop = surface === 'desktop'
    expect((await ui.find({ key: 'titulo-espera' }))?.props.borderStyle).toBe(isDesktop ? 'round' : undefined)
    const label = (await ui.find({ key: 'ir-local_largo' }))?.text ?? ''
    expect(label.endsWith('…') && label.length < long.length).toBe(true)
    await ui.unmount()
  }
})

test('Quietas has a button to clear them all, the other blocks do not', async ($, on) => {
  const calm: View = { espera: [row('local_a')], trabajando: [], quieta: [row('local_q1'), row('local_q2')] }
  on('ui.render', { component: 'Pane', requestId: 'limpiar' }, ($, e) => paneTree($.ui.resolve(e), calm, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'limpiar', props: PANE_PROPS })
    expect((await ui.find({ key: 'limpiar-quieta' }))?.text).toBe('Limpiar')
    expect(await ui.find({ key: 'limpiar-espera' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a waiting session shows its one-line summary under its name', async ($, on) => {
  const waiting: View = { espera: [row('local_s', { summary: '¿Activo el saludo nuevo?' })], trabajando: [], quieta: [] }
  on('ui.render', { component: 'Pane', requestId: 'resumen' }, ($, e) => paneTree($.ui.resolve(e), waiting, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'resumen', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /^¿Activo el saludo nuevo\?$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a session that answered and still runs background work has a half dot and its line in Trabajando', async ($, on) => {
  const line = 'Te respondió · sigue con 1 tarea: Re-revisar lote T1+T2'
  const only = (patch: Partial<Row>): View => ({ espera: [], trabajando: [row('local_f', patch)], quieta: [] })
  on('ui.render', { component: 'Pane', requestId: 'fondo' }, ($, e) =>
    paneTree($.ui.resolve(e), only({ isBackground: true, summary: line }), noop, e.surface),
  )
  on('ui.render', { component: 'Pane', requestId: 'activa' }, ($, e) => paneTree($.ui.resolve(e), only({}), noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'fondo', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /^◐$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^●$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Te respondió · sigue con 1 tarea: Re-revisar lote T1\+T2$/ })).toBeDefined()
    await ui.unmount()
    const plain = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'activa', props: PANE_PROPS })
    expect(await plain.find({ type: 'Text', text: /^●$/ })).toBeDefined()
    expect(await plain.find({ type: 'Text', text: /^◐$/ })).toBeUndefined()
    await plain.unmount()
  }
})

test('in a narrow column the name is cut to fit and the time and remove mark never shrink', async ($, on) => {
  const narrow = { title: 'Sesiones activas', isFocused: false, bodyColumns: 30, placement: 'dock', scroll: {} } as never
  const long: View = { espera: [row('local_n', { title: 'Mod - Sesiones activas y trabajando en el diseño' })], trabajando: [], quieta: [] }
  on('ui.render', { component: 'Pane', requestId: 'angosta' }, ($, e) =>
    paneTree($.ui.resolve(e), long, noop, e.surface, e.props.bodyColumns),
  )

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'angosta', props: narrow })
    const label = (await ui.find({ key: 'ir-local_n' }))?.text ?? ''
    expect(label.length <= 16 && label.endsWith('…')).toBe(true)
    expect((await ui.find({ key: 'hora-local_n' }))?.props.flexShrink).toBe(0)
    await ui.unmount()
  }
})

test('the card of the session you are in has a blue edge and an "estás aquí" pill', async ($, on) => {
  const mine: View = {
    espera: [],
    trabajando: [row('local_aqui', { isSelf: true, group: 'Tienda - Ana' }), row('local_ceo')],
    quieta: [],
  }
  on('ui.render', { component: 'Pane', requestId: 'propia' }, ($, e) => paneTree($.ui.resolve(e), mine, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'propia', props: PANE_PROPS })
    expect((await ui.find({ key: 'grupo-trabajando-Tienda - Ana' }))?.props.borderColor).toBe('#378ADD')
    expect((await ui.find({ key: 'grupo-trabajando-Equipo central' }))?.props.borderColor).toBe('#E3E1D9')
    const pill = await ui.find({ key: 'estas-aqui' })
    expect(pill?.text).toBe('estás aquí')
    expect(pill?.props.backgroundColor).toBe('#E6F1FB')
    expect((await ui.find({ key: 'hora-local_aqui' }))?.text).toBe('5 min')
    await ui.unmount()
  }
})

test('in a card shared with other sessions, your row still says aquí', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'compartida' }, ($, e) => paneTree($.ui.resolve(e), VIEW, noop, e.surface))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'compartida', props: PANE_PROPS })
    expect((await ui.find({ key: 'grupo-espera-Equipo central' }))?.props.borderColor).toBe('#378ADD')
    expect((await ui.find({ key: 'hora-local_aqui' }))?.text).toBe('aquí · 5 min')
    expect((await ui.find({ key: 'hora-local_mentor' }))?.text).toBe('5 min')
    await ui.unmount()
  }
})

test('an empty list invites writing to a session', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'vacia' }, ($, e) =>
    paneTree($.ui.resolve(e), { espera: [], trabajando: [], quieta: [] }, noop, e.surface),
  )

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'vacia', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /Escríbele/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the band shows what waits, never the current session, and a way to see all', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'banda' }, ($, e) => bandTree($.ui.resolve(e), VIEW, noop))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'banda', props: PANE_PROPS })
    expect(await ui.find({ key: 'banda-local_mentor' })).toBeDefined()
    expect(await ui.find({ key: 'banda-local_aqui' })).toBeUndefined()
    expect((await ui.find({ key: 'ver-todas' }))?.text).toBe('Ver todas (3)')
    await ui.unmount()
  }
})
