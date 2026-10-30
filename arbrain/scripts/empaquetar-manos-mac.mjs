#!/usr/bin/env node
/**
 * Las manos de macOS viajan con la app del alumno (Arbrain 0.1.2, computer use en cliente).
 *
 * Compila `server/manos-casa` (Swift) y deja `src-tauri/resources/manos/ArbrainManos.app`, que Tauri copia a
 * `Arbrain.app/Contents/Resources/manos/` (bundle.resources). El adaptador `casa` de la edición cliente la busca ahí
 * (server/src/manos/adaptadores/casa.ts › rutaAppCasa) y la app de escritorio se la pasa al daemon como MANOS_CASA_APP.
 *
 * Diferencias con la de la instalación original (manos-casa/scripts/package.sh, que este script NO usa):
 *   - bundle id propio del alumno (`ai.arbrain.manos.cliente`): sus permisos de Accesibilidad y Grabación de pantalla
 *     nunca se mezclan con los de otra instalación;
 *   - `ArbrainEdicion = cliente` en el Info.plist: socket en la carpeta de datos de la app, token por conexión y sin
 *     `via: hid` (Edicion.swift; red team 3 M-10);
 *   - firma ad-hoc con hardened runtime, como el resto de la app del alumno (sin identidad de nadie). Consecuencia
 *     conocida: macOS ancla el permiso de Accesibilidad al hash del binario y cada versión nueva lo pide otra vez;
 *   - mínimo macOS 14 (el código compila para 14; la instalación original declara 15).
 *
 * En Windows y Linux deja `resources/manos/LEEME.txt` (la carpeta tiene que existir: tauri.conf.json la declara).
 *
 * Uso: node scripts/empaquetar-manos-mac.mjs [--triple aarch64-apple-darwin|x86_64-apple-darwin]
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..')
const fuente = join(raiz, 'server', 'manos-casa')
const destino = join(raiz, 'src-tauri', 'resources', 'manos')
export const BUNDLE_ID_CLIENTE = 'ai.arbrain.manos.cliente'
export const NOMBRE_CLIENTE = 'ArbrainManos'  // el nombre que citan Ajustes y el primer arranque (features/permisos)
const MINIMO_MACOS = '14.0'

const LEEME = `Manos de Arbrain para macOS (ArbrainManos.app). Este instalador es de otro sistema: en Windows las manos son
ManosWindows (se compila la primera vez con el .NET de Windows) y en Linux computer use no existe.
`

/** El Info.plist de la copia del alumno. */
export function infoPlist(version) {
  const texto = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${NOMBRE_CLIENTE}</string>
  <key>CFBundleDisplayName</key><string>${NOMBRE_CLIENTE}</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID_CLIENTE}</string>
  <key>CFBundleVersion</key><string>${texto(version)}</string>
  <key>CFBundleShortVersionString</key><string>${texto(version)}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>ArbrainManos</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>${MINIMO_MACOS}</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>ArbrainEdicion</key><string>cliente</string>
  <key>NSAccessibilityUsageDescription</key><string>Arbrain usa Accesibilidad para leer y operar las apps que le pidas, en segundo plano y sin mover tu cursor. Lo irreversible (enviar, borrar, pagar, publicar) siempre te lo pregunta antes.</string>
  <key>NSScreenCaptureUsageDescription</key><string>Arbrain captura una ventana solo cuando el árbol de accesibilidad no alcanza para leerla.</string>
</dict>
</plist>
`
}

function correr(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

export function empaquetarManosMac({ triple = process.env.ARBRAIN_TARGET_TRIPLE || process.env.TAURI_ENV_TARGET_TRIPLE || '' } = {}) {
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  const esMac = triple ? triple.endsWith('apple-darwin') : process.platform === 'darwin'
  if (!esMac || process.platform !== 'darwin') {
    writeFileSync(join(destino, 'LEEME.txt'), LEEME)
    console.log('[manos] este build no es de macOS: resources/manos lleva solo LEEME.txt')
    return destino
  }
  if (!existsSync(join(fuente, 'Package.swift'))) throw new Error(`[manos] falta ${fuente}/Package.swift (¿la allowlist dejó fuera manos-casa?)`)
  const arch = triple.startsWith('x86_64') ? 'x86_64' : triple.startsWith('aarch64') ? 'arm64' : process.arch === 'x64' ? 'x86_64' : 'arm64'
  // Carpeta de compilación propia (ignorada por git), nunca la .build de manos-casa.
  const scratch = join(raiz, 'src-tauri', 'target-cliente', 'manos-casa', arch)
  console.log(`[manos] swift build -c release (${arch}, macOS ${MINIMO_MACOS}+)`)
  correr('swift', ['build', '-c', 'release', '--package-path', fuente, '--scratch-path', scratch, '--product', 'ManosCasa',
    '-Xswiftc', '-target', '-Xswiftc', `${arch}-apple-macosx${MINIMO_MACOS}`])
  const binario = execFileSync('swift', ['build', '-c', 'release', '--package-path', fuente, '--scratch-path', scratch, '--show-bin-path',
    '-Xswiftc', '-target', '-Xswiftc', `${arch}-apple-macosx${MINIMO_MACOS}`], { encoding: 'utf8' }).trim()
  const exe = join(binario, 'ManosCasa')
  if (!existsSync(exe)) throw new Error(`[manos] swift no dejó ${exe}`)

  const version = JSON.parse(readFileSync(join(raiz, 'src-tauri', 'tauri.conf.json'), 'utf8')).version
  const app = join(destino, 'ArbrainManos.app')
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true })
  cpSync(exe, join(app, 'Contents', 'MacOS', 'ArbrainManos'))
  chmodSync(join(app, 'Contents', 'MacOS', 'ArbrainManos'), 0o755)
  const icono = ['arbrain.icns', 'icon.icns'].map(n => join(fuente, 'assets', n)).find(existsSync)
  if (icono) cpSync(icono, join(app, 'Contents', 'Resources', 'icon.icns'))
  writeFileSync(join(app, 'Contents', 'Info.plist'), infoPlist(version))
  writeFileSync(join(app, 'Contents', 'PkgInfo'), 'APPL????')

  // Ad-hoc + hardened runtime, como Arbrain.app (bundle.macOS.signingIdentity "-"). Sin identidad de nadie.
  correr('codesign', ['--force', '--options', 'runtime', '--timestamp=none', '--sign', '-', app])
  correr('codesign', ['--verify', '--strict', app])
  const plist = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim()
  if (plist !== BUNDLE_ID_CLIENTE) throw new Error(`[manos] bundle id inesperado: ${plist}`)
  console.log(`[manos] listo: ${app} (${BUNDLE_ID_CLIENTE} ${version}, ${arch}, ad-hoc)`)
  return app
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--triple')
  try { empaquetarManosMac(i > 0 ? { triple: process.argv[i + 1] } : {}) } catch (e) { console.error(e.message || e); process.exit(1) }
}
