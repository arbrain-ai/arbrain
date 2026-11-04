'use client'
/**
 * Accesos de la barra lateral (3 nov 2026, Daniel viendo Claude y Cloudroom: «necesitamos a la izquierda algo como
 * artefactos… loops… skills, poder verlo desde acá»). Nada de esto es una pantalla nueva: Loops vive en Taller › Rutinas,
 * Habilidades en Taller › Memoria y los Artefactos son lo Guardado del panel. La barra solo los vuelve visibles a un clic.
 *
 * `irA` abre el Taller en su segmento y avisa con `EVENTO_IR` a la vista ya montada para que cambie de parte en sitio;
 * la llave de localStorage cubre el caso en que la vista aún no estaba montada (la lee al montarse).
 */
import { abrirCasa, abrirSeccion } from '@/features/cabina/panel/Secciones'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'

export type DestinoBarra = 'loops' | 'habilidades'
export const EVENTO_IR = 'arbrain:ir'

/** Llaves que leen RutinasCliente y MemoriaTaller al montarse (las mismas de su estado guardado). */
export const LLAVE_VISTA_RUTINAS = 'arbrain.rutinas.vista'
export const LLAVE_PARTE_MEMORIA = 'arbrain.taller.memoria'

export function irA(destino: DestinoBarra) {
  try {
    if (destino === 'loops') localStorage.setItem(LLAVE_VISTA_RUTINAS, 'loops')
    else localStorage.setItem(LLAVE_PARTE_MEMORIA, 'skills')
  } catch { /* sin almacenamiento: el evento de abajo basta si la vista ya está montada */ }
  pedirSegmentoTaller(destino === 'loops' ? 'rutinas' : 'memoria')
  abrirCasa('taller')
  window.dispatchEvent(new CustomEvent<DestinoBarra>(EVENTO_IR, { detail: destino }))
}

/** Para las vistas: corre `alLlegar` cuando la barra pide este destino. Devuelve la función que deja de escuchar. */
export function escucharIrA(destino: DestinoBarra, alLlegar: () => void): () => void {
  const f = (e: Event) => { if ((e as CustomEvent<DestinoBarra>).detail === destino) alLlegar() }
  window.addEventListener(EVENTO_IR, f)
  return () => window.removeEventListener(EVENTO_IR, f)
}

/**
 * Tu negocio › El sistema ↔ Habilidades (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). Cada skill del embudo
 * abre su lectura en Habilidades, y cada habilidad lleva de vuelta a la etapa de la que cuelga. Mismo patrón que `irA`:
 * la llave cubre la vista aún sin montar y el evento a la ya montada.
 */
export const LLAVE_HABILIDAD = 'arbrain.taller.habilidad'
export const EVENTO_HABILIDAD = 'arbrain:habilidad'
export const LLAVE_ETAPA_NEGOCIO = 'arbrain.negocio.etapa'
export const EVENTO_ETAPA_NEGOCIO = 'arbrain:negocio-etapa'

export function abrirHabilidad(ruta: string) {
  try { localStorage.setItem(LLAVE_HABILIDAD, ruta) } catch { /* el evento basta si la vista ya está montada */ }
  irA('habilidades')
  window.dispatchEvent(new CustomEvent<string>(EVENTO_HABILIDAD, { detail: ruta }))
}

export function abrirEtapaNegocio(etapaId: string) {
  try { localStorage.setItem(LLAVE_ETAPA_NEGOCIO, etapaId) } catch { /* sin almacenamiento */ }
  abrirSeccion({ vista: 'negocio' })
  window.dispatchEvent(new CustomEvent<string>(EVENTO_ETAPA_NEGOCIO, { detail: etapaId }))
}

/** Lee y borra un pedido pendiente (una sola vez: volver a montar la vista no lo repite). */
export function tomarPedido(llave: string): string | null {
  try { const v = localStorage.getItem(llave); if (v) localStorage.removeItem(llave); return v } catch { return null }
}

export function escucharPedido(evento: string, alLlegar: (valor: string) => void): () => void {
  const f = (e: Event) => { const v = (e as CustomEvent<string>).detail; if (typeof v === 'string') alLlegar(v) }
  window.addEventListener(evento, f)
  return () => window.removeEventListener(evento, f)
}
