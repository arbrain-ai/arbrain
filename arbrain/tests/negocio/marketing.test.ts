// Tu negocio › El pulso › Marketing por canal (8 nov 2026). Daniel lo quiere para sus dos canales, sobre todo el suyo.
// Fija que la semana de cada canal sale de 7 días cerrados de su fuente (nunca de una semana incompleta), que cada cifra
// lleva su fuente y sus fechas, que lo no medido es «esperando primer dato» y no 0, que Levy espera hasta su primer reporte
// de miniaturas y que los clics a la comunidad se atribuyen al canal por su enlace rastreado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canalDeEnlace, canalPulso, clicsPorCanal, leerMarketing, masDias, rango, type CanalSensor, type DiaAlcance, type DiaAnalytics,
} from '../../src/features/negocio/marketing'
import { pulsoMarketing } from '../../src/features/negocio/pulso'

const HASTA = '2026-11-05'
const CANAL_PRINCIPAL = 'UC-principal'
const dias = <T>(n: number, hasta: string, f: (fecha: string, k: number) => T) => Array.from({ length: n }, (_, i) => f(masDias(hasta, -(n - 1 - i)), i))
const analytics = (n = 14, vistas = 1000): DiaAnalytics[] => dias(n, HASTA, (fecha, k) => ({ fecha, vistas: k < n - 7 ? vistas / 2 : vistas, subs_ganados: 10, subs_perdidos: 4 }))
const alcance = (n = 14): DiaAlcance[] => dias(n, HASTA, fecha => ({ fecha, impresiones: 4000, clics_miniatura: 240 }))
const principal = (o: Partial<CanalSensor> = {}): CanalSensor => ({
  clave: 'principal', id: CANAL_PRINCIPAL, nombre: 'Canal principal', estado: 'ok',
  analytics: { fuente: 'YouTube Analytics', hasta: HASTA, dias: analytics() },
  alcance: { fuente: 'YouTube Reporting · miniaturas', hasta: HASTA, dias: alcance() }, ...o,
})
const clics = (porDia: Record<string, number> | null) => ({ porDia, hasta: '2026-11-07', fuente: 'Enlaces rastreados · clics a la comunidad' })

test('canal principal: cinco cifras de la última semana cerrada, cada una con fuente y fechas', () => {
  const c = canalPulso(principal(), clics(Object.fromEntries(dias(14, '2026-11-07', f => [f, 3]))))
  assert.equal(c.estado, 'numero')
  assert.deepEqual(c.cifras.map(x => x.id), ['subs', 'vistas', 'impresiones', 'ctr', 'clics'])
  const por = Object.fromEntries(c.cifras.map(x => [x.id, x]))
  assert.equal(por.subs.valor, '70'); assert.match(por.subs.nota!, /perdió 28: neto \+42/)
  assert.equal(por.vistas.valor, '7,000'); assert.match(por.vistas.cambio!, /\+100 %/)
  assert.equal(por.impresiones.valor, '28,000')
  assert.equal(por.ctr.valor, '6.0 %')
  assert.equal(por.clics.valor, '21'); assert.equal(por.clics.hasta, '2026-11-07'); assert.equal(por.clics.desde, '2026-11-01')
  for (const x of c.cifras) { assert.ok(x.fuente, `${x.id} sin fuente`); assert.ok(x.desde && x.hasta, `${x.id} sin fechas`) }
  assert.equal(por.vistas.desde, '2026-10-30')
  assert.equal(rango('2026-10-30', '2026-11-05'), '30 oct – 5 nov')
})

test('una semana incompleta no se reporta como semana ni se vuelve 0', () => {
  const c = canalPulso(principal({ analytics: { fuente: 'YouTube Analytics', hasta: HASTA, dias: analytics(5) } }), clics({}))
  const vistas = c.cifras.find(x => x.id === 'vistas')!
  assert.equal(vistas.valor, null); assert.ok(vistas.espera)
  // Sin la semana anterior completa, no hay comparación inventada.
  const c2 = canalPulso(principal({ analytics: { fuente: 'YouTube Analytics', hasta: HASTA, dias: analytics(7) } }), clics({}))
  assert.equal(c2.cifras.find(x => x.id === 'vistas')!.cambio, undefined)
})

test('Levy: sin vistas ni reporte de miniaturas queda «esperando primer dato»; con reporte, ya tiene cifras', () => {
  const ceros = dias(30, HASTA, fecha => ({ fecha, vistas: 0, subs_ganados: 0, subs_perdidos: 0 }))
  const levy: CanalSensor = { clave: 'levy', id: 'UC-levy', nombre: 'Canal Levy', estado: 'ok', analytics: { fuente: 'YouTube Analytics', hasta: HASTA, dias: ceros }, alcance: null }
  const c = canalPulso(levy, clics(null))
  assert.equal(c.estado, 'esperando')
  assert.ok(c.cifras.every(x => x.valor === null && x.espera && /primer dato/.test(x.espera)))
  const llego = canalPulso({ ...levy, alcance: { fuente: 'YouTube Reporting · miniaturas', hasta: HASTA, dias: alcance(7) } }, clics(null))
  assert.equal(llego.estado, 'numero')
  assert.equal(llego.cifras.find(x => x.id === 'impresiones')!.valor, '28,000')
  // Sin enlaces rastreados del canal: esperando, no 0 clics.
  const cl = llego.cifras.find(x => x.id === 'clics')!
  assert.equal(cl.valor, null); assert.match(cl.espera!, /enlaces rastreados/)
})

test('principal sin reporte de miniaturas: vistas sí, impresiones y CTR esperando', () => {
  const c = canalPulso(principal({ alcance: null }), clics({}))
  assert.equal(c.estado, 'numero')
  assert.equal(c.cifras.find(x => x.id === 'vistas')!.valor, '7,000')
  assert.equal(c.cifras.find(x => x.id === 'impresiones')!.valor, null)
  assert.equal(c.cifras.find(x => x.id === 'ctr')!.valor, null)
  // Enlaces del canal sin clics en la semana: eso sí es 0 medido.
  assert.equal(c.cifras.find(x => x.id === 'clics')!.valor, '0')
})

test('sin token o con error sin foto previa: lo dice, sin cifras', () => {
  assert.equal(canalPulso({ ...principal(), estado: 'sin-token', analytics: null, alcance: null }, null).estado, 'sin-token')
  const e = canalPulso({ ...principal(), estado: 'error', error: 'RefreshError: invalid_grant', analytics: null, alcance: null }, null)
  assert.equal(e.estado, 'error'); assert.equal(e.cifras.length, 0); assert.match(e.error!, /invalid_grant/)
  // Error con foto anterior: se ve la foto y el error.
  const conFoto = canalPulso({ ...principal(), estado: 'error', error: 'HttpError 500' }, clics({}))
  assert.equal(conFoto.estado, 'numero'); assert.match(conFoto.error!, /500/)
})

test('el archivo del sensor se lee con tolerancia: el día sin números se descarta', () => {
  const { archivo, errores } = leerMarketing({ esquema: 'arbrain.marketing/v1', generado: '2026-11-08T12:20:00+00:00', canales: [
    { clave: 'principal', id: CANAL_PRINCIPAL, nombre: 'Canal principal', estado: 'ok',
      analytics: { fuente: 'YouTube Analytics', dias: [{ fecha: '2026-11-04', vistas: 10, subs_ganados: 1, subs_perdidos: 0 }, { fecha: '2026-11-05', vistas: null }] }, alcance: null },
    { nombre: 'sin clave' },
  ] })
  assert.equal(archivo!.canales.length, 1)
  assert.equal(archivo!.canales[0].analytics!.dias.length, 1)
  assert.equal(archivo!.canales[0].analytics!.hasta, '2026-11-04')
  assert.equal(archivo!.canales[0].alcance, null)
  assert.equal(errores.length, 1)
  assert.equal(leerMarketing({}).archivo, null)
})

test('clics por canal: metadata.canal manda; source youtube es del principal; lo demás no cuenta', () => {
  const enlaces = [
    { id: 'a', slug: 'vid-x', source: 'youtube', campaign: 'x', metadata: {} },
    { id: 'b', slug: 'levy-1', source: 'youtube', campaign: 'y', metadata: { canal: 'UC-levy' } },
    { id: 'c', slug: 'talentland', source: 'talentland', campaign: null, metadata: null },
  ]
  assert.equal(canalDeEnlace(enlaces[0], CANAL_PRINCIPAL), CANAL_PRINCIPAL)
  assert.equal(canalDeEnlace(enlaces[2], CANAL_PRINCIPAL), null)
  const m = clicsPorCanal(enlaces, [{ link_id: 'a', dia: '2026-11-06' }, { link_id: 'a', dia: '2026-11-06' }, { link_id: 'b', dia: '2026-11-07' }, { link_id: 'c', dia: '2026-11-07' }, { link_id: 'a', dia: '2026-11-08' }], '2026-11-07', CANAL_PRINCIPAL)
  assert.deepEqual(m.get(CANAL_PRINCIPAL), { '2026-11-06': 2 })
  assert.deepEqual(m.get('UC-levy'), { '2026-11-07': 1 })
  assert.equal(m.size, 2)
})

test('el pulso: con canales medidos, la tarjeta trae los canales; sin ninguna cifra, espera', () => {
  const ok = pulsoMarketing({ data: { activo: true, generado: '2026-11-08T12:20:00Z', canales: [canalPulso(principal(), clics({}))] } })
  assert.equal(ok.estado, 'numero'); assert.equal(ok.canales!.length, 1); assert.match(ok.fuente, /sensor del 8 nov/)
  const levy = canalPulso({ clave: 'levy', id: 'L', nombre: 'Canal Levy', estado: 'ok', analytics: null, alcance: null }, null)
  const espera = pulsoMarketing({ data: { activo: true, generado: null, canales: [levy] } })
  assert.equal(espera.estado, 'sin-sensor'); assert.match(espera.falta!, /primer dato/)
  assert.equal(pulsoMarketing({ error: 'La fuente respondió 500.' }).estado, 'error')
})
