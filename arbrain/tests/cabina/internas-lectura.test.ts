import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  accionEnPalabras, actividadLegible, contextoDe, datosInterna, duracionCorta, herramientasEnPalabras, lineaDeFila, modeloLegible,
  resultadoCorto, tiempoDe, tiempoRotulo, tituloLegible, tokensCortos,
} from '../../src/features/cabina/internas-lectura'
import type { TareaInterna } from '../../src/features/cabina/trabajos-modelo'

const base = (extra: Partial<TareaInterna> = {}): TareaInterna => ({
  id: 'a1', tipo: 'subagente', descripcion: 'Barra de entrada: esfuerzo y contexto', estado: 'trabajando',
  desde: '2026-10-02T12:00:00.000Z', actualizado: '2026-10-02T12:10:00.000Z', conversacion: 'c1', turno: 't1', ...extra,
})
const A = (min: number, seg = 0) => Date.parse('2026-10-02T12:00:00.000Z') + min * 60_000 + seg * 1000

test('la duración se dice corta: segundos, minutos, horas', () => {
  assert.equal(duracionCorta(0), '0 s')
  assert.equal(duracionCorta(45_900), '45 s')
  assert.equal(duracionCorta(12 * 60_000 + 30_000), '12 min')
  assert.equal(duracionCorta(65 * 60_000), '1 h 05 min')
  assert.equal(duracionCorta(2 * 3600_000), '2 h')
  assert.equal(duracionCorta(-5), '0 s')
})

test('los tokens se dicen cortos: «140 k», no 140,127', () => {
  assert.equal(tokensCortos(850), '850')
  assert.equal(tokensCortos(1500), '1.5 k')
  assert.equal(tokensCortos(2000), '2 k')
  assert.equal(tokensCortos(140_127), '140 k')
  assert.equal(tokensCortos(1_200_000), '1.2 M')
})

test('el tiempo corre en vivo mientras trabaja y queda fijo cuando termina', () => {
  assert.equal(tiempoDe(base(), A(12)), 12 * 60_000)
  assert.equal(tiempoDe(base(), A(30)), 30 * 60_000, 'sigue contando si no ha terminado')
  const hecha = base({ estado: 'completada', duracionMs: 754_000, fin: '2026-10-02T12:12:34.000Z' })
  assert.equal(tiempoDe(hecha, A(300)), 754_000, 'usa la duración que reportó el SDK, no el reloj')
  assert.equal(tiempoDe(base({ estado: 'completada', fin: '2026-10-02T12:05:00.000Z' }), A(300)), 5 * 60_000, 'sin duración, de desde a fin')
  assert.equal(tiempoDe(base({ estado: 'detenida' }), A(300)), 10 * 60_000, 'una detenida no sigue contando: llega hasta su última señal')
  assert.equal(tiempoDe(base({ desde: 'no es fecha' })), null)
})

test('el rótulo del tiempo dice si sigue corriendo o ya terminó', () => {
  assert.equal(tiempoRotulo({ estado: 'trabajando' }), 'Lleva')
  assert.equal(tiempoRotulo({ estado: 'completada' }), 'Tardó')
  assert.equal(tiempoRotulo({ estado: 'falló' }), 'Tardó')
})

test('contexto: el de su última llamada; si no hay transcripción, el del SDK; si tampoco, nada', () => {
  assert.equal(contextoDe(base({ contexto: 128_503, tokens: 140_127 })), 128_503)
  assert.equal(contextoDe(base({ tokens: 140_127 })), 140_127)
  assert.equal(contextoDe(base()), null)
})

test('el modelo se lee con su nombre, y sin dato no se inventa', () => {
  assert.equal(modeloLegible({ modelo: 'claude-sonnet-5-5' }), 'Sonnet 5.5')
  assert.equal(modeloLegible({ modelo: 'claude-opus-5-5' }), 'Opus 5.5')
  assert.equal(modeloLegible({ modelo: 'gpt-6-astra' }), 'GPT-6 Astra')
  assert.equal(modeloLegible({ modelo: 'claude-haiku-4-5-20251001' }), 'Haiku 4.5')
  assert.equal(modeloLegible({}), null)
})

test('la actividad se traduce a español en vez de «usando Bash»', () => {
  const a = (ultimaHerramienta?: string, actividad?: string, tipo: TareaInterna['tipo'] = 'subagente') => actividadLegible({ ultimaHerramienta, actividad, tipo })
  assert.equal(a('Read'), 'revisando código')
  assert.equal(a('Grep'), 'revisando código')
  assert.equal(a('Edit'), 'editando código')
  assert.equal(a('Write'), 'escribiendo un archivo')
  assert.equal(a('WebSearch'), 'buscando en la web')
  assert.equal(a('Bash', 'Running Typecheck arbrain'), 'revisando tipos')
  assert.equal(a('Bash', 'Running Run unit tests'), 'corriendo pruebas')
  assert.equal(a('Bash', 'Running Build the app'), 'compilando')
  assert.equal(a('Bash', 'Running Retry free product creation'), 'corriendo un comando')
  assert.equal(a('mcp__claude-in-chrome__computer'), 'usando el navegador')
  assert.equal(a('mcp__polar__execute_tool'), 'usando una herramienta conectada')
  assert.equal(a(undefined, 'Reading ChatPanel.tsx'), 'revisando código')
  assert.equal(a(undefined, 'Running Typecheck arbrain'), 'revisando tipos')
  assert.equal(a(undefined, undefined), null)
  assert.equal(a(undefined, undefined, 'comando'), 'en segundo plano')
})

test('un comando que llega como comando se rotula; una descripción en palabras se respeta', () => {
  assert.equal(tituloLegible({ tipo: 'subagente', descripcion: 'Barra de entrada: esfuerzo y contexto' }), 'Barra de entrada: esfuerzo y contexto')
  assert.equal(tituloLegible({ tipo: 'comando', descripcion: 'Find references to WAFER keys' }), 'Find references to WAFER keys')
  assert.equal(tituloLegible({ tipo: 'comando', descripcion: 'cd /Users/tu-usuario/arbrain && npx tsc --noEmit -p .' }), 'Revisión de tipos: npx tsc --noEmit -p .')
  assert.equal(tituloLegible({ tipo: 'comando', descripcion: 'cd /x/arbrain/server && npx vitest run src' }), 'Pruebas: npx vitest run src')
  assert.equal(tituloLegible({ tipo: 'comando', descripcion: 'cat > /tmp/qa.mjs <<EOF\nimport x\nEOF' }), 'Comando: cat > /tmp/qa.mjs <<EOF')
  // un agente nunca se rotula como comando aunque su descripción empiece con «cd »
  assert.equal(tituloLegible({ tipo: 'subagente', descripcion: 'cd arreglar' }), 'cd arreglar')
})

test('la fila: ahora qué hace, o cómo acabó, en una frase', () => {
  assert.equal(lineaDeFila(base({ ultimaHerramienta: 'Bash', actividad: 'Running Typecheck arbrain' })), 'Ahora: revisando tipos')
  assert.equal(lineaDeFila(base()), null, 'sin pista no se inventa')
  assert.equal(lineaDeFila(base({ resumen: 'Leyendo COMUN.md' })), 'Ahora: Leyendo COMUN.md', 'el resumen de progreso del agente manda')
  assert.equal(lineaDeFila(base({ estado: 'completada', resumen: '**Listo.** Quité el botón de buscar y los tipos pasan.\n\n- detalle' })), 'Listo. Quité el botón de buscar y los tipos pasan.')
  assert.equal(lineaDeFila(base({ estado: 'falló', nota: 'se cayó el servidor' })), 'se cayó el servidor')
})

test('resultadoCorto: primera idea, sin markdown y con tope', () => {
  assert.equal(resultadoCorto('# Informe\n\nRevisé 12 archivos y no hay conflictos. El resto es detalle.'), 'Informe')
  assert.equal(resultadoCorto(''), null)
  assert.equal(resultadoCorto(undefined), null)
  assert.ok((resultadoCorto('x'.repeat(400)) ?? '').length <= 120)
})

test('los datos de la fila: tiempo, contexto y modelo; lo que no hay, no aparece', () => {
  const t = base({ contexto: 128_503, tokens: 140_127, modelo: 'claude-sonnet-5-5' })
  assert.deepEqual(datosInterna(t, A(12)).map(d => [d.clave, d.texto]), [['tiempo', '12 min'], ['contexto', '129 k tokens'], ['modelo', 'Sonnet 5.5']])
  assert.deepEqual(datosInterna(base({ tipo: 'comando' }), A(3)).map(d => d.clave), ['tiempo'], 'un comando no tiene contexto ni modelo')
  const hecha = datosInterna(base({ estado: 'completada', duracionMs: 754_000, tokens: 96_000 }), A(999))
  assert.deepEqual(hecha.map(d => d.texto), ['12 min', '96 k tokens'])
})

test('herramientas agrupadas y contadas en vez de una línea por uso', () => {
  assert.equal(herramientasEnPalabras([{ nombre: 'Bash', n: 18 }, { nombre: 'Write', n: 3 }, { nombre: 'Read', n: 4 }]), 'Bash ×18 · Read ×4 · Write ×3', 'de más a menos usadas')
  assert.equal(herramientasEnPalabras([{ nombre: 'mcp__a__computer', n: 2 }, { nombre: 'mcp__b__computer', n: 3 }]), 'computer ×5')
  assert.equal(herramientasEnPalabras(Array.from({ length: 10 }, (_, i) => ({ nombre: `T${i}`, n: 10 - i })), 3), 'T0 ×10 · T1 ×9 · T2 ×8 · +7 más')
  assert.equal(herramientasEnPalabras([]), '')
})

test('una acción se lee como lo que hizo', () => {
  assert.equal(accionEnPalabras({ herramienta: 'Read', objetivo: 'PanelDerecho.tsx' }), 'Leyó PanelDerecho.tsx')
  assert.equal(accionEnPalabras({ herramienta: 'Edit', objetivo: 'a.ts' }), 'Editó a.ts')
  assert.equal(accionEnPalabras({ herramienta: 'Bash', objetivo: 'Typecheck arbrain' }), 'Corrió: Typecheck arbrain')
  assert.equal(accionEnPalabras({ herramienta: 'Bash' }), 'Corrió un comando')
  assert.equal(accionEnPalabras({ herramienta: 'mcp__claude-in-chrome__navigate' }), 'Usó navigate')
})
