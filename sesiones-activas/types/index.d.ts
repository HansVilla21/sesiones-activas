export type Phase = 'trabajando' | 'pide' | 'termino' | 'quieta'

export type Bucket = 'espera' | 'trabajando' | 'quieta'

/** What one session writes about itself to the shared folder. */
export type SessionRecord = {
  id: string
  title: string | null
  group: string | null
  link: string | null
  cwd: string
  phase: Phase
  phaseAt: number
  activatedAt: number | null
  /** One line on what waits for you: the question asked, or the gist of the last answer. Absent in older files. */
  summary?: string | null
}

/** Marks other sessions leave: when a row was removed and when it was seen. */
export type Marks = {
  removed: Record<string, number>
  seen: Record<string, number>
}

export type Row = {
  id: string
  title: string
  group: string | null
  link: string | null
  isAsking: boolean
  isSelf: boolean
  ago: string
  /** Shown under the name in Te espera only; null elsewhere. */
  summary: string | null
}

export type View = Record<Bucket, Row[]>

/** What the column's buttons do. */
export type Actions = {
  jump: (row: Row) => unknown
  remove: (row: Row) => unknown
  openAll: () => unknown
  clear: (rows: Row[]) => unknown
  /** Opens the conversation of the pair with this key in the "Entre proyectos" block. */
  abrirPareja: (clave: string) => unknown
  /** Back from a pair's conversation to the list of pairs. */
  volverCanal: () => unknown
  /** Takes the pairs shown now out of the block: what began before this moment leaves it. */
  limpiarCanal: () => unknown
}

/** What the "Entre proyectos" block reads of a consulta that `canal-interno` keeps in its registry. */
export type ConsultaLeida = {
  id: string
  hilo: string
  de: { nombre: string }
  a: { nombre: string }
  pregunta: string
  estado: 'corriendo' | 'respondio' | 'fallo'
  iniciada: number
  terminada: number | null
  respuesta: string | null
  costoUsd: number | null
  sirvio: boolean | null
  decisionesPendientes: number
  decisionesDeHans: string | null
}

/** One card of the block: a pair of projects and its consultas of the day, the first question first. */
export type ParejaVista = {
  /** The thread's key, `slug(de)__slug(a)`. */
  clave: string
  /** "<de.nombre> → <a.nombre>". */
  titulo: string
  /** The last question, on one line. */
  ultima: string
  /** `no-sirvio`: the last consulta was answered and its asker rated it as not helpful. */
  estado: 'corriendo' | 'respondio' | 'fallo' | 'no-sirvio'
  hace: string
  /** Decisions that wait for Hans in the pair's consultas, those he has not decided yet. */
  decisiones: number
  consultas: ConsultaLeida[]
}

export type CanalVista = {
  /** The most recent pair first. */
  parejas: ParejaVista[]
  /** The key of the pair whose conversation is open in the column, if any. */
  abierta: string | null
  /** What today cost reached the daily limit: consultas wait for tomorrow. */
  topeAlcanzado: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'sesiones-activas': { view: View; canal: CanalVista }
  }
}
