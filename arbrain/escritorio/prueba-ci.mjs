#!/usr/bin/env node
/**
 * Prueba de punta a punta de la app de escritorio en un runner limpio (CI, `escritorio.yml`). Nunca en una máquina de
 * uso diario: crea un ancla de firmas, re-etiqueta la copia y abre ventanas.
 *
 *   node arbrain/escritorio/prueba-ci.mjs --paquete <tar.gz> --huella <archivo .huella> --salida <carpeta>
 *
 * 1. Ancla y etiqueta de PRUEBA: una llave ed25519 efímera firma localmente vX.Y.Z con la línea `escritorio …` del
 *    paquete recién construido (la de verdad la firma publicar-version.sh con la llave del autor). Así se ejercita el
 *    mismo `git verify-tag` + huella que vive la persona.
 * 2. `scripts/escritorio.mjs instalar --archivo <paquete>`: instala y abre la app SIN servidor corriendo: la app tiene
 *    que encenderlo sola (primera vez: instala dependencias y compila).
 * 3. Espera «Corriendo» y captura. Después, como al actualizar: apaga el servidor, comprueba que la app espera sin
 *    encenderlo, lo vuelve a encender en segundo plano y comprueba que la app entra sola. Capturas y tiempos.json.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirDatosPorDefecto } from '../scripts/servidor/rutas.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ARBRAIN = resolve(AQUI, '..')
const REPO = resolve(ARBRAIN, '..')
const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const paquete = resolve(opcion('--paquete'))
const huella = readFileSync(resolve(opcion('--huella')), 'utf8').trim()
const salida = resolve(opcion('--salida'))
mkdirSync(salida, { recursive: true })
const SO = process.platform
const inicio = Date.now()
const seg = () => Math.round((Date.now() - inicio) / 1000)
const tiempos = {}
const di = (m) => { const l = `[prueba +${seg()}s] ${m}`; console.log(l); appendFileSync(join(salida, 'prueba.log'), l + '\n') }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function correr(cmd, args, { cwd = REPO, permitirFallo = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0 && !permitirFallo) throw new Error(`${cmd} ${args.join(' ')} → ${r.status}\n${r.stdout}\n${r.stderr}`)
  return r
}

function captura(nombre) {
  const f = join(salida, nombre)
  if (SO === 'darwin') correr('screencapture', ['-x', f], { permitirFallo: true })
  else if (SO === 'win32') {
    const ps = `Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save('${f.replaceAll("'", "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`
    correr('powershell.exe', ['-NoProfile', '-Command', ps], { permitirFallo: true })
  } else correr('import', ['-window', 'root', f], { permitirFallo: true })
  di(`captura ${nombre}${existsSync(f) ? '' : ' (no se pudo)'}`)
}

function appViva() {
  if (SO === 'win32') return /Arbrain\.exe/i.test(correr('tasklist', ['/FI', 'IMAGENAME eq Arbrain.exe'], { permitirFallo: true }).stdout)
  return correr('pgrep', ['-f', SO === 'darwin' ? 'Arbrain.app/Contents/MacOS/arbrain' : 'arbrain-escritorio/arbrain'], { permitirFallo: true }).status === 0
}

const estado = () => correr(process.execPath, ['scripts/servidor.mjs', 'estado'], { cwd: ARBRAIN, permitirFallo: true }).stdout ?? ''
async function esperarCorriendo(plazoMin, etiqueta) {
  const fin = Date.now() + plazoMin * 60_000
  let ultimo = 0
  while (Date.now() < fin) {
    const e = estado()
    if (/Corriendo/.test(e)) { di(`${etiqueta}: ${e.trim().split('\n')[0]}`); return true }
    if (Date.now() - ultimo > 60_000) { di(`${etiqueta}: esperando… ${e.trim().split('\n')[0] ?? ''}`); ultimo = Date.now() }
    if (!appViva()) di('AVISO: la app no está corriendo')
    await dormir(5000)
  }
  return false
}

async function main() {
  const version = readFileSync(join(REPO, 'VERSION'), 'utf8').trim()
  // 1. Ancla y etiqueta de prueba.
  const ancla = join(homedir(), '.config', 'arbrain', 'firmas-permitidas')
  if (existsSync(ancla)) throw new Error(`${ancla} ya existe: esta prueba solo corre en un runner limpio`)
  const llaves = mkdtempSync(join(tmpdir(), 'llave-prueba-'))
  const k = join(llaves, 'k')
  correr('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'prueba-ci', '-f', k])
  mkdirSync(dirname(ancla), { recursive: true })
  writeFileSync(ancla, `prueba-ci namespaces="git" ${readFileSync(`${k}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ')}\n`)
  correr('git', ['-c', 'user.name=prueba', '-c', 'user.email=prueba@ci', '-c', 'gpg.format=ssh', '-c', `user.signingkey=${k}`,
    'tag', '-f', '-s', `v${version}`, '-m', `Arbrain v${version} (PRUEBA de CI, llave efímera)\n\n${huella}`])
  di(`etiqueta de prueba v${version} con «${huella}»`)

  // 2. Instalar y abrir sin servidor.
  const r = correr(process.execPath, ['scripts/escritorio.mjs', 'instalar', '--archivo', paquete], { cwd: ARBRAIN })
  di(r.stdout.trim())
  tiempos.instalada_s = seg()
  await dormir(8000)
  captura('01-app-encendiendo.png')
  if (!appViva()) throw new Error('la app no quedó abierta')

  // 3. La app enciende el servidor sola.
  if (!(await esperarCorriendo(40, 'primer arranque'))) throw new Error('el servidor no llegó a «Corriendo» en 40 min')
  tiempos.primer_arranque_s = seg() - tiempos.instalada_s
  const datosLog = estado()
  di(datosLog.trim())
  await dormir(25_000)
  captura('02-app-con-arbrain.png')
  if (!appViva()) throw new Error('la app se cerró')

  // 4. Como al actualizar: se apaga el servidor y la app espera SIN encenderlo (no arranca código a media
  //    integración); el servidor vuelve en segundo plano, como lo hace la skill, y la app entra sola.
  di(correr(process.execPath, ['scripts/servidor.mjs', 'detener'], { cwd: ARBRAIN, permitirFallo: true }).stdout.trim())
  await dormir(30_000)
  captura('03-app-esperando.png')
  if (!appViva()) throw new Error('la app se cerró al apagarse el servidor')
  if (/Corriendo/.test(estado())) throw new Error('la app encendió el servidor sola durante la «actualización»')
  const t0 = seg()
  spawn(process.execPath, ['scripts/servidor.mjs', '--sin-navegador'], { cwd: ARBRAIN, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  if (!(await esperarCorriendo(8, 'vuelta del servidor'))) throw new Error('el servidor no volvió en 8 min')
  tiempos.vuelta_s = seg() - t0
  await dormir(15_000)
  captura('04-app-de-vuelta.png')
  if (!appViva()) throw new Error('la app se cerró tras la vuelta del servidor')
  di('PRUEBA OK')
}

main()
  .catch((e) => { di(`PRUEBA FALLO: ${e.message}`); captura('99-fallo.png'); process.exitCode = 1 })
  .finally(() => {
    writeFileSync(join(salida, 'tiempos.json'), JSON.stringify({ ...tiempos, total_s: seg() }, null, 1) + '\n')
    const logs = join(dirDatosPorDefecto(SO, process.env, homedir()), 'logs')
    if (existsSync(logs)) cpSync(logs, join(salida, 'logs'), { recursive: true })
  })
