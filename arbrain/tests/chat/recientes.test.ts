import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agruparPorDia, diasAtras, etiquetaDia, ordenarFijadas, separarFijadas, unirListas } from '../../src/features/chat/lib/recientes-lista'
import { cuentaReciente, filtroCuentas } from '../../src/features/chat/lib/recientes-cuentas'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

// Fechas en hora local (la app corre en America/Mexico_City): las pruebas no dependen de la zona de quien las corre.
const AHORA = new Date(2026, 9, 1, 17, 41).getTime() // jueves 1 oct 2026
const hace = (dias: number, h = 12, m = 0) => new Date(2026, 9, 1 - dias, h, m).getTime()

let n = 0
function ses(cuando: number | null, extra: Partial<ChatSession> = {}): ChatSession {
  const iso = new Date(cuando ?? 0).toISOString()
  return {
    id: `s${++n}`, title: `conversación ${n}`, is_favorite: false, profile_id: null,
    created_at: iso, updated_at: iso, last_message_at: cuando === null ? null : iso, ...extra,
  }
}

test('encabezados: Hoy, Ayer, Hace 2 días y luego la fecha corta en español', () => {
  assert.equal(etiquetaDia(hace(0, 0, 5), AHORA), 'Hoy')
  assert.equal(etiquetaDia(hace(1), AHORA), 'Ayer')
  assert.equal(etiquetaDia(hace(2), AHORA), 'Hace 2 días')
  assert.equal(etiquetaDia(hace(3), AHORA), 'lun 28 sept')
  assert.equal(etiquetaDia(hace(6), AHORA), 'vie 25 sept')
  assert.equal(etiquetaDia(new Date(2025, 11, 30, 9).getTime(), AHORA), 'mar 30 dic 2025', 'otro año lleva el año')
})

test('el corte de día es la medianoche local, no 24 horas', () => {
  assert.equal(diasAtras(hace(1, 23, 59), AHORA), 1)
  assert.equal(diasAtras(hace(0, 0, 1), AHORA), 0)
  // A las 00:30 de hoy, lo de las 23:50 de ayer ya es «Ayer» aunque hayan pasado 40 minutos.
  const pasadaMedianoche = new Date(2026, 9, 1, 0, 30).getTime()
  assert.equal(etiquetaDia(hace(1, 23, 50), pasadaMedianoche), 'Ayer')
  assert.equal(etiquetaDia(hace(0, 0, 10), pasadaMedianoche), 'Hoy')
})

test('agrupa por día de lo más nuevo a lo más viejo y ordena dentro de cada día', () => {
  const grupos = agruparPorDia([ses(hace(1, 9)), ses(hace(0, 8)), ses(hace(0, 16)), ses(hace(4, 10)), ses(hace(1, 20))], AHORA, { maxDias: 7 })
  assert.deepEqual(grupos.map((g) => g.etiqueta), ['Hoy', 'Ayer', 'dom 27 sept'])
  assert.deepEqual(grupos.map((g) => g.dias), [0, 1, 4])
  const horas = grupos[0].sesiones.map((s) => new Date(s.last_message_at!).getHours())
  assert.deepEqual(horas, [16, 8])
})

test('el momento es el último mensaje; sin mensajes, la última edición', () => {
  // Renombrada hoy (updated_at) pero con el último mensaje hace 5 días: va en su día, no en Hoy.
  const renombrada = ses(hace(5), { updated_at: new Date(hace(0)).toISOString() })
  // Conversación nueva sin mensajes: cuenta por updated_at.
  const nueva = ses(null, { updated_at: new Date(hace(0, 17)).toISOString() })
  const grupos = agruparPorDia([renombrada, nueva], AHORA, { maxDias: 7 })
  assert.deepEqual(grupos.map((g) => [g.etiqueta, g.sesiones[0].id]), [['Hoy', nueva.id], ['sáb 26 sept', renombrada.id]])
})

test('tope: solo los últimos tres días (Hoy, Ayer, Hace 2 días) y 40 conversaciones', () => {
  const diez = Array.from({ length: 10 }, (_, i) => ses(hace(i)))
  assert.deepEqual(agruparPorDia(diez, AHORA).map((g) => g.etiqueta), ['Hoy', 'Ayer', 'Hace 2 días'])

  const muchas = Array.from({ length: 55 }, (_, i) => ses(new Date(2026, 9, 1, 1, 0, i).getTime()))
  const hoy = agruparPorDia(muchas, AHORA)
  assert.equal(hoy.length, 1)
  assert.equal(hoy[0].sesiones.length, 40)

  // Sin actividad en tres días, la barra queda solo con las fijadas: lo viejo vive en «Ver todas».
  const viejas = Array.from({ length: 8 }, (_, i) => ses(hace(30 + i)))
  assert.equal(agruparPorDia(viejas, AHORA).length, 0)
})

test('el hilo Automatizaciones, las fechas ilegibles y las futuras no estorban', () => {
  const auto = ses(hace(0), { title: 'Automatizaciones' })
  const rota = ses(null, { updated_at: 'no es fecha', last_message_at: null })
  const futura = ses(hace(0) + 3 * 86_400_000)
  const normal = ses(hace(0, 9))
  const grupos = agruparPorDia([auto, rota, futura, normal], AHORA)
  assert.equal(grupos.length, 1, 'la del futuro cae en Hoy, no abre un grupo propio')
  assert.deepEqual(grupos[0].sesiones.map((s) => s.id).sort(), [futura.id, normal.id].sort())
})

test('unir: la publicada gana si no es más vieja, sin duplicar; entran todas las cuentas', () => {
  const t = hace(0, 10)
  const traidaVieja = ses(t, { id: 'a', title: 'título viejo' })
  const publicadaViva = ses(t + 60_000, { id: 'a', title: 'título nuevo' })
  const traidaFresca = ses(t + 120_000, { id: 'b', title: 'fresca de la API' })
  const publicadaAtrasada = ses(t, { id: 'b', title: 'atrasada' })
  const bro = ses(t - 1000, { id: 'c', account: 'bro' })
  const yt = ses(t - 2000, { id: 'd', account: 'yt' })

  const lista = unirListas([traidaVieja, traidaFresca, bro, yt], [publicadaViva, publicadaAtrasada])
  assert.deepEqual(lista.map((s) => [s.id, s.title]), [['b', 'fresca de la API'], ['a', 'título nuevo'], ['c', bro.title], ['d', yt.title]])
})

test('unir: Claude Code sin fila en la base queda fuera; el hilo de reportes vigente entra y los duplicados viejos no', () => {
  const normal = ses(hace(0, 9), { id: 'x' })
  const sdk = ses(hace(0, 10), { id: 'sdk:1', isSDKOnly: true })
  const auto = ses(hace(0, 11), { id: 'z', title: 'Automatizaciones', is_favorite: true })
  const viejo = ses(hace(0, 8), { id: 'v', title: 'Automatizaciones', is_favorite: false })
  assert.deepEqual(unirListas([normal, auto, viejo], [sdk]).map((s) => s.id), ['z', 'x'])
})

test('Fijadas: «Reportes» va primero aunque otras tengan posición manual', () => {
  const a = ses(hace(0, 9), { id: 'a', is_favorite: true, pinned_position: 0 })
  const b = ses(hace(0, 10), { id: 'b', is_favorite: true })
  const auto = ses(hace(2), { id: 'z', title: 'Automatizaciones', is_favorite: true, pinned_position: 5 })
  assert.deepEqual(ordenarFijadas([a, b, auto]).map((s) => s.id), ['z', 'b', 'a'])
})

test('unir: la solo-SDK con turnos de Arbrain en el journal SÍ entra (1 oct 2026, regresión de 98d1a061)', () => {
  const normal = ses(hace(0, 9), { id: 'x' })
  const ajena = ses(hace(0, 10), { id: 'sdk:ajena', isSDKOnly: true })
  const propia = ses(hace(0, 11), { id: 'sdk:propia', isSDKOnly: true, conTurnosArbrain: true })
  assert.deepEqual(unirListas([normal, ajena, propia], []).map((s) => s.id), ['sdk:propia', 'x'])
  // Publicada y traída a la vez: una sola vez.
  assert.deepEqual(unirListas([propia], [propia]).map((s) => s.id), ['sdk:propia'])
})

test('fijadas: van aparte y no se repiten en los días', () => {
  const fija = ses(hace(20), { id: 'f', is_favorite: true })
  const hoy = ses(hace(0, 9), { id: 'h' })
  const { fijadas, resto } = separarFijadas(unirListas([fija, hoy], []))
  assert.deepEqual(fijadas.map((s) => s.id), ['f'])
  assert.deepEqual(resto.map((s) => s.id), ['h'])
})

test('rótulo de cuenta: la de Daniel no lleva; las demás, uno corto', () => {
  assert.equal(cuentaReciente('default').corta, '')
  assert.equal(cuentaReciente('bro').corta, 'bro')
  assert.equal(cuentaReciente('codex').corta, 'GPT')
})

test('API: el parámetro account acepta una o varias cuentas y no rompe lo anterior', () => {
  assert.equal(filtroCuentas(null), null)
  assert.equal(filtroCuentas(''), null)
  assert.equal(filtroCuentas('basura'), null, 'inválido = sin filtro, como antes')
  assert.deepEqual(filtroCuentas('default'), { isNull: true })
  assert.deepEqual(filtroCuentas('bro'), { eq: 'bro' })
  assert.deepEqual(filtroCuentas('yt'), { eq: 'yt' })
  assert.deepEqual(filtroCuentas('default,bro,codex'), { or: 'account.is.null,account.in.(bro,codex)' })
  assert.deepEqual(filtroCuentas('codex, yt'), { or: 'account.in.(codex,yt)' })
  assert.deepEqual(filtroCuentas('yt,bro,bro,xx,default'), { or: 'account.is.null,account.in.(bro,yt)' })
})
