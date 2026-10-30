// Capturas del visor único en Chrome headless contra un servidor con MISSION_CONTROL_DESKTOP_EMBED=1 (banco /visor-lab).
//   node tests/visor/capturas.mjs <carpeta-de-salida> [base=http://127.0.0.1:3411] [carpeta-de-pruebas=/tmp/visor-prueba]
import { mkdirSync } from 'node:fs'
import { abrirChrome, dormir } from './cdp.mjs'
const [, , SALIDA = '/tmp/visor-capturas', BASE = 'http://127.0.0.1:3411', P = '/tmp/visor-prueba'] = process.argv
const V = process.env.VIDEO_A ?? `${P}/entrega/versiones/v1.mp4`, W = process.env.VIDEO_B ?? `${P}/entrega/versiones/v2.mp4`
mkdirSync(SALIDA, { recursive: true })
const lab = (q) => `${BASE}/visor-lab?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
const c = await abrirChrome({ ancho: 900, alto: 1000 })
const hecho = []
try {
  // 1. PDF con búsqueda
  await c.ir(lab({ ruta: `${P}/guia-del-regulador.pdf`, grande: 1, ancho: 860 }))
  await c.esperar(`[...document.querySelectorAll('canvas')].some(x=>x.width>10)`, 60000, 'pdf')
  await dormir(1000)
  await c.eval(`document.querySelector('input[type=search]').focus()`); await c.teclear('variedad')
  await c.esperar(`/\\d+ de \\d+/.test(document.querySelector('[aria-live]')?.textContent||'')`, 20000, 'conteo')
  await dormir(1500)
  hecho.push(await c.captura(`${SALIDA}/1-pdf-busqueda.png`, { selector: '[aria-label="Controles del PDF"]', margen: 0 }).then(() => c.captura(`${SALIDA}/1-pdf-busqueda.png`)))
  // 2. PDF: selección → preguntar a Levy
  await c.eval(`document.querySelector('input[type=search]').blur()`)
  const r = await c.eval(`(()=>{const s=[...document.querySelectorAll('[data-pagina="1"] span')].find(x=>x.textContent.includes('regulador bueno'));const b=s.getBoundingClientRect();return {x:b.x,y:b.y+b.height/2,w:b.width}})()`)
  await c.arrastrar(r.x + 10, r.y, r.x + r.w - 10, r.y); await dormir(400)
  await c.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Preguntar a Levy')).click()`); await dormir(300)
  await c.teclear('¿Esto aplica a un negocio de una sola persona?'); await c.tecla('Enter', { code: 'Enter', vk: 13 }); await dormir(500)
  hecho.push(await c.captura(`${SALIDA}/2-pdf-cita-a-levy.png`))
  console.log('PDF → Levy recibió:\n' + await c.eval(`document.querySelector('#recibido-por-levy').innerText`))
  // 3. Video: dos versiones, lado a lado
  await c.ir(lab({ ruta: V, compararCon: W, ancho: 760 }))
  await c.esperar(`document.querySelectorAll('video').length>=2 && [...document.querySelectorAll('video')].every(v=>v.readyState>=1)`, 40000, 'videos')
  await c.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Lado a lado')).click()`); await dormir(400)
  await c.eval(`document.querySelector('[role=group]').focus()`)
  for (let i = 0; i < 3; i++) await c.tecla('ArrowRight', { code: 'ArrowRight', vk: 39, modificadores: 8 }) // Mayús + → : 1 s
  await dormir(1200)
  hecho.push(await c.captura(`${SALIDA}/3-video-dos-versiones.png`))
  // 4. Instante marcado → llega como tiempo
  await c.tecla('m', { code: 'KeyM', vk: 77 }); await dormir(300)
  await c.eval(`document.querySelector('input[aria-label="Qué hacer en este instante"]').focus()`); await c.teclear('quita esto'); await c.tecla('Enter', { code: 'Enter', vk: 13 }); await dormir(800)
  hecho.push(await c.captura(`${SALIDA}/4-video-instante-marcado.png`))
  console.log('Video → Levy recibió:\n' + await c.eval(`document.querySelector('#recibido-por-levy').innerText`))
  // 5. Carpeta como entrega
  await c.ir(lab({ ruta: process.env.ENTREGA ?? `${P}/entrega`, ancho: 760 }))
  await c.esperar(`document.querySelectorAll('button[title]').length>3 && [...document.querySelectorAll('video')].every(v=>v.readyState>=1)`, 40000, 'entrega'); await dormir(1200)
  hecho.push(await c.captura(`${SALIDA}/5-carpeta-como-entrega.png`))
  // 6. Audio y 7. imagen
  await c.ir(lab({ ruta: `${P}/entrega/piezas/voz-limpia.m4a`, ancho: 760 }))
  await c.esperar(`document.querySelectorAll('[class*=barras] i').length>10`, 30000, 'onda'); await dormir(400)
  hecho.push(await c.captura(`${SALIDA}/6-audio-onda.png`, { selector: '[aria-label^="Audio"]', margen: 8 }))
  await c.ir(lab({ ruta: `${P}/entrega/piezas/miniatura-1.png`, compararCon: `${P}/entrega/piezas/miniatura-3.png`, ancho: 760 })); await dormir(3000)
  hecho.push(await c.captura(`${SALIDA}/7-imagen-comparador.png`))
  console.log('errores de página:', c.eventos.filter(e => e.method === 'Runtime.exceptionThrown').length)
} finally { await c.cerrar() }
console.log(hecho.join('\n'))
