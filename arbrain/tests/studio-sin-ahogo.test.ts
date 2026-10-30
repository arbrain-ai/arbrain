// Studio sin ahogo (28 oct 2026): tope de memoria del semáforo, `next dev` acotado en copias de agentes y su guardia.
// Ligeras: el proceso más grande que levantan reserva ~300 MB unos segundos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { guardiaDev, esCopiaDeAgente } from '../src/config/guardia-dev'

const ESTADO = mkdtempSync(path.join(tmpdir(), 'semaforo-'))
const ENV = { ARBRAIN_COMPILACION_ESTADO: ESTADO, ARBRAIN_SEMAFORO_SONDEO_MS: '200', ARBRAIN_SEMAFORO_SIN_BITACORA: '1' }
Object.assign(process.env, ENV)
const SCRIPTS = path.resolve(__dirname, '../scripts')
// Import diferido: el módulo lee ARBRAIN_COMPILACION_ESTADO al cargarse y el estado de prueba ya tiene que estar puesto.
const pesada = () => import(pathToFileURL(path.join(SCRIPTS, 'compilacion-pesada.mjs')).href)
const dev = () => import(pathToFileURL(path.join(SCRIPTS, 'dev-agente.mjs')).href)
const enMac = process.platform === 'darwin' && !process.env.CI

test('el vigilante encuentra el proceso más pesado de SU grupo', async () => {
  const { mayorDelGrupo } = await pesada()
  const ps = ['  10   10  1048576 next build', '  11   10 27262976 node jest-worker/processChild', '  12   99 40000000 otro grupo'].join('\n')
  const mayor = mayorDelGrupo(ps, 10)
  assert.equal(mayor.pid, 11)
  assert.equal(Math.round(mayor.gb), 26)
  assert.equal(mayorDelGrupo(ps, 7), null)
})

test('un build que rebasa el tope se detiene entero y queda anotado', { skip: !enMac }, async () => {
  const { correrPesado } = await pesada()
  const codigo = await correrPesado(process.execPath, ['-e', 'globalThis.b = Buffer.alloc(300 * 2 ** 20, 1); setTimeout(() => {}, 20000)'], {
    etiqueta: 'prueba-tope', topeGB: 0.1, log: () => {},
  })
  assert.equal(codigo, 137)
  const linea = JSON.parse(readFileSync(path.join(ESTADO, 'logs/semaforo.jsonl'), 'utf8').trim().split('\n').pop()!)
  assert.match(linea.titulo, /prueba-tope/)
  assert.match(linea.cuerpo, /tope es 0\.1 GB/)
})

test('next dev acotado: tope de heap salvo que ya traiga uno, y --capturas separa el comando', async () => {
  const { conTopeDeHeap, separar } = await dev()
  assert.equal(conTopeDeHeap(''), '--max-old-space-size=4096')
  assert.equal(conTopeDeHeap('--inspect'), '--inspect --max-old-space-size=4096')
  assert.equal(conTopeDeHeap('--max-old-space-size=2048'), '--max-old-space-size=2048')
  assert.deepEqual(separar(['-p', '3001', '--capturas', 'node', 'c.mjs']), { devArgs: ['-p', '3001'], capturas: ['node', 'c.mjs'] })
  assert.deepEqual(separar(['--port', '3001']), { devArgs: ['--port', '3001'], capturas: [] })
})

// Servidor falso en vez de `next dev`: responde en $PORT y escribe una línea por petición, como Next.
const FALSO = path.join(ESTADO, 'servidor-falso.mjs')
writeFileSync(FALSO, "import http from 'node:http'; http.createServer((q, r) => { console.log('GET ' + q.url); r.end('ok') }).listen(Number(process.env.PORT), '127.0.0.1')\n")

function correrAcotado(capturas: string[], extra: Record<string, string> = {}) {
  const codigo = `import { acotado } from ${JSON.stringify(pathToFileURL(path.join(SCRIPTS, 'dev-agente.mjs')).href)}; process.exit(await acotado([], ${JSON.stringify(capturas)}))`
  const t0 = Date.now()
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    env: { ...process.env, ...ENV, ARBRAIN_DEV_COMANDO: `${process.execPath} ${FALSO}`, ...extra }, encoding: 'utf8', timeout: 60_000,
  })
  return { ...r, segundos: (Date.now() - t0) / 1000 }
}

test('--capturas: arranca, corre el comando con ARBRAIN_DEV_URL y apaga el servidor', { skip: !enMac }, () => {
  const r = correrAcotado([process.execPath, '-e', 'fetch(process.env.ARBRAIN_DEV_URL + "/hola").then((x) => process.exit(x.ok ? 0 : 3))'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /GET \/hola/)
  assert.match(r.stderr, /capturas terminadas \(código 0\)/)
  assert.ok(r.segundos < 30)
})

test('sin uso se apaga solo', { skip: !enMac }, () => {
  const r = correrAcotado([], { ARBRAIN_DEV_INACTIVO_MIN: '0.03' })
  assert.notEqual(r.signal, 'SIGTERM', 'lo cortó el timeout de la prueba: no se apagó solo')
  assert.match(r.stderr, /sin uso: apago/)
  assert.ok(r.segundos < 30)
})

test('guardia de next.config: en copia de agente, next dev crudo se niega; por npm run dev pasa', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'home-'))
  const copia = path.join(home, 'Developer/wt-x/arbrain')
  mkdirSync(path.join(copia, 'src-tauri'), { recursive: true })
  writeFileSync(path.join(copia, 'src-tauri/tauri.original.conf.json'), '{}')
  const alumno = path.join(home, 'alumno/arbrain')
  mkdirSync(alumno, { recursive: true })
  const env = { HOME: home } as unknown as NodeJS.ProcessEnv
  assert.equal(esCopiaDeAgente(copia, home), true)
  assert.equal(esCopiaDeAgente(alumno, home), false)
  if (process.platform === 'darwin') {
    assert.throws(() => guardiaDev('phase-development-server', copia, env), /npm run dev/)
  }
  assert.doesNotThrow(() => guardiaDev('phase-development-server', copia, { ...env, ARBRAIN_DEV_AGENTE: '1' }))
  assert.doesNotThrow(() => guardiaDev('phase-production-build', copia, env))
  assert.doesNotThrow(() => guardiaDev('phase-development-server', alumno, env))
  assert.doesNotThrow(() => guardiaDev('phase-development-server', copia, { ...env, VERCEL: '1' }))
})

// v0.2.13: en Windows la comparación de texto entre `argv[1]` y `import.meta.url` fallaba y el script salía 0 sin
// compilar (build y smoke de Windows: «Missing .next/standalone»). Corrido directo, tiene que correr el comando y
// devolver su código.
test('compilacion-pesada: corrido directo corre el comando y devuelve su código; importado no corre nada', async () => {
  const { esPrincipal } = await pesada()
  const propio = path.join(SCRIPTS, 'compilacion-pesada.mjs')
  assert.equal(esPrincipal(pathToFileURL(propio).href, propio), true)
  assert.equal(esPrincipal(pathToFileURL(propio).href, path.join(SCRIPTS, 'dev-agente.mjs')), false)
  assert.equal(esPrincipal(pathToFileURL(propio).href, undefined), false)
  const estado = mkdtempSync(path.join(tmpdir(), 'pesada-'))
  const r = spawnSync(process.execPath, [propio, '--etiqueta', 'prueba', '--', process.execPath, '-e', 'process.exit(7)'],
    { encoding: 'utf8', env: { ...process.env, ARBRAIN_COMPILACION_ESTADO: estado, ARBRAIN_SEMAFORO_SIN_BITACORA: '1' } })
  assert.equal(r.status, 7, r.stderr)
})
