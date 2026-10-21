import { describe, expect, it } from 'vitest'
import { compactDelivery } from './delivery-compact.js'

const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const shot = (kb: number) => 'data:image/png;base64,' + 'A'.repeat(kb * 1024)

function bigTurn(tools: number, kb: number) {
  const snapshotTools: Record<string, unknown> = {}, items: Record<string, unknown> = {}
  for (let i = 0; i < tools; i++) {
    snapshotTools[`t${i}`] = { name: 'mcp__cua_repl__js', input: '{"code":"screenshot()"}', status: 'completed', result: shot(kb), error: false, durationMs: 3 }
    items[`i${i}`] = { id: `i${i}`, type: 'tool', status: 'completed', data: { output: shot(kb) } }
  }
  return { chatSessionId: 'c', turnId: 't', userMessage: 'opera Chrome', assistantMessage: 'Listo, Daniel.', terminalStatus: 'completed',
    runtimeSnapshot: { text: 'Listo, Daniel.', thinking: 'pensé', status: 'completed', tools: snapshotTools, items, usage: { costUsd: 1 } } }
}

describe('sobre de entrega acotado', () => {
  it('un sobre normal viaja intacto, idéntico', () => {
    const payload = bigTurn(2, 4)
    const result = compactDelivery(payload)
    expect(result.trimmed).toBe(false)
    expect(result.payload).toBe(payload)
  })
  it('el caso real de 10,8 MB (capturas de cua_repl) baja del límite sin tocar la respuesta', () => {
    const payload = bigTurn(14, 760)
    expect(size(payload)).toBeGreaterThan(10 * 1024 * 1024)
    const result = compactDelivery(payload)
    expect(result.trimmed).toBe(true)
    expect(result.stage).toBe('campos')
    expect(result.bytes).toBeLessThan(4 * 1024 * 1024)
    expect(result.payload.assistantMessage).toBe('Listo, Daniel.')
    const snapshot = result.payload.runtimeSnapshot as Record<string, any>
    expect(snapshot.text).toBe('Listo, Daniel.')
    expect(snapshot.tools.t0.name).toBe('mcp__cua_repl__js')
    expect(snapshot.tools.t0.result).toContain('recortado para la entrega')
    expect(snapshot.deliveryTrimmed.originalBytes).toBe(size(payload))
    // El original no se toca: es lo que conserva el journal.
    expect((payload.runtimeSnapshot.tools.t0 as { result: string }).result.length).toBeGreaterThan(700 * 1024)
  })
  it('con miles de herramientas queda solo el esqueleto', () => {
    const result = compactDelivery(bigTurn(400, 20), 2 * 1024 * 1024)
    expect(result.stage).toBe('esqueleto')
    expect(result.bytes).toBeLessThan(2 * 1024 * 1024)
    expect((result.payload.runtimeSnapshot as Record<string, any>).tools.t3).toEqual({ name: 'mcp__cua_repl__js', status: 'completed', error: false, durationMs: 3 })
  })
  it('si el texto mismo excede, se entrega su inicio y se dice', () => {
    const payload = { ...bigTurn(0, 0), assistantMessage: 'x'.repeat(5 * 1024 * 1024) }
    const result = compactDelivery(payload, 1024 * 1024)
    expect(result.stage).toBe('texto')
    expect(result.bytes).toBeLessThan(1024 * 1024)
    expect(String(result.payload.assistantMessage)).toContain('recortado para la entrega')
  })
})
