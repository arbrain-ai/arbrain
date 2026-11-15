'use client'
/**
 * Los botones de una isla nativa (14 nov 2026). El lienzo pasa su `ir(destino)` (el mismo que usa para las islas HTML,
 * con su lista blanca); sin lienzo (la galería), `irPorDefecto` abre el destino con las funciones de la app: secciones del
 * panel, el Taller, la vista documento y el opener del sistema para las URLs de fuera (lib/navegador.ts, nunca
 * `window.open` directo). Lo que no está en la lista blanca (canvas/islas/destinos.ts) se ignora.
 */
import { useCallback } from 'react'
import { leerDestino } from '@/features/canvas/islas/destinos'
import { abrirCasa, abrirSeccion } from '@/features/cabina/panel/Secciones'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'
import { abrirEnNavegador } from '@/lib/navegador'

/** Pedido de volar a un capítulo del lienzo: lo escucha la pizarra (si no hay pizarra, no pasa nada). */
export const EVENTO_CAPITULO = 'arbrain:lienzo-capitulo'

const esPropia = (u: URL) => typeof window !== 'undefined' && (u.origin === window.location.origin || /(^|\.)arbrain\.ai$/i.test(u.hostname))

export function irPorDefecto(destino: string) {
  const d = leerDestino(destino, esPropia)
  if (!d) { console.info('[isla] destino fuera de la lista blanca:', destino); return }
  switch (d.tipo) {
    case 'panel': abrirSeccion(d.input); return
    case 'casa': if (d.segmento) pedirSegmentoTaller(d.segmento); abrirCasa(d.casa); return
    case 'doc': abrirSeccion({ vista: 'documento', ruta: d.ruta }); return
    case 'url': void abrirEnNavegador(d.url); return
    case 'capitulo': window.dispatchEvent(new CustomEvent(EVENTO_CAPITULO, { detail: { capitulo: d.capitulo } })); return
    case 'pagina': abrirSeccion({ vista: 'lienzo', paginaId: d.paginaId }); return
  }
}

/** El `ir` de una isla: el del host si lo hay; si no, el de la app. */
export function useIr(ir?: (destino: string) => void) {
  return useCallback((destino: string) => (ir ?? irPorDefecto)(destino), [ir])
}
