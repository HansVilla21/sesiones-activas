import { expect, test } from 'claude-code/testing'

import type { Actions, CanalVista } from '../types'
import { CANAL, EMPTY_VIEW, NARROW_PROPS, PANE_PROPS, PLUGIN, QUIET_VIEW, SURFACES, noop, pareja, withPair } from './canal-ui-ejemplos'
import { actionForElement } from './model'
import { paneTree } from './ui'

type Drawn = { props?: Record<string, unknown>; hover?: unknown; children?: unknown[] }

/** The hover of the element with this key: the tree drawn keeps it beside the props, `find` does not. */
const hoverOf = (node: unknown, key: string): unknown => {
  const one = node as Drawn
  if (one.props?.key === key) return one.hover
  for (const child of one.children ?? []) {
    const found = typeof child === 'object' && child !== null ? hoverOf(child, key) : undefined
    if (found !== undefined) return found
  }

  return undefined
}

test('the block comes after Quietas with its purple pill and one card per pair', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'canal' }, ($, e) => paneTree($.ui.resolve(e), QUIET_VIEW, noop, e.surface, 60, CANAL))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'canal', props: PANE_PROPS })
    const pill = await ui.find({ key: 'titulo-canal' })
    expect(pill?.props.backgroundColor).toBe('#EEEDFE')
    expect(pill?.text).toBe('Entre proyectos · 2')
    expect(pill?.props.borderStyle).toBe(surface === 'desktop' ? 'round' : undefined)
    expect((await ui.find({ type: 'Text', text: /^Entre proyectos/ }))?.props.color).toBe('#3C3489')
    expect(await ui.find({ key: 'pareja-tienda__mentor' })).toBeDefined()
    expect(await ui.find({ key: 'pareja-cont__intel' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 decisiones para Hans/ })).toBeDefined()
    expect((await ui.find({ key: 'limpiar-canal' }))?.text).toBe('Limpiar')
    const order = (await ui.findAll({ type: 'Box' })).map(one => one.key)
    expect(order.indexOf('titulo-quieta')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('titulo-canal')).toBeGreaterThan(order.indexOf('titulo-quieta'))
    await ui.unmount()
  }
})

test('each pair is a rounded card with a hairline edge that turns purple under the mouse', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'tarjeta' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, CANAL))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'tarjeta', props: PANE_PROPS })
    const card = await ui.find({ key: 'tarjeta-tienda__mentor' })
    expect(card?.props.borderStyle).toBe('round')
    expect(card?.props.borderColor).toBe('#E3E1D9')
    expect(hoverOf(await ui.drawn(), 'tarjeta-tienda__mentor')).toEqual({ borderColor: '#7F77DD' })
    expect(await ui.find({ type: 'Text', text: /^Tienda → Mentor$/ })).toBeDefined()
    expect((await ui.find({ key: 'pareja-tienda__mentor' }))?.text).toBe('¿Cómo valido la firma?')
    expect((await ui.find({ key: 'hace-tienda__mentor' }))?.text).toBe('2 min')
    await ui.unmount()
  }
})

test('the state of the last consulta: a purple dot while it runs, a green check, a red dot, a coral dot', async ($, on) => {
  const states: CanalVista = {
    ...CANAL,
    parejas: [
      pareja('a__a', { estado: 'corriendo' }),
      pareja('b__b', { estado: 'respondio' }),
      pareja('c__c', { estado: 'fallo' }),
      pareja('d__d', { estado: 'no-sirvio' }),
    ],
  }
  on('ui.render', { component: 'Pane', requestId: 'estados' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, states))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'estados', props: PANE_PROPS })
    const mark = async (clave: string) => {
      const found = await ui.find({ key: `marca-${clave}` })

      return [found?.text, (found?.children[0] as { props?: { color?: string } } | undefined)?.props?.color]
    }
    expect(await mark('a__a')).toEqual(['●', '#7F77DD'])
    expect(await mark('b__b')).toEqual(['✓', '#3B6D11'])
    expect(await mark('c__c')).toEqual(['●', '#E24B4A'])
    expect(await mark('d__d')).toEqual(['●', '#D85A30'])
    await ui.unmount()
  }
})

test('decisions waiting for Hans: a line when there are some, singular for one, none for zero', async ($, on) => {
  let vista = withPair({ decisiones: 0 })
  on('ui.render', { component: 'Pane', requestId: 'decisiones' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, vista))
  for (const surface of SURFACES) {
    for (const [n, esperado] of [[0, null], [1, '1 decisión para Hans'], [3, '3 decisiones para Hans']] as const) {
      vista = withPair({ decisiones: n })
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'decisiones', props: PANE_PROPS })
      expect((await ui.find({ type: 'Text', text: /para Hans$/ }))?.text ?? null).toBe(esperado)
      await ui.unmount()
    }
  }
})

test('when the daily limit is reached a dim line says so under the pill', async ($, on) => {
  let vista: CanalVista = CANAL
  on('ui.render', { component: 'Pane', requestId: 'tope' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, vista))
  for (const surface of SURFACES) {
    for (const reached of [true, false]) {
      vista = { ...CANAL, topeAlcanzado: reached }
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'tope', props: PANE_PROPS })
      const line = await ui.find({ type: 'Text', text: /Tope del día alcanzado/ })
      expect(line?.text ?? null).toBe(reached ? 'Tope del día alcanzado: las consultas esperan a mañana' : null)
      if (reached) expect(line?.props.dimColor).toBe(true)
      await ui.unmount()
    }
  }
})

test('a pane with no sessions but a running consulta still draws the block', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'solo-canal' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, CANAL))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'solo-canal', props: PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /Escríbele/ })).toBeUndefined()
  expect(await ui.find({ key: 'titulo-canal' })).toBeDefined()
  await ui.unmount()
})

test('with no pairs the pane is what it was: no block, and the empty list still invites writing', async ($, on) => {
  const vacio: CanalVista = { parejas: [], abierta: null, topeAlcanzado: true }
  on('ui.render', { component: 'Pane', requestId: 'sin-pareja' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, vacio))
  on('ui.render', { component: 'Pane', requestId: 'sin-canal' }, ($, e) => paneTree($.ui.resolve(e), QUIET_VIEW, noop, e.surface, 60))
  for (const surface of SURFACES) {
    const empty = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'sin-pareja', props: PANE_PROPS })
    expect(await empty.find({ type: 'Text', text: /Escríbele/ })).toBeDefined()
    expect(await empty.find({ key: 'titulo-canal' })).toBeUndefined()
    await empty.unmount()
    const listed = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'sin-canal', props: PANE_PROPS })
    expect(await listed.find({ key: 'titulo-quieta' })).toBeDefined()
    expect(await listed.find({ key: 'titulo-canal' })).toBeUndefined()
    await listed.unmount()
  }
})

test('a pair with no question text still draws a button with a label', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'sin-pregunta' }, ($, e) =>
    paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, withPair({ ultima: '' })),
  )
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'sin-pregunta', props: PANE_PROPS })
    expect((await ui.find({ key: 'pareja-tienda__mentor' }))?.text).toBe('(sin pregunta)')
    await ui.unmount()
  }
})

test('in a narrow column nothing is pushed out: the title and question are cut and the time never shrinks', async ($, on) => {
  const angosto: CanalVista = {
    ...CANAL,
    parejas: [
      pareja('tienda__mentor', {
        titulo: 'Contabilidad de la clínica → Inteligencia de negocio',
        ultima: 'Qué tabla guarda el IVA de las facturas electrónicas de cada cliente',
        hace: '12 min',
        decisiones: 2,
      }),
    ],
  }
  on('ui.render', { component: 'Pane', requestId: 'angosta-canal' }, ($, e) =>
    paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, e.props.bodyColumns, angosto),
  )
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'angosta-canal', props: NARROW_PROPS })
    // titleRoom(30, "12 min") = 15 cells for the question; the title has no time to its right: titleRoom(30, "") = 21.
    const label = (await ui.find({ key: 'pareja-tienda__mentor' }))?.text ?? ''
    expect(label.length <= 15 && label.endsWith('…')).toBe(true)
    const title = (await ui.find({ type: 'Text', text: /^Contabilidad/ }))?.text ?? ''
    expect(title.length <= 21 && title.endsWith('…')).toBe(true)
    expect((await ui.find({ key: 'hace-tienda__mentor' }))?.props.flexShrink).toBe(0)
    expect((await ui.find({ key: 'marca-tienda__mentor' }))?.props.flexShrink).toBe(0)
    await ui.unmount()
  }
})

test('pressing the buttons asks for the pair, the way back and the clearing', async ($, on) => {
  const calls: string[] = []
  const spy: Actions = {
    ...noop,
    abrirPareja: clave => calls.push(`abrir ${clave}`),
    volverCanal: () => calls.push('volver'),
    limpiarCanal: () => calls.push('limpiar'),
  }
  let vista = CANAL
  on('ui.render', { component: 'Pane', requestId: 'botones' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, spy, e.surface, 60, vista))
  for (const surface of SURFACES) {
    vista = CANAL
    const list = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'botones', props: PANE_PROPS })
    await list.press({ key: 'pareja-tienda__mentor', plugin: 'test' })
    await list.press({ key: 'limpiar-canal', plugin: 'test' })
    await list.unmount()
    vista = { ...CANAL, abierta: 'tienda__mentor' }
    const open = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'botones', props: PANE_PROPS })
    await open.press({ key: 'volver-canal', plugin: 'test' })
    await open.unmount()
  }
  expect(calls).toEqual(['abrir tienda__mentor', 'limpiar', 'volver', 'abrir tienda__mentor', 'limpiar', 'volver'])
})

test('the keys of the block buttons are found by actionForElement', () => {
  const calls: string[] = []
  const act: Actions = {
    ...noop,
    abrirPareja: clave => calls.push(`abrir ${clave}`),
    volverCanal: () => calls.push('volver'),
    limpiarCanal: () => calls.push('limpiar'),
  }
  actionForElement('pareja-tienda__mentor', EMPTY_VIEW)?.(act)
  actionForElement('volver-canal', EMPTY_VIEW)?.(act)
  actionForElement('limpiar-canal', EMPTY_VIEW)?.(act)

  expect(calls).toEqual(['abrir tienda__mentor', 'volver', 'limpiar'])
  expect(actionForElement('pareja-', EMPTY_VIEW)).toBe(null)
  expect(actionForElement('titulo-canal', EMPTY_VIEW)).toBe(null)
  expect(actionForElement('limpiar-quieta', EMPTY_VIEW)).not.toBe(null)
})
