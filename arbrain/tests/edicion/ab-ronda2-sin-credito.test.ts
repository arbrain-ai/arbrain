// A/B del primer arranque, ronda 2 (12 oct 2026) › EL gap «cuenta conectada sin crédito», y el cierre del red team
// OAuth del lado de la ventana (M2: abrir sin argumentos de proceso y decir con qué llave quedó; B2: «¿Cancelaste?»).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esSinSaldo, PATRON_SIN_SALDO, turnoSinCredito } from '../../src/features/primer-arranque/lib/sin-saldo'
import {
  AVISO_SIN_RESPUESTA_MS, quienCobra, reprobarAlVolver, textoConectado, type EstadoLlaves,
} from '../../src/features/primer-arranque/lib/llaves'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('sin crédito: reconoce lo que devuelven OpenRouter, Anthropic y el SDK, y nada más', () => {
  const si = [
    'API Error: 402 {"error":{"message":"Insufficient credits. Add more using https://openrouter.ai/settings/credits","code":402}}',
    'This request requires more credits, or fewer max_tokens. You requested up to 32000 tokens, but can only afford 1200.',
    'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    'Credit balance is too low',
    'El turno murió del lado del agente: API Error: 402 Payment Required',
    'insufficient_balance',
  ]
  for (const t of si) assert.ok(esSinSaldo(t), t)
  const no = [
    'API Error: 401 {"error":{"message":"invalid x-api-key"}}',
    'API Error: 529 Overloaded',
    'fetch failed',
    'El turno llegó al techo de tiempo configurado',
    'Procesé 4021 filas',
    '',
  ]
  for (const t of no) assert.ok(!esSinSaldo(t), t)
  assert.ok(!esSinSaldo(undefined) && !esSinSaldo(402))
})

test('sin crédito: UNA regla para la prueba de la llave y el chat (reexportada, no copiada)', () => {
  const web = fuente('src/features/primer-arranque/lib/sin-saldo.ts')
  assert.match(web, /export \* from '\.\.\/\.\.\/\.\.\/\.\.\/server\/src\/cliente\/sin-saldo\.ts'/)
  assert.ok(!/PATRON_SIN_SALDO\s*=/.test(web), 'la web no define su propia regex')
  assert.match(fuente('server/src/cliente/probar-llave.ts'), /esSinSaldo\(t\)/)
  assert.ok(PATRON_SIN_SALDO instanceof RegExp)
})

test('chat: el turno que falló sin crédito pinta «Recargar» (solo cliente); una respuesta larga sobre facturación no', () => {
  assert.ok(turnoSinCredito({ error: true, diagnostic: 'El turno murió del lado del agente: Credit balance is too low', content: '' }))
  assert.ok(turnoSinCredito({ error: true, diagnostic: 'El turno terminó sin respuesta (success).', content: 'Credit balance is too low' }))
  assert.ok(!turnoSinCredito({ error: false, diagnostic: 'API Error: 402' }), 'sin error no hay nada que recargar')
  assert.ok(!turnoSinCredito({ error: true, diagnostic: 'Abortado.', content: 'Aquí va tu plan de billing: '.repeat(30) }))
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /msg\.error && EDICION_CLIENTE && turnoSinCredito\(msg\) \? \(\s*\/\/[^\n]*\n\s*<RecargaEnChat /)
  const r = fuente('src/features/primer-arranque/components/RecargaEnChat.tsx')
  assert.match(r, /<PasoRecarga cobra=\{cobra\}/)
  assert.match(r, /useReprobarAlVolver\(/)
  // El daemon (cliente) ya no pierde el texto del proveedor cuando el SDK lo deja solo en `result`.
  assert.match(fuente('server/src/agent.ts'), /esEdicionCliente\(\) && !sdkErrors\.length && typeof e\['result'\] === 'string'/)
})

test('primer arranque: la prueba de la llave llega a todo el arranque', () => {
  const p = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(p, /const pruebaLlave = usePruebaConexion\(\)/)
  assert.match(p, /<PanelLlaves onEstado=\{setLlaves\} control=\{pruebaLlave\} \/>/)
  assert.match(p, /paso === 'llaves' && sinCredito \? 'Continuar sin crédito'/)
  assert.match(p, /sinCredito \? <Resumen tono="alerta"><b[^>]*>Conectado, falta crédito\.<\/b>/)
  assert.match(p, /\{sinCredito && \([\s\S]*?<PasoRecarga cobra=\{llaves\.cobra\}/)
  assert.match(p, /useReprobarAlVolver\(paso === 'listo' && sinCredito, pruebaLlave\.probar\)/)
  assert.ok(!/'Levy conectado con tu llave'\s*:\s*'Sin llave/.test(p), 'ya no hay palomita verde por existir la llave')
  // Lo que no existe no lleva palomita (secundaria #3 del A/B).
  assert.match(p, /<Resumen tono="neutro">Computer use no está disponible en este sistema/)
  // La bienvenida ya no promete «Claude con tu cuenta».
  assert.match(p, /con tu propia cuenta: tu Claude Code/)
  assert.ok(!/Hablas con Claude con tu propia cuenta/.test(p))
  const panel = fuente('src/features/primer-arranque/components/PanelLlaves.tsx')
  assert.match(panel, /useReprobarAlVolver\(app && listo && reprobarAlVolver\(prueba\), probar\)/)
  assert.match(panel, /window\.addEventListener\('focus', alVolver\)/)
  assert.match(panel, /document\.addEventListener\('visibilitychange', alVolver\)/)
})

test('al volver a la ventana se prueba de nuevo solo si faltaba crédito', () => {
  assert.equal(reprobarAlVolver({ ok: false, code: 'sin_saldo' }), true)
  for (const p of [null, undefined, { ok: true }, { ok: false, code: 'llave_invalida' }, { ok: false, code: 'sin_red' }]) assert.equal(reprobarAlVolver(p), false)
})

test('recarga va a quien cobra: Anthropic antes que OpenRouter', () => {
  const e = (...n: string[]): EstadoLlaves => ({ llaves: ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'].map(nombre => ({ nombre, presente: n.includes(nombre), vista: null })), listo: true, almacen: 'macos-keychain', disponible: true, error: null })
  assert.equal(quienCobra(e('OPENROUTER_API_KEY')), 'openrouter')
  assert.equal(quienCobra(e('OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY')), 'anthropic')
})

test('M2: al conectar dice con qué llave («Arbrain», últimos 4) y abre el navegador sin argumentos de proceso', () => {
  assert.equal(textoConectado(' sk-or-v1-abcdefghijklmnopqrstuvwxyzWXYZ '), 'Conectado a OpenRouter con la llave «Arbrain» (…WXYZ).')
  const l = fuente('src/features/primer-arranque/lib/llaves.ts')
  assert.match(l, /try \{ await llamar<null>\('abrir_enlace', \{ url \}\) \} catch/)
  const toml = fuente('src-tauri/permissions/cliente.toml')
  assert.match(toml, /"abrir_enlace"\]/)
  const rs = fuente('src-tauri/src/daemon.rs')
  assert.match(rs, /msg_send!\[ws, openURL: u\]/)
  assert.match(fuente('src-tauri/src/lib.rs'), /daemon::abrir_enlace/)
  const panel = fuente('src/features/primer-arranque/components/PanelLlaves.tsx')
  assert.match(panel, /onGuardada\(await llaveGuardar\('OPENROUTER_API_KEY', r\.llave\), conectado\)/)
})

test('B2: tras 20 s esperando, «¿Cancelaste en OpenRouter?» con Reintentar', () => {
  assert.equal(AVISO_SIN_RESPUESTA_MS, 20_000)
  const panel = fuente('src/features/primer-arranque/components/PanelLlaves.tsx')
  assert.match(panel, /setTimeout\(\(\) => setSinRespuesta\(true\), AVISO_SIN_RESPUESTA_MS\)/)
  assert.match(panel, /¿Cancelaste en OpenRouter\?\s*<button[^>]*onClick=\{\(\) => void conectar\(\)\}/)
})

test('B1: la regla estricta del regreso va DESPUÉS de la general en next.config (la última gana)', () => {
  const c = fuente('next.config.ts')
  const general = c.indexOf("source: '/(.*)'"), callback = c.indexOf('source: RUTA_CALLBACK')
  assert.ok(general > 0 && callback > general)
  assert.match(c, /\{ key: 'Content-Security-Policy', value: CSP_CALLBACK \}/)
  // La prueba de verdad está en el humo: la cabecera de la respuesta real.
  assert.match(fuente('tests/edicion/humo/humo.mjs'), /OpenRouter: cabeceras estrictas en la respuesta real/)
})
