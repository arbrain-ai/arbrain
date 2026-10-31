/**
 * ¿ESTE NAVEGADOR DECODIFICA OGG OPUS SIN CORRER LAS MARCAS? (31 oct 2026)
 *
 * El lector remoto (el teléfono) pide el audio en Ogg Opus: ~11 % del WAV (voz-servidor.ts › formatoDelLector). Las
 * marcas exactas del 29 oct exigen que la muestra N decodificada sea la N que sintetizó la voz: el decodificador debe
 * respetar el `pre-skip` del encabezado Opus y el recorte final de Ogg. Medido en el WKWebView de macOS 27: 0 muestras
 * de corrimiento. En un navegador que no lo cumpla (o que no conozca Ogg) se pide WAV, como hasta el 30 oct.
 *
 * La sonda: 120 ms a 24 kHz con un impulso en el ms 60 exacto, codificada con los MISMOS ajustes que el servidor
 * (libopus 40 kbps, complejidad 0; 753 bytes). Se decodifica una vez en un contexto fuera de línea (no toca la sesión de
 * audio) y pasa si dura 120 ms y el pico cae a ±1 ms de su lugar.
 */
export const SONDA_OPUS_B64 = 'T2dnUwACAAAAAAAAAABTdURCAAAAAFYc6nIBE09wdXNIZWFkAQE4AcBdAAAAAABPZ2dTAAAAAAAAAAAAAFN1REIBAAAAgQOnLwE8T3B1c1RhZ3MMAAAATGF2ZjYzLjEuMTAxAQAAABwAAABlbmNvZGVyPUxhdmM2My4xLjEwMSBsaWJvcHVzT2dnUwAEuBcAAAAAAABTdURCAgAAAGNF25EHA2xjeFVVVNj//thk2l4sYaNFJN4woL2qGtnBkJALvKpjcHnk0R9oV75dyOgBYv9e371VMmX8zJK6ffgSOJFhn0r3GQ1cB2929DZy7+bLGf//s6jsWB0ep+5MlirJOsVXRTMAcAcGl/LGRQN9ux67tbHrUgRMVdhi/eQ5cub5DDH+gu4ic+anfPGjdQev1zqGUqnIw5rrFntncMArzKtZjqqbnrk0Vq8B6YqmqJG6IiWG26vGGtMJIuLkXSDH7Fmvkktw7Rr4rbaGWx3566xvANXbgVsetUqzY9gCOy0/FTerdt6ENAHW8OuqTeeQoj73uaIHXs8Aw1cBkf9gPXD+E/4Y4lmuWrkT+o1DsrFA/ED0qcy3AQmVi2MSjnl7z+e3AqsM2Kb36YjCkXugmSAvAs8KEdFhcogvTs4SisPiI5D4H3h97VyLG3dR7CJN/WG3Rthqo4AzOhc3mWfIJI5/J+8tDmF3DkCQilqLhlOILkGOVF6+6FxlEfGyHlCLMf2xuUeuul3uM9HVIjqLkRY0xa1DFFOThPbMAvGHsUCuWI7AAABGejjYarK+ueSWpDFxJcwi37OmjmJf37Z7NUm3ORryUHsdfNavreQbEA/GyGsx5QhcH9DJNRpd7jPR1SI6i5EWNMWtQxRTk4T2zALxh7FArliO1u9jsSSH2GxPFBSBBk6tzPMMSmQGOlQhJMq4jkwRUWt5khHAySPDQLTC4INkPjcoRZjLg/oZJqNLvcZ6OqRHUXIixpi1qAOU5OE9sN+Rh7FArliMwHRx96f2'
export const SONDA_DURACION_S = 0.12
export const SONDA_PICO_S = 0.06

/** ¿El audio decodificado de la sonda está donde debe? Pura, para el test. */
export function sondaOpusExacta(muestras: Float32Array, sampleRate: number, duracion: number): boolean {
  if (!(sampleRate > 0) || Math.abs(duracion - SONDA_DURACION_S) > 0.002) return false
  let pico = 0
  let donde = -1
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.abs(muestras[i])
    if (v > pico) { pico = v; donde = i }
  }
  return pico > 0.3 && Math.abs(donde / sampleRate - SONDA_PICO_S) <= 0.001
}

/** Bytes de la sonda (atob existe en el navegador y en node ≥ 16). */
export function bytesSondaOpus(): ArrayBuffer {
  const s = atob(SONDA_OPUS_B64)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u.buffer
}
