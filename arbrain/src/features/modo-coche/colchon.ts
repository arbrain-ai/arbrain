/**
 * Un colchón de silencio DENTRO del audio de cada frase del modo coche. El Bluetooth del coche tarda en despertar y se
 * come las primeras sílabas; un retraso con temporizador no sirve (lo que se pierde es el principio del audio), por
 * eso el silencio va adentro.
 *
 * La voz llega casi siempre en MP3; a veces en WAV. Para el MP3 se anteponen cuadros MPEG en silencio, copiando la
 * cabecera del primer cuadro real (misma frecuencia, mismo canal) con la información lateral en ceros: un cuadro así se
 * decodifica como silencio. Ante cualquier cosa rara, el audio vuelve intacto.
 */
import { injertarSilencioWav } from './silencio-wav'

/** Bitrates de Layer III (kbps), por versión: [MPEG-1, MPEG-2/2.5]. */
const BITRATES = [
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
]
const FRECUENCIAS: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

type Cuadro = { inicio: number; largo: number; muestras: number; frecuencia: number; cabecera: number }

/** Dónde empieza el audio: después de la etiqueta ID3v2 si la hay. */
function saltarId3(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0
  const tam = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
  return 10 + tam + (b[5] & 0x10 ? 10 : 0)
}

/** El primer cuadro MPEG Layer III del archivo (null si no es un MP3 que se entienda). */
export function primerCuadroMp3(audio: ArrayBuffer): Cuadro | null {
  const b = new Uint8Array(audio)
  for (let i = saltarId3(b); i + 4 <= b.length && i < saltarId3(b) + 4096; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue
    const version = (b[i + 1] >> 3) & 0x03 // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const capa = (b[i + 1] >> 1) & 0x03 // 1 = Layer III
    const br = (b[i + 2] >> 4) & 0x0f
    const fr = (b[i + 2] >> 2) & 0x03
    if (version === 1 || capa !== 1 || br === 0 || br === 15 || fr === 3) continue
    const kbps = BITRATES[version === 3 ? 0 : 1][br]
    const frecuencia = FRECUENCIAS[version][fr]
    const relleno = (b[i + 2] >> 1) & 0x01
    const muestras = version === 3 ? 1152 : 576
    const largo = Math.floor(((muestras / 8) * kbps * 1000) / frecuencia) + relleno
    if (largo < 24 || i + largo > b.length) continue
    const cabecera = (b[i] << 24 >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
    return { inicio: i, largo, muestras, frecuencia, cabecera }
  }
  return null
}

/** Antepone `ms` de silencio a un MP3 (cuadros mudos con la cabecera del primero). */
export function colchonMp3(audio: ArrayBuffer, ms: number): ArrayBuffer {
  try {
    const c = primerCuadroMp3(audio)
    if (!c || ms <= 0) return audio
    // La cabecera del cuadro mudo: sin relleno y sin CRC (bit de protección = 1), para que su largo sea fijo.
    const h = (c.cabecera & ~0x200 | 0x10000) >>> 0
    const sinRelleno = new Uint8Array([h >>> 24, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff])
    const version = (sinRelleno[1] >> 3) & 0x03
    const kbps = BITRATES[version === 3 ? 0 : 1][(sinRelleno[2] >> 4) & 0x0f]
    const largo = Math.floor(((c.muestras / 8) * kbps * 1000) / c.frecuencia)
    const cuantos = Math.max(1, Math.ceil((ms / 1000) * c.frecuencia / c.muestras))
    const b = new Uint8Array(audio)
    const out = new Uint8Array(b.length + cuantos * largo)
    out.set(b.subarray(0, c.inicio), 0) // la etiqueta ID3, tal cual
    for (let k = 0; k < cuantos; k++) out.set(sinRelleno, c.inicio + k * largo) // el resto del cuadro queda en ceros
    out.set(b.subarray(c.inicio), c.inicio + cuantos * largo)
    return out.buffer
  } catch {
    return audio
  }
}

/** El colchón según el tipo: WAV o MP3. Lo demás, intacto. */
export function conColchon(audio: ArrayBuffer, tipo: string | null, ms: number): ArrayBuffer {
  const t = (tipo ?? '').toLowerCase()
  if (t.includes('wav')) return injertarSilencioWav(audio, ms)
  if (t.includes('mpeg') || t.includes('mp3')) return colchonMp3(audio, ms)
  return audio
}
