#!/usr/bin/env node
/**
 * Empaqueta la app de escritorio para esta plataforma (22 oct 2026). Lo corre la CI (`escritorio.yml`) y sirve en local.
 *
 *   node arbrain/escritorio/empaquetar.mjs --version 0.2.7 [--objetivo x86_64-apple-darwin] [--sin-compilar]
 *
 * Deja en `arbrain/escritorio/dist/`:
 *   arbrain-escritorio-v<versión>-<plat>.tar.gz   macOS: Arbrain.app · Windows: Arbrain.exe · Linux: arbrain + ícono
 *   escritorio-<plat>.huella                      `escritorio <plat> <sha256> <bytes>` (va al mensaje de la etiqueta)
 * `<plat>` = `process.platform-process.arch` del binario (darwin-arm64, darwin-x64, win32-x64, linux-x64), el mismo
 * nombre que el programa ya compilado de `scripts/servidor/programa.mjs`.
 * Sin firma de Apple ni de Windows: en macOS, firma ad hoc (`codesign -s -`), la que pide Apple Silicon para ejecutar.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
// VERSION en la raíz de la copia del alumno; en el repo fuente, la de distribucion/.
const VERSIONES = [join(AQUI, '..', '..', 'VERSION'), join(AQUI, '..', 'empaquetado', 'distribucion', 'VERSION')]
const version = opcion('--version') ?? readFileSync(VERSIONES.find((r) => existsSync(r)) ?? VERSIONES[0], 'utf8').trim()
const objetivo = opcion('--objetivo')
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versión inválida: ${version}`)

const ARQ = { 'x86_64': 'x64', aarch64: 'arm64' }
const arq = objetivo ? ARQ[objetivo.split('-')[0]] : process.arch
const plat = `${process.platform}-${arq}`
const WIN = process.platform === 'win32'

function correr(cmd, args, extra = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: AQUI, ...extra })
  if (r.status !== 0) throw new Error(`${cmd} salió con ${r.status ?? r.error?.message}`)
}

if (!argv.includes('--sin-compilar')) {
  correr('cargo', ['build', '--release', '--locked', ...(objetivo ? ['--target', objetivo] : [])])
}
const binario = join(AQUI, 'target', ...(objetivo ? [objetivo] : []), 'release', WIN ? 'arbrain.exe' : 'arbrain')
if (!existsSync(binario)) throw new Error(`no encuentro ${binario}`)

const dist = join(AQUI, 'dist')
const armado = join(dist, `armado-${plat}`)
rmSync(armado, { recursive: true, force: true })
mkdirSync(armado, { recursive: true })

let raiz
if (process.platform === 'darwin') {
  raiz = 'Arbrain.app'
  const c = join(armado, raiz, 'Contents')
  mkdirSync(join(c, 'MacOS'), { recursive: true })
  mkdirSync(join(c, 'Resources'), { recursive: true })
  copyFileSync(binario, join(c, 'MacOS', 'arbrain'))
  chmodSync(join(c, 'MacOS', 'arbrain'), 0o755)
  copyFileSync(join(AQUI, 'iconos', 'icon.icns'), join(c, 'Resources', 'icon.icns'))
  const cargo = readFileSync(join(AQUI, 'Cargo.toml'), 'utf8')
  const versionApp = /^version = "([^"]+)"/m.exec(cargo)[1]
  writeFileSync(join(c, 'Info.plist'), readFileSync(join(AQUI, 'macos', 'Info.plist'), 'utf8').replaceAll('@VERSION@', versionApp))
  writeFileSync(join(c, 'PkgInfo'), 'APPL????')
  correr('codesign', ['--force', '--deep', '--sign', '-', '--identifier', 'ai.arbrain.escritorio', join(armado, raiz)])
  correr('codesign', ['--verify', '--deep', '--strict', join(armado, raiz)])
} else if (WIN) {
  raiz = 'Arbrain.exe'
  copyFileSync(binario, join(armado, raiz))
} else {
  raiz = 'arbrain-escritorio'
  mkdirSync(join(armado, raiz), { recursive: true })
  copyFileSync(binario, join(armado, raiz, 'arbrain'))
  chmodSync(join(armado, raiz, 'arbrain'), 0o755)
  copyFileSync(join(AQUI, 'iconos', '128x128.png'), join(armado, raiz, 'arbrain.png'))
}

const nombre = `arbrain-escritorio-v${version}-${plat}.tar.gz`
const salida = join(dist, nombre)
rmSync(salida, { force: true })
// tar del sistema (bsdtar en macOS y Windows). COPYFILE_DISABLE: sin archivos «._» de atributos extendidos.
const tar = WIN ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
correr(tar, ['-czf', salida, '-C', armado, raiz], { env: { ...process.env, COPYFILE_DISABLE: '1' } })

const datos = readFileSync(salida)
const sha = createHash('sha256').update(datos).digest('hex')
const linea = `escritorio ${plat} ${sha} ${statSync(salida).size}`
writeFileSync(join(dist, `escritorio-${plat}.huella`), linea + '\n')
rmSync(armado, { recursive: true, force: true })
console.log(`\n${nombre}\n${linea}`)
