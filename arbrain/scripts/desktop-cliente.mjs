#!/usr/bin/env node
/**
 * Build de Arbrain para alumnos (edición cliente), en macOS, Windows o Linux.
 *
 *   npm run desktop:app:cliente               # bundles por defecto del sistema
 *   npm run desktop:app:cliente -- --bundles dmg,app
 *   ARBRAIN_TARGET_TRIPLE=x86_64-apple-darwin npm run desktop:app:cliente -- --target x86_64-apple-darwin
 *
 * - Compila con `ARBRAIN_EDICION=cliente` y `src-tauri/tauri.conf.json` tal cual (identificador ai.arbrain.app, CSP,
 *   Node embebido, daemon y plantilla), sin la configuración de la instalación original encima.
 * - Rutas de la máquina que compila fuera del binario (`--remap-path-prefix`) y símbolos quitados.
 * - Usa su propia carpeta de compilación (`src-tauri/target-cliente`): nunca mezcla artefactos con el build de
 *   Daniel. El resultado queda dentro del repo, p. ej. `src-tauri/target-cliente/release/bundle/macos/Arbrain.app`.
 *   Nunca instala nada en ~/Applications.
 * - Al final revisa cada artefacto con paquete-seguro (sin .env, bases ni llaves).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tauriDir = join(raiz, 'src-tauri')
const targetDir = join(tauriDir, 'target-cliente')

const porDefecto = { darwin: 'app', win32: 'nsis', linux: 'appimage,deb' }[process.platform]
const args = process.argv.slice(2)
const conBundles = args.includes('--bundles') || args.includes('-b')
const tauriArgs = ['build', ...(conBundles ? [] : ['--bundles', porDefecto]), ...args]

// Las rutas absolutas de quien compila (carpeta personal, registro de cargo, repo) quedan en los mensajes de pánico
// del binario: se reescriben a nombres neutros.
const remap = [[process.env.CARGO_HOME || join(homedir(), '.cargo'), '/cargo'], [resolve(raiz, '..'), '/arbrain'], [homedir(), '/home']]
  .map(([de, a]) => `--remap-path-prefix=${de}=${a}`)
const env = {
  ...process.env,
  ARBRAIN_EDICION: 'cliente',
  CARGO_TARGET_DIR: targetDir,
  // CARGO_ENCODED_RUSTFLAGS (separador 0x1f): rutas con espacios (Windows) no se parten.
  CARGO_ENCODED_RUSTFLAGS: [...(process.env.CARGO_ENCODED_RUSTFLAGS ? process.env.CARGO_ENCODED_RUSTFLAGS.split('\x1f') : (process.env.RUSTFLAGS ?? '').split(' ').filter(Boolean)), ...remap].join('\x1f'),
  CARGO_PROFILE_RELEASE_STRIP: 'symbols',
  // La web se construye para producción aunque la terminal tenga otra cosa.
  NODE_ENV: 'production',
}
const tauri = join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri')
console.log(`[cliente] tauri ${tauriArgs.join(' ')}`)
const r = spawnSync(tauri, tauriArgs, { cwd: raiz, env, stdio: 'inherit', shell: process.platform === 'win32' })
if (r.status !== 0) process.exit(r.status ?? 1)

// Revisar todo lo producido: .app, .dmg montado no (es imagen), instaladores (.exe/.msi) por su carpeta de origen,
// AppImage/deb por su árbol de staging. Lo que importa es el contenido que se reparte.
const bundle = join(targetDir, ...(args.includes('--target') ? [args[args.indexOf('--target') + 1]] : []), 'release', 'bundle')
const revisar = []
const app = join(bundle, 'macos', 'Arbrain.app')
if (existsSync(app)) revisar.push(app)
for (const sub of ['appimage', 'deb', 'nsis', 'msi']) {
  const dir = join(bundle, sub)
  if (existsSync(dir)) for (const e of readdirSync(dir)) if (!/\.(AppImage|deb|exe|msi|zip|sig)$/i.test(e)) revisar.push(join(dir, e))
}
// En Windows el instalador comprime el árbol de release; se revisan los recursos que empaqueta.
if (process.platform === 'win32') {
  const rel = join(targetDir, ...(args.includes('--target') ? [args[args.indexOf('--target') + 1]] : []), 'release')
  for (const d of ['next', 'daemon', 'plantilla-cerebro']) if (existsSync(join(rel, d))) revisar.push(join(rel, d))
}
let fallas = 0
for (const destino of revisar) {
  console.log(`[cliente] revisando ${destino}`)
  const v = spawnSync(process.execPath, [join(raiz, 'scripts', 'paquete-seguro.mjs'), destino, '--estricto'], { cwd: raiz, stdio: 'inherit' })
  if (v.status !== 0) fallas++
}
if (!revisar.length) console.warn('[cliente] Aviso: no encontré artefactos que revisar en', bundle)
if (fallas) {
  console.error(`[cliente] ${fallas} artefacto(s) con fugas. No se reparte.`)
  process.exit(1)
}
console.log('[cliente] listo:', revisar.join(', ') || bundle)
