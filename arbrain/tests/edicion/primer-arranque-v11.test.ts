// Mejoras secundarias del A/B del primer arranque (empaquetado v1.1, 12 oct 2026): pedidos de un clic, promesas que la
// v1 cumple, errores del splash en lenguaje de alumno, monitoreo oculto sin destino y nombre legible del modelo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { PASOS, pasosVisibles } from '../../src/features/primer-arranque/lib/pasos'
import { FUENTE_BIENVENIDA, mensajeBienvenida, PEDIDOS_BIENVENIDA, soloBienvenida } from '../../src/features/primer-arranque/textos/bienvenida'
import { nombreModelo } from '../../src/shared/lib/uso-modelo'
import { modelDisplayName } from '../../src/features/chat/stores/model-store'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
/** La plantilla del CLAUDE.md del alumno: en el repo original vive en empaquetado/plantillas; en la copia ya es el CLAUDE.md de la raíz. */
const plantillaClaude = () => {
  const enRepo = new URL('../../empaquetado/plantillas/CLAUDE.plantilla.md', import.meta.url)
  return readFileSync(existsSync(enRepo) ? enRepo : new URL('../../../CLAUDE.md', import.meta.url), 'utf8')
}

test('1 · los tres pedidos del primer mensaje son botones que envían ese texto tal cual', () => {
  const m = mensajeBienvenida('Fulano de Tal')
  assert.equal(PEDIDOS_BIENVENIDA.length, 3)
  // A/B ronda 3: los pedidos viven solo en los botones (ya no se repiten como viñetas en el texto).
  for (const p of PEDIDOS_BIENVENIDA) assert.ok(!m.includes(p.texto), p.texto)
  assert.ok(soloBienvenida([{ role: 'assistant', metadata: { source: FUENTE_BIENVENIDA } }]))
  assert.ok(!soloBienvenida([{ role: 'assistant', metadata: { source: FUENTE_BIENVENIDA } }, { role: 'user' }]), 'al primer envío desaparecen')
  assert.ok(!soloBienvenida([{ role: 'assistant', metadata: { source: 'cron' } }]))
  assert.ok(!soloBienvenida([]))
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /EDICION_CLIENTE && !loading && soloBienvenida\(messages\)/)
  assert.match(chat, /onClick=\{\(\) => handleSend\(p\.texto\)\}/)
  // El estado vacío del alumno ya no ofrece «Mi día», métricas ni YouTube; el de Daniel sigue igual.
  assert.match(chat, /EDICION_CLIENTE \? PEDIDOS_BIENVENIDA\.map/)
  assert.match(chat, /'Ideas de video'/)
  assert.match(fuente('src/app/api/primer-arranque/route.ts'), /metadata: \{ source: FUENTE_BIENVENIDA \}/)
})

test('2 · el primer mensaje y la plantilla de Levy no prometen calendario ni video; computer use solo donde existe', () => {
  const m = mensajeBienvenida(null)
  const sinLimite = m.split('\n').filter(l => !/versión próxima/.test(l)).join('\n')
  assert.ok(!/calendario|agenda|video|computer use|pantalla/i.test(sinLimite), 'solo se nombran como límite')
  assert.match(m, /Computer use[^\n]*calendario[^\n]*video[^\n]*versión próxima/)
  const c = plantillaClaude()
  assert.ok(!/edicion-por-voz/.test(c), 'la tabla de intenciones no ofrece editar video')
  assert.ok(!/agenda de hoy/.test(c))
  assert.match(c, /Promete solo lo que esta versión trae/)
  assert.match(c, /\*\*no\*\* trae calendario conectado ni edición de\s+video/)
  // 0.1.2: computer use sí en macOS y Windows (apagado en cada apertura); en Linux no.
  assert.match(c, /Linux \*\*no\*\* tiene computer use/)
  assert.match(c, /Nace apagado en cada apertura/)
})

test('3 · errores del splash: qué pasó y qué hacer, con el texto técnico intacto en «Ver detalles»', () => {
  const html = fuente('public/splash.html')
  const js = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'))
  const ctx: Record<string, unknown> = { window: {}, document: {} }
  runInNewContext(js, ctx)
  const traducir = ctx.traducirErrorArranque as (m: string) => { titulo: string; hacer: string; detalle: string }
  const casos: Array<[string, RegExp]> = [
    ['El daemon no viene en esta app (falta resources/daemon).', /faltan piezas/],
    ['Esta app no trae su servidor web (falta resources/next/standalone).', /faltan piezas/],
    ['No hay un puerto libre en 127.0.0.1', /puerto libre/],
    ['No se pudo crear la carpeta de datos: Permission denied (os error 13)', /carpeta/],
    ['El daemon se cayó 5 veces en 5 minutos; se deja de reintentar. Revisa logs/daemon.log.', /varias veces/],
    ['Next standalone server did not become ready on http://127.0.0.1:41234 within 30s', /no terminó de arrancar/],
    ['algo nunca visto', /Algo impidió/],
  ]
  for (const [crudo, titulo] of casos) {
    const t = traducir(crudo)
    assert.match(t.titulo, titulo, crudo)
    assert.equal(t.detalle, crudo, 'el detalle técnico no se pierde')
    assert.ok(!/resources\/|daemon|standalone|127\.0\.0\.1/.test(t.titulo + t.hacer), `sin jerga: ${t.titulo} ${t.hacer}`)
  }
  assert.match(html, /<details><summary>Ver detalles<\/summary><pre id="error-detalle"><\/pre><\/details>/)
  assert.match(html, /textContent = t\.detalle/, 'el detalle se pinta como texto, nunca como HTML')
})

test('4 · el paso de monitoreo solo aparece si el build tiene a dónde enviar', () => {
  assert.deepEqual(pasosVisibles(false), ['bienvenida', 'legal', 'llaves', 'listo'])
  assert.deepEqual(pasosVisibles(true), ['bienvenida', 'legal', 'llaves', 'monitoreo', 'listo'])
  assert.deepEqual(pasosVisibles(true, true), [...PASOS], 'con computer use (macOS y Windows, 0.1.2) también su paso')
  const c = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(c, /endpoint_configurado === true/)
  assert.match(c, /paso === 'monitoreo' && conMonitoreo\) await fijarConsentimiento/)
  // Ajustes › Privacidad conserva el ajuste.
  assert.match(fuente('src/features/configuracion/components/ModalAjustes.tsx'), /<SeccionPrivacidad \/>/)
  assert.match(fuente('src/features/primer-arranque/components/SeccionPrivacidad.tsx'), /<PanelMonitoreo/)
})

test('5 · nombre legible del modelo: los ids de OpenRouter de Claude dejan de verse crudos', () => {
  assert.equal(nombreModelo('anthropic/claude-sonnet-4.5'), 'Sonnet 4.5')
  assert.equal(nombreModelo('anthropic/claude-opus-4.1'), 'Opus 4.1')
  assert.equal(nombreModelo('anthropic/claude-haiku-4.5'), 'Haiku 4.5')
  assert.equal(modelDisplayName('anthropic/claude-sonnet-4.5'), 'Sonnet 4.5')
  assert.equal(modelDisplayName('claude-sonnet-4-5'), 'Sonnet 4.5')
  // Lo de Daniel, igual.
  assert.equal(nombreModelo('claude-opus-5-5[1m]'), 'Opus 5.5')
  assert.equal(nombreModelo('openai/gpt-6-luna'), 'GPT-6 Luna')
  assert.equal(nombreModelo('otro/modelo-x'), 'modelo-x')
})
