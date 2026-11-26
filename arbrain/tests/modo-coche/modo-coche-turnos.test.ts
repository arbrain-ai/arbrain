/** Modo coche «por turnos» y la nota que hace que el agente conteste para oírse. */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DetectorHabla, SILENCIO_MS, SILENCIO_TURNOS_MS, type Paso } from '../../src/features/modo-coche/vad'
import { NOTA_COCHE, NOTA_TURNOS, notaDelModo } from '../../src/features/modo-coche/respuesta'

function correr(d: DetectorHabla, niveles: (t: number) => number, hasta = 60_000) {
  for (let t = 0; t <= hasta; t += 50) {
    const p: Paso = d.paso(t, niveles(t))
    if (p === 'terminaste' || p === 'empezar-de-nuevo') return { paso: p, t }
  }
  return { paso: 'sigue' as const, t: hasta }
}

test('por turnos el silencio es más paciente (6 s): una pausa de 4,5 s para pensar no manda nada', () => {
  assert.equal(SILENCIO_TURNOS_MS, 6000)
  const d = new DetectorHabla(0, SILENCIO_TURNOS_MS)
  const r = correr(d, t => ((t >= 1000 && t < 3000) || (t >= 7500 && t < 9000) ? 0.15 : 0.01))
  assert.equal(r.paso, 'terminaste')
  assert.ok(r.t >= 9000 + SILENCIO_TURNOS_MS && r.t < 9000 + SILENCIO_TURNOS_MS + 200, `terminó a los ${r.t} ms`)
})

test('fluido no cambia: sin parámetro, el detector sigue con 3 s', () => {
  const r = correr(new DetectorHabla(0), t => (t >= 1000 && t < 3000 ? 0.15 : 0.01))
  assert.equal(r.paso, 'terminaste')
  assert.ok(r.t >= 3000 + SILENCIO_MS && r.t < 3000 + SILENCIO_MS + 200)
})

test('la nota pide una respuesta para oírse, sin skills ni programas extra', () => {
  for (const nota of [NOTA_COCHE, NOTA_TURNOS]) {
    assert.match(nota, /^\[Modo coche\]/)
    assert.match(nota, /voz alta/)
    assert.match(nota, /qué hiciste, cómo quedó y qué necesitas/)
    assert.match(nota, /Sin tablas, código, rutas de archivos, comandos, enlaces/)
    assert.match(nota, /No uses otras herramientas de voz/) // con SFlow instalado, no se oye dos veces
    assert.doesNotMatch(nota, /skill|SFlow|decir\.py/i) // no depende de nada que no todos tienen
    assert.ok(nota.length < 1400, `nota de ${nota.length} letras`)
  }
})

test('la nota cambia con el modo: fluido vuelve a escuchar solo; por turnos queda en pausa sin micrófono', () => {
  assert.equal(notaDelModo('fluido'), NOTA_COCHE)
  assert.equal(notaDelModo('turnos'), NOTA_TURNOS)
  assert.match(NOTA_COCHE, /vuelve a escuchar solo/)
  assert.match(NOTA_TURNOS, /queda en pausa, sin micrófono/)
  assert.doesNotMatch(NOTA_TURNOS, /vuelve a escuchar solo/)
})

// ── La voz al celular (complemento de SFlow 2.3) ──
import { frasesParaTelefono } from '../../src/features/modo-coche/voz-celular'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

test('voz al celular: solo las líneas marcadas por SFlow, una frase por línea', () => {
  assert.deepEqual(frasesParaTelefono('VOZ_EN_TELEFONO: Listo, ya quedó el borrador.'), ['Listo, ya quedó el borrador.'])
  assert.deepEqual(frasesParaTelefono('otra cosa\nVOZ_EN_TELEFONO: Uno.\nVOZ_EN_TELEFONO: Dos.\n'), ['Uno.', 'Dos.'])
  assert.deepEqual(frasesParaTelefono('eco "VOZ_EN_TELEFONO: a mitad de línea no cuenta"'), [])
  assert.deepEqual(frasesParaTelefono('SIN VOZ: SFlow no respondió'), [])
  assert.deepEqual(frasesParaTelefono(''), [])
})

test('voz al celular: la ruta del aviso existe en la edición de escritorio (si no, daría 404)', () => {
  assert.equal(apiPermitidaEnCliente('/api/modo-coche/telefono-activo'), true)
})
