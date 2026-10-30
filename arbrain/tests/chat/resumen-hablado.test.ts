import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  elegirResumen, bloquesResumenDeMarkdown, ofreceResumen, contarPalabras,
  TOPE_PALABRAS, CIERRE_RESUMEN, type BloqueResumen,
} from '../../src/features/chat/lib/resumen-hablado.ts'

// Párrafo de prosa de n palabras, distinguible por su etiqueta.
const prosa = (etiqueta: string, n: number) => `${etiqueta} ` + Array.from({ length: n - 1 }, (_, i) => `palabra${i}`).join(' ') + '.'

test('respuesta corta: no se ofrece resumen', () => {
  const md = `${prosa('Hola', 40)}\n\n${prosa('Luego', 60)}`
  assert.equal(ofreceResumen(md), false)
  assert.equal(elegirResumen(bloquesResumenDeMarkdown(md)), null)
})

test('respuesta corta aunque traiga un bloque de código enorme: el código no cuenta, no se ofrece', () => {
  const codigo = '```ts\n' + Array.from({ length: 200 }, (_, i) => `const variable${i} = funcion(${i}) // comentario largo`).join('\n') + '\n```'
  const md = `${prosa('Intro', 50)}\n\n${codigo}\n\n${prosa('Cierre', 30)}`
  assert.equal(ofreceResumen(md), false)
})

test('salta código y tablas, y respeta el tope', () => {
  const tabla = '| Mes | Ventas | Notas |\n|---|---|---|\n' + Array.from({ length: 30 }, (_, i) => `| mes${i} | ${i * 100} | nota larga de la fila ${i} |`).join('\n')
  const codigo = '```bash\nnpm run desktop:install\nnpm test\n```'
  const md = [
    '## Qué cambió', prosa('Primero', 60), codigo, tabla, prosa('Segundo', 70),
    '## Detalle', prosa('Tercero', 80), prosa('Cuarto', 90), prosa('Quinto', 90),
  ].join('\n\n')
  const bloques = bloquesResumenDeMarkdown(md)
  const r = elegirResumen(bloques)
  assert.ok(r, 'una respuesta larga ofrece resumen')
  assert.ok(ofreceResumen(md))
  const dichos = r.indices.map((i) => bloques[i])
  assert.ok(dichos.every((b) => !b.enCodigo && !b.enTabla), 'ni código ni tablas')
  assert.ok(!dichos.some((b) => /npm|mes\d|\|/.test(b.texto)))
  assert.ok(r.palabras <= TOPE_PALABRAS, `${r.palabras} > tope`)
  assert.equal(dichos[0].texto, 'Qué cambió', 'el encabezado guía')
  assert.match(dichos[1].texto, /^Primero/)
  assert.ok(dichos.some((b) => /^Segundo/.test(b.texto)))
  assert.ok(!dichos.some((b) => /^(Cuarto|Quinto)/.test(b.texto)), 'se detiene al llegar al tope')
  assert.equal(r.cierre, CIERRE_RESUMEN)
})

test('un encabezado sin nada de su sección dentro del tope no se lee suelto', () => {
  const md = [prosa('Uno', 120), prosa('Dos', 60), '## Siguiente sección', prosa('Tres', 150), prosa('Cuatro', 100)].join('\n\n')
  const bloques = bloquesResumenDeMarkdown(md)
  const r = elegirResumen(bloques)!
  const dichos = r.indices.map((i) => bloques[i].texto)
  assert.equal(dichos.length, 2)
  assert.ok(!dichos.includes('Siguiente sección'))
})

test('lista larga: solo sus dos primeros puntos; lista corta completa', () => {
  const larga = Array.from({ length: 12 }, (_, i) => `- Punto${i} ` + 'detalle '.repeat(15).trim()).join('\n')
  const corta = ['- Alfa uno dos', '- Beta tres cuatro', '- Gama cinco seis'].join('\n')
  const md = [prosa('Intro', 30), corta, prosa('Medio', 10), larga, prosa('Final', 200)].join('\n\n')
  const bloques = bloquesResumenDeMarkdown(md)
  const r = elegirResumen(bloques)!
  const dichos = r.indices.map((i) => bloques[i].texto)
  assert.ok(['Alfa', 'Beta', 'Gama'].every((p) => dichos.some((d) => d.startsWith(p))), 'la lista corta entra completa')
  const puntos = dichos.filter((d) => /^Punto\d/.test(d))
  assert.deepEqual(puntos.map((d) => d.split(' ')[0]), ['Punto0', 'Punto1'])
})

test('primer párrafo más largo que el tope: se lee igual (algo que decir) y avisa del resto', () => {
  const bloques: BloqueResumen[] = [{ texto: prosa('Largo', 250) }, { texto: prosa('Otro', 200) }]
  const r = elegirResumen(bloques)!
  assert.deepEqual(r.indices, [0])
  assert.equal(r.cierre, CIERRE_RESUMEN)
})

test('bloques del DOM: código (<pre>) y celdas de tabla se saltan aunque lleguen', () => {
  const bloques: BloqueResumen[] = [
    { texto: prosa('A', 100) },
    { texto: 'const x = 1 '.repeat(50), enCodigo: true },
    { texto: 'celda '.repeat(40), enTabla: true },
    { texto: prosa('B', 80) },
    { texto: prosa('C', 150) },
  ]
  const r = elegirResumen(bloques)!
  assert.deepEqual(r.indices, [0, 3])
  assert.equal(r.totalPalabras, 330)
})

test('las fuentes del final no cuentan ni se leen', () => {
  const fuentes = '**Fuentes:**\n\n' + Array.from({ length: 40 }, (_, i) => `- Documento número ${i} sobre el tema con título largo https://ejemplo.com/${i}`).join('\n')
  const md = `${prosa('Respuesta', 120)}\n\n${fuentes}`
  assert.equal(ofreceResumen(md), false)
})

test('contarPalabras ignora URLs', () => {
  assert.equal(contarPalabras('mira https://a.com/x esto'), 2)
})
