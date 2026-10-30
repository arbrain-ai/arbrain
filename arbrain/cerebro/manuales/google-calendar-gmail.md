# Google Calendar y Gmail

Conectar tu calendario y tu correo de Google para que Levy lea tu agenda, agende bloques, busque correos y
prepare borradores. Hay dos caminos; abajo está cuál recomiendo y por qué.

> **Privacidad:** con `gog` (opción B) el permiso de Google queda guardado en el llavero de tu computadora y las
> consultas van directo de tu computadora a Google, con tu propio proyecto. Nadie más tiene esa llave. Con el
> conector oficial (opción A) el permiso lo guarda tu cuenta de Claude o de ChatGPT.

## Cuál elegir

| | A. Conector oficial | B. `gog` con tu propio proyecto de Google (recomendada) |
|---|---|---|
| Tiempo | 5 minutos | 25 a 40 minutos, una sola vez |
| Requisito | Claude Pro o Max con sesión de claude.ai, o ChatGPT con Codex | una cuenta de Google y una terminal |
| Funciona en Claude Code | sí (si tu sesión es de claude.ai) | sí |
| Funciona en Codex | Gmail por plugin; calendario según lo que ofrezca `/plugins` | sí |
| Funciona en la app Arbrain | no | sí |
| Funciona con llave de API u OpenRouter | no | sí |
| Varias cuentas de Google | limitado | sí, todas las que quieras |
| Eventos que se repiten (rutina, hábitos) | depende del conector | sí (`--rrule`) |
| Mac, Windows y Linux | sí | sí |

**Recomendación: opción B (`gog`).** Es la vía estándar de este sistema: funciona igual en las tres herramientas
y en los tres sistemas, no depende de qué plan pagues ni de cómo inicias sesión, soporta eventos recurrentes (los
necesita el [modo monje](modo-monje.md)) y tu llave vive en tu llavero. Cuesta media hora una sola vez, y Levy te
guía clic por clic. La opción A sirve si hoy usas Claude Code con Pro o Max y quieres probar en cinco minutos;
puedes empezar ahí y pasar a B después.

---

## Opción A: conector oficial

### Claude Code o la app de escritorio de Claude (necesita Pro o Max con sesión de claude.ai)

1. En <https://claude.ai>, abre Ajustes › Conectores (puede llamarse «Customize › Connectors»).
2. Conecta **Google Calendar** y **Gmail**. Google te muestra su pantalla de permisos: revísala y acepta.
3. Abre Claude Code en la carpeta de tu cerebro. Escribe `/mcp`: deben aparecer como «claude.ai Google
   Calendar» y «claude.ai Gmail».

Límites conocidos: cada conector es una sola cuenta de Google; con sesión por llave de API no aparecen; a veces en
la terminal solo aparecen las herramientas de «autenticar» y no las reales (es un fallo conocido de Claude Code).
Si te pasa, actualiza Claude Code (`claude update`) y, si sigue, usa la opción B.

### Codex

1. Escribe `codex` en la terminal y luego `/plugins`.
2. Busca **Gmail** e instálalo; te pedirá conectar tu cuenta de Google. Busca también **Google Calendar**; si
   aparece, instálalo igual. Si no aparece, el calendario va por la opción B.
3. Abre una sesión nueva de Codex para que cargue el plugin.

Algunos plugins no están disponibles si inicias sesión en Codex con llave de API.

### Verificación (A)

Pídele a Levy: «¿qué tengo mañana en mi calendario?» y «busca mis últimos 3 correos». Debe responder con
eventos y correos reales. Si dice que no tiene herramientas de Google, el conector no cargó.

---

## Opción B: `gog`, con tu propio proyecto de Google Cloud

`gog` es un programa de terminal para Gmail, Calendar, Drive y más. Corre en Mac, Windows y Linux. Lo usas con un
«cliente OAuth» propio: una llave que creas tú en Google Cloud (gratis) y que solo sirve para tu cuenta.

**Para Levy:** guía un paso a la vez. En los pasos de la consola de Google, el dueño hace los clics; tú le dices qué
buscar. Los nombres de los menús de Google cambian a veces: si no ve el botón exacto, pídele que te describa lo que
ve o que te mande una captura. Nunca le pidas que pegue en el chat el contenido del archivo JSON.

### Paso 1. Crear tu proyecto en Google Cloud (5 min)

1. Entra a <https://console.cloud.google.com/projectcreate> con la cuenta de Google que quieres conectar.
   Si es la primera vez, acepta los términos. No hace falta tarjeta de crédito.
2. Nombre del proyecto: `mi-cerebro` (o el que quieras). «Crear».
3. Arriba a la izquierda, comprueba que el proyecto seleccionado es `mi-cerebro`.

### Paso 2. Encender las APIs de Gmail y Calendar (2 min)

1. Abre <https://console.cloud.google.com/apis/library/gmail.googleapis.com> y presiona **Habilitar**.
2. Abre <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com> y presiona **Habilitar**.

### Paso 3. Pantalla de consentimiento (5 min)

1. Abre <https://console.cloud.google.com/auth/branding> (Google Auth Platform). Si dice «Comenzar» o «Get
   started», presiónalo.
2. **Nombre de la app:** `Mi cerebro`. **Correo de asistencia:** el tuyo.
3. **Público (Audience):** **Externo** (External). Con una cuenta `@gmail.com` es la única opción. Si tu cuenta es
   de Google Workspace de tu empresa, puedes elegir **Interno** y te saltas el paso 3.5.
4. **Información de contacto:** tu correo. Acepta la política y «Crear».
5. **Publicar (importante):** abre <https://console.cloud.google.com/auth/audience> y presiona **Publicar app**
   (Publish app) › **Confirmar**. Queda «En producción». Esto **no** manda tu app a revisión de Google; solo evita
   que el permiso caduque cada 7 días (eso pasa si la dejas en «Prueba»).

### Paso 4. Crear el cliente OAuth y descargar el archivo (3 min)

1. Abre <https://console.cloud.google.com/auth/clients> y presiona **Crear cliente**.
2. **Tipo de aplicación:** **App de escritorio** (Desktop app). Nombre: `gog`. «Crear».
3. Presiona **Descargar JSON**. Queda en tu carpeta de Descargas con un nombre como `client_secret_….json`.
   Ese archivo es tuyo: no lo subas a ningún lado ni lo pegues en el chat.

### Paso 5. Instalar `gog` (5 min)

**Mac:**

```bash
brew install openclaw/tap/gogcli
```

**Linux:** con Homebrew, el mismo comando. Sin Homebrew: descarga `gogcli_<versión>_linux_amd64.tar.gz` (o
`arm64`) de <https://github.com/openclaw/gogcli/releases>, descomprime y mueve `gog` a `~/.local/bin/`.

**Windows:**

1. Descarga `gogcli_<versión>_windows_amd64.zip` de <https://github.com/openclaw/gogcli/releases>
   (`windows_arm64` si tu equipo es ARM, como algunos Surface).
2. Descomprime y deja `gog.exe` en una carpeta fija, por ejemplo `%LOCALAPPDATA%\Programs\gog`.
3. Agrégala al PATH de tu usuario (en PowerShell):

   ```powershell
   $d = "$env:LOCALAPPDATA\Programs\gog"
   [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";$d", "User")
   ```

4. Cierra PowerShell y ábrelo de nuevo.

Comprueba: `gog --version`.

### Paso 6. Darle a `gog` tu archivo y tu cuenta (5 min)

1. Registra el archivo que descargaste (cambia la ruta si tu archivo tiene otro nombre):

   ```bash
   gog auth credentials set ~/Downloads/client_secret_*.json
   ```

   En Windows: `gog auth credentials set "$env:USERPROFILE\Downloads\client_secret_XXXX.json"` (con el nombre
   real del archivo). `gog` guarda su propia copia protegida; después puedes mandar el archivo de Descargas a la
   papelera.

2. Autoriza tu cuenta solo con calendario y correo:

   ```bash
   gog auth add tu-correo@gmail.com --services gmail,calendar
   ```

   Se abre tu navegador. Google mostrará **«Google no verificó esta app»**: es normal, la app es tuya (la creaste
   en el paso 3). Presiona **Configuración avanzada** › **Ir a Mi cerebro** y acepta los permisos.
   En Mac, la primera vez el sistema pregunta si `gog` puede usar tu llavero: elige **Permitir siempre**.

3. Haz de esa cuenta la de por defecto: `gog auth manage` y «Set default» junto a tu cuenta. (Con varias
   cuentas, repite el paso 2 con cada una; Levy usará siempre `--account`.)

### Verificación (B)

```bash
gog auth list --check
gog calendar events primary --today --json
gog gmail search 'newer_than:2d' --max 3 --json
```

Debe salir tu cuenta como válida, tus eventos de hoy (o una lista vacía si no tienes) y tus últimos correos.
Levy: corre las tres, dile al dueño qué salió y anota en su memoria qué cuenta quedó conectada y con qué servicios.

### Cómo trabaja Levy con `gog`

- Siempre `--account <correo>`, `--json` y `--no-input`. Antes de crear, lee la agenda del período para no
  encimar eventos.
- **Correo:** buscar y leer sí; enviar **solo** con pedido explícito del dueño, con sus palabras. Por defecto Levy
  agrega `--gmail-no-send`. Nunca borrar correos: archivar quita la etiqueta `INBOX`.
- **Crear un evento:**

  ```bash
  gog calendar create primary --account tu-correo@gmail.com \
    --summary "Bloque profundo" --from 2026-10-20T09:00:00 --to 2026-10-20T11:00:00 \
    --timezone America/Bogota --description "[levy]" --json
  ```

  Cambia `America/Bogota` por la zona del dueño (pregúntala una vez y guárdala en su memoria). La etiqueta `[levy]` en la
  descripción distingue lo que agendó Levy de lo que el dueño creó a mano.
- **Evento que se repite** (la rutina del modo monje): agrega `--rrule 'RRULE:FREQ=DAILY'` o
  `--rrule 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'`. La línea lleva el prefijo `RRULE:`.
- Mover o borrar un evento existente: confirmar con el dueño antes.

**Según la herramienta:**

- **Claude Code:** corre `gog` con Bash. Si usas el sandbox de Claude Code, `gog` necesita red: aprueba el
  permiso cuando lo pida.
- **Codex:** su sandbox apaga la red por defecto; Codex pedirá correr `gog` fuera del sandbox. Apruébalo.
- **App Arbrain:** cada comando `gog` aparece con su texto completo y pide tu clic. En Mac, si responde «command
  not found», Levy usa la ruta completa (`/opt/homebrew/bin/gog` o `/usr/local/bin/gog`).

### Si falla

| Ves | Qué hacer |
|---|---|
| `Error 403: access_denied` en el navegador | La app quedó en «Prueba» y tu correo no está como usuario de prueba. Haz el paso 3.5 (Publicar) o agrega tu correo en Audience › Usuarios de prueba. |
| «Google no verificó esta app» y no ves cómo seguir | Presiona «Configuración avanzada» (abajo a la izquierda) › «Ir a Mi cerebro (no seguro)». Es tu propia app. |
| `invalid_grant` o te pide volver a autorizar cada semana | La app sigue en «Prueba». Publícala (paso 3.5) y corre otra vez `gog auth add tu-correo@gmail.com --services gmail,calendar --force-consent`. |
| `API has not been used in project … or it is disabled` | Falta habilitar la API (paso 2), en el mismo proyecto del cliente. Espera un minuto y repite. |
| El navegador no abre o estás en una máquina sin pantalla | `gog auth add tu-correo@gmail.com --services gmail,calendar --manual`: imprime un enlace; ábrelo en cualquier navegador y pega de vuelta la dirección a la que te manda. |
| Mac pregunta por el llavero a cada rato | Elige «Permitir siempre» (no «Permitir»). |
| `gog` no se encuentra | Cierra y abre la terminal. En Windows, revisa el PATH (paso 5). En la app Arbrain de Mac, ruta completa. |
| Cualquier otra cosa | `gog auth doctor --check` y léele al dueño lo que dice; casi siempre indica el paso que falta. |
