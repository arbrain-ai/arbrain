#!/usr/bin/env node
/**
 * App de escritorio de Arbrain (22 oct 2026): instala, actualiza y abre la ventana nativa de `arbrain/escritorio/`.
 *
 *   node arbrain/scripts/escritorio.mjs instalar [--sin-abrir] [--forzar] [--reemplazar-app-vieja]
 *   node arbrain/scripts/escritorio.mjs estado
 *   node arbrain/scripts/escritorio.mjs abrir
 *
 * Confianza: igual que el programa ya compilado (`scripts/servidor/programa.mjs`). La etiqueta firmada vX.Y.Z trae en
 * su mensaje una línea `escritorio <plat> <sha256> <bytes>` por plataforma. Aquí se corre `git verify-tag` contra el
 * ancla de la persona (`~/.config/arbrain/firmas-permitidas`, fuera del repo), se baja
 * `arbrain-escritorio-vX.Y.Z-<plat>.tar.gz` del release de `arbrain-ai/arbrain` y solo si la huella y el tamaño
 * coinciden se instala. Sin ancla, sin etiqueta o con algo que no cuadre: no se instala nada (salida 4) y Arbrain
 * sigue en el navegador como siempre.
 *
 * Dónde queda:
 *   macOS    /Applications/Arbrain.app (o ~/Applications si no se puede escribir ahí). Sin Developer ID de Apple: se
 *            le quita la marca de cuarentena SOLO a esta app, ya verificada por la firma del autor.
 *   Windows  %LOCALAPPDATA%\Programs\Arbrain\Arbrain.exe + accesos directos en Inicio y Escritorio (sin administrador).
 *   Linux    ~/.local/share/arbrain-escritorio/ + entrada en el menú de aplicaciones.
 * Y `~/.config/arbrain/escritorio.json` con la carpeta de Arbrain, el Node y el PATH de esta terminal (una app abierta
 * desde el Dock o el menú Inicio no hereda el PATH: sin él no encontraría `node` ni el `claude` de la persona).
 *
 * Salidas: 0 listo · 2 argumentos · 3 hay otra app «Arbrain» (la 0.1.x) y falta --reemplazar-app-vieja · 4 no se
 * pudo verificar o bajar (se sigue con el navegador) · 1 otro error.
 * Opciones de prueba: --archivo <tar.gz> (no baja; la huella sigue saliendo de la etiqueta), --destino <carpeta>,
 * ARBRAIN_ESCRITORIO_BASE (otra dirección de descarga; la huella también sale de la etiqueta).
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, copyFileSync, cpSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirDatosPorDefecto } from './servidor/rutas.mjs'

const ARBRAIN = resolve(fileURLToPath(new URL('..', import.meta.url)))
const REPO = resolve(ARBRAIN, '..')
const REPO_PUBLICO = 'arbrain-ai/arbrain'
const ID = 'ai.arbrain.escritorio'
const SO = process.platform
const WIN = SO === 'win32'
const MAC = SO === 'darwin'
const HOME = homedir()

const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const bandera = (n) => argv.includes(n)
const orden = argv.find((a, i) => !a.startsWith('--') && !['--archivo', '--destino'].includes(argv[i - 1])) ?? 'estado'

const CONFIG = join(HOME, '.config', 'arbrain', 'escritorio.json')
const ANCLA = join(HOME, '.config', 'arbrain', 'firmas-permitidas')
const DATOS = dirDatosPorDefecto(SO, process.env, HOME)
const plat = `${SO}-${process.arch}`

const di = (m) => console.log(`[escritorio] ${m}`)
class Alto extends Error { constructor(m, codigo) { super(m); this.codigo = codigo } }
const leerJson = (r) => { try { return JSON.parse(readFileSync(r, 'utf8')) } catch { return null } }
const fecha = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}` }

// ── Firma y huella ───────────────────────────────────────────────────────────────────────────────────────────────

const git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8', windowsHide: true })

/** En Windows, el ssh-keygen de Git (el de System32 puede no saber `-Y verify`). */
function sshKeygen() {
  if (!WIN) return 'ssh-keygen'
  const exec = git(['--exec-path']).stdout?.trim()
  const candidato = exec && join(exec, '..', '..', '..', 'usr', 'bin', 'ssh-keygen.exe')
  return candidato && existsSync(candidato) ? candidato : 'ssh-keygen'
}

function version() {
  const v = readFileSync(join(REPO, 'VERSION'), 'utf8').trim()
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Alto(`VERSION no es una versión publicada: ${v}`, 4)
  return v
}

/** Huella firmada de esta plataforma para la versión de la copia. */
function huellaFirmada(v) {
  const etiqueta = `v${v}`
  if (!existsSync(ANCLA)) throw new Alto('no hay ancla de firmas en ~/.config/arbrain/firmas-permitidas (la crea INSTALAR, PASO 4)', 4)
  if (git(['rev-parse', '-q', '--verify', `refs/tags/${etiqueta}`]).status !== 0) throw new Alto(`la copia no tiene la etiqueta ${etiqueta}`, 4)
  if (git(['cat-file', '-t', etiqueta]).stdout?.trim() !== 'tag') throw new Alto(`${etiqueta} no es una etiqueta anotada`, 4)
  const r = git(['-c', 'gpg.format=ssh', '-c', `gpg.ssh.program=${sshKeygen()}`, '-c', `gpg.ssh.allowedSignersFile=${ANCLA}`, 'verify-tag', etiqueta])
  if (r.status !== 0) throw new Alto(`la firma de ${etiqueta} no verifica: ${(r.stderr || '').trim().split('\n').pop()}`, 4)
  const mensaje = git(['tag', '-l', '--format=%(contents)', etiqueta]).stdout ?? ''
  for (const l of mensaje.split(/\r?\n/)) {
    const m = /^escritorio ([a-z0-9]+-[a-z0-9]+) ([0-9a-f]{64}) (\d+)$/.exec(l.trim())
    if (m && m[1] === plat) return { etiqueta, sha256: m[2], bytes: Number(m[3]) }
  }
  throw new Alto(`${etiqueta} no trae app de escritorio para ${plat}`, 4)
}

const sha256 = (ruta) => new Promise((ok, mal) => {
  const h = createHash('sha256')
  createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal)
})

async function bajar(url, destino, bytes) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Alto(`la descarga respondió ${res.status} (${url})`, 4)
  const out = createWriteStream(destino)
  let llevo = 0
  try {
    for await (const parte of res.body) {
      llevo += parte.length
      if (llevo > bytes) throw new Alto('llegó más de lo que dice la etiqueta firmada', 4)
      if (!out.write(parte)) await new Promise((ok) => out.once('drain', ok))
    }
  } finally {
    await new Promise((ok) => out.end(ok))
  }
}

function tar() {
  const t = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  return WIN && existsSync(t) ? t : 'tar'
}

function correr(cmd, args, mensaje) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0 && mensaje) throw new Alto(`${mensaje}: ${(r.stderr || r.error?.message || '').trim()}`, 1)
  return r
}

/** Mover entre volúmenes: rename y, si no se puede, copiar y borrar el origen (solo carpetas que creó este script). */
function mover(desde, hacia) {
  mkdirSync(dirname(hacia), { recursive: true })
  try { renameSync(desde, hacia) } catch {
    cpSync(desde, hacia, { recursive: true, verbatimSymlinks: true })
    rmSync(desde, { recursive: true, force: true })
  }
}

// ── Instalación por sistema ──────────────────────────────────────────────────────────────────────────────────────

const escribible = (d) => { try { accessSync(d, constants.W_OK); return true } catch { return false } }

function destinoMac() {
  if (opcion('--destino')) return resolve(opcion('--destino'))
  return escribible('/Applications') ? '/Applications' : join(HOME, 'Applications')
}

const respaldo = () => join(HOME, 'Arbrain-respaldos', fecha())

/** macOS: deja Arbrain.app en su lugar. La app 0.1.x (otro bundle id) no se pisa sin permiso. */
function instalarMac(armado) {
  const dir = destinoMac()
  const app = join(dir, 'Arbrain.app')
  if (existsSync(app)) {
    const id = correr('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', join(app, 'Contents', 'Info.plist')]).stdout?.trim()
    if (id !== ID) {
      if (!bandera('--reemplazar-app-vieja')) throw new Alto(`ya hay otra app «Arbrain» en ${app} (${id || 'sin id'}). Pregúntale a la persona si la guardo en ~/Arbrain-respaldos y pongo la nueva; si dice que sí, repite con --reemplazar-app-vieja`, 3)
      const r = join(respaldo(), 'Arbrain-anterior.app')
      mover(app, r)
      di(`La app anterior quedó guardada en ${r} (sus datos no se tocan).`)
    } else {
      const anterior = join(DATOS, 'escritorio', 'anterior', 'Arbrain.app')
      rmSync(anterior, { recursive: true, force: true })
      mover(app, anterior)
    }
  }
  mover(join(armado, 'Arbrain.app'), app)
  // Sin Developer ID ni notarización, Gatekeeper bloquearía una app marcada en cuarentena. Se la quito SOLO a esta,
  // que ya pasó la firma del autor y la huella. Bajada con fetch no suele traer la marca; esto lo garantiza.
  di('Quito la marca de cuarentena solo a Arbrain.app: Apple no la conoce porque no está notarizada, pero ya comprobé que es la que firmó el autor.')
  spawnSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', app])
  correr('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], 'la firma de la app no es válida')
  return app
}

/** Windows: PowerShell con el script en base64 (sin problemas de comillas). */
function powershell(script) {
  const cod = Buffer.from(script, 'utf16le').toString('base64')
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', cod], { encoding: 'utf8', windowsHide: true })
}
const psTexto = (s) => `'${String(s).replaceAll("'", "''")}'`

function instalarWindows(armado) {
  const base = opcion('--destino') ? resolve(opcion('--destino')) : join(process.env.LOCALAPPDATA || join(HOME, 'AppData', 'Local'), 'Programs', 'Arbrain')
  const exe = join(base, 'Arbrain.exe')
  const inicio = join(process.env.APPDATA || join(HOME, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Arbrain.lnk')
  // ¿Un acceso «Arbrain» de otra app (la 0.1.x)? No se pisa sin permiso.
  if (existsSync(inicio)) {
    const r = powershell(`(New-Object -ComObject WScript.Shell).CreateShortcut(${psTexto(inicio)}).TargetPath`)
    const destino = (r.stdout || '').trim()
    if (destino && resolve(destino).toLowerCase() !== exe.toLowerCase()) {
      if (!bandera('--reemplazar-app-vieja')) throw new Alto(`ya hay otra app «Arbrain» en el menú Inicio (${destino}). Pregúntale a la persona si guardo ese acceso en ~/Arbrain-respaldos y pongo el nuevo; si dice que sí, repite con --reemplazar-app-vieja`, 3)
      const r2 = respaldo()
      mkdirSync(r2, { recursive: true })
      copyFileSync(inicio, join(r2, 'Arbrain-anterior.lnk'))
      di(`El acceso anterior quedó en ${r2} (la app anterior y sus datos no se tocan).`)
    }
  }
  mkdirSync(base, { recursive: true })
  if (existsSync(exe)) {
    // Un .exe abierto no se puede sobrescribir, pero sí renombrar.
    const viejo = join(base, 'Arbrain.anterior.exe')
    try { rmSync(viejo, { force: true }) } catch { /* sigue abierto: se queda */ }
    try { renameSync(exe, viejo) } catch { renameSync(exe, join(base, `Arbrain.anterior-${Date.now()}.exe`)) }
  }
  copyFileSync(join(armado, 'Arbrain.exe'), exe)
  const r = powershell(`
$ErrorActionPreference = 'Stop'
Unblock-File -LiteralPath ${psTexto(exe)} -ErrorAction SilentlyContinue
$s = New-Object -ComObject WScript.Shell
foreach ($l in @(${psTexto(inicio)}, (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Arbrain.lnk'))) {
  $a = $s.CreateShortcut($l); $a.TargetPath = ${psTexto(exe)}; $a.WorkingDirectory = ${psTexto(base)}
  $a.IconLocation = ${psTexto(exe + ',0')}; $a.Description = 'Arbrain'; $a.Save()
}`)
  if (r.status !== 0) di(`Aviso: no pude crear los accesos directos (${(r.stderr || '').trim().split('\n').pop()}). La app está en ${exe}.`)
  return exe
}

function instalarLinux(armado) {
  const base = opcion('--destino') ? resolve(opcion('--destino')) : join(process.env.XDG_DATA_HOME || join(HOME, '.local', 'share'), 'arbrain-escritorio')
  const anterior = `${base}.anterior`
  rmSync(anterior, { recursive: true, force: true })
  if (existsSync(base)) mover(base, anterior)
  mover(join(armado, 'arbrain-escritorio'), base)
  const apps = join(process.env.XDG_DATA_HOME || join(HOME, '.local', 'share'), 'applications')
  mkdirSync(apps, { recursive: true })
  writeFileSync(join(apps, `${ID}.desktop`), [
    '[Desktop Entry]', 'Type=Application', 'Name=Arbrain', 'Comment=Tu cerebro artificial',
    `Exec="${join(base, 'arbrain')}"`, `Icon=${join(base, 'arbrain.png')}`, 'Categories=Office;Utility;', 'Terminal=false',
    `StartupWMClass=arbrain`, '',
  ].join('\n'))
  return join(base, 'arbrain')
}

function abrirApp(ruta) {
  const [cmd, args] = MAC ? ['/usr/bin/open', [ruta]] : [ruta, []]
  const h = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, cwd: dirname(ruta) })
  h.on('error', (e) => di(`No pude abrir la app: ${e.message}`))
  h.unref()
}

// ── Órdenes ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function instalar() {
  const v = version()
  const h = huellaFirmada(v)
  di(`${h.etiqueta} firmada por el autor: la app de escritorio para ${plat} debe medir ${h.bytes} bytes con huella ${h.sha256.slice(0, 16)}…`)
  const cfg = leerJson(CONFIG)
  const yaEsta = cfg?.huella === h.sha256 && cfg?.app && existsSync(cfg.app)
  if (yaEsta && !bandera('--forzar')) {
    di(`La app ya está al día en ${cfg.app}.`)
    guardarConfig(cfg.app, h)
    if (!bandera('--sin-abrir')) abrirApp(cfg.app)
    return
  }
  const trabajo = join(DATOS, 'escritorio', `instalando-${process.pid}`)
  rmSync(trabajo, { recursive: true, force: true })
  mkdirSync(join(trabajo, 'armado'), { recursive: true })
  try {
    const nombre = `arbrain-escritorio-${h.etiqueta}-${plat}.tar.gz`
    let archivo = join(trabajo, nombre)
    if (opcion('--archivo')) archivo = resolve(opcion('--archivo'))
    else {
      const base = process.env.ARBRAIN_ESCRITORIO_BASE?.trim() || `https://github.com/${REPO_PUBLICO}/releases/download/${h.etiqueta}`
      di(`Bajando la app (${(h.bytes / 1e6).toFixed(1)} MB)…`)
      await bajar(`${base.replace(/\/+$/, '')}/${nombre}`, archivo, h.bytes)
    }
    const sha = await sha256(archivo)
    if (sha !== h.sha256 || statSync(archivo).size !== h.bytes) throw new Alto('lo que bajó no coincide con la huella firmada: no instalo nada', 4)
    di('La huella coincide con la etiqueta firmada.')
    correr(tar(), ['-xzf', archivo, '-C', join(trabajo, 'armado')], 'no pude abrir el paquete')
    const app = MAC ? instalarMac(join(trabajo, 'armado')) : WIN ? instalarWindows(join(trabajo, 'armado')) : instalarLinux(join(trabajo, 'armado'))
    guardarConfig(app, h)
    di(`Instalada: ${app}`)
    if (!bandera('--sin-abrir')) { abrirApp(app); di('Abrí Arbrain.') }
  } finally {
    rmSync(trabajo, { recursive: true, force: true })
  }
}

/** El `node` del PATH tal cual (p. ej. /opt/homebrew/bin/node): sobrevive a un `brew upgrade`; execPath es la ruta resuelta. */
function nodeEstable() {
  for (const d of (process.env.PATH ?? '').split(WIN ? ';' : ':')) {
    const n = join(d, WIN ? 'node.exe' : 'node')
    if (d && existsSync(n)) return n
  }
  return process.execPath
}

function guardarConfig(app, h) {
  mkdirSync(dirname(CONFIG), { recursive: true })
  const cfg = {
    repo: REPO, node: nodeEstable(), path: process.env.PATH ?? '', app, plataforma: plat,
    version: h.etiqueta, huella: h.sha256, instalada: new Date().toISOString(),
  }
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 1) + '\n', { mode: 0o600 })
}

async function main() {
  if (orden === 'instalar') return instalar()
  if (orden === 'abrir') {
    const cfg = leerJson(CONFIG)
    if (!cfg?.app || !existsSync(cfg.app)) throw new Alto('la app de escritorio no está instalada: node arbrain/scripts/escritorio.mjs instalar', 1)
    return abrirApp(cfg.app)
  }
  if (orden === 'estado') {
    const cfg = leerJson(CONFIG)
    if (!cfg?.app || !existsSync(cfg.app)) { di('No instalada.'); return }
    let firmada = null
    try { firmada = huellaFirmada(version()) } catch (e) { di(`No pude leer la huella firmada: ${e.message}`) }
    di(`Instalada en ${cfg.app} (${cfg.version}, ${cfg.plataforma}).`)
    if (firmada) di(firmada.sha256 === cfg.huella ? 'Al día con la versión de tu copia.' : `Hay app nueva en ${firmada.etiqueta}: node arbrain/scripts/escritorio.mjs instalar`)
    return
  }
  throw new Alto(`orden desconocida: ${orden}. Usa: instalar, estado, abrir.`, 2)
}

main().catch((e) => {
  console.error(`[escritorio] ${e instanceof Alto ? '' : 'ERROR '}${e.message}`)
  if (e instanceof Alto && e.codigo === 4) console.error('[escritorio] Sigue con el navegador: npm run servidor -- abrir')
  process.exit(e instanceof Alto ? e.codigo : 1)
})
