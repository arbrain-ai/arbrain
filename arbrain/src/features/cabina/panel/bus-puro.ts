/**
 * Bus del panel, parte pura (4 oct 2026): qué pestañas toca un comando de Levy y cómo se reporta el
 * panel al servidor. Sin React ni tienda para poder probarse sola. El contrato del otro lado:
 * arbrain/server/src/cabina/panel-bus.ts.
 */
import { NOMBRE, nombreDocumento, type MostrarInput } from '../model'
import { nombreVentana } from './pestanas-fuera'

export interface PestanaReporte {
  id: string; vista: string; titulo: string
  ruta?: string; paginaId?: string; seccion?: string; agenteId?: number
  deLevy?: boolean; guardada?: boolean; activa?: boolean; enVentana?: boolean
  /** En qué ventana aparte vive («Ventana 2»); sin este campo, en el panel principal. */
  ventana?: string
}
interface ConInput { id: string; input: MostrarInput; deLevy?: boolean; guardada?: boolean }

/** Una ruta es la misma aunque una venga relativa al repo y la otra absoluta o con ~. */
export function mismaRuta(a?: string, b?: string): boolean {
  const n = (r?: string) => (r ?? '').trim().replace(/^~\//, '').replace(/\/+$/, '')
  const x = n(a), y = n(b)
  return !!x && !!y && (x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`))
}

/**
 * ¿Esta pestaña es la que pide soltar/guardar? Por vista, sin importar quién la abrió ni con qué día,
 * alcance o encuadre. Solo afinan los campos que el pedido trae y que identifican: la ruta de un documento,
 * la página de un lienzo, la sección de «Tu negocio», el agente de Trabajos.
 */
export function coincide(pestana: MostrarInput, pedido: MostrarInput): boolean {
  if (!coincideVista(pestana, pedido)) return false
  if (pedido.vista === 'documento') return mismaRuta(pestana.ruta, pedido.ruta)
  if (pedido.paginaId && pestana.paginaId !== pedido.paginaId) return false
  if (pedido.vista === 'negocio' && pedido.seccion && pestana.seccion !== pedido.seccion) return false
  if (pedido.vista === 'trabajos' && pedido.agenteId != null && pestana.agenteId !== pedido.agenteId) return false
  return true
}

/** Solo la vista (Objetivos es alias de Calendario, 4 oct 2026: pedir soltar o guardar una es pedirlo de la vista unificada). */
export function coincideVista(pestana: MostrarInput, pedido: MostrarInput): boolean {
  const vista = (v: string) => v === 'objetivos' ? 'calendario' : v
  return vista(pestana.vista) === vista(pedido.vista)
}

export const nombrePestana = (i: MostrarInput) =>
  i.vista === 'documento' ? nombreDocumento(i) : i.titulo || (i.vista === 'negocio' && i.seccion ? `${NOMBRE.negocio} · ${i.seccion}` : NOMBRE[i.vista])

/** El panel tal como lo ve Daniel, listo para el servidor. */
export function reportar(fijadas: ConInput[], activa: string, enVentana: Record<string, string>): PestanaReporte[] {
  return fijadas.map(f => ({
    id: f.id, vista: f.input.vista, titulo: nombrePestana(f.input),
    ...(f.input.ruta ? { ruta: f.input.ruta } : {}), ...(f.input.paginaId ? { paginaId: f.input.paginaId } : {}),
    ...(f.input.seccion ? { seccion: f.input.seccion } : {}), ...(f.input.agenteId != null ? { agenteId: f.input.agenteId } : {}),
    ...(f.deLevy ? { deLevy: true } : {}), ...(f.guardada ? { guardada: true } : {}),
    ...(f.id === activa ? { activa: true } : {}), ...(enVentana[f.id] ? { enVentana: true, ventana: nombreVentana(enVentana[f.id]) } : {}),
  }))
}
