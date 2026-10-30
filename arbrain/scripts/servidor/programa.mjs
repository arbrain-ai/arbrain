/**
 * Programa ya compilado del modo servidor (22 oct 2026, prueba de Windows de Daniel: «compilar tardó demasiado»).
 *
 * Cada versión publica, por plataforma, un `arbrain-programa-vX.Y.Z-<so>-<arq>.tar.gz` adjunto a su release con:
 *   web/      la web en edición cliente ya compilada (.next/standalone con static y public)
 *   daemon/   el daemon ya compilado con sus node_modules nativos de esa plataforma
 *   node/     el Node fijado en scripts/node-embebido.json (el mismo ABI con el que se armaron los nativos)
 *   programa.json
 *
 * Confianza: las huellas SHA-256 de esos archivos viajan DENTRO del mensaje de la etiqueta firmada vX.Y.Z (líneas
 * `programa <so-arq> <sha256> <bytes>`). La misma firma que ya verifican INSTALAR y actualizar-arbrain cubre el
 * programa: aquí se vuelve a correr `git verify-tag` contra el ancla de la persona (~/.config/arbrain/firmas-permitidas,
 * fuera del repo) y solo entonces se baja, se compara la huella y se usa. Sin ancla, sin etiqueta, con el código del
 * programa cambiado en su copia, o si algo no cuadra, se compila como siempre: nunca se usa algo sin verificar.
 *
 * Lo usa servidor.mjs (al iniciar y en la orden `empaquetar` de la CI). Sin dependencias.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const REPO_PUBLICO = 'arbrain-ai/arbrain'

/** Rutas cuyo contenido determina el programa compilado (web + daemon). Si la copia difiere de la etiqueta, se compila. */
export const RUTAS_PROGRAMA = [
  'arbrain/src', 'arbrain/public', 'arbrain/next.config.ts', 'arbrain/package.json', 'arbrain/package-lock.json',
  'arbrain/tsconfig.json', 'arbrain/EDICION', 'arbrain/server/src', 'arbrain/server/package.json',
  'arbrain/server/package-lock.json', 'arbrain/server/empaquetado.json', 'arbrain/server/tsconfig.cliente.json',
  'arbrain/server/manos-windows',
]

export const plataforma = (p = process.platform, a = process.arch) => `${p}-${a}`
export const nombreArchivo = (version, plat) => `arbrain-programa-v${version}-${plat}.tar.gz`
export const nodeDe = (dir, p = process.platform) => join(dir, 'node', p === 'win32' ? 'node.exe' : 'node')

/** Líneas `programa <plat> <sha256> <bytes>` del mensaje de una etiqueta. Puro (lo prueban tests/servidor). */
export function huellasDelMensaje(texto) {
  const o = {}
  for (const l of String(texto).split(/\r?\n/)) {
    const m = /^programa ([a-z0-9]+-[a-z0-9]+) ([0-9a-f]{64}) (\d+)$/.exec(l.trim())
    if (m) o[m[1]] = { sha256: m[2], bytes: Number(m[3]) }
  }
  return o
}

/** Bloque que publicar-version.sh pone en el mensaje de la etiqueta. Puro. */
export function bloqueDeHuellas(archivos) {
  return archivos.map(({ plat, sha256, bytes }) => `programa ${plat} ${sha256} ${bytes}`).join('\n')
}

function git(repo, args, extra = {}) {
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, ...extra })
}

/** ssh-keygen con `-Y verify`: en Windows, el de Git (el de System32 puede ser viejo). */
function sshKeygen(repo) {
  if (process.platform !== 'win32') return 'ssh-keygen'
  const exec = git(repo, ['--exec-path']).stdout?.trim()
  if (exec) {
    // <git>/mingw64/libexec/git-core → <git>/usr/bin/ssh-keygen.exe
    const candidato = join(exec, '..', '..', '..', 'usr', 'bin', 'ssh-keygen.exe')
    if (existsSync(candidato)) return candidato
  }
  return 'ssh-keygen'
}

/** ¿La etiqueta está firmada por una llave del ancla? Devuelve el mensaje de la etiqueta o un motivo. */
export function etiquetaVerificada(repo, etiqueta, ancla = join(homedir(), '.config', 'arbrain', 'firmas-permitidas')) {
  if (!existsSync(ancla)) return { motivo: 'no hay ancla de firmas en ~/.config/arbrain' }
  if (git(repo, ['rev-parse', '-q', '--verify', `refs/tags/${etiqueta}`]).status !== 0) return { motivo: `la copia no tiene la etiqueta ${etiqueta}` }
  if (git(repo, ['cat-file', '-t', etiqueta]).stdout?.trim() !== 'tag') return { motivo: `${etiqueta} no es una etiqueta anotada` }
  const v = git(repo, ['-c', 'gpg.format=ssh', '-c', `gpg.ssh.program=${sshKeygen(repo)}`, '-c', `gpg.ssh.allowedSignersFile=${ancla}`, 'verify-tag', etiqueta])
  if (v.status !== 0) return { motivo: `la firma de ${etiqueta} no verifica (${(v.stderr || '').trim().split('\n').pop()})` }
  const mensaje = git(repo, ['tag', '-l', '--format=%(contents)', etiqueta]).stdout ?? ''
  return { mensaje }
}

/** ¿El código del programa en la copia es exactamente el de la etiqueta (sin cambios, ni confirmados ni sueltos)? */
export function fuenteIgualALaEtiqueta(repo, etiqueta, rutas = RUTAS_PROGRAMA) {
  const presentes = rutas.filter((r) => existsSync(join(repo, r)))
  if (git(repo, ['diff', '--quiet', etiqueta, '--', ...presentes]).status !== 0) return false
  const sueltos = git(repo, ['status', '--porcelain', '--untracked-files=all', '--', ...presentes]).stdout ?? ''
  return sueltos.trim() === ''
}

export function sha256Archivo(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash('sha256')
    createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal)
  })
}

/**
 * Descarga con http/https y pipeline (no fetch: el fetch de Node 22 tumbó el proceso en Windows con
 * `assert(!this.paused)` de undici al pausar por contrapresión; CI 22 oct). Sigue hasta 5 redirecciones (GitHub manda
 * los releases a su CDN) y corta si llega más de lo que dice la etiqueta firmada.
 */
async function descargar(url, destino, bytesEsperados, avisar, saltos = 0) {
  const { get } = await import(url.startsWith('https:') ? 'node:https' : 'node:http')
  const res = await new Promise((ok, mal) => {
    const req = get(url, { headers: { 'User-Agent': 'arbrain-servidor' }, timeout: 60_000 }, ok)
    req.on('timeout', () => req.destroy(new Error('la descarga no respondió en 60 s')))
    req.on('error', mal)
  })
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && saltos < 5) {
    res.resume()
    return descargar(new URL(res.headers.location, url).toString(), destino, bytesEsperados, avisar, saltos + 1)
  }
  if (res.statusCode !== 200) { res.resume(); throw new Error(`la descarga respondió ${res.statusCode}`) }
  const { pipeline } = await import('node:stream/promises')
  const { Transform } = await import('node:stream')
  let llevo = 0, siguiente = 0.25
  const contar = new Transform({
    transform(parte, _c, listo) {
      llevo += parte.length
      if (llevo > bytesEsperados) return listo(new Error('llegó más de lo que dice la etiqueta firmada'))
      while (bytesEsperados && llevo / bytesEsperados >= siguiente) { avisar(`  ${Math.round(siguiente * 100)} %`); siguiente += 0.25 }
      listo(null, parte)
    },
  })
  await pipeline(res, contar, createWriteStream(destino))
}

function tar() {
  // En Windows, el tar del sistema (bsdtar) entiende rutas C:\…; el de Git Bash (GNU) no.
  const tarWindows = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  return process.platform === 'win32' && existsSync(tarWindows) ? tarWindows : 'tar'
}

/**
 * Deja listo el programa ya compilado de esta versión y plataforma en `<programa>/v<ver>-<plat>/` o devuelve null con
 * el motivo en `avisar`. Nunca lanza: cualquier problema = compilar como antes.
 */
export async function programaYaCompilado({ repo, dirProgramas, version, avisar = () => {}, ancla }) {
  const plat = plataforma()
  const etiqueta = `v${version}`
  const destino = join(dirProgramas, `v${version}-${plat}`)
  const rutas = { dir: destino, web: join(destino, 'web'), daemon: join(destino, 'daemon'), node: nodeDe(destino) }
  const noUsar = (motivo) => { avisar(`Compilo aquí en vez de usar el programa ya compilado: ${motivo}.`); return null }
  try {
    if (process.env.ARBRAIN_PROGRAMA === 'compilar') return null
    if (!/^\d+\.\d+\.\d+$/.test(version)) return noUsar('versión desconocida')
    const firmada = etiquetaVerificada(repo, etiqueta, ancla)
    if (!firmada.mensaje) return noUsar(firmada.motivo)
    if (!fuenteIgualALaEtiqueta(repo, etiqueta)) return noUsar(`tu copia cambió el código de la app respecto de ${etiqueta}`)
    const huella = huellasDelMensaje(firmada.mensaje)[plat]
    if (!huella) return noUsar(`${etiqueta} no trae programa para ${plat}`)

    // Ya estaba bajado y verificado para esta misma huella.
    const marca = join(destino, '.verificado')
    if (existsSync(marca) && readFileSync(marca, 'utf8').trim() === huella.sha256 && existsSync(rutas.node)) return rutas

    mkdirSync(dirProgramas, { recursive: true })
    const archivo = join(dirProgramas, `${nombreArchivo(version, plat)}.${process.pid}.parcial`)
    // ARBRAIN_PROGRAMA_BASE solo cambia DE DÓNDE se baja (pruebas, espejo): la huella sigue saliendo de la etiqueta firmada.
    const base = process.env.ARBRAIN_PROGRAMA_BASE?.trim() || `https://github.com/${REPO_PUBLICO}/releases/download/${etiqueta}`
    const url = `${base.replace(/\/+$/, '')}/${nombreArchivo(version, plat)}`
    avisar(`Bajando Arbrain ${etiqueta} ya compilado para tu sistema (${Math.round(huella.bytes / 1e6)} MB)…`)
    try {
      await descargar(url, archivo, huella.bytes, avisar)
      const sha = await sha256Archivo(archivo)
      if (sha !== huella.sha256 || statSync(archivo).size !== huella.bytes) return noUsar('lo que bajó no coincide con la huella firmada')
      const tmp = `${destino}.tmp-${process.pid}`
      rmSync(tmp, { recursive: true, force: true })
      mkdirSync(tmp, { recursive: true })
      const x = spawnSync(tar(), ['-xzf', archivo, '-C', tmp], { encoding: 'utf8', windowsHide: true })
      if (x.status !== 0) { rmSync(tmp, { recursive: true, force: true }); return noUsar(`no pude descomprimirlo (${(x.stderr || '').trim().slice(0, 200)})`) }
      const info = JSON.parse(readFileSync(join(tmp, 'programa.json'), 'utf8'))
      if (info.version !== version || info.plataforma !== plat) { rmSync(tmp, { recursive: true, force: true }); return noUsar('el paquete dice otra versión o plataforma') }
      const prueba = spawnSync(nodeDe(tmp), ['-e', 'process.stdout.write(process.versions.modules)'], { encoding: 'utf8', windowsHide: true })
      if (prueba.status !== 0 || String(prueba.stdout).trim() !== String(info.abi)) { rmSync(tmp, { recursive: true, force: true }); return noUsar('el Node del paquete no arranca en este equipo') }
      rmSync(destino, { recursive: true, force: true })
      renameSync(tmp, destino)
      writeFileSync(marca, `${huella.sha256}\n`)
    } finally {
      rmSync(archivo, { force: true })
    }
    // Versiones anteriores ya compiladas: son nuestras y se regeneran; se quitan (queda esta).
    for (const d of readdirSync(dirProgramas)) {
      const p = join(dirProgramas, d)
      if (p !== destino && /^v\d+\.\d+\.\d+-/.test(d)) rmSync(p, { recursive: true, force: true })
    }
    avisar(`Programa ${etiqueta} verificado con la firma de la versión: no hace falta compilar.`)
    return rutas
  } catch (e) {
    return noUsar(e?.message ?? String(e))
  }
}

/**
 * CI (programa.yml): arma `<salida>/arbrain-programa-vX-<plat>.tar.gz` a partir de la web y el daemon recién
 * compilados y del Node fijado (verificado por fetch-node.mjs contra su hash del repo).
 */
export async function armarPaquete({ salida, version, web, daemon, arbrain, registrar }) {
  const plat = plataforma()
  const { asegurarNode, tripleDeEstaMaquina } = await import('../fetch-node.mjs')
  const fijado = JSON.parse(readFileSync(join(arbrain, 'scripts', 'node-embebido.json'), 'utf8'))
  if (Number(process.versions.modules) !== Number(fijado.abi)) {
    throw new Error(`empaquetar exige Node ${fijado.version.split('.')[0]} (ABI ${fijado.abi}); corre con ${process.version}`)
  }
  const raiz = join(salida, `programa-${plat}`)
  rmSync(raiz, { recursive: true, force: true })
  mkdirSync(join(raiz, 'node'), { recursive: true })
  registrar(`Armando el paquete en ${raiz}`)
  cpSync(web, join(raiz, 'web'), { recursive: true })
  cpSync(daemon, join(raiz, 'daemon'), { recursive: true })
  const node = await asegurarNode(tripleDeEstaMaquina())
  cpSync(node, nodeDe(raiz))
  writeFileSync(join(raiz, 'programa.json'), JSON.stringify({
    version, plataforma: plat, node: fijado.version, abi: fijado.abi, armado: new Date().toISOString(),
  }, null, 1) + '\n')
  // El paquete arranca con SU Node: carga lo nativo del daemon.
  const prueba = spawnSync(nodeDe(raiz), ['-e', "const D=require('better-sqlite3');new D(':memory:').prepare('select 1').get();require.resolve('@anthropic-ai/claude-agent-sdk')"], { cwd: join(raiz, 'daemon'), encoding: 'utf8' })
  if (prueba.status !== 0) throw new Error(`el daemon del paquete no carga con su Node: ${prueba.stderr}`)
  const archivo = join(salida, nombreArchivo(version, plat))
  rmSync(archivo, { force: true })
  const t = spawnSync(tar(), ['-czf', archivo, '-C', raiz, '.'], { encoding: 'utf8', stdio: 'inherit' })
  if (t.status !== 0) throw new Error('tar falló')
  const sha256 = await sha256Archivo(archivo)
  const bytes = statSync(archivo).size
  writeFileSync(`${archivo}.huella`, `programa ${plat} ${sha256} ${bytes}\n`)
  registrar(`Listo: ${archivo} (${(bytes / 1e6).toFixed(1)} MB, sha256 ${sha256.slice(0, 12)}…)`)
  rmSync(raiz, { recursive: true, force: true })
  return { archivo, plat, sha256, bytes }
}

export const _interno = { descargar }
