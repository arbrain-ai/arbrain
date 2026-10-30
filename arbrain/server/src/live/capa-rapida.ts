import { DUENO, DUENO_M } from '../dueno.js'
/**
 * Capa rápida de Live (4 oct 2026): Jev clasifica el mensaje hablado de Daniel en ~200 ms mientras Opus
 * arranca. Solo decide (ruta y esfuerzo) y elige un acuse de un repertorio fijo; no tiene herramientas,
 * no escribe y solo recibe el texto del mensaje. Diseño: docs/builds/live-dos-capas-jev-2026-10-04.md.
 */
export type RutaLive = 'trivial' | 'consulta' | 'razonar' | 'trabajo'
export type EsfuerzoLive = 'low' | 'medium' | 'high'
export interface VeredictoLive { ruta: RutaLive; esfuerzo: EsfuerzoLive; confianza: number; ms: number }

export const UMBRAL_RUTA = 0.8
export const UMBRAL_ESFUERZO = 0.9
const RUTAS: RutaLive[] = ['trivial', 'consulta', 'razonar', 'trabajo']
const ESFUERZOS: EsfuerzoLive[] = ['low', 'medium', 'high']

export const capaRapidaActiva = (env: NodeJS.ProcessEnv = process.env) => env.LIVE_DOS_CAPAS === '1' && !!env.OPENROUTER_API_KEY?.trim()
export const capaRapidaEsfuerzoActiva = (env: NodeJS.ProcessEnv = process.env) => capaRapidaActiva(env) && env.LIVE_DOS_CAPAS_ESFUERZO === '1'

const PREGUNTAS = {
  ruta: { type: 'choice', instructions: `Clasifica el mensaje hablado de ${DUENO} a su asistente de voz.`, criteria: {
    trivial: 'saludo, gracias o respuesta de una frase sin consultar nada',
    consulta: 'pide un dato concreto que requiere consultar una fuente',
    razonar: 'pide opinión, estrategia o análisis que requiere razonar a fondo',
    trabajo: 'pide ejecutar acciones o construir algo que toma más de un minuto',
  } },
  esfuerzo: { type: 'choice', instructions: 'Esfuerzo de razonamiento que merece la respuesta.', criteria: {
    low: 'respuesta directa', medium: 'algo de análisis', high: 'análisis profundo',
  } },
}

/** Jev por OpenRouter. Devuelve null ante cualquier fallo, duda o timeout: la capa 2 nunca depende de esto. */
export async function clasificarLive(mensaje: string, opts: { timeoutMs?: number; signal?: AbortSignal; fetchFn?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<VeredictoLive | null> {
  const env = opts.env ?? process.env
  const llave = env.OPENROUTER_API_KEY?.trim()
  if (!llave || !mensaje.trim()) return null
  const t0 = performance.now()
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? 1200)]) : AbortSignal.timeout(opts.timeoutMs ?? 1200)
  try {
    const res = await (opts.fetchFn ?? fetch)('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json', 'X-Title': 'Arbrain live' },
      body: JSON.stringify({ model: env.LIVE_JEV_MODELO || 'typesafe/jev-1.13', state: { mensaje_de_voz: mensaje.slice(0, 1500) }, questions: PREGUNTAS }),
      signal,
    })
    if (!res.ok) return null
    const d: any = await res.json()
    const a = d?.result?.answers ?? d?.answers
    const ruta = a?.ruta, esf = a?.esfuerzo
    if (ruta?.type !== 'choice' || !RUTAS.includes(ruta.choice)) return null
    const confianza = Number(ruta.probabilities?.[ruta.choice])
    if (!Number.isFinite(confianza)) return null
    const esfuerzo: EsfuerzoLive = ESFUERZOS.includes(esf?.choice) ? esf.choice : 'high'
    const confEsf = Number(esf?.probabilities?.[esf?.choice])
    // El esfuerzo vale lo que valga su propia confianza: con duda se asume el más alto (sin ahorro).
    return { ruta: ruta.choice, esfuerzo: Number.isFinite(confEsf) && confEsf >= UMBRAL_ESFUERZO ? esfuerzo : 'high', confianza, ms: Math.round(performance.now() - t0) }
  } catch { return null }
}

const ACUSES: Record<Exclude<RutaLive, 'trivial'> | 'duda', string[]> = {
  consulta: ['Va, déjame revisarlo.', 'Un segundo, lo consulto.', 'Dame un momento, lo miro.'],
  razonar: ['Buena pregunta, déjame pensarlo.', 'Va, lo pienso un momento.', 'Déjame darle una vuelta.'],
  trabajo: ['Va, déjame ver cómo hacerlo.', 'Entendido, lo reviso.', 'Va, lo preparo.'],
  duda: ['Va, déjame pensarlo.', 'Un momento, lo veo.'],
}
const ESTADO: Record<keyof typeof ACUSES, string> = { consulta: 'Consultando', razonar: 'Pensándolo a fondo', trabajo: 'Revisando', duda: 'Pensándolo' }
let ultimo = ''

/** Acuse sin contenido factual (nada que Opus pueda contradecir). `trivial` no lleva: Opus contesta igual de rápido. */
export function acuseDe(v: VeredictoLive | null, azar = Math.random): { text: string; status: string } | null {
  if (v?.ruta === 'trivial' && v.confianza >= UMBRAL_RUTA) return null
  const clave: keyof typeof ACUSES = v && v.confianza >= UMBRAL_RUTA && v.ruta !== 'trivial' ? v.ruta : 'duda'
  const opciones = ACUSES[clave].filter(t => t !== ultimo)
  const text = opciones[Math.floor(azar() * opciones.length)] ?? ACUSES[clave][0]
  ultimo = text
  return { text, status: ESTADO[clave] }
}

const ORDEN: EsfuerzoLive[] = ['low', 'medium', 'high']
/** Solo a la baja y solo con confianza alta; razonar y trabajo no tocan nada. Devuelve el esfuerzo de Opus o null (sin cambio). */
export function esfuerzoParaOpus(v: VeredictoLive | null, actual: string | null | undefined): EsfuerzoLive | null {
  if (!v || v.confianza < UMBRAL_ESFUERZO || (v.ruta !== 'trivial' && v.ruta !== 'consulta')) return null
  const meta: EsfuerzoLive = v.ruta === 'trivial' ? 'low' : 'medium'
  if (v.esfuerzo !== 'low' && v.esfuerzo !== 'medium') return null
  const ahora = ORDEN.indexOf(actual as EsfuerzoLive)
  // Si el actual es xhigh/max/desconocido (-1) también cuenta como más alto que la meta.
  return ahora !== -1 && ahora <= ORDEN.indexOf(meta) ? null : meta
}

export const LIVE_DOS_CAPAS_CONTEXT = 'Una capa rápida puede decir en voz un acuse corto («va, déjame pensarlo») antes de tu respuesta: no lo repitas ni abras con muletillas de acuse; entra directo al contenido.'
