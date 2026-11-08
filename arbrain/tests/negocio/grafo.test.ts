// Tu negocio › El sistema como grafo (5 nov 2026, Daniel: «tenemos dos sistemas… qué te parece en lugar de ser los dos
// tuviéramos sólo uno… podemos utilizar mejor tecnología diseñada precisamente para sistemas»). Fija el dibujo que pinta
// React Flow desde features/negocio/grafo.ts: la escalera de valor de arriba abajo, etapas en fila (escritorio) o en
// columna (teléfono), aristas ortogonales que nunca atraviesan una etapa, etiquetas que no se enciman, lo que no opera
// punteado, y que el teléfono lo lea entero a lo ancho. Corre con el embudo de Daniel (si el cerebro está montado) y con
// las dos plantillas del estándar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RUTA_EMBUDO, validarEmbudo, type Embudo } from '../../src/features/negocio/embudo'
import {
  ANCHO_FILAS, cajaEtiqueta, construirGrafo, cruza, limpiar, MEDIDAS, orientacionPara, trazoSvg, type Grafo, type Orientacion, type Rect,
} from '../../src/features/negocio/grafo'

// Los CSS (módulos y el de React Flow) no existen en node: cada clase es su propio nombre.
;(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions['.css'] = (m) => {
  m.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : String(k)) })
}

const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const EJEMPLO = new URL(`../../../${RUTA_EMBUDO}`, import.meta.url)
const hayEjemplo = existsSync(EJEMPLO)
const cargar = (texto: string): Embudo => { const v = validarEmbudo(JSON.parse(texto)); assert.ok(v.ok, v.ok ? '' : v.errores.join('\n')); return v.embudo }
const CASOS: [string, () => Embudo][] = [
  ...(hayEjemplo ? [['Daniel', () => cargar(readFileSync(EJEMPLO, 'utf8'))] as [string, () => Embudo]] : []),
  ['plantilla del consultor', () => cargar(leer('docs/embudo/plantillas/consultor.embudo.json'))],
  ['plantilla del cliente', () => cargar(leer('docs/embudo/plantillas/cliente.embudo.json'))],
]
const MODOS: Orientacion[] = ['ancho', 'estrecho']
const dentro = (a: Rect, b: Rect) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5
const solapan = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const enBorde = (p: { x: number; y: number }, r: Rect) => {
  const enX = p.x >= r.x - 0.5 && p.x <= r.x + r.w + 0.5, enY = p.y >= r.y - 0.5 && p.y <= r.y + r.h + 0.5
  return enX && enY && (Math.abs(p.x - r.x) < 0.5 || Math.abs(p.x - r.x - r.w) < 0.5 || Math.abs(p.y - r.y) < 0.5 || Math.abs(p.y - r.y - r.h) < 0.5)
}

for (const [nombre, embudo] of CASOS) for (const o of MODOS) {
  test(`${nombre} · ${o}: cada etapa en su marco, sin encimarse, en el orden del embudo`, () => {
    const e = embudo(), g = construirGrafo(e, o)
    assert.equal(g.etapas.length, e.etapas.length, 'un nodo por etapa')
    assert.equal(g.embudos.length, new Set(e.etapas.map(et => et.embudo)).size, 'un marco por embudo')
    for (const n of g.etapas) {
      const marco = g.embudos.find(b => b.id === n.embudo)!
      assert.ok(dentro(n.rect, marco.rect), `${n.id} se sale de su marco`)
      assert.equal(n.rect.w, MEDIDAS[o].nodo.w); assert.equal(n.rect.h, MEDIDAS[o].nodo.h)
    }
    for (const [i, a] of g.embudos.entries()) for (const b of g.embudos.slice(i + 1)) assert.ok(!solapan(a.rect, b.rect), `${a.id} y ${b.id} se enciman`)
    for (const [i, a] of g.etapas.entries()) for (const b of g.etapas.slice(i + 1)) assert.ok(!solapan(a.rect, b.rect), `${a.id} y ${b.id} se enciman`)
    // Dentro de un embudo, las etapas siguen su `orden`: a la derecha en filas, hacia abajo en columnas.
    for (const b of g.embudos) {
      const ns = g.etapas.filter(n => n.embudo === b.id)
      for (let i = 1; i < ns.length; i++) {
        assert.ok(ns[i].etapa.orden > ns[i - 1].etapa.orden)
        if (o === 'ancho') { assert.equal(ns[i].rect.y, ns[i - 1].rect.y); assert.ok(ns[i].rect.x > ns[i - 1].rect.x) }
        else { assert.equal(ns[i].rect.x, ns[i - 1].rect.x); assert.ok(ns[i].rect.y > ns[i - 1].rect.y) }
      }
    }
    // Todo cabe en los límites, desde (0, 0).
    for (const b of g.embudos) assert.ok(dentro(b.rect, g.limites))
    for (const t of g.aristas) for (const p of t.puntos) assert.ok(p.x >= -0.5 && p.y >= -0.5 && p.x <= g.limites.w + 0.5 && p.y <= g.limites.h + 0.5, `${t.id} se sale del dibujo`)
  })

  test(`${nombre} · ${o}: la escalera baja de piso en piso y las aristas nunca atraviesan una etapa`, () => {
    const e = embudo(), g = construirGrafo(e, o)
    assert.equal(g.aristas.length, e.aristas.length, 'una arista por cada arista del archivo')
    const marcoDe = (id: string) => g.embudos.find(b => b.id === g.etapas.find(n => n.id === id)!.embudo)!
    for (const t of g.aristas) {
      assert.ok(t.puntos.length >= 2)
      // Ortogonal: cada tramo es horizontal o vertical, y no hay tramos de largo cero.
      for (let i = 1; i < t.puntos.length; i++) {
        const a = t.puntos[i - 1], b = t.puntos[i]
        assert.ok(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5, `${t.id}: tramo diagonal`)
        assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 0.5, `${t.id}: tramo vacío`)
      }
      // Sale del borde de su etapa y llega al borde de la otra.
      assert.ok(enBorde(t.puntos[0], g.etapas.find(n => n.id === t.desde)!.rect), `${t.id} no sale del borde de ${t.desde}`)
      assert.ok(enBorde(t.puntos[t.puntos.length - 1], g.etapas.find(n => n.id === t.hacia)!.rect), `${t.id} no llega al borde de ${t.hacia}`)
      // Ninguna etapa ajena en el camino, ni el marco de un embudo que no es el suyo.
      for (let i = 1; i < t.puntos.length; i++) {
        for (const n of g.etapas) if (n.id !== t.desde && n.id !== t.hacia) assert.ok(!cruza(t.puntos[i - 1], t.puntos[i], n.rect), `${t.id} atraviesa la etapa ${n.id}`)
        const propios = new Set([marcoDe(t.desde).id, marcoDe(t.hacia).id])
        for (const b of g.embudos) if (!propios.has(b.id)) assert.ok(!cruza(t.puntos[i - 1], t.puntos[i], b.rect), `${t.id} atraviesa el embudo ${b.id}`)
      }
      // La escalera de valor baja: el embudo al que se sube está debajo del que manda.
      if (t.tipo === 'upsell') assert.ok(marcoDe(t.hacia).rect.y >= marcoDe(t.desde).rect.y + marcoDe(t.desde).rect.h, `${t.id} no baja de piso`)
      // Punteada si está por construir o toca una etapa que no opera hoy.
      const opera = g.etapas.find(n => n.id === t.desde)!.etapa.opera_hoy && g.etapas.find(n => n.id === t.hacia)!.etapa.opera_hoy
      assert.equal(t.porConstruir, /construir/i.test(t.arista.estado) || !opera, `${t.id}: trazo`)
      assert.equal(t.etiqueta === null, t.tipo === 'flujo', `${t.id}: solo la escalera y el giro llevan etiqueta`)
    }
    // Los pisos que traen gente quedan arriba de las ofertas.
    const pisos = g.embudos.filter(b => b.piso), ofertas = g.embudos.filter(b => !b.piso)
    if (pisos.length && ofertas.length) assert.ok(Math.max(...pisos.map(b => b.rect.y)) < Math.min(...ofertas.map(b => b.rect.y)), 'los pisos van arriba')
  })

  test(`${nombre} · ${o}: las etiquetas caen en los pasillos, sin encimarse ni tapar un embudo`, () => {
    const g = construirGrafo(embudo(), o)
    const cajas = g.aristas.filter(t => t.ancla && t.etiqueta).map(t => ({ id: t.id, r: cajaEtiqueta(t.etiqueta!, t.ancla!) }))
    for (const [i, a] of cajas.entries()) {
      for (const b of cajas.slice(i + 1)) assert.ok(!solapan(a.r, b.r), `las etiquetas de ${a.id} y ${b.id} se enciman`)
      for (const m of g.embudos) assert.ok(!solapan(a.r, m.rect), `la etiqueta de ${a.id} tapa el embudo ${m.id}`)
    }
  })
}

test('el embudo de Daniel: la escalera completa en el dibujo', { skip: !hayEjemplo && 'sin el cerebro montado' }, () => {
  const e = cargar(readFileSync(EJEMPLO, 'utf8'))
  for (const o of MODOS) {
    const g = construirGrafo(e, o)
    const y = (id: string) => g.embudos.find(b => b.id === id)!.rect.y
    // Canal de Levy arriba; el repo debajo de él y el canal de Daniel a su lado; luego la gratuita, SaaS Factory y el
    // Acompañamiento al fondo. Nadie lo escribió a mano: sale de las aristas `upsell`.
    assert.ok(y('Levy') < y('Repo'), `${o}: el canal de Levy sube al repo`)
    if (o === 'ancho') assert.equal(y('Daniel'), y('Repo'), 'ancho: tu canal va al lado del repo (lo decide dagre por la escalera)')
    else assert.deepEqual(g.embudos.map(b => b.id), (e.embudos ?? []).map(b => b.id), 'estrecho: una columna en el orden declarado')
    assert.ok(y('Repo') < y('Gratuita') && y('Gratuita') < y('SFC') && y('SFC') < y('Acompañamiento'), `${o}: la escalera baja hasta el Acompañamiento`)
    // El giro de vuelta (casos → contenido) sube rodeando el dibujo por la izquierda.
    const giro = g.aristas.find(t => t.tipo === 'volante')!
    assert.equal(giro.desde, 'ht.expansion'); assert.equal(giro.hacia, 'lt.adquisicion')
    const izquierda = Math.min(...g.embudos.filter(b => ['SFC', 'Acompañamiento'].includes(b.id)).map(b => b.rect.x))
    assert.ok(Math.min(...giro.puntos.map(p => p.x)) < izquierda, `${o}: el giro rodea por la izquierda`)
    // Las etiquetas importantes se leen en el dibujo.
    for (const accion of ['la escalera sube: masterclass', 'del repo a la comunidad', 'casos → contenido']) assert.ok(g.aristas.some(t => t.etiqueta === accion && t.ancla), `${o}: falta la etiqueta «${accion}»`)
    assert.ok(g.aristas.every(t => !t.etiqueta || t.ancla), `${o}: cada etiqueta de la escalera encuentra su pasillo`)
    // El cuello (Casos) es una etapa del dibujo con su marca.
    assert.ok(g.etapas.find(n => n.id === 'ht.expansion')!.etapa.cuello.es)
  }
})

test('el teléfono a 390 px lee el grafo entero a lo ancho, sin scroll lateral y con letra legible', { skip: !hayEjemplo && 'sin el cerebro montado' }, () => {
  const g = construirGrafo(cargar(readFileSync(EJEMPLO, 'utf8')), orientacionPara(358))
  assert.equal(g.orientacion, 'estrecho')
  // 390 px de pantalla menos el margen de la página (16 + 16) y el aire del lienzo (10 + 10): el zoom de encuadre.
  const zoom = Math.min(1, (390 - 32 - 20) / g.limites.w)
  assert.equal(zoom, 1, `en el teléfono el grafo se vería a ${zoom.toFixed(2)}: debe leerse a tamaño real`)
  // Una sola columna: ningún embudo al lado de otro, y las tarjetas a lo ancho de la columna.
  assert.equal(new Set(g.embudos.map(b => b.rect.x)).size, 1, 'una sola columna')
  assert.ok(MEDIDAS.estrecho.nodo.w >= 240, 'tarjetas a lo ancho: el nombre de la etapa cabe en un renglón')
})

test('el modo sale del ancho del contenedor: filas desde 900 px, columnas debajo', () => {
  assert.equal(ANCHO_FILAS, 900)
  assert.equal(orientacionPara(1280), 'ancho')
  assert.equal(orientacionPara(900), 'ancho')
  assert.equal(orientacionPara(899), 'estrecho')
  assert.equal(orientacionPara(360), 'estrecho')
})

test('el trazo: ortogonal, sin puntos de sobra y con esquinas redondeadas', () => {
  assert.deepEqual(limpiar([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 30, y: 20 }]), [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 30, y: 20 }])
  assert.equal(trazoSvg([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 'M 0 0 L 10 0')
  // Una esquina: recta hasta el radio, curva en la esquina y recta al final. El radio se recorta en tramos cortos.
  assert.equal(trazoSvg([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 40 }], 12), 'M 0 0 L 0 28 Q 0 40 12 40 L 40 40')
  assert.equal(trazoSvg([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 40, y: 10 }], 12), 'M 0 0 L 0 5 Q 0 10 5 10 L 40 10')
  assert.equal(cruza({ x: 0, y: 5 }, { x: 20, y: 5 }, { x: 5, y: 0, w: 10, h: 10 }), true)
  assert.equal(cruza({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 0, w: 10, h: 10 }), false, 'rozar el borde no cuenta')
})

test('React Flow pinta los marcos detrás, las aristas en medio y las etapas encima, y nada se arrastra', { skip: !hayEjemplo && 'sin el cerebro montado' }, async () => {
  const { elementosFlow } = await import('../../src/features/negocio/GrafoEmbudo')
  const g: Grafo = construirGrafo(cargar(readFileSync(EJEMPLO, 'utf8')), 'ancho')
  const { nodos, aristas } = elementosFlow(g)
  const marcos = nodos.filter(n => n.type === 'embudo'), etapas = nodos.filter(n => n.type === 'etapa')
  assert.equal(marcos.length, g.embudos.length); assert.equal(etapas.length, g.etapas.length)
  assert.ok(nodos.findIndex(n => n.type === 'etapa') > nodos.findLastIndex(n => n.type === 'embudo'), 'los marcos van antes que las etapas')
  assert.ok(marcos.every(n => n.zIndex === 0) && etapas.every(n => n.zIndex === 2) && aristas.every(a => a.zIndex === 1))
  assert.ok(nodos.every(n => n.draggable === false && n.selectable === false))
  assert.ok(aristas.every(a => a.type === 'trazo' && a.data?.t.puntos.length))
})

test('el grafo se pinta de verdad: cada etapa, cada marco y cada arista salen en el HTML de React Flow', { skip: !hayEjemplo && 'sin el cerebro montado' }, async () => {
  const { GrafoFijo } = await import('../../src/features/negocio/GrafoEmbudo')
  const e = cargar(readFileSync(EJEMPLO, 'utf8'))
  const g = construirGrafo(e, 'ancho')
  const html = renderToStaticMarkup(createElement(GrafoFijo, { grafo: g }))
  for (const et of e.etapas) assert.ok(html.includes(`aria-label="${et.etapa}: ${et.nombre}`), `falta la etapa ${et.id}`)
  for (const b of g.embudos) assert.ok(html.includes(b.info.nombre), `falta el marco ${b.id}`)
  assert.equal((html.match(/data-cuello="true"/g) ?? []).length, 1, 'un solo cuello')
  assert.ok(html.includes('la escalera sube: masterclass'))
  assert.equal((html.match(/class="aristaLinea"/g) ?? []).length, e.aristas.length, 'una línea por arista')
  assert.ok((html.match(/data-por-construir="true"/g) ?? []).length > 0, 'lo que no opera hoy va punteado')
})

test('Skills por etapa se pinta: cada etapa con sus skills y, marcadas, las que no cuelgan de ninguna', async () => {
  const { SkillsPorEtapa } = await import('../../src/features/negocio/SkillsPorEtapa')
  const e = cargar(leer('docs/embudo/plantillas/cliente.embudo.json'))
  e.etapas[0].skills = [{ nombre: 'contenido', ruta: '.claude/skills/contenido/SKILL.md' }]
  e.skills_sin_etapa = [{ nombre: 'memoria', ruta: '.claude/skills/memoria/SKILL.md', tipo: 'sistema', por_que: 'Sirve a todas las etapas.' }]
  const html = renderToStaticMarkup(createElement(SkillsPorEtapa, { embudo: e, inventario: ['contenido', 'memoria', 'nueva'], alElegirEtapa: () => {}, pedirALevy: () => {} }))
  for (const et of e.etapas) assert.ok(html.includes(`data-etapa-skills="${et.id}"`), `falta la etapa ${et.id}`)
  assert.match(html, /Sostienen todo el sistema/)
  assert.match(html, /Sirve a todas las etapas\./)
  assert.match(html, /data-testid="skills-sin-revisar"/)
  assert.match(html, /data-marcada="true"[^>]*>.*?nueva<\/button>/)
  assert.match(html, /Pedirle a Levy que las ubique/)
  assert.match(html, /Ninguna skill todavía\./)
})
