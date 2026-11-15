/**
 * ¿ESTE NAVEGADOR DECODIFICA OGG OPUS SIN CORRER LAS MARCAS? (31 oct 2026)
 *
 * El lector remoto (el teléfono) pide el audio en Ogg Opus: ~11 % del WAV (voz-servidor.ts › formatoDelLector). Las
 * marcas exactas del 29 oct exigen que la muestra N decodificada sea la N que sintetizó la voz: el decodificador debe
 * respetar el `pre-skip` del encabezado Opus y el recorte final de Ogg. Medido en el WKWebView de macOS 27: 0 muestras
 * de corrimiento. En un navegador que no lo cumpla (o que no conozca Ogg) se pide WAV, como hasta el 30 oct.
 *
 * La sonda: 120 ms a 24 kHz con un impulso en el ms 60 exacto, codificada con los MISMOS ajustes que el servidor
 * (libopus 24 kbps, complejidad 0; 516 bytes). Se decodifica una vez en un contexto fuera de línea (no toca la sesión de
 * audio) y pasa si dura 120 ms y el pico cae a ±1 ms de su lugar.
 *
 * Se genera con `node scripts/qa/sonda-opus.mjs`, que lee el bitrate de `server/src/voice.ts` (un test exige que
 * SONDA_OPUS_KBPS coincida). 12 nov 2026: 40 → 24 kbps; medida en WKWebView de macOS y Safari de iOS 26.5, pico en el
 * ms 60 exacto y 120 ms justos.
 */
export const SONDA_OPUS_KBPS = 24
export const SONDA_OPUS_B64 = 'T2dnUwACAAAAAAAAAAB2IJXvAAAAAL3EslYBE09wdXNIZWFkAQE4AcBdAAAAAABPZ2dTAAAAAAAAAAAAAHYgle8BAAAApm57zwE8T3B1c1RhZ3MMAAAATGF2ZjYzLjEuMTAxAQAAABwAAABlbmNvZGVyPUxhdmM2My4xLjEwMSBsaWJvcHVzT2dnUwAEuBcAAAAAAAB2IJXvAgAAAA5TZ0gHA0I7QDM0NNj//thk2l4sjuLnSxN0oN/x6W6fjQ0+kXBROZm9/uHpDd4VvbsTgRV77DQTa/bd2qnmG9q8H3TofYuDwPuijKXk6UVmrthi/eQ6gw7meWBe78aAH6YvUftSH4EGeMcM9VoeNlOmDLOryOnpImcnZbRxN/lHP+0fisIfCVydK6ps2BoFRw+YYhH52TvAVuPcnmy48wz+CK9I/maVyMC8zfLAeZP6ms4jOV11NpP9x1tkvNzTNVr5KlVTVLhGjieW0NhsRHtlK/6FvmtiRY0wRY0XHyI+A4vH1n9j6nKcyEkwQGG5Xa3Hn6GUSk6OVcQUAArPTthsTxQUlceGaspCcN71zCu0nTlykZ+qcwSsB6nKcyEkwQGG5Xa3Hn6MVEpOjlXEF70dJKXYbW2z2mu29qLewHDx3nEM/PtVSlnsfm0CD7qf0TMhJMEBhuV2tx5lGKiUneANxBRnp3n9'
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
