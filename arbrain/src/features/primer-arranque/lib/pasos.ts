/**
 * Pasos del primer arranque del alumno, en orden (módulo puro para probarlos sin React). Cada paso nombra una sola
 * decisión; lo seguro es el botón principal y todo se cambia después en Ajustes. 0.1.2 (17 oct 2026, revierte
 * DECISIONES #11): vuelve el paso de computer use, solo donde existe (macOS y Windows). 29 oct 2026: «Dónde vive»
 * muestra los tres caminos (computadora, solo servidor, espejo) con su paso a paso y su prompt para Claude Code
 * (lib/caminos.ts); no decide nada, siempre se ve. 0.2.15 (29 oct 2026): el paso de computer use se vuelve «autonomia»,
 * que decide en una pantalla cuánto pregunta Levy (Autónomo recomendado, con su consentimiento) y, donde existe,
 * computer use.
 */
export const PASOS = ['bienvenida', 'legal', 'llaves', 'autonomia', 'monitoreo', 'donde', 'listo'] as const
export type Paso = typeof PASOS[number]
export const ETIQUETA: Record<Paso, string> = { bienvenida: 'Bienvenida', legal: 'Privacidad', llaves: 'Llaves', autonomia: 'Autonomía', monitoreo: 'Monitoreo', donde: 'Dónde vive', listo: 'Listo' }

/**
 * Pasos que de verdad se muestran (v1.1, A/B del primer arranque › secundaria 4). El monitoreo solo pregunta cuando
 * este build tiene a dónde enviar (`ARBRAIN_COHORTE_URL`, que el daemon reporta como `endpoint_configurado`); sin
 * destino es una decisión que no cambia nada y solo suma fricción. El ajuste sigue en Ajustes › Privacidad.
 * El paso de autonomía se muestra siempre; computer use (0.1.2: macOS y Windows; `/api/manos/interruptor` lo reporta
 * como `disponible`) aparece dentro de ese paso solo donde existe (`conComputerUse` lo decide la pantalla, no la lista).
 */
export function pasosVisibles(conMonitoreo: boolean, _conComputerUse = false): Paso[] {
  return PASOS.filter(p => p !== 'monitoreo' || conMonitoreo)
}
