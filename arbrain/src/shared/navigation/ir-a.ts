'use client'
/**
 * Pedidos entre vistas: abrir otra vista ya en el sitio que hace falta. Los accesos de la barra lateral que nacieron aquí
 * el 3 nov 2026 (Loops · Habilidades · Artefactos) salieron el 5 nov (el dueño: «todo vive en taller»); queda el camino
 * de Tu negocio a Habilidades y de vuelta.
 */
import { abrirCasa, abrirSeccion } from '@/features/cabina/panel/Secciones'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'

/** Llave que lee MemoriaTaller al montarse (la misma de su estado guardado). */
export const LLAVE_PARTE_MEMORIA = 'arbrain.taller.memoria'

/**
 * Tu negocio › El sistema ↔ Habilidades (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). Cada skill del embudo
 * abre su lectura en Habilidades, y cada habilidad lleva de vuelta a la etapa de la que cuelga. La llave cubre la vista
 * aún sin montar y el evento a la ya montada.
 */
export const LLAVE_HABILIDAD = 'arbrain.taller.habilidad'
export const EVENTO_HABILIDAD = 'arbrain:habilidad'
export const LLAVE_ETAPA_NEGOCIO = 'arbrain.negocio.etapa'
export const EVENTO_ETAPA_NEGOCIO = 'arbrain:negocio-etapa'

export function abrirHabilidad(ruta: string) {
  try { localStorage.setItem(LLAVE_HABILIDAD, ruta); localStorage.setItem(LLAVE_PARTE_MEMORIA, 'skills') } catch { /* el evento basta si la vista ya está montada */ }
  pedirSegmentoTaller('memoria')
  abrirCasa('taller')
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
