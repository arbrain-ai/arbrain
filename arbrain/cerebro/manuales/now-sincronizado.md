# Tu `now.md` sincronizado con Google Calendar y Todoist

Que la foto de tu día que Levy lee en cada conversación traiga también tu Google Calendar (todas tus cuentas) y tus
tareas de Todoist con fecha, mezcladas con lo que ya tienes en Arbrain. Si ya conectaste Google con `gog` y Todoist
con token, no tienes que hacer nada más: abre Arbrain y en unos segundos aparece.

> **Privacidad:** Arbrain solo **lee** tu calendario y tus tareas; nunca crea, mueve ni borra nada en Google ni en
> Todoist. Las llaves siguen donde las dejaron sus manuales (el llavero de tu computadora o tus variables de
> usuario); Arbrain no las copia a ningún archivo ni las escribe en sus registros. Lo último leído (solo títulos y
> horas, nunca descripciones ni enlaces) se guarda en la carpeta de configuración de Arbrain de tu computadora,
> fuera de tu cerebro y fuera de git, para usarlo si un día Google o Todoist no responden.

## 1. Qué es `now.md`

`.claude/now.md` es la foto de tu momento: tus hitos (meta a 90 días, mes, semana, objetivo del día), lo de hoy, la
semana que viene y tus hábitos. Levy lo lee al empezar cada conversación para no planear encima de tus compromisos.
No se escribe a mano: lo arma la app Arbrain sola, en la computadora que corre tus rutinas, al abrir, cada 20
minutos y cuando cambias tu calendario, tus objetivos o tus hábitos en Arbrain.

De dónde saca cada cosa:

| Sección | Fuente |
|---|---|
| Hitos | tus objetivos (vista Objetivos) y tu meta a 90 días |
| Hoy y Esta semana | el Calendario de Arbrain **y**, si los conectaste, Google Calendar y Todoist |
| Hábitos | tus hábitos de Arbrain |

Una invitación que llega a dos de tus cuentas de Google, o que también copiaste al calendario de Arbrain, sale una
sola vez. Las tareas de Todoist llevan «· Todoist» al final, para que Levy sepa dónde marcarlas.

## 2. Conectar Google Calendar (todas tus cuentas)

1. Sigue la **opción B** de [google-calendar-gmail.md](google-calendar-gmail.md) (`gog` con tu propio proyecto de
   Google). La opción A (conector oficial de claude.ai) no sirve para esto: ese permiso vive en tu cuenta de Claude,
   no en tu computadora.
2. Autoriza con `calendar` cada cuenta que quieras ver (`gog auth add tu-correo@gmail.com --services gmail,calendar`).
   Arbrain lee **todas** las cuentas que `gog` tenga con calendario, y de cada una todos sus calendarios, de hoy a
   siete días. Una cuenta autorizada solo con `gmail` no se lee.
3. Instala `gog` donde dice su manual: Arbrain lo busca en tu PATH, en Homebrew (`/opt/homebrew/bin`,
   `/usr/local/bin` o `/home/linuxbrew/.linuxbrew/bin`), en `~/.local/bin` y, en Windows, en
   `%LOCALAPPDATA%\Programs\gog`.

Arbrain llama a `gog` con `--readonly` y solo con las dos órdenes que necesita (ver cuentas y listar eventos), así
que aunque algo saliera mal, `gog` no podría cambiar tu calendario.

## 3. Conectar Todoist

1. Sigue la **opción B** de [todoist.md](todoist.md) (token personal en el llavero). La opción A (servidor oficial
   en `/mcp`) le sirve a Levy dentro de Claude Code o Codex, pero la app Arbrain no puede usar ese permiso.
2. Arbrain busca el token, en este orden: la variable `TODOIST_API_TOKEN`; en Mac, el llavero con el nombre
   `todoist-api-token`; en Linux, `secret-tool` con `servicio todoist`; en Windows, tu variable de usuario
   `TODOIST_API_TOKEN`. Son exactamente los lugares donde lo deja el manual.
3. Solo entran las tareas **con fecha** (vencidas, de hoy y de los próximos seis días). Las que no tienen fecha se
   quedan en Todoist.

## 4. Que se actualice

Cierra Arbrain y ábrelo otra vez (la app lee Google y Todoist a los pocos segundos de abrir y luego cada 20
minutos). Si lo conectaste con Arbrain abierto, también basta con esperar la siguiente vuelta.

**Para Levy:** no edites `now.md` para «arreglar» un evento: corrige la fuente (Google, Todoist o el calendario de
Arbrain) y espera la vuelta. Nunca le pidas al dueño el token ni que lo pegue en el chat.

## Verificación

1. Abre `.claude/now.md` (o pídele a Levy: «¿qué dice mi now.md de hoy?»).
2. Debajo de la fecha debe aparecer una línea como `> Al día con Google Calendar (2 cuentas) y Todoist.` (dice solo
   lo que conectaste).
3. En «Hoy» y «Esta semana» deben estar tus eventos reales de Google y tus tareas con fecha de Todoist, con «·
   Todoist» al final.
4. Prueba en vivo: crea en Google Calendar un evento de prueba para mañana, espera 20 minutos (o cierra y abre
   Arbrain) y comprueba que aparece en «Esta semana». Bórralo tú después.

Si no conectaste nada, `now.md` sale como siempre, solo con lo de Arbrain, y sin ningún error.

## Si falla

| Ves | Qué hacer |
|---|---|
| `> Google Calendar (tu-correo): tiempo agotado; muestro lo último bueno, del …` | Google no respondió a tiempo (red lenta o caída). Arbrain sigue mostrando lo último que leyó y la fecha te dice de cuándo es. Se arregla solo cuando vuelve la red. |
| `> Google Calendar (tu-correo): no respondió; …` | Esa cuenta falló al leer. Corre `gog auth list --check`: si sale inválida, vuelve a autorizarla (`gog auth add tu-correo --services gmail,calendar --force-consent`). Si te pasa cada semana, tu app de Google sigue en «Prueba»: haz el paso 3.5 de [google-calendar-gmail.md](google-calendar-gmail.md). |
| `> Todoist: llave rechazada; …` | El token ya no sirve (lo regeneraste o lo revocaste). Repite la opción B de [todoist.md](todoist.md) con el token nuevo. |
| No aparece la línea «Al día con Google Calendar» y sí conectaste `gog` | Arbrain no encuentra `gog` o tu cuenta no tiene `calendar`. Revisa `gog --version` y `gog auth list` (la cuenta debe listar `calendar`). En Mac, si al conectar elegiste «Permitir» y no «Permitir siempre» en el llavero, vuelve a autorizar la cuenta y elige «Permitir siempre». En Linux, si `gog` te pide una contraseña de llavero cada vez que lo usas en la terminal, la app no puede escribirla por ti: instala el llavero del escritorio (GNOME Keyring o KWallet) y vuelve a autorizar la cuenta. |
| No aparece «Todoist» y sí tienes el token | Lo guardaste con otro nombre. En Mac, `security find-generic-password -a "$USER" -s todoist-api-token` (sin `-w`) debe mostrar la entrada; en Linux, `secret-tool lookup servicio todoist` no debe salir vacío. Si usaste la opción A, también necesitas la B para esto. |
| `now.md` dejó de cambiar | Si tú o Levy lo editaron a mano, Arbrain ya no lo toca (es tuyo). Bórralo y se vuelve a generar en la siguiente vuelta. |
| Desconectaste una cuenta y sigue saliendo | Sale hasta la siguiente vuelta; en cuanto `gog` ya no la lista, Arbrain olvida lo que tenía guardado de ella. |
