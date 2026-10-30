/**
 * Botón «Pausar todo» compacto y movible (29 oct 2026). Un alumno, grupal del 26 oct (Windows): «el botón que cancela, que
 * pausa todo. Me estaba estorbando». Lógica pura, sin React ni DOM (se prueba con node:test):
 *
 *   - la preferencia del alumno (esquina y «Mostrar con texto»), guardada en localStorage; lo inválido cae al defecto;
 *   - dónde ponerlo para no tapar el campo de escribir, el botón de enviar ni otros controles marcados.
 *
 * La seguridad no cambia: el botón sigue en toda la app; solo cambia su tamaño y su esquina. En pausa se ve la franja
 * completa de siempre, sin importar la preferencia.
 */

export type EsquinaPausa = 'abajo-derecha' | 'abajo-izquierda' | 'arriba-derecha'

export interface PreferenciaPausa {
  esquina: EsquinaPausa
  /** true = se ve con el texto «Pausar todo» siempre; false = solo el ícono, el texto aparece al pasar el ratón o con el teclado. */
  conTexto: boolean
}

/** Misma familia de claves que el resto de la app (`arbrain-estilo`, `arbrain-hora-forzada`). */
export const CLAVE_PREFERENCIA_PAUSA = 'arbrain-boton-pausa'
/** Avisa a las otras vistas (Ajustes y el botón) que la preferencia cambió. */
export const EVENTO_PREFERENCIA_PAUSA = 'arbrain:boton-pausa'

export const PREFERENCIA_PAUSA_DEFECTO: PreferenciaPausa = { esquina: 'abajo-derecha', conTexto: false }

export const ESQUINAS_PAUSA: { esquina: EsquinaPausa; nombre: string }[] = [
  { esquina: 'abajo-derecha', nombre: 'abajo a la derecha' },
  { esquina: 'abajo-izquierda', nombre: 'abajo a la izquierda' },
  { esquina: 'arriba-derecha', nombre: 'arriba a la derecha' },
]

const esEsquina = (v: unknown): v is EsquinaPausa => ESQUINAS_PAUSA.some(e => e.esquina === v)

/** Lee lo guardado. Vacío, JSON roto, tipos raros o esquinas que no existen: cada campo cae a su valor por defecto. */
export function leerPreferenciaPausa(crudo: string | null | undefined): PreferenciaPausa {
  if (!crudo) return { ...PREFERENCIA_PAUSA_DEFECTO }
  let v: unknown
  try { v = JSON.parse(crudo) } catch { return { ...PREFERENCIA_PAUSA_DEFECTO } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...PREFERENCIA_PAUSA_DEFECTO }
  const o = v as Record<string, unknown>
  return {
    esquina: esEsquina(o.esquina) ? o.esquina : PREFERENCIA_PAUSA_DEFECTO.esquina,
    conTexto: typeof o.conTexto === 'boolean' ? o.conTexto : PREFERENCIA_PAUSA_DEFECTO.conTexto,
  }
}

/** Lo que se guarda: siempre una preferencia válida (pasa por la misma lectura). */
export function escribirPreferenciaPausa(p: Partial<PreferenciaPausa>): string {
  return JSON.stringify(leerPreferenciaPausa(JSON.stringify(p)))
}

/** «abajo a la derecha», para el texto de Ajustes. */
export function dondeEstaPausa(p: PreferenciaPausa): string {
  return ESQUINAS_PAUSA.find(e => e.esquina === p.esquina)?.nombre ?? ESQUINAS_PAUSA[0].nombre
}

export interface Caja { top: number; left: number; right: number; bottom: number }

export interface Colocacion { top?: number; bottom?: number; left?: number; right?: number }

/** Márgenes en px. `arriba` deja libre la cabecera (misma altura que la franja de pausa, `top-14`). */
export const MARGEN_PAUSA = { borde: 12, separacion: 8, arriba: 56 }

/**
 * Dónde va el grupo del botón (y la píldora «Autónomo», si está) para no tapar nada marcado como obstáculo (el campo
 * de escribir del chat con su botón de enviar, el pie de la columna, el aviso de versión nueva). Empieza en su esquina
 * y, si choca, sube por encima del obstáculo (esquinas de abajo) o baja por debajo (arriba). Nunca se sale de la pantalla.
 */
export function colocarBotonPausa(a: {
  esquina: EsquinaPausa
  ancho: number
  alto: number
  vw: number
  vh: number
  obstaculos: Caja[]
}): Colocacion {
  const { borde, separacion, arriba } = MARGEN_PAUSA
  const { esquina, ancho, alto, vw, vh } = a
  const derecha = esquina !== 'abajo-izquierda'
  const x0 = derecha ? vw - borde - ancho : borde
  const x1 = x0 + ancho
  const visibles = a.obstaculos.filter(o => o.right - o.left > 0 && o.bottom - o.top > 0 && o.right > x0 && o.left < x1)
  const horizontal: Colocacion = derecha ? { right: borde } : { left: borde }

  if (esquina === 'arriba-derecha') {
    let top = arriba
    for (let i = 0; i <= visibles.length; i++) {
      const choca = visibles.filter(o => o.top < top + alto && o.bottom > top)
      if (!choca.length) break
      top = Math.max(...choca.map(o => o.bottom + separacion))
    }
    return { ...horizontal, top: Math.round(Math.min(top, Math.max(arriba, vh - borde - alto))) }
  }

  let bottom = borde
  for (let i = 0; i <= visibles.length; i++) {
    const y0 = vh - bottom - alto
    const y1 = vh - bottom
    const choca = visibles.filter(o => o.top < y1 && o.bottom > y0)
    if (!choca.length) break
    bottom = Math.max(...choca.map(o => vh - o.top + separacion))
  }
  return { ...horizontal, bottom: Math.round(Math.min(bottom, Math.max(borde, vh - arriba - alto))) }
}

/** Lo que el botón no debe tapar: el campo de escribir del chat (su columna, que trae el botón de enviar) y lo marcado. */
export const SELECTOR_OBSTACULOS_PAUSA = '[data-chat-composer] .chat-prose, [data-evita-pausa]'
