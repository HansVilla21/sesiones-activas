import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Las uniones de `register.tsx` con el motor: lo que la sesión escribe de sí misma y la guardia del proceso hijo. El
// mundo de abajo (archivos, reloj, entorno, app) es de memoria. `$.state` no se puede poner debajo en este motor
// ("no loaded plugin provides $.state"): el bloque del canal se prueba por sus partes en canal.test.ts y canal-leer.test.ts.

const HOME = 'C:/Users/prueba'
const REGISTRO = `${HOME}/.claude/sesiones-activas`
const AHORA = new Date(2026, 9, 17, 14, 0, 0).getTime()
const SESION = { sessionId: 'local_aqui', title: 'Tienda', cwd: 'D:\\Clientes\\Tienda', link: 'claude://claude.ai/epitaxy/local_aqui', isRunning: true }
const ENTRADA = { text: 'sigamos', wait: false, origin: { kind: 'composer' } } as const

// El motor entrega las rutas con `\`: la memoria las guarda con `/`.
const conBarras = (ruta: string): string => ruta.replace(/\\/g, '/')

type Mundo = { archivos: Map<string, string>; escritos: string[]; listados: string[]; llamadasApp: string[]; reloj: ReturnType<typeof mock.clock> }

const armar = (on: On, env: Record<string, string> = {}): Mundo => {
  const reloj = mock.clock(on, { now: AHORA })
  const mundo: Mundo = { archivos: new Map(), escritos: [], listados: [], llamadasApp: [], reloj }
  mock.env(on, { USERPROFILE: HOME, ...env })
  on('session.cwd', () => ({ value: SESION.cwd }))
  on('mcp.call', (_$, e) => {
    mundo.llamadasApp.push(e.tool)
    const texto = e.tool === 'list_sessions' ? '[]' : JSON.stringify(SESION)

    return { value: { isError: false, content: [{ type: 'text' as const, text: texto }] } }
  })
  on('fs.read', (_$, e) => {
    const texto = mundo.archivos.get(conBarras(e.path))

    return texto === undefined ? { deny: `ENOENT: ${e.path}` } : { value: texto }
  })
  on('fs.write', (_$, e) => {
    mundo.escritos.push(conBarras(e.path))
    mundo.archivos.set(conBarras(e.path), e.text)

    return { value: undefined }
  })
  on('fs.list', (_$, e) => {
    const carpeta = conBarras(e.path)
    mundo.listados.push(carpeta)

    return {
      value: [...mundo.archivos.keys()]
        .filter(ruta => ruta.startsWith(`${carpeta}/`) && !ruta.slice(carpeta.length + 1).includes('/'))
        .map(ruta => ({ name: ruta.slice(carpeta.length + 1), kind: 'file' as const, size: 1, mtimeMs: AHORA, isLink: false })),
    }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('classic.Notification', () => ({}))
  on('classic.Stop', () => ({}))

  return mundo
}

const guardado = (mundo: Mundo): Record<string, unknown> => JSON.parse(mundo.archivos.get(`${REGISTRO}/local_aqui.json`) ?? '{}')

test('register: a session writes its own record in the shared folder and reads it back every 3 s', async ($, on) => {
  const mundo = armar(on)

  await $.prompt.submit(ENTRADA)
  expect(mundo.escritos).toContain(`${REGISTRO}/local_aqui.json`)
  const antes = mundo.escritos.length
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'Pide permiso para usar Bash' })
  expect(mundo.escritos.length).toBeGreaterThan(antes)
  await mundo.reloj.advance(3_000)
  expect(mundo.listados).toContain(REGISTRO)
  expect(mundo.llamadasApp).toContain('list_sessions')
})

test('register: a process the canal launched to answer leaves no trace and reads nothing', async ($, on) => {
  const mundo = armar(on, { CANAL_INTERNO_RESPONDE: '1' })

  await $.prompt.submit(ENTRADA)
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'Pide permiso para usar Bash' })
  await mundo.reloj.advance(10_000)
  expect(mundo.escritos).toEqual([])
  expect(mundo.listados).toEqual([])
  expect(mundo.llamadasApp).toEqual([])
})

test('register: a turn that ends with background work running writes it down, and the next prompt clears it', async ($, on) => {
  const mundo = armar(on)

  await $.prompt.submit(ENTRADA)
  const tarea = { id: 't1', type: 'subagent', status: 'running', description: 'Re-revisar lote T1+T2' }
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [tarea] } as never)
  expect(guardado(mundo).tareas).toEqual([{ id: 't1', tipo: 'subagent', nombre: 'Re-revisar lote T1+T2', desde: AHORA }])
  await mundo.reloj.advance(60_000)
  await $.prompt.submit(ENTRADA)
  expect(guardado(mundo).tareas).toBeNull()
  // When each task was first seen outlives the turn: the next turn's end does not start its clock over.
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [tarea] } as never)
  expect(guardado(mundo).tareas).toEqual([{ id: 't1', tipo: 'subagent', nombre: 'Re-revisar lote T1+T2', desde: AHORA }])
})
