// El marcador por video del canal de Levy (9 nov 2026). Fija el estándar: siempre las mismas siete cifras en el orden del
// embudo, cada una con su fuente y su fecha; lo que no llega es «aún sin dato» y nunca 0; una sola ventana para la semana.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarMarcador, filaVideo, leerMarcador, METRICAS, semanaDe, AUN_SIN_DATO, type ArchivoMarcador, type VideoSensor } from '../../src/features/negocio/marcador-levy'
import { canalPulso, masDias, type CanalSensor } from '../../src/features/negocio/marketing'

const ORDEN = ['impresiones', 'ctr', 'vistas', 'pct_visto', 'retencion_30s', 'clics', 'subs']
const dias = <T>(hasta: string, n: number, f: (d: string) => T) => Array.from({ length: n }, (_, i) => f(masDias(hasta, i - n + 1)))
const canal = (hastaA: string | null, hastaR: string | null, videos: VideoSensor[], clics: ArchivoMarcador['clics'] = null): ArchivoMarcador => ({
  generado: '2026-11-12T12:35:00+00:00', handle: '@levyarbrain', estado: 'ok', videos, clics,
  analytics: hastaA ? { fuente: 'YouTube Analytics', hasta: hastaA, dias: dias(hastaA, 12, fecha => ({ fecha, vistas: fecha >= '2026-11-10' ? 50 : 0, subs_ganados: fecha >= '2026-11-10' ? 2 : 0, pct_visto: fecha >= '2026-11-10' ? 40 : null })) } : null,
  alcance: hastaR ? { fuente: 'YouTube Reporting', hasta: hastaR, dias: dias(hastaR, 12, fecha => ({ fecha, impresiones: fecha >= '2026-11-10' ? 1000 : 0, clics_miniatura: fecha >= '2026-11-10' ? 60 : 0 })) } : null,
})
const v = (o: Partial<VideoSensor> = {}): VideoSensor => ({ id: 'abc', titulo: 'La garantía', url: 'https://youtu.be/abc', estado: 'publico', publicado: '2026-11-10', duracion_s: 333, enlace: 'levy-garantia', tipo: 'largo', analytics: null, alcance: null, retencion_30s: null, ...o })
const clics = (hasta: string, por: Record<string, Record<string, number>>) => ({ fuente: 'Enlaces rastreados', hasta, por_enlace: por })

test('una fila siempre trae las siete cifras en el orden del embudo', () => {
  assert.deepEqual(METRICAS.map(m => m.id), ORDEN)
  const f = filaVideo(v({ analytics: { hasta: '2026-11-11', vistas: 1200, pct_visto: 41.25, subs_ganados: 9 }, alcance: { hasta: '2026-11-10', impresiones: 20000, clics_miniatura: 1100 }, retencion_30s: { hasta: '2026-11-11', valor: 0.617 } }), clics('2026-11-11', { 'levy-garantia': { '2026-11-09': 5, '2026-11-10': 3, '2026-11-11': 4 } }))
  assert.deepEqual(f.celdas.map(c => c.id), ORDEN)
  const por = Object.fromEntries(f.celdas.map(c => [c.id, c]))
  assert.equal(por.impresiones.valor, '20,000')
  assert.equal(por.ctr.valor, '5.5 %')
  assert.equal(por.vistas.valor, '1,200')
  assert.equal(por.pct_visto.valor, '41.3 %')
  assert.equal(por.retencion_30s.valor, '61.7 %')
  assert.equal(por.clics.valor, '7', 'solo desde que salió: el clic previo no cuenta')
  assert.equal(por.subs.valor, '9')
  for (const c of f.celdas) { assert.ok(c.fuente, `${c.id} sin fuente`); assert.match(c.fecha!, /^hasta \d+ nov$/, `${c.id} sin fecha`) }
})

test('lo que no ha llegado dice «aún sin dato» y nunca 0', () => {
  const f = filaVideo(v(), clics('2026-11-09', { 'levy-garantia': {} }))
  for (const c of f.celdas) { assert.equal(c.valor, null, c.id); assert.equal(c.espera, AUN_SIN_DATO, c.id); assert.ok(c.motivo, c.id) }
  const programado = filaVideo(v({ estado: 'programado' }), clics('2026-11-11', { 'levy-garantia': {} }))
  assert.ok(programado.celdas.every(c => c.valor === null && c.espera === AUN_SIN_DATO))
})

test('un enlace medido sin clics sí es 0; sin enlace en la descripción, no', () => {
  const con = filaVideo(v(), clics('2026-11-11', { 'levy-garantia': {} }))
  assert.equal(con.celdas.find(c => c.id === 'clics')!.valor, '0')
  const sin = filaVideo(v({ enlace: null }), clics('2026-11-11', {}))
  const c = sin.celdas.find(x => x.id === 'clics')!
  assert.equal(c.valor, null); assert.match(c.motivo!, /enlace rastreado/)
})

test('la retención a 30 s no aplica a un video de 30 s o menos', () => {
  const c = filaVideo(v({ duracion_s: 28, tipo: 'corto' }), null).celdas.find(x => x.id === 'retencion_30s')!
  assert.equal(c.valor, null); assert.equal(c.espera, 'no aplica')
})

test('sin videos publicados la semana entera espera, aunque las fuentes traigan ceros', () => {
  const s = semanaDe(canal('2026-11-07', '2026-11-07', []))
  assert.equal(s.rango, null)
  assert.ok(s.celdas.filter(c => c.id !== 'retencion_30s').every(c => c.valor === null && c.espera === AUN_SIN_DATO))
})

test('las fuentes que aún no llegan al primer video esperan; las demás ya cuentan', () => {
  const s = semanaDe(canal('2026-11-11', '2026-11-09', [v()], clics('2026-11-11', { 'levy-garantia': { '2026-11-10': 3 } })))
  const por = Object.fromEntries(s.celdas.map(c => [c.id, c]))
  assert.equal(s.hasta, '2026-11-11')
  assert.equal(por.vistas.valor, '100')
  assert.equal(por.impresiones.valor, null); assert.equal(por.impresiones.espera, AUN_SIN_DATO)
  assert.equal(por.ctr.valor, null)
})

test('la semana usa una sola ventana: termina donde termina la fuente más atrasada', () => {
  const a = canal('2026-11-12', '2026-11-11', [v()], clics('2026-11-12', { 'levy-garantia': { '2026-11-11': 2, '2026-11-12': 7 }, 'levy-canal': { '2026-11-10': 1 } }))
  const s = semanaDe(a), por = Object.fromEntries(s.celdas.map(c => [c.id, c]))
  assert.equal(s.desde, '2026-11-05'); assert.equal(s.hasta, '2026-11-11'); assert.equal(s.rango, '5 nov – 11 nov')
  assert.equal(por.impresiones.valor, '2,000')
  assert.equal(por.ctr.valor, '6.0 %')
  assert.equal(por.vistas.valor, '100')
  assert.equal(por.pct_visto.valor, '40.0 %')
  assert.equal(por.clics.valor, '3', 'el clic del 12 cae fuera; el del about sí suma')
  assert.equal(por.subs.valor, '4')
  assert.equal(por.retencion_30s.espera, 'por video')
  for (const c of s.celdas.filter(x => x.valor)) assert.equal(c.fecha, '5 nov – 11 nov')
})

test('la lectura de Levy describe sin metas ni juicios', () => {
  assert.match(armarMarcador(canal('2026-11-07', '2026-11-07', [])).lectura, /todavía no publica/)
  assert.match(armarMarcador(canal('2026-11-07', '2026-11-07', [v({ estado: 'programado' })])).lectura, /«La garantía» sale el 10 nov/)
  assert.match(armarMarcador(canal(null, null, [v()])).lectura, /ya salió.*1 a 3 días/)
  const dos = [v({ analytics: { hasta: '2026-11-12', vistas: 80, pct_visto: 40, subs_ganados: 1 } }), v({ id: 'b', titulo: 'Bonos', publicado: '2026-11-11', analytics: { hasta: '2026-11-12', vistas: 1300, pct_visto: 40, subs_ganados: 1 } })]
  const l = armarMarcador(canal('2026-11-12', '2026-11-12', dos, clics('2026-11-12', { 'levy-garantia': { '2026-11-11': 3 } }))).lectura
  assert.equal(l, 'Semana del 6 nov – 12 nov: 3,000 impresiones, 150 vistas y 3 clics al enlace. El video con más vistas es «Bonos».')
  assert.doesNotMatch(l, /meta|objetivo|debería|bien|mal/i)
})

test('el archivo se lee con tolerancia: lo que no trae sus datos se descarta, no se vuelve 0', () => {
  const { archivo, errores } = leerMarcador({ esquema: 'arbrain.marcador-canal/v1', canal: { handle: '@x' }, estado: 'ok', generado: 'g',
    analytics: { fuente: 'A', dias: [{ fecha: '2026-11-07', vistas: 1, subs_ganados: 0, pct_visto: 3 }, { fecha: '2026-11-08', vistas: null }] }, alcance: null, clics: { hasta: '2026-11-08', por_enlace: { a: { '2026-11-08': 2, malo: 3 } } },
    videos: [{ id: 'v', titulo: 'T', publicado: '2026-11-10', estado: 'publico', analytics: { hasta: 'mal' } }, { titulo: 'sin id' }] })
  assert.equal(archivo!.analytics!.dias.length, 1); assert.equal(archivo!.analytics!.hasta, '2026-11-07')
  assert.equal(archivo!.videos.length, 1); assert.equal(archivo!.videos[0].analytics, null)
  assert.deepEqual(archivo!.clics!.por_enlace.a, { '2026-11-08': 2 })
  assert.equal(errores.length, 1)
  assert.equal(leerMarcador(null).archivo, null)
})

test('la tarjeta del pulso no muestra ceros de un canal cuyos reportes vienen vacíos', () => {
  const levy: CanalSensor = { clave: 'levy', id: 'L', nombre: 'Canal Levy', estado: 'ok',
    analytics: { fuente: 'YouTube Analytics', hasta: '2026-11-07', dias: dias('2026-11-07', 30, fecha => ({ fecha, vistas: 0, subs_ganados: 0, subs_perdidos: 0 })) },
    alcance: { fuente: 'YouTube Reporting · miniaturas', hasta: '2026-11-07', dias: dias('2026-11-07', 30, fecha => ({ fecha, impresiones: 0, clics_miniatura: 0 })) } }
  const c = canalPulso(levy, { porDia: {}, hasta: '2026-11-08', fuente: 'Enlaces rastreados' })
  assert.equal(c.estado, 'esperando')
  assert.ok(c.cifras.every(x => x.valor === null))
})
