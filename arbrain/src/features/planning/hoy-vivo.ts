/**
 * El «Hoy» del calendario cruza la medianoche (5 oct 2026, Daniel lo vio en su captura: la Planeación decía «dom 4 oct»
 * el lunes 5 con la app abierta). Lógica pura, sin React, para probarla sola (tests/planning/hoy-vivo.test.ts).
 */

/** Cambió el día civil y lo que estaba a la vista [desde, hasta) contenía el día que acaba de terminar: se sigue a hoy.
 *  Si Daniel había ido a otra fecha (otra semana, un mes pasado), se respeta donde está. Días como 'yyyy-MM-dd'. */
export function debeAvanzarAHoy(antes: string, hoy: string, desde: string, hasta: string): boolean {
  return antes !== hoy && antes >= desde && antes < hasta
}
