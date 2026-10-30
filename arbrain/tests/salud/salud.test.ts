/**
 * Vista Salud (5 oct 2026): el cuerpo contra TU normal, la lectura del día sin inventar, hábitos solo con muestras
 * suficientes, el parser de Health Auto Export con el dedup del 24 jul y el cableado de la vista.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { agregarDias, muestrasDeHae } from '../../src/features/salud/hae'
import { base, habitoVsCuerpo, lectura, metrica, reloj, resumenSalud, serie, sinDatos, sumarDias, tendencia, type DatosSalud, type Dia, type Marca } from '../../src/features/salud/modelo'
import { hashToken, tokenDe, urlIngest } from '../../src/features/salud/servidor'
import { parseMostrar, rutaDe, seccionDe } from '../../src/features/cabina/model'

const HOY = '2026-10-05'
/** 40 días de un cuerpo estable (sueño 7.3, HRV 40, pulso 62, resp 17, temp 35.6) y un hoy a elegir. */
function historia(hoy: Partial<Dia> = {}, n = 40): Dia[] {
  const dias: Dia[] = Array.from({ length: n }, (_, i) => {
    const k = i % 5
    return { fecha: sumarDias(HOY, i - n), sueno_horas: 7.1 + k * 0.1, hrv_ms: 38 + k, resting_hr: 61 + (k % 3), resp_rate: 16.9 + k * 0.05, temp_muneca: 35.55 + k * 0.03, pasos: 7000 + k * 400 }
  })
  return [...dias, { fecha: HOY, ...hoy }]
}

describe('salud · Health Auto Export', () => {
  const envio = { data: { metrics: [
    { name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-10-05 00:00:00 -0600', asleep: 0, totalSleep: 7.5, deep: 1, rem: 2, core: 4, awake: 0.5, sleepStart: '2026-10-04 22:00:00 -0600', sleepEnd: '2026-10-05 06:00:00 -0600' }] },
    { name: 'step_count', units: 'count', data: [{ date: '2026-10-05 15:19:00 -0600', qty: 22 }, { date: '2026-10-05 15:20:00 -0600', qty: 30 }] },
    { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-10-05 03:00:00 -0600', qty: 50 }, { date: '2026-10-05 15:15:00 -0600', qty: 60 }] },
    { name: 'heart_rate', units: 'count/min', data: [{ date: '2026-10-05 15:15:00 -0600', qty: 90 }] },
  ] } }

  it('traduce las 7 métricas, ignora las demás y guarda la hora de dormir', () => {
    const m = muestrasDeHae(envio)
    assert.equal(m.filter(x => x.metrica === 'pasos').length, 2)
    assert.ok(!m.some(x => x.metrica === 'heart_rate'))
    const sueno = m.find(x => x.metrica === 'sueno_horas')!
    assert.equal(sueno.valor, 7.5, 'asleep en 0 no gana sobre totalSleep')
    assert.deepEqual(sueno.extra, { inicio: '2026-10-04 22:00:00 -0600', fin: '2026-10-05 06:00:00 -0600' })
  })

  it('reenviar lo mismo no cuenta doble (la llave es el timestamp exacto)', () => {
    const una = muestrasDeHae(envio), dos = muestrasDeHae({ data: { metrics: [...envio.data.metrics, ...envio.data.metrics] } })
    assert.equal(dos.length, una.length)
    const dia = agregarDias(dos).get(HOY)!
    assert.equal(dia.pasos, 52); assert.equal(dia.hrv_ms, 55); assert.equal(dia.sueno_horas, 7.5)
  })

  it('tolera envíos sin «data», en minutos y basura', () => {
    const m = muestrasDeHae({ metrics: [{ name: 'sleep_analysis', units: 'min', data: [{ date: '2026-10-04 00:00:00 -0600', deep: 60, rem: 90, core: 240 }] }] })
    assert.equal(m.find(x => x.metrica === 'sueno_horas')!.valor, 6.5, 'sin total, se reconstruye de las fases')
    assert.deepEqual(muestrasDeHae(null), []); assert.deepEqual(muestrasDeHae({ data: 'x' }), [])
  })
})

describe('salud · tu normal y tendencias', () => {
  it('la banda sale de los 60 días anteriores sin hoy; con menos de 10, aprende', () => {
    const b = base(historia({ hrv_ms: 99 }), 'hrv_ms', HOY)
    assert.equal(b.n, 40); assert.ok(b.suficiente); assert.equal(b.p50, 40)
    const poca = base(historia({}, 6), 'hrv_ms', HOY)
    assert.equal(poca.suficiente, false); assert.equal(poca.n, 6)
  })

  it('7 d dice cuántos se midieron; los pasos de hoy no cuentan (van en curso)', () => {
    const dias = historia({ pasos: 100 }).map(d => d.fecha === sumarDias(HOY, -2) ? { ...d, hrv_ms: null } : d)
    const t = tendencia(dias, metrica('hrv_ms'), HOY, 7)
    assert.equal(t.medidos, 5, 'hoy sin HRV y un día sin medir: 5 de 7')
    const p = tendencia(dias, metrica('pasos'), HOY, 7)
    assert.equal(p.medidos, 7); assert.ok(p.media! > 7000, 'los 100 pasos de hoy no hunden el promedio')
  })

  it('más pulso en reposo va en contra; la temperatura solo se sale de lo tuyo', () => {
    const dias = historia()
    const masPulso = tendencia(dias.map(d => d.fecha >= sumarDias(HOY, -6) ? { ...d, resting_hr: 70 } : d), metrica('resting_hr'), HOY, 7)
    assert.equal(masPulso.sentido, 'contra')
    const fiebre = tendencia(dias.map(d => d.fecha >= sumarDias(HOY, -6) ? { ...d, temp_muneca: 36.4 } : d), metrica('temp_muneca'), HOY, 7)
    assert.equal(fiebre.sentido, 'fuera')
  })

  it('la tira marca sin medir como null, nunca cero', () => {
    const s = serie(historia({ hrv_ms: null }), metrica('hrv_ms'), HOY)
    assert.equal(s.length, 30); assert.equal(s.at(-1)!.hoy, true); assert.equal(s.at(-1)!.valor, null)
  })
})

describe('salud · la lectura del día', () => {
  it('sin sueño ni HRV de hoy: sin lectura, y dice cuál fue el último día', () => {
    const l = lectura(historia({}), HOY)
    assert.equal(l.estado, 'sin-lectura'); assert.equal(l.ultimoDia, sumarDias(HOY, -1))
  })
  it('buen sueño y HRV arriba de tu banda: con margen, y nombra el objetivo', () => {
    const l = lectura(historia({ sueno_horas: 8.4, hrv_ms: 57, resting_hr: 62, resp_rate: 17, temp_muneca: 35.6 }), HOY, 'Grabar el video 3')
    assert.equal(l.estado, 'margen'); assert.match(l.hacer, /«Grabar el video 3»/)
  })
  it('HRV arriba pero pulso arriba: señales cruzadas y dice cuál va en contra', () => {
    const l = lectura(historia({ sueno_horas: 7.2, hrv_ms: 57, resting_hr: 70 }), HOY)
    assert.equal(l.estado, 'cruzadas'); assert.match(l.hacer, /pulso en reposo/)
  })
  it('menos de 6 h: pide calma', () => { assert.equal(lectura(historia({ sueno_horas: 5.2, hrv_ms: 40, resting_hr: 62 }), HOY).estado, 'calma') })
  it('temperatura y respiración arriba a la vez: vigila', () => {
    assert.equal(lectura(historia({ sueno_horas: 7.5, hrv_ms: 40, resting_hr: 62, temp_muneca: 36.3, resp_rate: 19 }), HOY).estado, 'vigila')
  })
  it('lo que no llega se dice «sin medir» y no vota', () => {
    const l = lectura(historia({ sueno_horas: 7.4, hrv_ms: 40 }), HOY)
    assert.ok(l.senales.some(s => s.clave === 'resting_hr' && s.sinMedir && s.voto === null))
    assert.ok(l.senales.some(s => s.clave === 'temp_muneca' && s.sinMedir))
  })
})

describe('salud · hábitos y cuerpo', () => {
  const dias = historia({ sueno_horas: 8, hrv_ms: 45 })
  const marca = (dia: number, hecho: boolean | null): Marca => ({ fecha: sumarDias(HOY, -dia), clave: 'lectura', hecho })
  it('pocas muestras: no compara y dice cuántas faltan; sin registro no es «no cumplido»', () => {
    const r = habitoVsCuerpo({ clave: 'lectura', nombre: 'Leer 20 min' }, [marca(3, true), marca(4, true), marca(5, null)], dias, HOY)
    assert.equal(r.suficiente, false); assert.equal(r.si.noches, 2); assert.equal(r.no.noches, 0); assert.equal(r.faltanSi, 3); assert.equal(r.faltanNo, 5)
  })
  it('una marca cuya noche no se midió no cuenta como muestra', () => {
    const r = habitoVsCuerpo({ clave: 'lectura', nombre: 'Leer 20 min' }, [marca(60, true)], dias, HOY)
    assert.equal(r.si.noches, 0); assert.equal(r.sinMedir, 1)
  })
  it('con 5 y 5 compara la noche siguiente', () => {
    const marcas = [1, 2, 3, 4, 5].map(d => marca(d, true)).concat([6, 7, 8, 9, 10].map(d => marca(d, false)))
    const r = habitoVsCuerpo({ clave: 'lectura', nombre: 'Leer 20 min' }, [...marcas, { fecha: HOY, clave: 'lectura', hecho: true }], dias, HOY)
    assert.equal(r.suficiente, true); assert.equal(r.hoy, true); assert.ok(r.si.hrv != null && r.no.hrv != null)
  })
})

describe('salud · reloj, resumen, ingest y cableado', () => {
  const ahora = Date.parse('2026-10-05T23:00:00Z')
  it('solo el reloj reciente está vivo', () => {
    assert.equal(reloj('2026-10-05T22:14:00Z', ahora), 'vivo'); assert.equal(reloj('2026-10-05T10:00:00Z', ahora), 'reciente')
    assert.equal(reloj('2026-10-03T10:00:00Z', ahora), 'callado'); assert.equal(reloj(null, ahora), 'nunca')
  })
  it('sin datos pide conectar el reloj', () => {
    const x = { dias: [{ fecha: HOY, hrv_ms: null }], hoy: HOY } as unknown as DatosSalud
    assert.equal(sinDatos(x), true); assert.equal(resumenSalud(x), 'sin reloj conectado')
  })
  it('el token viaja por Bearer o ?k=; se guarda su hash; el teléfono nunca recibe una URL local', () => {
    const t = 'arb_salud_abcdefghijklmnopqrstuvwxyz'
    assert.equal(tokenDe(new Request('https://x/api/salud/ingest', { headers: { Authorization: `Bearer ${t}` } })), t)
    assert.equal(tokenDe(new Request(`https://x/api/salud/ingest?k=${t}`)), t)
    assert.equal(tokenDe(new Request('https://x/api/salud/ingest?k=corto')), null)
    assert.equal(hashToken(t).length, 64); assert.notEqual(hashToken(t), t)
    const antes = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    try {
      assert.equal(urlIngest('https://estudio.ejemplo.ts.net:10000'), 'https://estudio.ejemplo.ts.net:10000/api/salud/ingest', 'local: el host público de la petición')
      assert.equal(urlIngest('http://127.0.0.1:3300'), 'http://localhost:3000/api/salud/ingest', 'nada público: se dice la local, no se inventa otra')
      process.env.NEXT_PUBLIC_SITE_URL = 'https://estudio.ejemplo.ts.net:10000'
      assert.equal(urlIngest('http://127.0.0.1:3300'), 'https://estudio.ejemplo.ts.net:10000/api/salud/ingest', 'el sitio público manda')
    } finally { if (antes == null) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = antes }
  })
  it('Levy puede mostrarla y expandir lleva a /salud', () => {
    assert.deepEqual(parseMostrar(JSON.stringify({ vista: 'salud' }))?.vista, 'salud')
    assert.equal(rutaDe({ destino: 'salud' }), '/salud'); assert.equal(seccionDe({ vista: 'salud' }), '/salud')
  })
})
