// El editor de Arbrain (19 nov 2026, encargo editor-interfaz): el mapa toma↔corte, los cortes en rojo, las herramientas
// a mano de la sala vieja como operaciones del motor, las llamadas numeradas, la lista cerrada del proxy y el monitor
// donde nace la ventana.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aCorte, aToma, bloque, borrarPiezas, cierreDeCambio, clasePista, cortes, llamadas, marcador, mensajeComentario, partir, pasoCuadro,
  piezaDeToma, piezas, pistaCamara, recortar, seleccionarLado, tramosEnToma, zoomAnclado,
} from '../../src/features/editor/modelo'
import type { Cambio, Medio, Timeline } from '../../src/features/editor/tipos'
import { baseDelMotor, rutaPermitida } from '../../src/lib/editor/motor'
import { monitorDestino } from '../../src/features/editor/ventana'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const medio: Medio = { id: 'med_a', kind: 'video', name: 'camara.mp4', duration: 131.2, hasAudio: true }
const clip = (id: string, tIn: number, a: number, b: number) => ({ id, kind: 'media' as const, mediaId: 'med_a', timelineIn: tIn, sourceIn: a, sourceOut: b })
// La forma real que dejó el motor tras un pase con 4 cortes (proyecto de prueba s04).
const tl: Timeline = { version: 'v2', projectId: 'prj_x', markers: [], tracks: [
  { id: 'v1', kind: 'video', name: 'V1', clips: [clip('c1', 0, 0, 26.7), clip('c2', 26.7, 27.93, 49.2), clip('c3', 47.97, 52.5, 104)] },
  { id: 'a1', kind: 'audio', name: 'A1', clips: [] },
] }
const ps = piezas(pistaCamara(tl, [medio]))

test('la cámara es la pista con sonido; sus piezas van en orden de corte', () => {
  assert.equal(pistaCamara(tl, [medio])?.id, 'v1')
  assert.deepEqual(ps.map(p => p.clipId), ['c1', 'c2', 'c3'])
  assert.ok(Math.abs(ps[1].corte.end - 47.97) < 0.01)
})

test('lo cortado sale en rojo donde estaba en la toma, incluido el final', () => {
  const r = cortes(ps, 131.2)
  assert.equal(r.length, 3)
  assert.deepEqual(r.map(x => [x.start, x.end]), [[26.7, 27.93], [49.2, 52.5], [104, 131.2]])
})

test('toma ↔ corte: ida y vuelta, y lo cortado cae en la unión', () => {
  const ida = aCorte(ps, 30)
  assert.ok(ida.dentro && Math.abs(ida.t - (26.7 + 2.07)) < 1e-6)
  assert.ok(Math.abs(aToma(ps, ida.t).toma - 30) < 1e-6)
  const fuera = aCorte(ps, 50)
  assert.equal(fuera.dentro, false)
  assert.ok(Math.abs(fuera.t - ps[2].corte.start) < 1e-6)
  assert.equal(piezaDeToma(ps, 50), 2)
})

test('S parte en el cuadro del playhead; A y D quitan hasta el playhead dentro de su pieza', () => {
  const s = partir(ps, 10.01, 30)
  assert.deepEqual(s?.ops, [{ op: 'splitClip', clipId: 'c1', at: 10 }])
  const a = recortar(ps, 30, 'izquierda', 30)
  assert.equal(a?.ops[0].op, 'rippleDelete')
  assert.deepEqual(a?.ops[0], { op: 'rippleDelete', start: 26.7, end: 30 })
  const d = recortar(ps, 30, 'derecha', 30)
  assert.ok(d && d.ops[0].op === 'rippleDelete' && d.ops[0].start === 30 && Math.abs(d.ops[0].end - ps[1].corte.end) < 1e-9)
  // En el borde no hay nada que partir.
  assert.equal(partir(ps, 0, 30), null)
})

test('Q/E seleccionan a un lado; Supr quita tramos contiguos de atrás hacia adelante y nunca todo', () => {
  assert.deepEqual(seleccionarLado(ps, 30, -1), [0])
  assert.deepEqual(seleccionarLado(ps, 30, 1), [2])
  const b = borrarPiezas(ps, [2, 0])
  assert.deepEqual(b?.ops.map(o => o.op === 'rippleDelete' ? o.start : -1), [ps[2].corte.start, 0])
  assert.equal(borrarPiezas(ps, [0, 1, 2]), null)
})

test('↑↓ saltan de pieza en pieza; ←→ avanzan un cuadro en el corte (saltan lo rojo)', () => {
  assert.equal(bloque(ps, 1, 1), 26.7)
  assert.equal(bloque(ps, 30, -1), 26.7)
  const t = pasoCuadro(ps, ps[0].corte.end - 1 / 60, 1, 30)
  assert.ok(Math.abs(aToma(ps, t).toma - (27.93 + 1 / 60)) < 1e-3, 'un cuadro después del final de la pieza cae en la siguiente, no en lo cortado')
})

test('M deja un marcador del motor con nota', () => {
  const m = marcador(12, 'subir música aquí', 'mk_1')
  assert.deepEqual(m.ops, [{ op: 'addMarker', marker: { id: 'mk_1', time: 12, kind: 'note', text: 'subir música aquí' } }])
})

test('las llamadas se numeran como en Scarlet: lo preguntado por orden de llegada y luego lo no revisado por la toma', () => {
  const c: Cambio = { id: 'chg_1', projectId: 'prj_x', fromVersion: 'v1', toVersion: 'v2', description: 'pase', state: 'ready', createdAt: '2026-11-19T10:00:00Z',
    cutReasons: [
      { start: 10, end: 11, reason: 'pausa', kind: 'pause' }, { start: 20, end: 22, reason: 'retoma', kind: 'retake' },
      { start: 30, end: 31, reason: 'muletilla', kind: 'filler' }, { start: 40, end: 41, reason: 'otra pausa', kind: 'pause' },
    ],
    cutAssessments: [
      { index: 0, start: 10, end: 11, verdict: 'cut', reason: 'segura' },
      { index: 3, start: 40, end: 41, verdict: 'ask', reason: '¿la dejo?', askOrder: 1 },
      { index: 1, start: 20, end: 22, verdict: 'ask', reason: '¿cuál toma?', askOrder: 2 },
    ],
    cutChoices: [{ index: 1, choice: 'keep' }] }
  const l = llamadas([c, { ...c, id: 'chg_2', state: 'approved' }])
  assert.deepEqual(l.map(x => [x.numero, x.indice]), [[1, 3], [2, 1], [3, 2]])
  assert.equal(l[1].eleccion, 'keep')
  // Aprobar con los mantenidos como restoredCuts, solo cuando todo está decidido.
  assert.equal(cierreDeCambio(c, new Map([[3, 'cut'], [1, 'keep']])).listo, false)
  assert.deepEqual(cierreDeCambio(c, new Map([[3, 'cut'], [1, 'keep'], [2, 'cut']])), { listo: true, restoredCuts: [1] })
})

test('las pistas se clasifican y un clip de corte se ve sobre la toma', () => {
  const medios = new Map([['med_a', medio], ['med_g', { id: 'med_g', kind: 'graphic', name: 'card.webm' } as Medio]])
  assert.equal(clasePista({ id: 'v2', kind: 'video', name: 'V2', clips: [{ ...clip('g', 0, 0, 2), mediaId: 'med_g' }] }, null, medios), 'graficos')
  assert.equal(clasePista({ id: 's', kind: 'caption', name: 'Subs', clips: [] }, null, medios), 'subtitulos')
  assert.deepEqual(tramosEnToma(ps, { start: 26, end: 27.5 }).map(r => [r.start, Math.round(r.end * 100) / 100]), [[26, 26.7], [27.93, 28.73]])
})

test('zoom anclado: el instante bajo el cursor se queda bajo el cursor', () => {
  const v = zoomAnclado({ inicio: 0, pxPorSeg: 10 }, 2, 300, 131.2, 1000)
  assert.ok(Math.abs((v.inicio + 300 / v.pxPorSeg) - 30) < 1e-9)
})

test('C viaja a Levy con el protocolo de las marcas del visor', () => {
  const m = mensajeComentario({ proyecto: 'Prueba', proyectoId: 'prj_x', version: 'abcd1234', tiempo: 130.4, toma: 140.123, nota: 'quita esto' })
  assert.match(m, /^⏱ Video «Prueba · abcd1234» · 2:10 \(tiempo=130\.4\) · ruta=editor:prj_x\?version=abcd1234&toma=140\.12\nquita esto$/)
})

test('el proxy solo abre lo que el editor usa, y solo en loopback', () => {
  assert.ok(rutaPermitida('GET', ['media', 'med_a', 'proxy']))
  assert.ok(rutaPermitida('POST', ['projects', 'prj_x', 'changes']))
  assert.ok(rutaPermitida('PUT', ['changes', 'chg_1', 'cut-choices']))
  assert.equal(rutaPermitida('GET', ['skills']), false)
  assert.equal(rutaPermitida('DELETE', ['projects', 'prj_x']), false)
  assert.equal(rutaPermitida('GET', ['media', '..', 'proxy']), false)
  assert.equal(rutaPermitida('GET', ['media', 'a/b', 'proxy']), false)
  assert.equal(baseDelMotor({}).port, '47420')
  assert.throws(() => baseDelMotor({ ARBRAIN_EDITOR_MOTOR_URL: 'http://otra-maquina:47420' }))
  // El token nunca sale hacia el navegador: la ruta no reenvía cabeceras de autorización ni cookies.
  const ruta = fuente('src/app/api/editor/motor/[...ruta]/route.ts')
  assert.match(ruta, /planningOwner\(\)/)
  assert.doesNotMatch(fuente('src/lib/editor/motor.ts').match(/CABECERAS_IDA = \[[^\]]*\]/)?.[0] ?? '', /authorization|cookie/)
})

test('la ventana nace en el monitor que no tiene la principal; con uno solo, ese', () => {
  const benq1 = { x: 0, y: 0, ancho: 2560, alto: 1440 }, benq2 = { x: 2560, y: 0, ancho: 2560, alto: 1440 }
  assert.deepEqual(monitorDestino([benq1, benq2], { x: 1200, y: 700 }), benq2)
  assert.deepEqual(monitorDestino([benq1], { x: 1200, y: 700 }), benq1)
})

test('el editor no queda cerrado por la limpieza de ventanas viejas y su C llega al chat', () => {
  assert.match(fuente('src/features/cabina/panel/ventanas.ts'), /e !== 'vista-editor'/)
  assert.match(fuente('src/features/chat/components/ChatPanel.tsx'), /atenderEditor\(/)
  assert.match(fuente('src/app/(ventana)/panel/page.tsx'), /params\.has\('editor'\)/)
})

test('la galería abre en el editor solo proyectos del motor; ⌘⌥E y «Abrir en el editor» se atienden en el armazón', async () => {
  const { proyectoDeVideo } = await import('../../src/features/editor/AtiendeEditor')
  assert.equal(proyectoDeVideo('m/prj_18d458fw6phd'), 'prj_18d458fw6phd')
  assert.equal(proyectoDeVideo('y/2026-09-22-opus-5-5'), null)
  assert.equal(proyectoDeVideo('m/../etc'), null)
  assert.match(fuente('src/app/(main)/dashboard-shell.tsx'), /<AtiendeEditor \/>/)
  assert.match(fuente('src/features/editor/InicioEditor.tsx'), /<Galeria onAbrir=/)
  assert.match(fuente('src/features/editor/Editor.tsx'), /new BroadcastChannel\('arbrain:editor'\)/)
})

test('el clic en la línea de tiempo se mide en píxeles de maquetación aunque la ventana tenga zoom 1.2 (WebKit)', async () => {
  const { xEnMaqueta } = await import('../../src/features/editor/modelo')
  // Lo medido en la corrida: a zoom 1.2 el rectángulo y el clic llegan en píxeles de pantalla (1.2× los de maquetación).
  const regla = { offsetWidth: 1000, getBoundingClientRect: () => ({ left: 120, width: 1200 }) } as unknown as HTMLElement
  assert.equal(xEnMaqueta(regla, 120 + 600), 500, 'la mitad en pantalla es la mitad en maquetación')
  const sinZoom = { offsetWidth: 1000, getBoundingClientRect: () => ({ left: 100, width: 1000 }) } as unknown as HTMLElement
  assert.equal(xEnMaqueta(sinZoom, 350), 250)
})

// ── Vuelta 2 ──
import { devolverCorte, edicionesAplicadas, moverBorde, numerar, palabraCortada, quitarPieza, recortarClip } from '../../src/features/editor/modelo'
import { aEspanol } from '../../src/features/editor/textos'

const llamada = (cambioId: string, indice: number, numero: number) => ({ numero, cambioId, indice, tramo: { start: indice, end: indice + 1 }, nota: 'n', preguntada: true })

test('números estables: no se reasignan mientras el pase espera y uno nuevo toma el siguiente', () => {
  const r1 = numerar({}, [llamada('c', 0, 1), llamada('c', 1, 2), llamada('c', 2, 3)])
  assert.deepEqual(r1.llamadas.map(l => l.numero), [1, 2, 3])
  // Se decidió la 2 (sale) y llega otra ANTES en el video: la 1 y la 3 conservan su número; la nueva es la 4.
  const r2 = numerar(r1.numeros, [llamada('c', 9, 1), llamada('c', 0, 2), llamada('c', 2, 3)])
  assert.deepEqual(r2.llamadas.map(l => [l.indice, l.numero]), [[0, 1], [2, 3], [9, 4]])
  assert.deepEqual(numerar(r2.numeros, []).numeros, {}, 'sin llamadas, la cuenta vuelve a empezar')
})

// Dos pistas cortadas juntas, como la toma del 26 sep: pantalla (V1) y cámara en recuadro (V2).
const tl2: Timeline = { version: 'v3', projectId: 'prj_x', markers: [], tracks: [
  { id: 'v1', kind: 'video', name: 'V1', clips: [{ ...clip('p1', 0, 0, 26.7), mediaId: 'med_p' }, { ...clip('p2', 26.7, 27.93, 49.2), mediaId: 'med_p' }] },
  { id: 'v2', kind: 'video', name: 'Cámara', clips: [clip('c1', 0, 0, 26.7), clip('c2', 26.7, 27.93, 49.2)] },
] }
const medioP: Medio = { id: 'med_p', kind: 'video', name: 'pantalla.mp4', duration: 131.2, hasAudio: false }
const ps2 = piezas(pistaCamara(tl2, [medio, medioP]))

test('arrastrar el borde izquierdo de lo rojo hacia adentro devuelve material en cámara y pantalla juntas', () => {
  const e = moverBorde(tl2, ps2, { start: 26.7, end: 27.93 }, 'inicio', 27.2, 30)!
  assert.equal(e.ops[0].op, 'rippleInsertGap')
  assert.ok(e.ops[0].op === 'rippleInsertGap' && Math.abs(e.ops[0].at - 26.7) < 1e-9 && Math.abs(e.ops[0].duration - 0.5) < 1e-6)
  const ids = e.ops.filter(o => o.op === 'updateClip').map(o => o.op === 'updateClip' ? o.clipId : '')
  assert.deepEqual(ids.sort(), ['c1', 'p1'], 'la pantalla se alarga con la cámara')
})

test('arrastrar hacia afuera corta más; el borde derecho hacia adentro abre hueco y recorre el principio', () => {
  const mas = moverBorde(tl2, ps2, { start: 26.7, end: 27.93 }, 'inicio', 25.7, 30)!
  assert.deepEqual(mas.ops, [{ op: 'rippleDelete', start: 25.7, end: 26.7 }])
  const der = moverBorde(tl2, ps2, { start: 26.7, end: 27.93 }, 'fin', 27.43, 30)!
  assert.equal(der.ops[0].op, 'rippleInsertGap')
  const c2 = der.ops.find(o => o.op === 'updateClip' && o.clipId === 'c2')
  assert.ok(c2 && c2.op === 'updateClip' && c2.patch.timelineIn === 26.7 && Math.abs((c2.patch.sourceIn as number) - 27.4333) < 0.01)
  assert.equal(moverBorde(tl2, ps2, { start: 26.7, end: 27.93 }, 'inicio', 26.7, 30), null, 'sin movimiento, sin edición')
})

test('Rechazar un corte aplicado lo devuelve entero; ✕ en una pieza la quita sola', () => {
  const d = devolverCorte(tl2, ps2, { start: 26.7, end: 27.93 }, 30)!
  assert.ok(d.ops[0].op === 'rippleInsertGap' && Math.abs(d.ops[0].duration - 1.2333) < 0.01)
  assert.match(d.descripcion, /rechazado/)
  assert.deepEqual(quitarPieza({ id: 'g1', kind: 'media', mediaId: 'med_g', timelineIn: 3, sourceIn: 0, sourceOut: 2, label: 'Lámina N' }).ops, [{ op: 'removeClip', clipId: 'g1' }])
})

test('el borde dentro de una palabra se dice; A/D recortan el clip elegido de otra pista', () => {
  const ws = [{ text: 'oferta', start: 10, end: 10.6 }, { text: 'clara', start: 10.7, end: 11.1 }]
  assert.equal(palabraCortada(ws, 10.3), 'oferta')
  assert.equal(palabraCortada(ws, 10.65), null, 'entre palabras no avisa')
  const g = { id: 'g1', kind: 'media' as const, mediaId: 'med_g', timelineIn: 3, sourceIn: 0, sourceOut: 4, label: 'Lámina' }
  assert.deepEqual(recortarClip(g, 4, 'izquierda', 30)?.ops, [{ op: 'updateClip', clipId: 'g1', patch: { timelineIn: 4, sourceIn: 1 } }])
  assert.deepEqual(recortarClip(g, 5, 'derecha', 30)?.ops, [{ op: 'updateClip', clipId: 'g1', patch: { sourceOut: 2 } }])
  assert.deepEqual(recortarClip({ id: 's1', kind: 'caption', timelineIn: 1, timelineOut: 3, text: 'hola' }, 2, 'derecha', 30)?.ops, [{ op: 'updateClip', clipId: 's1', patch: { timelineOut: 2 } }])
  assert.equal(recortarClip(g, 9, 'derecha', 30), null, 'fuera del clip no recorta')
})

test('Hechas: cada corte en rojo con la razón de su pase, y las piezas colocadas', () => {
  const h = edicionesAplicadas([{ start: 26.7, end: 27.93 }], [{ cambioId: 'chg_1', hilo: 'tsk_1', indice: 3, nota: 'Pausa larga', toma: { start: 26.68, end: 27.95 } }],
    [{ clip: { id: 'g1', kind: 'media', mediaId: 'med_g', timelineIn: 3, sourceIn: 0, sourceOut: 2, label: 'Lámina N' }, toma: [{ start: 3, end: 5 }], clase: 'Gráficos' }])
  assert.deepEqual(h.map(e => [e.tipo, e.nota, e.spot ?? e.clipId]), [['pieza', 'Gráficos: Lámina N', 'g1'], ['corte', 'Pausa larga', 3]])
})

test('textos del motor en español', () => {
  assert.equal(aEspanol('Removed 441 s across 61 cuts.'), 'Quité 441 s en 61 cortes.')
  assert.equal(aEspanol('Review 3 optional dialogue cuts'), 'Revisar 3 cortes opcionales de diálogo')
  assert.equal(aEspanol('Pase de diálogo · 1 restored'), 'Pase de diálogo · 1 mantenido')
  assert.equal(aEspanol('Empty timeline'), 'Línea de tiempo vacía')
  assert.equal(aEspanol('Tightened the pause before «modificamos».'), 'Acorté la pausa antes de «modificamos».')
  assert.equal(aEspanol('Cut the wait and breath before «China como la conocemos».'), 'Quité la espera y la respiración antes de «China como la conocemos».')
})

test('Levy abre el editor: la web declara que sabe el comando `editor`, lo atiende y `mostrar` acepta el proyecto', async () => {
  const { SABE } = await import('../../src/features/cabina/panel/conversacion-nueva')
  assert.ok((SABE as readonly string[]).includes('editor'))
  assert.match(fuente('src/features/cabina/panel/bus.ts'), /cmd\.accion === 'editor'.*atenderEditorBus/)
  const { parseMostrar } = await import('../../src/features/cabina/model')
  assert.equal(parseMostrar(JSON.stringify({ vista: 'editor', proyecto: 'prj_4c0k16x0k60f' }))?.proyecto, 'prj_4c0k16x0k60f')
  assert.equal(parseMostrar(JSON.stringify({ vista: 'editor', proyecto: '../x' }))?.proyecto, undefined)
})

test('el comando `editor` del bus abre el editor en ese proyecto y acusa dónde quedó (navegador: otra pestaña, sin irse del chat)', async () => {
  const abiertas: string[] = []
  const g = globalThis as unknown as { window?: unknown }
  const antes = g.window
  g.window = { open: (u: string) => { abiertas.push(u); return null }, location: { assign: () => { throw new Error('no debe irse del chat') } } }
  try {
    const { atenderEditorBus } = await import('../../src/features/editor/ventana')
    const r = await atenderEditorBus({ proyecto: 'prj_4c0k16x0k60f', titulo: 'Toma 26 sep 2026 · 17:11' })
    assert.deepEqual(abiertas, ['/editor?proyecto=prj_4c0k16x0k60f'])
    assert.equal(r.ok, true)
    assert.deepEqual(r.abiertas, ['Toma 26 sep 2026 · 17:11'])
    assert.equal(r.donde, 'otra pestaña del navegador')
    const sin = await atenderEditorBus({ proyecto: '../x' })
    assert.equal(abiertas[1], '/editor', 'un proyecto mal formado abre la galería')
    assert.match(sin.detalle, /galería/)
  } finally { g.window = antes }
})
