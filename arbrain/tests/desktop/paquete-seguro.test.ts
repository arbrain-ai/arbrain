// Paquete seguro (AUDITORIA I1, 10 oct 2026): ninguna llave ni .env viaja en la app para clientes.
// Los valores de estas pruebas son falsos y se generan aquí; ninguno sale de un .env real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { archivoProhibido, buscarFugas, limpiarSecretos, secretosDe, esEdicionCliente } from '../../scripts/paquete-seguro.mjs'

const falso = (prefijo: string, n: number) => prefijo + 'x'.repeat(n)

function paquete(): string {
  const dir = mkdtempSync(join(tmpdir(), 'paquete-seguro-'))
  mkdirSync(join(dir, '.next/server'), { recursive: true })
  writeFileSync(join(dir, 'server.js'), 'require("next")\n')
  writeFileSync(join(dir, '.next/server/page.js'), 'const url = process.env.SUPABASE_SERVICE_ROLE_KEY\n')
  return dir
}

test('archivos prohibidos: .env y variantes sí, plantillas .example no', () => {
  assert.ok(archivoProhibido('.env'))
  assert.ok(archivoProhibido('.env.local'))
  assert.ok(archivoProhibido('.env.production.local'))
  assert.ok(archivoProhibido('.mcp.json'))
  assert.ok(archivoProhibido('claudeclaw.db'))
  assert.ok(archivoProhibido('claudeclaw.db-wal'))
  assert.equal(archivoProhibido('.env.local.example'), undefined)
  assert.equal(archivoProhibido('server.js'), undefined)
})

test('un .env dentro del paquete es fuga; limpiarSecretos lo quita y ya no hay fuga', () => {
  const dir = paquete()
  writeFileSync(join(dir, '.env.local'), 'X=1\n')
  writeFileSync(join(dir, '.env.local.example'), 'X=\n')
  assert.equal(buscarFugas(dir).fugas.length, 1)
  assert.deepEqual(limpiarSecretos(dir), ['.env.local'])
  assert.equal(existsSync(join(dir, '.env.local.example')), true)
  assert.equal(buscarFugas(dir).fugas.length, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('el valor de un secreto del repo incrustado en un .js es fuga, y se reporta el nombre, nunca el valor', () => {
  const dir = paquete()
  const env = join(dir, '..', `env-${Date.now()}`)
  const valor = falso('valor-secreto-de-prueba-', 24)
  writeFileSync(env, `SUPABASE_SERVICE_ROLE_KEY=${valor}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${falso('publica-', 30)}\nCORTA=abc\n`)
  const secretos = secretosDe([env])
  assert.deepEqual(secretos.map((s: { nombre: string }) => s.nombre), ['SUPABASE_SERVICE_ROLE_KEY'])
  writeFileSync(join(dir, '.next/server/chunk.js'), `var k="${valor}";`)
  const { fugas } = buscarFugas(dir, { secretos })
  assert.equal(fugas.length, 1)
  assert.match(fugas[0].motivo, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(JSON.stringify(fugas), new RegExp(valor))
  rmSync(dir, { recursive: true, force: true }); rmSync(env, { force: true })
})

test('formatos de llave conocidos y JWT service_role son fuga; el JWT anónimo no', () => {
  const dir = paquete()
  const jwt = (role: string) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url'), 'firmafirmafirmafirma'].join('.')
  writeFileSync(join(dir, 'anon.js'), `const k="${jwt('anon')}"`)
  assert.equal(buscarFugas(dir).fugas.length, 0)
  writeFileSync(join(dir, 'admin.js'), `const k="${jwt('service_role')}"`)
  writeFileSync(join(dir, 'gh.js'), `const t="${falso('ghp_', 36)}"`)
  const motivos = buscarFugas(dir).fugas.map((f: { motivo: string }) => f.motivo).sort()
  assert.deepEqual(motivos, ['JWT de Supabase con rol service_role', 'token de GitHub'])
  rmSync(dir, { recursive: true, force: true })
})

test('edición cliente solo con ARBRAIN_EDICION=cliente', () => {
  assert.equal(esEdicionCliente({}), false)
  assert.equal(esEdicionCliente({ ARBRAIN_EDICION: 'cliente' }), true)
  assert.equal(esEdicionCliente({ ARBRAIN_EDICION: 'daniel' }), false)
})

test('prepare-tauri-resources: en edición cliente un .env se quita y una llave incrustada detiene el build; sin la variable no se toca nada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'prepare-'))
  const script = resolve(__dirname, '../../scripts/prepare-tauri-resources.mjs')
  mkdirSync(join(raiz, 'scripts'), { recursive: true })
  for (const f of ['prepare-tauri-resources.mjs', 'paquete-seguro.mjs']) writeFileSync(join(raiz, 'scripts', f), readFileSync(resolve(__dirname, '../../scripts', f)))
  mkdirSync(join(raiz, '.next/standalone'), { recursive: true })
  writeFileSync(join(raiz, '.next/standalone/server.js'), '//\n')
  writeFileSync(join(raiz, '.next/standalone/.env.local'), 'A=1\n')
  // ARBRAIN_SIN_DAEMON: aquí solo se prueba la limpieza de la web (Node embebido y daemon tienen su propia prueba).
  const correr = (env: Record<string, string>) => spawnSync(process.execPath, [join(raiz, 'scripts/prepare-tauri-resources.mjs')], { cwd: raiz, env: { ...process.env, ARBRAIN_EDICION: '', ARBRAIN_SIN_DAEMON: '1', ...env }, encoding: 'utf8' })
  const destino = join(raiz, 'src-tauri/resources/next/standalone')

  let r = correr({})
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(join(destino, '.env.local')), true, 'la instalación de Daniel conserva su respaldo')

  r = correr({ ARBRAIN_EDICION: 'cliente' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(join(destino, '.env.local')), false)

  writeFileSync(join(raiz, '.next/standalone/llave.js'), `x="${falso('sk-ant-api03-', 30)}"`)
  r = correr({ ARBRAIN_EDICION: 'cliente' })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /Build detenido[\s\S]*llave\.js: llave de Anthropic/)
  assert.ok(existsSync(script))
  rmSync(raiz, { recursive: true, force: true })
})

test('public/ (se sirve en la web y viaja en el paquete) no lleva llaves ni .env: ni en código ni en metadatos de imágenes', () => {
  // 10 oct 2026: tres imágenes de agentes traían OPENROUTER_API_KEY en su XMP. Se limpiaron; esto evita que vuelva.
  const { fugas } = buscarFugas(resolve(__dirname, '../../public'))
  assert.deepEqual(fugas, [])
})
