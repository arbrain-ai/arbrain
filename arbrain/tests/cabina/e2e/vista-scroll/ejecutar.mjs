// El chat no pierde su lugar cuando la vista de Levy se recarga (5 nov 2026). Playwright WebKit: el motor de la app de
// escritorio (aquí Safari 27.2).
//   node tests/cabina/e2e/vista-scroll/ejecutar.mjs [carpeta de salida] [--antes]    (desde arbrain/)
// Con --antes solo mide y captura (para el código anterior; sus aserciones no aplican). Casos, leyendo a media vista:
//   relectura Levy escribe el embudo: una relectura llega con el archivo a medio escribir (vista corta) y la siguiente, bien.
//   turno     llegan 12 mensajes: el de la vista sale de la cola que ChatPanel pinta completa.
//   reabrir   se vuelve a la conversación: todo el hilo nace de nuevo y ChatPanel restaura su scrollTop antes de pintar.
// y además:
//   fondo     al fondo, la conversación se recarga con los ids de la base: sigue al fondo.
//   chip      la misma vista ya está en una pestaña del panel: el hilo pinta «Abierta a la izquierda · Ir», no la vista.
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '../../../..')
const args = process.argv.slice(2), ANTES = args.includes('--antes'), pos = args.filter(a => a !== '--antes')
const SALIDA = resolve(pos[0] ?? join(tmpdir(), 'capturas-vista-scroll')); mkdirSync(SALIDA, { recursive: true })
const ETIQUETA = ANTES ? 'antes' : 'despues'
const ESBUILD = process.env.ESBUILD ?? execFileSync('sh', ['-c', 'ls ~/.npm/_npx/*/node_modules/.bin/esbuild | head -1']).toString().trim()
const PW = process.env.PLAYWRIGHT_CORE ?? execFileSync('sh', ['-c', `for d in ~/.npm/_npx/*/node_modules/playwright-core; do r=$(node -e "console.log(require('$d/browsers.json').browsers.find(b=>b.name==='webkit').revision)"); [ -d ~/Library/Caches/ms-playwright/webkit-$r ] && echo $d && break; done`]).toString().trim()
const { webkit } = createRequire(import.meta.url)(PW)
const dist = mkdtempSync(join(tmpdir(), 'vista-scroll-e2e-'))
const dormir = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('·', ...a)

execFileSync(ESBUILD, [join(aqui, 'entrada.tsx'), '--bundle', '--format=iife', '--platform=browser', `--outfile=${join(dist, 'entrada.js')}`, '--jsx=automatic',
  '--loader:.module.css=local-css', '--loader:.css=css', `--tsconfig=${join(raiz, 'tsconfig.json')}`, `--alias:@/lib/local-first/runtime=${join(raiz, 'tests/panel/e2e/runtime-stub.ts')}`,
  '--define:process.env.NODE_ENV="development"', '--define:process.env={}', '--log-level=error'], { cwd: raiz, stdio: 'inherit' })
const postcss = (await import(join(raiz, 'node_modules/postcss/lib/postcss.js'))).default
const tailwind = (await import(join(raiz, 'node_modules/@tailwindcss/postcss/dist/index.mjs'))).default
const globales = join(raiz, 'src/app/globals.css')
writeFileSync(join(dist, 'tailwind.css'), (await postcss([tailwind()]).process(readFileSync(globales, 'utf8'), { from: globales })).css)

const TOKENS = `:root{--background:#faf8fc;--surface:#fff;--card:#fff;--foreground:#1d1726;--muted:#7a7088;--border:#e7e1ef;--brand:#7c3aed;--brand-rgb:124,58,237;--gold-rgb:245,158,11}
body{margin:0;background:var(--background);color:var(--foreground);font:14px system-ui}`
const PAGINA = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style><div id="raiz"></div><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/entrada.css"><script src="/entrada.js"></script>`

// El embudo real de la memoria si está en este checkout (capturas fieles); si no, uno mínimo con la misma forma.
const REAL = resolve(raiz, '../.claude/memory/project/mi-negocio/embudo.json')
const EMBUDO = existsSync(REAL) ? JSON.parse(readFileSync(REAL, 'utf8')) : (() => {
  const ETAPAS = ['Adquisición', 'Nutrición', 'Conversión', 'Bienvenida', 'Entrega', 'Expansión']
  const etapas = ETAPAS.map((etapa, i) => ({ id: `e${i}`, orden: i + 1, embudo: 'A', etapa, nombre: etapa, que_pasa: `Qué pasa en ${etapa}.`, opera_hoy: true, skills: [{ nombre: 'skill', ruta: '.claude/skills/x/SKILL.md' }], rutinas: [{ id: null, que_hace: 'Una rutina', activa: false }], ejecuta: [{ tipo: 'levy' }], mide: { nombre: 'Número', fuente: 'prueba', hay_numero: false, valor: null }, cuello: { es: i === 2, frase: i === 2 ? 'Aquí se atora.' : undefined } }))
  return { esquema: 'arbrain.embudo/v1', negocio: 'Negocio de prueba', generado: '2026-11-04', embudos: [{ id: 'A', nombre: 'Embudo A' }], etapas, aristas: etapas.slice(1).map((e, i) => ({ desde: etapas[i].id, hacia: e.id, tipo: 'flujo', estado: 'opera' })) }
})()
const LIBRO = { indice: 'docs/business-os/README.md', leidoEn: new Date().toISOString(), tarjetas: ['avatar', 'oferta', 'embudo', 'sistema'].map(seccion => ({ seccion, titulo: seccion, fuentes: [{ etiqueta: seccion, ruta: `docs/${seccion}.md`, titulo: seccion, titular: `Titular de ${seccion}`, resumen: `Resumen de ${seccion}.`, revisado: null, origenFecha: null, viejo: false, existe: true }] })) }

let aMedioEscribir = false
const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname)
  const json = o => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o))
  if (p === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA)
  // La ruta real: con el archivo a medio escribir (JSON inválido) responde embudo null con su error.
  if (p === '/api/negocio/embudo') return json(aMedioEscribir
    ? { activo: true, ruta: '.claude/memory/project/mi-negocio/embudo.json', embudo: null, errores: ['El archivo del embudo no es JSON válido.'], launchd: {} }
    : { activo: true, ruta: '.claude/memory/project/mi-negocio/embudo.json', embudo: EMBUDO, launchd: {} })
  if (p === '/api/planning/crons') return json({ jobs: [], runs: [], timeZone: 'America/Mexico_City' })
  if (p === '/api/cabina/negocio') return json(LIBRO)
  if (p.startsWith('/api/')) return json({})
  const f = join(dist, p); if (existsSync(f)) return res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f))
  res.writeHead(404).end()
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`
const navegador = await webkit.launch()
setTimeout(() => { console.log('TIEMPO AGOTADO'); process.exit(2) }, 240_000).unref()

const VISTA = '[data-cabina-vista="negocio"]'
async function abrir() {
  aMedioEscribir = false
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const errores = []; page.on('pageerror', e => errores.push(String(e)))
  await page.goto(ANTES ? `${BASE}/?antes` : BASE)
  // Desde el 7 nov la vista abre en El pulso; el grafo (las etapas que mide este caso) está en «Etapas y skills del embudo».
  await page.waitForSelector(`${VISTA}[data-cabina-estado="montada"] [data-etapa], ${VISTA} [data-testid="el-pulso"]`, { timeout: 20_000 })
  if (!(await page.$(`${VISTA} [data-etapa]`))) await page.click(`${VISTA} [data-testid="el-pulso"] button:has-text("Etapas y skills")`)
  await page.waitForSelector(`${VISTA}[data-cabina-estado="montada"] [data-etapa]`, { timeout: 20_000 })
  await dormir(900) // entradas animadas (mov.entra) y el primer alto real
  return { ctx, page, errores }
}
/** Dónde está, dentro del hilo, la etapa que Daniel tiene arriba de la pantalla. */
const posicion = (page, etapa) => page.evaluate(etapa => {
  const h = document.querySelector('[data-hilo]'), r = h.getBoundingClientRect()
  const el = etapa ? document.querySelector(`[data-etapa="${CSS.escape(etapa)}"]`) : [...document.querySelectorAll('[data-etapa]')].find(e => e.getBoundingClientRect().top >= r.top)
  return { etapa: el?.getAttribute('data-etapa') ?? null, top: el ? Math.round(el.getBoundingClientRect().top - r.top) : null, scrollTop: Math.round(h.scrollTop), alto: h.scrollHeight, estado: document.querySelector('[data-cabina-vista]')?.getAttribute('data-cabina-estado') ?? null, alFondo: h.scrollHeight - h.scrollTop - h.clientHeight < 2, max: h.scrollHeight - h.clientHeight }
}, etapa)
/** Muestras de la posición cada 40 ms mientras pasa algo (para ver también el brinco intermedio). */
async function mientras(page, etapa, ms, accion) {
  const muestras = []; let vivo = true
  const toma = (async () => { while (vivo) { muestras.push(await posicion(page, etapa)); await dormir(40) } })()
  await accion(); await dormir(ms); vivo = false; await toma
  return muestras
}
const captura = (page, nombre) => page.screenshot({ path: join(SALIDA, `${ETIQUETA}-${nombre}.png`) })

const resultados = {}
const aMedia = page => page.evaluate(sel => { const h = document.querySelector('[data-hilo]'), v = document.querySelector(sel); h.scrollTop = v.offsetTop + v.offsetHeight * 0.45 }, VISTA)
/** Un caso leyendo a media vista: dónde queda la etapa que Daniel tenía arriba, al final y en el peor momento. */
async function leyendo(nombre, accion, ms = 1800) {
  const { ctx, page, errores } = await abrir()
  await aMedia(page); await dormir(400)
  const antes = await posicion(page)
  await captura(page, `${nombre}-1-leyendo`)
  const muestras = await mientras(page, antes.etapa, ms, () => accion(page))
  const despues = await posicion(page, antes.etapa)
  await captura(page, `${nombre}-3-despues`)
  const r = resultados[nombre] = { antes, despues, salto: despues.top - antes.top, peorScroll: Math.max(...muestras.map(m => Math.abs(m.scrollTop - antes.scrollTop))), errores }
  log(nombre, JSON.stringify(r))
  await ctx.close()
}

await leyendo('relectura', async page => {
  aMedioEscribir = true
  await page.evaluate(() => window.__refrescar())
  await dormir(450)
  await captura(page, 'relectura-2-archivo-a-medio-escribir')
  aMedioEscribir = false
  await page.evaluate(() => window.__refrescar())
})
await leyendo('turno', page => page.evaluate(() => window.__otroTurno()))
await leyendo('reabrir', page => page.evaluate(() => window.__reabrir()))

// ── fondo: al fondo del hilo, la conversación se recarga con los ids de la base ──
{
  const { ctx, page, errores } = await abrir()
  await page.evaluate(() => { const h = document.querySelector('[data-hilo]'); h.scrollTop = h.scrollHeight })
  await dormir(400)
  const antes = await posicion(page)
  await page.evaluate(() => window.__recargarAlFondo())
  await dormir(1800)
  const despues = await posicion(page)
  resultados.fondo = { antes, despues, errores }
  log('fondo', JSON.stringify(resultados.fondo))
  await ctx.close()
}

// ── chip: la misma vista ya está abierta en una pestaña del panel ──
{
  const { ctx, page, errores } = await abrir()
  await captura(page, 'chip-1-vista-en-el-hilo')
  await page.evaluate(() => window.__abrirIzquierda())
  await dormir(700)
  const estado = await page.evaluate(sel => ({
    estados: [...document.querySelectorAll(sel)].map(e => e.getAttribute('data-cabina-estado')),
    etapasEnElHilo: document.querySelectorAll('[data-etapa]').length,
    texto: document.querySelector(`${sel}[data-cabina-estado="abierta-en-panel"]`)?.innerText.replace(/\s+/g, ' ').trim() ?? null,
  }), VISTA)
  await captura(page, 'chip-2-abierta-a-la-izquierda')
  let activa = null
  if (estado.texto) {
    await page.evaluate(() => window.__fijadas().activar('tareas'))
    await page.click(`${VISTA}[data-cabina-estado="abierta-en-panel"]`)
    await dormir(200)
    activa = await page.evaluate(() => window.__fijadas().activa)
  }
  resultados.chip = { ...estado, activaTrasIr: activa, errores }
  log('chip', JSON.stringify(resultados.chip))
  await ctx.close()
}

writeFileSync(join(SALIDA, `${ETIQUETA}-resultados.json`), JSON.stringify(resultados, null, 2))
await navegador.close(); servidor.close()

if (ANTES) { log('--antes: solo medición'); process.exit(0) }
const { fondo, chip } = resultados
for (const [k, r] of Object.entries(resultados)) assert.deepEqual(r.errores, [], `${k}: sin errores de página`)
for (const k of ['relectura', 'turno', 'reabrir']) {
  assert.ok(Math.abs(resultados[k].salto) <= 4, `${k}: el hilo no se mueve (saltó ${resultados[k].salto} px)`)
  assert.ok(resultados[k].peorScroll <= 4, `${k}: ni siquiera un instante (peor ${resultados[k].peorScroll} px)`)
}
assert.ok(fondo.antes.alFondo && fondo.despues.alFondo, 'fondo: sigue al fondo')
assert.deepEqual(chip.estados, ['abierta-en-panel'], 'chip: el hilo no repinta la vista abierta en el panel')
assert.equal(chip.etapasEnElHilo, 0, 'chip: la vista no se monta en el hilo')
assert.match(chip.texto, /Abierta a la izquierda · Ir/)
assert.equal(chip.activaTrasIr, 'mano-negocio', 'chip: «Ir» enfoca su pestaña')
log('OK: el hilo conserva su lugar y la vista abierta a la izquierda es un chip')
