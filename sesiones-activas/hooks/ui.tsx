import type { ElementTable } from 'claude-code'

import type { Actions, Bucket, CanalVista, Row, View } from '../types'
import { canalTree } from './canal-ui'
import { CARD_EDGE, countRows, groupRows, lookFor, short, titleRoom } from './model'

export type Kit = Pick<ElementTable, 'Box' | 'Text' | 'Button'>

export type { Actions }

type Section = { bucket: Bucket; label: string; pill: string; ink: string; accent: string }

// Soft style: a pastel pill heads each block (waiting amber, working green, idle gray), its ink a dark shade of the
// same hue, its dots a mid tone: fixed colors that read on a light or a dark theme alike.
const SECTIONS: readonly Section[] = [
  { bucket: 'espera', label: 'Te espera', pill: '#FAEEDA', ink: '#633806', accent: '#EF9F27' },
  { bucket: 'trabajando', label: 'Trabajando', pill: '#EAF3DE', ink: '#27500A', accent: '#639922' },
  { bucket: 'quieta', label: 'Quietas', pill: '#F1EFE8', ink: '#444441', accent: '#B4B2A9' },
]
const FINISHED_DOT = '#378ADD'
// The card holding the session you are in: a blue edge and a pale blue pill, the hue of nothing else in the pane.
const HERE_EDGE = '#378ADD'
const HERE_PILL = '#E6F1FB'
const HERE_INK = '#0C447C'
const CHIP_ROOM = 28

// A finished session waits in blue; one asking for something takes its block's amber.
const dotColor = (section: Section, row: Row): string =>
  section.bucket === 'espera' && !row.isAsking ? FINISHED_DOT : section.accent

const groupName = (group: string | null): string => group ?? 'sin grupo'

// One row of a group's card: dot, name, then the time and the remove mark kept to the right edge; a waiting
// session adds one dim line under its name saying what waits for you, and one that answered but still runs background
// work has a half dot and a line saying so. The name is cut to the column's width and
// only it may shrink, so a narrow column never pushes the time or the remove mark out of the card. The card's pill
// already says where you are; in a card shared with other sessions your row says it too.
const rowTree = (kit: Kit, section: Section, row: Row, columns: number | undefined, act: Actions, isShared: boolean) => {
  const { Box, Text, Button } = kit
  const when = `${row.isSelf && isShared ? 'aquí · ' : ''}${row.ago}`

  return (
    <Box key={`fila-${row.id}`} flexDirection="column">
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={dotColor(section, row)}>{row.isBackground === true ? '◐' : '●'}</Text>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Button key={`ir-${row.id}`} label={short(row.title, titleRoom(columns, when))} plain onPress={() => act.jump(row)} />
        </Box>
        <Box key={`hora-${row.id}`} flexShrink={0}>
          <Text dimColor wrap="truncate-end">{when}</Text>
        </Box>
        <Box flexShrink={0}>
          <Button key={`quitar-${row.id}`} label="×" plain dimColor onPress={() => act.remove(row)} />
        </Box>
      </Box>
      {row.summary !== null && (
        <Box paddingLeft={2}>
          <Text dimColor wrap="truncate-end">{row.summary}</Text>
        </Box>
      )}
    </Box>
  )
}

export const paneTree = (kit: Kit, view: View, act: Actions, surface: string, columns?: number, canal?: CanalVista) => {
  const { Box, Text, Button } = kit
  const hasPairs = canal !== undefined && canal.parejas.length > 0
  if (countRows(view) === 0 && !hasPairs) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Escríbele a una sesión y aparece aquí.</Text>
      </Box>
    )
  }

  const look = lookFor(surface)

  return (
    <Box flexDirection="column" gap={1}>
      {SECTIONS.filter(({ bucket }) => view[bucket].length > 0).map(section => (
        <Box key={`seccion-${section.bucket}`} flexDirection="column" gap={1}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Box key={`titulo-${section.bucket}`} backgroundColor={section.pill} paddingX={1} {...look.edgeOf(section.pill)}>
              <Text bold color={section.ink}>{`${section.label} · ${view[section.bucket].length}`}</Text>
            </Box>
            {section.bucket === 'quieta' && (
              <Button key="limpiar-quieta" label="Limpiar" plain dimColor onPress={() => act.clear(view.quieta)} />
            )}
          </Box>
          {groupRows(view[section.bucket]).map(set => {
            const isHere = set.rows.some(row => row.isSelf)

            return (
              <Box
                key={`grupo-${section.bucket}-${groupName(set.group)}`}
                flexDirection="column"
                borderStyle="round"
                borderColor={isHere ? HERE_EDGE : CARD_EDGE}
                paddingX={1}
                hover={{ borderColor: isHere ? HERE_EDGE : section.accent }}
              >
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Box flexShrink={1} overflow="hidden">
                    <Text dimColor wrap="truncate-end">
                      {set.rows.length > 1 ? `${groupName(set.group)} · ${set.rows.length}` : groupName(set.group)}
                    </Text>
                  </Box>
                  {isHere && (
                    <Box key="estas-aqui" flexShrink={0} backgroundColor={HERE_PILL} paddingX={1} {...look.edgeOf(HERE_PILL)}>
                      <Text color={HERE_INK}>estás aquí</Text>
                    </Box>
                  )}
                </Box>
                {set.rows.map(row => rowTree(kit, section, row, columns, act, set.rows.length > 1))}
              </Box>
            )
          })}
        </Box>
      ))}
      {hasPairs && canalTree(kit, canal, act, surface, columns)}
    </Box>
  )
}

export const bandTree = ({ Box, Text, Button }: Kit, view: View, act: Actions) => {
  const waiting = view.espera.filter(row => !row.isSelf).slice(0, 5)

  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
      {waiting.length > 0 && <Text dimColor>Te espera:</Text>}
      {waiting.map(row => (
        <Box key={`chip-${row.id}`} flexDirection="row" alignItems="center" gap={1}>
          <Text color={row.isAsking ? '#EF9F27' : FINISHED_DOT}>●</Text>
          <Button key={`banda-${row.id}`} label={short(row.title, CHIP_ROOM)} onPress={() => act.jump(row)} />
        </Box>
      ))}
      <Button key="ver-todas" label={`Ver todas (${countRows(view)})`} plain dimColor onPress={() => act.openAll()} />
    </Box>
  )
}
