#!/usr/bin/env node
/**
 * Quita de los recursos de la app los paquetes nativos para musl (Alpine) antes de empaquetar en Linux (carril F).
 *
 * Por qué: `npm ci` instala también las variantes musl opcionales (`@img/sharp-linuxmusl-*`,
 * `@img/sharp-libvips-linuxmusl-*`, `@anthropic-ai/claude-agent-sdk-linux-*-musl`). El AppImage se arma con
 * linuxdeploy, que resuelve las dependencias de TODO ELF dentro del AppDir y falla con
 * «Could not find dependency: libc.musl-<arch>.so.1» (reproducido en Docker, ubuntu 22.04 aarch64, 11 oct 2026).
 * La app corre en glibc: esas variantes nunca se cargan. Sin efecto fuera de Linux.
 *
 *   node empaquetado/ci/podar-musl.mjs [carpeta-recursos]   (por defecto src-tauri/resources, relativo a arbrain/)
 *
 * Lo usa ci/tauri.sin-next.json como parte del beforeBuildCommand, después de prepare-tauri-resources.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

if (process.platform !== 'linux') process.exit(0)

const raiz = resolve(process.argv[2] ?? 'src-tauri/resources')
if (!existsSync(raiz)) {
  console.log(`[podar-musl] no existe ${raiz}; nada que hacer`)
  process.exit(0)
}
const esMusl = nombre => /(^|-)(linuxmusl|musl)(-|$)/.test(nombre)
const quitados = []

function recorrer(dir, profundidad) {
  if (profundidad > 12) return
  let entradas
  try { entradas = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entradas) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue
    const ruta = join(dir, e.name)
    if (e.name === 'node_modules') { podarNodeModules(ruta, profundidad + 1); continue }
    recorrer(ruta, profundidad + 1)
  }
}
function podarNodeModules(nm, profundidad) {
  for (const e of readdirSync(nm, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const ruta = join(nm, e.name)
    if (e.name.startsWith('@')) {
      for (const p of readdirSync(ruta, { withFileTypes: true })) {
        if (!p.isDirectory()) continue
        const rp = join(ruta, p.name)
        if (esMusl(p.name)) { quitar(rp) } else recorrer(rp, profundidad + 1)
      }
    } else if (esMusl(e.name)) {
      quitar(ruta)
    } else {
      recorrer(ruta, profundidad + 1)
    }
  }
}
function tamano(ruta) {
  let total = 0
  for (const e of readdirSync(ruta, { withFileTypes: true })) {
    const r = join(ruta, e.name)
    total += e.isDirectory() ? tamano(r) : (e.isFile() ? statSync(r).size : 0)
  }
  return total
}
function quitar(ruta) {
  const mb = tamano(ruta) / 1048576
  rmSync(ruta, { recursive: true, force: true })
  quitados.push(`${relative(raiz, ruta)} (${mb.toFixed(1)} MB)`)
}

recorrer(raiz, 0)
console.log(quitados.length
  ? `[podar-musl] quitadas ${quitados.length} variantes musl:\n  ${quitados.join('\n  ')}`
  : '[podar-musl] sin variantes musl')
