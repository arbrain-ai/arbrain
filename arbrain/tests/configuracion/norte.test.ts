import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseNorte, revisionDe, resumenSinTitular, fuenteCorta, mayuscula, completarTitular } from '../../src/features/configuracion/norte'

// Documento de ejemplo con la misma forma que el norte de una instalación (ficticio: ningún negocio real). La prueba
// contra el norte del autor vive en norte-real.test.ts, que no viaja en la copia del alumno (red team 3, A-7).
const EJEMPLO = `# El norte · visión, misión y principios

> **BORRADOR · sin firmar (1 ene 2030).** Cada línea lleva su fuente. Lo marcado como *propuesta de Levy* no tiene fuente.

## Visión · a 10 años

Que cada panadería del barrio tenga su **cerebro artificial**.
— La dueña, 2 ene: «quiero que esto lo use cualquiera» · \`notas/vision.md\`

## Misión

**Para los clientes.** Pan caliente a la hora que lo piden, sin filas.
— Promesa firmada el 3 ene · \`notas/promesa.md\`

**Para la dueña.** Dejar de hornear de madrugada sin perder el oficio.
— La dueña, 4 ene · fuentes de arriba

**Para el equipo.** *Propuesta de Levy, sin fuente:* que cada persona sea dueña de un resultado medible.

## Principios

1. «Primero el pan, luego la foto.» — su lema, \`notas/lema.md\`
2. «Lo que regalo es mejor que lo que otros venden.» — 5 ene
3. «La prisa quema el pan.» — 6 ene
4. No vender algo de lo que no se siente segura. — 7 ene, sus valores
5. El negocio es la relación con el barrio. — 8 ene
`

test('norte de ejemplo: borrador, visión, tres misiones y cinco principios con su fuente', () => {
  const n = parseNorte(EJEMPLO)
  assert.equal(n.borrador, true)
  assert.match(n.vision!.texto, /cerebro artificial/)
  assert.match(n.vision!.fuente!, /La dueña, 2 ene/)
  assert.deepEqual(n.mision.map(m => m.quien), ['Clientes', 'La dueña', 'Equipo'])
  assert.match(n.mision[0].texto, /sin filas/)
  assert.match(n.mision[0].fuente!, /3 ene/)
  assert.equal(n.mision[2].propuesta, true)
  assert.equal(n.mision[2].fuente, null)
  assert.ok(!/Propuesta de Levy/.test(n.mision[2].texto))
  assert.equal(n.principios.length, 5)
  assert.match(n.principios[0].texto, /^«Primero el pan/)
  assert.equal(n.principios[3].texto, 'No vender algo de lo que no se siente segura.')
  assert.equal(n.principios[3].fuente, '7 ene, sus valores')
})

test('sin marca de borrador y sin secciones: nada se inventa', () => {
  const n = parseNorte('# Norte\n\n## Visión\n\nUna frase.\n')
  assert.equal(n.borrador, false)
  assert.equal(n.vision!.texto, 'Una frase.')
  assert.equal(n.vision!.fuente, null)
  assert.deepEqual(n.mision, [])
  assert.deepEqual(n.principios, [])
})

test('fuente corta: lo de antes del primer « · »', () => {
  assert.equal(fuenteCorta('Promesa firmada el 1 oct · docs/x.md'), 'Promesa firmada el 1 oct')
  assert.equal(fuenteCorta(null), null)
})

test('revisión: hace N días y «revisar» pasados 14', () => {
  const ahora = Date.parse('2026-10-06T12:00:00Z'), hace = (d: number) => new Date(ahora - d * 86400_000).toISOString()
  assert.deepEqual(revisionDe(hace(0), ahora), { texto: 'revisado hoy', revisar: false, dias: 0 })
  assert.equal(revisionDe(hace(1), ahora).texto, 'revisado ayer')
  assert.equal(revisionDe(hace(14), ahora).revisar, false)
  assert.deepEqual(revisionDe(hace(15), ahora), { texto: 'revisado hace 15 días', revisar: true, dias: 15 })
  assert.equal(revisionDe(null, ahora).revisar, true)
})

test('el resumen no repite el titular', () => {
  assert.equal(resumenSinTitular('Dame esto. Y luego aquello.', 'Dame esto.'), 'Y luego aquello.')
  assert.equal(resumenSinTitular('Otra cosa.', 'Dame esto.'), 'Otra cosa.')
})

test('el titular arranca en mayúscula', () => {
  assert.equal(mayuscula('emprendedor que aplica IA'), 'Emprendedor que aplica IA')
  assert.equal(mayuscula('«Deja a la IA»'), '«Deja a la IA»')
  assert.equal(mayuscula(''), '')
})

test('titular cortado a media frase se completa con el resumen; uno entero no se toca', () => {
  const resumen = 'Promesa · FIRMADO (3 ene). Pan caliente a la hora que lo piden, sin filas ni esperas largas. Otra.'
  assert.equal(completarTitular('Pan caliente a la hora que lo piden, sin', resumen), 'Pan caliente a la hora que lo piden, sin filas ni esperas largas.')
  assert.equal(completarTitular('Distribución por YouTube.', 'Distribución por YouTube. Más.'), 'Distribución por YouTube.')
  assert.equal(completarTitular('Algo que no está', 'Otra cosa distinta.'), 'Algo que no está')
})
