import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claseDe, diffFrases, fraseCodigo, fraseDeshacer, resumenDeshecho, diffLineas, edicionDe, edicionesDelTurno, frases, lugarDeRuta, plegarLineas, porArchivo, resumenHumano, resumenTurno, nombreLegible, rutaCorta, temaDelCodigo, type BloqueProsa } from '../../src/features/chat/lib/diff-edicion'

const R = '/Users/tu-usuario/Developer/artificial-brain'
const MEM = `${R}/.claude/memory/project/llamadas-cohorte-2026-10-25.md`
const SKILL = `${R}/.claude/skills/clientes/SKILL.md`
const COD = `${R}/arbrain/src/features/clientes/lib/seguimiento.ts`
const j = (o: unknown) => JSON.stringify(o)

test('nombra el archivo por su función, no por su nombre técnico', () => {
  assert.equal(claseDe(MEM).lugar, 'tu memoria sobre «llamadas cohorte»')
  assert.equal(claseDe(SKILL).lugar, 'la skill «clientes»')
  assert.equal(claseDe(`${R}/.claude/skills/clientes/references/ficha-viva.md`).lugar, 'la guía «ficha viva» de la skill «clientes»')
  assert.equal(claseDe(`${R}/.claude/skills/clientes/scripts/sync.py`).lugar, 'el script «sync» de la skill «clientes»')
  assert.equal(claseDe(`${R}/docs/builds/x/SPEC.md`).clase, 'documento')
  assert.equal(claseDe(`${R}/.claude/memory/MEMORY.md`).lugar, 'tu memoria esencial')
  assert.equal(claseDe(`${R}/CLAUDE.md`).lugar, 'las instrucciones de Levy')
  // Código: nunca «seguimiento.ts»; su papel y, si el contenido lo dice, de qué trata.
  assert.equal(claseDe(COD).lugar, 'el código «seguimiento»')
  assert.equal(claseDe(COD, '/** Recordatorio del seguimiento a fundadores: media hora antes. */\nexport const X = 1').lugar, 'el código de «recordatorio del seguimiento a fundadores»')
  assert.equal(claseDe(`${R}/arbrain/src/features/chat/components/CambiosTurno.tsx`).lugar, 'la pantalla «cambios turno»')
  assert.equal(claseDe(`${R}/arbrain/src/app/historia/page.tsx`).lugar, 'la página «historia»')
  assert.equal(claseDe(`${R}/arbrain/tests/chat/diff-edicion.test.ts`).lugar, 'la prueba «diff edicion»')
  for (const r of [MEM, SKILL, COD, `${R}/arbrain/src/x/y.module.css`]) assert.doesNotMatch(claseDe(r).lugar, /\.(ts|tsx|md|css|py)\b|\//, r)
  assert.equal(nombreLegible('agentes-1-3-1-y-definicion-2026-10-25.md'), 'agentes 1 3 1 y definicion')
  assert.equal(rutaCorta(MEM), '.claude/memory/project/llamadas-cohorte-2026-10-25.md')
  assert.equal(rutaCorta(COD), 'arbrain/src/features/clientes/lib/seguimiento.ts')
})

test('diff por líneas: añadido, quitado e igual', () => {
  const d = diffLineas('a\nb\nc', 'a\nB\nc\nd')
  assert.deepEqual(d.map(l => `${l.tipo[0]}${l.texto}`), ['ia', 'qb', 'aB', 'ic', 'ad'])
  assert.deepEqual(diffLineas('', 'x\ny').map(l => l.tipo), ['agregada', 'agregada'])
})

test('lo igual se pliega lejos de los cambios', () => {
  const antes = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
  const despues = antes.replace('l10', 'L10')
  const p = plegarLineas(diffLineas(antes, despues), 2)
  assert.deepEqual(p[0], { tipo: 'pliegue', omitidas: 8 })
  assert.equal(p.filter(l => l.tipo !== 'pliegue').length, 6)
  assert.deepEqual(p.at(-1), { tipo: 'pliegue', omitidas: 7 })
})

test('resumen humano de cada herramienta', () => {
  const edit = edicionDe({ toolId: '1', toolName: 'Edit' }, j({ file_path: MEM, old_string: 'a\nb\nc', new_string: 'a\nB\nC\nc' }))!
  assert.equal(resumenHumano(edit), 'cambió 2 líneas en tu memoria sobre «llamadas cohorte»')
  const agrega = edicionDe({ toolId: '2', toolName: 'Edit' }, j({ file_path: SKILL, old_string: 'x', new_string: 'x\ny' }))!
  assert.equal(resumenHumano(agrega), 'agregó 1 línea a la skill «clientes»')
  const quita = edicionDe({ toolId: '3', toolName: 'Edit' }, j({ file_path: COD, old_string: 'x\ny\nz', new_string: 'x' }))!
  assert.equal(resumenHumano(quita), 'quitó 2 líneas del código «seguimiento»')
  const escribe = edicionDe({ toolId: '4', toolName: 'Write' }, j({ file_path: COD, content: 'uno\ndos\ntres\n' }))!
  assert.equal(resumenHumano(escribe), 'escribió el código «seguimiento» (3 líneas)')
  const multi = edicionDe({ toolId: '5', toolName: 'MultiEdit' }, j({ file_path: SKILL, edits: [{ old_string: 'a', new_string: 'A' }, { old_string: 'b', new_string: 'B' }] }))!
  assert.equal(resumenHumano(multi), 'cambió 2 líneas en la skill «clientes»')
  assert.equal(edicionDe({ toolId: '6', toolName: 'Read' }, j({ file_path: MEM })), null)
})

test('input recortado o edición fallida: se dice, no se inventa', () => {
  const recortado = edicionDe({ toolId: '1', toolName: 'Edit' }, `{"file_path":"${MEM}","old_string":"## Llam`)!
  assert.equal(recortado.incompleto, true)
  assert.equal(recortado.ruta, MEM)
  assert.equal(resumenHumano(recortado), 'cambió tu memoria sobre «llamadas cohorte»')
  const fallo = edicionDe({ toolId: '2', toolName: 'Edit' }, j({ file_path: MEM, old_string: 'a', new_string: 'b' }), true)!
  assert.equal(resumenHumano(fallo), 'intentó cambiar tu memoria sobre «llamadas cohorte», pero no se aplicó')
})

test('renglón del turno: archivos distintos, sin contar los fallidos', () => {
  const msg = {
    toolCalls: [
      { toolId: 'a', toolName: 'Edit', status: 'done' as const }, { toolId: 'b', toolName: 'Edit', status: 'done' as const },
      { toolId: 'c', toolName: 'MultiEdit', status: 'done' as const }, { toolId: 'd', toolName: 'Write', status: 'done' as const },
      { toolId: 'e', toolName: 'Bash', status: 'done' as const },
    ],
    toolInputs: {
      a: j({ file_path: MEM, old_string: 'a', new_string: 'b' }), b: j({ file_path: MEM, old_string: 'b', new_string: 'c' }),
      c: j({ file_path: SKILL, edits: [{ old_string: 'a', new_string: 'b' }] }), d: j({ file_path: COD, content: 'x' }), e: j({ command: 'ls' }),
    },
    toolOutputs: { d: { content: 'denied', kind: 'denied' } },
  }
  const ed = edicionesDelTurno(msg)
  assert.equal(ed.length, 4)
  assert.equal(resumenTurno(ed), 'Levy cambió 1 memoria y 1 skill')
  assert.equal(porArchivo(ed).length, 3, 'las dos ediciones de la memoria son un solo archivo')
  assert.equal(porArchivo(ed)[0].cambios.length, 2)
  assert.equal(resumenTurno([]), '')
  assert.equal(resumenTurno(ed.slice(3)), 'Levy intentó cambiar archivos, pero no se aplicó')
})

test('fila del turno: cuenta por tipo, y las guías de una skill son la misma skill', () => {
  const ed = [
    edicionDe({ toolId: '1', toolName: 'Edit' }, j({ file_path: MEM, old_string: 'a', new_string: 'b' }))!,
    edicionDe({ toolId: '2', toolName: 'Edit' }, j({ file_path: `${R}/.claude/memory/feedback/otra.md`, old_string: 'a', new_string: 'b' }))!,
    edicionDe({ toolId: '3', toolName: 'Edit' }, j({ file_path: SKILL, old_string: 'a', new_string: 'b' }))!,
    edicionDe({ toolId: '4', toolName: 'Edit' }, j({ file_path: `${R}/.claude/skills/clientes/references/ficha.md`, old_string: 'a', new_string: 'b' }))!,
    edicionDe({ toolId: '5', toolName: 'Write' }, j({ file_path: COD, content: '/** Recordatorio del seguimiento: x */\nconst a = 1\n' }))!,
  ]
  assert.equal(resumenTurno(ed), 'Levy cambió 2 memorias, 1 skill y 1 archivo de código')
  // El diálogo nombra las rutas del SDK con el nombre que ya tienen en el turno.
  assert.equal(lugarDeRuta(COD, ed), 'el código de «recordatorio del seguimiento»')
  assert.equal(lugarDeRuta(`${R}/otra/cosa.ts`, ed), 'el código «cosa»')
})

test('tema del código: la primera frase de su comentario, o nada', () => {
  assert.equal(temaDelCodigo("'use client'\n/**\n * Recordatorio del seguimiento (27 oct).\n */"), 'recordatorio del seguimiento')
  assert.equal(temaDelCodigo('# Sincroniza las fichas de clientes. Corre cada hora.\nimport os'), 'sincroniza las fichas de clientes')
  assert.equal(temaDelCodigo('export const x = 1'), null)
  assert.equal(temaDelCodigo('// x'), null)
  assert.equal(temaDelCodigo(undefined), null)
})

const cambios = (bs: BloqueProsa[]) => bs.filter((b): b is Extract<BloqueProsa, { tipo: 'cambio' }> => b.tipo === 'cambio')
const marcadas = (fs: { texto: string; marca: boolean }[][]) => fs.flat().filter(p => p.marca).map(p => p.texto)

test('prosa por frase: la vieja arriba, la nueva abajo, solo palabras completas', () => {
  const antes = '## Llamadas\n\n- Grupales: lunes y miércoles a las 12:00.\n- Uno a uno: cuatro por fundador.'
  const despues = '## Llamadas\n\n- Grupales: lunes, miércoles y viernes a las 12:00. No proponer quitarlas (Daniel, 25 oct).\n- Uno a uno: cuatro por fundador.'
  const bs = diffFrases(antes, despues)
  const c = cambios(bs)
  assert.equal(c.length, 1, 'un solo bloque de cambio')
  // La frase vieja completa arriba; abajo, la nueva y la frase que entró.
  assert.deepEqual(c[0].antes.map(f => f.map(p => p.texto).join(' ')), ['- Grupales: lunes y miércoles a las 12:00.'])
  assert.deepEqual(c[0].despues.map(f => f.map(p => p.texto).join(' ')), ['- Grupales: lunes, miércoles y viernes a las 12:00.', 'No proponer quitarlas (Daniel, 25 oct).'])
  // Ni la coma suelta ni «miércoles» (que solo cambió de vecino) se marcan.
  const ma = marcadas(c[0].antes), md = marcadas(c[0].despues)
  for (const w of [...ma, ...md]) assert.match(w, /\p{L}|\d/u, `«${w}» no es una palabra`)
  assert.ok(!ma.some(w => /miércoles/.test(w)) && !md.some(w => /miércoles/.test(w)), 'miércoles no se tacha ni se reinserta')
  assert.ok(!md.includes('lunes,'), 'la coma pegada a «lunes» no cuenta como cambio')
  assert.ok(md.includes('viernes'))
  // «y» solo cambió de lugar: no se tacha ni se resalta.
  assert.deepEqual(md, ['viernes', 'No', 'proponer', 'quitarlas', '(Daniel,', '25', 'oct).'])
  assert.deepEqual(ma, [])
  // Lo igual alrededor queda como contexto, sin marcas.
  assert.deepEqual(bs.filter(b => b.tipo === 'igual').map(b => b.tipo === 'igual' && b.frase), ['## Llamadas', '- Uno a uno: cuatro por fundador.'])
})

test('prosa: si casi todo cambió, la frase va entera, sin marcas dentro', () => {
  const c = cambios(diffFrases('Nunca envía mensajes.', 'Deja el borrador y espera el mándalo de Daniel.'))
  assert.equal(c.length, 1)
  assert.equal(c[0].fino, false)
  assert.deepEqual(marcadas(c[0].antes), [])
  assert.deepEqual(marcadas(c[0].despues), [])
})

test('prosa: frases lejos del cambio se pliegan y lo añadido solo no trae «antes»', () => {
  const base = Array.from({ length: 8 }, (_, i) => `Frase número ${i + 1}.`).join(' ')
  const bs = diffFrases(base, base.replace('Frase número 5.', 'Frase número 5. Una nueva.'))
  assert.deepEqual(bs.map(b => b.tipo), ['pliegue', 'igual', 'cambio', 'igual', 'pliegue'])
  const c = cambios(bs)[0]
  assert.equal(c.antes.length, 0)
  assert.deepEqual(c.despues.map(f => f.map(p => p.texto).join(' ')), ['Una nueva.'])
  assert.deepEqual(frases('Hola. Adiós.\n- ej. algo así'), ['Hola.', 'Adiós.', '- ej. algo así'])
})

test('ronda 3: el código se cuenta en una frase humana antes de enseñar líneas', () => {
  const nota = '/** Recordatorio del seguimiento a fundadores: media hora antes de cada grupal. */\nexport const X = 1\n'
  const w = edicionDe({ toolId: 'w', toolName: 'Write' }, j({ file_path: COD, content: nota }))!
  assert.equal(fraseCodigo(w), 'Levy escribió este archivo completo (2 líneas). Su nota de arriba dice para qué sirve: «Recordatorio del seguimiento a fundadores: media hora antes de cada grupal.»')
  const sinNota = edicionDe({ toolId: 'w2', toolName: 'Write' }, j({ file_path: COD, content: 'export const X = 1\n' }))!
  assert.match(fraseCodigo(sinNota), /No trae una nota/)
  const valor = edicionDe({ toolId: 'v', toolName: 'Edit' }, j({ file_path: COD, old_string: 'export const AVISO_ANTES_MIN = 30', new_string: 'export const AVISO_ANTES_MIN = 45' }))!
  assert.equal(fraseCodigo(valor), 'Cambió un valor: donde decía «30» ahora dice «45».')
  const parte = edicionDe({ toolId: 'p', toolName: 'Edit' }, j({ file_path: COD, old_string: 'x', new_string: 'x\nexport function horaDelAviso() {\n  return 1\n}' }))!
  assert.equal(fraseCodigo(parte), 'Agregó 3 líneas en la parte «hora del aviso».')
  for (const e of [w, valor, parte]) assert.doesNotMatch(fraseCodigo(e), /[−+]\d/)
})

test('ronda 3: la frase del diálogo dice qué vuelve y qué se va', () => {
  const ed = [edicionDe({ toolId: 'm', toolName: 'Edit' }, j({ file_path: MEM, old_string: 'a', new_string: 'b' }))!]
  assert.equal(fraseDeshacer({ archivos: [MEM], inserciones: 3, borrados: 14 }, ed),
    'Tu memoria sobre «llamadas cohorte» vuelve a como estaba antes de este turno: se quitan 14 líneas que Levy agregó y regresan 3 que cambió.')
  assert.equal(fraseDeshacer({ archivos: [MEM, SKILL, COD], inserciones: 1, borrados: 1 }, ed, '18:02'),
    'Tus 3 archivos vuelven a como estaban antes de este turno (tu mensaje de las 18:02): se quita 1 línea que Levy agregó y regresa 1 que cambió.')
  assert.equal(fraseDeshacer({ archivos: [MEM], inserciones: 2, borrados: 0 }, ed), 'Tu memoria sobre «llamadas cohorte» vuelve a como estaba antes de este turno: regresan 2 líneas que Levy cambió.')
  assert.equal(fraseDeshacer({ archivos: [], inserciones: 0, borrados: 0 }), 'Tus archivos ya están como antes de este turno.')
  assert.equal(resumenDeshecho(ed), 'Deshiciste lo que Levy cambió: 1 memoria')
})
