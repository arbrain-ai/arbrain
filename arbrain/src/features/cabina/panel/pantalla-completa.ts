/**
 * Pantalla completa (5 oct 2026, Daniel: «no me puedo salir, y si lo cierro me saca y me corta el flow. ¿Cómo volver
 * fácilmente a ti? Y no solo el lienzo: en general Arbrain»).
 *
 * Un solo patrón en escritorio, tomado de Figma (el mismo atajo que entra, sale), Notion AI (el chat flota encima con
 * su hilo) y Linear/Claude (Esc y un «Volver» visible regresan al mismo lugar):
 *  · Pantalla completa = la pestaña del panel a todo el ancho. Nunca otra ruta: el chat sigue montado (conversación,
 *    borrador, dictado y scroll intactos) y Volver deja todo como estaba.
 *  · Levy flotante = ese MISMO chat, reacomodado como cajón abajo a la derecha (⌘J o el botón fijo).
 *  · Ir a una sección desde el chat, desde una pestaña, con Ctrl+1…7 o cuando Levy te lleva = pantalla completa de su
 *    pestaña. Las rutas de sección siguen para el teléfono y los enlaces directos.
 * Este archivo es lo puro (sin tiendas ni DOM), para probarlo con `node --test`.
 */
import type { AbrirInput, MostrarInput } from '../model'

/** La vista del panel a la que equivale un destino de `abrir` (Levy «te lleva»). null = solo existe como ruta. */
export function vistaDeDestino(d: Pick<AbrirInput, 'destino' | 'alcance' | 'fecha' | 'paginaId' | 'zona'>): MostrarInput | null {
  switch (d.destino) {
    case 'calendario': case 'sfcal': return { vista: 'calendario', alcance: d.alcance ?? 'semana', fecha: d.fecha }
    case 'objetivos': return { vista: 'objetivos', alcance: d.alcance ?? 'mes', fecha: d.fecha }
    case 'hoy': return { vista: 'objetivos', alcance: d.alcance ?? 'dia', fecha: d.fecha }
    // Un lienzo sin página no tiene pestaña (la pestaña es una página): sigue por su ruta, que abre la última usada.
    case 'lienzo': case 'sfmap': return d.paginaId ? { vista: 'lienzo', paginaId: d.paginaId, zona: d.zona } : null
    case 'centro': return { vista: 'finanzas' }
    case 'contenido': case 'rutinas': case 'finanzas': case 'reporte': case 'negocio': case 'trabajos':
      return { vista: d.destino }
  }
}

/** Ctrl+1…7 en escritorio: la ruta del atajo como pestaña. Chat y Artificial Brain siguen siendo rutas. */
export function vistaDeRuta(href: string): MostrarInput | null {
  const ruta = href.split('?')[0]
  // La escala viaja en la ruta (Ctrl+1 = `/calendar?mode=day`, 5 oct 2026).
  if (ruta === '/calendar') { const m = new URLSearchParams(href.split('?')[1] ?? '').get('mode'); return { vista: 'calendario', alcance: m === 'day' ? 'dia' : m === 'month' ? 'mes' : 'semana' } }
  if (ruta === '/ml-dashboard') return { vista: 'finanzas' }
  if (ruta === '/youtube') return { vista: 'contenido' }
  if (ruta === '/finanzas') return { vista: 'finanzas' }
  if (ruta === '/rutinas') return { vista: 'rutinas' }
  return null
}

export type AccionTecla = 'alternar' | 'levy' | 'salir' | 'cerrar-levy' | null
interface Tecla { code: string; key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented?: boolean }

/**
 * Qué hace una tecla con el patrón de pantalla completa.
 *  · ⌘. entra y sale (Figma usa ⌘\, que no existe en el teclado español; ⌘. es su alternativa).
 *  · ⌘J, dentro de pantalla completa, abre y cierra a Levy (fuera sigue siendo la terminal: allí el chat ya se ve).
 *  · Esc: con el foco en Levy flotante, lo esconde; si no, vuelve. Lo que ya atendió Esc (un menú, una selección) manda, y
 *    con el foco dentro de la pestaña el primer Esc es de ella (PantallaCompleta.tsx).
 */
export function accionDeTecla(e: Tecla, estado: { enfoque: boolean; focoEnLevy: boolean }): AccionTecla {
  const soloCmd = e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
  if (soloCmd && (e.code === 'Period' || e.key === '.')) return 'alternar'
  if (!estado.enfoque) return null
  if (soloCmd && e.code === 'KeyJ') return 'levy'
  if (e.key === 'Escape' && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey) return estado.focoEnLevy ? 'cerrar-levy' : 'salir'
  return null
}

/** Lo que se recuerda entre recargas (el despliegue recarga la app: vuelves igual). */
export interface Recuerdo { enfoque: boolean; levy: boolean; rutaPrevia?: string | null }
export const CLAVE_RECUERDO = 'arbrain.pantallaCompleta'
export function leerRecuerdo(raw: string | null): Recuerdo {
  try {
    const o = JSON.parse(raw ?? '{}') as Partial<Recuerdo>
    return { enfoque: o.enfoque === true, levy: o.levy === true, rutaPrevia: typeof o.rutaPrevia === 'string' && o.rutaPrevia.startsWith('/') ? o.rutaPrevia : null }
  } catch { return { enfoque: false, levy: false, rutaPrevia: null } }
}

/** Distancia al fondo del chat: lo que se conserva al volver (el ancho cambia, el fondo es la referencia estable). */
export const distanciaAlFondo = (el: { scrollHeight: number; scrollTop: number; clientHeight: number }) => Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)
export const scrollParaDistancia = (el: { scrollHeight: number; clientHeight: number }, distancia: number) => Math.max(0, el.scrollHeight - el.clientHeight - distancia)
