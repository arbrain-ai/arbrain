/**
 * El modo coche en MINI, solo en la computadora: un orbe flotante para seguir viendo el chat mientras hablas. Aquí, lo
 * que no necesita pantalla: dónde va el mini, que nunca se salga de la ventana, y recordarlo.
 */

export type LugarMini = { x: number; y: number; lado: number }

export const LADO_MIN = 96
export const LADO_MAX = 320
export const MARGEN_MINI = 8
const CLAVE_LUGAR = 'arbrain-modo-coche-mini'
const CLAVE_VISTA = 'arbrain-modo-coche-vista'

/** El mini dentro de la ventana (aunque la achiques) y con un tamaño que se lee. Pura, para el test. */
export function acomodar(l: LugarMini, ancho: number, alto: number): LugarMini {
  const cabe = Math.max(48, Math.min(ancho, alto) - 2 * MARGEN_MINI)
  const lado = Math.round(Math.min(Math.max(l.lado, LADO_MIN), LADO_MAX, cabe))
  const x = Math.round(Math.min(Math.max(l.x, MARGEN_MINI), ancho - lado - MARGEN_MINI))
  const y = Math.round(Math.min(Math.max(l.y, MARGEN_MINI), alto - lado - MARGEN_MINI))
  return { x, y, lado }
}

/** La primera vez: abajo a la derecha, de 150 px. */
export function miniInicial(ancho: number, alto: number): LugarMini {
  const lado = 150
  return acomodar({ x: ancho - lado - 32, y: alto - lado - 150, lado }, ancho, alto)
}

export function leerLugar(): LugarMini {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE_LUGAR) ?? 'null') as LugarMini | null
    if (l && [l.x, l.y, l.lado].every(n => Number.isFinite(n))) return acomodar(l, window.innerWidth, window.innerHeight)
  } catch { /* modo privado o dato viejo */ }
  return miniInicial(window.innerWidth, window.innerHeight)
}
export function guardarLugar(l: LugarMini): void {
  try { localStorage.setItem(CLAVE_LUGAR, JSON.stringify(l)) } catch { /* modo privado */ }
}

export type Vista = 'completa' | 'mini'
export function leerVista(): Vista {
  try { return localStorage.getItem(CLAVE_VISTA) === 'mini' ? 'mini' : 'completa' } catch { return 'completa' }
}
export function guardarVista(v: Vista): void {
  try { localStorage.setItem(CLAVE_VISTA, v) } catch { /* modo privado */ }
}

/** ¿Computadora (mouse o trackpad)? Ahí existe el mini; en el celular y el iPad, solo la pantalla completa. */
export function esEscritorio(): boolean {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches && navigator.maxTouchPoints === 0 }
  catch { return false }
}
