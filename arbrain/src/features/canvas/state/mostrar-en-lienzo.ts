/**
 * Qué piezas de la interfaz muestra el lienzo (6 oct 2026, Daniel desde el iPhone: «si ocupo modificar algo lo hago
 * hablando con Levy»). Por defecto el lienzo queda limpio: sin barra de herramientas y sin barra inferior; quedan la
 * píldora del título y los capítulos. Se guarda POR DISPOSITIVO (localStorage) y se aplica en vivo.
 *
 * Ocultar una barra solo la quita de la vista: sus atajos (⌘Z, zoom, letras de herramienta…) siguen en la Pizarra.
 * Pura salvo `leer`/`guardar`, que tragan los errores de almacenamiento (modo privado, cuota).
 */

export interface MostrarEnLienzo {
  /** La barra izquierda: selección, nota, texto, figura, conector, marco, lápiz, tabla. */
  herramientas: boolean
  /** La barra de abajo: guardado, deshacer/rehacer, vista, zoom, encuadrar, descargar, atajos. */
  barraInferior: boolean
  /** El índice «Todo 1 2 3 4». El velo del capítulo abierto no depende de esto. */
  capitulos: boolean
}

export const MOSTRAR_POR_DEFECTO: Readonly<MostrarEnLienzo> = { herramientas: false, barraInferior: false, capitulos: true }
export const CLAVE_MOSTRAR = 'arbrain.lienzo.mostrar'
export const EVENTO_MOSTRAR = 'arbrain:lienzo-mostrar'

/** Lee lo guardado con tolerancia: JSON roto, campos de otro tipo o faltantes caen al valor por defecto de ESE campo. */
export function interpretar(crudo: string | null | undefined): MostrarEnLienzo {
  let o: unknown
  try { o = crudo ? JSON.parse(crudo) : null } catch { o = null }
  const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
  const b = (k: keyof MostrarEnLienzo) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : MOSTRAR_POR_DEFECTO[k])
  return { herramientas: b('herramientas'), barraInferior: b('barraInferior'), capitulos: b('capitulos') }
}

export const serializar = (m: MostrarEnLienzo): string => JSON.stringify(m)

export const igual = (a: MostrarEnLienzo, b: MostrarEnLienzo) =>
  a.herramientas === b.herramientas && a.barraInferior === b.barraInferior && a.capitulos === b.capitulos

export function leer(): MostrarEnLienzo {
  try { return interpretar(localStorage.getItem(CLAVE_MOSTRAR)) } catch { return { ...MOSTRAR_POR_DEFECTO } }
}

export function guardar(m: MostrarEnLienzo): void {
  try { localStorage.setItem(CLAVE_MOSTRAR, serializar(m)) } catch { /* sin almacenamiento: vale por esta sesión */ }
  try { window.dispatchEvent(new Event(EVENTO_MOSTRAR)) } catch { /* sin window */ }
}
