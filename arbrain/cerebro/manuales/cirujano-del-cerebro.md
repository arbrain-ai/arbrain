# Cirujano del cerebro: cambiar tu Arbrain sin perder las actualizaciones

Tu Arbrain es tuyo: le puedes poner tu marca, tus colores, tus propias skills y hasta cambiar su código. La forma más
cómoda de hacerlo es el **cirujano del cerebro**: una sesión de Claude Code aparte, abierta en `~/Arbrain`, que solo
se dedica a modificar tu copia mientras tu Levy sigue trabajando contigo en lo de siempre.

Piensa en dos personas en la misma casa: Levy atiende tu negocio; el cirujano remodela la casa. Los dos trabajan en
la misma carpeta, así que el cirujano sigue unas reglas para no estorbar ni romper lo que llega en cada versión nueva.

¿Por qué una sesión aparte y no el chat de la app? Porque el chat de Arbrain te pide un clic cada vez que quiere tocar
skills, `CLAUDE.md` o el código de la app (es una protección). Para una remodelación con muchos cambios, Claude Code
en la terminal es más cómodo, y tu Levy de la app no se distrae.

> **Privacidad:** todo pasa en tu computadora, dentro de `~/Arbrain`. El cirujano no sube nada a ningún lado; tus
> cambios viven en tu rama `mi-arbrain` y solo salen si tú decides respaldarlos en tu propio GitHub.

## Para Levy: cuándo usar este manual

Cuando el dueño diga «quiero cambiarle el nombre/los colores a Arbrain», «quiero mi propia skill», «quiero modificar
el código», «cirujano del cerebro» o pregunte si personalizar le impide actualizar. Explícale lo de abajo en palabras
simples y, si quiere, dale el texto del paso 1 para abrir al cirujano.

## Paso 1. Abre al cirujano

1. Abre una terminal nueva (deja abierta la de Levy).
2. Entra a tu copia y abre Claude Code: `cd ~/Arbrain` y luego `claude`.
3. Dale este primer mensaje:

   > Eres el cirujano de mi Arbrain. Vas a modificar esta copia (marca, colores, skills o código) sin romper las
   > actualizaciones. Lee `arbrain/cerebro/manuales/cirujano-del-cerebro.md` y sigue sus reglas. Lo que quiero
   > cambiar es: …

## Paso 2. Las reglas del cirujano

1. **Siempre en tu rama `mi-arbrain`, nunca en `main`.** `main` es la copia limpia del autor: ahí llegan las versiones
   nuevas. Antes de cambiar algo, comprueba con `git branch --show-current` que dice `mi-arbrain`. Si dice `main`,
   cambia con `git switch mi-arbrain`.
2. **Un cambio, un commit.** Al terminar cada cambio que funciona, guárdalo con un mensaje claro de lo que hiciste:
   `git add -A && git commit -m "Mi marca: nombre Ventas y colores verdes"`. Así sabes qué hiciste y puedes deshacer
   una sola cosa sin perder las demás.
3. **Tus skills con nombre propio.** Ponles un prefijo tuyo, por ejemplo `mi-` o el nombre de tu negocio
   (`.claude/skills/mi-ventas/`, `.claude/skills/acme-propuestas/`). Si el autor publica algún día una skill con el
   mismo nombre que una tuya, chocarían; con prefijo propio eso no pasa.
4. **Primero extiende, después edita.** Antes de tocar un archivo del autor, busca si hay una forma de agregar lo tuyo
   aparte. Estos lugares son 100 % tuyos y una actualización nunca los toca:
   - `CLAUDE.local.md` (en la raíz): tus instrucciones para Levy cuando le hablas desde Claude Code, que lo lee junto
     con `CLAUDE.md`. Pon aquí tus reglas en vez de editar `CLAUDE.md`. Ojo: el chat de la app Arbrain hoy no lo lee;
     una regla que quieras en los dos lados va en tu memoria (`.claude/memory/MEMORY.md`), que se carga en ambos.
   - `.claude/skills/<tu-prefijo>-…/`: tus skills propias.
   - `mi-negocio/`: tus documentos, procesos, clientes y material.
   - `.claude/memory/`, `.claude/plan/` y tu diario: tu memoria y tu plan.
5. **Si tienes que editar algo del autor, cambia lo mínimo.** Cambiar el nombre de la app, un color o una línea de
   código está bien. Reescribir un archivo entero o moverlo de lugar hace que cada actualización choque ahí. Cuanto
   más pequeño el cambio, más fácil se junta con lo nuevo.
6. **Uno a la vez en cada archivo, y nada de actualizar a media cirugía.** Levy y el cirujano comparten la carpeta: no
   les pidas que cambien el mismo archivo al mismo tiempo, y pide «actualiza mi Arbrain» cuando el cirujano ya haya
   hecho su commit.
7. **Nada de llaves en archivos.** Las llaves y contraseñas van en Arbrain › Ajustes, nunca en el código ni en un
   commit.

## Paso 3. Cuando llegue una versión nueva

Dile a Levy (o al cirujano) **«actualiza mi Arbrain»**. Lo que pasa:

1. Guarda todo lo tuyo en un commit, aunque no lo hayas guardado tú, y crea una **rama de respaldo** con la fecha
   (`respaldo/antes-de-actualizar-…`).
2. Comprueba que la versión nueva viene firmada por el autor.
3. Junta lo nuevo del autor con lo tuyo. Si los dos cambiaron cosas distintas (aunque sea en el mismo archivo), se
   junta solo. Si los dos cambiaron **el mismo renglón**, te enseña qué cambió cada uno y te pregunta con cuál te
   quedas. Si una skill tuya se llama igual que una nueva del autor, renombra la tuya a `<nombre>-mia` antes de juntar.
4. Agrega las plantillas nuevas que te falten, sin tocar las tuyas.

## Paso 4. Volver atrás

Si algo de la actualización o de un cambio del cirujano no te gusta:

- **Deshacer un solo cambio:** pídele «deshaz el commit de mis colores». Usa `git revert`, que crea un commit nuevo que
  lo deshace sin borrar historia.
- **Volver a como estaba antes de actualizar:** `git switch respaldo/antes-de-actualizar-<fecha>` te deja ver tu copia
  tal como estaba. Si quieres quedarte ahí, pídele a Levy que lo haga por ti: nada se borra, la rama de respaldo
  sigue existiendo.

## Paso 5. Por qué la primera vez tarda más

Cuando tu copia trae cambios en el código de la app (por ejemplo los colores o el nombre en `arbrain/src/`), Arbrain
ya no puede usar el programa listo que publica el autor para cada versión, porque ese programa no lleva tus cambios.
Entonces **compila tu propia versión** en tu computadora. La primera vez después de cada actualización tarda unos
minutos más; después arranca normal. Las skills, `CLAUDE.local.md`, tu memoria y `mi-negocio/` no son código de la
app: cambiarlos no hace que compile.

## Verificación

Al terminar una sesión de cirujano, comprueba con él:

1. `git branch --show-current` dice `mi-arbrain`.
2. `git status --short` sale vacío (todo quedó en commits).
3. `git log --oneline -5` muestra tus cambios con mensajes que entiendes.
4. Arbrain abre y se ve tu cambio (tu nombre, tus colores, tu skill responde cuando la pides).

## Si falla

- **Arbrain no arranca después de un cambio de código:** pídele al cirujano que revise el último commit y lo deshaga
  con `git revert`. Tu copia vuelve a la versión anterior que sí funcionaba.
- **Hiciste cambios en `main` por error:** dile a Levy «pasé cambios a main por error»; al actualizar los mueve a
  `mi-arbrain` sin perderlos.
- **La actualización chocó y no sabes qué elegir:** no elijas a ciegas. Pide que te muestre las dos versiones del
  renglón y decide; si prefieres pensarlo, pide `git merge --abort` y todo queda como estaba antes de actualizar.
- **Una skill tuya dejó de aparecer:** revisa que su carpeta tenga `SKILL.md` y que el `name:` de arriba coincida con
  el nombre de la carpeta (si se renombró a `-mia`, también el `name:`).
