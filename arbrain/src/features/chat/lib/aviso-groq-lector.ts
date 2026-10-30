/**
 * AVISO «CONECTA TU LLAVE GRATIS DE GROQ» DEL LECTOR (29 oct 2026). Daniel: «asegúrate de que se le diga al usuario cómo
 * conectar su llave, que es gratuita».
 *
 * Con la voz de LemonFox, el daemon del alumno saca las marcas exactas de cada palabra con su llave de Groq
 * (arbrain/server/src/cliente/marcas-groq.ts). Si no la tiene, manda `X-Marcas-Falta: sin_llave_groq` y el lector sigue
 * con su respaldo (tiempos-estimados.ts). Aquí se decide si decírselo: UNA sola vez en la vida de esa instalación
 * (queda anotado en localStorage cuando la barra lo pinta de verdad; un documento del panel, que no la pinta, no lo
 * gasta), y nunca si la llave ya está (entonces la cabecera no llega). Lo pinta la barra del lector (ChatSpeechBar) y
 * lleva a Ajustes › Voz por el mismo camino que el micrófono (MARCA_DESDE_MIC).
 */

export const CLAVE_AVISO_GROQ = 'arbrain:aviso-groq-lector'

type Almacen = Pick<Storage, 'getItem' | 'setItem'>

let visible = false
const oyentes = new Set<() => void>()
const avisar = () => { for (const f of oyentes) f() }

function almacenLocal(): Almacen | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

/** Lo que dijo el daemon de las marcas de un tramo (`X-Marcas-Falta`). Muestra el aviso si toca. */
export function marcasFaltan(falta: string | null, almacen: Almacen | null = almacenLocal()): void {
  if (falta !== 'sin_llave_groq' || visible || !almacen) return
  try {
    if (almacen.getItem(CLAVE_AVISO_GROQ)) return
  } catch { return } // sin almacén no hay forma de prometer «una vez»: mejor callar que repetirlo
  visible = true
  avisar()
}

/** La barra ya lo pintó: queda dicho para siempre. */
export function avisoGroqMostrado(almacen: Almacen | null = almacenLocal()): void {
  try { almacen?.setItem(CLAVE_AVISO_GROQ, new Date().toISOString()) } catch { /* sin almacén */ }
}

export function avisoGroqVisible(): boolean {
  return visible
}

/** «Ahora no», ir a Ajustes o cerrar el lector: se quita (si la barra lo pintó, ya no vuelve). */
export function cerrarAvisoGroq(): void {
  if (!visible) return
  visible = false
  avisar()
}

export function suscribirAvisoGroq(f: () => void): () => void {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}
