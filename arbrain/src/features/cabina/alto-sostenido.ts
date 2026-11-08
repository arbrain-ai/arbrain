/**
 * El alto de una vista del hilo no se cae mientras se recarga (5 nov 2026, Daniel 07:47: «cuando me muestras esto del
 * negocio al volverse a cargar me regresa arriba!»).
 *
 * WebKit (la app de escritorio) no tiene `overflow-anchor`: si la vista se encoge aunque sea un instante, el navegador
 * recorta el scroll del hilo y, cuando vuelve a crecer, nadie lo regresa. Medido en WebKit con «Tu negocio» a media
 * lectura (tests/cabina/e2e/vista-scroll): el hilo terminaba en scrollTop 0. Dos causas:
 *  1. La vista se REMONTA (la conversación se recarga con los ids de la base, o el mensaje cambia de envoltura): el alto
 *     reservado vivía en un ref y nacía en 0, así que la vista dormida medía 160 px.
 *  2. Su fuente se RELEE y una lectura llega corta (Levy escribiendo el embudo: «no es JSON válido») antes de la buena.
 *
 * Por eso el alto real se recuerda por invocación (sobrevive al remonte) y el marco lo sostiene un momento cuando el
 * contenido se encoge sin que la mano de Daniel lo haya pedido. Si sigue corto al vencer la gracia, era de verdad.
 */

const altos = new Map<string, number>()

/** Último alto real conocido de una invocación (0 = nunca se midió). */
export const altoConocido = (id: string) => altos.get(id) ?? 0
export function recordarAlto(id: string, alto: number) { if (alto > 40) altos.set(id, alto) }

/** Cuánto se sostiene un encogimiento antes de darlo por bueno. */
export const GRACIA_MS = 1500
/** Tras tocar la vista, sus cambios de alto son de Daniel (cambiar de pestaña, plegar algo): no se sostienen. */
export const MANO_MS = 1000

export class SostenAlto {
  /** El alto que el marco debe conservar mientras sostiene. */
  estable: number
  private hasta = 0
  private manoHasta = 0
  constructor(inicial = 0, private gracia = GRACIA_MS) { this.estable = inicial }

  /** El contenido se (re)monta: si ya se conocía su alto, se sostiene mientras llega. */
  montar(ahora: number) { this.hasta = this.estable ? ahora + this.gracia : 0 }

  /** Daniel tocó la vista. */
  mano(ahora: number) { this.manoHasta = ahora + MANO_MS; this.hasta = 0 }

  /** Nuevo alto del contenido; devuelve el alto mínimo del marco. El marco lo lleva SIEMPRE puesto: si esperara a ver
   *  el encogimiento para sostenerlo, WebKit ya habría recortado el scroll en ese mismo layout. */
  medir(alto: number, ahora: number): number {
    if (alto >= this.estable || ahora < this.manoHasta) { this.estable = alto; this.hasta = 0; return this.estable }
    if (!this.hasta) this.hasta = ahora + this.gracia
    if (ahora < this.hasta) return this.estable
    this.estable = alto; this.hasta = 0
    return this.estable
  }

  /** Cuándo vence lo sostenido (0 = no sostiene nada): ahí se vuelve a medir aunque nada cambie. */
  get vence() { return this.hasta }
}
