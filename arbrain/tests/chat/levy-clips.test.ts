// Clips de escuchar y pensar (18-19 nov 2026, encargo C): la cara completa horneada con el movimiento de LivePortrait. La regla
// firmada (nada doble) se cumple porque el clip y el rig solo se cortan en cuadros NEUTROS, donde los dos son el retrato.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { clipDeseado, DESCANSO_MS, esNeutro, siguienteNeutro, VELOCIDAD_SALIDA, VUELTAS_MAX, type Clip, type Manifiesto } from '../../src/features/chat/lib/levy-clips.ts'

const publico = (url: string) => new URL(`../../public${url}`, import.meta.url)
const MAN = JSON.parse(readFileSync(publico('/levy-face/medio/clips/clips.json'), 'utf8')) as Manifiesto

test('el manifiesto trae los dos clips, sus MP4 existen y pesan poco', () => {
  for (const n of ['escuchar', 'pensar'] as const) {
    const c = MAN[n]
    assert.equal(c.cps, 30); assert.equal(c.cuadros, 240); assert.equal(c.lado, 720)
    const ruta = publico(`/levy-face/medio/clips/${c.archivo}`)
    assert.ok(existsSync(ruta), c.archivo)
    assert.ok(statSync(ruta).size < 4e6, `${c.archivo} pesa ${statSync(ruta).size} bytes`)
  }
})

test('cada clip empieza y termina en neutro (se repite sin costura) y sus gestos permiten salir a tiempo', () => {
  for (const n of ['escuchar', 'pensar'] as const) {
    const c = MAN[n]
    assert.ok(esNeutro(c, 0), `${n}: el cuadro 0 es el retrato`)
    assert.ok(esNeutro(c, c.cuadros - 1), `${n}: el último también`)
    // el gesto más largo entre dos tramos neutros, a la velocidad de salida, cabe antes de que suene la voz local (≥ 0,45 s)
    let peor = 0
    for (let i = 0; i < c.neutros.length - 1; i++) peor = Math.max(peor, c.neutros[i + 1][0] - c.neutros[i][1])
    const salida = peor / c.cps / VELOCIDAD_SALIDA
    assert.ok(salida <= 0.45, `${n}: salir a neutro tarda hasta ${salida.toFixed(2)} s`)
    for (const [a, b] of c.neutros) assert.ok(b >= a && b - a + 1 >= 2, `${n}: tramo neutro [${a}, ${b}] de al menos 2 cuadros (a 4× se ve al menos uno)`)
  }
})

test('siguienteNeutro: el mismo cuadro si ya es neutro; si no, el inicio del siguiente tramo; al final, el ciclo', () => {
  const c: Clip = { cuadros: 100, cps: 30, neutros: [[0, 5], [40, 45], [90, 99]], archivo: 'x.mp4', lado: 720 }
  assert.equal(siguienteNeutro(c, 3), 3)
  assert.equal(siguienteNeutro(c, 6), 40)
  assert.equal(siguienteNeutro(c, 44), 44)
  assert.equal(siguienteNeutro(c, 60), 90)
  assert.equal(esNeutro(c, 46), false)
})

test('qué clip toca: escuchar al escuchar, pensar al pensar, y ninguno con voz sonando, encargada o recién dicha', () => {
  assert.equal(clipDeseado({ estado: 'listening', vozActiva: false }), 'escuchar')
  assert.equal(clipDeseado({ estado: 'thinking', vozActiva: false }), 'pensar')
  assert.equal(clipDeseado({ estado: 'thinking', vozActiva: true }), null, 'llega la voz: manda el rig con la boca')
  for (const e of ['idle', 'speaking', 'error']) assert.equal(clipDeseado({ estado: e, vozActiva: false }), null, e)
})

test('LevyFace: los clips solo en el plano medio, el rig neutro mientras hay clip y el corte por visibilidad (uno u otro)', () => {
  const f = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  assert.ok(f.includes('if (medio && manifiesto && lienzoClip && figura0)'), 'solo en el plano medio')
  assert.ok(f.includes("const gesto: LoopStatus = enClip ? 'idle' :"), 'con clip, el rig se queda en el retrato')
  assert.ok(f.includes("lienzoClip.style.visibility = v ? 'visible' : 'hidden'; canvas.style.visibility = v ? 'hidden' : 'visible'"), 'se ve uno u otro, nunca los dos')
  assert.ok(f.includes('t.firstSoundAt == null && !t.failed'), 'la frase encargada saca al clip antes de sonar')
  const c = readFileSync(new URL('../../src/features/chat/lib/levy-clips.ts', import.meta.url), 'utf8')
  assert.ok(c.includes("if (!esNeutro(c, f)) { this.cancelar(); return }"), 'solo se entra en un cuadro neutro')
  assert.ok(c.includes("} else if (this.fase === 'saliendo' && esNeutro(c, f)) { this.salir(); return }"), 'solo se sale en un cuadro neutro')
})

test('pensar largo (herramientas): tras dos vueltas el clip descansa y el rig hace su propio gesto; al volver, otra vez 350 ms en neutro', () => {
  assert.equal(VUELTAS_MAX, 2); assert.ok(DESCANSO_MS >= 8000, 'el descanso dura más que una vuelta')
  const c = readFileSync(new URL('../../src/features/chat/lib/levy-clips.ts', import.meta.url), 'utf8')
  assert.ok(c.includes('if (nombre && rigQuieto && performance.now() >= this.descansoHasta) this.entrar(nombre)'), 'no entra durante el descanso')
  const f = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  assert.ok(f.includes('enClip = (!!deseado && !descansa) || clips.ocupado'), 'en el descanso el rig no se queda forzado en el retrato')
  assert.ok(f.includes('if (!deseado || descansa) clipDesde = 0'), 'al volver, otra vez el asentamiento en neutro')
})
