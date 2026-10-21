#!/usr/bin/env node
/**
 * El daemon viaja con la app (edición cliente; docs/builds/empaquetado-2026-10-11/PORTABILIDAD.md).
 *
 * Deja en `src-tauri/resources/daemon/`:
 *   dist/          compilado de `arbrain/server/src` con tsc, ESCRITO DIRECTO AQUÍ (nunca en `server/dist`, que en el
 *                  Studio es el daemon vivo de launchd)
 *   package.json, package-lock.json
 *   node_modules/  solo producción, instalado para la plataforma y el Node embebido (better-sqlite3 con su prebuild)
 *   src/modelos/catalogos/ (CONTRATO-DAEMON.md §1) + los extras que el carril del daemon declare en
 *                  `server/empaquetado.json` ({ "extras": ["ruta/relativa", …] })
 *
 * Por allowlist: nada de `.env*`, `store/`, `services/`, `manos-casa/`, `launchd/`, `logs/`, `scripts/`.
 * Termina revisando el resultado con paquete-seguro (cualquier llave o archivo prohibido detiene el build).
 *
 * Uso: node scripts/empaquetar-daemon.mjs [--triple <triple>] [--sin-instalar]
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { destinoSidecar, npmDelTriple, tripleDeEstaMaquina } from './fetch-node.mjs'
import { archivoProhibido, buscarFugas, envDelRepo, limpiarSecretos, resumen, secretosDe } from './paquete-seguro.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..')
const server = join(raiz, 'server')
const destino = join(raiz, 'src-tauri', 'resources', 'daemon')

/** Nunca viajan, aunque alguien los ponga en extras. */
const NUNCA = ['.env', 'store', 'services', 'manos-casa', 'launchd', 'logs', 'node_modules', 'dist', '.git']

function argumento(nombre) {
  const i = process.argv.indexOf(nombre)
  return i > 0 ? process.argv[i + 1] : undefined
}

/** Lo que el daemon lee en tiempo de ejecución fuera de dist (CONTRATO-DAEMON.md §1). */
const EXTRAS_DEL_CONTRATO = ['src/modelos/catalogos']

function extrasDeclarados() {
  const archivo = join(server, 'empaquetado.json')
  const { extras = [] } = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : {}
  const todos = [...new Set([...EXTRAS_DEL_CONTRATO.filter(e => existsSync(join(server, e))), ...extras])]
  return todos.map(e => {
    const rel = normalize(e).replace(/^[/\\]+/, '')
    const primero = rel.split(/[/\\]/)[0]
    if (rel.startsWith('..') || NUNCA.some(n => primero === n || primero.startsWith('.env')) || archivoProhibido(primero)) {
      throw new Error(`[daemon] extra no permitido en server/empaquetado.json: ${e}`)
    }
    return rel
  })
}

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function empaquetarDaemon({ triple = tripleDeEstaMaquina(), instalar = true } = {}) {
  // Salvaguarda: aunque tsc ya no escribe en server/dist, este script jamás corre sobre el checkout vivo del Studio.
  const vivo = join(homedir(), 'Developer', 'artificial-brain', 'arbrain')
  if (existsSync(vivo) && realpathSync(raiz) === realpathSync(vivo) && process.env.ARBRAIN_PERMITIR_CHECKOUT_VIVO !== '1') {
    throw new Error('[daemon] Esto es el checkout vivo del Studio. Empaqueta desde el worktree o la copia del alumno.')
  }
  if (!existsSync(join(server, 'node_modules', 'typescript'))) {
    throw new Error('[daemon] Falta server/node_modules (cd server && npm ci --include=dev).')
  }

  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })

  console.log('[daemon] compilando server/src → resources/daemon/dist')
  const tsc = join(server, 'node_modules', 'typescript', 'bin', 'tsc')
  execFileSync(process.execPath, [tsc, '-p', join(server, existsSync(join(server, 'tsconfig.cliente.json')) ? 'tsconfig.cliente.json' : 'tsconfig.json'), '--outDir', join(destino, 'dist')], { stdio: 'inherit', cwd: server })

  // Las pruebas compiladas no viajan.
  let pruebas = 0
  const sinPruebas = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name)
      if (e.isDirectory()) sinPruebas(ruta)
      else if (/\.test\.js(\.map)?$/.test(e.name)) { rmSync(ruta); pruebas++ }
    }
  }
  sinPruebas(join(destino, 'dist'))
  console.log(`[daemon] ${pruebas} archivo(s) de prueba fuera de dist`)

  for (const f of ['package.json', 'package-lock.json']) cpSync(join(server, f), join(destino, f))
  for (const rel of extrasDeclarados()) {
    cpSync(join(server, rel), join(destino, rel), { recursive: true })
    console.log(`[daemon] extra: ${rel}`)
  }

  let lockDesincronizado = false
  if (instalar) {
    const npm = npmDelTriple(triple)
    const cruzado = triple !== tripleDeEstaMaquina()
    console.log(`[daemon] npm ci --omit=dev para ${npm.platform}/${npm.arch}, Node ${npm.version}${cruzado ? ' (cruzado)' : ''}`)
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      // prebuild-install (better-sqlite3) baja el binario para ESTE Node y esta plataforma.
      npm_config_runtime: 'node',
      npm_config_target: npm.version,
      npm_config_platform: npm.platform,
      npm_config_arch: npm.arch,
      npm_config_target_platform: npm.platform,
      npm_config_target_arch: npm.arch,
    }
    const args = ['ci', '--omit=dev', '--no-audit', '--no-fund']
    if (cruzado) args.push(`--os=${npm.platform}`, `--cpu=${npm.arch}`)
    const correr = a => execFileSync(npmBin(), a, { stdio: 'inherit', cwd: destino, env, shell: process.platform === 'win32' })
    try {
      correr(args)
    } catch (e) {
      // `npm ci` exige que package-lock.json coincida con package.json. Si el carril del daemon dejó el lock
      // desincronizado, se instala igual (respetando lo que el lock sí fija) y se deja constancia; el lock del repo
      // no se toca: la copia vive en resources/daemon.
      if (process.env.ARBRAIN_LOCK_ESTRICTO === '1') throw e
      console.warn('[daemon] AVISO: server/package-lock.json no coincide con package.json; npm install --omit=dev en la copia.')
      lockDesincronizado = true
      correr(['install', ...args.slice(1)])
    }

    // Prueba de carga con el Node que viaja (mismo ABI que verá el alumno), solo si es de esta máquina.
    const node = destinoSidecar(triple)
    if (!cruzado && existsSync(node)) {
      const prueba = "const D=require('better-sqlite3');const d=new D(':memory:');console.log('better-sqlite3 ok', d.prepare('select 1 as x').get().x)"
      execFileSync(node, ['-e', prueba], { stdio: 'inherit', cwd: destino })
    }
  }

  // Revisión final: quitar lo prohibido que un paquete npm haya traído y fallar ante cualquier llave.
  const quitados = limpiarSecretos(destino)
  if (quitados.length) console.log(`[daemon] fuera del paquete: ${quitados.length} archivo(s) prohibido(s)`)
  const { fugas } = buscarFugas(destino, { secretos: secretosDe(envDelRepo(raiz)) })
  if (fugas.length) throw new Error(`[daemon] el daemon empaquetado lleva ${fugas.length} secreto(s). Build detenido:\n${resumen(fugas)}`)
  for (const n of ['store', 'services', 'manos-casa', 'launchd', 'logs']) {
    if (existsSync(join(destino, n))) throw new Error(`[daemon] ${n}/ no debe viajar`)
  }
  writeFileSync(join(destino, 'EMPAQUETADO.json'), JSON.stringify({ triple, node: npmDelTriple(triple).version, lockDesincronizado, fecha: new Date().toISOString() }, null, 2) + '\n')
  console.log(`[daemon] listo en ${destino.split(sep).slice(-3).join('/')}`)
  return destino
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    empaquetarDaemon({
      triple: argumento('--triple') || process.env.ARBRAIN_TARGET_TRIPLE || tripleDeEstaMaquina(),
      instalar: !process.argv.includes('--sin-instalar'),
    })
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }
}
