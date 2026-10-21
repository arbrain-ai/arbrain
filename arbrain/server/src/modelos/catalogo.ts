/**
 * Catálogo de modelos del selector del chat (Configuración → Modelos, 2 oct 2026).
 *
 * Pedido de Daniel (16:31): un solo selector en la barra del chat y, en Configuración, un catálogo con
 * interruptores para decidir qué modelos aparecen en él. Entra el top 10 del Artificial Analysis
 * Intelligence Index que vio, más Sonnet 5.5 y GPT-6 Luna. Los de Anthropic van por la suscripción
 * (Claude SDK, espacio `default`); el resto por OpenRouter con Codex como arnés, cada uno en el espacio de
 * su ruta del registro.
 *
 * La existencia y el precio se verifican contra el catálogo real de OpenRouter (`GET /api/v1/models`,
 * público, sin llave) con caché de una hora: un id que no está ahí se muestra deshabilitado con el motivo.
 * Qué modelos están encendidos vive en el daemon (SQLite) para que web, escritorio y teléfono vean lo mismo.
 */
import { textoFaltaLlave, textoMotorApiApagado } from '../edicion.js'
import type Database from 'better-sqlite3'
import { REGISTRO, llavePresente, motorApiEncendido, proveedor, type Ruta } from './registro.js'

export interface EntradaCatalogo {
  id: string
  nombre: string
  laboratorio: string
  /** Una línea en español para el selector. */
  descripcion: string
  /** Puesto en el Artificial Analysis Intelligence Index que vio Daniel (2 oct 2026); null si no estaba en el top 10. */
  puesto: number | null
  /** Id en OpenRouter: de ahí sale el precio (y la existencia, para los que corren por OpenRouter). */
  openrouterId: string
  via: 'suscripcion' | 'openrouter'
  /**
   * Suscripción: ids que acepta `/model` en el Claude SDK, en orden de preferencia (el catálogo vivo decide).
   * Solo ids fijos de versión: un alias suelto (`haiku`) apunta a lo que diga el SDK instalado. El 8 oct 2026
   * el SDK 0.3.288 resolvía `haiku` a Haiku 4.5 y el selector «Haiku 5.5» corría 4.5 sin avisar. Un id fijo
   * que el SDK no anuncia deja la entrada no disponible, con su motivo, en vez de bajar de generación.
   */
  claude?: string[]
  /** OpenRouter: id de la ruta del registro. */
  ruta?: string
}

export const CATALOGO: EntradaCatalogo[] = [
  { id: 'opus-5.5', nombre: 'Opus 5.5', laboratorio: 'Anthropic', descripcion: 'El más capaz para el trabajo de todos los días', puesto: 1, openrouterId: 'anthropic/claude-opus-5.5', via: 'suscripcion', claude: ['claude-opus-5-5[1m]', 'claude-opus-5-5'] },
  { id: 'fable-5.1', nombre: 'Fable 5.1', laboratorio: 'Anthropic', descripcion: 'Para lo más difícil y largo; gasta más suscripción', puesto: 2, openrouterId: 'anthropic/claude-fable-5.1', via: 'suscripcion', claude: ['claude-fable-5-1[1m]', 'claude-fable-5-1'] },
  { id: 'gpt-6-astra', nombre: 'GPT-6 Astra', laboratorio: 'OpenAI', descripcion: 'El tope de OpenAI; caro por token', puesto: 3, openrouterId: 'openai/gpt-6-astra', via: 'openrouter', ruta: 'gpt-6-astra@openrouter' },
  { id: 'gemini-4-argon', nombre: 'Gemini 4 Argon', laboratorio: 'Google', descripcion: 'El más capaz de Google', puesto: 4, openrouterId: 'google/gemini-4-argon', via: 'openrouter', ruta: 'gemini-4-argon@openrouter' },
  { id: 'gpt-6.1-sol', nombre: 'GPT-6.1 Sol', laboratorio: 'OpenAI', descripcion: 'Equilibrio de OpenAI entre capacidad y costo', puesto: 5, openrouterId: 'openai/gpt-6.1-sol', via: 'openrouter', ruta: 'gpt-6.1-sol@openrouter' },
  { id: 'muse-spark-1.3', nombre: 'Muse Spark 1.3', laboratorio: 'Meta', descripcion: 'El modelo de frontera de Meta', puesto: 6, openrouterId: 'meta/muse-spark-1.3', via: 'openrouter', ruta: 'muse-spark-1.3@openrouter' },
  { id: 'grok-4.7', nombre: 'Grok 4.7', laboratorio: 'xAI', descripcion: 'El de xAI, con ventana de 500 mil tokens', puesto: 7, openrouterId: 'x-ai/grok-4.7', via: 'openrouter', ruta: 'grok-4.7@openrouter' },
  { id: 'mimo-v2.6-pro', nombre: 'MiMo-V2.6-Pro', laboratorio: 'Xiaomi', descripcion: 'Abierto de Xiaomi, muy barato para su nivel', puesto: 8, openrouterId: 'xiaomi/mimo-v2.6-pro', via: 'openrouter', ruta: 'mimo-v2.6-pro@openrouter' },
  { id: 'glm-5.3', nombre: 'GLM-5.3', laboratorio: 'Z.ai', descripcion: 'Abierto de Z.ai, fuerte en código', puesto: 9, openrouterId: 'z-ai/glm-5.3', via: 'openrouter', ruta: 'glm-5.3@openrouter' },
  { id: 'deepseek-v4.1-flash', nombre: 'DeepSeek V4.1 Flash', laboratorio: 'DeepSeek', descripcion: 'Rápido y casi gratis; ventana de un millón', puesto: 10, openrouterId: 'deepseek/deepseek-v4.1-flash', via: 'openrouter', ruta: 'deepseek-v4.1-flash@openrouter' },
  { id: 'sonnet-5.5', nombre: 'Sonnet 5.5', laboratorio: 'Anthropic', descripcion: 'Rápido para tareas de rutina', puesto: null, openrouterId: 'anthropic/claude-sonnet-5.5', via: 'suscripcion', claude: ['claude-sonnet-5-5[1m]', 'claude-sonnet-5-5'] },
  { id: 'haiku-5.5', nombre: 'Haiku 5.5', laboratorio: 'Anthropic', descripcion: 'El rápido y barato de Anthropic; ventana de un millón', puesto: null, openrouterId: 'anthropic/claude-haiku-5.5', via: 'suscripcion', claude: ['claude-haiku-5-5[1m]', 'claude-haiku-5-5'] },
  { id: 'gpt-6-luna', nombre: 'GPT-6 Luna', laboratorio: 'OpenAI', descripcion: 'El ligero de OpenAI; centavos por millón', puesto: null, openrouterId: 'openai/gpt-6-luna', via: 'openrouter', ruta: 'gpt-6-luna@openrouter' },
]

/** Encendidos mientras Daniel no toque ningún interruptor. */
export const HABILITADOS_POR_DEFECTO = ['opus-5.5', 'sonnet-5.5', 'haiku-5.5', 'deepseek-v4.1-flash', 'gpt-6-luna']

export const rutaDeEntrada = (e: EntradaCatalogo): Ruta | undefined => e.ruta ? REGISTRO.rutas.find(r => r.id === e.ruta) : undefined

// ─── OpenRouter ──────────────────────────────────────────────────────────────

export interface ModeloOpenRouter { entrada: number | null; salida: number | null; contexto: number | null }
export interface ConsultaOpenRouter { consultadoEn: string; modelos: Map<string, ModeloOpenRouter> | null; error: string | null }

const HORA = 60 * 60 * 1000
let cache: { expira: number; valor: Promise<ConsultaOpenRouter> } | null = null

/** USD por token (texto de OpenRouter) → USD por millón, redondeado a centavos de centavo. */
const porMillon = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10_000) / 10_000 : null
}

export function leerModelosOpenRouter(json: unknown): Map<string, ModeloOpenRouter> {
  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data)) throw new Error('OpenRouter respondió sin lista de modelos.')
  const mapa = new Map<string, ModeloOpenRouter>()
  for (const m of data as Array<Record<string, unknown>>) {
    if (typeof m?.id !== 'string') continue
    const precio = (m.pricing ?? {}) as Record<string, unknown>
    mapa.set(m.id, { entrada: porMillon(precio.prompt), salida: porMillon(precio.completion), contexto: typeof m.context_length === 'number' ? m.context_length : null })
  }
  return mapa
}

/** Catálogo público de OpenRouter con caché de una hora. Un fallo no se cachea. */
export function consultarOpenRouter(fetcher: typeof fetch = fetch, ahora = Date.now()): Promise<ConsultaOpenRouter> {
  if (cache && cache.expira > ahora) return cache.valor
  const consultadoEn = new Date(ahora).toISOString()
  const valor = fetcher('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10_000) })
    .then(async r => {
      if (!r.ok) throw new Error(`OpenRouter respondió ${r.status}.`)
      return { consultadoEn, modelos: leerModelosOpenRouter(await r.json()), error: null }
    })
    .catch((e: unknown) => {
      cache = null
      return { consultadoEn, modelos: null, error: e instanceof Error ? e.message : 'No se pudo consultar OpenRouter.' }
    })
  cache = { expira: ahora + HORA, valor }
  return valor
}
export function olvidarOpenRouter(): void { cache = null }

// ─── Interruptores ───────────────────────────────────────────────────────────

const CLAVE = 'modelos-habilitados'

export function leerHabilitados(db: Database.Database): string[] {
  try {
    const fila = db.prepare('SELECT valor_json FROM preferencia_motor WHERE clave=?').get(CLAVE) as { valor_json: string } | undefined
    if (!fila) return [...HABILITADOS_POR_DEFECTO]
    const v = JSON.parse(fila.valor_json)
    return Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string' && CATALOGO.some(e => e.id === id)) : [...HABILITADOS_POR_DEFECTO]
  } catch { return [...HABILITADOS_POR_DEFECTO] }
}

export function guardarHabilitado(db: Database.Database, id: string, habilitado: boolean): string[] {
  if (!CATALOGO.some(e => e.id === id)) throw new Error('Ese modelo no está en el catálogo.')
  db.exec('CREATE TABLE IF NOT EXISTS preferencia_motor (clave TEXT PRIMARY KEY, valor_json TEXT NOT NULL, updated_at INTEGER NOT NULL)')
  const actuales = new Set(leerHabilitados(db))
  if (habilitado) actuales.add(id); else actuales.delete(id)
  // Se guarda en el orden del catálogo: el selector respeta ese orden.
  const lista = CATALOGO.map(e => e.id).filter(x => actuales.has(x))
  db.prepare('INSERT INTO preferencia_motor (clave, valor_json, updated_at) VALUES (?,?,?) ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json, updated_at=excluded.updated_at')
    .run(CLAVE, JSON.stringify(lista), Date.now())
  return lista
}

// ─── Vista pública ───────────────────────────────────────────────────────────

export interface ModeloPublico {
  id: string; nombre: string; laboratorio: string; descripcion: string; puesto: number | null
  via: 'suscripcion' | 'openrouter'
  /** Espacio del chat donde corre. */
  cuenta: string
  /** Lo que se manda a `/model` (Claude) o el id de la ruta (OpenRouter); null si no se pudo resolver. */
  modelo: string | null
  openrouter: { id: string; existe: boolean | null; precio: { entrada: number | null; salida: number | null } | null }
  disponible: boolean
  motivo: string | null
  habilitado: boolean
}

export interface EntornoCatalogo {
  openrouter: ConsultaOpenRouter
  habilitados: string[]
  /** Resuelve los ids candidatos de una entrada de Claude contra el catálogo vivo del SDK; null si ninguno existe. */
  resolverClaude: (candidatos: string[]) => string | null
  /** Error al leer el catálogo de Claude, si lo hubo. */
  errorClaude?: string | null
  motorApi?: boolean
  llave?: boolean
}

export function catalogoPublico(env: EntornoCatalogo) {
  const motorApi = env.motorApi ?? motorApiEncendido()
  const p = proveedor('openrouter')
  const llave = env.llave ?? (!!p && llavePresente(p))
  const or = env.openrouter.modelos
  const modelos: ModeloPublico[] = CATALOGO.map(e => {
    const enOr = or?.get(e.openrouterId) ?? null
    const existe = or ? !!enOr : null
    const base = {
      id: e.id, nombre: e.nombre, laboratorio: e.laboratorio, descripcion: e.descripcion, puesto: e.puesto, via: e.via,
      openrouter: { id: e.openrouterId, existe, precio: enOr ? { entrada: enOr.entrada, salida: enOr.salida } : null },
      habilitado: env.habilitados.includes(e.id),
    }
    if (e.via === 'suscripcion') {
      const modelo = env.resolverClaude(e.claude ?? [])
      const motivo = modelo ? null : env.errorClaude ? `No se pudo leer el catálogo de Claude: ${env.errorClaude}` : 'Tu suscripción de Claude no ofrece este modelo hoy.'
      return { ...base, cuenta: 'default', modelo, disponible: !!modelo, motivo }
    }
    const ruta = rutaDeEntrada(e)
    const motivo = !ruta ? 'No tiene ruta en el registro de modelos.'
      : ruta.estado === 'desactivada' ? 'Ruta desactivada en el registro.'
      : existe === false ? `No existe en el catálogo de OpenRouter (${e.openrouterId}, consultado ${env.openrouter.consultadoEn.slice(0, 16).replace('T', ' ')} UTC).`
      : existe === null ? `No se pudo verificar en OpenRouter: ${env.openrouter.error ?? 'sin respuesta'}.`
      : !motorApi ? textoMotorApiApagado('El motor por API está apagado (ARBRAIN_MOTOR_API).')
      : !llave ? textoFaltaLlave('OPENROUTER_API_KEY', 'Falta OPENROUTER_API_KEY en arbrain/server/.env.')
      : null
    return { ...base, cuenta: ruta?.cuenta ?? e.id, modelo: ruta?.modelId ?? null, disponible: !motivo, motivo }
  })
  // Un modelo deshabilitado por falta de verificación nunca sale encendido en el selector.
  return { consultadoEn: env.openrouter.consultadoEn, errorOpenRouter: env.openrouter.error, modelos: modelos.map(m => ({ ...m, habilitado: m.habilitado && m.disponible })), habilitadosGuardados: env.habilitados }
}
