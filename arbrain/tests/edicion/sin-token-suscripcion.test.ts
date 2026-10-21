// Sin token de la suscripción de claude.ai en la edición cliente (decisión del autor, 12 oct 2026): Arbrain nunca pide,
// captura, guarda ni pasa un `claude setup-token` / `sk-ant-oat…` / CLAUDE_CODE_OAUTH_TOKEN. Esta prueba cierra cada
// camino: la pantalla, la validación, el llavero de la app y lo que lee la persona en la guía.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const oat = 'sk-ant-oat01-' + 'b'.repeat(80)

test('validación: un token de suscripción se rechaza en cualquier campo y no hay nombre de llave para él', async () => {
  const { validarLlave, esTokenDeSuscripcion, quienCobra } = await import('../../src/features/primer-arranque/lib/llaves')
  for (const v of [oat, ` "${oat}" `, 'SK-ANT-OAT01-' + 'x'.repeat(40)]) {
    assert.equal(esTokenDeSuscripcion(v), true)
    assert.equal(validarLlave(v, 'claude').ok, false)
    assert.equal(validarLlave(v, 'openrouter').ok, false)
  }
  assert.equal(esTokenDeSuscripcion('sk-ant-api03-' + 'a'.repeat(80)), false)
  // Una llave vieja que alguien tuviera guardada no cambia quién cobra.
  const estado = { llaves: [{ nombre: 'CLAUDE_CODE_OAUTH_TOKEN', presente: true, vista: null }, { nombre: 'OPENROUTER_API_KEY', presente: true, vista: null }], listo: true, almacen: 'macos-keychain', disponible: true, error: null }
  assert.equal(quienCobra(estado), 'openrouter')
})

test('pantalla y puente: ni la opción, ni el comando, ni el nombre del token', () => {
  for (const r of ['src/features/primer-arranque/components/PanelLlaves.tsx', 'src/features/primer-arranque/lib/llaves.ts', 'src/features/primer-arranque/components/PrimerArranque.tsx']) {
    const s = fuente(r)
    assert.ok(!s.includes('CLAUDE_CODE_OAUTH_TOKEN'), r)
    assert.ok(!/claude setup-token'|Token de tu suscripción de Claude|placeholder: 'sk-ant-oat/.test(s), r)
  }
  assert.match(fuente('src/features/primer-arranque/lib/llaves.ts'), /export type NombreLlave = 'ANTHROPIC_API_KEY' \| 'OPENROUTER_API_KEY' \| 'GROQ_API_KEY'\n/)
})

test('app de escritorio: el llavero solo acepta dos llaves de chat (más la de voz) y el token nunca llega heredado al daemon', () => {
  const llaves = fuente('src-tauri/src/llaves.rs')
  // 21 oct 2026 (carril VOZ): la de Groq para dictar es la única extra y nunca cuenta como «listo».
  assert.match(llaves, /pub const LLAVES: \[&str; 3\] = \["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"\];/)
  assert.match(llaves, /pub const LLAVES_CHAT: \[&str; 2\] = \["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"\];/)
  const daemon = fuente('src-tauri/src/daemon.rs')
  const prohibidas = daemon.slice(daemon.indexOf('const HEREDADAS_PROHIBIDAS'), daemon.indexOf('];', daemon.indexOf('const HEREDADAS_PROHIBIDAS')))
  for (const n of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'GROQ_API_KEY']) assert.ok(prohibidas.includes(`"${n}"`), n)
})

test('lo que lee la persona: la guía y el README no le piden el token', () => {
  for (const r of ['empaquetado/plantillas/GUIA-INSTALACION.plantilla.md', 'empaquetado/generador/plantillas/README.plantilla.md']) {
    const s = fuente(r)
    assert.ok(!/setup-token|sk-ant-oat|suscripción de Claude/.test(s), r)
  }
})
