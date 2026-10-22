// Datos de ejemplo de las pruebas del bloque "Entre proyectos": dos parejas, una respondida y otra corriendo.

import type { Actions, CanalVista, ConsultaLeida, ParejaVista, Row, View } from '../types'

export const PLUGIN = 'sesiones-activas'
export const PANE_PROPS = { title: 'Sesiones activas', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: {} } as never
export const NARROW_PROPS = { title: 'Sesiones activas', isFocused: false, bodyColumns: 30, placement: 'dock', scroll: {} } as never
export const SURFACES = ['terminal', 'desktop'] as const
export const AHORA = new Date(2026, 9, 17, 14, 0, 0).getTime()
export const ID_FIRMA = '20261017-101500-a1b2'
export const RUTA_FIRMA = '~/.claude/canal-interno/consultas/2026-10-17-20261017-101500-a1b2.md'

export const noop: Actions = {
  jump: () => undefined,
  remove: () => undefined,
  openAll: () => undefined,
  clear: () => undefined,
  abrirPareja: () => undefined,
  volverCanal: () => undefined,
  limpiarCanal: () => undefined,
}

export const EMPTY_VIEW: View = { espera: [], trabajando: [], quieta: [] }

const quietRow: Row = { id: 'local_q', title: 'Quieta', group: null, link: null, isAsking: false, isSelf: false, ago: '5 min', summary: null }

/** A pane with one quiet session: the block must come after it. */
export const QUIET_VIEW: View = { espera: [], trabajando: [], quieta: [quietRow] }

export const consulta = (id: string, hilo: string, patch: Partial<ConsultaLeida> = {}): ConsultaLeida => ({
  id,
  hilo,
  de: { nombre: 'Tienda' },
  a: { nombre: 'Mentor' },
  pregunta: `pregunta ${id}`,
  estado: 'respondio',
  iniciada: AHORA,
  terminada: AHORA + 30_000,
  respuesta: `respuesta ${id}`,
  costoUsd: 0.4,
  sirvio: null,
  decisionesPendientes: 0,
  decisionesDeHans: null,
  ...patch,
})

export const pareja = (clave: string, patch: Partial<ParejaVista> = {}): ParejaVista => ({
  clave,
  titulo: 'Tienda → Mentor',
  ultima: `ultima ${clave}`,
  estado: 'respondio',
  hace: '2 min',
  decisiones: 0,
  consultas: [consulta(`id-${clave}`, clave)],
  ...patch,
})

export const CANAL: CanalVista = {
  parejas: [
    pareja('tienda__mentor', {
      ultima: '¿Cómo valido la firma?',
      decisiones: 2,
      consultas: [
        consulta(ID_FIRMA, 'tienda__mentor', {
          pregunta: '¿Cómo valido la firma?',
          respuesta: 'Con la clave pública del emisor.',
          decisionesPendientes: 2,
        }),
      ],
    }),
    pareja('cont__intel', {
      titulo: 'Contabilidad → Inteligencia',
      ultima: 'Qué tabla guarda el IVA',
      estado: 'corriendo',
      hace: 'ahora',
      consultas: [consulta('20261017-110000-c3d4', 'cont__intel', { estado: 'corriendo', respuesta: null, terminada: null })],
    }),
  ],
  abierta: null,
  topeAlcanzado: false,
}

/** The block with only `tienda__mentor`, changed by `patch`. */
export const withPair = (patch: Partial<ParejaVista>): CanalVista => ({ ...CANAL, parejas: [pareja('tienda__mentor', patch)] })
