// Popovers anclados (1 nov 2026, Daniel: «este otro por ejemplo sigue saliendo de pantalla… asegúrate de que ambos
// sean bien responsivos»). Una sola regla para todo lo que abre la barra de escribir: selector de modelo, contexto y
// límites, esfuerzo, «+» adjuntar y comandos «/». Geometría pura; la medición del DOM vive en PopoverAnclado.tsx.
//
// Todo se calcula en píxeles CSS DEL POPOVER. La app escala con `zoom` en <html> (⌘+/⌘−, ZoomController) y ahí
// getBoundingClientRect, innerHeight y visualViewport hablan en píxeles de pantalla, mientras que `bottom`,
// `max-height`, `width` y hasta `vh` del popover se multiplican por el zoom. Mezclar las dos escalas fue el corte del
// 1 nov (docs/builds/popovers-composer-2026-11-01/REPORTE.md): quien llama divide entre el zoom antes de entrar aquí.

export const MARGEN = 8
export const SEPARACION = 6
/** Debajo de este ancho visible (px CSS) el popover es hoja inferior (teléfono). */
export const CORTE_HOJA = 640
/** Si ningún lado deja esto, el popover se monta sobre el ancla con toda la altura visible (ventanas diminutas). */
export const ALTO_MIN_UTIL = 160

export interface Caja { top: number; bottom: number; left: number; right: number }

/** La ventana en px CSS del popover: `ancho`/`alto` son el bloque de `position: fixed`; `visible`, lo que se ve
 *  (sin el teclado virtual ni lo que corre el zoom de pellizco). */
export interface Vista { ancho: number; alto: number; visible: Caja }

export interface OpcionesColocar {
  /** Ancho deseado (px CSS); 'ancla' = el del ancla (los comandos van sobre la caja de escribir). */
  ancho: number | 'ancla'
  /** Alto que pide el contenido sin recorte (px CSS): decide el lado. */
  altoNatural: number
  /** Tope estético (px CSS); el contenido que sobra hace scroll por dentro. */
  altoMax?: number
  /** En teléfono, hoja inferior con velo. Los comandos no: se escriben con la hoja abierta. */
  hojaEnMovil?: boolean
  /** Borde del ancla con el que se alinea: 'inicio' (izquierdo) o 'fin' (derecho). */
  alinear?: 'inicio' | 'fin'
}

export type Colocacion =
  | { modo: 'hoja'; bottom: number; maxHeight: number }
  | { modo: 'flotante'; lado: 'arriba' | 'abajo' | 'sobre'; left: number; width: number; maxHeight: number; top?: number; bottom?: number }

const limitar = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max))

/** Vista sin teclado ni pellizco: la ventana entera es visible. */
export const vistaCompleta = (ancho: number, alto: number): Vista => ({ ancho, alto, visible: { top: 0, left: 0, right: ancho, bottom: alto } })

/**
 * Dónde va un popover: anclado al ancla, del lado que le cabe (arriba primero, como sale de la barra de escribir; si
 * no cabe en ninguno, el de más aire) y SIEMPRE dentro de lo visible con `MARGEN` de aire. La altura máxima es el
 * espacio real de ese lado: lo que sobra hace scroll por dentro. Sin ancla medible (oculta), abajo a la izquierda.
 */
export function colocarPopover(ancla: Caja | null, vista: Vista, op: OpcionesColocar): Colocacion {
  const v = vista.visible
  const anchoVisible = Math.max(0, v.right - v.left)
  const altoVisible = Math.max(0, v.bottom - v.top)
  const tope = op.altoMax ?? Number.POSITIVE_INFINITY

  if (op.hojaEnMovil && anchoVisible < CORTE_HOJA) {
    return { modo: 'hoja', bottom: Math.max(0, Math.round(vista.alto - v.bottom)), maxHeight: Math.max(0, Math.floor(Math.min(altoVisible * 0.85, altoVisible - 24))) }
  }

  const a = ancla ?? { top: v.bottom - 16, bottom: v.bottom - 16, left: v.left + 16, right: v.left + 16 }
  const deseado = op.ancho === 'ancla' ? a.right - a.left : op.ancho
  const width = Math.max(0, Math.floor(Math.min(deseado, anchoVisible - 2 * MARGEN)))
  const desde = op.alinear === 'fin' ? a.right - width : a.left
  const left = limitar(Math.round(desde), Math.ceil(v.left + MARGEN), Math.floor(v.right - MARGEN - width))

  // Un ancla a medio salir de la vista cuenta como si estuviera en su borde (con el margen respetado).
  const arribaDe = limitar(a.top, v.top + MARGEN + SEPARACION, v.bottom - MARGEN + SEPARACION)
  const abajoDe = limitar(a.bottom, v.top + MARGEN - SEPARACION, v.bottom - MARGEN - SEPARACION)
  // Bordes ya redondeados hacia el ancla: la altura sale de ellos y nunca pasa del margen por medio píxel.
  const bottomArriba = Math.ceil(vista.alto - arribaDe + SEPARACION)
  const topAbajo = Math.ceil(abajoDe + SEPARACION)
  const espacioArriba = Math.max(0, vista.alto - bottomArriba - (v.top + MARGEN))
  const espacioAbajo = Math.max(0, v.bottom - MARGEN - topAbajo)
  const ideal = Math.min(op.altoNatural, tope)

  if (Math.max(espacioArriba, espacioAbajo) < Math.min(ideal, ALTO_MIN_UTIL)) {
    // Ningún lado sirve (ventana diminuta, zoom alto): encima del ancla, pegado al fondo visible.
    const bottom = Math.ceil(vista.alto - v.bottom + MARGEN)
    const maxHeight = Math.max(0, Math.floor(Math.min(tope, vista.alto - bottom - (v.top + MARGEN))))
    return { modo: 'flotante', lado: 'sobre', left, width, maxHeight, bottom }
  }

  const lado = espacioArriba >= ideal ? 'arriba' : espacioAbajo >= ideal ? 'abajo' : espacioArriba >= espacioAbajo ? 'arriba' : 'abajo'
  const maxHeight = Math.max(0, Math.floor(Math.min(tope, lado === 'arriba' ? espacioArriba : espacioAbajo)))
  return lado === 'arriba'
    ? { modo: 'flotante', lado, left, width, maxHeight, bottom: bottomArriba }
    : { modo: 'flotante', lado, left, width, maxHeight, top: topAbajo }
}

/** Píxeles de pantalla → píxeles CSS del popover (entre el zoom efectivo). */
export function aCss(caja: Caja, zoom: number): Caja {
  const z = zoom > 0 && Number.isFinite(zoom) ? zoom : 1
  return { top: caja.top / z, bottom: caja.bottom / z, left: caja.left / z, right: caja.right / z }
}
