// Diálogo de confirmación humana al contrato v3 (CONTRATO-DAEMON.md §6, §6.1; red team C1/C2).
// Lo que se prueba aquí es lo que decide qué ve la persona: el literal sin recortar ni reinterpretar (lo invisible
// marcado), los avisos, el origen («Pedida por Levy», «Rutina», «Manos»), el clic humano y el aviso sin sandbox.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { avisoSinSandbox, avisosDe, esClicHumano, etiquetaOrigen, LIMITE_LITERAL, literalVisible, ordenarPendientes } from '../../src/features/permisos/lib/confirmacion'
import { estadoSandbox } from '../../src/features/permisos/lib/sandbox-server'

test('literal: tal cual, con saltos y tabuladores; nada se recorta', () => {
  const largo = `git push origin main && curl -X POST https://ejemplo.invalid/${'a'.repeat(3500)}\n\tsegunda línea «ñ»`
  const v = literalVisible(largo)
  assert.equal(v.texto, largo)
  assert.equal(v.invisibles, 0)
})

test('literal: lo invisible que cambia lo que corre se marca, el resto queda igual y en su lugar', () => {
  const rlo = String.fromCharCode(0x202e), zw = String.fromCharCode(0x200b), esc = String.fromCharCode(0x1b), cr = '\r'
  const v = literalVisible(`echo hola${rlo}txt.sh${zw} ${esc}[2K${cr}rm x`)
  assert.equal(v.texto, 'echo hola⟨U+202E⟩txt.sh⟨U+200B⟩ ⟨U+001B⟩[2K⟨U+000D⟩rm x')
  assert.equal(v.invisibles, 4)
})

test('avisos: los del daemon, más invisibles, recorte y falta de literal; sin duplicados', () => {
  assert.deepEqual(avisosDe({ literal: 'ls', avisos: ['decodifica texto: puede esconder lo que de verdad hace', 'decodifica texto: puede esconder lo que de verdad hace', ' '] }),
    ['decodifica texto: puede esconder lo que de verdad hace'])
  assert.ok(avisosDe({ literal: `x${String.fromCharCode(0x202e)}y` }).some(a => a.includes('invisibles')))
  assert.ok(avisosDe({ literal: 'a'.repeat(LIMITE_LITERAL) }).some(a => a.includes('recortado')))
  assert.ok(avisosDe({}).some(a => a.includes('no mandó el comando literal')))
  assert.deepEqual(avisosDe({ literal: 'ls', avisos: 'no-es-lista' as unknown as string[] }), [])
})

test('origen: «Pedida por Levy» si la pidió un proceso con el pase; «Rutina» solo si la interceptó la guardia', () => {
  assert.deepEqual(etiquetaOrigen({ origen: 'manos', creadaPor: 'peticion' }).marcas, ['Pedida por Levy', 'Manos'])
  assert.deepEqual(etiquetaOrigen({ origen: 'cron', creadaPor: 'peticion' }).marcas, ['Pedida por Levy'])
  assert.notEqual(etiquetaOrigen({ origen: 'cron', creadaPor: 'peticion' }).quien, 'Una rutina tuya programada')
  assert.equal(etiquetaOrigen({ origen: 'cron', creadaPor: 'guardia' }).quien, 'Una rutina tuya programada')
  assert.deepEqual(etiquetaOrigen({ origen: 'cron', creadaPor: 'guardia' }).marcas, ['Rutina'])
  assert.deepEqual(etiquetaOrigen({ origen: 'agente', creadaPor: 'guardia' }), { quien: 'Levy', marcas: [], sinVerificar: false })
  const v2 = etiquetaOrigen({ origen: 'cron' })
  assert.equal(v2.sinVerificar, true)
  assert.deepEqual(v2.marcas, ['Origen sin verificar'])
})

test('solo un clic humano aprueba: ni el teclado (detail 0) ni un click() sintético (isTrusted false)', () => {
  assert.equal(esClicHumano({ detail: 1, isTrusted: true }), true)
  assert.equal(esClicHumano({ detail: 0, isTrusted: true }), false)
  assert.equal(esClicHumano({ detail: 1, isTrusted: false }), false)
})

test('pendientes: solo vigentes, la más vieja primero', () => {
  const base = { categoria: 'publicar' as const, origen: 'agente' as const, resumen: 'git push' }
  const lista = [
    { ...base, id: 'cf_b', estado: 'pendiente' as const, creada: 20, expira: 10_000 },
    { ...base, id: 'cf_a', estado: 'pendiente' as const, creada: 10, expira: 10_000 },
    { ...base, id: 'cf_u', estado: 'usada' as const, creada: 1, expira: 10_000 },
  ]
  assert.deepEqual(ordenarPendientes(lista, 100).map(c => c.id), ['cf_a', 'cf_b'])
})

test('sandbox: misma regla que el daemon (macOS sandbox-exec, Linux bwrap+socat, Windows nunca, ARBRAIN_SANDBOX=0 lo apaga)', () => {
  // Rutas normalizadas a «/»: la prueba también corre en Windows (CI de la copia).
  const hay = (r: string) => ['/usr/bin/sandbox-exec', '/usr/bin/bwrap', '/usr/bin/socat'].includes(r.replace(/\\/g, '/'))
  assert.deepEqual(estadoSandbox({ PATH: '/usr/bin' }, 'darwin', hay), { disponible: true, sistema: 'macos' })
  assert.deepEqual(estadoSandbox({ PATH: '/usr/bin' }, 'darwin', () => false), { disponible: false, sistema: 'macos' })
  assert.deepEqual(estadoSandbox({ PATH: '/usr/bin' }, 'linux', hay), { disponible: true, sistema: 'linux' })
  assert.deepEqual(estadoSandbox({ PATH: '/usr/bin' }, 'linux', r => r.replace(/\\/g, '/') === '/usr/bin/bwrap'), { disponible: false, sistema: 'linux', faltan: ['socat'] })
  assert.deepEqual(estadoSandbox({ PATH: 'C:\\Windows' }, 'win32', () => true), { disponible: false, sistema: 'windows' })
  assert.deepEqual(estadoSandbox({ PATH: '/usr/bin', ARBRAIN_SANDBOX: '0' }, 'darwin', hay), { disponible: false, sistema: 'macos' })
})

test('aviso sin sandbox: dice que cada comando pide clic; en Linux, qué instalar', () => {
  const w = avisoSinSandbox({ disponible: false, sistema: 'windows' })
  assert.match(w, /Windows/)
  assert.match(w, /cada comando .* te pedirá un clic/)
  assert.match(avisoSinSandbox({ disponible: false, sistema: 'linux', faltan: ['bwrap', 'socat'] }), /apt install bubblewrap socat/)
})

test('el diálogo pinta el literal completo en monoespaciado, avisos, «Pedida por Levy» y el resumen como título', async () => {
  // Render estático del diálogo interno: sin efectos, con la confirmación como la manda un daemon v3.
  const mod = await import('../../src/features/permisos/components/ConfirmacionesHumanas')
  assert.equal(typeof mod.ConfirmacionesHumanas, 'function')
  const literal = `manos:pegar ${JSON.stringify([{ texto: 'x'.repeat(3000) }])}`
  const html = renderToStaticMarkup(createElement(mod.DialogoConfirmacion, {
    c: { id: 'cf_0123456789ab', estado: 'pendiente', categoria: 'enviar', origen: 'manos', creadaPor: 'peticion', resumen: 'Levy usando tu computadora: manos:pegar', literal, avisos: ['puede usar internet o abrir otras apps'], herramienta: 'manos:pegar', creada: 1, expira: Date.now() + 60_000 },
    sandbox: null, restantes: 0, alResolver: () => {},
  }))
  assert.ok(html.includes(literal.replace(/"/g, '&quot;')), 'el literal entero está en el HTML')
  assert.match(html, /<pre id="cf-literal"[^>]*font-mono/)
  assert.match(html, /overflow-auto/)
  assert.match(html, /Pedida por Levy/)
  assert.match(html, /puede usar internet o abrir otras apps/)
  assert.match(html, /<h2 id="cf-titulo"[^>]*>Levy usando tu computadora: manos:pegar<\/h2>/)
})
