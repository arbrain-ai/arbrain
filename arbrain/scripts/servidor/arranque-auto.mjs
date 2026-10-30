/**
 * Arranque automático opcional del modo servidor (21 oct 2026). Nace apagado; `npm run servidor -- arranque-automatico
 * activar|desactivar|estado` lo cambia. Una unidad por sistema, siempre del usuario (sin administrador):
 *
 *   macOS    ~/Library/LaunchAgents/ai.arbrain.servidor.plist  (launchd; se levanta al iniciar sesión y si se cae)
 *   Linux    ~/.config/systemd/user/arbrain-servidor.service    (systemd --user; Restart=on-failure)
 *   Windows  <Inicio>\Arbrain Servidor.vbs                      (carpeta Inicio del usuario; ventana oculta)
 *
 * Las funciones `unidad*` son puras (texto del archivo): las prueban tests/servidor. `activar`/`desactivar` tocan el
 * disco y el gestor del sistema.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const ETIQUETA_LAUNCHD = 'ai.arbrain.servidor'
export const SERVICIO_SYSTEMD = 'arbrain-servidor.service'
export const ARCHIVO_INICIO_WINDOWS = 'Arbrain Servidor.vbs'

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Dónde vive la unidad en cada sistema. */
export function rutaUnidad(plataforma, home, env = {}) {
  if (plataforma === 'darwin') return join(home, 'Library', 'LaunchAgents', `${ETIQUETA_LAUNCHD}.plist`)
  if (plataforma === 'win32') {
    const appdata = env.APPDATA || join(home, 'AppData', 'Roaming')
    return join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', ARCHIVO_INICIO_WINDOWS)
  }
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'systemd', 'user', SERVICIO_SYSTEMD)
}

/** Comando que arranca el servidor sin abrir el navegador. */
export function comandoArranque({ node, script, datos }) {
  return [node, script, 'iniciar', '--sin-navegador', '--datos', datos]
}

export function unidadLaunchd({ comando, path, log }) {
  const args = comando.map((a) => `    <string>${xml(a)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${ETIQUETA_LAUNCHD}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(path)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`
}

/** systemd: cada argumento entre comillas dobles (escapando `\`, `"`, `%` y `$`). */
export function unidadSystemd({ comando, path }) {
  const q = (a) => `"${String(a).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`
  return `[Unit]
Description=Arbrain (modo servidor)
After=network-online.target

[Service]
Type=simple
ExecStart=${comando.map(q).join(' ')}
Restart=on-failure
RestartSec=30
Environment=${q(`PATH=${path}`)}

[Install]
WantedBy=default.target
`
}

/** Nombre de la unidad de SISTEMA de la nube (servidor Linux sin pantalla; la instala `scripts/instalar/nube.sh`). */
export const SERVICIO_NUBE = 'arbrain.service'

/**
 * systemd de SISTEMA para el servidor en la nube (23 oct 2026, modo espejo N3). A diferencia de la unidad de usuario,
 * arranca con la máquina sin que nadie inicie sesión, corre como un usuario sin root (`User=`) y se levanta siempre que
 * el proceso termine (`Restart=always`: en la nube se apaga con `systemctl stop arbrain`, no con `detener`). Endurecida
 * con lo que no estorba al servidor: sin escalar privilegios, /usr y /etc de solo lectura, /tmp propio, umask 077.
 */
export function unidadSystemdSistema({ comando, path, usuario, home, dir }) {
  const q = (a) => `"${String(a).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(String(usuario))) throw new Error(`usuario no válido para systemd: ${usuario}`)
  for (const r of [home, dir]) if (!String(r).startsWith('/') || /[\n\r%$]/.test(String(r))) throw new Error(`ruta no válida para systemd: ${r}`)
  return `# Arbrain en tu nube (lo escribe arbrain/scripts/instalar/nube.sh; se reescribe en cada instalación).
[Unit]
Description=Arbrain (tu cerebro en la nube)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${usuario}
Group=${usuario}
WorkingDirectory=${dir}
ExecStart=${comando.map(q).join(' ')}
Restart=always
RestartSec=10
Environment=${q(`HOME=${home}`)} ${q(`PATH=${path}`)} "LANG=C.UTF-8" "ARBRAIN_SERVIDOR_NUBE=1"
UMask=0077
NoNewPrivileges=yes
ProtectSystem=full
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`
}

/** Windows: VBScript que lanza el servidor con la ventana oculta (`Run …, 0`). Comillas VBS = `""`. */
export function unidadWindows({ comando }) {
  const linea = comando.map((a) => `"${String(a).replace(/"/g, '""')}"`).join(' ')
  return `' Arbrain (modo servidor): arranque al iniciar sesión. Quitar: npm run servidor -- arranque-automatico desactivar\r
Set sh = CreateObject("WScript.Shell")\r
sh.Run "${linea.replace(/"/g, '""')}", 0, False\r
`
}

const correr = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })

/** Escribe la unidad y la registra. Devuelve { ruta, notas[] }. `simular`: solo devuelve el texto. */
export function activar({ plataforma, home, env, comando, path, log, simular = false, uid = process.getuid?.() }) {
  const ruta = rutaUnidad(plataforma, home, env)
  const texto = plataforma === 'darwin' ? unidadLaunchd({ comando, path, log }) : plataforma === 'win32' ? unidadWindows({ comando }) : unidadSystemd({ comando, path })
  if (simular) return { ruta, texto, notas: ['simulado: no se escribió nada'] }
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, texto, { mode: 0o644 })
  const notas = []
  if (plataforma === 'darwin') {
    correr('launchctl', ['bootout', `gui/${uid}/${ETIQUETA_LAUNCHD}`])
    const r = correr('launchctl', ['bootstrap', `gui/${uid}`, ruta])
    if (r.status !== 0) notas.push(`launchctl bootstrap: ${(r.stderr || r.stdout || '').trim()}`)
  } else if (plataforma === 'linux') {
    const a = correr('systemctl', ['--user', 'daemon-reload'])
    const b = correr('systemctl', ['--user', 'enable', '--now', SERVICIO_SYSTEMD])
    if (a.status !== 0 || b.status !== 0) notas.push(`systemctl --user: ${((a.stderr || '') + (b.stderr || '')).trim() || 'no disponible'}`)
    notas.push('Para que siga encendido aunque cierres sesión: `loginctl enable-linger $USER` (opcional).')
  } else {
    notas.push('Arrancará la próxima vez que inicies sesión en Windows.')
  }
  return { ruta, texto, notas }
}

export function desactivar({ plataforma, home, env, uid = process.getuid?.() }) {
  const ruta = rutaUnidad(plataforma, home, env)
  const notas = []
  if (plataforma === 'darwin') correr('launchctl', ['bootout', `gui/${uid}/${ETIQUETA_LAUNCHD}`])
  if (plataforma === 'linux') {
    const r = correr('systemctl', ['--user', 'disable', '--now', SERVICIO_SYSTEMD])
    if (r.status !== 0 && existsSync(ruta)) notas.push(`systemctl --user: ${(r.stderr || '').trim()}`)
  }
  const habia = existsSync(ruta)
  if (habia) rmSync(ruta, { force: true })
  if (plataforma === 'linux' && habia) correr('systemctl', ['--user', 'daemon-reload'])
  return { ruta, habia, notas }
}

export function estado({ plataforma, home, env }) {
  const ruta = rutaUnidad(plataforma, home, env)
  return { ruta, activo: existsSync(ruta) }
}
