import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADAPTADORES, adaptador, leerBitacora, respuestaDe, tokensDe } from './index.js'

/** Muestras REALES grabadas el 6 oct 2026 en /tmp con cada CLI (claude 2.1.285, codex 0.154.0, opencode 1.18.27,
 *  gemini 0.56.0, qwen 0.22.0). Solo se recortaron las listas largas del `init` de claude/qwen. */
const muestra = (n: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'muestras', `${n}.jsonl`), 'utf8')
/** Una muestra como un turno de bitácora: marca de inicio + stdout + marca de salida. */
const turno = (n: string, codigo = 0) => `{"arbrain":"inicio","en":1,"texto":"encargo"}\n${muestra(n)}{"arbrain":"salida","codigo":${codigo},"en":2}\n`
const leer = (h: string, ...turnos: string[]) => leerBitacora(turnos.join(''), adaptador(h)!)

describe('registro de adaptadores', () => {
  it('trae los cinco obligatorios', () => expect(Object.keys(ADAPTADORES).sort()).toEqual(['claude', 'codex', 'gemini', 'opencode', 'qwen']))
  it('un prompt que empieza con guion no se lee como opción', () => {
    for (const a of Object.values(ADAPTADORES)) {
      const argv = a.lanzar({ encargo: '--borra-todo', modelo: null, cwd: '/tmp/x', permisos: 'bypass' })
      expect(argv).not.toContain('--borra-todo')
    }
  })
})

describe('claude', () => {
  const a = ADAPTADORES.claude
  it('argv de lanzar y reanudar (flags verificados contra su --help)', () => {
    expect(a.lanzar({ encargo: 'hola', modelo: 'claude-sonnet-5-5', cwd: '/tmp/x', permisos: 'bypass', sesion: 'u-1' }))
      .toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--session-id', 'u-1', '--model', 'claude-sonnet-5-5', '--permission-mode', 'bypassPermissions', 'hola'])
    expect(a.reanudar({ sesion: 'u-1', texto: 'y?', modelo: null, cwd: '/tmp/x', permisos: 'acceptEdits' }))
      .toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--resume', 'u-1', '--permission-mode', 'acceptEdits', 'y?'])
    expect(a.sesionPropia).toBe(true)
  })
  it('lee sesión, respuesta y tokens de dos turnos reales', () => {
    const b = leer('claude', turno('claude-lanzar'), turno('claude-reanudar'))
    expect(b.sesion).toBe('abaababb-aabb-baab-bbaa-bbaaabbaabaa')
    expect(b.turnos).toHaveLength(2)
    expect(respuestaDe(b.turnos[0])).toBe('hola uno')
    expect(b.turnos[1].finCli && b.turnos[1].salida?.codigo).toBe(0)
    expect(b.turnos[0].tokens).toBe(2 + 11220 + 6)
    expect(tokensDe(b)).toBeGreaterThan(b.turnos[0].tokens)
  })
  it('herramientas y error de modelo', () => {
    expect(leer('claude', turno('claude-herramienta')).turnos[0]).toMatchObject({ herramientas: ['Write'], final: 'listo' })
    expect(leer('claude', turno('claude-error', 1)).turnos[0].error).toMatch(/issue with the selected model/)
  })
})

describe('codex', () => {
  const a = ADAPTADORES.codex
  it('argv de exec y exec resume', () => {
    expect(a.lanzar({ encargo: 'hola', modelo: 'gpt-5.5', cwd: '/tmp/x', permisos: 'bypass' }))
      .toEqual(['exec', '--json', '--skip-git-repo-check', '-m', 'gpt-5.5', '--dangerously-bypass-approvals-and-sandbox', 'hola'])
    expect(a.reanudar({ sesion: 'th-1', texto: 'y?', modelo: null, cwd: '/tmp/x', permisos: 'bypass' }))
      .toEqual(['exec', 'resume', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', 'th-1', 'y?'])
    expect(a.lanzar({ encargo: 'x', modelo: null, cwd: '/tmp/x', permisos: 'auto' })).toContain('sandbox_mode="workspace-write"')
  })
  it('sesión del thread.started, respuesta, tokens; los avisos de config no son error', () => {
    const b = leer('codex', turno('codex-lanzar'), turno('codex-reanudar'))
    expect(b.sesion).toBe('bbbabbaa-aaba-abab-baab-abbbbaababba')
    expect(respuestaDe(b.turnos[1])).toBe('hola uno')
    expect(b.turnos[0].error).toBeUndefined()
    expect(b.turnos[0].tokens).toBeGreaterThan(0)
  })
  it('comando como herramienta y error del modelo legible', () => {
    expect(leer('codex', turno('codex-herramienta')).turnos[0].herramientas).toEqual(['Bash'])
    expect(leer('codex', turno('codex-error', 1)).turnos[0].error).toBe("The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.")
  })
})

describe('opencode (cualquier proveedor)', () => {
  const a = ADAPTADORES.opencode
  it('argv con proveedor/modelo y --auto', () => {
    expect(a.lanzar({ encargo: 'hola', modelo: 'openrouter/~deepseek/deepseek-v4-flash-latest', cwd: '/tmp/x', permisos: 'bypass' }))
      .toEqual(['run', '--format', 'json', '-m', 'openrouter/~deepseek/deepseek-v4-flash-latest', '--auto', 'hola'])
    expect(a.reanudar({ sesion: 'ses_1', texto: 'y?', modelo: null, cwd: '/tmp/x', permisos: 'bypass' })).toEqual(['run', '--format', 'json', '-s', 'ses_1', '--auto', 'y?'])
    expect(a.modeloOk('openrouter/~deepseek/deepseek-v4-flash-latest')).toBe(true)
    expect(a.modeloOk('openrouter/x; rm -rf /')).toBe(false)
  })
  it('lee DeepSeek real: sesión, texto, herramienta, tokens y error', () => {
    const b = leer('opencode', turno('opencode-lanzar'), turno('opencode-reanudar'))
    expect(b.sesion).toBe('ses_eed1b3a0fffes39F5YZ20BCWVN')
    expect(respuestaDe(b.turnos[1])).toBe('hola uno')
    expect(b.turnos[0]).toMatchObject({ tokens: 15372, finCli: true })
    expect(leer('opencode', turno('opencode-herramienta')).turnos[0]).toMatchObject({ herramientas: ['write'], mensajes: ['listo'] })
    expect(leer('opencode', turno('opencode-error', 1)).turnos[0].error).toMatch(/Unexpected server error/)
  })
})

describe('gemini', () => {
  const a = ADAPTADORES.gemini
  it('argv con sesión propia y yolo', () => {
    expect(a.lanzar({ encargo: 'hola', modelo: 'gemini-2.5-flash', cwd: '/tmp/x', permisos: 'bypass', sesion: 'g-1' }))
      .toEqual(['-p', 'hola', '-o', 'stream-json', '--skip-trust', '--session-id', 'g-1', '-m', 'gemini-2.5-flash', '--approval-mode', 'yolo'])
    expect(a.reanudar({ sesion: 'g-1', texto: 'y?', modelo: null, cwd: '/tmp/x', permisos: 'bypass' })[0]).toBe('-r')
  })
  it('lee la muestra real con deltas', () => {
    const b = leer('gemini', turno('gemini-lanzar'), turno('gemini-reanudar'))
    expect(b.sesion).toBe('aabbabab-bbab-baba-aaab-babbbbbababa')
    expect(respuestaDe(b.turnos[1])).toBe('hola uno')
    expect(b.turnos[0].tokens).toBe(13220)
  })
  it('junta los deltas de un mismo mensaje', () => {
    const l = (c: string) => JSON.stringify({ type: 'message', role: 'assistant', content: c, delta: true })
    const b = leerBitacora(['{"arbrain":"inicio","en":1}', l('ho'), l('la'), JSON.stringify({ type: 'tool_use', tool_name: 'write_file' }), l('lis'), l('to')].join('\n'), a)
    expect(b.turnos[0].mensajes).toEqual(['hola', 'listo'])
  })
})

describe('qwen', () => {
  const a = ADAPTADORES.qwen
  it('argv por su modo OpenAI-compatible', () => {
    expect(a.lanzar({ encargo: 'hola', modelo: 'qwen/qwen3-coder', cwd: '/tmp/x', permisos: 'bypass' }))
      .toEqual(['--auth-type', 'openai', '-p', 'hola', '-o', 'stream-json', '-m', 'qwen/qwen3-coder', '--yolo'])
    expect(a.entorno?.OPENAI_BASE_URL.valor).toBe('https://openrouter.ai/api/v1')
  })
  it('lee la muestra real (mismo dialecto que claude)', () => {
    const b = leer('qwen', turno('qwen-lanzar'), turno('qwen-reanudar'))
    expect(b.sesion).toBe('bbbbbaaa-abbb-baaa-abaa-aabbaabbbaab')
    expect(respuestaDe(b.turnos[1])).toBe('hola uno')
    expect(b.turnos[0].tokens).toBe(46860)
    expect(leer('qwen', turno('qwen-herramienta')).turnos[0].herramientas).toEqual(['write_file'])
  })
})

describe('bitácora', () => {
  it('un turno sin marca de salida sigue abierto (o lo mataron)', () => {
    const b = leerBitacora(`{"arbrain":"inicio","en":5,"texto":"x"}\n${muestra('claude-lanzar')}`, ADAPTADORES.claude)
    expect(b.turnos[0].salida).toBeUndefined()
    expect(b.turnos[0].texto).toBe('x')
  })
})

describe('entrada en vivo (ajuste de Levy, 6 oct): muestras reales del pastor', () => {
  const crudo = (n: string) => muestra(n) // ya traen sus marcas de inicio/entrada/detener/salida
  it('claude: stdin stream-json y un mensaje a mitad del paso entra al mismo turno', () => {
    expect(ADAPTADORES.claude.vivo!.argv({ sesion: 'u-1', reanudar: false, modelo: 'claude-sonnet-5-5', permisos: 'bypass', cwd: '/tmp/x' }))
      .toEqual(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--replay-user-messages', '--session-id', 'u-1', '--model', 'claude-sonnet-5-5', '--permission-mode', 'bypassPermissions'])
    expect(ADAPTADORES.claude.vivo!.argv({ sesion: 'u-1', reanudar: true, modelo: null, permisos: 'bypass', cwd: '/tmp/x' })).toContain('--resume')
    const b = leerBitacora(crudo('claude-vivo'), ADAPTADORES.claude)
    expect(b.turnos).toHaveLength(1)
    expect(b.turnos[0].entradas).toEqual(['Mensaje a mitad del paso: después de UNO escribe también DOS.'])
    expect(Object.values(b.acuses)).toEqual([true])
    expect(respuestaDe(b.turnos[0])).toBe('UNO\nDOS')
    expect(b.turnos[0]).toMatchObject({ herramientas: ['Bash'], salida: { codigo: 0 } })
  })
  it('codex: app-server con turn/steer; sesión, respuesta, herramienta y tokens', () => {
    expect(ADAPTADORES.codex.vivo!.protocolo).toBe('codex-appserver')
    expect(ADAPTADORES.codex.vivo!.rpc!({ reanudar: false, modelo: 'gpt-5.5', permisos: 'bypass', cwd: '/tmp/x' }).hiloParams)
      .toEqual({ cwd: '/tmp/x', approvalPolicy: 'never', sandbox: 'danger-full-access', model: 'gpt-5.5' })
    const b = leerBitacora(crudo('codex-appserver-vivo'), ADAPTADORES.codex)
    expect(b.sesion).toMatch(/^[0-9a-f-]{36}$/)
    expect(b.turnos[0].entradas).toHaveLength(1)
    expect(respuestaDe(b.turnos[0])).toBe('UNO DOS')
    expect(b.turnos[0].herramientas).toEqual(['Bash'])
    expect(b.turnos[0].tokens).toBeGreaterThan(17_000)
    expect(b.turnos[0].error).toBeUndefined()
  })
  it('codex: detener deja el turno interrumpido sin error y la reanudación responde', () => {
    const b = leerBitacora(crudo('codex-appserver-detener'), ADAPTADORES.codex)
    expect(b.turnos).toHaveLength(2)
    expect(b.turnos[0]).toMatchObject({ detenido: true, salida: { detenido: true } })
    expect(b.turnos[0].error).toBeUndefined()
    expect(respuestaDe(b.turnos[1])).toBe('python3 -c "import time; time.sleep(90)"')
  })
})
