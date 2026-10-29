/**
 * Pruebas unitarias del motor del espejo: node --test arbrain/scripts/espejo/pruebas/
 * Sin red, sin llaves reales (las de prueba se arman en tiempo de ejecución), repos git solo en temporales.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escanearArchivo, escanearTexto } from '../lib/escaner.mjs'
import { verificarTope } from '../lib/tope.mjs'
import { cargarCapas, esSoloLider, porQueNunca, rutaConflicto, rutaPorMaquina, viaja } from '../lib/viaja.mjs'
import { elegir, parsearLider, registrarMaquina, rolPara } from '../lib/lider.mjs'
import { ahora, guardarMaquina } from '../lib/estado.mjs'
import { cerca } from '../lib/cerca.mjs'
import { ciclo } from '../lib/sync.mjs'
import { entornoDaemon, rolDe } from '../supervisor.mjs'

const OR = 'sk-' + 'or-v1-' + 'a1'.repeat(32)
const ANT = 'sk-' + 'ant-api03-' + 'b2'.repeat(20)
const capas = cargarCapas('/no/existe')

test('viaja: capa del alumno sí, código no, secretos nunca', () => {
  for (const p of ['.claude/memory/MEMORY.md', '.claude/plan/objetivos.md', '.claude/now.md', '.claude/daily/2026-10-23.nube.md', 'mi-negocio/clientes.md', 'mi-marca/tema.css', '.claude/skills/mi-skill/SKILL.md', 'arbrain/cerebro/meta/diez-clientes.md', 'arbrain/cerebro/lider.json', 'arbrain/cerebro/enviados/nube-1.jsonl'])
    assert.equal(viaja(p, capas), true, p)
  for (const p of ['arbrain/src/app/page.tsx', 'arbrain/scripts/servidor.mjs', '.claude/skills/canvas/SKILL.md', 'CLAUDE.md', '.claude/settings.local.json', '.claude/memory/.env', '.claude/memory/llaves.json', '.claude/plan/google-token.json', 'mi-negocio/oauth-cliente.json', 'mi-negocio/store/x', '.claude/memory/a.db', '.arbrain-espejo/maquina.json', 'mi-negocio/.host-slug', '.claude/knowledge/compile-state.json', '../fuera.md'])
    assert.equal(viaja(p, capas), false, p)
  assert.ok(porQueNunca('arbrain/server/.env'))
  assert.equal(porQueNunca('.env.example'), null)
})

test('solo el líder escribe now.md y reportes', () => {
  assert.ok(esSoloLider('.claude/now.md'))
  assert.ok(esSoloLider('arbrain/cerebro/reportes/brief-2026-10-23.md'))
  assert.ok(!esSoloLider('.claude/plan/objetivos.md'))
})

test('nombres por máquina y de conflicto', () => {
  assert.equal(rutaPorMaquina('.claude/daily/2026-10-23.md', 'nube-ab12'), '.claude/daily/2026-10-23.nube-ab12.md')
  assert.equal(rutaConflicto('.claude/plan/objetivos.md', 'laptop', '2026-10-23-1530'), '.claude/plan/objetivos.conflicto-laptop-2026-10-23-1530.md')
})

test('escáner: llaves y tokens sí, texto normal no, y nunca devuelve el valor', () => {
  const casos = [
    `mi llave ${OR}`, `ANTHROPIC=${ANT}`, '"refresh_token": "' + '1//0' + 'x'.repeat(40) + '"', 'gh' + 'p_' + 'A'.repeat(36),
    '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----', 'OPENROUTER_API_KEY=' + 'abc123'.repeat(4),
  ]
  for (const c of casos) {
    const h = escanearTexto(`hola\n${c}\n`)
    assert.equal(h.length, 1, c)
    assert.equal(h[0].linea, 2)
    assert.ok(!JSON.stringify(h).includes(c.slice(-10)))
  }
  for (const c of ['OPENROUTER_API_KEY=tu-llave-aqui', 'Mi meta: diez clientes antes de marzo', 'sk-or- es el prefijo de OpenRouter'])
    assert.deepEqual(escanearTexto(c), [], c)
  assert.equal(escanearArchivo('.claude/memory/llaves.json', '{}')[0].regla, 'nombre-prohibido')
})

const resp = (status, cuerpo) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo })

test('tope: sin tope no corre, con tope sí, agotado no, sin llave no, Anthropic no verificable', async () => {
  assert.equal((await verificarTope(OR, { fetchFn: resp(200, { data: { limit: null, usage: 3 } }) })).codigo, 'sin_tope')
  const ok = await verificarTope(OR, { fetchFn: resp(200, { data: { limit: 10, usage: 2.5, limit_remaining: 7.5 } }) })
  assert.equal(ok.ok, true); assert.equal(ok.limite, 10)
  assert.equal((await verificarTope(OR, { fetchFn: resp(200, { data: { limit: 10, usage: 10, limit_remaining: 0 } }) })).codigo, 'tope_agotado')
  assert.equal((await verificarTope(OR, { fetchFn: resp(401, {}) })).codigo, 'llave_rechazada')
  assert.equal((await verificarTope(OR, { fetchFn: async () => { throw new Error('red') } })).codigo, 'no_verificado')
  assert.equal((await verificarTope('', {})).codigo, 'sin_llave')
  assert.equal((await verificarTope(ANT, {})).codigo, 'no_verificable')
  let visto = null
  await verificarTope(OR, { fetchFn: async (url, o) => { visto = { url, o }; return resp(200, { data: { limit: 5 } })() } })
  assert.equal(visto.url, 'https://openrouter.ai/api/v1/key')
  assert.equal(visto.o.headers.Authorization, `Bearer ${OR}`)
})

test('rol: solo el declarado manda; sin líder nadie', () => {
  assert.equal(rolPara('nube-1', { lider: 'nube-1' }), 'full')
  assert.equal(rolPara('laptop-1', { lider: 'nube-1' }), 'chat')
  assert.equal(rolPara('laptop-1', null), 'chat')
  assert.equal(parsearLider('{"lider":"NO VALIDO"}'), null)
  assert.equal(parsearLider('basura'), null)
})

// ── Con git, en temporales ───────────────────────────────────────────────────────────────────────────────────────

const g = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
function montar() {
  const raiz = mkdtempSync(join(tmpdir(), 'espejo-u-'))
  const origen = join(raiz, 'origen.git')
  g(raiz, 'init', '-q', '--bare', '-b', 'mi-arbrain', origen)
  const a = join(raiz, 'a')
  mkdirSync(join(a, '.claude', 'memory'), { recursive: true })
  g(raiz, 'init', '-q', '-b', 'mi-arbrain', a)
  g(a, 'config', 'user.name', 'Prueba'); g(a, 'config', 'user.email', 'prueba@ejemplo.com')
  writeFileSync(join(a, 'CLAUDE.md'), '# cerebro\n')
  writeFileSync(join(a, '.claude', 'memory', 'MEMORY.md'), '# memoria\n')
  g(a, 'add', '-A'); g(a, 'commit', '-qm', 'inicio'); g(a, 'remote', 'add', 'origin', origen); g(a, 'push', '-q', '-u', 'origin', 'mi-arbrain')
  return { raiz, origen, a }
}

test('apagado por defecto: rol full, sin guarda, la cerca deja correr sin tocar git', async () => {
  const { a } = montar()
  assert.equal(rolDe(a), 'full')
  assert.deepEqual(entornoDaemon(a), { CLAUDECLAW_ROLE: 'full' })
  const antes = g(a, 'rev-parse', 'HEAD')
  const r = await cerca(a, { rutina: 'brief', llave: '' })
  assert.equal(r.correr, true); assert.equal(r.codigo, 'apagado')
  assert.equal(g(a, 'rev-parse', 'HEAD'), antes)
  assert.ok(!existsSync(join(a, '.arbrain-espejo')))
})

test('elegir exige cita y máquina conocida; nada más escribe lider.json', () => {
  const { a } = montar()
  guardarMaquina(a, { activo: true, host: 'laptop-1', rama: 'mi-arbrain' })
  assert.equal(elegir(a, { lider: 'laptop-1', cita: '', por: 'laptop-1' }).codigo, 'sin_cita')
  assert.equal(elegir(a, { lider: 'nube-9', cita: 'que la nube mande', por: 'laptop-1' }).codigo, 'maquina_desconocida')
  registrarMaquina(a, 'laptop-1'); g(a, 'add', '-A'); g(a, 'commit', '-qm', 'alta')
  assert.equal(elegir(a, { lider: 'laptop-1', cita: 'que mi compu mande', por: 'laptop-1' }).codigo, 'elegido')
  assert.equal(JSON.parse(readFileSync(join(a, 'arbrain/cerebro/lider.json'), 'utf8')).cita, 'que mi compu mande')
  assert.equal(rolDe(a), 'full')
  assert.equal(entornoDaemon(a).CLAUDECLAW_ROLE, 'full')
  assert.ok(entornoDaemon(a).ARBRAIN_ESPEJO_GUARDA.endsWith('espejo.mjs'))
})

test('ciclo: sube lo del cerebro, no el código ni los secretos', () => {
  const { a, origen } = montar()
  guardarMaquina(a, { activo: true, host: 'laptop-1', rama: 'mi-arbrain' })
  writeFileSync(join(a, '.claude', 'memory', 'nueva.md'), 'idea\n')
  writeFileSync(join(a, '.claude', 'memory', 'llaves.json'), '{}\n')
  writeFileSync(join(a, '.claude', 'memory', 'pegada.md'), `la llave: ${OR}\n`)
  writeFileSync(join(a, 'CLAUDE.md'), '# cambio de código local\n')
  const r = ciclo(a, { host: 'laptop-1', rama: 'mi-arbrain' }, {})
  assert.equal(r.codigo, 'ok', r.motivo)
  const subido = g(origen, 'log', '-p', 'mi-arbrain')
  assert.ok(subido.includes('nueva.md'))
  assert.ok(!subido.includes('llaves.json'))
  assert.ok(!subido.includes('pegada.md'))
  assert.ok(!subido.includes(OR))
  assert.ok(!subido.includes('cambio de código local'))
  assert.deepEqual(r.rechazados.map((x) => x.ruta).sort(), ['.claude/memory/llaves.json', '.claude/memory/pegada.md'])
})

test('ciclo: un commit hecho a mano con una llave bloquea toda la subida', () => {
  const { a, origen } = montar()
  guardarMaquina(a, { activo: true, host: 'laptop-1', rama: 'mi-arbrain' })
  writeFileSync(join(a, '.claude', 'memory', 'a-mano.md'), `token ${OR}\n`)
  g(a, 'add', '-A'); g(a, 'commit', '-qm', 'a mano')
  const r = ciclo(a, { host: 'laptop-1', rama: 'mi-arbrain' }, {})
  assert.equal(r.codigo, 'secreto')
  assert.ok(!g(origen, 'log', '-p', 'mi-arbrain').includes(OR))
})

// ── Cableado con el instalador y el modo servidor (N4, 23 oct) ─────────────────────────────────────────────────────

test('ciclo: devuelve los avisos nuevos (el modo servidor los registra) y no repite los viejos', () => {
  const { a } = montar()
  guardarMaquina(a, { activo: true, host: 'laptop-1', rama: 'mi-arbrain' })
  writeFileSync(join(a, '.claude', 'memory', 'pegada.md'), `la llave: ${OR}\n`)
  const r1 = ciclo(a, { host: 'laptop-1', rama: 'mi-arbrain' }, {})
  const tipos = r1.avisos.map((x) => x.tipo).sort()
  assert.deepEqual(tipos, ['secreto_rechazado', 'sin_lider'])
  assert.ok(r1.avisos.every((x) => !x.texto.includes(OR)), 'ningún aviso lleva la llave')
  const r2 = ciclo(a, { host: 'laptop-1', rama: 'mi-arbrain' }, {})
  assert.deepEqual(r2.avisos, [])
})

test('ciclo: la ventana avisa cuando el líder calla y nunca se promueve', () => {
  const { a } = montar()
  guardarMaquina(a, { activo: true, host: 'laptop-1', rama: 'mi-arbrain' })
  registrarMaquina(a, 'laptop-1'); registrarMaquina(a, 'nube-x'); g(a, 'add', 'arbrain'); g(a, 'commit', '-qm', 'altas')
  assert.equal(elegir(a, { lider: 'nube-x', cita: 'que la nube mande', por: 'laptop-1' }).codigo, 'elegido')
  const tarde = new Date(Date.now() + 26 * 3_600_000).toISOString()
  const r = ciclo(a, { host: 'laptop-1', rama: 'mi-arbrain' }, { ARBRAIN_ESPEJO_AHORA: tarde })
  const aviso = r.avisos.find((x) => x.tipo === 'lider_sin_latido')
  assert.ok(aviso, JSON.stringify(r.avisos))
  assert.match(aviso.texto, /nube-x.*no da señales.*no toma el mando sola/)
  assert.equal(r.rol, 'chat')
  assert.equal(rolDe(a), 'chat')
})

test('lider elegir --cita-stdin: la cita entra por stdin, nunca armada en un comando', () => {
  const { a } = montar()
  const espejo = join(import.meta.dirname, '..', 'espejo.mjs')
  const correr = (args, entrada) => execFileSync(process.execPath, [espejo, ...args, '--cerebro', a], { input: entrada, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  assert.match(correr(['activar', '--host', 'nube-x']), /^ESPEJO_ACTIVO /)
  const cita = 'que la nube mande; $(rm -rf ~) «literal»'
  assert.match(correr(['lider', 'elegir', 'nube-x', '--cita-stdin'], cita), /^ESPEJO_ELEGIDO /)
  assert.equal(JSON.parse(readFileSync(join(a, 'arbrain/cerebro/lider.json'), 'utf8')).cita, cita)
  assert.equal(rolDe(a), 'full')
})

test('reloj de prueba: desfase de libfaketime para la cerca, sin sumarlo dos veces', () => {
  const dir = mkdtempSync(join(tmpdir(), 'espejo-reloj-'))
  const f = join(dir, 'faketimerc'); writeFileSync(f, '+86400\n')
  const base = Date.now()
  const d = ahora({ ARBRAIN_ESPEJO_RELOJ_ARCHIVO: f }).getTime() - base
  assert.ok(d >= 86_399_000 && d < 86_460_000, String(d))
  assert.ok(Math.abs(ahora({ ARBRAIN_ESPEJO_RELOJ_ARCHIVO: f, LD_PRELOAD: '/usr/local/lib/faketime/libfaketimeMT.so.1' }).getTime() - base) < 60_000)
  assert.ok(Math.abs(ahora({}).getTime() - base) < 60_000)
  writeFileSync(f, 'basura'); assert.ok(Math.abs(ahora({ ARBRAIN_ESPEJO_RELOJ_ARCHIVO: f }).getTime() - base) < 60_000)
})
