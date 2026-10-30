# Todoist

Conectar Todoist para que Levy apunte, reagende y cierre tus tareas. Es opcional: sin Todoist, tus tareas viven
como casillas en `.claude/plan/objetivos.md` y funcionan igual. Elige **una** casa para tus tareas, nunca las dos.

> **Privacidad:** con el servidor oficial (opción A) no hay ningún token que guardar: Todoist te pide permiso en el
> navegador. Con el token (opción B) la llave vive en el llavero de tu computadora, fuera de este repo.

## Cuál elegir

**Recomendación: opción A, el servidor oficial de Todoist.** Es de Todoist, entras con tu cuenta en el navegador y
no copias ningún token. Funciona en Claude Code y en Codex, en Mac, Windows y Linux.

La opción B (token personal) queda para scripts o si tu herramienta no acepta servidores en internet.

**App Arbrain:** esta versión de la app todavía no conecta Todoist. Usa Claude Code o Codex en esta misma carpeta:
tus tareas son las mismas.

---

## Opción A: servidor oficial (`https://ai.todoist.net/mcp`)

### Claude Code

```bash
claude mcp add --transport http --scope user todoist https://ai.todoist.net/mcp
```

Después abre Claude Code, escribe `/mcp`, elige **todoist** › **Authenticate**. Se abre el navegador: entra a
Todoist y presiona **Permitir**.

(Alternativa con plugin: dentro de Claude Code, `/plugin marketplace add doist/todoist-mcp` y luego
`/plugin install todoist@doist`.)

Antes de agregarlo, revisa con `/mcp` que no esté ya: agregarlo dos veces causa bucles de inicio de sesión.

### Codex

```bash
codex mcp add todoist --url https://ai.todoist.net/mcp
codex mcp login todoist
```

El segundo comando abre el navegador para que des permiso. Abre una sesión nueva de Codex.

### Verificación (A)

Pídele a Levy: «¿qué tareas tengo para hoy en Todoist?». Debe listar tus tareas reales. Después: «crea la tarea
"Prueba Levy" para mañana» y comprueba que aparece en tu app de Todoist; bórrala tú.

---

## Opción B: token personal

1. En Todoist (web o app de escritorio): **Ajustes › Integraciones › Desarrollador** › copia tu **token de API**.
   Es como una contraseña: no lo pegues en el chat.
2. Guárdalo en el llavero y déjalo disponible como variable `TODOIST_API_TOKEN`:

**Mac** (te pide el token sin mostrarlo; pégalo y Enter):

```bash
security add-generic-password -a "$USER" -s todoist-api-token -w
echo 'export TODOIST_API_TOKEN="$(security find-generic-password -a "$USER" -s todoist-api-token -w 2>/dev/null)"' >> ~/.zshrc
```

**Linux:**

```bash
secret-tool store --label="Todoist" servicio todoist
echo 'export TODOIST_API_TOKEN="$(secret-tool lookup servicio todoist 2>/dev/null)"' >> ~/.bashrc
```

**Windows** (PowerShell; queda como variable de tu usuario, no de todo el equipo):

```powershell
$s = Read-Host "Pega tu token de Todoist" -AsSecureString
$t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
[Environment]::SetEnvironmentVariable("TODOIST_API_TOKEN", $t, "User"); Remove-Variable s, t
```

3. Cierra la terminal y ábrela otra vez. Vuelve a abrir Claude Code o Codex desde esa terminal nueva.

**Para Levy:** usa siempre `$TODOIST_API_TOKEN` (en PowerShell, `$env:TODOIST_API_TOKEN`) dentro del comando; nunca
lo imprimas, nunca lo copies a un archivo y nunca uses `printenv`. Los comandos de la API están en la skill
`habit-system`, referencia `automatizaciones-y-todoist.md`.

**En Codex usa la opción A:** por defecto Codex no pasa a sus comandos las variables cuyo nombre contiene
`TOKEN`, `KEY` o `SECRET`, así que `TODOIST_API_TOKEN` no le llega. No cambies esa protección para esto.

### Verificación (B)

Mac o Linux:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TODOIST_API_TOKEN" https://api.todoist.com/api/v1/projects
```

Windows:

```powershell
(Invoke-WebRequest -Uri https://api.todoist.com/api/v1/projects -Headers @{Authorization="Bearer $env:TODOIST_API_TOKEN"}).StatusCode
```

Debe salir `200`. Si sale `401`, el token no llegó o está mal.

---

## Si falla

| Ves | Qué hacer |
|---|---|
| `/mcp` muestra todoist «failed» o «needs authentication» | Elige todoist › Authenticate otra vez. Si ya lo habías agregado dos veces, quita uno (`claude mcp remove todoist`) y vuelve a empezar. |
| El navegador no abre en el paso de permiso | Copia el enlace que imprime la terminal y ábrelo tú. |
| `401` con la opción B | La terminal no tiene la variable: ábrela de nuevo. En Mac, revisa que el token se guardó (`security find-generic-password -a "$USER" -s todoist-api-token` sin `-w` muestra la entrada sin la llave). |
| Pegaste el token en el chat | Ve a Todoist › Integraciones › Desarrollador › **regenera** el token y repite la opción B con el nuevo. |
| Levy crea tareas que no pediste | No debe: solo crea las que tú le pides. Díselo y lo corrige. |

## Reglas de Levy con Todoist

- Solo crea las tareas que el dueño pide. Lo que detecte lo cuenta y el dueño decide.
- Antes de crear, busca si ya existe. Una tarea vencida se resuelve (hoy, otra fecha o se mata), no se deja
  flotando.
- Borrar una tarea o un proyecto es irreversible: solo con pedido explícito.
