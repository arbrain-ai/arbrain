// Modelo sin filtro en la edición del alumno (v0.2.23, 4 nov 2026; Daniel: «el modelo sin filtro también metámoslo en una
// siguiente versión»). El alumno lo conecta con SU llave de abliteration.ai desde Ajustes › Sin filtro; nunca viaja una
// llave del autor. Esta prueba cierra la web: el espacio existe en cliente, la llave se valida y se guarda por el mismo
// puente que las demás, el modo servidor la acepta y no la hereda de la terminal, y la UI monta el panel con su paso a paso.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('el espacio abliterated existe en las dos ediciones; las cuentas del dueño siguen fuera del alumno', async () => {
  const { espacioDisponible } = await import('../../src/shared/lib/espacios-chat')
  assert.equal(espacioDisponible('abliterated', true), true)
  assert.equal(espacioDisponible('abliterated', false), true)
  for (const e of ['bro', 'codex', 'yt']) assert.equal(espacioDisponible(e, true), false)
})

test('validación de la llave de abliteration.ai: descarta las de otros proveedores y los tokens de suscripción', async () => {
  const { validarLlaveSinFiltro } = await import('../../src/features/primer-arranque/lib/llaves')
  assert.equal(validarLlaveSinFiltro('ak_' + 'a'.repeat(40)).ok, true)
  assert.equal(validarLlaveSinFiltro(` "ak_${'b'.repeat(40)}" `).ok, true)
  for (const mala of ['', 'ak_corta', 'sk-or-v1-' + 'a'.repeat(40), 'sk-ant-api03-' + 'a'.repeat(40), 'gsk_' + 'a'.repeat(40), 'sk-ant-oat01-' + 'a'.repeat(40), 'ak_ con espacio ' + 'a'.repeat(20)]) {
    assert.equal(validarLlaveSinFiltro(mala).ok, false, mala)
  }
})

test('modo servidor: guarda la llave, no cuenta como «listo» y nunca la hereda de la terminal', async () => {
  const { LLAVES, PROHIBIDAS, errorDeLlave, estadoLlaves, entornoLimpio } = await import('../../scripts/servidor/rutas.mjs')
  assert.ok(LLAVES.includes('ABLITERATION_AI_API_KEY'))
  assert.equal(errorDeLlave('ABLITERATION_AI_API_KEY', 'ak_' + 'a'.repeat(40)), null)
  assert.match(String(errorDeLlave('ABLITERATION_AI_API_KEY', 'gsk_' + 'a'.repeat(40))), /abliteration/)
  assert.equal(estadoLlaves({ ABLITERATION_AI_API_KEY: 'ak_' + 'a'.repeat(40) }).listo, false)
  for (const k of ['ABLITERATION_AI_API_KEY', 'ABLITERATED_BASE_URL', 'ABLITERATED_API_KEY', 'CABINA_MODELO_ABLITERATED']) {
    assert.ok(PROHIBIDAS.includes(k), k)
    assert.equal((entornoLimpio({ [k]: 'x', PATH: '/bin' }) as Record<string, string | undefined>)[k], undefined)
  }
})

test('UI: Ajustes › Sin filtro con su paso a paso; sin franja roja arriba; el aviso vive en la píldora del selector', () => {
  const modal = fuente('src/features/configuracion/components/ModalAjustes.tsx')
  assert.match(modal, /seccion === 'sinfiltro' && <PanelSinFiltro \/>/)
  const panel = fuente('src/features/primer-arranque/components/PanelSinFiltro.tsx')
  assert.match(panel, /llaveGuardar\('ABLITERATION_AI_API_KEY'/)
  assert.match(panel, /abliteration\.ai\/console|CONSOLA_ABLITERATION/)
  assert.match(panel, /nunca en el chat/)
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.doesNotMatch(chat, /data-banner-abliterated/)
  assert.match(chat, /composerUI\.sinFiltro/)
  assert.match(fuente('src/features/chat/components/composer-ui.module.css'), /\.model\.sinFiltro \{[^}]*border-radius: 999px/)
})
