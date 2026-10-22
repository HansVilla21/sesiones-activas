import type { CanalVista, View } from '../types'

export const PANE = 'sesiones-activas'
export const TITLE = 'Sesiones activas'
export const EMPTY: View = { espera: [], trabajando: [], quieta: [] }
export const EMPTY_CANAL: CanalVista = { parejas: [], abierta: null, topeAlcanzado: false }
export const READ_EVERY_MS = 3_000
export const LIVE_EVERY_MS = 30_000
export const IDENTIFY_EVERY_MS = 10_000
// The app refuses to send a list too large for one answer; 50 recent sessions fit with room to spare.
export const LIVE_LIMIT = 50
export const LOG_LINES = 40
export const ASKING_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode'])

// Right after the app starts, its own tools connect a moment after the mod: those calls are retried, not errors.
export const isStartupRace = (message: string): boolean => message.includes('no connected MCP tool')

// A consulta left 'corriendo' (the app closed on it) stops running after this long: the block shows it as failed.
// The same number as EXPIRA_MS in canal-interno/hooks/config.ts: the two mods must agree on when a consulta is lost.
export const CONSULTA_EXPIRA_MS = 660_000
// The daily limit when canal-interno's proyectos.json is missing, broken or has no valid topeDiarioUsd (its CONFIG_INICIAL).
export const TOPE_DIARIO_USD = 25
// The mark the block's Limpiar button leaves: consultas that started before its `at` leave the block.
export const CANAL_LIMPIADO = 'canal.limpiado'
// What the column shows of an answer (the .md has the whole of it). It is cut when read, so `$.state` never holds more.
export const ANSWER_ROOM = 1_500
