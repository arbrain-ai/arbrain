/**
 * Decisor `claude`: Claude por el Agent SDK con la suscripción del host.
 *
 * Sin herramientas, sin settings ni hooks del repo (mismo aislamiento que
 * Consejo). Cada decisión usa una sesión nueva (sin historial: el costo no
 * crece con las decisiones previas) y la siguiente se precalienta en segundo
 * plano para no pagar el arranque del proceso en cada paso.
 *
 * Responde con un id del catálogo; cualquier otra cosa es fallo, no se adivina.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query, type SDKUserMessage, type Query } from '@anthropic-ai/claude-agent-sdk'
import type { Decision, Decisor, PedidoDecidir } from '../contrato.js'

/** Estándar de modelos de Daniel (2 oct, 17:23): Sonnet 5.5 por defecto; Opus 5.5 al escalar. */
export const MODELO_CLAUDE_RAPIDO = 'claude-sonnet-5-5'

const SISTEMA = 'Eres el decisor de un agente que opera una Mac. Recibes un estado y un catálogo cerrado de opciones. Respondes SOLO con el id exacto de una opción, sin comillas ni explicación.'

function entornoAislado(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const k of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'USER', 'LOGNAME']) if (process.env[k]) env[k] = process.env[k]
  return { ...env, CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
}

/** Una sesión de un solo uso: el proceso arranca ya y espera su única pregunta. */
interface Sesion { q: Query; preguntar: (texto: string) => void; eventos: AsyncIterator<any> }

export class DecisorClaude implements Decisor {
  readonly nombre: string
  /** Sesión precalentada para la siguiente decisión: cada decisión ve solo su estado, sin historial. */
  private siguiente: Sesion | null = null

  constructor(readonly modelo = process.env.MANOS_CLAUDE_MODELO || MODELO_CLAUDE_RAPIDO) {
    this.nombre = `claude:${modelo}`
  }

  private abrir(): Sesion {
    let preguntar!: (texto: string) => void
    const pregunta = new Promise<string>(r => { preguntar = r })
    async function* entrada(): AsyncGenerator<SDKUserMessage> {
      yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: await pregunta } } as SDKUserMessage
    }
    const q = query({
      prompt: entrada(),
      options: {
        cwd: mkdtempSync(join(tmpdir(), 'manos-decisor-')), model: this.modelo, env: entornoAislado(),
        tools: [], settingSources: [], mcpServers: {}, strictMcpConfig: true, hooks: {}, plugins: [],
        persistSession: false, permissionMode: 'default',
        canUseTool: async () => ({ behavior: 'deny', message: 'El decisor no ejecuta herramientas.' }),
        settings: { disableAllHooks: true, autoMemoryEnabled: false },
        systemPrompt: SISTEMA,
      } as any,
    })
    return { q, preguntar, eventos: q[Symbol.asyncIterator]() }
  }

  /** Deja una sesión arrancando antes de la primera decisión (la tarea no paga el arranque). */
  async calentar(): Promise<void> {
    await this.decidir({ pregunta: 'Responde listo.', estado: {}, opciones: { listo: 'listo' } })
  }

  async decidir(p: PedidoDecidir): Promise<Decision> {
    const s = this.siguiente ?? this.abrir()
    this.siguiente = this.abrir() // la próxima arranca mientras esta decide
    const ids = Object.keys(p.opciones)
    const texto = `${p.pregunta}\n\nESTADO:\n${typeof p.estado === 'string' ? p.estado : JSON.stringify(p.estado)}\n\nOPCIONES (responde solo el id):\n${ids.map(id => `- ${id}: ${p.opciones[id]}`).join('\n')}`
    const t0 = performance.now()
    s.preguntar(texto)
    try {
      for (;;) {
        const { value: e, done } = await s.eventos.next()
        if (done) throw new Error('la sesión de Claude terminó sin resultado')
        if (e.type !== 'result') continue
        const ms = performance.now() - t0
        if (e.subtype !== 'success') throw new Error(`Claude: ${e.subtype}`)
        const crudo = String(e.result ?? '').trim().replace(/^[`"'«]+|[`"'».]+$/g, '')
        const eleccion = ids.find(id => id === crudo) ?? ids.find(id => crudo.split(/\s+/).includes(id))
        if (!eleccion) throw new Error(`Claude respondió fuera del catálogo: «${crudo.slice(0, 80)}»`)
        const u = e.usage ?? {}
        const tokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        return { eleccion, confianza: null, decisor: this.nombre, ms, costo_usd: Number(e.total_cost_usd ?? 0), tokens_entrada: tokens }
      }
    } finally {
      s.q.close()
    }
  }

  async cerrar(): Promise<void> { this.siguiente?.q.close(); this.siguiente = null }
}
