#!/usr/bin/env node
/**
 * Arma el daemon de la edición cliente para empaquetarlo en la app del alumno (contrato:
 * docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md §1).
 *
 *   npm run build:cliente -- <destino>
 *
 * Compila `src/` (sin pruebas) directo a `<destino>/dist` — NUNCA sobre el `dist/` de este checkout, que es el que
 * corre el daemon vivo de Daniel —, copia package.json, package-lock.json y los catálogos que se leen en tiempo de
 * ejecución, e instala `node_modules` de producción para ESTE sistema y arquitectura (better-sqlite3 y el binario
 * nativo del SDK de Claude son por plataforma: se arma en cada runner de CI). Al final verifica que el paquete carga
 * y que no lleva `.env`, bases ni llaves.
 *
 * El destino debe no existir o estar vacío (no se borra nada que ya esté ahí).
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destinoArg = process.argv[2]
const fallar = (m) => { console.error(`build:cliente: ${m}`); process.exit(1) }
if (!destinoArg) fallar('falta el destino. Uso: npm run build:cliente -- <carpeta nueva>')
const DESTINO = resolve(destinoArg)
const dentro = (hijo, padre) => hijo === padre || hijo.startsWith(padre.endsWith(sep) ? padre : padre + sep)
if (dentro(DESTINO, SERVER)) fallar(`el destino no puede estar dentro de ${SERVER} (ahí vive el dist del daemon de la instalación original).`)
if (existsSync(DESTINO) && readdirSync(DESTINO).length) fallar(`${DESTINO} no está vacío; elige una carpeta nueva.`)
mkdirSync(DESTINO, { recursive: true })

const win = process.platform === 'win32'
// En Windows solo npm.cmd necesita shell; con shell, cmd.exe destroza el `node -e "…"` de la verificación (CI 12 oct).
const correr = (cmd, args, cwd, extra = {}) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: win && cmd.endsWith('.cmd'), env: { ...process.env, ...extra } })

console.log(`build:cliente → ${DESTINO} (${process.platform}-${process.arch}, node ${process.version})`)

// 1. Compilar a <destino>/dist con el tsc del proyecto.
const tsc = join(SERVER, 'node_modules', 'typescript', 'bin', 'tsc')
if (!existsSync(tsc)) fallar('no hay typescript en node_modules: corre `npm ci --include=dev` en arbrain/server.')
correr(process.execPath, [tsc, '-p', join(SERVER, 'tsconfig.cliente.json'), '--outDir', join(DESTINO, 'dist')], SERVER)

// 2. Manifiesto y archivos que se leen en tiempo de ejecución.
for (const f of ['package.json', 'package-lock.json']) cpSync(join(SERVER, f), join(DESTINO, f))
// Lo que se lee fuera de dist en tiempo de ejecución: fuente única en empaquetado.json › extras.
const { extras = [] } = JSON.parse(readFileSync(join(SERVER, 'empaquetado.json'), 'utf8'))
for (const extra of extras) cpSync(join(SERVER, extra), join(DESTINO, extra), { recursive: true })
// Marcador de edición del repo (carril O, red team A3): un daemon armado desde la copia del alumno es cliente aunque
// nadie le pase ARBRAIN_EDICION (`dist/edicion.js` lo busca en `dist/../EDICION`). El repo de Daniel no lo tiene.
const marcador = join(SERVER, '..', 'EDICION')
if (existsSync(marcador)) { cpSync(marcador, join(DESTINO, 'EDICION')); console.log('build:cliente: EDICION copiado (marcador de edición del repo)') }

// 3. Dependencias de producción para esta plataforma (sin scripts de desarrollo; better-sqlite3 baja su binario).
const npm = win ? 'npm.cmd' : 'npm'
correr(npm, ['ci', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], DESTINO, { NODE_ENV: 'production' })

// 4. Verificación: carga lo nativo y no lleva secretos ni bases.
correr(process.execPath, ['-e', "const D=require('better-sqlite3');new D(':memory:').prepare('select 1').get();require.resolve('@anthropic-ai/claude-agent-sdk');console.log('build:cliente: better-sqlite3 y SDK cargan')"], DESTINO)
const prohibido = /^\.env(?!\.example$)|\.db$|\.db-(wal|shm)$|\.sqlite$|^\.mcp\.json$|^\.npmrc$|\.pem$|\.key$/
const hallazgos = []
let bytes = 0
const recorrer = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    const s = statSync(p)
    if (s.isDirectory()) recorrer(p)
    else { bytes += s.size; if (prohibido.test(n)) hallazgos.push(relative(DESTINO, p)) }
  }
}
recorrer(DESTINO)
if (hallazgos.length) fallar(`el paquete lleva archivos prohibidos: ${hallazgos.join(', ')}`)
if (!existsSync(join(DESTINO, 'dist', 'index.js'))) fallar('falta dist/index.js')
console.log(`build:cliente: listo, ${(bytes / 1e6).toFixed(1)} MB, sin .env ni bases. Lánzalo según CONTRATO-DAEMON.md: node ${join(DESTINO, 'dist', 'index.js')}`)
