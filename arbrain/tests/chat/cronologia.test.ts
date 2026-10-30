import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { anotarHerramienta, anotarPensamiento, lineaDeTiempo, type PasoCronologia, type Tramo } from '../../src/features/chat/lib/rastro'
import { snapshotMessage } from '../../src/features/chat/lib/durable-recovery'
import type { ToolCall } from '../../src/features/chat/hooks/useChat'

const resumen = (tramos: Tramo[]) => tramos.map(t => t.tipo === 'pensamiento' ? `P:${t.texto}` : `H:${t.grupos.map(g => g.etiqueta + (g.cuenta ? ` · ${g.cuenta}` : '')).join(' | ')}`)
const bash = (toolId: string, command: string): [ToolCall, string] => [{ toolId, toolName: 'Bash', status: 'done' }, JSON.stringify({ command })]

/** Lo que hacen useChat y el servidor al llegar los eventos, en orden. */
function vivir(eventos: Array<['pensar', string] | ['tool', string]>) {
  const cronologia: PasoCronologia[] = []
  let thinking = ''
  for (const [tipo, x] of eventos) {
    if (tipo === 'pensar') { anotarPensamiento(cronologia, thinking.length, x.length); thinking += x }
    else anotarHerramienta(cronologia, x)
  }
  return { cronologia, thinking }
}

const [c1, i1] = bash('t1', 'gog calendar events --today')
const [c2, i2] = bash('t2', 'gog calendar events --tomorrow')
const [c3, i3] = bash('t3', 'cd ~/mi-cerebro/.claude/memory && grep -rn x .')
const llamadas = { toolCalls: [c1, c2, c3], toolInputs: { t1: i1, t2: i2, t3: i3 } }

test('en vivo: pensamiento y herramientas se intercalan en el orden en que llegaron; deltas seguidos son un tramo', () => {
  const { cronologia, thinking } = vivir([['pensar', 'Primero '], ['pensar', 'la agenda.'], ['tool', 't1'], ['tool', 't2'], ['pensar', 'Ahora la memoria.'], ['tool', 't3'], ['tool', 't3']])
  assert.deepEqual(cronologia, [
    { tipo: 'pensamiento', desde: 0, hasta: 18 }, { tipo: 'herramienta', toolId: 't1' }, { tipo: 'herramienta', toolId: 't2' },
    { tipo: 'pensamiento', desde: 18, hasta: 35 }, { tipo: 'herramienta', toolId: 't3' },
  ])
  assert.deepEqual(resumen(lineaDeTiempo({ ...llamadas, content: '', thinking, cronologia })), [
    'P:Primero la agenda.', 'H:Revisó el calendario · 2 comandos', 'P:Ahora la memoria.', 'H:Revisó la memoria',
  ])
})

test('restaurado: snapshotMessage trae la cronología y la línea de tiempo sale igual que en vivo', () => {
  const { cronologia, thinking } = vivir([['pensar', 'Uno.'], ['tool', 't1'], ['pensar', 'Dos.'], ['tool', 't3']])
  const m = snapshotMessage({
    text: 'Listo.', thinking, cronologia: JSON.parse(JSON.stringify(cronologia)),
    tools: { t3: { name: 'Bash', input: i3, status: 'completed', orden: 1 }, t1: { name: 'Bash', input: i1, status: 'completed', orden: 0 } },
  })
  assert.deepEqual(resumen(lineaDeTiempo(m)), ['P:Uno.', 'H:Revisó el calendario', 'P:Dos.', 'H:Revisó la memoria'])
  // Razonamiento recortado en la entrega (delivery-compact): los offsets se acotan, no revientan
  const recortado = lineaDeTiempo({ ...m, thinking: 'Uno' })
  assert.deepEqual(resumen(recortado), ['P:Uno', 'H:Revisó el calendario | Revisó la memoria'])
})

test('viejo sin cronología: el razonamiento entero primero y luego las herramientas, sin inventar orden', () => {
  assert.deepEqual(resumen(lineaDeTiempo({ ...llamadas, content: 'x', thinking: 'Todo el razonamiento.' })), [
    'P:Todo el razonamiento.', 'H:Revisó el calendario · 2 comandos | Revisó la memoria',
  ])
  // sesión CLI: razonamiento fundido en content
  assert.deepEqual(resumen(lineaDeTiempo({ content: '<!--thinking-->Revisar log.<!--/thinking-->Sí corrió.' })), ['P:Revisar log.'])
  assert.deepEqual(lineaDeTiempo({ content: 'Hola' }), [])
})

test('herramientas que la cronología no vio y pensamiento sin anotar van al final', () => {
  const t = lineaDeTiempo({ ...llamadas, content: '', thinking: 'Uno.Resto', cronologia: [{ tipo: 'pensamiento', desde: 0, hasta: 4 }, { tipo: 'herramienta', toolId: 't3' }] })
  assert.deepEqual(resumen(t), ['P:Uno.', 'H:Revisó la memoria | Revisó el calendario · 2 comandos', 'P:Resto'])
})
