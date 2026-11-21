/**
 * Qué hacer con lo que oyó el micrófono en Levy en vivo (18 nov 2026). Puro, para las pruebas.
 *
 * Idea tomada del «modo coche» que se compartió en la comunidad (palabras de walkie-talkie y filtro de ruido), reescrita
 * aquí y con SU hallazgo #5 atendido: lo que oye el micrófono NO llega solo a un agente con herramientas. Por defecto
 * (`palabra`) se manda únicamente cuando Daniel lo dice («…cambio», «…dale», «…te toca») o pulsa Enter; lo demás se
 * queda en el cuadro de texto, a la vista. El modo `auto` (manda tras el silencio) es una elección explícita suya.
 *
 *  - Enviar: la palabra va AL FINAL. El reconocedor no siempre pone la coma («…irresistible cambio», prueba del 18 nov),
 *    así que sin coma también cuenta, salvo cuando la palabra de antes la vuelve sustantivo: «quiero hacer un cambio»,
 *    «ese cambio», «seguir adelante» son mensaje, no envío.
 *  - Pausar: «pausa», «terminamos», «apaga el modo en vivo»… dicho SOLO (con muletillas). Con más texto es mensaje.
 *  - Ruido: lo que el reconocedor inventa ante una tos o el silencio («Gracias por ver el video», «[Música]») se tira.
 */
import type { ModoEnvio } from './bandera.ts'

export type Accion = 'enviar' | 'esperar' | 'pausar' | 'ignorar'
export type Decision = { accion: Accion; texto: string }

export function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const ENVIO = ['cambio', 'dale', 'te toca', 'te toca a ti', 'adelante', 'envialo', 'mandalo', 'termine', 'cambio y fuera']
const PAUSA = ['pausa', 'pausemos', 'haz una pausa', 'hagamos una pausa', 'terminamos', 'hasta aqui', 'para ahi', 'apaga el modo en vivo', 'apaga el en vivo', 'deja de escuchar', 'ya no me escuches']
const MULETILLA = new Set(['bueno', 'ok', 'okay', 'vale', 'listo', 'bien', 'entonces', 'ya', 'pues', 'y', 'levy', 'oye', 'eh', 'este', 'va', 'sale'])
const RUIDO = [
  /^(mm+|hm+|ah+|eh+|uh+|um+|ejem)$/, /^gracias por ver( el video)?$/, /^thank you( for watching)?$/, /^you$/, /^bye$/,
  /^suscribete( al canal)?$/, /^subtitulos (realizados|por) .*$/, /^musica$/, /^aplausos$/, /^risas$/, /^silencio$/, /^(tos|cough)$/,
]

export function esRuido(texto: string): boolean {
  const crudo = texto.trim()
  if (!crudo || /^[\s[\]()♪♫*.…,!?¡¿-]*$/.test(crudo) || /^\s*[[(][^\])]*[\])]\s*$/.test(crudo)) return true
  const n = normalizar(crudo)
  return !n || RUIDO.some(r => r.test(n))
}

/** El texto sin la palabra final (si la hay, suelta) y si quedó algo más. */
function quitarFinal(texto: string, frases: string[]): { resto: string; hubo: boolean } | null {
  const crudo = texto.trim()
  const n = normalizar(crudo)
  for (const f of [...frases].sort((a, b) => b.length - a.length)) {
    if (n !== f && !n.endsWith(` ${f}`)) continue
    // Cuántas palabras crudas forman la frase final.
    const palabras = crudo.split(/\s+/)
    const k = f.split(' ').length
    const antes = palabras.slice(0, palabras.length - k)
    const ultimaAntes = antes.at(-1) ?? ''
    // Suelta: sola, tras un signo que marca pausa («…la oferta, cambio.») o sin signo si la palabra de antes no la vuelve
    // sustantivo («un cambio», «seguir adelante»).
    const pegada = antes.length && !/[.,;:!?…—-]["»”)]*$/.test(ultimaAntes)
    if (pegada && (SUSTANTIVO[f] ?? NADA).has(normalizar(ultimaAntes))) return null
    const resto = antes.join(' ').replace(/[\s,;:—–-]+$/, '').trim()
    return { resto, hubo: !!resto }
  }
  return null
}

const NADA = new Set<string>()
const DETERMINANTE = ['un', 'una', 'el', 'la', 'este', 'ese', 'aquel', 'otro', 'mi', 'tu', 'su', 'nuestro', 'del', 'al', 'de', 'gran', 'buen', 'mal', 'ningun', 'algun', 'cualquier', 'primer', 'ultimo', 'nuevo', 'sin', 'poco', 'mucho', 'tanto', 'cada', 'hacer', 'hago', 'hice', 'haz', 'hagamos', 'que', 'en', 'por', 'con', 'para', 'mas', 'menos', 'tipo']
/** Palabras que, justo antes, vuelven sustantivo o adverbio a la palabra de envío. */
const SUSTANTIVO: Record<string, Set<string>> = {
  cambio: new Set(DETERMINANTE),
  adelante: new Set(['seguir', 'sigue', 'seguimos', 'sigamos', 'salir', 'sale', 'salimos', 'sacar', 'saca', 'ir', 'vamos', 'hacia', 'mas', 'para', 'de', 'echar', 'llevar', 'lleva', 'llevamos', 'paso', 'pasos', 'muy', 'tan']),
  termine: new Set(['que', 'cuando', 'si', 'ya', 'casi', 'no', 'nunca', 'apenas']),
}
const soloMuletillas = (t: string) => normalizar(t).split(' ').filter(Boolean).every(w => MULETILLA.has(w))

/** Qué hacer con una frase recién transcrita. `borrador` es lo que ya está esperando en el cuadro de texto. */
export function decidir(texto: string, modo: ModoEnvio, borrador = ''): Decision {
  if (esRuido(texto)) return { accion: 'ignorar', texto: '' }
  const pausa = quitarFinal(texto, PAUSA)
  if (pausa && (!pausa.hubo || soloMuletillas(pausa.resto))) return { accion: 'pausar', texto: '' }
  const envio = quitarFinal(texto, ENVIO)
  const junto = (t: string) => [borrador.trim(), t.trim()].filter(Boolean).join(' ')
  if (envio) {
    // «Dale.» suelto con algo esperando: manda lo que espera. Sin nada esperando, «dale» es la respuesta misma.
    if (!envio.hubo || soloMuletillas(envio.resto)) return borrador.trim() ? { accion: 'enviar', texto: borrador.trim() } : { accion: 'enviar', texto: texto.trim() }
    return { accion: 'enviar', texto: junto(envio.resto) }
  }
  return modo === 'auto' ? { accion: 'enviar', texto: junto(texto) } : { accion: 'esperar', texto: junto(texto) }
}
