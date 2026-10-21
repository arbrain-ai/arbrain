// A/B del primer arranque, ronda 3 (12 oct 2026) › arreglos de diseño baratos: jerarquía de botones, textos de error
// de la disposición vieja, bienvenida sin pedidos repetidos, nombre en lugar de «Tú» y tarjeta centrada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { validarLlave } from '../../src/features/primer-arranque/lib/llaves'
import { mensajeBienvenida, NOMBRE_SIN_DAR, nombreVisible, PEDIDOS_BIENVENIDA } from '../../src/features/primer-arranque/textos/bienvenida'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const error = (v: string, e: 'claude' | 'openrouter') => { const r = validarLlave(v, e); assert.equal(r.ok, false, v); return r.ok ? '' : r.error }
const relleno = 'A'.repeat(40)

test('1 · jerarquía: sin llave o sin crédito, seguir de largo es secundario; con todo listo, primario', () => {
  const p = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(p, /const botonDiscreto = \(paso === 'llaves' && \(!llavesListas \|\| sinCredito\)\) \|\| \(paso === 'listo' && sinCredito\)/)
  assert.match(p, /className=\{`\$\{botonDiscreto \? 'btn-secondary' : 'btn-primary'\} min-h-11/)
  // Lo recomendado sigue primario: «Conectar con OpenRouter» sin llave y «Recargar» sin crédito.
  const panel = fuente('src/features/primer-arranque/components/PanelLlaves.tsx')
  assert.match(panel, /<ConectarOpenRouter principal=\{!listo\}/)
  assert.match(panel, /className="btn-primary[^"]*" onClick=\{[^\n]*RECARGAR\[cobra\]/)
})

test('2 · los errores de formato nombran la disposición actual (Conectar con OpenRouter / Otras formas)', () => {
  const textos = [
    error(`sk-ant-api03-${relleno}`, 'openrouter'),
    error(`sk-ant-oat01-${relleno}`, 'openrouter'),
    error(`sk-or-v1-${relleno}`, 'claude'),
  ]
  assert.match(textos[0], /elige «API key de Anthropic»/)
  assert.match(textos[1], /Arbrain no lo usa[\s\S]*elige «API key de Anthropic»/)
  assert.match(textos[2], /usa «Conectar con OpenRouter»[\s\S]*elige «Pegar una llave de OpenRouter»/)
  for (const t of textos) assert.match(t, /«Otras formas»/)
  // Esos nombres existen tal cual en el panel.
  const panel = fuente('src/features/primer-arranque/components/PanelLlaves.tsx')
  for (const t of ['API key de Anthropic', 'Pegar una llave de OpenRouter', 'Conectar con OpenRouter', 'Otras formas']) assert.ok(panel.includes(t), t)
  // Ningún texto de la carpeta del primer arranque habla de la disposición vieja.
  const viejo = /Pégala (arriba|abajo)|campo opcional|inicia sesión con Claude|Hablas con Claude|Paso 5 de 5/i
  const raiz = new URL('../../src/features/primer-arranque/', import.meta.url).pathname
  const recorrer = (d: string): string[] => readdirSync(d).flatMap(f => { const r = join(d, f); return statSync(r).isDirectory() ? recorrer(r) : [r] })
  for (const f of recorrer(raiz)) assert.ok(!viejo.test(readFileSync(f, 'utf8')), f)
  assert.ok(!viejo.test(fuente('public/splash.html')))
})

test('3 · bienvenida: los pedidos van solo en los botones, con una línea que invita a tocarlos', () => {
  const m = mensajeBienvenida('Fulano')
  for (const p of PEDIDOS_BIENVENIDA) { assert.ok(!m.includes(p.texto), p.texto); assert.ok(!m.includes(p.para), p.para) }
  assert.match(m, /toca uno de los botones de abajo o escríbeme lo tuyo/)
  // El «para qué» de cada pedido viaja en el botón.
  assert.match(fuente('src/features/chat/components/ChatPanel.tsx'), /onClick=\{\(\) => handleSend\(p\.texto\)\}\s*title=\{p\.para/)
})

test('4 · nombre: el que dio la persona; sin nombre, «Tú» en el pie y Levy saluda sin nombre', () => {
  assert.equal(nombreVisible('Fulano de Tal'), 'Fulano')
  assert.equal(nombreVisible('  '), NOMBRE_SIN_DAR)
  assert.equal(nombreVisible(null), 'Tú')
  assert.match(mensajeBienvenida('Fulano de Tal'), /^Hola, Fulano\. Soy Levy\./)
  assert.match(mensajeBienvenida(null), /^Hola\. Soy Levy\./)
  assert.match(mensajeBienvenida(''), /^Hola\. Soy Levy\./)
  const auth = fuente('src/shared/contexts/auth-context.tsx')
  // Solo en cliente: el nombre sale del primer arranque; la instalación original sigue leyendo /api/equipo.
  assert.match(auth, /if \(esEdicionCliente\(\)\) \{[\s\S]*?fetch\('\/api\/primer-arranque'[\s\S]*?full_name: nombreVisible\(d\?\.estado\?\.nombre\)[\s\S]*?return \(\) => \{ vivo = false \}\s*\}\s*fetch\('\/api\/equipo'/)
  // El saludo del chat vacío no dice «Buenas tardes, Tú».
  assert.match(fuente('src/features/chat/components/ChatPanel.tsx'), /profile\?\.full_name && !\(EDICION_CLIENTE && profile\.full_name === NOMBRE_SIN_DAR\)/)
})

test('5 · pantalla grande: la tarjeta del primer arranque va centrada en vertical', () => {
  const p = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(p, /className="relative flex min-h-\[100dvh\] w-full flex-col items-center justify-center overflow-y-auto/)
})
