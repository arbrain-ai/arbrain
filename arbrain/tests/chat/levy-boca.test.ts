import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canalesEn, esAtlasCanales, FORMAS, pesosCanales, pistaBoca, type AtlasCanales, type Canales } from '../../src/features/chat/lib/levy-boca.ts'
import type { Alineacion } from '../../src/features/chat/lib/levy-visemas.ts'

// Fixture: boca_nueva.py (la boca de los videos, labios.sh del 11 nov) corrida sobre la frase de prueba del 18 nov.
const FX = JSON.parse(readFileSync(new URL('./levy-boca-videos.json', import.meta.url), 'utf8')) as {
  chars: string[]; starts: number[]; ends: number[]; dur: number; rms: number[]; cuadros: [number, number, number, number][] }
const energia = { rms: Float32Array.from(FX.rms), frames: FX.rms.length }
const pistaFx = () => pistaBoca({ chars: FX.chars, starts: FX.starts, ends: FX.ends }, energia, FX.dur)

// Manifiesto mínimo con la rejilla del horno (poses_canales.py, 18 nov).
const ABRE = [0, 0.1, 0.2, 0.35, 0.55, 0.82], ANCHO = [-1.1, -0.55, 0, 0.4, 0.8], CIERRE = [-0.3, 0, 0.3]
const n2 = (x: number) => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(2)}`
const ATLAS: AtlasCanales = {
  modo: 'canales',
  teselas: ['sil', ...ABRE.flatMap(a => ANCHO.flatMap(w => (a === 0 && w === 0 ? [] : [`g${a.toFixed(2)}_${n2(w)}`]))), ...CIERRE.map(w => `PP_${n2(w)}`), 'CH'],
  rejilla_canales: { abre: ABRE, ancho: ANCHO, cierre_ancho: CIERRE, ch: { abre: 0.12, ancho: -0.24, redondo: 0.24 } },
}

test('paridad con boca_nueva.py: los 4 canales de cada cuadro de la frase de prueba', () => {
  const p = pistaFx()
  let peor = 0, malos = 0
  FX.cuadros.forEach(([ab, an, re, ci], i) => {
    const c = canalesEn(p, (i + 0.5) / 30)
    const d = Math.max(Math.abs(c.abre - ab), Math.abs(c.ancho - an), Math.abs(c.redondo - re), Math.abs(c.cierra - ci))
    peor = Math.max(peor, d); if (d > 0.01) malos++
  })
  // La compuerta de silencio se mide con la energía a 10 ms (la del navegador) y no con las muestras del cuadro: a lo
  // sumo un par de cuadros de borde difieren. Todo lo demás es exacto.
  assert.ok(malos <= 3, `cuadros distintos: ${malos} (peor ${peor.toFixed(3)})`)
  const cierres = FX.cuadros.filter(q => q[3] > 0.5).length
  const nuestros = FX.cuadros.filter((_, i) => canalesEn(p, (i + 0.5) / 30).cierra > 0.5).length
  assert.equal(nuestros, cierres, 'los mismos cuadros con labios juntos (p/b/m)')
})

/** Alineación sintética: cada carácter dura `ms`, con voz en todo el audio. */
function al(texto: string, ms = 70): [Alineacion, { rms: Float32Array; frames: number }, number] {
  const chars = [...texto], dur = chars.length * ms / 1000 + 0.3
  const frames = Math.round(dur * 100), rms = new Float32Array(frames).fill(0.08)
  return [{ chars, starts: chars.map((_, i) => i * ms / 1000), ends: chars.map((_, i) => (i + 1) * ms / 1000) }, { rms, frames }, dur]
}
const pico = (p: ReturnType<typeof pistaBoca>, letra: string, n = 0): Canales => {
  const f = p.fonemas.filter(x => x.letra.toLowerCase() === letra)[n]
  return canalesEn(p, (f.s + f.e) / 2)
}

test('p, b, m y v juntan los labios al menos 2 cuadros de 30 cps aunque duren menos', () => {
  const [a, e, d] = al('papá bebe mamá y vive', 25)
  const p = pistaBoca(a, e, d)
  for (const f of p.fonemas.filter(x => x.v === 'PP')) {
    let cuadros = 0
    for (let i = 0; i < Math.round(d * 30); i++) {
      const t = (i + 0.5) / 30
      if (canalesEn(p, t).cierra > 0.5 && t > f.s - 0.1 && t < f.e + 0.1) cuadros++
    }
    assert.ok(cuadros >= 2, `${f.letra} cierra ${cuadros} cuadros`)
    const c = pico(p, f.letra.toLowerCase(), p.fonemas.filter(x => x.letra.toLowerCase() === f.letra.toLowerCase()).indexOf(f))
    assert.equal(c.cierra, 1); assert.equal(c.abre, 0, 'con los labios juntos la boca no abre')
  }
})

test('la o y la u redondean estrechando las comisuras, sin beso; la a abre más que ninguna', () => {
  const [a, e, d] = al('casa todo luna', 110)
  const p = pistaBoca(a, e, d)
  const A = pico(p, 'a'), O = pico(p, 'o'), U = pico(p, 'u')
  assert.ok(A.abre > O.abre && O.abre > U.abre, `a ${A.abre} > o ${O.abre} > u ${U.abre}`)
  assert.ok(O.ancho < -0.5, 'la o estrecha las comisuras')
  assert.ok(O.redondo === 0 && U.redondo === 0, 'sin «redondo» (adelantar los labios) en o/u')
  // antibeso: el ancho negativo nunca pasa de 2× lo que abre
  for (let t = 0; t < d; t += 0.005) { const c = canalesEn(p, t); if (c.cierra < 0.5) assert.ok(c.ancho >= -2 * c.abre - 1e-6, `beso en ${t}`) }
  assert.equal(FORMAS.aa[0], 0.82, 'la a se queda bajo 0,85 (más arriba LivePortrait dibuja dientes)')
})

test('las consonantes de lengua toman la forma de la vocal vecina; la vocal átona abre menos', () => {
  const [a, e, d] = al('tú ti', 110)
  const p = pistaBoca(a, e, d)
  const tu = p.fonemas.find(f => f.f === 't' && f.palabra === 0)!, ti = p.fonemas.find(f => f.f === 't' && f.palabra === 1)!
  assert.ok(tu.ancho < 0 && ti.ancho > 0.3, `t de tú ${tu.ancho} (estrecha) · t de ti ${ti.ancho} (estira)`)
  const [a2, e2, d2] = al('casa', 120)
  const p2 = pistaBoca(a2, e2, d2)
  const [ton, aton] = p2.fonemas.filter(f => f.v === 'aa')
  assert.ok(ton.tonica && !aton.tonica && aton.abre < ton.abre)
})

test('en silencio la boca descansa', () => {
  const [a, e, d] = al('hola', 100)
  const rms = new Float32Array(Math.round((d + 1) * 100))   // un segundo de silencio al final
  rms.set(e.rms)
  const p = pistaBoca(a, { rms, frames: rms.length }, d + 1)
  const c = canalesEn(p, d + 0.7)
  assert.equal(c.abre + Math.abs(c.ancho) + c.redondo, 0)
})

test('pesos del atlas: bilineal en abre × ancho, cierre con su forma, neutro implícito, máximo 6', () => {
  assert.ok(esAtlasCanales(ATLAS))
  const idx = (k: string) => ATLAS.teselas.indexOf(k)
  // justo en un vértice de la rejilla: una sola tesela entera
  assert.deepEqual(pesosCanales({ abre: 0.55, ancho: -1.1, redondo: 0, cierra: 0 }, ATLAS), [[idx('g0.55_-1.10'), 1]])
  // a media celda: cuatro esquinas que suman 1
  const w = pesosCanales({ abre: 0.275, ancho: 0.2, redondo: 0, cierra: 0 }, ATLAS)
  assert.equal(w.length, 4); assert.ok(Math.abs(w.reduce((s, [, x]) => s + x, 0) - 1) < 1e-6)
  // cerca del reposo, lo que sobra es el neutro (tesela 0 nunca aparece)
  const r = pesosCanales({ abre: 0.02, ancho: 0, redondo: 0, cierra: 0 }, ATLAS)
  assert.ok(r.every(([i]) => i !== 0) && r.reduce((s, [, x]) => s + x, 0) < 0.25)
  // labios juntos: solo teselas de cierre
  const pp = pesosCanales({ abre: 0, ancho: -0.15, redondo: 0, cierra: 1 }, ATLAS)
  assert.deepEqual(pp.map(([i]) => ATLAS.teselas[i]).sort(), ['PP_+0.00', 'PP_-0.30'])
  // la ch: su tesela, más la rejilla; nunca más de 6
  const ch = pesosCanales({ abre: 0.12, ancho: -0.24, redondo: 0.24, cierra: 0 }, ATLAS)
  assert.equal(ATLAS.teselas[ch[0][0]], 'CH'); assert.ok(ch.length <= 6)
})

test('la ganancia de apertura del atlas lleva la a a la pose más abierta sin tocar los cierres', () => {
  const ABRE2 = [...ABRE, 1.05]
  const m: AtlasCanales = { ...ATLAS, ganancia_abre: 1.25, rejilla_canales: { ...ATLAS.rejilla_canales, abre: ABRE2 },
    teselas: [...ATLAS.teselas, ...ANCHO.map(w => `g1.05_${n2(w)}`)] }
  const a = pesosCanales({ abre: 0.82, ancho: 0, redondo: 0, cierra: 0 }, m)
  assert.ok(a.some(([i, w]) => m.teselas[i] === 'g1.05_+0.00' && w > 0.85), 'la a (0,82 × 1,25 = 1,025) cae casi entera en la pose de 1,05')
  assert.deepEqual(pesosCanales({ abre: 0, ancho: 0, redondo: 0, cierra: 1 }, m).map(([i]) => m.teselas[i]), ['PP_+0.00'])
})

test('la frase de prueba usa todas las zonas del atlas: cierres, o estrecha, a abierta y reposo', () => {
  const p = pistaFx(); const usadas = new Set<string>()
  for (let t = 0; t < FX.dur; t += 1 / 60) for (const [i, w] of pesosCanales(canalesEn(p, t), ATLAS)) if (w > 0.3) usadas.add(ATLAS.teselas[i])
  assert.ok([...usadas].some(k => k.startsWith('PP_')), 'cierres')
  assert.ok([...usadas].some(k => /^g0\.(55|82)_/.test(k)), 'vocales abiertas')
  assert.ok([...usadas].some(k => /_-(1\.10|0\.55)$/.test(k)), 'o/u estrechas')
})
