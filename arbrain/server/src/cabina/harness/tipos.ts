/**
 * Adaptadores de harness para `delegar` sin pantalla (6 oct 2026, firma de Daniel: «que no dependamos siempre
 * sólo de Claude; si el cliente el día de mañana quiere utilizar cualquier otro proveedor, debería funcionar»).
 *
 * Cada CLI de agentes tiene un modo sin pantalla: prompt por argumento, eventos JSON por stdout, reanudar por id
 * de sesión y un modo sin aprobaciones. Un adaptador traduce ese contrato a tres funciones puras:
 *  - `lanzar` → argv del primer turno (y la sesión, si el CLI deja fijarla de antemano).
 *  - `reanudar` → argv de un turno más sobre la misma sesión.
 *  - `leerEvento` → una línea de stdout a lo que le importa a Levy: sesión, texto, herramienta, error, tokens, fin.
 * Nada aquí lee una pantalla. Agregar un CLI cuesta un archivo y su prueba con una muestra real grabada.
 */

export type Permisos = 'bypass' | 'auto' | 'acceptEdits'

export interface PedidoLanzar { encargo: string; modelo: string | null; cwd: string; permisos: Permisos; /** id que Levy fija de antemano (solo si `sesionPropia`). */ sesion?: string }
export interface PedidoReanudar { sesion: string; texto: string; modelo: string | null; cwd: string; permisos: Permisos }

/** Lo que interesa de una línea de stdout. Una línea puede no traer nada (null). */
export interface Evento {
  sesion?: string
  /** Texto del agente. `delta` = trozo que se pega al anterior (streaming), si no, mensaje completo. */
  texto?: string
  delta?: boolean
  /** Respuesta final del turno, cuando el CLI la da aparte (claude/qwen `result`). */
  final?: string
  herramienta?: string
  /** Lo que la herramienta toca (comando, archivo, patrón o URL), recortado: para el «último paso en humano» del tablero. */
  detalle?: string
  /** Error del turno (API, modelo, límite). Las advertencias no cuentan. */
  error?: string
  /** Tokens que suma ESTE evento (el adaptador decide qué evento los trae para no contar doble). */
  tokens?: number
  /** El CLI declaró terminado el turno (la verdad sigue siendo que el proceso sale). */
  fin?: boolean
}

export interface Adaptador {
  nombre: string
  /** Binario del CLI (se busca en el PATH y en las carpetas de la casa). */
  binario: string
  /** Modelo por defecto si `delegar` no pide uno; null = el de la config del CLI. */
  modeloDefault(env: Entorno): string | null
  /** Valida el nombre del modelo (argv sin shell, pero igual se acota). */
  modeloOk(modelo: string): boolean
  /** El CLI acepta un id de sesión elegido por nosotros al lanzar. */
  sesionPropia: boolean
  lanzar(p: PedidoLanzar): string[]
  reanudar(p: PedidoReanudar): string[]
  leerEvento(linea: string): Evento | null
  /** Variables que el CLI necesita: destino ← la primera fuente que exista (proceso o arbrain/server/.env), o un
   *  valor fijo. Declarativo para que la terminal interactiva las tome del .env sin escribir el secreto en el comando. */
  entorno?: Record<string, { fuentes?: string[]; valor?: string }>
  /** Entrada en vivo (ajuste de Levy, 6 oct): el CLI acepta mensajes mientras trabaja y una orden de detener el paso
   *  sin perder la sesión. Lo opera `scripts/subagentes/pastor.mjs`. Sin esto, retomar encola y entrega al salir. */
  vivo?: Vivo
  /** Argumentos (sin el binario) para abrir la sesión a mano en una terminal del motor (interactivo). */
  interactivo(sesion: string, modelo: string | null): string[]
}

export interface PedidoVivo { sesion?: string; reanudar: boolean; modelo: string | null; permisos: Permisos; cwd: string }
export interface Vivo {
  protocolo: 'claude-stream' | 'codex-appserver'
  /** argv del CLI en modo de entrada en vivo (sin el encargo: lo pasa el pastor por stdin). */
  argv(p: PedidoVivo): string[]
  /** codex-appserver: parámetros de thread/start|resume y de turn/start. */
  rpc?(p: PedidoVivo): { hiloParams: Record<string, unknown>; turno?: Record<string, unknown> }
}

/** Lectura de variables: proceso primero, luego arbrain/server/.env. */
export type Entorno = (clave: string) => string | undefined

const MODELO_SIMPLE = /^[a-z0-9][a-z0-9.\-]{1,80}$/i
/** proveedor/modelo (OpenRouter usa ~ y : en algunos ids). */
const MODELO_RUTA = /^[a-z0-9][a-z0-9._\-]*(\/[~a-z0-9][a-z0-9._~:\-]*){1,3}$/i
export const modeloSimple = (m: string) => MODELO_SIMPLE.test(m)
export const modeloRuta = (m: string) => MODELO_RUTA.test(m) && m.length <= 120

/** JSON de una línea o null (líneas partidas, avisos en texto plano). */
export function json(linea: string): Record<string, unknown> | null {
  const t = linea.trim()
  if (!t.startsWith('{')) return null
  try { const v = JSON.parse(t); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null } catch { return null }
}
export const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0
export const str = (v: unknown) => typeof v === 'string' ? v : undefined
export const obj = (v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
export const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
