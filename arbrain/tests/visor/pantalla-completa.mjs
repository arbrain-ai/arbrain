// Pantalla completa del visor de video (9 oct 2026): capa de controles encima del video que aparece al mover y se va sola.
// Contra el banco /visor-lab (MISSION_CONTROL_DESKTOP_EMBED=1). Videos de prueba sin pista de audio y Chrome con --mute-audio.
//   node tests/visor/pantalla-completa.mjs <carpeta-de-salida> [base=http://127.0.0.1:3411] [video=/tmp/visor-fs/a.mp4] [otro=/tmp/visor-fs/b.mp4]
import { mkdirSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { abrirChrome, dormir } from './cdp.mjs'
const [, , SALIDA = '/tmp/visor-fs/capturas', BASE = 'http://127.0.0.1:3411', A = '/tmp/visor-fs/a.mp4', B = '/tmp/visor-fs/b.mp4'] = process.argv
mkdirSync(SALIDA, { recursive: true })
const lab = (q) => `${BASE}/visor-lab?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
const c = await abrirChrome({ ancho: 1280, alto: 800 })
const raiz = `document.querySelector('[role=group][aria-label^="Video"]')`
const mando = `getComputedStyle(document.querySelector('[class*=mando]')).opacity`
const centro = async (sel) => c.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,l:b.x,w:b.width}})()`)
const mover = (x, y) => c.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
const hecho = []
try {
  for (const via of ['elemento', 'ventana']) {
    await c.ir(lab({ ruta: A, compararCon: B, ancho: 760 }))
    await c.esperar(`[...document.querySelectorAll('video')].length>=2 && [...document.querySelectorAll('video')].every(v=>v.readyState>=1)`, 40000, 'videos')
    if (via === 'ventana') await c.eval(`Element.prototype.requestFullscreen = undefined; true`)   // como el WKWebView del escritorio
    if (via === 'elemento') hecho.push(await c.captura(`${SALIDA}/0-afuera-volumen.png`, { selector: '[role=group][aria-label^="Video"]', margen: 6 }))
    const fs = await centro('button[aria-label="Pantalla completa"]'); await c.clic(fs.x, fs.y); await dormir(700)
    assert.ok(await c.eval(`!!${raiz}.dataset.pantalla`), `${via}: entra a pantalla completa`)
    if (via === 'elemento') assert.ok(await c.eval(`document.fullscreenElement === ${raiz}`), 'elemento: API de pantalla completa')
    else assert.ok(await c.eval(`${raiz}.matches(':popover-open')`), 'ventana: capa superior')
    const r = await c.eval(`(()=>{const b=${raiz}.getBoundingClientRect();return [b.width,b.height,innerWidth,innerHeight]})()`)
    assert.deepEqual([r[0], r[1]], [r[2], r[3]], `${via}: cubre toda la pantalla`)
    // Controles visibles al entrar, con avance al pasar por la barra
    const barra = await centro('[role=slider][aria-label="Posición"]')
    await mover(barra.l + barra.w * 0.62, barra.y); await dormir(900)
    assert.equal(await c.eval(mando), '1', `${via}: controles visibles al mover`)
    assert.ok(await c.eval(`!!document.querySelector('[class*=pista][data-previa]')`), `${via}: avance con fotograma bajo el cursor`)
    hecho.push(await c.captura(`${SALIDA}/${via}-1-controles-y-avance.png`))
    // Teclas iguales a las de afuera: espacio reproduce (en silencio), K pausa, M marca
    await mover(640, 300); await c.tecla(' ', { code: 'Space', vk: 32 }); await dormir(500)
    assert.equal(await c.eval(`(()=>{const v=document.querySelector('video');return !v.paused && v.muted})()`), true, `${via}: espacio reproduce y sigue silenciado`)
    await c.tecla('k', { code: 'KeyK', vk: 75 }); await dormir(200)
    assert.ok(await c.eval(`document.querySelector('video').paused`), `${via}: K pausa`)
    // Sin movimiento, la capa y el cursor se van solos
    await dormir(3300)
    assert.ok(await c.eval(`!!${raiz}.dataset.quieto && ${mando}==='0'`), `${via}: la capa se oculta sola`)
    assert.equal(await c.eval(`getComputedStyle(document.querySelector('video')).cursor`), 'none', `${via}: el cursor también`)
    hecho.push(await c.captura(`${SALIDA}/${via}-2-limpio.png`))
    await mover(600, 320); await dormir(400)
    assert.ok(await c.eval(`!${raiz}.dataset.quieto`), `${via}: vuelve al mover`)
    await c.tecla('m', { code: 'KeyM', vk: 77 }); await dormir(400)
    assert.ok(await c.eval(`!!document.querySelector('input[aria-label="Qué hacer en este instante"]')`), `${via}: M abre la marca dentro`)
    await c.eval(`document.querySelector('input[aria-label="Qué hacer en este instante"]').focus()`); await c.teclear('corta aquí'); await c.tecla('Enter', { code: 'Enter', vk: 13 }); await dormir(500)
    await mover(610, 330); await dormir(300)
    assert.ok(await c.eval(`document.querySelectorAll('[role=slider][aria-label="Posición"] [class*=bandera]').length>=1`), `${via}: la marca se ve en la barra`)
    hecho.push(await c.captura(`${SALIDA}/${via}-3-marca-en-barra.png`))
    // Salir: Esc (la capa) o el botón
    if (via === 'ventana') { await c.eval(`${raiz}.focus()`); await c.tecla('Escape', { code: 'Escape', vk: 27 }) }
    else { const s = await centro('button[aria-label="Salir de pantalla completa"]'); await c.clic(s.x, s.y) }
    await dormir(700)
    assert.ok(await c.eval(`!${raiz}.dataset.pantalla && !document.fullscreenElement`), `${via}: sale`)
    console.log(`✓ ${via}`)
  }
  const errores = c.eventos.filter(e => e.method === 'Runtime.exceptionThrown')
  assert.equal(errores.length, 0, `errores de página: ${JSON.stringify(errores.map(e => e.params.exceptionDetails?.exception?.description)).slice(0, 400)}`)
} finally { await c.cerrar() }
console.log(hecho.join('\n'))
