/**
 * Llaves del alumno (BYOK, AUDITORIA I9; contrato en docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md › «Comandos Tauri»).
 *
 * Las llaves van directo del campo de texto al llavero del sistema por los comandos de la app (Keychain, Credential
 * Manager, Secret Service). Nunca pasan por el servidor web, ni por localStorage, ni por un archivo. De vuelta solo
 * llega si existe y una vista enmascarada. Módulo puro + puente (sin React).
 */

import { ACCION_DE_COMANDO, esModoServidor } from '@/lib/modo-servidor'

export type NombreLlave = 'ANTHROPIC_API_KEY' | 'OPENROUTER_API_KEY' | 'GROQ_API_KEY'

export interface EstadoLlaves {
  llaves: Array<{ nombre: string; presente: boolean; vista: string | null }>
  listo: boolean
  almacen: 'macos-keychain' | 'windows-credential-manager' | 'linux-secret-service' | 'no-soportado' | string
  disponible: boolean
  error: string | null
}

export interface DaemonInfo { url: string; port: number; ready: boolean; pid: number | null; reinicios: number; lastError: string | null; pausado?: boolean }

export const NOMBRE_ALMACEN: Record<string, string> = {
  'macos-keychain': 'el Llavero de macOS',
  'windows-credential-manager': 'el Administrador de credenciales de Windows',
  'linux-secret-service': 'el llavero de tu sistema (Secret Service)',
  // Modo servidor (`npm run servidor`): archivo 0600 en la carpeta de configuración, que los agentes no pueden leer.
  'archivo-local': 'un archivo privado de tu carpeta de datos de Arbrain',
}

/** Lo que el alumno pegó, limpio como lo limpia la app (espacios, saltos y comillas en los bordes). */
export function limpiarLlave(valor: string): string {
  return valor.trim().replace(/^['"`]+|['"`]+$/g, '').trim()
}

/** ¿Es un token de la suscripción de claude.ai (`claude setup-token`)? Arbrain nunca lo acepta. */
export const esTokenDeSuscripcion = (v: string) => /^sk-ant-oat/i.test(limpiarLlave(v))
export const MENSAJE_TOKEN_SUSCRIPCION = 'Ese es un token de tu suscripción de Claude y Arbrain no lo usa. Conecta OpenRouter o, en «Otras formas», elige «API key de Anthropic» (empieza con «sk-ant-api»).'

export type Veredicto = { ok: true; nombre: NombreLlave } | { ok: false; error: string }

/**
 * Validación de formato (no de vigencia: esa la da «Probar conexión»). Detecta qué pegó la persona para guardarlo en
 * su lugar aunque lo pegue en el campo equivocado.
 *  - API key de Anthropic: `sk-ant-api…`
 *  - OpenRouter: `sk-or-…`
 * Un token de la suscripción de claude.ai (`sk-ant-oat…`, de `claude setup-token`) se rechaza siempre: Arbrain no
 * pide, guarda ni usa tokens de suscripción (decisión del autor, 12 oct 2026).
 */
export function validarLlave(crudo: string, esperada: 'claude' | 'openrouter'): Veredicto {
  const v = limpiarLlave(crudo)
  if (!v) return { ok: false, error: 'Pega tu llave para continuar.' }
  if (/\s/.test(v)) return { ok: false, error: 'La llave no lleva espacios. Cópiala de nuevo, completa.' }
  if (v.length > 4096) return { ok: false, error: 'Eso es demasiado largo para ser una llave.' }
  if (esTokenDeSuscripcion(v)) return { ok: false, error: MENSAJE_TOKEN_SUSCRIPCION }
  if (esperada === 'openrouter') {
    if (/^sk-or-[A-Za-z0-9_-]{20,}$/.test(v)) return { ok: true, nombre: 'OPENROUTER_API_KEY' }
    if (v.startsWith('sk-ant-')) return { ok: false, error: 'Esa es una llave de Anthropic: en «Otras formas», elige «API key de Anthropic».' }
    return { ok: false, error: 'Las llaves de OpenRouter empiezan con «sk-or-».' }
  }
  if (/^sk-ant-(api[0-9]{0,3}-)?[A-Za-z0-9_-]{20,}$/.test(v)) return { ok: true, nombre: 'ANTHROPIC_API_KEY' }
  if (v.startsWith('sk-or-')) return { ok: false, error: 'Esa es una llave de OpenRouter: usa «Conectar con OpenRouter» o, en «Otras formas», elige «Pegar una llave de OpenRouter».' }
  if (v.startsWith('sk-')) return { ok: false, error: 'Parece una llave de otro proveedor. La de Anthropic empieza con «sk-ant-».' }
  return { ok: false, error: 'Las llaves de Claude empiezan con «sk-ant-». Revisa que la copiaste completa.' }
}

// ── Voz: llave de Groq para dictar (21 oct 2026, carril VOZ) ─────────────────────────────────────────────────────

/** Dónde se crea la llave gratuita de Groq. */
export const CONSOLA_GROQ = 'https://console.groq.com/keys'

/** Formato de la llave de Groq (`gsk_…`). Detecta si pegó la de otro proveedor. */
export function validarLlaveVoz(crudo: string): { ok: true } | { ok: false; error: string } {
  const v = limpiarLlave(crudo)
  if (!v) return { ok: false, error: 'Pega tu llave de Groq para continuar.' }
  if (/\s/.test(v)) return { ok: false, error: 'La llave no lleva espacios. Cópiala de nuevo, completa.' }
  if (v.length > 4096) return { ok: false, error: 'Eso es demasiado largo para ser una llave.' }
  if (/^gsk_[A-Za-z0-9]{20,}$/.test(v)) return { ok: true }
  if (v.startsWith('sk-or-') || v.startsWith('sk-ant-')) return { ok: false, error: 'Esa llave es para conversar (Ajustes › Llaves). Aquí va la de Groq, que empieza con «gsk_».' }
  return { ok: false, error: 'Las llaves de Groq empiezan con «gsk_». Revisa que la copiaste completa.' }
}

export interface PruebaVoz { ok: boolean; ms?: number; code?: string; error?: string }

/** El daemon prueba la llave de Groq que ya tiene (POST /voz/probar vía Next). */
export async function probarVoz(): Promise<PruebaVoz> {
  try {
    const r = await fetch('/api/llaves/voz/probar', { method: 'POST', cache: 'no-store' })
    const j = await r.json().catch(() => ({})) as PruebaVoz
    if (typeof j.ok === 'boolean') return j
    return { ok: false, code: 'error', error: 'No pude probar la llave. Reintenta en unos segundos.' }
  } catch { return { ok: false, code: 'sin_red', error: 'No pude hablar con tu Arbrain local. Reintenta en unos segundos.' } }
}

/** Aviso entre pantallas: la llave de voz cambió (el micrófono del chat vuelve a mirar el llavero). */
export const EVENTO_LLAVE_VOZ = 'arbrain:llave-voz'
/** El micrófono del chat deja esta marca al llevar a la persona a Ajustes › Voz: el panel la saluda con el porqué. */
export const MARCA_DESDE_MIC = 'arbrain:voz-desde-mic'

// ── Puente con la app de escritorio ──────────────────────────────────────────────────────────────────────────────

type Invocar = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

function invocar(): Invocar | null {
  if (typeof window === 'undefined') return null
  const i = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: Invocar } }).__TAURI_INTERNALS__?.invoke
  if (typeof i === 'function') return i
  return esModoServidor() ? invocarServidor : null
}

/**
 * Modo servidor (21 oct 2026): sin app de escritorio, los mismos comandos los atiende el supervisor de
 * `npm run servidor` por `/api/llaves/servidor/<accion>` (con la sesión de la web). Las llaves se guardan en un archivo
 * privado de su carpeta de datos, no en el llavero. Solo existe si el build se hizo en modo servidor.
 */
const invocarServidor: Invocar = async (cmd, args) => {
  if (cmd === 'abrir_enlace' || cmd === 'plugin:opener|open_url') {
    const url = String(args?.url ?? '')
    if (!/^https:\/\//.test(url)) throw new Error('Solo se abren enlaces https.')
    if (!window.open(url, '_blank', 'noopener,noreferrer')) throw new Error('Tu navegador bloqueó la ventana nueva. Permite ventanas emergentes para esta página y vuelve a intentarlo.')
    return null
  }
  const accion = (ACCION_DE_COMANDO as Record<string, string | undefined>)[cmd]
  if (!accion) throw new Error('Eso solo lo hace la app de escritorio.')
  const post = accion === 'guardar' || accion === 'borrar' || accion === 'reiniciar'
  const r = await fetch(`/api/llaves/servidor/${accion}`, {
    method: post ? 'POST' : 'GET',
    headers: post ? { 'Content-Type': 'application/json' } : undefined,
    body: post ? JSON.stringify(args ?? {}) : undefined,
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({})) as { error?: string }
  if (!r.ok) throw new Error(j.error ?? 'El servidor de Arbrain no pudo completar la acción.')
  return j
}

export const hayApp = () => invocar() !== null

export class SinApp extends Error {
  constructor() { super('Las llaves solo se guardan desde la app de Arbrain (en el llavero de tu sistema), no desde un navegador.') }
}

async function llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const i = invocar()
  if (!i) throw new SinApp()
  try { return await i(cmd, args) as T } catch (e) { throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : 'La app no pudo completar la acción.') }
}

export const llavesEstado = () => llamar<EstadoLlaves>('llaves_estado')
export const llaveGuardar = (nombre: NombreLlave, valor: string) => llamar<EstadoLlaves>('llave_guardar', { nombre, valor: limpiarLlave(valor) })
export const llaveBorrar = (nombre: NombreLlave) => llamar<EstadoLlaves>('llave_borrar', { nombre })
export const daemonEstado = () => llamar<DaemonInfo>('daemon_estado')
export const daemonReiniciar = () => llamar<null>('daemon_reiniciar')

/** Espera a que el daemon vuelva tras cambiar una llave (lo reinicia la app). */
export async function esperarDaemon(maxMs = 30_000): Promise<DaemonInfo | null> {
  const fin = Date.now() + maxMs
  let ultimo: DaemonInfo | null = null
  while (Date.now() < fin) {
    try { ultimo = await daemonEstado(); if (ultimo.ready) return ultimo } catch { /* la app está relanzándolo */ }
    await new Promise(r => setTimeout(r, 800))
  }
  return ultimo
}

export interface PruebaLlave { ok: boolean; ms?: number; modelo?: string; code?: string; error?: string }

/** Turno mínimo del daemon con la llave que tiene (POST /llaves/probar vía Next). */
export async function probarConexion(): Promise<PruebaLlave> {
  try {
    const r = await fetch('/api/llaves/probar', { method: 'POST', cache: 'no-store' })
    const j = await r.json().catch(() => ({})) as PruebaLlave
    if (typeof j.ok === 'boolean') return j
    return { ok: false, code: 'error', error: 'No pude probar la conexión. Reintenta en unos segundos.' }
  } catch { return { ok: false, code: 'sin_red', error: 'No pude hablar con tu Arbrain local. Reintenta en unos segundos.' } }
}

// ── «Conectar con OpenRouter» en un clic (v1.1, OAuth PKCE; servidor en ./openrouter-pkce.ts) ───────────────────────

/** Enlaces directos para recargar crédito cuando la prueba dice `sin_saldo`. */
export const RECARGAR = {
  openrouter: 'https://openrouter.ai/settings/credits',
  anthropic: 'https://console.anthropic.com/settings/billing',
} as const

/**
 * Abre una URL https en el navegador del sistema.
 * Red team OAuth, M2: el opener de Tauri en macOS lanza `/usr/bin/open <url>` y la URL (con `state` y `code_challenge`)
 * queda un instante en los argumentos del proceso, visible en `ps`. `abrir_enlace` de la app la abre por
 * `NSWorkspace` (macOS) o `ShellExecute` (Windows), sin proceso hijo. En Linux sigue siendo `xdg-open <url>` (residual
 * documentado en RED-TEAM-OAUTH.md). Si la app es anterior a ese comando, se usa el opener de siempre.
 */
export async function abrirEnNavegador(url: string): Promise<void> {
  if (!/^https:\/\//.test(url)) throw new Error('Solo se abren enlaces https.')
  try { await llamar<null>('abrir_enlace', { url }) } catch (e) {
    if (e instanceof SinApp) throw e
    await llamar<null>('plugin:opener|open_url', { url })
  }
}

/** Quién cobra el chat: Anthropic va antes que OpenRouter (CONTRATO-DAEMON § OPENROUTER_API_KEY). La recarga va ahí. */
export function quienCobra(e: EstadoLlaves | null): 'openrouter' | 'anthropic' {
  const hay = (n: NombreLlave) => !!e?.llaves.find(l => l.nombre === n)?.presente
  return hay('OPENROUTER_API_KEY') && !hay('ANTHROPIC_API_KEY') ? 'openrouter' : 'anthropic'
}

/** ¿Al volver a la ventana (foco) se repite sola la prueba? Solo si faltaba crédito: es el regreso de «Recargar». */
export const reprobarAlVolver = (p: PruebaLlave | null | undefined) => !p?.ok && p?.code === 'sin_saldo'
/** Entre dos pruebas automáticas por foco, al menos esto (el foco parpadea al cambiar de ventana). */
export const PAUSA_REPROBAR_MS = 4_000
/** Tras esto esperando sin respuesta, la ventana pregunta «¿Cancelaste en OpenRouter?» y ofrece reintentar. */
export const AVISO_SIN_RESPUESTA_MS = 20_000

/** «Conectado a OpenRouter con la llave «Arbrain» (…wxyz)»: la etiqueta que pide `iniciar` y los últimos 4. */
export function textoConectado(llave: string): string {
  const fin = limpiarLlave(llave).slice(-4)
  return `Conectado a OpenRouter con la llave «Arbrain» (…${fin}).`
}

export type ResultadoConexion =
  | { ok: true; llave: string }
  | { ok: false; code: string; error: string }

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
const postJson = (f: Fetch, ruta: string, cuerpo: unknown) =>
  f(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), cache: 'no-store' })

export interface OpcionesConexion {
  /** Abre la URL de OpenRouter en el navegador del sistema. */
  abrir: (url: string) => Promise<void>
  /** Corta la espera (botón «Cancelar» o la pantalla se fue). */
  senal?: AbortSignal
  /** Avisa cuando el navegador ya se abrió (para «Esperando a que autorices…»). */
  alAbrir?: (url: string) => void
  intervaloMs?: number
  maxMs?: number
  fetch?: Fetch
  dormir?: (ms: number) => Promise<void>
}

/**
 * El flujo del lado de la ventana: pide el intento, abre el navegador y sondea hasta recibir la llave (una sola vez).
 * No guarda nada: quien llama la pone en el llavero con `llaveGuardar` y la suelta.
 */
export async function conectarOpenRouter(op: OpcionesConexion): Promise<ResultadoConexion> {
  const f: Fetch = op.fetch ?? ((i, n) => fetch(i, n))
  const dormir = op.dormir ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const intervalo = op.intervaloMs ?? 1_500
  const fin = Date.now() + (op.maxMs ?? 10 * 60_000)
  let state = ''
  const cancelado = (): ResultadoConexion => {
    if (state) void postJson(f, '/api/llaves/openrouter/cancelar', { state }).catch(() => {})
    return { ok: false, code: 'cancelado', error: 'Cancelaste la conexión.' }
  }
  try {
    const r = await postJson(f, '/api/llaves/openrouter/iniciar', {})
    const j = await r.json().catch(() => ({})) as { url?: string; state?: string; error?: string }
    if (!r.ok || !j.url || !j.state) return { ok: false, code: 'error', error: j.error ?? 'No pude preparar la conexión con OpenRouter.' }
    state = j.state
    if (op.senal?.aborted) return cancelado()
    await op.abrir(j.url)
    op.alAbrir?.(j.url)
  } catch (e) {
    return { ok: false, code: 'error', error: e instanceof Error ? e.message : 'No pude abrir tu navegador.' }
  }
  while (Date.now() < fin) {
    await dormir(intervalo)
    if (op.senal?.aborted) return cancelado()
    let j: { estado?: string; llave?: string; code?: string; error?: string }
    try {
      const r = await postJson(f, '/api/llaves/openrouter/estado', { state })
      j = await r.json().catch(() => ({}))
    } catch { continue } // la web local parpadeó: se sigue esperando
    if (j.estado === 'esperando') continue
    if (j.estado === 'lista' && typeof j.llave === 'string') return { ok: true, llave: j.llave }
    if (j.estado === 'error') return { ok: false, code: j.code ?? 'error', error: j.error ?? 'No se conectó.' }
    return { ok: false, code: 'vencido', error: 'Pasaron más de 10 minutos. Vuelve a pulsar «Conectar con OpenRouter».' }
  }
  cancelado() // el intento muere también en el servidor
  return { ok: false, code: 'vencido', error: 'Pasaron más de 10 minutos. Vuelve a pulsar «Conectar con OpenRouter».' }
}

// ── «Mi Claude Code»: el chat con tu suscripción Pro o Max (21 oct 2026) ───────────────────────────────────────────
// Arbrain no pide, ve ni guarda ningún token: el daemon pregunta a tu `claude` si tiene sesión (`claude auth status`)
// y, si eliges este motor, lanza ese Claude Code oficial con tu sesión. Ninguna llave de API llega al CLI.

export interface EstadoSuscripcion {
  instalado: boolean
  sesion: boolean
  metodo?: string
  plan?: string
  activo: boolean
  code?: string
  mensaje?: string
  /** Lo que eligió la persona (o se eligió solo al detectar su sesión); null si nunca se eligió. */
  elegido?: 'suscripcion' | 'llave' | null
  /** El inicio de sesión que lanzó Arbrain con el CLI oficial (22 oct 2026). */
  login?: { estado: 'esperando' | 'listo' | 'fallo'; desde: string; mensaje?: string }
  /** Codex con sesión de ChatGPT: solo informativo, todavía no corre en esta edición. */
  codex?: { instalado: boolean; sesion: boolean }
}

/**
 * «Iniciar sesión con Claude» (22 oct 2026): el daemon instala Claude Code si falta y lanza su login oficial; el
 * navegador se abre solo. Devuelve el estado del intento o lanza con el porqué en una línea.
 */
export async function iniciarSesionClaude(): Promise<NonNullable<EstadoSuscripcion['login']>> {
  const r = await fetch('/api/llaves/suscripcion/login', { method: 'POST', cache: 'no-store' })
  const j = await r.json().catch(() => ({})) as { login?: EstadoSuscripcion['login']; error?: string }
  if (!j.login) throw new Error(j.error ?? 'No pude abrir el inicio de sesión de Claude.')
  if (j.login.estado === 'fallo') throw new Error(j.login.mensaje ?? 'No pude abrir el inicio de sesión de Claude.')
  return j.login
}

/** Instaladores oficiales de Claude Code (code.claude.com/docs/en/setup). */
export const INSTALAR_CLAUDE = {
  unix: 'curl -fsSL https://claude.ai/install.sh | bash',
  windows: 'irm https://claude.ai/install.ps1 | iex',
} as const

/** «Max», «Pro», «Team»… para el texto; vacío si el CLI no lo dijo. */
export function nombrePlan(plan: string | undefined): string {
  if (!plan) return ''
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()
}

export async function estadoSuscripcion(fresco = false): Promise<EstadoSuscripcion | null> {
  try {
    const r = await fetch(`/api/llaves/suscripcion${fresco ? '?fresco=1' : ''}`, { cache: 'no-store' })
    if (!r.ok) return null // daemon anterior a esta versión o sin edición cliente: la tarjeta no aparece
    const j = await r.json().catch(() => null) as EstadoSuscripcion | null
    return j && typeof j.sesion === 'boolean' ? j : null
  } catch { return null }
}

/** Elige el motor del chat y reinicia el daemon para aplicarlo. Devuelve el estado nuevo o lanza con el porqué. */
export async function elegirMotor(motor: 'suscripcion' | 'llave'): Promise<void> {
  const r = await fetch('/api/llaves/motor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motor }), cache: 'no-store' })
  const j = await r.json().catch(() => ({})) as { error?: string; reiniciar?: boolean }
  if (!r.ok) throw new Error(j.error ?? 'No pude cambiar con qué habla Levy.')
  // Sin llave el daemon lo aplica en caliente (`reiniciar: false`): no hay nada que reiniciar.
  if (j.reiniciar === false) return
  await daemonReiniciar()
  await esperarDaemon(30_000)
}
