/** Cuartel v2 · lógica pura de las pantallas: la fecha visible, su nicho primero y la gráfica que usa su ancho. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { bandaVisible, canalesActivos, deTuNicho, dominioLog, extremos, fechaCorta, fechaVisible, feedInicio, fichaLocal, fuerzaFresca, multTexto, NICHO_RESPALDO, ordenarOutliers, pesoOutlier, porQueTeSirve, posFecha, posLog, temasChip, ticksFecha, ticksLog, TOPE_MULT, tramoOro, unirOutliers } from '../../src/features/contenido/pantalla'
import type { CanalCuartel, Inicio, ItemInicio, VideoCuartel } from '../../src/features/contenido/tipos'

const AHORA = Date.parse('2026-11-15T22:00:00Z')
const DIA = 864e5
const hace = (d: number) => new Date(AHORA - d * DIA).toISOString()
const video = (id: string, o: Partial<VideoCuartel> = {}): VideoCuartel => ({
  video_id: id, channel_id: 'UCa', canal: 'Canal A', capa: 'competencia', idioma: 'es', titulo: `Video ${id}`, publicado: hace(3),
  temas: ['claude-code'], vistas: 1000, outlier: { puntaje: 3, esperado: 300, metodo: 'maduro', confianza: 'alta' }, ...o,
})

test('la fecha de cada video: día y hace cuánto; con año si no es el de hoy', () => {
  assert.equal(fechaCorta('2026-11-12T18:00:00Z', AHORA), '12 nov')
  assert.equal(fechaCorta('2025-09-02T18:00:00Z', AHORA), '2 sep 2025')
  assert.equal(fechaVisible('2026-11-12T18:00:00Z', AHORA), '12 nov · hace 3 días')
  assert.equal(fechaVisible(null, AHORA), 'sin fecha')
  // Hora de México: las 03:00 UTC del 13 todavía son el 12 allá.
  assert.equal(fechaCorta('2026-11-13T03:00:00Z', AHORA), '12 nov')
})

test('temas: etiqueta corta y su nicho primero; el universo manda si marca `nicho`', () => {
  const xs = temasChip([{ slug: 'robots', nombre: 'Robots y humanoides' }, { slug: 'claude-code', nombre: 'Claude Code y agentes de código' }, { slug: 'raro', nombre: 'Tema nuevo: con detalle' }])
  assert.deepEqual(xs.map(t => t.slug), ['claude-code', 'robots', 'raro'])
  assert.equal(xs[0].corto, 'Claude Code')
  assert.equal(xs[2].corto, 'Tema nuevo')
  const delUniverso = temasChip([{ slug: 'robots', nombre: 'Robots', nicho: true, corto: 'Robots' }, { slug: 'oferta', nombre: 'Oferta y precio', nicho: false }])
  assert.deepEqual(delUniverso.map(t => [t.slug, t.nicho]), [['robots', true], ['oferta', false]])
})

test('nuevo y fuerte: lo reciente gana; lo viejo solo si es muchísimo mejor', () => {
  const nuevo = video('n', { publicado: hace(3), outlier: { puntaje: 3, esperado: 1, metodo: 'm', confianza: 'alta' } })
  const viejo = video('v', { publicado: hace(40), outlier: { puntaje: 10, esperado: 1, metodo: 'm', confianza: 'alta' } })
  assert.ok(fuerzaFresca(nuevo, AHORA) > fuerzaFresca(viejo, AHORA))
  // El tope de ×20 evita que un canal recién descubierto entierre al resto.
  assert.equal(fuerzaFresca(video('a', { outlier: { puntaje: 140, esperado: 1, metodo: 'm', confianza: 'baja' } }), AHORA), fuerzaFresca(video('b', { outlier: { puntaje: 20, esperado: 1, metodo: 'm', confianza: 'baja' } }), AHORA))
})

test('de tu nicho: solo su nicho, sin mentalidad, sin lo de la dosis y máximo 2 por canal', () => {
  const nicho = new Set(NICHO_RESPALDO)
  const xs = [
    video('a1'), video('a2', { publicado: hace(4) }), video('a3', { publicado: hace(5) }),
    video('m1', { capa: 'mentalidad', temas: ['mentalidad'] }), video('r1', { channel_id: 'UCr', temas: ['robots'] }),
    video('b1', { channel_id: 'UCb', publicado: hace(1) }), video('viejo', { channel_id: 'UCc', publicado: hace(200) }),
  ]
  const out = deTuNicho(xs, nicho, { ahora: AHORA, fuera: new Set(['b1']) }).map(v => v.video_id)
  assert.deepEqual(out, ['a1', 'a2'])
  assert.deepEqual(deTuNicho(xs, nicho, { ahora: AHORA, tema: 'robots' }).map(v => v.video_id), ['r1'])
  // Con búsqueda deja de ser feed: busca en todo (también lo viejo) y ordena por fecha.
  assert.deepEqual(deTuNicho(xs, nicho, { ahora: AHORA, q: 'video' }).map(v => v.video_id).slice(0, 2), ['b1', 'a1'])
  assert.ok(deTuNicho(xs, nicho, { ahora: AHORA, q: 'viejo' }).length === 1)
})

test('los outliers del detector: el tope del año más los del feed que pasan el umbral, sin duplicar', () => {
  const tope = [video('x', { outlier: { puntaje: 40, esperado: 1, metodo: 'm', confianza: 'baja' } })]
  const feed = [video('x'), video('y', { outlier: { puntaje: 2.5, esperado: 1, metodo: 'm', confianza: 'alta' } }), video('z', { outlier: { puntaje: 2.5, esperado: 1, metodo: 'm', confianza: 'baja' } }), video('w', { outlier: null })]
  assert.deepEqual(unirOutliers(tope, feed).map(v => v.video_id).sort(), ['x', 'y'])
  assert.equal(unirOutliers(tope, feed).find(v => v.video_id === 'x')!.outlier!.puntaje, 40)
})

test('la gráfica usa su ancho: el eje se ajusta a los datos (antes ×1 a ×30 fijo, todo en una esquina)', () => {
  assert.deepEqual(dominioLog([21, 35, 129]), { min: 20, max: 200 })
  assert.deepEqual(dominioLog([2.1, 8, 14]), { min: 2, max: 20 })
  assert.deepEqual(dominioLog([]), { min: 2, max: 10 })
  assert.deepEqual(dominioLog([5]), { min: 5, max: 10 })
  assert.deepEqual(ticksLog(2, 20), [2, 3, 5, 10, 20])
  assert.equal(posLog(2, 2, 200), 0)
  assert.equal(posLog(200, 2, 200), 1)
  assert.ok(Math.abs(posLog(20, 2, 200) - 0.5) < 1e-9)
  assert.equal(posFecha(hace(0), 30, AHORA), 1)
  assert.equal(posFecha(hace(15), 30, AHORA), 0.5)
  assert.equal(posFecha(hace(90), 30, AHORA), 0)
})

test('el eje de fechas: pocas marcas, con el día escrito y «hoy» al final', () => {
  const t30 = ticksFecha(30, AHORA)
  assert.deepEqual(t30.map(t => t.etiqueta), ['18 oct', '25 oct', '1 nov', '8 nov', 'hoy'])
  assert.equal(ticksFecha(7, AHORA).length, 8)
  assert.deepEqual(ticksFecha(90, AHORA).map(t => t.etiqueta), ['16 sep', '16 oct', 'hoy'])
  assert.ok(ticksFecha(365, AHORA).length <= 6)
})

test('el directorio: quien publicó último, primero; filtra por nombre, capa y tema', () => {
  const canal = (id: string, o: Partial<CanalCuartel> = {}): CanalCuartel => ({ channel_id: id, nombre: id, capa: 'competencia', idioma: 'es', temas: ['claude-code'], ...o })
  const cs = [
    canal('UCviejo', { ultimo_video: { video_id: 'a', titulo: 'a', publicado: hace(20) } }), canal('UCnuevo', { ultimo_video: { video_id: 'b', titulo: 'b', publicado: hace(1) } }),
    canal('UCmudo'), canal('UCyo', { capa: 'propio' }), canal('UCfrontera', { capa: 'frontera', temas: ['frontera-ia'], ultimo_video: { video_id: 'c', titulo: 'c', publicado: hace(2) } }),
  ]
  assert.deepEqual(canalesActivos(cs).map(c => c.channel_id), ['UCnuevo', 'UCfrontera', 'UCviejo', 'UCmudo'])
  assert.deepEqual(canalesActivos(cs, { capa: 'frontera' }).map(c => c.channel_id), ['UCfrontera'])
  assert.deepEqual(canalesActivos(cs, { temas: new Set(['claude-code']) }).map(c => c.channel_id), ['UCnuevo', 'UCviejo', 'UCmudo'])
  assert.deepEqual(canalesActivos(cs, { q: 'front' }).map(c => c.channel_id), ['UCfrontera'])
})

test('la ficha de respaldo: se arma con lo que la pantalla ya tiene; nula si no hay nada del canal', () => {
  const lectura = {
    universo: { canales: [{ channel_id: 'UCa', nombre: 'Canal A', capa: 'competencia', url: 'https://www.youtube.com/channel/UCa' } as CanalCuartel], temas: [], capas: [] },
    videos: [video('1', { publicado: hace(1), outlier: { puntaje: 1.2, esperado: 1, metodo: 'm', confianza: 'alta' } }), video('2', { publicado: hace(9) }), video('otro', { channel_id: 'UCz' })],
    outliers: [video('2', { publicado: hace(9) }), video('3', { publicado: hace(120), outlier: { puntaje: 9, esperado: 1, metodo: 'm', confianza: 'alta' } })],
  }
  const f = fichaLocal('UCa', lectura)!
  assert.equal(f.canal.nombre, 'Canal A')
  assert.deepEqual(f.ultimos.map(v => v.video_id), ['1', '2', '3'])
  assert.deepEqual(f.outliers.map(v => v.video_id), ['3', '2'])
  assert.equal(fichaLocal('UCnada', lectura), null)
  // Un canal descubierto (fuera del universo) también tiene ficha, con su enlace.
  assert.equal(fichaLocal('UCz', lectura)!.canal.url, 'https://www.youtube.com/channel/UCz')
})

test('el detector no lo encabeza el ruido: pesa multiplicador, vistas absolutas, frescura y la historia del canal', () => {
  const xs = [
    video('ruido', { vistas: 13_000, outlier: { puntaje: 129, esperado: 100, metodo: 'curva_generica', confianza: 'baja' } }),
    video('grande', { vistas: 620_000, outlier: { puntaje: 40, esperado: 15_500, metodo: 'maduro', confianza: 'alta' } }),
    video('chico-real', { vistas: 160_000, outlier: { puntaje: 918, esperado: 173, metodo: 'curva_generica', confianza: 'baja' } }),
    video('viejo', { vistas: 620_000, publicado: hace(200), outlier: { puntaje: 40, esperado: 15_500, metodo: 'maduro', confianza: 'alta' } }),
  ]
  // Un ×129 con 13 K vistas no le gana a un ×40 con 620 K; un canal chico que sí reventó (160 K) sigue arriba del ruido.
  assert.deepEqual(ordenarOutliers(xs, AHORA).map(v => v.video_id), ['grande', 'chico-real', 'ruido', 'viejo'])
  // De ×100 para arriba ya no suma: se pinta «×100+».
  assert.equal(pesoOutlier({ ...xs[2], outlier: { ...xs[2].outlier!, puntaje: 100 } }, AHORA), pesoOutlier(xs[2], AHORA))
  assert.equal(multTexto(918), '×100+'); assert.equal(multTexto(36.4), '×36'); assert.equal(multTexto(8.44), '×8.4')
  assert.deepEqual(dominioLog([3, 40, 918], TOPE_MULT), { min: 3, max: 100 })
  // Y en «nuevo y fuerte», un ×918 de confianza baja pesa como un ×4.
  assert.ok(fuerzaFresca(xs[2], AHORA) < fuerzaFresca(xs[1], AHORA))
})

test('el botón del oro dice el tramo: cuánto dura y desde dónde', () => {
  assert.equal(tramoOro({ inicio_s: 3660, fin_s: 3960, etiqueta: '1:01:00', verificado: true }), '5 min desde 1:01:00')
  assert.equal(tramoOro({ inicio_s: 448, verificado: true }), '2 min desde 7:28')
  assert.equal(tramoOro({ inicio_s: 448, verificado: false }), null)
})

test('Inicio: sin mentalidad, sin descubiertos, solo español e inglés, sin lo de la dosis, y cada video dice por qué', () => {
  const lectura = {
    universo: { canales: [], temas: [{ slug: 'claude-code', nombre: 'Claude Code y agentes de código' }], capas: [] },
    videos: [
      video('a'), video('ruso', { channel_id: 'UCru', idioma: 'ru' }), video('desc', { channel_id: 'UCd', capa: 'descubierto' }),
      video('ment', { channel_id: 'UCm', capa: 'mentalidad' }), video('dosis', { channel_id: 'UCx' }),
      video('leido', { channel_id: 'UCl', publicado: hace(6), outlier: { puntaje: 1.1, esperado: 1, metodo: 'm', confianza: 'alta' } }),
    ],
    outliers: [], dosis: { fecha: '2026-11-15', videos: [{ video_id: 'dosis', por_que: '', estado: 'pendiente', video: null }], terminaste: false, fuente: 'cerebro' as const },
    ranking: { leido: { puntaje: 70, por_que_verlo: 'Te da la plantilla de oferta.' } }, estado: null,
  }
  const f = feedInicio(lectura, { ahora: AHORA })
  assert.equal(f.fuente, 'pantalla')
  assert.deepEqual(f.videos.map(v => v.video_id), ['a', 'leido'])
  assert.equal(f.videos[0].por_que, 'Rinde ×3.0 sobre lo normal de su canal · Claude Code')
  assert.equal(f.videos[1].por_que, 'Te da la plantilla de oferta.')
  // Cuando PULSO manda el feed armado (ESQUEMA §9.3), se respeta su orden, su porqué y su cierre; siguen fuera mentalidad y la dosis.
  const item = (v: VideoCuartel, por_que: string, extra: Partial<ItemInicio> = {}): ItemInicio => ({ video_id: v.video_id, puntaje: 70, por_que, por_que_fuente: 'ligera', edad_h: 5, recien: false, estado: 'pendiente', video: v, ...extra })
  const inicio: Inicio = {
    esquema: 'cuartel.inicio/1', generado: '2026-11-15T22:14:00Z', fecha: '2026-11-15', siguiente_pulso: '2026-11-15T22:37:00Z', siguiente_pulso_txt: '16:37',
    pulso: { corrida: 7, inicio: '2026-11-15T22:13:54Z', fin: '2026-11-15T22:14:16Z', estado: 'ok' },
    nuevo: { titulo: 'Lo nuevo de tu universo', ventana_dias: 14, max: 24, pendientes: 2, recien: 1, decididos: 0, en_ventana: 300, al_dia: false,
      mensaje: 'Eso es todo lo nuevo de tu nicho de los últimos 14 días. El siguiente pulso es a las 16:37.',
      items: [item(video('z', { channel_id: 'UCz', outlier: null }), 'Lo dijo PULSO.', { recien: true, outlier_txt: 'midiendo' }), item(video('ment', { capa: 'mentalidad' }), 'x'), item(video('dosis'), 'x'), item(video('a'), '')] },
  }
  const conPulso = feedInicio({ ...lectura, inicio }, { ahora: AHORA })
  assert.equal(conPulso.fuente, 'pulso')
  assert.deepEqual(conPulso.videos.map(v => v.video_id), ['z', 'a'])
  assert.equal(conPulso.videos[0].por_que, 'Lo dijo PULSO.')
  assert.equal(conPulso.videos[0].recien, true); assert.equal(conPulso.videos[0].outlier_txt, 'midiendo')
  // Si un item llega sin porqué, no se inventa: se dice lo que sí se sabe.
  assert.equal(conPulso.videos[1].por_que, 'Rinde ×3.0 sobre lo normal de su canal · Claude Code')
  assert.equal(conPulso.siguiente, '16:37'); assert.equal(conPulso.pulso, '2026-11-15T22:14:16Z')
  assert.match(conPulso.mensaje!, /Eso es todo/); assert.equal(conPulso.alDia, false)
  // Si la hora del siguiente pulso ya pasó (rutina atrasada o apagada), no se repite la promesa vencida.
  const tarde = feedInicio({ ...lectura, inicio }, { ahora: AHORA + 2 * 36e5 })
  assert.equal(tarde.siguiente, null); assert.equal(tarde.mensaje, null); assert.equal(tarde.pulso, '2026-11-15T22:14:16Z')
  // Ya decidió todo: «estás al día».
  assert.equal(feedInicio({ ...lectura, inicio: { ...inicio, nuevo: { ...inicio.nuevo, items: [], al_dia: true } } }).alDia, true)
  // Con búsqueda deja de ser feed y busca en todo.
  assert.equal(feedInicio({ ...lectura, inicio }, { q: 'video leido', ahora: AHORA }).fuente, 'pantalla')
  assert.equal(porQueTeSirve(video('n', { publicado: new Date().toISOString(), outlier: null, temas: [] })), 'Recién publicado')
})

test('Tu canal: el mejor y el peor de una serie, con nombre', () => {
  const xs = [{ t: 'a', ctr: 0.04 }, { t: 'b', ctr: 0.081 }, { t: 'c', ctr: null }, { t: 'd', ctr: 0.032 }]
  const e = extremos(xs, x => x.ctr)!
  assert.equal(e.mejor.t, 'b'); assert.equal(e.peor.t, 'd')
  assert.equal(extremos([{ ctr: 0.1 }], x => x.ctr), null)
})

test('la banda de Tu canal se ve aunque el universo tenga cola larga (escala logarítmica, recortada a p2–p98)', () => {
  const xs = [...Array.from({ length: 40 }, (_, i) => 5_000 + i * 1_000), 4_000_000]
  const b = bandaVisible(xs, 13_000)!
  assert.equal(b.log, true)
  assert.ok(b.p90 - b.p10 > 0.3, `la banda ocupa ${b.p90 - b.p10}`)
  assert.ok(b.tu! > b.p10 && b.tu! < b.p90)
  assert.equal(b.mediana, 25_000)
  assert.equal(bandaVisible([1, 2], 1), null)
  // Sin cola larga se queda lineal.
  assert.equal(bandaVisible([10, 12, 14, 16, 18], 14)!.log, false)
})
