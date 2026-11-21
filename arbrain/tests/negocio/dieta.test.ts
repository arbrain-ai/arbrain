// Tu negocio › El pulso, dieta de texto (17 nov 2026, Daniel: «hay mucho texto»). Fija que la línea corta de Estrategia
// sale del MISMO texto (nada escrito de nuevo), con 14 palabras o menos, sin terminar en «de», «la» o un número suelto ni
// dejar un paréntesis abierto; y que el río toma el alto de su fila (con zoom 1.2 el lazo bajaba sobre las estaciones).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineaCorta } from '../../src/features/negocio/estrategia'
import { altoDelRio } from '../../src/features/negocio/recorrido'

const palabras = (t: string) => t.split(' ').length
const sinPuntos = (t: string) => t.replace(/…$/, '')

test('la línea corta es un prefijo del texto, de 14 palabras o menos', () => {
  const textos = [
    'Te compra quien ya tiene oficio o negocio y se compromete: el anual de un producto (296, con 8 bajas) y, arriba, veteranos.',
    'Contra cursos gratis gigantes de un tema y membresías de una plataforma de 43 a 184 USD/mes con garantía; y, desde abajo, 28 canales chicos.',
    'Un producto (39 USD/mes) entra por debajo de toda la fila de membresías de 43 a 184 USD/mes: ese es el peldaño.',
  ]
  for (const t of textos) {
    const c = lineaCorta(t)
    assert.ok(t.startsWith(sinPuntos(c)), `«${c}» no sale de «${t}»`)
    assert.ok(palabras(sinPuntos(c)) <= 14, c)
    assert.ok(!/\b(de|la|a|y|el|por|con)$/i.test(sinPuntos(c)), `termina en palabra que no cierra: «${c}»`)
    assert.ok(!/\d$/.test(sinPuntos(c)), `termina en número suelto: «${c}»`)
    assert.equal((sinPuntos(c).match(/\(/g) ?? []).length, (sinPuntos(c).match(/\)/g) ?? []).length, `paréntesis abierto: «${c}»`)
  }
  assert.equal(lineaCorta(textos[0]), 'Te compra quien ya tiene oficio o negocio y se compromete')
  assert.equal(lineaCorta(textos[2]), 'Un producto (39 USD/mes) entra por debajo de toda la fila de membresías…')
})

test('una respuesta corta se queda entera, sin puntos suspensivos', () => {
  assert.equal(lineaCorta('Dueños de negocio con oficio largo.'), 'Dueños de negocio con oficio largo')
})

test('el río toma el alto de su fila, con tope, y el mínimo solo sin medir', () => {
  assert.equal(altoDelRio(140, 120), 140)
  assert.equal(altoDelRio(90, 120), 90) // antes: 120, y el lazo bajaba sobre las estaciones
  assert.equal(altoDelRio(900, 120), 320)
  assert.equal(altoDelRio(0, 120), 120)
})
