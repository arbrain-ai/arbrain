/**
 * Edición cliente del escritorio (empaquetado alumno, 11 oct 2026): identidad propia, CSP, Node embebido con hash
 * fijado y daemon dentro del paquete. Pruebas de configuración: no compilan ni descargan nada.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(__dirname, '../..')
const leer = (p: string) => JSON.parse(readFileSync(resolve(raiz, p), 'utf8'))

test('la config que viaja es la app del alumno; la instalación original se superpone con su propio archivo', () => {
  const base = leer('src-tauri/tauri.conf.json')
  assert.equal(base.identifier, 'ai.arbrain.app')
  assert.equal(base.productName, 'Arbrain')
  const ruta = resolve(raiz, 'src-tauri/tauri.original.conf.json')
  if (existsSync(ruta)) {
    const original = leer('src-tauri/tauri.original.conf.json')
    assert.notEqual(original.identifier, base.identifier)
    assert.equal(original.bundle.externalBin, null, 'la instalación original no empaqueta Node (null borra en el merge)')
    assert.equal(original.app.security.csp, null)
    assert.equal(original.bundle.resources['resources/daemon'], null)
  }
  const s = leer('package.json').scripts
  for (const k of ['desktop:dev', 'desktop:build', 'desktop:app', 'desktop:bundle', 'desktop:info']) {
    assert.match(s[k], /node scripts\/tauri\.mjs /, `${k} pasa por scripts/tauri.mjs`)
  }
})

test('la edición cliente tiene CSP y no concede IPC a 127.0.0.1:* por configuración', () => {
  const cliente = leer('src-tauri/tauri.conf.json')
  assert.ok(cliente.app.security.csp, 'CSP no nula')
  assert.match(cliente.app.security.csp['object-src'], /'none'/)
  const caps = cliente.app.security.capabilities
  assert.ok(Array.isArray(caps) && caps.length > 0, 'lista explícita: sin ella Tauri cargaría todo capabilities/ (las de la instalación original)')
  for (const c of caps) {
    assert.equal(typeof c, 'object')
    assert.equal(c.remote, undefined, `${c.identifier}: sin orígenes remotos estáticos`)
  }
})

test('red team 2 (M-6): capabilities/ es solo de la instalación original, que las lista por nombre; el alumno no las recibe', () => {
  const dir = resolve(raiz, 'src-tauri/capabilities')
  const archivos = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []
  const ids = archivos.map((f) => leer(`src-tauri/capabilities/${f}`).identifier as string)
  for (const id of ids) assert.match(id, /^original-/, `${id}: toda capability en archivo es de la instalación original`)
  // La edición cliente no referencia ninguna por nombre (con lista no vacía, Tauri solo activa lo listado).
  const cliente = leer('src-tauri/tauri.conf.json').app.security.capabilities as unknown[]
  assert.ok(cliente.every((c) => typeof c === 'object'), 'cliente: solo capabilities en línea, ninguna por nombre')
  const ruta = resolve(raiz, 'src-tauri/tauri.original.conf.json')
  if (existsSync(ruta)) {
    // Lista explícita: con [] la original cargaría cualquier archivo nuevo de la carpeta sin decidirlo.
    assert.deepEqual([...leer('src-tauri/tauri.original.conf.json').app.security.capabilities].sort(), [...ids].sort())
  }
  // Ni comodines ni los puertos 3000/3300 en nada que conceda la edición cliente por configuración.
  assert.doesNotMatch(JSON.stringify(cliente), /:\*|:3000|:3300|localhost|127\.0\.0\.1/)
  // Y la copia del alumno no trae la carpeta (allowlist del generador, solo en el repo original).
  const allow = resolve(raiz, '../docs/builds/empaquetado-2026-10-11/allowlist.yaml')
  if (existsSync(allow)) assert.match(readFileSync(allow, 'utf8'), /^\s*- arbrain\/src-tauri\/capabilities\/\*\*/m)
})

test('viajan Node, daemon y plantilla; iconos para los tres sistemas', () => {
  const b = leer('src-tauri/tauri.conf.json').bundle
  assert.deepEqual(b.externalBin, ['binaries/arbrain-node'])
  assert.equal(b.resources['resources/daemon'], 'daemon')
  assert.equal(b.resources['resources/next'], 'next')
  assert.equal(b.resources['resources/plantilla-cerebro'], 'plantilla-cerebro')
  assert.ok(b.icon.includes('icons/icon.icns') && b.icon.includes('icons/icon.ico'))
})

test('Node embebido: Node 22, seis plataformas, SHA-256 fijado', () => {
  const n = leer('scripts/node-embebido.json')
  assert.match(n.version, /^22\.\d+\.\d+$/)
  assert.equal(n.abi, 127)
  const triples = ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc', 'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu']
  for (const t of triples) {
    const p = n.plataformas[t]
    assert.ok(p, t)
    assert.match(p.sha256, /^[a-f0-9]{64}$/, t)
    assert.ok(p.archivo.startsWith(`node-v${n.version}-`), t)
  }
})

test('el build del alumno es un script portable (sin VAR=valor de shell) y no instala en ~/Applications', () => {
  const s = leer('package.json').scripts
  assert.equal(s['desktop:app:cliente'], 'node scripts/desktop-cliente.mjs')
  const src = readFileSync(resolve(raiz, 'scripts/desktop-cliente.mjs'), 'utf8')
  assert.match(src, /ARBRAIN_EDICION: 'cliente'/)
  assert.match(src, /target-cliente/)
  assert.match(src, /remap-path-prefix/)
  assert.doesNotMatch(src, /desktop-install|Applications'/, 'no instala en la carpeta del usuario')
})

test('el daemon se compila directo a resources, nunca en server/dist', () => {
  const src = readFileSync(resolve(raiz, 'scripts/empaquetar-daemon.mjs'), 'utf8')
  assert.match(src, /'--outDir', join\(destino, 'dist'\)/)
  assert.match(src, /checkout vivo/)
})
