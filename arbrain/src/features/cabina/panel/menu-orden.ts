import { esEdicionCliente, seccionPanelPermitida } from '@/lib/edicion'
/**
 * El orden del menú «+» (5 oct 2026, Daniel: una manija de 6 puntitos en cada fila para acomodarlas como él
 * quiera). Se guarda solo la lista de ids en su orden; lo que no figura (una sección nueva) entra en su lugar
 * por defecto, y lo que ya no existe se descarta. Pura: tests/panel/menu-orden.test.ts.
 */

/** El orden guardado aplicado a las opciones de hoy. Sin recuerdo válido, el de siempre. */
export function ordenarMenu(porDefecto: string[], guardado: unknown): string[] {
  if (!Array.isArray(guardado)) return porDefecto
  const validos = [...new Set(guardado.filter((x): x is string => typeof x === 'string' && porDefecto.includes(x)))]
  const resultado = [...validos]
  // Las que faltan van detrás de la que les precede en el orden por defecto (o al principio).
  porDefecto.forEach((id, i) => {
    if (resultado.includes(id)) return
    const previa = porDefecto.slice(0, i).reverse().find(x => resultado.includes(x))
    resultado.splice(previa ? resultado.indexOf(previa) + 1 : 0, 0, id)
  })
  return resultado
}

/** Mueve `id` a la posición `indice` (la que tendrá en la lista nueva). */
export function moverEnMenu(orden: string[], id: string, indice: number): string[] {
  if (!orden.includes(id)) return orden
  const sin = orden.filter(x => x !== id), i = Math.max(0, Math.min(sin.length, Math.round(indice)))
  return [...sin.slice(0, i), id, ...sin.slice(i)]
}

/** Dónde caería la fila arrastrada: cuántas de las otras tienen su centro arriba del cursor. */
export const indiceVertical = (centros: number[], y: number, desde: number) => centros.filter((c, i) => i !== desde && c < y).length

export const esPorDefecto = (orden: string[], porDefecto: string[]) => orden.join('\n') === porDefecto.join('\n')

// ── Ajustes del panel (6 oct 2026): orden + ocultas, una sola fuente en el servidor ──

/**
 * Las secciones del «+», en el orden de siempre. Las MISMAS ids que arbrain/server/src/cabina/panel-ajustes.ts → SECCIONES
 * (un test compara las dos listas). `tareas` y `taller` son «casas» del panel; las demás, vistas.
 */
export const SECCIONES_MENU = ['calendario', 'tareas', 'cohorte', 'lienzo', 'negocio', 'reporte', 'centro', 'equipo', 'salud', 'contenido', 'finanzas', 'explorador', 'taller']
/** Equipo y «Lo que llegó» nacen fuera del «+» (6 oct 2026): el organigrama vive en Ajustes › Panel y los reportes ya llegan a su hilo. Se vuelven a mostrar desde Ajustes. */
export const OCULTAS_POR_DEFECTO = ['equipo', 'reporte']

/**
 * «Dónde abre Levy» (7 oct 2026): qué ventana recibe lo que Levy abre. Las mismas opciones que arbrain/server/src/cabina/panel-ajustes.ts → DONDES.
 * `izquierda`/`derecha` se resuelven con la posición real de cada ventana en la pantalla (destino-levy.ts); `principal` es el panel de la ventana principal.
 */
export const DONDES = ['izquierda', 'derecha', 'principal'] as const
export type Donde = typeof DONDES[number]
export const DONDE_POR_DEFECTO: Donde = 'izquierda'
export const esDonde = (x: unknown): x is Donde => typeof x === 'string' && (DONDES as readonly string[]).includes(x)

export interface AjustesPanel { rev: number; orden: string[]; ocultas: string[]; donde: Donde }

/** Las secciones que existen en esta edición (cliente: Lienzo, Explorador y Taller; ver lib/edicion.ts). */
export const seccionesDisponibles = (cliente = esEdicionCliente()) => SECCIONES_MENU.filter(id => seccionPanelPermitida(id, cliente))

export const AJUSTES_POR_DEFECTO: AjustesPanel = { rev: 0, orden: seccionesDisponibles(), ocultas: OCULTAS_POR_DEFECTO.filter(id => seccionesDisponibles().includes(id)), donde: DONDE_POR_DEFECTO }

/** Lo que llegó del servidor (o de otra ventana) aplicado a las secciones de hoy: nunca rompe, nunca inventa ids. */
export function normalizarAjustes(crudo: unknown): AjustesPanel {
  const o = (crudo && typeof crudo === 'object' ? crudo : {}) as { rev?: unknown; orden?: unknown; ocultas?: unknown; donde?: unknown }
  // Edición cliente: las secciones del negocio de Daniel no existen; ni en el «+» ni en Ajustes › Panel.
  const disponibles = seccionesDisponibles()
  const ocultas = Array.isArray(o.ocultas) ? [...new Set(o.ocultas.filter((x): x is string => typeof x === 'string' && disponibles.includes(x)))] : OCULTAS_POR_DEFECTO.filter(id => disponibles.includes(id))
  return { rev: typeof o.rev === 'number' && Number.isInteger(o.rev) && o.rev >= 0 ? o.rev : 0, orden: ordenarMenu(disponibles, o.orden), ocultas, donde: esDonde(o.donde) ? o.donde : DONDE_POR_DEFECTO }
}

/** Lo que el «+» muestra: el orden sin las ocultas. */
export const visibles = (orden: string[], ocultas: string[]) => orden.filter(id => !ocultas.includes(id))

/**
 * Mover una fila dentro de las VISIBLES (lo que Daniel ve en el «+»): las ocultas no se mueven de su sitio en el orden completo.
 * `destino` es la posición que tendrá entre las visibles.
 */
export function moverVisible(orden: string[], ocultas: string[], id: string, destino: number): string[] {
  const vis = visibles(orden, ocultas)
  if (!vis.includes(id)) return orden
  const nuevas = moverEnMenu(vis, id, destino)
  let k = 0
  return orden.map(x => ocultas.includes(x) ? x : nuevas[k++])
}

export interface CajaV { top: number; height: number }

/**
 * Cuánto se corre cada fila (px) para abrir hueco mientras se arrastra la fila `desde` hacia el lugar `destino` (resorte y hueco,
 * como las pestañas): las que quedan del otro lado se apartan la altura de la arrastrada, y la arrastrada va al hueco que dejaron.
 * Las filas pueden tener alturas distintas (Calendario lleva una línea más); el espacio entre ellas se conserva.
 */
export function desplazamientosVerticales(cajas: CajaV[], desde: number, destino: number): number[] {
  const n = cajas.length
  if (desde < 0 || desde >= n) return cajas.map(() => 0)
  const orden = cajas.map((_, i) => i).filter(i => i !== desde)
  orden.splice(Math.max(0, Math.min(destino, orden.length)), 0, desde)
  const hueco = n > 1 ? Math.max(0, cajas[1].top - (cajas[0].top + cajas[0].height)) : 0
  const final: number[] = new Array(n)
  let y = cajas[0].top
  for (const i of orden) { final[i] = y; y += cajas[i].height + hueco }
  return cajas.map((c, i) => Math.round(final[i] - c.top))
}

/** Las que pasaron a ocultas entre una config y la siguiente: solo esas cierran su pestaña (lo que Daniel o Levy abrieron después no se toca). */
export const recienOcultas = (antes: string[], ahora: string[]) => ahora.filter(id => !antes.includes(id))
