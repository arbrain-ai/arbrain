/**
 * Colchón de silencio DENTRO de un WAV. Algunos proveedores de voz recortan TODO el silencio inicial (el ataque de la
 * voz queda en el milisegundo cero) y cualquier arranque del reproductor (elemento recién cargado, bocinas Bluetooth
 * despertando) se traga los primeros milisegundos: letras reales. Los temporizadores solo retrasan el play; el único
 * colchón que protege el contenido vive adentro del WAV.
 *
 * Solo PCM 16-bit. Ante cualquier otro formato o WAV malformado devuelve el audio original intacto.
 */

export function injertarSilencioWav(audio: ArrayBuffer, ms: number): ArrayBuffer {
  try {
    const dv = new DataView(audio)
    if (audio.byteLength < 44) return audio
    if (dv.getUint32(0, false) !== 0x52494646) return audio // "RIFF"
    if (dv.getUint32(8, false) !== 0x57415645) return audio // "WAVE"

    let off = 12
    let canales = 0
    let rate = 0
    let bits = 0
    let dataOff = -1
    let dataLen = 0
    while (off + 8 <= audio.byteLength) {
      const id = dv.getUint32(off, false)
      const size = dv.getUint32(off + 4, true)
      if (id === 0x666d7420) {
        // "fmt " — solo PCM (1) sin comprimir
        if (dv.getUint16(off + 8, true) !== 1) return audio
        canales = dv.getUint16(off + 10, true)
        rate = dv.getUint32(off + 12, true)
        bits = dv.getUint16(off + 22, true)
      } else if (id === 0x64617461) {
        // "data"
        dataOff = off + 8
        dataLen = Math.min(size, audio.byteLength - dataOff)
        break
      }
      off += 8 + size + (size % 2)
    }
    if (dataOff < 0 || bits !== 16 || rate === 0 || canales === 0) return audio

    const bytesSilencio = Math.round((rate * ms) / 1000) * canales * 2
    const out = new Uint8Array(audio.byteLength + bytesSilencio)
    const src = new Uint8Array(audio)
    out.set(src.subarray(0, dataOff), 0) // cabecera + chunks previos, tal cual
    out.set(src.subarray(dataOff), dataOff + bytesSilencio) // la voz, después del colchón

    const dvOut = new DataView(out.buffer)
    dvOut.setUint32(4, out.byteLength - 8, true) // tamaño RIFF
    dvOut.setUint32(dataOff - 4, dataLen + bytesSilencio, true) // tamaño data
    return out.buffer
  } catch {
    return audio
  }
}
