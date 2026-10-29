// Tu cerebro en la nube (23 oct 2026, modo espejo N3): la unidad de systemd de sistema y la llave con tope.
// La instalación de verdad la prueba arbrain/scripts/instalar/nube-prueba.sh en un Ubuntu real (runner y contenedor).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { comandoArranque, unidadSystemdSistema } from '../../scripts/servidor/arranque-auto.mjs'
import { baseOpenRouter, decidirTope } from '../../scripts/instalar/nube-llave.mjs'

const LLAVE = join(import.meta.dirname, '..', '..', 'scripts', 'instalar', 'nube-llave.mjs')

test('nube: unidad de sistema con usuario sin root, arranque al boot y reinicio siempre', () => {
  const comando = comandoArranque({ node: '/home/arbrain/.arbrain/node/bin/node', script: '/home/arbrain/Arbrain/arbrain/scripts/servidor.mjs', datos: '/home/arbrain/.local/share/ai.arbrain.servidor' })
  const u = unidadSystemdSistema({ comando, path: '/home/arbrain/.arbrain/node/bin:/usr/bin', usuario: 'arbrain', home: '/home/arbrain', dir: '/home/arbrain/Arbrain/arbrain' })
  assert.match(u, /^User=arbrain$/m)
  assert.match(u, /^Group=arbrain$/m)
  assert.match(u, /^Restart=always$/m)
  assert.match(u, /^WantedBy=multi-user\.target$/m)
  assert.match(u, /^NoNewPrivileges=yes$/m)
  assert.match(u, /^WorkingDirectory=\/home\/arbrain\/Arbrain\/arbrain$/m)
  assert.match(u, /^ExecStart=".*\/node" ".*\/servidor\.mjs" "iniciar" "--sin-navegador" "--datos" "\/home\/arbrain\/\.local\/share\/ai\.arbrain\.servidor"$/m)
  assert.match(u, /^Environment="HOME=\/home\/arbrain" "PATH=/m)
  assert.match(u, /^Environment=.* "ARBRAIN_SERVIDOR_NUBE=1"$/m, 'el daemon sabe que vive en un servidor sin pantalla (login de Claude por terminal)')
  assert.doesNotMatch(u, /--puerto|0\.0\.0\.0/, 'la nube escucha donde siempre: 127.0.0.1')
  assert.throws(() => unidadSystemdSistema({ comando, path: '/usr/bin', usuario: 'root; rm', home: '/home/x', dir: '/x' }), /usuario no válido/)
  assert.throws(() => unidadSystemdSistema({ comando, path: '/usr/bin', usuario: 'arbrain', home: 'relativa', dir: '/x' }), /ruta no válida/)
  assert.throws(() => unidadSystemdSistema({ comando, path: '/usr/bin', usuario: 'arbrain', home: '/home/a', dir: '/x\nExecStartPre=/bin/sh' }), /ruta no válida/)
})

test('nube: la llave de OpenRouter solo se acepta con tope', () => {
  assert.equal(decidirTope({ data: { limit: null } }).ok, false)
  assert.match(decidirTope({ data: { limit: null } }).motivo!, /tope/)
  assert.equal(decidirTope({ data: {} }).ok, false)
  assert.equal(decidirTope({ data: { limit: 0 } }).ok, false)
  assert.equal(decidirTope({ data: { limit: -3 } }).ok, false)
  assert.equal(decidirTope(null).ok, false)
  assert.deepEqual(decidirTope({ data: { limit: 10, limit_remaining: 7.5 } }), { ok: true, tope: 10, restante: 7.5, libre: false })
})

test('nube: la dirección de OpenRouter solo cambia hacia 127.0.0.1 (pruebas)', () => {
  assert.equal(baseOpenRouter({}), 'https://openrouter.ai')
  assert.equal(baseOpenRouter({ NUBE_OPENROUTER_API: 'http://127.0.0.1:8787/' }), 'http://127.0.0.1:8787')
  assert.throws(() => baseOpenRouter({ NUBE_OPENROUTER_API: 'https://ladron.example' }), /127\.0\.0\.1/)
  assert.throws(() => baseOpenRouter({ NUBE_OPENROUTER_API: 'http://127.0.0.1.ladron.example:80' }), /127\.0\.0\.1/)
})

function correr(args: string[], entrada: string, env: Record<string, string>) {
  return new Promise<string>((ok) => {
    const h = spawn(process.execPath, [LLAVE, ...args], { env: { ...process.env, ...env } })
    let s = ''
    h.stdout.on('data', (d) => { s += d })
    h.on('close', () => ok(s))
    h.stdin.end(entrada)
  })
}

test('nube: guardar la llave contra un OpenRouter falso; nunca se imprime', async () => {
  const srv = http.createServer((req, res) => {
    const a = String(req.headers.authorization ?? '')
    if (req.url !== '/api/v1/key' || !a.startsWith('Bearer sk-or-')) { res.writeHead(401); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: { limit: a.includes('sintope') ? null : 10, limit_remaining: 9 } }))
  })
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()))
  const puerto = (srv.address() as { port: number }).port
  const datos = mkdtempSync(join(tmpdir(), 'nube-llave-'))
  const env = { NUBE_OPENROUTER_API: `http://127.0.0.1:${puerto}` }
  try {
    const sin = await correr(['guardar', '--datos', datos], 'sk-or-v1-sintope-abcdefghijklmnop\n', env)
    assert.match(sin, /^NUBE_LLAVE_FALTA .*tope/m)
    const sus = await correr(['guardar', '--datos', datos], 'sk-ant-oat01-abcdefghijklmnop\n', env)
    assert.match(sus, /^NUBE_LLAVE_FALTA .*suscripción/m)
    assert.match(await correr(['estado', '--datos', datos], '', env), /^NUBE_LLAVE estado=falta$/m)
    const con = await correr(['guardar', '--datos', datos], 'sk-or-v1-contope-abcdefghijklmnop1234\n', env)
    assert.match(con, /^NUBE_LLAVE_OK tope=10 restante=9$/m)
    assert.doesNotMatch(con, /abcdefghijklmnop/, 'la llave nunca sale a la pantalla')
    const llaves = join(datos, 'daemon', 'config', 'llaves.json')
    assert.equal(JSON.parse(readFileSync(llaves, 'utf8')).OPENROUTER_API_KEY, 'sk-or-v1-contope-abcdefghijklmnop1234')
    if (process.platform !== 'win32') assert.equal(statSync(llaves).mode & 0o777, 0o600)
    assert.doesNotMatch(readFileSync(join(datos, 'daemon', 'config', 'nube-llave.json'), 'utf8'), /abcdefghijklmnop/)
    assert.match(await correr(['estado', '--datos', datos], '', env), /^NUBE_LLAVE estado=tope:10$/m)
    assert.match(await correr(['guardar', '--datos', datos], 'sk-or-v1-x\n', { NUBE_OPENROUTER_API: 'https://otro.example' }), /^NUBE_LLAVE_FALTA .*127\.0\.0\.1/m)
  } finally {
    srv.close()
  }
})
