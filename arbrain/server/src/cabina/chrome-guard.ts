/**
 * Guardián de claude-in-chrome para los turnos del chat (firmado por Daniel el 1 oct 2026).
 *
 * Levy corre con bypassPermissions, así que canUseTool no se llama; los hooks
 * PreToolUse sí. Este módulo decide, por herramienta, si la acción pasa o se
 * detiene hasta que Daniel diga «sí» en el chat:
 * - Leer y navegar pasan siempre (y quedan en la bitácora).
 * - Actuar (clic, teclear, formularios, JS, subir archivos) en un sitio sensible
 *   se detiene. Sensibles: bancos, pagos y cobros, correo, DNS y dominios,
 *   consolas de bases.
 * - Borrar cosas se detiene en cualquier sitio.
 * El «sí» lo registra el servidor con el mensaje de Daniel, nunca Levy: vale
 * para ese sitio en esa conversación por PERMISO_MS.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { HookCallbackMatcher, HookInput, SyncHookJSONOutput } from '@anthropic-ai/claude-agent-sdk'

export const CHROME_PREFIX = 'mcp__claude-in-chrome__'
export const PERMISO_MS = 10 * 60_000
export const PENDIENTE_MS = 30 * 60_000

type Regla = { sitio: string; tipo: string; host: RegExp }
const SENSIBLES: Regla[] = [
  // Pagos y cobros
  { sitio: 'Polar', tipo: 'cobros', host: /(^|\.)polar\.sh$/ },
  { sitio: 'Stripe', tipo: 'cobros', host: /(^|\.)stripe\.com$/ },
  { sitio: 'Whop', tipo: 'cobros', host: /(^|\.)whop\.com$/ },
  { sitio: 'PayPal', tipo: 'pagos', host: /(^|\.)paypal\.(com|me)$/ },
  { sitio: 'Mercado Pago', tipo: 'pagos', host: /(^|\.)mercadopago\.com(\.mx)?$/ },
  { sitio: 'Wise', tipo: 'pagos', host: /(^|\.)wise\.com$/ },
  { sitio: 'Revolut', tipo: 'pagos', host: /(^|\.)revolut\.com$/ },
  { sitio: 'Gumroad', tipo: 'cobros', host: /(^|\.)gumroad\.com$/ },
  { sitio: 'Lemon Squeezy', tipo: 'cobros', host: /(^|\.)lemonsqueezy\.com$/ },
  // Bancos (México y globales frecuentes)
  { sitio: 'banco', tipo: 'banco', host: /(^|\.)(bbva\.(mx|com)|banorte\.com|santander\.com(\.mx)?|banamex\.com|citibanamex\.com|hsbc\.com(\.mx)?|scotiabank\.com(\.mx)?|nu\.com\.mx|inbursa\.com|banregio\.com|bancoazteca\.com(\.mx)?|heybanco\.com|klar\.mx|bancoppel\.com|afirme\.com|banbajio\.com|chase\.com|bankofamerica\.com|wellsfargo\.com|americanexpress\.com|citi\.com|capitalone\.com)$/ },
  // Correo (enviar correo)
  { sitio: 'Gmail', tipo: 'correo', host: /^mail\.google\.com$/ },
  { sitio: 'Outlook', tipo: 'correo', host: /^(outlook\.(live|office|office365)\.com)$/ },
  { sitio: 'correo', tipo: 'correo', host: /(^|\.)(mail\.yahoo\.com|proton\.me|mail\.proton\.me|fastmail\.com|icloud\.com|hey\.com)$/ },
  // DNS y dominios
  { sitio: 'Cloudflare', tipo: 'DNS y dominios', host: /(^|\.)cloudflare\.com$/ },
  { sitio: 'Namecheap', tipo: 'DNS y dominios', host: /(^|\.)namecheap\.com$/ },
  { sitio: 'dominios', tipo: 'DNS y dominios', host: /(^|\.)(godaddy\.com|porkbun\.com|domains\.google|squarespace\.com|hostinger\.(com|mx)|route53\.aws\.amazon\.com)$/ },
  // Consolas de bases y nubes con datos de producción
  { sitio: 'Supabase', tipo: 'consola de base', host: /(^|\.)supabase\.(com|co)$/ },
  { sitio: 'consola de nube', tipo: 'consola de base', host: /(^|\.)(console\.aws\.amazon\.com|console\.cloud\.google\.com|neon\.tech|planetscale\.com|railway\.app|render\.com|vercel\.com)$/ },
]

/** Herramientas que solo leen, navegan o administran pestañas del grupo. */
const LECTURA = new Set([
  'tabs_context_mcp', 'tabs_create_mcp', 'tabs_close_mcp', 'navigate', 'read_page', 'get_page_text', 'find',
  'read_console_messages', 'read_network_requests', 'list_connected_browsers', 'select_browser', 'switch_browser',
  'shortcuts_list', 'resize_window', 'gif_creator',
])
const COMPUTER_LECTURA = new Set(['screenshot', 'wait', 'scroll', 'zoom', 'scroll_to', 'hover'])
const BORRAR = /\b(borr|elimin|suprim|delete|trash|papelera|destroy|purg|drop\s+(table|database|schema)|truncate|desinstal|uninstall|unsubscrib|cancela(r)?\s+(la\s+|mi\s+|tu\s+)?(suscrip|cuenta|plan)|revoca|revoke|archiv(a|ar)\s+todo)/i

export type Sensible = { sitio: string; tipo: string; host: string }
export function hostDe(url: string | undefined): string | null {
  if (!url || /^(back|forward)$/i.test(url)) return null
  try { return new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/\.$/, '') }
  catch { return null }
}
export function sitioSensible(url: string | undefined): Sensible | null {
  const host = hostDe(url)
  if (!host) return null
  const r = SENSIBLES.find(r => r.host.test(host))
  return r ? { sitio: r.sitio === 'banco' || r.sitio === 'correo' || r.sitio === 'dominios' || r.sitio === 'consola de nube' ? host : r.sitio, tipo: r.tipo, host } : null
}

type Paso = { name: string; input: Record<string, unknown> }
/** Pasos efectivos de una llamada (browser_batch se abre en sus acciones). */
export function pasos(toolName: string, input: unknown): Paso[] {
  const name = toolName.startsWith(CHROME_PREFIX) ? toolName.slice(CHROME_PREFIX.length) : toolName
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (name === 'browser_batch') {
    const actions = Array.isArray(obj.actions) ? obj.actions : []
    return actions.map(a => {
      const it = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
      return { name: String(it.name ?? '').replace(CHROME_PREFIX, ''), input: (it.input && typeof it.input === 'object' ? it.input : {}) as Record<string, unknown> }
    })
  }
  return [{ name, input: obj }]
}
export function esAccion(p: Paso): boolean {
  if (p.name === 'navigate') return /^\s*javascript:/i.test(String(p.input.url ?? ''))
  if (LECTURA.has(p.name)) return false
  if (p.name === 'computer') return !COMPUTER_LECTURA.has(String(p.input.action ?? ''))
  return true // javascript_tool, form_input, file_upload, upload_image, shortcuts_execute y lo que venga nuevo
}
/** Texto donde se declara el efecto: action_summary, texto tecleado, código, valor. */
export function pareceBorrar(p: Paso): boolean {
  const i = p.input
  const texto = [i.action_summary, p.name === 'javascript_tool' ? i.text : '', p.name === 'form_input' ? i.value : '', i.command]
    .filter(v => typeof v === 'string').join(' ')
  if (BORRAR.test(texto)) return true
  // fetch/XHR con método DELETE desde javascript_tool
  return p.name === 'javascript_tool' && /method\s*:\s*['"`]DELETE['"`]/i.test(String(i.text ?? ''))
}

// ─── Estado por conversación ─────────────────────────────────────────────────

type Estado = {
  tabs: Map<number, { url: string; fresca: boolean }>
  ultimaTab?: number
  permisos: Map<string, number> // clave de sitio → vence (ms)
  pendientes: Map<string, { motivo: string; desde: number }>
}
const estados = new Map<string, Estado>()
function estado(conversacion: string): Estado {
  let e = estados.get(conversacion)
  if (!e) { e = { tabs: new Map(), permisos: new Map(), pendientes: new Map() }; estados.set(conversacion, e) }
  return e
}
export function claveConversacion(scope: { owner: string; account: string; conversationId: string }): string {
  return JSON.stringify([scope.owner, scope.account, scope.conversationId])
}

const AFIRMATIVO = /^(s[ií]+|dale|adelante|hazlo|autorizo|confirmo|procede|va|ok(ay)?|de acuerdo|claro)(?=$|[\s,.;:!])/i
/** Mensaje de Daniel al empezar un turno. Un «sí» corto convierte lo pendiente en permiso; cualquier otra cosa lo descarta. */
export function registrarMensajeDeDaniel(conversacion: string, mensaje: string, ahora = Date.now()): string[] {
  const e = estados.get(conversacion)
  if (!e || e.pendientes.size === 0) return []
  const limpio = mensaje.trim().replace(/^[¡!¿\s«"']+/, '').toLowerCase()
  const esSi = limpio.length <= 80 && AFIRMATIVO.test(limpio) && !/\bno\b/.test(limpio)
  const concedidos: string[] = []
  for (const [clave, p] of e.pendientes) {
    if (esSi && ahora - p.desde <= PENDIENTE_MS) { e.permisos.set(clave, ahora + PERMISO_MS); concedidos.push(clave) }
  }
  e.pendientes.clear()
  return concedidos
}

/** Aprende las URL de las pestañas a partir de lo que devuelve la extensión. */
export function aprenderDeRespuesta(conversacion: string, nombre: string, entrada: Record<string, unknown>, respuesta: unknown): void {
  const e = estado(conversacion)
  const texto = typeof respuesta === 'string' ? respuesta : JSON.stringify(respuesta ?? '')
  const vistas = new Set<number>()
  // JSON: {"tabId":123,"title":"…","url":"https://…"} en cualquier orden y con escapes.
  const plano = texto.replace(/\\"/g, '"')
  for (const m of plano.matchAll(/\{[^{}]*?"tabId"\s*:\s*(\d+)[^{}]*?\}/g)) {
    const url = /"url"\s*:\s*"([^"]+)"/.exec(m[0])?.[1]
    if (url) { e.tabs.set(Number(m[1]), { url, fresca: true }); vistas.add(Number(m[1])) }
  }
  // Texto: «tabId 123 … (https://…)» o «Tab 123: … https://…»
  for (const m of plano.matchAll(/tab(?:Id)?\s*[:#]?\s*(\d+)[^\n]*?\b(https?:\/\/[^\s)"'\]]+)/gi)) {
    if (!vistas.has(Number(m[1]))) { e.tabs.set(Number(m[1]), { url: m[2], fresca: true }); vistas.add(Number(m[1])) }
  }
  const tab = typeof entrada.tabId === 'number' ? entrada.tabId : undefined
  if (tab !== undefined) e.ultimaTab = tab
  if (tab !== undefined && !vistas.has(tab) && nombre !== 'navigate') {
    // Una acción pudo cambiar de página sin decirlo: la URL deja de ser confiable.
    const t = e.tabs.get(tab)
    if (t && esAccion({ name: nombre, input: entrada })) t.fresca = false
  }
}

export type Decision = { permitir: true; sitio?: string } | { permitir: false; motivo: string; clave: string }

/** Decide un paso. No muta permisos; registra el pendiente si se detiene. */
export function decidir(conversacion: string, p: Paso, ahora = Date.now()): Decision {
  const e = estado(conversacion)
  const tab = typeof p.input.tabId === 'number' ? p.input.tabId : e.ultimaTab
  if (p.name === 'navigate') {
    const url = String(p.input.url ?? '')
    if (tab !== undefined && hostDe(url)) e.tabs.set(tab, { url, fresca: true })
    else if (tab !== undefined && e.tabs.has(tab)) e.tabs.get(tab)!.fresca = false // back/forward: destino desconocido
    if (!esAccion(p)) return { permitir: true, sitio: hostDe(url) ?? undefined }
  }
  if (!esAccion(p)) return { permitir: true, sitio: tab !== undefined ? hostDe(e.tabs.get(tab)?.url) ?? undefined : undefined }
  const conocida = tab !== undefined ? e.tabs.get(tab) : undefined
  const host = hostDe(conocida?.url)
  const sensible = sitioSensible(conocida?.url)
  const borra = pareceBorrar(p)
  const que = String(p.input.action_summary ?? (p.name === 'computer' ? p.input.action : p.name))
  if (!conocida || !conocida.fresca || !host) {
    if (!borra) {
      return { permitir: false, clave: '', motivo: `No sé con certeza en qué sitio está la pestaña ${tab ?? '(sin tabId)'} después de la última acción. Llama primero tabs_context_mcp (o navigate) para confirmar la URL y repite la acción; no es un rechazo de ${DUENO}.` }
    }
  }
  const clave = sensible ? `sitio:${sensible.sitio}` : borra ? `borrar:${host ?? 'desconocido'}` : ''
  if (!clave) return { permitir: true, sitio: host ?? undefined }
  if ((e.permisos.get(clave) ?? 0) > ahora) return { permitir: true, sitio: host ?? undefined }
  const donde = sensible ? `${sensible.sitio} (${sensible.tipo})` : (host ?? 'un sitio sin identificar')
  e.pendientes.set(clave, { motivo: que, desde: ahora })
  return {
    permitir: false, clave,
    motivo: `Detenido: «${que}» en ${donde}${borra ? ' borra algo' : ''} y necesita el sí de ${DUENO}. ` +
      `Dile en una o dos líneas qué vas a hacer y en qué sitio, y pídele que responda «sí». Termina el turno ahí. ` +
      `Cuando responda «sí», repite la acción: el permiso vale ${PERMISO_MS / 60_000} min para ${sensible ? sensible.sitio : 'borrar en ' + (host ?? 'ese sitio')} en esta conversación. ` +
      `No intentes rodearlo con otra herramienta, otro navegador ni la terminal.`,
  }
}

// ─── Bitácora ────────────────────────────────────────────────────────────────

type Registro = (evento: Record<string, unknown>) => void
let destinoBitacora: string | null = null
export function configurarBitacora(archivo: string | null): void { destinoBitacora = archivo }
function bitacoraLocal(evento: Record<string, unknown>): void {
  if (!destinoBitacora) return
  try { mkdirSync(path.dirname(destinoBitacora), { recursive: true }); appendFileSync(destinoBitacora, JSON.stringify(evento) + '\n') }
  catch { /* la bitácora nunca rompe un turno */ }
}

/** Hooks del SDK. Las funciones no entran en la firma del pool (JSON.stringify las omite). */
export function chromeHooks(conversacion: string, registrar: Registro = () => {}): { PreToolUse: HookCallbackMatcher[]; PostToolUse: HookCallbackMatcher[] } {
  const anotar = (evento: Record<string, unknown>) => { const ev = { ts: new Date().toISOString(), conversacion, ...evento }; bitacoraLocal(ev); registrar(ev) }
  return {
    PreToolUse: [{
      matcher: 'mcp__claude-in-chrome__.*',
      hooks: [async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== 'PreToolUse' || !input.tool_name.startsWith(CHROME_PREFIX)) return { continue: true }
        for (const p of pasos(input.tool_name, input.tool_input)) {
          const d = decidir(conversacion, p)
          if (!d.permitir) {
            anotar({ herramienta: p.name, accion: p.input.action ?? null, resumen: p.input.action_summary ?? null, decision: d.clave ? 'detenido' : 'sin_url', clave: d.clave || null })
            return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: d.motivo } }
          }
          if (p.name === 'navigate' || esAccion(p)) anotar({ herramienta: p.name, accion: p.input.action ?? null, resumen: p.input.action_summary ?? null, sitio: d.sitio ?? null, decision: 'permitido' })
        }
        return { continue: true }
      }],
    }],
    PostToolUse: [{
      matcher: 'mcp__claude-in-chrome__.*',
      hooks: [async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name === 'PostToolUse' && input.tool_name.startsWith(CHROME_PREFIX)) {
          for (const p of pasos(input.tool_name, input.tool_input)) aprenderDeRespuesta(conversacion, p.name, p.input, input.tool_response)
        }
        return { continue: true }
      }],
    }],
  }
}

/** Solo para pruebas. */
export function _reiniciarGuardian(): void { estados.clear() }
