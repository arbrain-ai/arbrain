// Levy de Live «como en YouTube» (18 nov 2026): el plano medio de los videos en tiempo real. La geometría tiene que ser la del
// compositor de los videos, el cuerpo se mueve solo con transformaciones rígidas (nada doble) y los recursos existen y cuadran.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  aplicar, cajaCuerpo, cssMatriz, CuerpoVivo, derivaCamara, escalaRespiracion, GESTOS_CUERPO, golpe, IDENTIDAD, MEDIO_CABEZA, MEDIO_CUERPO,
  MEDIO_FONDOS, MEDIO_MATE, mul, PIVOTES, RETRATO_EN_CUERPO, sosten, transformCuerpo, ZOOM_MEDIO,
} from '../../src/features/chat/lib/levy-medio.ts'

const publico = (url: string) => new URL(`../../public${url}`, import.meta.url)
const MEDIO_JSON = JSON.parse(readFileSync(publico('/levy-face/medio/medio.json'), 'utf8')) as {
  retrato_en_cuerpo: { x: number; y: number; lado: number }; panel_video: { centro_cabeza: [number, number]; escala_cuerpo: number; aire_arriba: number }
  pivotes_cuerpo: { inclinarse: [number, number]; cintura_y: number }
}
const cerca = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b}`)

test('los recursos del plano medio existen (cuerpo, cabeza, opacidad para el rig y los tres fondos de la rotación)', () => {
  for (const url of [MEDIO_CUERPO, MEDIO_CABEZA, `/levy-face/${MEDIO_MATE}`, ...Object.values(MEDIO_FONDOS)]) assert.ok(existsSync(publico(url)), url)
})

test('el retrato cae en el cuerpo donde lo pone el compositor de los videos (semejanza SIFT de base-1.alin.json)', () => {
  const r = MEDIO_JSON.retrato_en_cuerpo
  cerca(RETRATO_EN_CUERPO.x * 1024, r.x, 0.01, 'x'); cerca(RETRATO_EN_CUERPO.y * 1024, r.y, 0.01, 'y'); cerca(RETRATO_EN_CUERPO.lado * 1024, r.lado, 0.01, 'lado')
  cerca(r.lado / 1024, 0.50575, 0.0001, 'escala 0,5057 del retrato de 1024 al cuerpo')
  assert.deepEqual([...PIVOTES.inclinarse], MEDIO_JSON.pivotes_cuerpo.inclinarse)
  assert.equal(PIVOTES.cintura[1], MEDIO_JSON.pivotes_cuerpo.cintura_y)
})

test('la caja del cuerpo reproduce el panel del video: la cabeza al 27,8 % del alto y la cara a ~21 % con el zoom 1,2', () => {
  const c = cajaCuerpo()
  assert.equal(c.u, 'min(1cqh, 1.3cqw)')
  const lado = Number(c.lado.match(/\* ([\d.]+)\)/)![1])
  cerca(lado, 88.8889 * ZOOM_MEDIO, 0.001, 'el cuerpo ocupa el ancho del panel (960 de 1080) × zoom')
  const top = c.top.match(/calc\(([\d.]+)cqh - var\(--u\) \* ([\d.]+)\)/)!
  // con --u = 1cqh: el centro de la cabeza (192 de 1024 en el cuerpo) cae en 300/1080 del alto, como en levy3d.js
  const centro = Number(top[1]) - Number(top[2]) + lado * 192 / 1024
  cerca(centro, 100 * 300 / 1080, 0.01, 'centro de la cabeza')
  // la cara del retrato (frente a mentón, filas 290-700 de 1024) en pantalla
  const cara = (700 - 290) * RETRATO_EN_CUERPO.lado * lado / 1024
  assert.ok(cara > 20 && cara < 25, `cara ${cara.toFixed(1)} % del alto`)
})

test('reposo: la figura queda donde la pone el video salvo la deriva lenta de la cámara viva', () => {
  const m = transformCuerpo({ t: 0, respira: 0.5 })
  const [dx, dy] = derivaCamara(0)
  for (const [x, y] of [[512, 192], [100, 900], [900, 400]]) {
    const [X, Y] = aplicar(m, x, y)
    cerca(X - x, dx, 1e-6); cerca(Y - y, dy, 1e-6)
  }
  // la deriva de los videos: 8 × 3 px del panel de 1080 (h1_camara.PARAM)
  let mx = 0, my = 0
  for (let t = 0; t < 40; t += 0.05) { const [a, b] = derivaCamara(t); mx = Math.max(mx, Math.abs(a)); my = Math.max(my, Math.abs(b)) }
  cerca(mx * 0.9375, 8, 0.01); cerca(my * 0.9375, 3, 0.01)
})

test('respirar sube la cabeza ±1,6 px de 1024 con la cintura fija, como el compositor de los videos', () => {
  for (const r of [0, 1]) {
    const m = transformCuerpo({ t: 0, respira: r })
    const [, dy] = derivaCamara(0)
    const [, yc] = aplicar(m, 512, 1024); cerca(yc - 1024, dy, 1e-6, 'la cintura no se mueve')
    const [, yh] = aplicar(m, 512, 192); cerca(yh - 192 - dy, -(escalaRespiracion(r) - 1) * (1024 - 192), 1e-6)
  }
  cerca(escalaRespiracion(1) - 1, 0.0016, 1e-9); cerca(escalaRespiracion(0) - 1, -0.0016, 1e-9)
  assert.equal(escalaRespiracion(Number.NaN), escalaRespiracion(0), 'sin dato, reposo')
})

test('balanceo y gestos son afines rígidas o semejanzas: el cuerpo nunca se deforma ni se funde (regla: nada doble)', () => {
  const m = transformCuerpo({ t: 3.3, respira: 0.5, ladeo: 0.035, giro: 0.04, escala: 1.085, dy: 12 })
  // con la respiración en su punto medio (sy = 1) lo que queda es rotación × escala uniforme: columnas ortogonales e iguales
  cerca(m[0] * m[2] + m[1] * m[3], 0, 1e-9, 'columnas ortogonales')
  cerca(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]), 1e-9, 'escala uniforme')
  cerca(Math.hypot(m[0], m[1]), 1.085, 1e-6, 'la escala es la de «inclinarse»')
  // ladeo de la cabeza 0,035 rad → la figura gira 0,007 rad: la cabeza se corre ~6 px, no más
  const sinGesto = transformCuerpo({ t: 3.3, respira: 0.5 }), conLadeo = transformCuerpo({ t: 3.3, respira: 0.5, ladeo: 0.035 })
  const d = Math.hypot(aplicar(conLadeo, 512, 192)[0] - aplicar(sinGesto, 512, 192)[0], aplicar(conLadeo, 512, 192)[1] - aplicar(sinGesto, 512, 192)[1])
  assert.ok(d > 4 && d < 8, `la cabeza se mueve ${d.toFixed(2)} px con el ladeo`)
})

test('cssMatriz lleva la traslación a px de la caja y deja la parte lineal', () => {
  assert.equal(cssMatriz(IDENTIDAD, 1000), 'matrix(1,0,0,1,0,0)')
  assert.equal(cssMatriz([1, 0, 0, 1, 10.24, -20.48], 512), 'matrix(1,0,0,1,5.12,-10.24)')
  const r: [number, number, number, number, number, number] = [0, 1, -1, 0, 0, 0]
  assert.deepEqual(mul(r, mul(r, mul(r, r))).map(v => Math.round(v * 1e9) / 1e9 + 0), [1, 0, 0, 1, 0, 0], 'cuatro cuartos de vuelta = identidad')
})

test('gestos de cuerpo del catálogo: inclinarse en «detalle», énfasis en «doble», con la separación mínima de cada capa', () => {
  const c = new CuerpoVivo()
  const pal = (w: string, s: number) => ({ w, s, e: s + 0.3 })
  c.frase('f0', 100, [pal('Hay', 0), pal('un', 0.2), pal('detalle', 0.4), pal('que', 0.8), pal('cuesta', 1.0), pal('el', 1.3), pal('doble.', 1.5)])
  // inclinarse: 8 cuadros antes de la palabra, ataque 0,45 s, sostiene 1,6 s
  const t0 = 100 + 0.4 - 8 / 30
  cerca(c.cuerpo(t0 - 0.01).escala, 1, 1e-9)
  cerca(c.cuerpo(t0 + 0.45 + 0.8).escala, 1 + GESTOS_CUERPO.inclinarse.escala, 1e-9, 'sostenido')
  // énfasis: un golpe corto de 3 px sobre lo que haya
  const te = 100 + 1.5 - 2 / 30
  cerca(c.cuerpo(te + 0.1).dy - c.cuerpo(te - 0.001).dy, 3, 0.02)
  // otra vez la misma frase con más alineación: cada palabra dispara una sola vez
  c.frase('f0', 100, [pal('Hay', 0), pal('un', 0.2), pal('detalle', 0.4), pal('que', 0.8), pal('cuesta', 1.0), pal('el', 1.3), pal('doble.', 1.5), pal('Nadie', 2.0)])
  const c2 = new CuerpoVivo()
  c2.frase('a', 0, [pal('detalle', 1)]); c2.frase('b', 0, [pal('nadie', 5)]); c2.frase('c', 0, [pal('secreto', 9)])
  // 1 → inclinarse; 5 → a menos de 7 s, se descarta; 9 → pasa
  cerca(c2.cuerpo(5 - 8 / 30 + 1.2).escala, 1, 1e-9, 'el de «nadie» se descartó por la separación de 7 s')
  assert.ok(c2.cuerpo(9 - 8 / 30 + 1.0).escala > 1.08, 'el de «secreto» sí')
})

test('perfiles de tiempo iguales a los de gestos2d', () => {
  cerca(sosten(0.225, 0.45, 1.6, 0.7), 0.5, 1e-9, 'mínima sacudida: la mitad a la mitad del ataque')
  assert.equal(sosten(3, 0.45, 1.6, 0.7), 0)
  cerca(golpe(0.1), 1, 1e-9); assert.equal(golpe(0), 0); assert.equal(golpe(2), 0)
})

test('LevyFace monta el plano medio solo para Levy con la cara de los videos, con la opacidad del rig y sin respiración de cuello', () => {
  const f = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  assert.ok(f.includes("const medio = framing === 'medio' && agent === 'levy' && !!vivo"), 'Trinity y Sensei caen al encuadre de cámara')
  assert.ok(f.includes('...(medio ? { mate: MEDIO_MATE, torso: 0 } : {})'), 'rig con opacidad y el cuello quieto')
  assert.ok(f.includes("ready ? 'opacity-0' : 'opacity-100'"), 'el retrato recortado se va de golpe al cargar el rig (sin fundido)')
  const rig = readFileSync(publico('/levy-face/rig/rig.js'), 'utf8')
  assert.ok(rig.includes("alpha: this.alfa, premultipliedAlpha: true"), 'lienzo transparente solo con capas.mate')
  assert.ok(rig.includes('outColor = vec4(col * aC, aC);'), 'la opacidad se muestrea en la misma coordenada que el color')
  assert.ok(rig.includes('if (man.matte && !this.alfa)'), 'la matte de la hoja no pisa la del plano medio')
})
