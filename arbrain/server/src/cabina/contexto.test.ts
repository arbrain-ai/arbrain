import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { esSecreto, leerMemoria, leerTranscript, partesDeInyeccion, reducirDesglose, tachar } from './contexto.js'

describe('contexto · memoria', () => {
  it('las credenciales nunca se leen: solo el nombre', () => {
    expect(esSecreto('reference/credenciales-operativas.md')).toBe(true)
    expect(esSecreto('reference/vps-187-password-rotado-2026-07-07.md')).toBe(true)
    expect(esSecreto('user/historia-daniel.md')).toBe(false)
    const r = leerMemoria('reference/credenciales-operativas.md')
    if ('error' in r) return   // el checkout de prueba puede no traerla; la regla es esSecreto
    expect(r.oculto).toBe(true)
    expect(r.texto).toBe('')
  })
  it('no sale de .claude/memory', () => {
    expect(leerMemoria('../settings.json')).toMatchObject({ status: 400 })
    expect(leerMemoria('/etc/passwd.md')).toMatchObject({ status: 400 })
    expect(leerMemoria('user/../../CLAUDE.md')).toMatchObject({ status: 400 })
  })
  it('tacha lo que parece una llave aunque viva en una memoria normal', () => {
    const t = tachar('usa sk-ant-abcdefghijklmnopqrstuv y token: abcdefghijklmnopqrstuvwxyz0123 y ghp_abcdefghijklmnopqrstu')
    expect(t).not.toMatch(/abcdefghijklmnop/)
    expect(t.match(/«oculto»/g)?.length).toBe(3)
  })
})

describe('contexto · transcript', () => {
  it('lee usage por llamada (sin duplicar ids), turnos, la última inyección y compactaciones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctx-'))
    const f = join(dir, 's.jsonl')
    const asis = (id: string, u: Record<string, number>, ts: string) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model: 'claude-opus-5-5', usage: u } })
    writeFileSync(f, [
      JSON.stringify({ type: 'attachment', timestamp: 't0', attachment: { type: 'hook_additional_context', hookEvent: 'UserPromptSubmit', content: ['RUTAS POR INTENCIÓN x\n\nAGENDA COMPARTIDA y'] } }),
      JSON.stringify({ type: 'user', promptId: 'p1', timestamp: 't1', message: { content: 'hola Levy' } }),
      asis('m1', { input_tokens: 2, cache_creation_input_tokens: 39876, cache_read_input_tokens: 0, output_tokens: 5 }, 't2'),
      asis('m1', { input_tokens: 2, cache_creation_input_tokens: 39876, cache_read_input_tokens: 0, output_tokens: 5 }, 't2'),
      JSON.stringify({ type: 'user', promptId: 'p1', timestamp: 't3', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }] } }),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: 't4', compactMetadata: { preTokens: 209176, postTokens: 12615, trigger: 'manual' } }),
      JSON.stringify({ type: 'attachment', timestamp: 't5', attachment: { type: 'hook_additional_context', hookEvent: 'UserPromptSubmit', content: ['RUTAS POR INTENCIÓN a\n\n🧠 recall — b\n\nAGENDA COMPARTIDA c'] } }),
      JSON.stringify({ type: 'user', promptId: 'p2', timestamp: 't6', message: { content: 'segundo mensaje' } }),
      asis('m2', { input_tokens: 2, cache_creation_input_tokens: 4753, cache_read_input_tokens: 345944, output_tokens: 244 }, 't7'),
      JSON.stringify({ type: 'assistant', isSidechain: true, timestamp: 't8', message: { id: 'sub', usage: { input_tokens: 9 } } }),
    ].join('\n'))
    const l = await leerTranscript(f)
    expect(l.llamadas.map(x => x.uso.cacheLectura)).toEqual([0, 345944])
    expect(l.turnos).toEqual([{ en: 't1', caracteres: 9, primeraLlamada: 0, llamadas: 1 }, { en: 't6', caracteres: 15, primeraLlamada: 1, llamadas: 1 }])
    expect(l.compactaciones).toEqual([{ en: 't4', antes: 209176, despues: 12615, disparo: 'manual' }])
    expect(l.inyeccion?.texto).toContain('🧠 recall')
    expect(l.primeraInyeccion).toBe('RUTAS POR INTENCIÓN x\n\nAGENDA COMPARTIDA y'.length)
    expect(partesDeInyeccion(l.inyeccion!.texto).map(p => p.nombre)).toEqual(['Rutas por intención', 'Recall de memoria', 'Agenda del turno'])
  })
})

describe('contexto · desglose del SDK', () => {
  it('agrupa herramientas MCP por servidor y lee skills en sus dos formas', () => {
    const d = reducirDesglose({
      model: 'claude-opus-5-5', totalTokens: 20000, rawMaxTokens: 1_000_000,
      categories: [{ name: 'Skills', tokens: 9956, kind: 'used' }, { name: 'Vacía', tokens: 0, kind: 'used' }, { name: 'MCP tools (deferred)', tokens: 9, isDeferred: true }],
      memoryFiles: [{ path: '/x/CLAUDE.md', tokens: 3995 }],
      mcpTools: [{ serverName: 'cabina', tokens: 300 }, { serverName: 'cabina', tokens: 200 }, { serverName: 'manos', tokens: 900 }],
      skills: { skillFrontmatter: [{ name: 'a', source: 'projectSettings', tokens: 5 }, { name: 'b', source: 'built-in', tokens: 50 }] },
      messageBreakdown: { toolCallTokens: 1, toolResultTokens: 2, attachmentTokens: 3, assistantMessageTokens: 4, userMessageTokens: 5, unattributedTokens: 0, attachmentsByType: [{ name: 'hook_additional_context', tokens: 3 }] },
    })
    expect(d.categorias.map(c => [c.nombre, c.tipo])).toEqual([['Skills', 'used'], ['MCP tools (deferred)', 'deferred']])
    expect(d.mcp).toEqual([{ servidor: 'manos', herramientas: 1, tokens: 900 }, { servidor: 'cabina', herramientas: 2, tokens: 500 }])
    expect(d.skills.map(s => s.nombre)).toEqual(['b', 'a'])
    expect(d.mensajes?.adjuntosPorTipo).toEqual([{ nombre: 'hook_additional_context', tokens: 3 }])
  })
})
