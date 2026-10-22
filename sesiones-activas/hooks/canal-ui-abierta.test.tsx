import { expect, test } from 'claude-code/testing'

import type { CanalVista } from '../types'
import { CANAL, EMPTY_VIEW, ID_FIRMA, NARROW_PROPS, PANE_PROPS, PLUGIN, RUTA_FIRMA, SURFACES, consulta, noop, pareja, withPair } from './canal-ui-ejemplos'
import { paneTree } from './ui'

const OPEN: CanalVista = { ...CANAL, abierta: 'tienda__mentor' }

test('an open pair shows its questions and answers, a way back and where the file is', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'abierta' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, OPEN))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'abierta', props: PANE_PROPS })
    expect((await ui.find({ key: 'volver-canal' }))?.text).toBe('Volver')
    expect(await ui.find({ type: 'Text', text: /¿Cómo valido la firma\?/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /canal-interno\/consultas\// }))?.text).toBe(RUTA_FIRMA)
    // Only that pair, and the clear button belongs to the list.
    expect(await ui.find({ key: 'pareja-tienda__mentor' })).toBeUndefined()
    expect(await ui.find({ key: 'pareja-cont__intel' })).toBeUndefined()
    expect(await ui.find({ key: 'limpiar-canal' })).toBeUndefined()
    await ui.unmount()
  }
})

test('in the open view the question sits on gray and the answer on the block lavender', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'colores-abierta' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, OPEN))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'colores-abierta', props: PANE_PROPS })
    const question = await ui.find({ key: `pregunta-${ID_FIRMA}` })
    const answer = await ui.find({ key: `respuesta-${ID_FIRMA}` })
    expect(question?.props.backgroundColor).toBe('#F1EFE8')
    expect(question?.props.borderStyle).toBe(surface === 'desktop' ? 'round' : undefined)
    expect(answer?.props.backgroundColor).toBe('#EEEDFE')
    expect(answer?.props.borderStyle).toBe(surface === 'desktop' ? 'round' : undefined)
    expect((await ui.find({ type: 'Text', text: /^¿Cómo valido la firma\?$/ }))?.props.color).toBe('#444441')
    expect((await ui.find({ type: 'Text', text: /^Con la clave pública del emisor\.$/ }))?.props.color).toBe('#26215C')
    expect((await ui.find({ type: 'Text', text: /canal-interno\/consultas\// }))?.props.dimColor).toBe(true)
    await ui.unmount()
  }
})

test('the open view keeps every consulta of the pair in order and says when one has no answer', async ($, on) => {
  const hilo: CanalVista = {
    ...OPEN,
    parejas: [
      pareja('tienda__mentor', {
        consultas: [
          consulta('20261017-090000-aaaa', 'tienda__mentor', { pregunta: 'primera' }),
          consulta('20261017-100000-bbbb', 'tienda__mentor', { pregunta: 'segunda', estado: 'fallo', respuesta: null }),
          consulta('20261017-110000-cccc', 'tienda__mentor', { pregunta: 'tercera', estado: 'corriendo', respuesta: null, terminada: null }),
        ],
      }),
    ],
  }
  on('ui.render', { component: 'Pane', requestId: 'hilo' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, hilo))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'hilo', props: PANE_PROPS })
    const order = (await ui.findAll({ type: 'Box' })).map(one => one.key).filter(key => key?.startsWith('pregunta-'))
    expect(order).toEqual(['pregunta-20261017-090000-aaaa', 'pregunta-20261017-100000-bbbb', 'pregunta-20261017-110000-cccc'])
    expect(await ui.find({ key: 'respuesta-20261017-100000-bbbb' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^No llegó a haber respuesta\.$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Todavía no hay respuesta\.$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a very long answer is cut with an ellipsis: the .md has the whole text', async ($, on) => {
  const largo: CanalVista = { ...withPair({ consultas: [consulta(ID_FIRMA, 'tienda__mentor', { respuesta: 'palabra '.repeat(500) })] }), abierta: 'tienda__mentor' }
  on('ui.render', { component: 'Pane', requestId: 'larga' }, ($, e) => paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, largo))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'larga', props: PANE_PROPS })
    const text = (await ui.find({ key: `respuesta-${ID_FIRMA}` }))?.text ?? ''
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(1500)
    expect(text.length).toBeGreaterThan(1000)
    await ui.unmount()
  }
})

test('an open pair that is no longer in the block falls back to the list', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'perdida' }, ($, e) =>
    paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, 60, { ...CANAL, abierta: 'otra__pareja' }),
  )
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'perdida', props: PANE_PROPS })
  expect(await ui.find({ key: 'pareja-tienda__mentor' })).toBeDefined()
  expect(await ui.find({ key: 'volver-canal' })).toBeUndefined()
  await ui.unmount()
})

test('in a narrow column the open view keeps its buttons and still shows where the file is', async ($, on) => {
  on('ui.render', { component: 'Pane', requestId: 'angosta-abierta' }, ($, e) =>
    paneTree($.ui.resolve(e), EMPTY_VIEW, noop, e.surface, e.props.bodyColumns, OPEN),
  )
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'angosta-abierta', props: NARROW_PROPS })
    expect((await ui.find({ key: 'volver-canal' }))?.text).toBe('Volver')
    expect((await ui.find({ key: 'caja-volver-canal' }))?.props.flexShrink).toBe(0)
    expect((await ui.find({ type: 'Text', text: /canal-interno\/consultas\// }))?.text).toBe(RUTA_FIRMA)
    await ui.unmount()
  }
})
