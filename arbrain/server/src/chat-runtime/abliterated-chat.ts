/**
 * Espacio «abliterated» del chat (3 nov 2026, Daniel: «quiero usar el abliterated model de deepseek v4.1 flash… aquí en
 * Arbrain una opción para elegirlo en una nueva conversación»). El MISMO Claude Code del chat (SDK, herramientas,
 * ganchos del proyecto, freno de manos y de mensajes) apuntado a un endpoint con formato Anthropic que no es Anthropic:
 *
 *  - nuestro pod de RunPod si `ds41.py conectar` dejó `ABLITERATED_BASE_URL` + `ABLITERATED_API_KEY` en el .env;
 *  - si no, api.abliteration.ai con `ABLITERATION_AI_API_KEY` (.env) o `~/.config/arbrain/llaves/abliteration.key`.
 *
 * Aislamiento: su propia carpeta de Claude Code (`CONFIG_ABLITERATED`), así sus transcripciones no se mezclan con las
 * de las cuentas de Claude y el login de Daniel en Anthropic nunca viaja a un tercero. Solo existe en la instalación
 * original: en la edición del alumno no hay espacio, ni opción, ni carpeta (hasta que Daniel decida).
 *
 * Costo: el CLI calcula `costUsd` con precios de Anthropic, que aquí no aplican. Cada turno se cobra con la tarifa de
 * abliteration.ai (1 / 0.10 / 2 USD por millón: entrada, caché, salida) y queda en `store/abliterated-uso.jsonl` para
 * estimar cuántos turnos alcanza un dólar.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ABLITERATION_AI, CONFIG_ABLITERATED, MODELO_ABLITERATED } from '../cabina/harness/abliterated.js'
import { esEdicionCliente } from '../edicion.js'
import { readEnvFile } from '../env.js'

export const ESPACIO_ABLITERATED = 'abliterated'
export const esEspacioAbliterated = (cuenta: string | null | undefined): boolean => cuenta === ESPACIO_ABLITERATED
export const LLAVE_ABLITERATION = () => join(homedir(), '.config/arbrain/llaves/abliteration.key')
export { CONFIG_ABLITERATED }

const CLAVES = ['ABLITERATED_BASE_URL', 'ABLITERATED_API_KEY', 'ABLITERATION_AI_API_KEY', 'CABINA_MODELO_ABLITERATED'] as const

export interface DestinoAbliterated {
  /** 'pod' = nuestro RunPod; 'abliteration.ai' = la API pagada por uso. */
  destino: 'pod' | 'abliteration.ai'
  baseUrl: string
  modelo: string
  token: string | null
}

function leerLlaveArchivo(ruta: string): string | null {
  try { return existsSync(ruta) ? readFileSync(ruta, 'utf8').trim() || null : null } catch { return null }
}

/** A dónde va un turno de este espacio y con qué token. Se lee en cada turno: conectar el pod no exige reiniciar. */
export function destinoAbliterated(base: NodeJS.ProcessEnv = process.env, archivo: Record<string, string> = readEnvFile([...CLAVES]), llave: () => string | null = () => leerLlaveArchivo(LLAVE_ABLITERATION())): DestinoAbliterated {
  const v = (k: (typeof CLAVES)[number]) => base[k]?.trim() || archivo[k]?.trim() || ''
  const modelo = v('CABINA_MODELO_ABLITERATED') || MODELO_ABLITERATED
  // El pod va en pareja (URL + su llave): una llave de abliteration.ai nunca viaja al pod ni la del pod a abliteration.ai.
  const pod = v('ABLITERATED_BASE_URL')
  if (pod) return { destino: 'pod', baseUrl: pod, modelo, token: v('ABLITERATED_API_KEY') || null }
  return { destino: 'abliteration.ai', baseUrl: ABLITERATION_AI, modelo, token: v('ABLITERATION_AI_API_KEY') || llave() }
}

/** null = se puede elegir; si no, el motivo que ve Daniel en el selector. */
export function motivoNoDisponible(d: DestinoAbliterated = destinoAbliterated(), cliente = esEdicionCliente()): string | null {
  if (cliente) return 'Solo en la instalación original.'
  if (d.token) return null
  return d.destino === 'pod'
    ? 'Falta ABLITERATED_API_KEY del pod en arbrain/server/.env (ds41.py conectar).'
    : 'Falta la llave de abliteration.ai: ABLITERATION_AI_API_KEY en arbrain/server/.env o ~/.config/arbrain/llaves/abliteration.key.'
}

/**
 * Entorno del CLI para un turno de este espacio. Parte del entorno ya armado para Claude y le quita toda credencial de
 * Anthropic antes de poner la del endpoint. Sin token lanza: nunca se cae a otra cuenta en silencio.
 */
export function entornoAbliterated(env: Record<string, string | undefined>, d: DestinoAbliterated = destinoAbliterated()): Record<string, string> {
  const motivo = motivoNoDisponible(d)
  if (motivo) throw new Error(`DeepSeek V4.1 Flash · abliterated no está disponible: ${motivo}`)
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(env)) if (val != null && !/^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CONFIG_DIR$)/.test(k)) out[k] = val
  Object.assign(out, {
    CLAUDE_CONFIG_DIR: CONFIG_ABLITERATED,
    ANTHROPIC_BASE_URL: d.baseUrl,
    ANTHROPIC_AUTH_TOKEN: d.token!,
    // Las llamadas de fondo del CLI (títulos, haiku, subagentes) piden su modelo al MISMO endpoint: con un id de
    // Anthropic responderían 404. Y nada de telemetría ni betas de Anthropic hacia un tercero.
    ANTHROPIC_MODEL: d.modelo,
    ANTHROPIC_DEFAULT_OPUS_MODEL: d.modelo,
    ANTHROPIC_DEFAULT_SONNET_MODEL: d.modelo,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: d.modelo,
    ANTHROPIC_SMALL_FAST_MODEL: d.modelo,
    CLAUDE_CODE_SUBAGENT_MODEL: d.modelo,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
  })
  return out
}

// ─── Costo por turno ─────────────────────────────────────────────────────────

/** USD por millón de tokens en abliteration.ai (Daniel, 3 nov 2026). La escritura de caché se cobra como entrada. */
export const TARIFA_ABLITERATED = { entrada: 1, cache: 0.1, salida: 2 } as const

export interface UsoAbliterated { entrada: number; cacheLeida: number; cacheEscrita: number; salida: number; costoUsd: number }

/** Del `usage` del `result` del CLI (formato Anthropic) al costo con la tarifa de abliteration.ai. */
export function costoDeUso(usage: Record<string, unknown>): UsoAbliterated {
  const n = (k: string) => { const x = Number(usage[k]); return Number.isFinite(x) && x > 0 ? x : 0 }
  const entrada = n('input_tokens'), cacheLeida = n('cache_read_input_tokens'), cacheEscrita = n('cache_creation_input_tokens'), salida = n('output_tokens')
  const t = TARIFA_ABLITERATED
  const costoUsd = ((entrada + cacheEscrita) * t.entrada + cacheLeida * t.cache + salida * t.salida) / 1e6
  return { entrada, cacheLeida, cacheEscrita, salida, costoUsd: Math.round(costoUsd * 1e8) / 1e8 }
}

export const BITACORA_USO = (storeDir: string) => join(storeDir, 'abliterated-uso.jsonl')

/** Una línea por turno: cuándo, a dónde, tokens y costo. Nunca rompe el turno. */
export function anotarUso(storeDir: string, fila: UsoAbliterated & { destino: string; modelo: string | null; sesion?: string; duracionMs?: number; llamadas?: number }): void {
  try { appendFileSync(BITACORA_USO(storeDir), JSON.stringify({ en: new Date().toISOString(), ...fila }) + '\n') } catch { /* la bitácora es ayuda */ }
}

/** Resumen de la bitácora: turnos, costo total y cuántos turnos alcanza un dólar al ritmo medido. */
export function resumenUso(storeDir: string): { turnos: number; costoUsd: number; promedioUsd: number | null; turnosPorDolar: number | null } {
  let turnos = 0, costoUsd = 0
  try {
    for (const linea of readFileSync(BITACORA_USO(storeDir), 'utf8').split('\n')) {
      if (!linea.trim()) continue
      try { const f = JSON.parse(linea) as { costoUsd?: number }; turnos++; costoUsd += Number(f.costoUsd) || 0 } catch { /* línea rota */ }
    }
  } catch { /* sin bitácora todavía */ }
  const promedioUsd = turnos ? costoUsd / turnos : null
  return { turnos, costoUsd: Math.round(costoUsd * 1e6) / 1e6, promedioUsd, turnosPorDolar: promedioUsd ? Math.floor(1 / promedioUsd) : null }
}
