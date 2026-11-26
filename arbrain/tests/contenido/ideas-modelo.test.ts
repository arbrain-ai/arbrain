// Ideas del cuartel v2 (15 nov 2026). El dueño: «acá por ejemplo no cambia la miniatura por video». Fija que cada título
// tiene SU miniatura, que dos miniaturas no se dibujan igual, y que el banco se lee tolerante (ideas de antes incluidas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoVence, diasPara, escenaDe, fechaOrigen, rendimientoOrigen, variantesPorEscena, ladoDe, lineasVeredicto, miniaturaDe, normalizarBanco, textoFuente, textoVence, tintaDe } from '../../src/features/contenido/ideas-modelo'

const CRUDO = {
  reglas: { tope_por_decidir: 6, caduca_dias: 14, guardada_dias: 30 }, cuentas: { caducadas: 2 }, nicho: 'IA aplicada a negocio',
  ideas: [
    { id: 'idea-a', estado: 'nueva', base: 'empaque', idea: 'Armas el diagnóstico en pantalla', solo_tu: 'Arbrain', promesa: 'una plantilla', formato: 'f1',
      titulos: [{ texto: 'T1', patron: 'caso' }, { texto: 'T2' }, 'T3'],
      miniaturas: [{ texto: 'Nadie los conecta', objeto: 'el mapa de agentes', escena: 'panel', lado: 'izq' }, { texto: 'Esto se cobra', objeto: 'la hoja', escena: 'archivo', lado: 'der' }, { texto: 'Juntos o inútiles', escena: 'versus' }],
      origen: { video_id: 'abc', canal: 'AI Engineer', outlier: 35, vistas: 36579, publicado: '2026-11-10T00:00:00Z' }, vence: '2026-11-29T00:00:00Z' },
    // una idea de antes: sin línea, sin escena, con texto de sobra
    { id: 'idea-b', estado: 'a_guion', angulo: 'Toma la veta del arnés.', titulos: [{ texto: 'V1' }], titulo_elegido: 9,
      miniaturas: [{ texto: 'Esto sobraba', objeto: 'El CLAUDE.md real de Levy, con bloques tachados', composicion: 'Él a la derecha, serio; el archivo a la izquierda' }], todoist: { id: 't1', proyecto: '🎬 YouTube' } },
    { id: 'idea-c', titulos: [] }, null, 'basura',
  ],
  tipo: { estado: 'hipotesis', frase: 'Operas Claude Code en cámara.', para_quien: 'Emprendedor con oficio',
    formatos: [{ id: 'f1', nombre: 'Construye y vende', que_es: 'q', ejemplo: 'e', evidencia: ['c1', 'n1', 'x9'] }], no_es: ['noticias', ''], duda: 'd',
    evidencia: { canal: [{ id: 'c1', video_id: 'p1', titulo: 'Domina Claude Code', vistas: 85407, veces: 7.1, lado: 'arriba' }], nicho: [{ id: 'n1', titulo: 'Agents', canal: 'X', veces: 35, dias: 5 }],
      sirvio: [], dichos: [{ id: 'd1', texto: 'El operar en vivo hace sentido.', fecha: '10 nov' }] } },
}

test('lee el banco tolerante: ideas nuevas y de antes, y cuenta por estado', () => {
  const b = normalizarBanco(CRUDO)
  assert.deepEqual(b.ideas.map(i => i.id), ['idea-a', 'idea-b'])
  assert.deepEqual(b.cuentas, { por_decidir: 1, guardadas: 0, en_backlog: 1, fuera: 0, caducadas: 2, tuyas: 0 })
  assert.equal(b.ideas[0].procedencia, 'mercado')
  const [a, v] = b.ideas
  assert.equal(a.base, 'empaque'); assert.equal(a.titulos.length, 3); assert.equal(a.origen?.outlier, 35)
  assert.equal(v.base, 'transcript'); assert.equal(v.idea, 'Toma la veta del arnés.'); assert.equal(v.titulo_elegido, null) // 9 no existe
  assert.equal(v.todoist?.proyecto, '🎬 YouTube')
  assert.deepEqual(normalizarBanco(null).ideas, [])
  assert.equal(normalizarBanco({}).tipo, null)
})

test('la hipótesis trae su evidencia por id y solo cita la que existe', () => {
  const t = normalizarBanco(CRUDO).tipo!
  assert.equal(t.estado, 'hipotesis')
  assert.deepEqual(t.formatos[0].evidencia, ['c1', 'n1']) // x9 no existe: se cae
  assert.deepEqual(t.fuentes, { canal: 1, nicho: 1, sirvio: 0, dichos: 1 })
  assert.equal(t.evidencia.c1.detalle, 'tu canal · 85 K vistas · ×7.1 tu mediana')
  assert.equal(t.evidencia.n1.detalle, 'X · ×35 · hace 5 d')
  assert.equal(t.evidencia.d1.detalle, 'lo dijiste tú · 10 nov')
  assert.deepEqual(t.no_es, ['noticias'])
})

test('cada título tiene SU miniatura y cambia al cambiar de título', () => {
  const [a, v] = normalizarBanco(CRUDO).ideas
  assert.deepEqual([0, 1, 2].map(n => miniaturaDe(a, n)!.m.texto), ['Nadie los conecta', 'Esto se cobra', 'Juntos o inútiles'])
  assert.equal(miniaturaDe(v, 3)!.indice, 0) // menos miniaturas que títulos: se reparten
  assert.equal(miniaturaDe({ miniaturas: [] }, 0), null)
})

test('dos miniaturas no se dibujan igual: escena, lado y tinta salen de su contenido', () => {
  const [a, v] = normalizarBanco(CRUDO).ideas
  assert.deepEqual(a.miniaturas.map(escenaDe), ['panel', 'archivo', 'versus'])
  // las de antes no traen escena: se lee de su objeto y de su composición
  assert.equal(escenaDe(v.miniaturas[0]), 'archivo')
  assert.equal(ladoDe(v.miniaturas[0], 'x'), 'der')
  assert.equal(escenaDe({ texto: 'x', objeto: 'Dos terminales lado a lado con la misma tarea' }), 'versus')
  assert.equal(escenaDe({ texto: 'x', objeto: 'Su terminal con la carpeta vacía' }), 'terminal')
  assert.equal(escenaDe({ texto: 'x', objeto: 'algo raro', escena: 'inventada' }), 'panel')
  assert.equal(ladoDe({ texto: 'x', lado: 'izq', composicion: 'Él a la derecha' }, 'x'), 'izq') // lo explícito manda
  // tres miniaturas de una idea: tres tintas; y la misma idea se pinta igual siempre
  assert.equal(new Set([0, 1, 2].map(n => tintaDe('idea-a', n))).size, 3)
  assert.equal(tintaDe('idea-a', 1), tintaDe('idea-a', 1))
})

test('el veredicto se parte en dos líneas parejas', () => {
  assert.deepEqual(lineasVeredicto('NADIE LOS CONECTA'), ['NADIE LOS', 'CONECTA'])
  assert.deepEqual(lineasVeredicto('YA ESTORBA'), ['YA', 'ESTORBA'])
  assert.deepEqual(lineasVeredicto('UNO SOBRA'), ['UNO SOBRA'])
  assert.deepEqual(lineasVeredicto('  Copia   esto primero '), ['Copia esto', 'primero'])
})

test('lo que falta para que una idea se vaya sola', () => {
  const ahora = Date.parse('2026-11-15T18:00:00Z')
  assert.equal(diasPara('2026-11-29T18:00:00Z', ahora), 14)
  assert.equal(textoVence({ vence: '2026-11-29T18:00:00Z' }, ahora), 'se va sola en 14 días')
  assert.equal(textoVence({ vence: '2026-11-16T10:00:00Z' }, ahora), 'se va mañana')
  assert.equal(textoVence({ vence: '2026-11-15T10:00:00Z' }, ahora), 'se va hoy')
  assert.equal(textoVence({ vence: null }, ahora), null)
  // en la tarjeta solo se avisa cuando ya urge
  assert.equal(avisoVence({ vence: '2026-11-29T18:00:00Z' }, ahora), null)
  assert.equal(avisoVence({ vence: '2026-11-19T18:00:00Z' }, ahora), 'se va sola en 4 días')
})

test('la fecha del video original: lo reciente en días, lo viejo con su fecha', () => {
  const ahora = Date.parse('2026-11-15T18:00:00Z')
  assert.deepEqual(fechaOrigen('2026-11-10T11:00:00Z', ahora), { texto: 'hace 5 días', viejo: false })
  assert.deepEqual(fechaOrigen('2026-11-14T12:00:00Z', ahora), { texto: 'ayer', viejo: false })
  assert.deepEqual(fechaOrigen('2026-06-18T12:00:00Z', ahora), { texto: '18 jun', hace: 'hace 5 meses', viejo: true })
  assert.deepEqual(fechaOrigen('2026-10-01T12:00:00Z', ahora), { texto: '1 oct', hace: 'hace 6 semanas', viejo: true })
  assert.equal(fechaOrigen(null, ahora), null)
})

test('el rendimiento del original: vistas primero y el multiplicador con tope', () => {
  assert.deepEqual(rendimientoOrigen({ outlier: 131.2, vistas: 12932 }), { vistas: '13 K vistas', veces: '×100+' })
  assert.deepEqual(rendimientoOrigen({ outlier: 11.06, vistas: 190000 }), { vistas: '190 K vistas', veces: '×11' })
  assert.deepEqual(rendimientoOrigen({ outlier: 2.155, vistas: 36873 }), { vistas: '37 K vistas', veces: '×2.2' })
  assert.deepEqual(rendimientoOrigen({ outlier: null, vistas: null }), { vistas: null, veces: null })
  assert.deepEqual(rendimientoOrigen(null), { vistas: null, veces: null })
})

test('dos ideas a la vista con la misma escena no comparten dibujo', () => {
  const idea = (id: string, escena: string) => ({ id, titulo_elegido: null, miniaturas: [{ texto: 'x', escena }] })
  const v = variantesPorEscena([idea('a', 'archivo'), idea('b', 'panel'), idea('c', 'archivo'), idea('d', 'archivo'), idea('e', 'panel'), { id: 'f', titulo_elegido: null, miniaturas: [] }])
  assert.deepEqual([...v], [['a', 0], ['b', 0], ['c', 1], ['d', 2], ['e', 1]])
})

test('«Tus ideas» (19 nov): la procedencia y su fuente se leen; no cuentan en el cupo del mercado', () => {
  const b = normalizarBanco({ ideas: [
    { id: 'idea-tuya-1', estado: 'nueva', procedencia: 'tuya', idea: '¿Quién quieres ser en un mundo donde la IA automatiza todo?', titulos: [],
      fuente: { tipo: 'diario', ruta: '.claude/diario/2026-11-18.md', fecha: '2026-11-18', cita: 'quién quieres ser', tambien: ['.claude/diario/2026-11-01.md', ''] } },
    { id: 'idea-m', estado: 'nueva', idea: 'del mercado', titulos: [{ texto: 'T' }] }] })
  assert.deepEqual([b.cuentas.tuyas, b.cuentas.por_decidir], [1, 1])
  const [t] = b.ideas
  assert.equal(t.procedencia, 'tuya')
  assert.deepEqual(t.fuente?.tambien, ['.claude/diario/2026-11-01.md'])
  const f = textoFuente(t.fuente)
  assert.equal(f.texto, 'tu diario · 18 nov · y en 1 fuente más')
  assert.match(f.detalle!, /«quién quieres ser»/)
  assert.equal(textoFuente({ tipo: 'todoist', fecha: '2026-07-24', fecha_aprox: true, tambien: [] }).texto, 'Todoist › YouTube · 24 jul (aprox.)')
  assert.equal(normalizarBanco({ estilo_miniaturas: { estilo: 'simbolo', nombre: 'El símbolo gigante' } }).estilo_miniaturas?.estilo, 'simbolo')
})

