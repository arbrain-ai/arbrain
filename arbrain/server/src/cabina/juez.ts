/**
 * Juez separado al cerrar un encargo (27 oct 2026, BRECHA §2.5 y top 10 #5).
 *
 * El subagente de `delegar` lleva su Definición de Terminado dentro del encargo y hasta hoy lo juzgaba el mismo agente
 * que hizo el trabajo. Aquí, cuando su turno termina, una llamada NUEVA de modelo (sin herramientas, sin settings ni
 * ganchos del repo y sin la conversación del trabajador: el mismo aislamiento que el decisor de manos) recibe SOLO la
 * Definición de Terminado y el informe final, y responde un veredicto: cumple, no cumple o no verificable, con una razón
 * corta. Sin DoD en el encargo no se llama a nadie: el veredicto es «sin DoD».
 *
 * El juez nunca bloquea el cierre: si falla, tarda o responde fuera de formato, devuelve null y el aviso sale igual.
 * ARBRAIN_JUEZ=0 lo apaga; ARBRAIN_JUEZ_MODELO cambia el modelo; ARBRAIN_JUEZ_TIMEOUT_MS el plazo.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type Veredicto = 'cumple' | 'no-cumple' | 'no-verificable' | 'sin-dod'
export interface Juicio { veredicto: Veredicto; razon: string; en: string; turno?: number; modelo?: string }

export const VEREDICTO_EN_PALABRAS: Record<Veredicto, string> = { cumple: 'Cumple', 'no-cumple': 'No cumple', 'no-verificable': 'No verificable', 'sin-dod': 'Sin DoD' }

/** Estándar de Daniel (2 oct): Sonnet 5.5 para lo rápido. */
export const MODELO_JUEZ = () => process.env.ARBRAIN_JUEZ_MODELO || 'claude-sonnet-5-5'
export const juezActivo = (env: NodeJS.ProcessEnv = process.env) => env.ARBRAIN_JUEZ !== '0'
const PLAZO_MS = () => Number(process.env.ARBRAIN_JUEZ_TIMEOUT_MS) || 60_000

/**
 * La Definición de Terminado del encargo: desde su encabezado («DoD», «Definición de Terminado», «Criterios de
 * aceptación», «Qué cuenta como hecho») hasta el siguiente encabezado en mayúsculas que no sea parte de ella, o 2,000
 * caracteres. null si el encargo no la trae.
 */
const CABEZA_DOD = /(^|\n)[ \t#*>-]*(?:DoD\b|Definici[oó]n de Terminado|Criterios? de (?:aceptaci[oó]n|terminado)|Qu[eé] cuenta como hecho)[^\n]*/i
const SIGUIENTE = /\n[ \t#*]*(?:VALIDA|FRENO|REPORTE|NO TOCAS|POSEES|WORKTREE|NODO|CONTEXTO|QUÉ HACER|QUE HACER)\b[^\n]*:/
export function extraerDoD(encargo: string | null | undefined): string | null {
  if (!encargo) return null
  const m = CABEZA_DOD.exec(encargo)
  if (!m) return null
  let resto = encargo.slice(m.index + m[1].length)
  const fin = SIGUIENTE.exec(resto.slice(1))
  if (fin) resto = resto.slice(0, fin.index + 1)
  const dod = resto.trim().slice(0, 2000)
  return dod.length >= 12 ? dod : null
}

const SISTEMA = 'Eres un juez independiente. Recibes la Definición de Terminado de un encargo y el informe final del agente que lo hizo. No tienes acceso a su trabajo ni a su conversación: juzgas solo con lo que el informe muestra. «cumple» exige evidencia concreta en el informe para cada punto (comandos con su salida, rutas, commits, cifras). «no-cumple» si el informe admite que falta algo o muestra un fallo. «no-verificable» si el informe afirma sin evidencia. Responde SOLO un JSON en una línea: {"veredicto":"cumple|no-cumple|no-verificable","razon":"una frase en español, máximo 160 caracteres, sin em dashes"}.'

export function promptJuez(dod: string, informe: string): string {
  return `DEFINICIÓN DE TERMINADO:\n${dod.slice(0, 2000)}\n\nINFORME FINAL DEL AGENTE:\n${informe.slice(0, 6000)}`
}

/** El veredicto del texto del juez (JSON en una línea, tolera bloque de código o texto alrededor). */
export function leerVeredicto(texto: string): { veredicto: Exclude<Veredicto, 'sin-dod'>; razon: string } | null {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { veredicto?: unknown; razon?: unknown }
    const v = typeof j.veredicto === 'string' ? j.veredicto.toLowerCase().replace(/[\s_]+/g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '') : ''
    if (v !== 'cumple' && v !== 'no-cumple' && v !== 'no-verificable') return null
    const razon = (typeof j.razon === 'string' ? j.razon : '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 200)
    return { veredicto: v, razon: razon || 'sin razón' }
  } catch { return null }
}

export type Llamar = (prompt: string, o: { sistema: string; modelo: string; signal: AbortSignal }) => Promise<string>

/** Juzga un turno terminado. null = el juez falló o está apagado (el cierre sigue igual). */
export async function juzgar(p: { dod: string | null; informe: string; turno?: number }, o: { llamar?: Llamar; modelo?: string; plazoMs?: number; ahora?: () => number; env?: NodeJS.ProcessEnv } = {}): Promise<Juicio | null> {
  if (!juezActivo(o.env)) return null
  const en = new Date((o.ahora ?? Date.now)()).toISOString()
  const base = { en, ...(p.turno != null ? { turno: p.turno } : {}) }
  if (!p.dod) return { veredicto: 'sin-dod', razon: 'El encargo no trae Definición de Terminado.', ...base }
  if (!p.informe.trim()) return { veredicto: 'no-verificable', razon: 'Terminó sin informe final.', ...base }
  const modelo = o.modelo ?? MODELO_JUEZ()
  const ac = new AbortController()
  const plazo = setTimeout(() => ac.abort(), o.plazoMs ?? PLAZO_MS())
  try {
    const texto = await Promise.race([
      (o.llamar ?? llamarClaude)(promptJuez(p.dod, p.informe), { sistema: SISTEMA, modelo, signal: ac.signal }),
      new Promise<never>((_, rechazar) => ac.signal.addEventListener('abort', () => rechazar(new Error('el juez no respondió a tiempo')), { once: true })),
    ])
    const v = leerVeredicto(texto)
    return v ? { ...v, ...base, modelo } : null
  } catch { return null }
  finally { clearTimeout(plazo) }
}

function entornoAislado(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const k of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'USER', 'LOGNAME']) if (process.env[k]) env[k] = process.env[k]!
  return { ...env, CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
}

/** Una llamada corta por el Agent SDK con la suscripción del host: sin herramientas, sin repo, sin sesión guardada. */
export const llamarClaude: Llamar = async (prompt, o) => {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const q = query({
    prompt,
    options: {
      cwd: mkdtempSync(join(tmpdir(), 'arbrain-juez-')), model: o.modelo, env: entornoAislado(),
      tools: [], settingSources: [], mcpServers: {}, strictMcpConfig: true, hooks: {}, plugins: [],
      persistSession: false, permissionMode: 'default', effort: 'low',
      canUseTool: async () => ({ behavior: 'deny', message: 'El juez no ejecuta herramientas.' }),
      settings: { disableAllHooks: true, autoMemoryEnabled: false },
      systemPrompt: o.sistema,
    } as Parameters<typeof query>[0]['options'],
  })
  const cerrar = () => { try { q.close() } catch { /* ya cerró */ } }
  o.signal.addEventListener('abort', cerrar, { once: true })
  try {
    for await (const e of q as AsyncIterable<{ type: string; subtype?: string; result?: unknown }>) {
      if (e.type !== 'result') continue
      if (e.subtype !== 'success') throw new Error(`juez: ${e.subtype}`)
      return String(e.result ?? '')
    }
    throw new Error('juez: la sesión terminó sin resultado')
  } finally { cerrar() }
}
