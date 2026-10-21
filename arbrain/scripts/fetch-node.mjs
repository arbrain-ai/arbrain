#!/usr/bin/env node
/**
 * Node embebido de la edición cliente (empaquetado alumno, 11 oct 2026; docs/builds/empaquetado-2026-10-11).
 *
 * Descarga el Node oficial fijado en `scripts/node-embebido.json`, verifica su SHA-256 contra el hash fijado en el
 * repo (no contra uno descargado al momento) y deja el ejecutable como sidecar de Tauri:
 *   src-tauri/binaries/arbrain-node-<triple>[.exe]
 * Tauri lo copia junto al binario de la app como `arbrain-node` (lib.rs, resolve_node_binary lo usa primero).
 *
 * Uso:
 *   node scripts/fetch-node.mjs                 # triple de esta máquina (rustc -vV)
 *   node scripts/fetch-node.mjs --triple x86_64-pc-windows-msvc
 *   node scripts/fetch-node.mjs --imprimir-npm  # {"platform","arch","version"} para instalar el daemon a juego
 *
 * El archivo descargado y su extracción viven en carpetas nuevas y vacías bajo src-tauri/binaries/.cache (ignorada).
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..')
const binarios = join(raiz, 'src-tauri', 'binaries')
const cache = join(binarios, '.cache')
const fijado = JSON.parse(readFileSync(join(aqui, 'node-embebido.json'), 'utf8'))

export function tripleDeEstaMaquina() {
  try {
    const salida = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    const host = salida.split('\n').find(l => l.startsWith('host:'))
    if (host) return host.slice(5).trim()
  } catch { /* sin rustc: se deduce de Node */ }
  const arch = { arm64: 'aarch64', x64: 'x86_64' }[process.arch]
  const so = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' }[process.platform]
  if (!arch || !so) throw new Error(`Plataforma sin Node embebido: ${process.platform}/${process.arch}`)
  return `${arch}-${so}`
}

export function destinoSidecar(triple) {
  return join(binarios, `arbrain-node-${triple}${triple.includes('windows') ? '.exe' : ''}`)
}

function sha256(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash('sha256')
    createReadStream(ruta).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal)
  })
}

async function descargar(url, destino) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Descarga fallida (${res.status}) ${url}`)
  const partes = []
  for await (const parte of res.body) partes.push(parte)
  writeFileSync(destino, Buffer.concat(partes))
}

export async function asegurarNode(triple = tripleDeEstaMaquina()) {
  const p = fijado.plataformas[triple]
  if (!p) throw new Error(`Sin Node fijado para ${triple}. Plataformas: ${Object.keys(fijado.plataformas).join(', ')}`)
  const destino = destinoSidecar(triple)
  const marca = `${destino}.sha256`
  // Ya está y viene del archivo fijado: no se vuelve a bajar.
  // Ya está, viene del archivo fijado y el ejecutable no cambió desde que se extrajo: no se vuelve a bajar.
  if (existsSync(destino) && existsSync(marca)) {
    const [delArchivo, delBinario] = readFileSync(marca, 'utf8').trim().split(/\s+/)
    if (delArchivo === p.sha256 && delBinario === (await sha256(destino))) {
      console.log(`[node] ${triple}: ya está (${fijado.version}) en ${destino}`)
      return destino
    }
  }
  mkdirSync(cache, { recursive: true })
  const archivo = join(cache, p.archivo)
  if (!existsSync(archivo) || (await sha256(archivo)) !== p.sha256) {
    const url = `https://nodejs.org/dist/v${fijado.version}/${p.archivo}`
    console.log(`[node] bajando ${url}`)
    const tmp = mkdtempSync(join(cache, 'descarga-'))
    const parcial = join(tmp, p.archivo)
    await descargar(url, parcial)
    const hash = await sha256(parcial)
    if (hash !== p.sha256) {
      throw new Error(`[node] SHA-256 no coincide para ${p.archivo}: esperado ${p.sha256}, llegó ${hash}. No se usa.`)
    }
    renameSync(parcial, archivo)
  }
  // Extraer solo el ejecutable en una carpeta nueva y vacía.
  const extraido = mkdtempSync(join(cache, 'extraido-'))
  const carpeta = p.archivo.replace(/\.(tar\.gz|tar\.xz|zip)$/, '')
  const miembro = triple.includes('windows') ? `${carpeta}/node.exe` : `${carpeta}/bin/node`
  // En Windows, el tar del sistema (bsdtar) abre .zip; el de Git Bash (GNU) no.
  const tarWindows = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  const tar = process.platform === 'win32' && existsSync(tarWindows) ? tarWindows : 'tar'
  execFileSync(tar, ['-xf', archivo, '-C', extraido, miembro], { stdio: 'inherit' })
  mkdirSync(binarios, { recursive: true })
  copyFileSync(join(extraido, miembro), destino)
  if (!triple.includes('windows')) chmodSync(destino, 0o755)
  writeFileSync(marca, `${p.sha256} ${await sha256(destino)}\n`)
  if (triple === tripleDeEstaMaquina()) {
    const v = execFileSync(destino, ['-v'], { encoding: 'utf8' }).trim()
    if (v !== `v${fijado.version}`) throw new Error(`[node] el binario dice ${v}, se esperaba v${fijado.version}`)
  }
  console.log(`[node] ${triple}: Node ${fijado.version} verificado (sha256 ${p.sha256.slice(0, 12)}…) → ${destino}`)
  return destino
}

/** Plataforma, arquitectura y versión de npm a juego con el Node embebido (para instalar los nativos del daemon). */
export function npmDelTriple(triple = tripleDeEstaMaquina()) {
  const p = fijado.plataformas[triple]
  if (!p) throw new Error(`Sin Node fijado para ${triple}`)
  return { ...p.npm, version: fijado.version, abi: fijado.abi }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--triple')
  const triple = i > 0 ? process.argv[i + 1] : (process.env.ARBRAIN_TARGET_TRIPLE || tripleDeEstaMaquina())
  if (process.argv.includes('--imprimir-npm')) {
    console.log(JSON.stringify(npmDelTriple(triple)))
  } else {
    asegurarNode(triple).catch(e => { console.error(e.message || e); process.exit(1) })
  }
}
