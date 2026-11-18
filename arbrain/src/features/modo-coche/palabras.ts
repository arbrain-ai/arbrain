/**
 * Las palabras del modo coche y el filtro de ruido.
 *
 * - **Enviar ya:** «cambio», «dale», «terminé», «adelante», «te toca (a ti)» AL FINAL de lo que dices y después de una
 *   pausa (Whisper pone la coma o el punto): se manda en ese momento y la palabra se quita. «Quiero hacer un cambio» no
 *   cuenta. Si solo dijiste esa palabra («Dale.» como respuesta), se manda tal cual.
 * - **Pausar:** «terminamos», «ahí terminamos», «paremos (aquí)», «pausa», «hagamos una pausa», «termina», «apaga el
 *   modo coche», «terminamos el modo voz», «apaga el Orbe», «cierra el modo coche»… AL FINAL y sueltas (tras un punto o
 *   una coma). Si dijiste algo antes, se manda y, cuando responde, el Orbe queda en pausa; si solo dijiste la palabra
 *   («Bueno, terminamos.»), pausa directo. «Terminamos el proyecto de Javier» o «ya casi terminamos» son mensajes.
 *   «Cuando el proceso termina» es mensaje; «terminé» (con acento) es ENVIAR. Si tras la palabra de pausa Whisper oye
 *   una de enviar («…Terminamos. Dale.»), gana la pausa.
 * - **Ruido:** lo que Whisper inventa ante una tos o el motor («Cough», «Gracias por ver el video», «[Música]»…) se tira.
 */

export type Decision = { accion: 'enviar' | 'enviar-y-pausar' | 'pausar' | 'seguir'; texto: string }

/** Minúsculas, sin acentos ni signos, espacios simples. */
export function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const ENVIAR = /(?:^|\s)(?:cambio|dale|termine|adelante|te toca(?: a ti)?)$/
const PAUSAR = /(?:^|\s)(?:(?:hagamos (?:una )?|vamos a hacer una )?pausa|pausemos|pausar|parar|paremos|paramos|para ahi|terminar|termina|terminemos|terminamos|hasta aqui|(?:terminamos|terminemos|termina|terminar|apaga(?:r)?|apaguemos|cierra|cerrar|cerremos|para|paremos) (?:el |la )?(?:modo (?:de )?(?:voz|coche|carro|auto)|orbe|conversacion))(?: (?:aqui|ahi|por ahora|por hoy|por favor))*$/
/** Muletillas que no son mensaje: «Bueno, terminamos» es solo pausar. */
const RELLENO = new Set(['bueno', 'ok', 'okay', 'vale', 'listo', 'bien', 'entonces', 'ya', 'pues', 'y', 'arbrain', 'oye', 'eh', 'este', 'ahi', 'aqui'])
const CIERRA = /[.,;:!?…—]["»”)]*$/

type Tok = { o: string; n: string }
const tokens = (t: string): Tok[] => t.trim().split(/\s+/).map(o => ({ o, n: normalizar(o) })).filter(x => x.n)

/** Cuántas palabras del final forman la frase `re` (0 si no termina así). */
function alFinal(toks: Tok[], re: RegExp): number {
  const m = toks.map(t => t.n).join(' ').match(re)
  return m ? m[0].trim().split(' ').length : 0
}

/** Lo que dijiste antes de la palabra final: sin muletillas al final, y si la palabra iba suelta (tras punto o coma). */
function antes(toks: Tok[], k: number, quitarPausas = false): { texto: string; vacio: boolean; suelta: boolean } {
  let r = toks.slice(0, toks.length - k)
  let suelta = !r.length || CIERRA.test(r[r.length - 1].o)
  for (;;) {
    while (r.length && RELLENO.has(r[r.length - 1].n)) r = r.slice(0, -1)
    const otra = quitarPausas ? alFinal(r, PAUSAR) : 0 // «Paremos aquí, para ahí»: las dos son pausa
    if (!otra) break
    r = r.slice(0, r.length - otra)
  }
  if (!r.length) return { texto: '', vacio: true, suelta: true }
  suelta = suelta || CIERRA.test(r[r.length - 1].o)
  return { texto: r.map(t => t.o).join(' ').replace(/[\s,;:—–-]+$/, '').trim(), vacio: false, suelta }
}

/** Qué hacer con lo que dijiste. `final`: ya pasó el silencio largo (si no, es una mirada adelantada en una pausa corta). */
export function decidir(texto: string, final: boolean): Decision {
  const limpio = texto.trim()
  const toks = tokens(limpio)
  if (!toks.length) return { accion: 'seguir', texto: '' }
  const kPausa = alFinal(toks, PAUSAR)
  if (kPausa) {
    const r = antes(toks, kPausa, true)
    if (r.vacio) return { accion: 'pausar', texto: '' }
    if (r.suelta) return { accion: 'enviar-y-pausar', texto: r.texto }
  }
  const kEnvio = alFinal(toks, ENVIAR)
  if (kEnvio) {
    const r = antes(toks, kEnvio)
    // «…Terminamos. Dale.»: la pausa que va justo antes de la palabra de enviar manda.
    const resto = tokens(r.texto)
    const kPausaAntes = r.suelta ? alFinal(resto, PAUSAR) : 0
    if (kPausaAntes) {
      const r2 = antes(resto, kPausaAntes, true)
      if (r2.vacio) return { accion: 'pausar', texto: '' }
      if (r2.suelta) return { accion: 'enviar-y-pausar', texto: r2.texto }
    }
    if (r.vacio) return { accion: 'enviar', texto: limpio } // «Dale.» como respuesta: tal cual
    if (r.suelta) return { accion: 'enviar', texto: r.texto }
  }
  return final ? { accion: 'enviar', texto: limpio } : { accion: 'seguir', texto: limpio }
}

/** Lo que Whisper suele «oír» en el ruido (toses, motor, silencio). Solo si es TODO lo que dijo. */
const ALUCINACIONES = [
  /^(cough[ ,.]*)+$/, /^(tos[ ,.]*)+$/, /^(ejem[ ,.]*)+$/, /^(mm+|hm+|ah+|eh+|uh+|um+)$/,
  /^gracias por ver(?: el video)?$/, /^thank you(?: for watching)?$/, /^you$/, /^bye$/,
  /^suscribete(?: al canal)?$/, /^subtitulos (?:realizados|por) .*$/, /^amara org.*$/, /^musica$/, /^aplausos$/, /^risas$/,
  /^silencio$/, /^sonido.*$/, /^ruido.*$/,
]

export function esRuido(texto: string): boolean {
  const crudo = texto.trim()
  if (!crudo) return true
  if (/^[\s[\]()♪♫*.…,!?-]*$/.test(crudo)) return true
  if (/^\s*[[(][^\])]*[\])]\s*$/.test(crudo)) return true // «[Música]», «(tos)»
  const n = normalizar(crudo)
  if (!n) return true
  return ALUCINACIONES.some(r => r.test(n))
}
