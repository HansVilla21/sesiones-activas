import type { Actions, CanalVista, ConsultaLeida, ParejaVista } from '../types'
import { ANSWER_ROOM } from './config'
import { CARD_EDGE, lookFor, short, titleRoom } from './model'
import type { Look } from './model'
import type { Kit } from './ui'

// The "Entre proyectos" block, in the pane's soft style: a purple pill heads it (its ink a dark shade of the same hue,
// its dots a mid tone) and each pair of projects is a rounded card with the hairline edge of the other blocks.
const PILL = '#EEEDFE'
const INK = '#3C3489'
const ACCENT = '#7F77DD'
const DONE = '#3B6D11'
const FAILED = '#E24B4A'
const NOT_HELPFUL = '#D85A30'
// In the open view the question sits on the gray of Quietas and the answer on the block's own lavender.
const QUESTION_PILL = '#F1EFE8'
const QUESTION_INK = '#444441'
const ANSWER_INK = '#26215C'
// What the column shows of a text: the .md under it has the whole of it.
const QUESTION_ROOM = 800
const NO_QUESTION = '(sin pregunta)'
const LIMIT_NOTICE = 'Tope del día alcanzado: las consultas esperan a mañana'

const MARKS: Record<ParejaVista['estado'], { glyph: string; color: string }> = {
  corriendo: { glyph: '●', color: ACCENT },
  respondio: { glyph: '✓', color: DONE },
  fallo: { glyph: '●', color: FAILED },
  'no-sirvio': { glyph: '●', color: NOT_HELPFUL },
}

const decisionsText = (count: number): string => `${count} ${count === 1 ? 'decisión' : 'decisiones'} para Hans`

// The consulta as canal-interno wrote it for Hans: consultas/<AAAA-MM-DD>-<id>.md, the date taken from the id
// (AAAAMMDD-HHMMSS-xxxx). The column does not know the home folder, so the path starts at "~".
const mdPath = (id: string): string => {
  const safe = id.replace(/[^0-9A-Za-z_-]/g, '-')
  const day = /^(\d{4})(\d{2})(\d{2})-/.exec(safe)

  return `~/.claude/canal-interno/consultas/${day === null ? '' : `${day[1]}-${day[2]}-${day[3]}-`}${safe}.md`
}

// The pair's state on the left of its row: a dot, or a check once answered. It never shrinks.
const markTree = ({ Box, Text }: Kit, pair: ParejaVista) => (
  <Box key={`marca-${pair.clave}`} flexShrink={0}>
    <Text color={MARKS[pair.estado].color}>{MARKS[pair.estado].glyph}</Text>
  </Box>
)

const decisionsTree = ({ Box, Text }: Kit, pair: ParejaVista) =>
  pair.decisiones > 0 && (
    <Box paddingLeft={2}>
      <Text dimColor wrap="truncate-end">{decisionsText(pair.decisiones)}</Text>
    </Box>
  )

// The list's card: the pair dim on top, then its state, its last question (the button that opens the pair, the only
// part that shrinks) and how long ago, kept to the right edge. A narrow column cuts the texts, never the rest.
const cardTree = (kit: Kit, pair: ParejaVista, act: Actions, columns: number | undefined) => {
  const { Box, Text, Button } = kit
  const question = pair.ultima.trim() === '' ? NO_QUESTION : pair.ultima

  return (
    <Box
      key={`tarjeta-${pair.clave}`}
      flexDirection="column"
      borderStyle="round"
      borderColor={CARD_EDGE}
      paddingX={1}
      hover={{ borderColor: ACCENT }}
    >
      <Box overflow="hidden">
        <Text dimColor wrap="truncate-end">{short(pair.titulo, titleRoom(columns, ''))}</Text>
      </Box>
      <Box flexDirection="row" alignItems="center" gap={1}>
        {markTree(kit, pair)}
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Button
            key={`pareja-${pair.clave}`}
            label={short(question, titleRoom(columns, pair.hace))}
            plain
            onPress={() => act.abrirPareja(pair.clave)}
          />
        </Box>
        <Box key={`hace-${pair.clave}`} flexShrink={0}>
          <Text dimColor wrap="truncate-end">{pair.hace}</Text>
        </Box>
      </Box>
      {decisionsTree(kit, pair)}
    </Box>
  )
}

// One consulta of the open pair: its question on gray, its answer on lavender (or a dim word saying why there is
// none), and where the .md with the whole text is.
const consultaTree = ({ Box, Text }: Kit, consulta: ConsultaLeida, look: Look) => {
  const question = consulta.pregunta.trim()
  const answer = (consulta.respuesta ?? '').trim()

  return (
    <Box key={`consulta-${consulta.id}`} flexDirection="column">
      <Box key={`pregunta-${consulta.id}`} backgroundColor={QUESTION_PILL} paddingX={1} {...look.edgeOf(QUESTION_PILL)}>
        <Text color={QUESTION_INK}>{short(question === '' ? NO_QUESTION : question, QUESTION_ROOM)}</Text>
      </Box>
      {answer === '' ? (
        <Text dimColor>{consulta.estado === 'corriendo' ? 'Todavía no hay respuesta.' : 'No llegó a haber respuesta.'}</Text>
      ) : (
        <Box key={`respuesta-${consulta.id}`} backgroundColor={PILL} paddingX={1} {...look.edgeOf(PILL)}>
          <Text color={ANSWER_INK}>{short(answer, ANSWER_ROOM)}</Text>
        </Box>
      )}
      <Text dimColor>{mdPath(consulta.id)}</Text>
    </Box>
  )
}

// The conversation of one pair, in the order it happened.
const openTree = (kit: Kit, pair: ParejaVista, look: Look, columns: number | undefined) => {
  const { Box, Text } = kit

  return (
    <Box key={`abierta-${pair.clave}`} flexDirection="column" gap={1} borderStyle="round" borderColor={CARD_EDGE} paddingX={1}>
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={1}>
          {markTree(kit, pair)}
          <Box flexGrow={1} flexShrink={1} overflow="hidden">
            <Text dimColor wrap="truncate-end">{short(pair.titulo, titleRoom(columns, pair.hace))}</Text>
          </Box>
          <Box flexShrink={0}>
            <Text dimColor wrap="truncate-end">{pair.hace}</Text>
          </Box>
        </Box>
        {decisionsTree(kit, pair)}
      </Box>
      {pair.consultas.map(consulta => consultaTree(kit, consulta, look))}
    </Box>
  )
}

/** The block: the pill with "Limpiar" (or "Volver" when a pair is open), the day's limit if reached, then the cards or the open pair. */
export const canalTree = (kit: Kit, canal: CanalVista, act: Actions, surface: string, columns?: number) => {
  const { Box, Text, Button } = kit
  if (canal.parejas.length === 0) return null

  const look = lookFor(surface)
  const open = canal.parejas.find(pair => pair.clave === canal.abierta)

  return (
    <Box key="canal" flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box key="titulo-canal" backgroundColor={PILL} paddingX={1} {...look.edgeOf(PILL)}>
          <Text bold color={INK} wrap="truncate-end">{`Entre proyectos · ${canal.parejas.length}`}</Text>
        </Box>
        {open === undefined ? (
          <Box key="caja-limpiar-canal" flexShrink={0}>
            <Button key="limpiar-canal" label="Limpiar" plain dimColor onPress={() => act.limpiarCanal()} />
          </Box>
        ) : (
          <Box key="caja-volver-canal" flexShrink={0}>
            <Button key="volver-canal" label="Volver" plain dimColor onPress={() => act.volverCanal()} />
          </Box>
        )}
      </Box>
      {canal.topeAlcanzado && <Text dimColor>{LIMIT_NOTICE}</Text>}
      {open === undefined ? canal.parejas.map(pair => cardTree(kit, pair, act, columns)) : openTree(kit, open, look, columns)}
    </Box>
  )
}
