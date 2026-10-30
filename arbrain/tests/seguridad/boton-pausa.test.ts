// Botón «Pausar todo» compacto y movible (29 oct 2026; un alumno, grupal del 26 oct: «Me estaba estorbando»).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLAVE_PREFERENCIA_PAUSA, colocarBotonPausa, dondeEstaPausa, escribirPreferenciaPausa, leerPreferenciaPausa, MARGEN_PAUSA, PREFERENCIA_PAUSA_DEFECTO,
} from '../../src/features/seguridad/lib/boton-pausa'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('por defecto: abajo a la derecha y compacto (solo el ícono)', () => {
  assert.deepEqual(PREFERENCIA_PAUSA_DEFECTO, { esquina: 'abajo-derecha', conTexto: false })
  assert.deepEqual(leerPreferenciaPausa(null), PREFERENCIA_PAUSA_DEFECTO)
  assert.deepEqual(leerPreferenciaPausa(undefined), PREFERENCIA_PAUSA_DEFECTO)
  assert.deepEqual(leerPreferenciaPausa(''), PREFERENCIA_PAUSA_DEFECTO)
  assert.match(CLAVE_PREFERENCIA_PAUSA, /^arbrain-/)
})

test('lo guardado inválido cae al defecto, campo por campo', () => {
  for (const crudo of ['{roto', 'null', '42', '"abajo-izquierda"', '[]', 'true']) assert.deepEqual(leerPreferenciaPausa(crudo), PREFERENCIA_PAUSA_DEFECTO, crudo)
  assert.deepEqual(leerPreferenciaPausa('{"esquina":"en-medio","conTexto":true}'), { esquina: 'abajo-derecha', conTexto: true })
  assert.deepEqual(leerPreferenciaPausa('{"esquina":"arriba-derecha","conTexto":"si"}'), { esquina: 'arriba-derecha', conTexto: false })
  assert.deepEqual(leerPreferenciaPausa('{"esquina":"abajo-izquierda","conTexto":true}'), { esquina: 'abajo-izquierda', conTexto: true })
})

test('guardar y leer de vuelta da lo mismo; lo inválido no se guarda', () => {
  assert.deepEqual(leerPreferenciaPausa(escribirPreferenciaPausa({ esquina: 'arriba-derecha', conTexto: true })), { esquina: 'arriba-derecha', conTexto: true })
  assert.deepEqual(JSON.parse(escribirPreferenciaPausa({ esquina: 'x' as never })), PREFERENCIA_PAUSA_DEFECTO)
})

test('Ajustes dice dónde está según la preferencia', () => {
  assert.equal(dondeEstaPausa({ esquina: 'abajo-derecha', conTexto: false }), 'abajo a la derecha')
  assert.equal(dondeEstaPausa({ esquina: 'abajo-izquierda', conTexto: false }), 'abajo a la izquierda')
  assert.equal(dondeEstaPausa({ esquina: 'arriba-derecha', conTexto: true }), 'arriba a la derecha')
})

const { borde, separacion, arriba } = MARGEN_PAUSA
const choca = (a: { x0: number; x1: number; y0: number; y1: number }, o: { top: number; left: number; right: number; bottom: number }) => a.x0 < o.right && a.x1 > o.left && a.y0 < o.bottom && a.y1 > o.top

test('sin nada debajo, va pegado a su esquina', () => {
  assert.deepEqual(colocarBotonPausa({ esquina: 'abajo-derecha', ancho: 128, alto: 32, vw: 1440, vh: 900, obstaculos: [] }), { right: borde, bottom: borde })
  assert.deepEqual(colocarBotonPausa({ esquina: 'abajo-izquierda', ancho: 128, alto: 32, vw: 1440, vh: 900, obstaculos: [] }), { left: borde, bottom: borde })
  assert.deepEqual(colocarBotonPausa({ esquina: 'arriba-derecha', ancho: 128, alto: 32, vw: 1440, vh: 900, obstaculos: [] }), { right: borde, top: arriba })
})

test('pantalla ancha: el campo de escribir centrado no estorba, el botón se queda en la esquina', () => {
  const composer = { top: 780, bottom: 880, left: 420, right: 1180 }
  assert.deepEqual(colocarBotonPausa({ esquina: 'abajo-derecha', ancho: 128, alto: 32, vw: 1440, vh: 900, obstaculos: [composer] }), { right: borde, bottom: borde })
})

test('teléfono y ventana angosta: nunca tapa el campo de escribir ni el botón de enviar, sube por encima', () => {
  for (const [vw, vh] of [[390, 844], [360, 640], [700, 800]]) {
    const composer = { top: vh - 110, bottom: vh - 12, left: 12, right: vw - 12 }
    const p = colocarBotonPausa({ esquina: 'abajo-derecha', ancho: 128, alto: 32, vw, vh, obstaculos: [composer] })
    assert.equal(p.bottom, 110 + separacion, `${vw}x${vh}`)
    const caja = { x0: vw - borde - 128, x1: vw - borde, y0: vh - p.bottom! - 32, y1: vh - p.bottom! }
    assert.ok(!choca(caja, composer), `${vw}x${vh}`)
  }
})

test('abajo a la izquierda esquiva el pie de la columna y el aviso de versión nueva, apilados', () => {
  const pie = { top: 840, bottom: 900, left: 0, right: 280 }
  const aviso = { top: 800, bottom: 836, left: 12, right: 200 }
  const p = colocarBotonPausa({ esquina: 'abajo-izquierda', ancho: 128, alto: 32, vw: 1440, vh: 900, obstaculos: [pie, aviso] })
  assert.equal(p.left, borde)
  assert.equal(p.bottom, 900 - 800 + separacion)
})

test('arriba a la derecha baja si algo marcado ocupa su lugar, y nunca se sale de la pantalla', () => {
  const p = colocarBotonPausa({ esquina: 'arriba-derecha', ancho: 128, alto: 32, vw: 800, vh: 600, obstaculos: [{ top: 50, bottom: 100, left: 600, right: 800 }] })
  assert.equal(p.top, 100 + separacion)
  const enorme = colocarBotonPausa({ esquina: 'abajo-derecha', ancho: 128, alto: 32, vw: 400, vh: 300, obstaculos: [{ top: 0, bottom: 300, left: 0, right: 400 }] })
  assert.ok(enorme.bottom! + 32 <= 300, 'se queda dentro de la pantalla')
})

test('lo oculto (tamaño cero o fuera de pantalla) no cuenta', () => {
  const p = colocarBotonPausa({ esquina: 'abajo-izquierda', ancho: 128, alto: 32, vw: 390, vh: 844, obstaculos: [{ top: 0, bottom: 0, left: 0, right: 0 }, { top: 0, bottom: 844, left: -320, right: 0 }] })
  assert.deepEqual(p, { left: borde, bottom: borde })
})

test('la UI: compacto con aria-label, preferencia en Ajustes, la franja de pausa intacta y los obstáculos marcados', () => {
  const ui = fuente('src/features/seguridad/components/Seguridad.tsx')
  assert.match(ui, /aria-label="Pausar todo"/)
  assert.match(ui, /group-hover:max-w-\[8rem\]/)
  assert.match(ui, /group-focus-visible:max-w-\[8rem\]/)
  assert.match(ui, /Posición del botón Pausar todo/)
  assert.match(ui, /Mostrar con texto/)
  assert.match(ui, /dondeEstaPausa\(pref\)/)
  assert.ok(!/También está abajo a la derecha en toda la app/.test(ui))
  assert.match(ui, /Levy está en pausa: no corre ningún turno, rutina ni herramienta/)
  assert.match(ui, /Reanudar/)
  assert.match(fuente('src/components/ActualizacionDesktop.tsx'), /data-evita-pausa/)
  assert.match(fuente('src/shared/components/ColumnaConversaciones.tsx'), /data-evita-pausa/)
  assert.match(fuente('src/features/chat/components/ChatPanel.tsx'), /data-chat-composer/)
})
