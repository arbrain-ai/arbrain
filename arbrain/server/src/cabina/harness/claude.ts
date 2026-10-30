/**
 * Claude Code sin pantalla: `claude -p --output-format stream-json --verbose` (verificado contra 2.1.285, 6 oct 2026).
 * La sesión la fija Levy con `--session-id` y se reanuda con `--resume <uuid>` (misma sesión, mismo archivo).
 */
import { json, modeloSimple, num, obj, str, type Adaptador, type Evento, type Permisos, type PerfilTurno } from './tipos.js'
import { PERFILES } from '../perfiles.js'
import { esEdicionCliente } from '../../edicion.js'

const permisos = (p: Permisos) => ['--permission-mode', p === 'bypass' ? 'bypassPermissions' : p]
const modelo = (m: string | null) => m ? ['--model', m] : []
/** `--effort` por sesión (29 oct 2026: Daniel pidió esfuerzo muy alto para un subagente y delegar no lo pasaba). */
const esfuerzo = (e?: string | null) => e ? ['--effort', e] : []
/** La guardia de perfil como gancho PreToolUse (29 oct 2026). Los ganchos corren en cualquier modo de permisos, también en
 *  bypassPermissions: la lista negra le gana al bypass sin agregar ninguna pregunta. */
export const ganchoClaude = (p: PerfilTurno) => p.guardia
  ? ['--settings', JSON.stringify({ hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: p.guardia, timeout: 30 }] }] } })]
  : []
/** Un prompt que empieza con «-» se leería como opción. */
export const posicional = (t: string) => t.startsWith('-') ? ` ${t}` : t

/** stream-json del SDK de Claude Code; qwen-code habla el mismo dialecto. */
export function leerEstiloClaude(linea: string, tokensDe: (usage: Record<string, unknown>) => number): Evento | null {
  const d = json(linea)
  if (!d) return null
  const sesion = str(d.session_id)
  // init trae el modelo que corre (no el esfuerzo: 2.1.285 solo dice `per_turn_effort_active`)
  if (d.type === 'system') { if (d.subtype !== 'init' || !sesion) return null; const modelo = str(d.model); return modelo ? { sesion, modelo } : { sesion } }
  if (d.type === 'assistant') {
    const m = obj(d.message)
    const bloques = Array.isArray(m.content) ? m.content.map(obj) : []
    const texto = bloques.filter(b => b.type === 'text').map(b => str(b.text) ?? '').join('\n').trim()
    const herramienta = bloques.find(b => b.type === 'tool_use')
    const e: Evento = {}
    if (texto) e.texto = texto
    if (herramienta) {
      e.herramienta = str(herramienta.name) ?? 'herramienta'
      const i = obj(herramienta.input)
      const detalle = str(i.command) ?? str(i.file_path) ?? str(i.notebook_path) ?? str(i.path) ?? str(i.pattern) ?? str(i.url) ?? str(i.query)
      if (detalle) e.detalle = detalle.slice(0, 300)
    }
    // claude marca con `error` el mensaje sintético de un fallo (modelo inexistente, límite, API)
    if (typeof d.error === 'string' && d.error) e.error = texto || d.error
    return Object.keys(e).length ? e : null
  }
  if (d.type === 'result') {
    const e: Evento = { fin: true, tokens: tokensDe(obj(d.usage)) }
    if (sesion) e.sesion = sesion
    const final = str(d.result)
    if (final) e.final = final
    if (d.is_error === true || (d.subtype && d.subtype !== 'success')) {
      const errores = Array.isArray(d.errors) ? d.errors.map(x => typeof x === 'string' ? x : str(obj(x).message) ?? '').filter(Boolean).join(' · ') : ''
      e.error = final || errores || str(obj(d.error).message) || String(d.subtype ?? 'error')
    }
    return e
  }
  return null
}

export const claude: Adaptador = {
  nombre: 'claude',
  binario: 'claude',
  // Subagentes sueltos corren en Opus 5.5 (Daniel, 13 oct: «prefiero usar opus 5.5»; antes Sonnet 5.5).
  modeloDefault: env => env('CABINA_MODELO_CLAUDE') || 'claude-opus-5-5',
  modeloOk: modeloSimple,
  recibeEsfuerzo: true,
  cuentaCatalogo: 'default',
  // Cuenta del CLI de los subagentes: sin la variable, ~/.claude. Con CLAUDECLAW_DEFAULT_ACCOUNT=bro el .env la
  // apunta a la carpeta de bro (29 oct 2026: la cuenta de Daniel llegó al límite semanal y los subagentes seguían ahí).
  entorno: { CLAUDE_CONFIG_DIR: { fuentes: ['CABINA_CLAUDE_CONFIG_DIR'] } },
  sesionPropia: true,
  perfiles: PERFILES,
  guardia: true,
  guardiaEnVivo: true,
  lanzar: p => ['-p', '--output-format', 'stream-json', '--verbose', ...(p.sesion ? ['--session-id', p.sesion] : []), ...modelo(p.modelo), ...esfuerzo(p.esfuerzo), ...permisos(p.permisos), ...ganchoClaude(p), posicional(p.encargo)],
  reanudar: p => ['-p', '--output-format', 'stream-json', '--verbose', '--resume', p.sesion, ...modelo(p.modelo), ...esfuerzo(p.esfuerzo), ...permisos(p.permisos), ...ganchoClaude(p), posicional(p.texto)],
  leerEvento: l => leerEstiloClaude(l, u => num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.output_tokens)),
  // stdin abierto (lo sostiene el pastor): mensajes a mitad del paso y `control_request` interrupt para detener.
  vivo: {
    protocolo: 'claude-stream',
    argv: p => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--replay-user-messages',
      ...(p.sesion ? (p.reanudar ? ['--resume', p.sesion] : ['--session-id', p.sesion]) : []), ...modelo(p.modelo), ...esfuerzo(p.esfuerzo), ...permisos(p.permisos), ...ganchoClaude(p)],
  },
  // Edición cliente (AUDITORIA I4): la sesión que la persona retoma no nace en bypass.
  interactivo: (s, m, e) => ['--resume', s, ...modelo(m), ...esfuerzo(e), '--permission-mode', esEdicionCliente() ? 'auto' : 'bypassPermissions'],
}
