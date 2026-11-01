# Camino B: `gws`, el CLI del método original

El método «Mano derecha: correo y agenda» de Daniel Santacoloma conecta Google con `gws` (Google Workspace CLI,
repositorio `googleworkspace/cli`, Apache-2.0). Arbrain usa `gog` como vía estándar porque la app, la agenda de
`habit-system` y el modo monje lo hablan, maneja varias cuentas con `--account` y guarda la llave en el llavero.
Este camino es para dos casos:

- El dueño ya conectó su correo con `gws` siguiendo el método original y le funciona. No lo hagas repetir: usa
  `gws` con las mismas reglas de oro de `SKILL.md`.
- `gog` no se puede instalar en su computadora.

Aviso honesto: `gws` vive en la organización de Google, pero su README dice *«This is not an officially supported
Google product»*, está en versión 0.x y avisa que habrá cambios que rompan compatibilidad. Los comandos de abajo
son los que documenta el método original (probados por su autor en agosto de 2026). Si uno falla, consulta su
contrato vivo: `gws schema gmail.users.threads.list` (servicio.recurso.método).

## Conectar (una sola cuenta personal)

1. **Instalar:** `npm install -g @googleworkspace/cli` (necesita Node; ver
   `arbrain/cerebro/manuales/preparar-tu-computadora.md`).
2. **Proyecto de Google Cloud** (gratis; no guarda datos ni ve correos, solo identifica al programa):

   ```bash
   brew install --cask google-cloud-sdk    # o el instalador de su sistema
   gcloud auth login
   gcloud projects create <id-unico> --name="Mi cerebro"
   gcloud config set project <id-unico>
   gws auth setup --project <id-unico>     # enciende las APIs
   ```

3. **La credencial es manual** (Google no deja crearla por comando). Guíalo en la consola, igual que los pasos 3
   y 4 del manual de Google: pantalla de consentimiento *Externo*, **Publicar la app** (si queda en «Prueba», los
   permisos caducan cada 7 días), cliente OAuth tipo *App de escritorio* y descargar el JSON.
4. **Mover** (no copiar) ese JSON a `~/.config/gws/client_secret.json` con permisos `600`. Que el secreto no se
   quede en Descargas. Nunca le pidas que lo pegue en el chat.
5. **Autorizar todo de una vez** (quedarse corto obliga a repetir el flujo con él presente):

   ```bash
   SCOPES="https://www.googleapis.com/auth/gmail.modify,\
   https://www.googleapis.com/auth/gmail.settings.basic,\
   https://www.googleapis.com/auth/calendar,\
   https://www.googleapis.com/auth/drive,\
   https://www.googleapis.com/auth/documents,\
   https://www.googleapis.com/auth/spreadsheets,\
   https://www.googleapis.com/auth/contacts,\
   https://www.googleapis.com/auth/userinfo.email,\
   https://www.googleapis.com/auth/userinfo.profile,openid"
   gws auth login --scopes "$SCOPES"
   ```

   No abre el navegador: imprime una dirección para que él la abra y vea qué cuenta autoriza. Cada intento usa un
   puerto nuevo; la dirección anterior deja de servir. `gmail.modify` no permite borrar para siempre: que siga
   así.
6. **Verificar:** `gws gmail users getProfile --params '{"userId":"me"}'` debe mostrar su correo.

## Equivalencias con la skill

| Para | `gog` (estándar) | `gws` |
|---|---|---|
| Agenda de hoy, todos sus calendarios | `gog calendar events --all --today` | `gws calendar +agenda --today` |
| Mañana, semana | `--tomorrow`, `--week` | `+agenda --tomorrow`, `+agenda --week --format table` |
| No leídos | `gog gmail search 'in:inbox is:unread' --max 20` | `gws gmail +triage --max 20` |
| Leer un mensaje | `gog gmail get <id>` | `gws gmail +read --id <messageId>` (es `--id`, no `--params`) |
| Archivar | `gog gmail archive <id>` | `gws gmail users messages modify --params '{"userId":"me","id":"<id>"}' --json '{"removeLabelIds":["INBOX"]}'` |
| Muchos de golpe | `gog gmail batch modify <ids…> --remove INBOX` | `gws gmail users messages batchModify --params '{"userId":"me"}' --json '{"ids":[…],"removeLabelIds":["INBOX"]}'` (hasta 1,000) |
| Etiquetas | `gog gmail labels list` | `gws gmail users labels list --params '{"userId":"me"}'` |
| Huecos | `gog calendar freebusy --all --from … --to …` | `gws calendar freebusy query --json '{"timeMin":"…","timeMax":"…","items":[{"id":"primary"}]}'` |
| Filtro | `gog gmail settings filters create --from … --add-label … --archive` | `gws gmail users settings filters create --params '{"userId":"me"}' --json '{"criteria":{…},"action":{…}}'` |
| Contacto | `gog contacts create --given … --email …` | `gws people people createContact --json '{"names":[…],"emailAddresses":[…]}'` |
| Borrador con adjunto | `gog --gmail-no-send gmail drafts create … --attach archivo.pdf` | Arma el `.eml` completo (Python, `email.message`) y súbelo: `gws gmail users drafts create --params '{"userId":"me"}' --upload borrador.eml --upload-content-type message/rfc822`. `--upload` solo acepta archivos del directorio actual: haz `cd` a su carpeta. No metas el adjunto en base64 por `--json` |

Formatos: `--format table` para leer, `--format json` para procesar. Paginar: `--page-all` con `--page-limit N`.
**Ojo:** la API topa en 500 resultados por consulta, `+triage` no pagina y `resultSizeEstimate` no es fiable. Para
contar de verdad, pagina y suma; si una ventana devuelve justo 500, subdivídela.

## Si falla

| Ves | Qué hacer |
|---|---|
| Autorizaste un permiso nuevo y lo sigue rechazando | Caché vieja de hasta una hora (falla conocida #780 del repositorio): `rm ~/.config/gws/token_cache.json` |
| `403 access_denied` al autorizar, o caduca cada 7 días | La app volvió a «Prueba». Debe estar **En producción** |
| `403 insufficient scopes` al crear filtros | Falta `gmail.settings.basic`: reautoriza con la lista completa |
| `--upload` dice «outside the current directory» | `cd` a la carpeta del archivo |
| Una búsqueda devuelve exactamente 500 | Es el tope: subdivide la ventana de fechas |
| «Google no verificó esta app» | Normal, la app es suya: Configuración avanzada › continuar |

## Una segunda cuenta

`gws` no tiene `--account`: se aísla por carpeta de configuración.

```bash
GOOGLE_WORKSPACE_CLI_CONFIG_DIR="$HOME/.config/gws-personal" gws <comando>
GOOGLE_WORKSPACE_CLI_CONFIG_DIR="$HOME/.config/gws-trabajo"  gws <comando>
```

El `client_secret.json` es el mismo en ambas. La cuenta que no es dueña del proyecto de Cloud necesita el rol
`roles/serviceusage.serviceUsageConsumer`. **Nunca pidas «delegación de todo el dominio»:** da acceso a los buzones
de todos los usuarios sin su consentimiento.
