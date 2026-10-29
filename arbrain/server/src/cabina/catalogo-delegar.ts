/**
 * Modelo y esfuerzo de `delegar` y `retomar`, validados ANTES de lanzar (29 oct 2026, brecha 2 del benchmark de
 * orquestación). Antes había una lista fija de esfuerzos y una regex para el modelo: un modelo mal escrito o un esfuerzo
 * que el modelo no soporta pasaban y fallaban ya lanzados, en la bitácora. Ahora:
 *
 *  · Una sola fuente del default: `adaptador.modeloDefault` (claude: harness/claude.ts; CABINA_MODELO_<CLI> lo cambia).
 *  · El catálogo vivo es el MISMO que usa el chat (`GET /models?account=<cuenta>` del agent-server, que alimenta
 *    SeccionModelo y el selector): si el modelo no está o el esfuerzo no está en su `supportedEfforts`, se rechaza con
 *    la lista válida. Si el catálogo no responde, se valida solo la forma y la respuesta lo dice.
 *  · La respuesta dice de dónde salió cada valor («default de la casa, harness/claude.ts», «CABINA_MODELO_CLAUDE del
 *    .env», «pedido»), como `/status` en Claude Code.
 */
import { readEnvFile } from '../env.js'
import { ESFUERZOS, type Adaptador } from './harness/tipos.js'

export interface ModeloCatalogo { value: string; resolvedModel?: string | null; supportedEfforts: string[] }
export interface Catalogo { modelos: ModeloCatalogo[]; actual: string | null }
export type LeerCatalogo = (cuenta: string) => Promise<Catalogo | null>

/** El catálogo del agent-server (cache de 30 s allá). null = no respondió: quien llama valida solo la forma. */
export const leerCatalogoVivo: LeerCatalogo = async cuenta => {
  const env = readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_SERVER_PORT'])
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? env.OPENCLAW_GATEWAY_TOKEN
  const puerto = process.env.MC_SERVER_PORT ?? env.MC_SERVER_PORT ?? '3099'
  if (!token || process.env.CABINA_VALIDAR_CATALOGO === '0') return null
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}/models?account=${encodeURIComponent(cuenta)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return null
    const d = await r.json() as { models?: unknown; current?: unknown }
    if (!Array.isArray(d.models)) return null
    const modelos = d.models.flatMap((m: Record<string, unknown>) => typeof m?.value === 'string' && m.value !== 'default'
      ? [{ value: m.value, resolvedModel: typeof m.resolvedModel === 'string' ? m.resolvedModel : null, supportedEfforts: Array.isArray(m.supportedEfforts) ? m.supportedEfforts.filter((e): e is string => typeof e === 'string') : [] }] : [])
    return modelos.length ? { modelos, actual: typeof d.current === 'string' && d.current !== 'default' ? d.current : null } : null
  } catch { return null }
}

/** Pruebas: un catálogo fijo en vez del agent-server. */
let lector: LeerCatalogo = leerCatalogoVivo
export function fijarLectorCatalogo(f: LeerCatalogo | null) { lector = f ?? leerCatalogoVivo }

const sinCalificador = (m: string) => m.replace(/\[[^\]]*\]$/, '')
/** El renglón del catálogo para un modelo: por su valor («opus») o por el id completo que resuelve. */
export function buscarModelo(c: Catalogo, m: string): ModeloCatalogo | undefined {
  return c.modelos.find(x => x.value === m) ?? c.modelos.find(x => [x.value, x.resolvedModel].some(v => v && sinCalificador(v) === sinCalificador(m)))
}

export interface Eleccion {
  modelo: string | null
  /** El esfuerzo pedido (null = el default del CLI). */
  esfuerzo: string | null
  /** El que recibe el CLI: el pedido si su modelo lo acepta; si no, su equivalente (codex: max → xhigh). */
  esfuerzoCli: string | null
  /** De dónde salió cada valor, en palabras. */
  origen: { modelo: string; esfuerzo: string }
  catalogo: 'vivo' | 'sin-catalogo' | 'no-respondio'
  /** «modelo <id> (default de la casa, harness/claude.ts) · esfuerzo max (pedido) · validado contra el catálogo vivo». */
  resumen: string
}

export class EleccionInvalida extends Error {}

/** Resuelve y valida modelo y esfuerzo para un CLI. `pedido` = lo que vino en la llamada (vacío = default). */
export async function resolverEleccion(ad: Adaptador, pedido: { modelo?: string | null; esfuerzo?: string | null }, env: (k: string) => string | undefined, leer: LeerCatalogo = lector): Promise<Eleccion> {
  const variable = `CABINA_MODELO_${ad.nombre.toUpperCase()}`
  const modelo = pedido.modelo || ad.modeloDefault(env)
  const origenModelo = pedido.modelo ? 'pedido' : env(variable) ? `${variable} del .env` : modelo ? `default de la casa, harness/${ad.nombre}.ts` : `el de la config de ${ad.nombre}`
  if (modelo && !ad.modeloOk(modelo)) throw new EleccionInvalida(`Modelo inválido para ${ad.nombre}${ad.nombre === 'opencode' ? ' (usa proveedor/modelo, p. ej. openrouter/~deepseek/deepseek-v4-flash-latest)' : ''}.`)
  const esfuerzo = pedido.esfuerzo || null
  if (esfuerzo && !ad.recibeEsfuerzo) throw new EleccionInvalida(`${ad.nombre} no recibe esfuerzo desde delegar; quítalo o usa claude/codex.`)
  // Sin catálogo que diga otra cosa, el equivalente del CLI (codex: max → xhigh)
  let cli = esfuerzo && ad.esfuerzoCli ? ad.esfuerzoCli(esfuerzo) : esfuerzo
  let catalogo: Eleccion['catalogo'] = ad.cuentaCatalogo ? 'no-respondio' : 'sin-catalogo'
  const c = ad.cuentaCatalogo ? await leer(ad.cuentaCatalogo) : null
  if (c) {
    catalogo = 'vivo'
    const nombres = c.modelos.map(x => x.resolvedModel && x.resolvedModel !== x.value ? `${x.value} (${x.resolvedModel})` : x.value).join(', ')
    const fila = modelo ? buscarModelo(c, modelo) : c.actual ? buscarModelo(c, c.actual) : undefined
    if (modelo && !fila) throw new EleccionInvalida(`El modelo «${modelo}» (${origenModelo}) no está en el catálogo vivo de ${ad.nombre}. Hay: ${nombres}.`)
    if (!modelo && c.actual && !fila) throw new EleccionInvalida(`El modelo de la config de ${ad.nombre} («${c.actual}») no está en su catálogo vivo y fallaría al arrancar. Pide uno: ${nombres}.`)
    if (esfuerzo && fila?.supportedEfforts.length) {
      // el catálogo manda: si el modelo acepta el pedido tal cual, va tal cual (gpt-5.6-terra acepta max)
      if (fila.supportedEfforts.includes(esfuerzo)) cli = esfuerzo
      else if (!fila.supportedEfforts.includes(cli!)) throw new EleccionInvalida(`«${esfuerzo}» no es un esfuerzo de ${fila.resolvedModel ?? fila.value} en ${ad.nombre}. Acepta: ${fila.supportedEfforts.join(', ')}.`)
    }
  } else if (esfuerzo && !(ESFUERZOS as readonly string[]).includes(esfuerzo)) {
    throw new EleccionInvalida(`Esfuerzo inválido (hay: ${ESFUERZOS.join(', ')}).`)
  }
  const origenEsfuerzo = esfuerzo ? (cli !== esfuerzo ? `pedido; ${ad.nombre} corre ${cli}, su techo` : 'pedido') : `default de ${ad.nombre}`
  const validado = catalogo === 'vivo' ? 'validado contra el catálogo vivo' : catalogo === 'no-respondio' ? 'el catálogo vivo no respondió: validé solo la forma' : `${ad.nombre} no publica catálogo: validé solo la forma`
  const resumen = `modelo ${modelo ?? `el de la config de ${ad.nombre}`}${modelo ? ` (${origenModelo})` : ''} · esfuerzo ${esfuerzo ?? 'sin pedir'} (${origenEsfuerzo}) · ${validado}`
  return { modelo, esfuerzo, esfuerzoCli: cli, origen: { modelo: origenModelo, esfuerzo: origenEsfuerzo }, catalogo, resumen }
}
