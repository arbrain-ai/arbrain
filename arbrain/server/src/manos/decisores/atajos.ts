/**
 * Atajos del cerebro: lo que se decide SIN modelo grande antes de gastar un turno (nodo C, noche del 2 oct).
 *
 *   1. `elegirReceta`: ¿hay una receta que ya resuelve este pedido? Coincidencia local por palabras de la
 *      receta (nombre, descripción, disparadores) y extracción de parámetros entre comillas «…». Jev solo
 *      desempata entre recetas cuando el pedido no trae datos personales (sin nombres entre comillas, sin
 *      teléfonos, sin correos): a OpenRouter nunca le llega contenido de la pantalla ni de Daniel.
 *   2. `objetivoDelPedido`: qué app o URL directa abrir ya, en paralelo al arranque del modelo, para que su
 *      primer turno llegue con el árbol leído (precalentar) en vez de gastar 1–2 turnos observando.
 */
import type { Decisor } from '../contrato.js'
import type { Receta } from '../recetas.js'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const VACIAS = new Set('a al ante con de del el en es la las lo los me mi mis o para por que se su sus un una y yo tu te le les abre abrir haz hazme dime pon ponme quiero ver favor'.split(' '))
/** Palabras con raíz cruda (4 letras): «escríbele» y «escribir», «envíes» y «enviarlo» cuentan igual. */
const palabras = (s: string) => norm(s).split(/[^a-z0-9ñ]+/).filter(w => w.length > 1 && !VACIAS.has(w)).map(w => (/^\d/.test(w) ? w : w.slice(0, 4)))

/** Segmentos entre comillas del pedido, en orden (los parámetros que Daniel dicta: textos, nombres). */
export const citas = (pedido: string) => [...pedido.matchAll(/[«"“]([^»"”]+)[»"”]/g)].map(m => m[1])

/** ¿El pedido trae datos personales? Si sí, nada de él viaja a un proveedor que no sea Anthropic. */
export function tieneDatosPersonales(pedido: string): boolean {
  return citas(pedido).length > 0 || /@|\+?\d[\d\s-]{7,}|whatsapp|mensaje|correo|e-?mail|dm\b|chat/i.test(pedido)
}

export interface Candidata { receta: Receta; puntos: number; parametros: Record<string, string> }

/** Disparadores: la receta puede guardar frases con las que Daniel la pide (`disparadores`). */
type ConDisparadores = Receta & { disparadores?: string[] }

/** Números fuera de las citas: datos fijos de la tarea («12 × 3», «el 6.º»), no palabras intercambiables. */
const numeros = (s: string) => [...new Set(s.replace(/[«"“][^»"”]*[»"”]/g, ' ').match(/\d+/g) ?? [])].sort().join(',')

export function puntuar(pedido: string, r: ConDisparadores): number {
  const p = new Set(palabras(pedido))
  const nPedido = numeros(pedido)
  const fuentes = [r.nombre.replace(/-/g, ' '), r.descripcion, ...(r.disparadores ?? [])]
  let mejor = 0
  for (const f of fuentes) {
    const w = [...new Set(palabras(f))]
    if (!w.length) continue
    // Nodo E (3 oct): «calcula 7 × 8» coincidía 0.67 con la receta de 12 × 3, que corría, verificaba «36» y
    // reportaba hecho. Si los números fijos no son los mismos, esa frase no describe la tarea.
    if (numeros(f) !== nPedido) continue
    const comunes = w.filter(x => p.has(x)).length
    // Cobertura de la frase de la receta: cuántas de SUS palabras dijo Daniel.
    mejor = Math.max(mejor, comunes / w.length)
  }
  return mejor
}

/** Parámetros de la receta desde las citas del pedido, en orden. Si no alcanzan, la receta no aplica. */
export function parametrosDesde(pedido: string, r: Receta): Record<string, string> | null {
  const nombres = Object.keys(r.parametros)
  if (!nombres.length) return {}
  const c = citas(pedido)
  if (c.length < nombres.length) return null
  return Object.fromEntries(nombres.map((n, i) => [n, c[i]]))
}

export const UMBRAL_RECETA = 0.6

export async function elegirReceta(pedido: string, recetas: Receta[], decisor?: () => Decisor): Promise<Candidata | null> {
  const cands = recetas
    .map(receta => ({ receta, puntos: puntuar(pedido, receta), parametros: parametrosDesde(pedido, receta) }))
    .filter((c): c is Candidata => c.parametros !== null && c.puntos >= UMBRAL_RECETA)
    .sort((a, b) => b.puntos - a.puntos)
  if (!cands.length) return null
  if (cands.length === 1 || cands[0].puntos - cands[1].puntos >= 0.2) return cands[0]
  // Empate: Jev desempata entre NUESTRAS recetas, y solo si el pedido no trae nada personal.
  if (!decisor || tieneDatosPersonales(pedido)) return null
  try {
    const top = cands.slice(0, 6)
    const d = await decisor().decidir({
      pregunta: `Pedido: «${pedido}». ¿Qué receta guardada lo resuelve? Si ninguna, responde ninguna.`,
      estado: { tarea: pedido },
      opciones: { ...Object.fromEntries(top.map(c => [c.receta.nombre, c.receta.descripcion || c.receta.nombre])), ninguna: 'ninguna receta lo resuelve' },
    })
    return top.find(c => c.receta.nombre === d.eleccion) ?? null
  } catch { return null }
}

// ---------- Precalentar ----------

export type Objetivo = { tipo: 'app'; app: string } | { tipo: 'web'; url: string }

const APPS: [RegExp, string][] = [
  [/whats ?app/i, 'net.whatsapp.WhatsApp'],
  [/calculadora|calculator/i, 'com.apple.calculator'],
  [/\bsfmap\b/i, 'com.saasfactory.sfmap'],
  [/configuraci[oó]n del sistema|system settings|\bdock\b/i, 'com.apple.systempreferences'],
  [/textedit/i, 'com.apple.TextEdit'],
  [/\bnotas\b|\bnotes\b/i, 'com.apple.Notes'],
  [/\bfinder\b/i, 'com.apple.finder'],
]

/** URL directa o app a precalentar. Solo destinos de lectura: abrir nunca envía ni compra nada. */
export function objetivoDelPedido(pedido: string): Objetivo | null {
  const p = pedido
  // Una URL escrita en el pedido es la directa (demo del nodo E: «una lista como la de X» precalentaba x.com).
  const url = /https?:\/\/[^\s«»"“”<>]+/i.exec(p)?.[0].replace(/[.,;:)\]]+$/, '')
  if (url) return { tipo: 'web', url }
  if (/(guardad|bookmark)/i.test(p) && /\b(x|twitter)\b|x\.com/i.test(p)) return { tipo: 'web', url: 'https://x.com/i/bookmarks' }
  const canal = /canal (?:de |del )?(?:@)?([A-Za-z0-9_.-]{2,40})/i.exec(p)
  if (/youtube/i.test(p) && canal) return { tipo: 'web', url: `https://www.youtube.com/@${canal[1]}/videos` }
  const busca = /youtube.*?busca\s+(.+?)(?:[,.;]| y |$)/i.exec(p)
  if (busca) return { tipo: 'web', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(busca[1].trim())}` }
  for (const [re, app] of APPS) if (re.test(p)) return { tipo: 'app', app }
  return null
}
