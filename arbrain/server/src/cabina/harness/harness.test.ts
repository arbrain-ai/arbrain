import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADAPTADORES, adaptador, coherencia, leerBitacora, respuestaDe, tokensDe } from './index.js'
import { mismoModelo } from './coherencia.js'
import { esfuerzoSiguiente } from './tipos.js'

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
  it('esfuerzo viaja como --effort en lanzar, reanudar y vivo (29 oct 2026)', () => {
    expect(a.lanzar({ encargo: 'hola', modelo: 'claude-opus-5-5', esfuerzo: 'max', cwd: '/tmp/x', permisos: 'bypass', sesion: 'u-1' }))
      .toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--session-id', 'u-1', '--model', 'claude-opus-5-5', '--effort', 'max', '--permission-mode', 'bypassPermissions', 'hola'])
    expect(a.reanudar({ sesion: 'u-1', texto: 'y?', modelo: null, esfuerzo: 'high', cwd: '/tmp/x', permisos: 'bypass' }))
      .toContain('--effort')
    expect(a.vivo!.argv({ reanudar: false, modelo: null, esfuerzo: 'xhigh', permisos: 'bypass', cwd: '/tmp/x' }).join(' ')).toContain('--effort xhigh')
    expect(a.lanzar({ encargo: 'hola', modelo: null, cwd: '/tmp/x', permisos: 'bypass' })).not.toContain('--effort')
    expect(a.modeloDefault(() => undefined)).toBe('claude-opus-5-5')
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
    // el último paso guarda lo que tocó, para decirlo en humano en el tablero
    expect(leer('claude', turno('claude-herramienta')).turnos[0].paso).toEqual({ herramienta: 'Write', detalle: '/private/tmp/dsp-muestras/nota.txt' })
    expect(leer('claude', turno('claude-error', 1)).turnos[0].error).toMatch(/issue with the selected model/)
  })
})

describe('codex', () => {
  const a = ADAPTADORES.codex
  it('esfuerzo como model_reasoning_effort, tal cual llega (el catálogo ya decidió); el respaldo baja max a xhigh', () => {
    expect(a.lanzar({ encargo: 'x', modelo: null, esfuerzo: 'max', cwd: '/tmp/x', permisos: 'bypass' }).join(' ')).toContain('model_reasoning_effort="max"')
    expect(a.esfuerzoCli!('max')).toBe('xhigh')
    expect(a.esfuerzoCli!('high')).toBe('high')
  })
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

/*
 * Coherencia (29 oct 2026, brecha 1 del benchmark de orquestación): lo que se pide, lo que viaja al CLI y lo que el CLI
 * dice que corre. Antes, codex en vivo (el default) perdía el esfuerzo sin aviso y el Taller pintaba lo pedido.
 */
describe('coherencia: pedido = RPC = leído', () => {
  /** La muestra real con la marca de inicio que hoy escribe lanzarTurno (modelo y esfuerzo pedidos). */
  const conPedido = (n: string, pedido: { modelo: string | null; esfuerzo: string | null }) => {
    const m = muestra(n), marca = `"modelo": ${JSON.stringify(pedido.modelo)}, "esfuerzo": ${JSON.stringify(pedido.esfuerzo)}`
    // las muestras del pastor ya traen su marca de inicio; las de un solo turno son stdout crudo
    return m.startsWith('{"arbrain": "inicio",') ? m.replace(/^\{"arbrain": "inicio",/, `{"arbrain": "inicio", ${marca},`) : `{"arbrain": "inicio", "en": 1, "texto": "encargo", ${marca}}\n${m}`
  }

  it('codex en vivo manda el esfuerzo al hilo (config, para que lo reporte) y al turno (turn/start.effort)', () => {
    const rpc = ADAPTADORES.codex.vivo!.rpc!({ reanudar: false, modelo: 'gpt-5.5', esfuerzo: 'medium', permisos: 'bypass', cwd: '/tmp/x' })
    expect(rpc.hiloParams).toEqual({ cwd: '/tmp/x', approvalPolicy: 'never', sandbox: 'danger-full-access', model: 'gpt-5.5', config: { model_reasoning_effort: 'medium' } })
    expect(rpc.turno).toEqual({ effort: 'medium' })
    // el valor llega ya resuelto contra el catálogo: max viaja como max al hilo y al turno
    const max = ADAPTADORES.codex.vivo!.rpc!({ reanudar: true, modelo: null, esfuerzo: 'max', permisos: 'auto', cwd: '/tmp/x' })
    expect(max.turno).toEqual({ effort: 'max' })
    expect(max.hiloParams.config).toEqual({ model_reasoning_effort: 'max' })
    // sin esfuerzo pedido no se inventa uno
    expect(ADAPTADORES.codex.vivo!.rpc!({ reanudar: false, modelo: null, permisos: 'bypass', cwd: '/tmp/x' }).turno).toBeUndefined()
  })

  it('muestra codex-appserver-vivo: pedido medium = RPC medium = thread/started medium', () => {
    const pedido = { modelo: 'gpt-5.5', esfuerzo: 'medium' }
    const rpc = ADAPTADORES.codex.vivo!.rpc!({ reanudar: false, ...pedido, permisos: 'bypass', cwd: '/tmp/x' })
    const b = leerBitacora(conPedido('codex-appserver-vivo', pedido), ADAPTADORES.codex)
    const t = b.turnos[0]
    expect(t.pedido).toEqual(pedido)
    expect(t.efectivo).toEqual({ modelo: 'gpt-5.5', esfuerzo: 'medium' })
    expect(rpc.turno!.effort).toBe(t.pedido!.esfuerzo)
    expect(t.efectivo!.esfuerzo).toBe(rpc.turno!.effort)
    expect(coherencia(t.pedido!, t.efectivo)).toMatchObject({ desajuste: null, esfuerzo: { estado: 'coincide' }, modelo: { estado: 'coincide' } })
  })

  it('el bug de antes se ve en ámbar: pedir max y que el CLI reporte medium', () => {
    const b = leerBitacora(conPedido('codex-appserver-vivo', { modelo: null, esfuerzo: 'max' }), ADAPTADORES.codex)
    const c = coherencia(b.turnos[0].pedido!, b.turnos[0].efectivo)
    expect(c.desajuste).toBe('pediste max · corre medium')
    expect(c.modelo.estado).toBe('default')
  })

  it('el pastor anota lo que responde thread/resume (que no emite thread/started)', () => {
    const b = leerBitacora('{"arbrain":"inicio","en":1,"texto":"y?","modelo":null,"esfuerzo":"low"}\n{"arbrain":"sesion","id":"th-1","modelo":"gpt-5.6-luna","esfuerzo":"low"}\n', ADAPTADORES.codex)
    expect(b.turnos[0].efectivo).toEqual({ modelo: 'gpt-5.6-luna', esfuerzo: 'low' })
  })

  it('claude: el modelo sale de system/init; el esfuerzo no lo reporta y queda «sin medir»', () => {
    const b = leerBitacora(conPedido('claude-reanudar', { modelo: 'claude-opus-5-5', esfuerzo: 'max' }), ADAPTADORES.claude)
    expect(b.turnos[0].efectivo).toEqual({ modelo: 'claude-opus-5-5' })
    const c = coherencia(b.turnos[0].pedido!, b.turnos[0].efectivo)
    expect(c).toMatchObject({ desajuste: null, modelo: { estado: 'coincide' }, esfuerzo: { estado: 'sin-medir', pedido: 'max', efectivo: null } })
    // pedir Opus y que arranque Sonnet sí es desajuste
    const otra = leerBitacora(conPedido('claude-lanzar', { modelo: 'claude-opus-5-5', esfuerzo: null }), ADAPTADORES.claude)
    expect(coherencia(otra.turnos[0].pedido!, otra.turnos[0].efectivo).desajuste).toBe('pediste el modelo claude-opus-5-5 · corre claude-sonnet-5-5')
  })

  it('bitácoras viejas (sin pedido en la marca) no inventan un pedido', () => {
    expect(leer('claude', turno('claude-lanzar')).turnos[0].pedido).toBeUndefined()
  })

  it('mismoModelo: alias de familia y calificador de contexto', () => {
    expect(mismoModelo('opus', 'claude-opus-5-5')).toBe(true)
    expect(mismoModelo('claude-fable-5-1[1m]', 'claude-fable-5-1')).toBe(true)
    expect(mismoModelo('opus', 'claude-sonnet-5-5')).toBe(false)
    expect(mismoModelo('claude-opus-5-5', 'claude-opus-5-1')).toBe(false)
  })

  it('interactivo recibe el esfuerzo (brecha 4): claude --effort, codex model_reasoning_effort', () => {
    expect(ADAPTADORES.claude.interactivo('u-1', 'claude-opus-5-5', 'high')).toEqual(expect.arrayContaining(['--effort', 'high']))
    expect(ADAPTADORES.codex.interactivo('th-1', null, 'xhigh').join(' ')).toContain('model_reasoning_effort="xhigh"')
    expect(ADAPTADORES.claude.interactivo('u-1', null)).not.toContain('--effort')
  })

  it('esfuerzoSiguiente: un nivel arriba, sin pasar el techo', () => {
    expect(esfuerzoSiguiente('medium')).toBe('high')
    expect(esfuerzoSiguiente(null)).toBe('high')
    expect(esfuerzoSiguiente('max')).toBeNull()
    expect(esfuerzoSiguiente('xhigh', 'xhigh')).toBeNull()
  })
})
