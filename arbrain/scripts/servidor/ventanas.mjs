/**
 * Una sola ventana de Arbrain (29 oct 2026, cohorte en Mac: «Tengo Arbrain, uno en blanco y luego ya me abre el otro…
 * y luego me abre uno en Safari»).
 *
 * Tres causas: `servidor.mjs abrir` (y `iniciar` sin --sin-navegador) abría SIEMPRE el navegador aunque la app de
 * escritorio estuviera instalada; abrir la app de nuevo en Windows o Linux crea otra ventana en vez de enfocar la que ya
 * está; y la app 0.1.x (Tauri, `ai.arbrain.app`) puede seguir instalada junto a la nueva y abrir su ventana en blanco.
 *
 * Aquí: decidir app o navegador (puro), abrir o enfocar la app sin duplicarla, y encontrar la app vieja. La app de
 * escritorio se reconoce por `~/.config/arbrain/escritorio.json` (lo escribe `escritorio.mjs instalar`) con su `app`
 * todavía en disco, la misma copia (`repo`) y la misma carpeta de datos que el servidor que pregunta.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** La app de escritorio nueva (`arbrain/escritorio/`). */
export const ID_ESCRITORIO = 'ai.arbrain.escritorio'
/** La app Tauri 0.1.x (`src-tauri/tauri.conf.json › identifier`). */
export const ID_APP_VIEJA = 'ai.arbrain.app'

export const rutaConfigEscritorio = (home) => join(home, '.config', 'arbrain', 'escritorio.json')

const misma = (a, b, plataforma) => {
  const x = resolve(a), y = resolve(b)
  return plataforma === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/**
 * ¿Qué abre el servidor? `{ via: 'app', app }`, `{ via: 'navegador', motivo }` o `{ via: 'nada' }`.
 * La app manda si está instalada para ESTA copia y ESTA carpeta de datos (la que la app usaría: `datos` de su
 * configuración o la de siempre). `--navegador` fuerza el navegador; `--sin-navegador` no abre nada.
 */
export function elegirApertura({ cfg, repo, datos, datosPorDefecto, home, plataforma, existe = (/** @type {string} */ r) => existsSync(r), sinNavegador = false, navegador = false }) {
  if (sinNavegador) return { via: 'nada' }
  if (navegador) return { via: 'navegador', motivo: 'pedido' }
  if (!cfg || typeof cfg.app !== 'string' || !cfg.app || !existe(cfg.app)) return { via: 'navegador', motivo: 'sin-app' }
  // Igual que la app (`servidor.rs › Config::cargar`): sin `repo` usa ~/Arbrain; sin `datos`, la carpeta de siempre.
  const repoApp = typeof cfg.repo === 'string' && cfg.repo.trim() ? cfg.repo.trim() : join(home, 'Arbrain')
  if (!misma(repoApp, repo, plataforma)) return { via: 'navegador', motivo: 'otra-copia' }
  const datosApp = typeof cfg.datos === 'string' && cfg.datos.trim() ? cfg.datos.trim() : datosPorDefecto
  if (!misma(datosApp, datos, plataforma)) return { via: 'navegador', motivo: 'otros-datos' }
  return { via: 'app', app: cfg.app }
}

/** Lee `escritorio.json` (null si no existe o no se puede leer). */
export function leerConfigEscritorio(home) {
  try { return JSON.parse(readFileSync(rutaConfigEscritorio(home), 'utf8')) } catch { return null }
}

/** Cómo se lanza la app. En Mac `open` enfoca la que ya está abierta en vez de crear otra. */
export function comandoApp(plataforma, app) {
  return plataforma === 'darwin' ? ['/usr/bin/open', [app]] : [app, []]
}

const psTexto = (s) => `'${String(s).replaceAll("'", "''")}'`

/**
 * Windows: si ya corre ESE Arbrain.exe (misma ruta), lo trae al frente y responde «enfocada»; si no, «no». El script
 * va en base64 para no pelear con comillas.
 */
export function scriptEnfocarWindows(exe) {
  return `$p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq ${psTexto(exe)}) } | Select-Object -First 1
if ($p) { $null = (New-Object -ComObject WScript.Shell).AppActivate($p.Id); 'enfocada' } else { 'no' }`
}

/** Linux: ¿alguna línea de `ps -eo args` es esa app? (puro, sobre la salida de ps). */
export function corriendoEnLista(lineas, app) {
  return String(lineas).split('\n').some((l) => { const c = l.trim(); return c === app || c.startsWith(`${app} `) })
}

/**
 * Abre la app o, si ya está abierta, la trae al frente sin abrir otra ventana. Devuelve 'abierta', 'enfocada' o
 * 'ya-abierta' (Linux: no hay forma portátil de enfocar; se avisa). `avisar` recibe errores.
 */
export function abrirOEnfocarApp(app, { plataforma = process.platform, avisar = () => {} } = {}) {
  if (plataforma === 'win32') {
    const cod = Buffer.from(scriptEnfocarWindows(app), 'utf16le').toString('base64')
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', cod], { encoding: 'utf8', windowsHide: true })
    if ((r.stdout || '').trim().split(/\r?\n/).pop() === 'enfocada') return 'enfocada'
  } else if (plataforma !== 'darwin') {
    const r = spawnSync('ps', ['-eo', 'args='], { encoding: 'utf8' })
    if (r.status === 0 && corriendoEnLista(r.stdout ?? '', app)) return 'ya-abierta'
  }
  const [cmd, args] = comandoApp(plataforma, app)
  try {
    const h = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, cwd: dirname(app) })
    h.on('error', (e) => avisar(`No pude abrir la app: ${e.message}`))
    h.unref()
  } catch (e) { avisar(`No pude abrir la app: ${e?.message ?? e}`) }
  return 'abierta'
}

// ── La app 0.1.x junto a la nueva ───────────────────────────────────────────────────────────────────────────────

/** Dónde puede estar una app «Arbrain» en cada sistema. */
export function lugaresApp(plataforma, home, env = {}) {
  if (plataforma === 'darwin') return [join('/Applications', 'Arbrain.app'), join(home, 'Applications', 'Arbrain.app')]
  if (plataforma === 'win32') {
    const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    // El instalador de Tauri (NSIS, por usuario) deja la 0.1.x en %LOCALAPPDATA%\Arbrain; la nueva vive en Programs\Arbrain.
    return [join(local, 'Arbrain', 'Arbrain.exe')]
  }
  return []
}

/** El identificador de un .app: de su Info.plist (XML), con `plutil` si el plist es binario. */
export function idDeBundle(app) {
  const plist = join(app, 'Contents', 'Info.plist')
  let texto = ''
  try { texto = readFileSync(plist, 'utf8') } catch { return null }
  const m = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]*)<\/string>/.exec(texto)
  if (m) return m[1].trim()
  const r = spawnSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist], { encoding: 'utf8' })
  return r.status === 0 ? (r.stdout || '').trim() || null : null
}

/**
 * Las apps «Arbrain» que NO son la de escritorio nueva. Mac: cualquier Arbrain.app de los lugares de siempre cuyo
 * identificador no sea `ai.arbrain.escritorio`. Windows: el .exe de la 0.1.x en su carpeta, si no es la app nueva.
 */
export function buscarAppsViejas({ plataforma, home, env = {}, lugares, existe = (/** @type {string} */ r) => existsSync(r), leerId = idDeBundle, appNueva = /** @type {string | null} */ (null) }) {
  const donde = lugares ?? lugaresApp(plataforma, home, env)
  const viejas = []
  for (const ruta of donde) {
    if (!existe(ruta)) continue
    if (appNueva && misma(ruta, appNueva, plataforma)) continue
    if (plataforma === 'darwin') {
      const id = leerId(ruta)
      if (id === ID_ESCRITORIO) continue
      viejas.push({ ruta, id: id || null })
    } else {
      viejas.push({ ruta, id: null })
    }
  }
  return viejas
}

/** Texto del aviso. Empieza igual que el de `escritorio.mjs instalar` para que la skill y el INSTALAR lo reconozcan. */
export function avisoAppVieja(viejas, plataforma) {
  const lista = viejas.map((v) => v.ruta).join(', ')
  if (plataforma === 'win32') {
    return `ya hay otra app «Arbrain» (la 0.1.x) en ${lista}. Puede abrir una ventana de más. Para quitarla: Configuración › Aplicaciones › Arbrain › Desinstalar (sus datos no se tocan).`
  }
  return `ya hay otra app «Arbrain» (la 0.1.x) en ${lista}. Es la que abre una ventana en blanco junto a la nueva. Pregúntale a la persona si la guardo en ~/Arbrain-respaldos (no se borra); si dice que sí, repite con --reemplazar-app-vieja`
}

/** Patrón para `pkill -f` que solo toca procesos de ESE bundle (la ruta escapada para expresión regular). */
export function patronProcesoBundle(app) {
  return `${app.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/Contents/MacOS/`
}

export const nombreRespaldo = (app) => basename(app).replace(/\.app$/, '') + '-anterior.app'
