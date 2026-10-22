/**
 * «Probar conexión» de la llave del alumno (pedido de B y D; contrato §4). Un turno mínimo del SDK de Claude, sin
 * herramientas, sin MCP, sin settings del workspace y sin sesión que se guarde para el chat: valida la llave real
 * (API key de Anthropic u OpenRouter) por el mismo camino que usará el chat. Cuesta unos pocos tokens.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { estadoLlaves, MENSAJE_FALTA_LLAVE, CODIGO_FALTA_LLAVE } from './llaves.js'
import { entornoClaude } from './cofre.js'
import { esEdicionCliente } from '../edicion.js'
import { CODIGO_SIN_SALDO, esSinSaldo } from './sin-saldo.js'
import { CODIGO_SIN_SESION, MENSAJE_SIN_SESION, motorSuscripcion } from './suscripcion.js'
import { requireClaudeSubscription } from '../chat-runtime/claude-session.js'

export interface ResultadoPrueba { ok: boolean; ms: number; code?: string; error?: string; modelo?: string; proveedor?: string | null }

const resumirError = (t: string) => {
  if (/401|invalid.*(api|x-api-key|token)|authentication|unauthorized|not logged in|login/i.test(t)) return { code: 'llave_invalida', error: 'La llave no es válida o venció. Revísala en Ajustes › Llaves.' }
  // La misma regla que el chat (cliente/sin-saldo.ts), más `quota` que aquí siempre significó falta de plan.
  if (esSinSaldo(t) || /quota/i.test(t)) return { code: CODIGO_SIN_SALDO, error: 'La cuenta de esa llave no tiene saldo o plan activo.' }
  if (/rate.?limit|429|overloaded|529/i.test(t)) return { code: 'saturado', error: 'Anthropic está saturado o limitó la cuenta. Intenta en un momento.' }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed/i.test(t)) return { code: 'sin_red', error: 'No hay conexión con Anthropic. Revisa tu internet.' }
  return { code: 'error', error: t.slice(0, 300) }
}

export async function probarLlave(op: { cwd: string; timeoutMs?: number } ): Promise<ResultadoPrueba> {
  const t0 = Date.now()
  const proveedor = estadoLlaves().proveedor
  if (!proveedor) return { ok: false, ms: 0, code: CODIGO_FALTA_LLAVE, error: MENSAJE_FALTA_LLAVE, proveedor }
  const r = await probar(op, t0)
  // Motor «Mi Claude Code»: sin llave de por medio, el fallo de credencial es la sesión de la terminal.
  if (proveedor === 'suscripcion' && !r.ok && (r.code === 'llave_invalida' || r.code === 'otra_via')) {
    return { ...r, code: r.code === 'otra_via' ? 'otra_via' : CODIGO_SIN_SESION, error: r.code === 'otra_via' ? r.error : MENSAJE_SIN_SESION, proveedor }
  }
  return { ...r, proveedor }
}

async function probar(op: { cwd: string; timeoutMs?: number }, t0: number): Promise<ResultadoPrueba> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), op.timeoutMs ?? 60_000)
  try {
    let modelo: string | undefined
    let texto = ''
    const q = query({
      prompt: 'Responde exactamente: ok',
      options: {
        cwd: op.cwd, maxTurns: 1, allowedTools: [], settingSources: [], mcpServers: {}, persistSession: false,
        abortController: ac, // Una prueba falla rápido: sin reintentos del CLI ante 401/402.
        env: { ...entornoClaude(process.env, esEdicionCliente()), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_MAX_RETRIES: '0' },
      },
    })
    if (motorSuscripcion()) {
      try { requireClaudeSubscription(await q.accountInfo()) } catch {
        ac.abort()
        return { ok: false, ms: Date.now() - t0, code: 'otra_via', error: 'Tu Claude Code no está usando tu cuenta de Claude (usa una llave de API u otro proveedor). En la terminal escribe `claude auth login`, entra con tu cuenta Pro o Max y vuelve.' }
      }
    }
    for await (const m of q as AsyncIterable<Record<string, unknown>>) {
      if (m.type === 'system' && m.subtype === 'init' && typeof m.model === 'string') modelo = m.model
      if (m.type === 'result') {
        if (m.subtype === 'success' && m.is_error !== true) texto = String(m.result ?? '')
        else return { ok: false, ms: Date.now() - t0, ...resumirError(String(m.result ?? (m as { errors?: unknown }).errors ?? m.subtype)), ...(modelo ? { modelo } : {}) }
      }
    }
    return texto ? { ok: true, ms: Date.now() - t0, ...(modelo ? { modelo } : {}) } : { ok: false, ms: Date.now() - t0, code: 'sin_respuesta', error: 'Claude no respondió.' }
  } catch (e) {
    if (ac.signal.aborted) return { ok: false, ms: Date.now() - t0, code: 'tiempo', error: 'La prueba tardó demasiado.' }
    return { ok: false, ms: Date.now() - t0, ...resumirError(e instanceof Error ? e.message : String(e)) }
  } finally { clearTimeout(timer) }
}
