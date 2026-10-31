import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  filtrarBloques, markdownHablable, bloquesDeMarkdown, esEncabezadoFuentes, pareceTabla, sinUrls,
  type BloqueLector,
} from '../../src/features/chat/lib/lector-filtro.ts'
import { buildSpoken } from '../../src/features/chat/lib/chat-speech.ts'

// Lo que el DOM entrega al lector: párrafos, celdas de tabla ya marcadas, fuentes al final.
const respuesta: BloqueLector[] = [
  { texto: 'Resumen', esEncabezado: true },
  { texto: 'El MRR subió en septiembre.' },
  { texto: 'Más detalle en https://tu-sitio.example/finanzas si lo quieres ver.' },
  { texto: 'Mes', enTabla: true },
  { texto: 'Agosto', enTabla: true },
  { texto: 'Lo importante es la retención.' },
  { texto: 'https://supabase.com/dashboard/project/abc' },
  { texto: '**Fuentes:**' },
  { texto: 'Polar — https://polar.sh/dashboard' },
  { texto: 'Supabase: ventas por mes' },
]

test('respuesta con tabla + fuentes + URL suelta: solo se oyen los párrafos de prosa y el total baja', () => {
  const idx = filtrarBloques(respuesta)
  const dichos = idx.map((i) => respuesta[i].texto)
  assert.deepEqual(dichos, [
    'Resumen',
    'El MRR subió en septiembre.',
    'Más detalle en https://tu-sitio.example/finanzas si lo quieres ver.',
    'Lo importante es la retención.',
  ])
  assert.equal(idx.length, 4) // antes 10
  // La URL dentro de un párrafo no llega a la voz.
  const { spoken } = buildSpoken(dichos[2])
  assert.ok(!/https|arbrain\.ai|enlace/.test(spoken), spoken)
  assert.match(spoken, /Más detalle en\s+si lo quieres ver/)
})

test('variantes del encabezado de fuentes', () => {
  for (const t of ['Fuentes:', 'Fuentes', 'Sources:', '## Fuentes principales', '**Fuentes principales:**',
    'Fuentes consultadas:', 'Referencias', 'Bibliografía:', '📚 Fuentes:', 'Fuentes: https://a.com, https://b.com'])
    assert.ok(esEncabezadoFuentes(t), t)
  for (const t of ['Fuentes de ingreso del negocio: cursos y comunidad.', 'Fuente: el cliente lo dijo ayer en la llamada.',
    'Las fuentes son tres.'])
    assert.ok(!esEncabezadoFuentes(t), t)
})

test('un «Fuentes:» a media respuesta seguido de otra sección no corta el resto', () => {
  const b: BloqueLector[] = [
    { texto: 'Uno.' }, { texto: 'Fuentes:' }, { texto: 'a' },
    { texto: 'Siguiente paso', esEncabezado: true }, { texto: 'Dos.' },
    { texto: 'Sources:' }, { texto: 'https://x.com' },
  ]
  // Desde el 31 oct el encabezado de fuentes y su entrada («a») se callan también a media respuesta; lo que sigue a la
  // siguiente sección se oye igual que antes.
  assert.deepEqual(filtrarBloques(b).map((i) => b[i].texto), ['Uno.', 'Siguiente paso', 'Dos.'])
})

test('tabla que no se pintó como tabla (filas con barras) también se salta', () => {
  assert.ok(pareceTabla('| Mes | Ventas |\n|---|---|\n| Ago | 10 |'))
  assert.ok(pareceTabla('| Mes | Ventas | |---|---| | Ago | 10 |'))
  assert.ok(!pareceTabla('80/20 y LT|HT'))
})

test('sinUrls quita http(s) y www', () => {
  assert.equal(sinUrls('ver https://a.com/x?y=1 y www.b.mx.').replace(/\s+/g, ' '), 'ver y ')
})

test('markdown crudo (voz de servidor): misma regla', () => {
  const md = [
    '## Resumen', '', 'El MRR subió. Ver https://polar.sh/x', '',
    '| Mes | Ventas |', '|---|---|', '| Ago | 10 |', '',
    'Lo importante es la [retención](https://a.com).', '',
    '**Fuentes:**', '- [Polar](https://polar.sh)', '- https://supabase.com',
  ].join('\n')
  const out = markdownHablable(md)
  assert.equal(out, 'Resumen\n\nEl MRR subió. Ver\n\nLo importante es la retención.')
  assert.equal(bloquesDeMarkdown(md).filter((b) => b.enTabla).length, 1)
})
