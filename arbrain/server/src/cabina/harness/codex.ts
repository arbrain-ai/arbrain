/**
 * Codex sin pantalla: `codex exec --json` (verificado contra codex-cli 0.154.0, 6 oct 2026; el app-server, contra 0.153.2 el 29 oct). La sesión nace con
 * el evento `thread.started` y se reanuda con `codex exec resume <id>`. `--skip-git-repo-check` porque un
 * subagente puede trabajar en /tmp, fuera de un repo. Los `item.completed` de tipo `error` son avisos de
 * configuración (service tier, metadata), no fallas: el error real llega como `error`/`turn.failed`.
 */
import { json, modeloSimple, num, obj, str, type Adaptador, type Evento, type Permisos, type PerfilTurno } from './tipos.js'
import { PERFILES } from '../perfiles.js'
import { posicional } from './claude.js'
import { esEdicionCliente } from '../../edicion.js'

const permisos = (p: Permisos) => p === 'bypass' ? ['--dangerously-bypass-approvals-and-sandbox'] : ['-c', 'sandbox_mode="workspace-write"']
/**
 * Perfil y guardia (29 oct 2026, verificado con codex-cli 0.153.2): un gancho PreToolUse dado por `-c hooks.PreToolUse`
 * solo corre si se confía en él, y `codex exec --dangerously-bypass-hook-trust` lo confía para ESTA invocación (en bypass
 * bloqueó un `echo > archivo`; el app-server no tiene esa bandera y lo ignora). Lectura, además, sin bypass: sandbox
 * workspace-write sin red (no hay push posible aunque la guardia faltara).
 */
const toml = (s: string) => JSON.stringify(s)
export const ganchoCodex = (p: PerfilTurno) => p.guardia
  ? ['--dangerously-bypass-hook-trust', '-c', `hooks.PreToolUse=[{matcher="*",hooks=[{type="command",command=${toml(p.guardia)},timeout=30}]}]`]
  : []
const permisosPerfil = (p: PerfilTurno & { permisos: Permisos }) => p.perfil === 'lectura'
  ? ['-s', 'workspace-write', '-c', 'approval_policy="never"', ...ganchoCodex(p)]
  : [...permisos(p.permisos), ...ganchoCodex(p)]
const modelo = (m: string | null) => m ? ['-m', m] : []
/** Respaldo cuando el catálogo vivo no dice qué acepta el modelo: codex baja `max` a su techo clásico, xhigh. Con catálogo,
 *  `catalogo-delegar.ts` decide (si el modelo acepta max, va max) y el adaptador recibe el valor final tal cual. */
export const esfuerzoCodex = (e: string) => e === 'max' ? 'xhigh' : e
const esfuerzo = (e?: string | null) => e ? ['-c', `model_reasoning_effort="${e}"`] : []

/** Comando o primer archivo tocado de un item de Codex, para el «último paso en humano» del tablero. */
function detalleCodex(it: Record<string, unknown>): { detalle?: string } {
  const cambios = Array.isArray(it.changes) ? it.changes.map(obj) : []
  const d = str(it.command) ?? str(cambios[0]?.path) ?? str(it.query)
  return d ? { detalle: d.slice(0, 300) } : {}
}

/** El error de la API llega como JSON dentro de `message`: se saca la frase legible. */
export function mensajeDeError(v: unknown): string {
  const m = str(v) ?? ''
  try { const d = JSON.parse(m); return str(obj(obj(d).error).message) ?? str(obj(d).message) ?? m } catch { return m }
}

const HERRAMIENTA: Record<string, string> = { command_execution: 'Bash', file_change: 'Edit', web_search: 'WebSearch', todo_list: 'TodoWrite' }
const HERRAMIENTA_RPC: Record<string, string> = { commandExecution: 'Bash', fileChange: 'Edit', webSearch: 'WebSearch' }

/** Notificaciones de `codex app-server` (JSON-RPC) que deja el pastor en la bitácora (entrada en vivo). */
function leerRpc(d: Record<string, unknown>): Evento | null {
  const p = obj(d.params)
  switch (d.method) {
    // el hilo dice con qué modelo y esfuerzo nace (lo que de verdad corre; la sonda del 29 oct lo confirmó con config)
    case 'thread/started': {
      const t = obj(p.thread), s = str(t.id)
      if (!s) return null
      const modelo = str(t.model), esfuerzo = str(t.reasoningEffort)
      return { sesion: s, ...(modelo ? { modelo } : {}), ...(esfuerzo ? { esfuerzo } : {}) }
    }
    case 'item/completed': {
      const it = obj(p.item)
      if (it.type === 'agentMessage') { const t = str(it.text)?.trim(); return t ? { texto: t } : null }
      if (it.type === 'mcpToolCall') return { herramienta: str(it.tool) ?? 'mcp' }
      const h = HERRAMIENTA_RPC[String(it.type)]
      return h ? { herramienta: h, ...detalleCodex(it) } : null
    }
    case 'turn/completed': {
      const t = obj(p.turn)
      return t.status === 'failed' ? { fin: true, error: str(obj(t.error).message) ?? 'el turno falló' } : { fin: true }
    }
    case 'error': return p.willRetry === true ? null : { error: str(obj(p.error).message) ?? 'error' }
    // cada actualización trae `last` = la última llamada al modelo: sumarlas da el gasto sin contar doble
    case 'thread/tokenUsage/updated': { const n = num(obj(obj(p.tokenUsage).last).totalTokens); return n ? { tokens: n } : null }
    default: return null
  }
}

export const codex: Adaptador = {
  nombre: 'codex',
  binario: 'codex',
  // null = el modelo de ~/.codex/config.toml. CABINA_MODELO_CODEX lo fija sin tocar código.
  modeloDefault: env => env('CABINA_MODELO_CODEX') || null,
  modeloOk: modeloSimple,
  recibeEsfuerzo: true,
  esfuerzoCli: esfuerzoCodex,
  cuentaCatalogo: 'codex',
  sesionPropia: false,
  perfiles: PERFILES,
  guardia: true,
  guardiaEnVivo: false,
  lanzar: p => ['exec', '--json', '--skip-git-repo-check', ...modelo(p.modelo), ...esfuerzo(p.esfuerzo), ...permisosPerfil(p), posicional(p.encargo)],
  reanudar: p => ['exec', 'resume', '--json', '--skip-git-repo-check', ...modelo(p.modelo), ...esfuerzo(p.esfuerzo), ...permisosPerfil(p), p.sesion, posicional(p.texto)],
  leerEvento: l => {
    const d = json(l)
    if (!d) return null
    if (typeof d.method === 'string') return leerRpc(d)
    if (d.type === 'thread.started') { const s = str(d.thread_id); return s ? { sesion: s } : null }
    if (d.type === 'item.completed') {
      const it = obj(d.item)
      if (it.type === 'agent_message') { const t = str(it.text)?.trim(); return t ? { texto: t } : null }
      if (it.type === 'mcp_tool_call') return { herramienta: str(it.tool) ?? 'mcp' }
      const h = HERRAMIENTA[String(it.type)]
      return h ? { herramienta: h, ...detalleCodex(it) } : null
    }
    if (d.type === 'error') return { error: mensajeDeError(d.message) }
    if (d.type === 'turn.failed') return { fin: true, error: mensajeDeError(obj(d.error).message) }
    if (d.type === 'turn.completed') { const u = obj(d.usage); return { fin: true, tokens: num(u.input_tokens) + num(u.output_tokens) } }
    return null
  },
  // `codex app-server` (experimental, JSON-RPC): turn/steer mete un mensaje en el turno en curso y turn/interrupt lo
  // corta; probado el 6 oct en /tmp. CABINA_ENTRADA_VIVA=0 vuelve a `codex exec` (encola y entrega al salir).
  // Esfuerzo (29 oct 2026, antes se perdía sin aviso): va en `config` del hilo, para que thread/started y la respuesta de
  // thread/resume lo REPORTEN (sonda con codex-cli 0.153.2: config xhigh → reasoningEffort xhigh), y en `turn/start`
  // (TurnStartParams.effort: «Override the reasoning effort for this turn and subsequent turns»).
  vivo: {
    protocolo: 'codex-appserver',
    argv: () => ['app-server'],
    rpc: p => {
      const e = p.esfuerzo || null
      return {
        hiloParams: { cwd: p.cwd, approvalPolicy: 'never', sandbox: p.permisos === 'bypass' ? 'danger-full-access' : 'workspace-write', ...(p.modelo ? { model: p.modelo } : {}), ...(e ? { config: { model_reasoning_effort: e } } : {}) },
        ...(e ? { turno: { effort: e } } : {}),
      }
    },
  },
  interactivo: (s, m, e) => ['resume', s, ...modelo(m), ...esfuerzo(e), ...(esEdicionCliente() ? ['-c', 'sandbox_mode="workspace-write"'] : ['--dangerously-bypass-approvals-and-sandbox'])],
}
