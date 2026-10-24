# Sesiones activas

Mod de Claude Code (app de escritorio) que junta las sesiones en las que estás trabajando, ordenadas por lo que
necesitan de ti.

- **Columna "Sesiones activas"** a la derecha: Te espera, Trabajando y Quietas, cada bloque con su pastilla de color y
  las sesiones agrupadas en tarjetas por su grupo del sidebar. Un clic en una sesión te lleva a ella; la × la saca de
  la lista y **Limpiar** saca todas las quietas.
- **Franja encima del cuadro de texto** con las sesiones que te esperan y "Ver todas".
- **Aviso** cuando otra sesión termina o te pregunta algo mientras estás en una distinta.
- Dentro de "Te espera", lo que te pregunta algo (naranja) va antes de lo que solo terminó (azul).
- Cada sesión en "Te espera" muestra una línea con lo que te espera: la pregunta que te hace, el permiso que pide o,
  si terminó, la pregunta con la que cierra su respuesta (o su primera frase).
- **Tareas en segundo plano** (desde la 0.6.0): una sesión que ya te respondió pero sigue con tareas en segundo plano
  (un agente, un comando o un workflow corriendo) queda en "Trabajando" con el punto a medias (◐) y la línea "Te
  respondió · sigue con 1 tarea: <nombre>" (o "con N tareas"). Pasa a "Te espera", con su aviso, cuando las tareas
  terminan y la sesión cierra su respuesta.
- **Entre proyectos** (desde la 0.5.0): un bloque morado después de Quietas con las consultas que un proyecto le hizo a
  otro por el mod `canal-interno`. Ver abajo.

## Entre proyectos

El bloque solo aparece cuando hay consultas del día o en curso. Hace falta tener instalado `canal-interno`, que es el
que las hace y las guarda en `~/.claude/canal-interno/`; esta columna solo las lee.

- Una tarjeta por pareja ("Tienda → Mentor") con la última pregunta y hace cuánto fue.
- El punto de la tarjeta dice cómo va: morado mientras responde, ✓ verde si respondió, rojo si falló y coral si quien
  preguntó marcó que la respuesta no le sirvió.
- Si la pareja deja decisiones tuyas por tomar, la tarjeta dice "N decisiones para Hans".
- Un clic abre en la misma columna la conversación de esa pareja: cada pregunta con su respuesta y la ruta del archivo
  `.md` con el texto completo. **Volver** regresa a la lista.
- **Limpiar** saca de la columna las parejas que ya terminaron; sus archivos siguen en el registro.
- Con el tope del día alcanzado (el `topeDiarioUsd` de `proyectos.json`), el bloque lo avisa.
- No hay franja sobre el cuadro de texto ni avisos emergentes para estas consultas.

Las consultas no aparecen como sesiones: el proyecto que responde se abre sin ventana y no entra a la lista.

## Reglas

- Una sesión entra a la lista cuando le escribes y sale cuando la quitas; si le vuelves a escribir, regresa.
- Las archivadas y las que llevan más de 30 días sin movimiento salen solas.
- Lo que te espera sobrevive a un reinicio; lo que estaba trabajando se da por cortado.
- Las tareas en segundo plano salen de lo que la app le pasa al mod al final de cada respuesta (`background_tasks` del
  evento `Stop`); las programadas para más tarde no cuentan, y tampoco la vigilancia de una página publicada (la app
  la deja escuchando comentarios por días: tipo `artifact-auto-react`, "live updates for artifact …"). Si pasan 3 horas sin noticias (la app se cerró y las
  tareas se cortaron, por ejemplo), la sesión se da por terminada y pasa a "Te espera".

## Cómo funciona

Cada sesión escribe su propio estado en `~/.claude/sesiones-activas/<id>.json`. Las marcas de "sacada de la lista" y
"ya la viste" van en archivos `<id>.removed` y `<id>.seen`, así ninguna sesión pisa el archivo de otra. Cada sesión lee
esa carpeta cada 3 segundos y le pregunta a la app cada 30 qué sesiones siguen vivas (las 50 más recientes; las más
antiguas que sigan en la lista se consultan una por una). Los errores se anotan en `_errores.log` en esa carpeta.

El bloque "Entre proyectos" sale de otra carpeta: cada 3 segundos la sesión lee las consultas de hoy y de ayer en
`~/.claude/canal-interno/consultas/` (solo las lee, nunca las escribe). Una consulta que quedó "en curso" más de 11
minutos se muestra como fallida, porque la app se cerró sobre ella. La marca de "Limpiar" se guarda en la propia carpeta
`~/.claude/sesiones-activas/`.

## Desarrollo

- Validar: `claude plugin validate .`
- Tests: `claude plugin test .`
- Tipos: `tsc -p .` (los tipos los escribe el motor en `.claude-plugin/types/` al cargar el mod)
- Publicar un cambio: subir `version` en `.claude-plugin/plugin.json`, `claude plugin update sesiones-activas@mods-hans`
  y reiniciar la app. Instalado desde el repositorio público `HansVilla21/sesiones-activas`, la tienda se llama
  `hans-mods`: `claude plugin marketplace update hans-mods` y `claude plugin update sesiones-activas@hans-mods`.
