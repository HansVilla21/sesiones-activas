# Sesiones activas

Mod para la app de escritorio de Claude Code. Pone a la derecha una columna con las sesiones en las que estás
trabajando, ordenadas por lo que necesitan de ti, y una franja encima del cuadro de texto con las que te esperan.

Lo hizo Hans Villalobos. Está probado en Windows; en Mac todavía no (ver [Probado en](#probado-en)).

## Cómo instalarlo

Abre la app de escritorio de Claude Code, empieza un chat y escríbele:

> Instálame el mod de este repositorio: https://github.com/HansVilla21/sesiones-activas

Claude sigue los pasos de la sección [Para Claude](#para-claude-cómo-instalarlo). Cuando te lo pida, cierra la app del
todo y ábrela otra vez: el mod se carga al arrancar.

## Qué hace

- **Columna "Sesiones activas"**, con tres bloques:
  - **Te espera:** las sesiones que terminaron o te preguntan algo. Las que te preguntan algo (punto naranja) van
    antes que las que solo terminaron (punto azul), y cada una dice en una línea qué te espera: la pregunta, el
    permiso que pide o cómo cerró su respuesta.
  - **Trabajando:** las que están respondiendo ahora.
  - **Quietas:** las que no necesitan nada. **Limpiar** las saca a todas.
- Las sesiones van en tarjetas por su grupo del sidebar. La tarjeta de la sesión en la que estás tiene el borde azul
  y la pastilla "estás aquí".
- Un clic en una sesión te lleva a ella; la **×** la saca de la lista.
- **Franja encima del cuadro de texto** con las que te esperan y "Ver todas".
- **Aviso** cuando otra sesión termina o te pregunta algo mientras estás en una distinta.

Una sesión entra a la lista cuando le escribes y sale cuando la quitas; si le vuelves a escribir, regresa. Las
archivadas y las que llevan más de 30 días sin movimiento salen solas.

El código trae también un bloque "Entre proyectos" que solo aparece con otro mod de Hans (`canal-interno`), que no
viene en este repositorio. Sin ese mod, el bloque no aparece.

## Qué guarda y dónde

Todo queda en tu computadora, en la carpeta `~/.claude/sesiones-activas/`: un archivo por sesión con su estado y un
registro de errores, `_errores.log`. El mod no usa internet, ni cuentas, ni claves: solo le pregunta a la app qué
sesiones siguen abiertas.

## Para Claude: cómo instalarlo

Estos pasos son para el Claude que hace la instalación. Síguelos en orden y cuéntale a la persona en una línea qué
hiciste en cada uno. No cambies nada más de su configuración: el mod no necesita variables de entorno, claves ni
permisos.

1. **Git.** Corre `git --version`. En Mac, si no está, el sistema ofrece instalar las herramientas de línea de
   comandos: pídele a la persona que acepte y espera a que termine.
2. **El comando de Claude Code.** Corre `command -v claude`.
   - Si no aparece, usa la copia que trae la app de escritorio. En Mac suele estar en
     `~/Library/Application Support/Claude/claude-code/<versión>/<carpeta>/claude` y en Windows en
     `%APPDATA%\Claude\claude-code\<versión>\<carpeta>\claude.exe`. Si hay varias versiones, usa la más alta, con la
     ruta completa entre comillas en los pasos que siguen.
   - Si tampoco la encuentras, salta a [Instalar con clics](#instalar-con-clics).
3. **Agregar este repositorio e instalar el mod:**

   ```bash
   claude plugin marketplace add HansVilla21/sesiones-activas
   claude plugin install sesiones-activas@hans-mods
   ```

   Si el primer comando dice que `hans-mods` ya existe, corre `claude plugin marketplace update hans-mods` y sigue.
4. **Comprobar:** `claude plugin list` tiene que mostrar `sesiones-activas@hans-mods` habilitado.
5. **Reiniciar:** pídele a la persona que cierre la app del todo (en Mac, Cmd+Q; cerrar la ventana no basta) y la
   abra de nuevo. Después del reinicio, la columna "Sesiones activas" se abre sola en la primera sesión.
6. **Revisar que funciona,** ya en la app reiniciada:
   - la persona le escribe a una sesión, y esa sesión aparece en la columna;
   - el archivo `~/.claude/sesiones-activas/_errores.log` no existe o está vacío. Si tiene líneas, muéstraselas a la
     persona y dile que se las mande a Hans.

### Instalar con clics

Si no hay forma de correr el comando: en la app, botón **+** junto al cuadro de texto → **Plugins** → **Add
marketplace**, escribir `HansVilla21/sesiones-activas`, y después instalar **sesiones-activas**. Los nombres de los
botones pueden cambiar entre versiones de la app. Al terminar, reiniciar como en el paso 5.

## Actualizar

Cuando Hans avise que hay una versión nueva, dile a Claude "actualiza el mod de sesiones activas". Los comandos son:

```bash
claude plugin marketplace update hans-mods
claude plugin update sesiones-activas@hans-mods
```

Después hay que reiniciar la app.

## Desinstalar

```bash
claude plugin uninstall sesiones-activas@hans-mods
claude plugin marketplace remove hans-mods
```

Reinicia la app. La carpeta `~/.claude/sesiones-activas/` queda; se puede borrar a mano.

## Probado en

- Windows 10, app de escritorio de Claude Code 2.1.304: funciona y es la que Hans usa a diario.
- Mac: el código tiene su camino para Mac (para abrir una sesión usa el comando `open`), pero todavía no se ha
  probado ahí. Si algo falla, lo primero que hay que mandarle a Hans es el contenido de `_errores.log`.

## Código

El mod está en [`sesiones-activas/`](sesiones-activas/), con su propio [README](sesiones-activas/README.md) y sus
pruebas (`claude plugin test sesiones-activas`).
