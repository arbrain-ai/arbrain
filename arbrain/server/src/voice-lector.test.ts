import { describe, expect, it } from 'vitest'
import { marcasEnMs, wavPcm16 } from './voice.js'

describe('lector con marcas exactas (29 oct 2026)', () => {
  it('pasa cada marca de muestra a ms del audio entregado: a 22 050 Hz y dividida por el tempo de atempo', () => {
    const crudas = [{ desde: 5, largo: 3, muestra: 5120 }, { desde: 0, largo: 4, muestra: 0 }, { desde: 9, largo: 1, muestra: 10752 }]
    expect(marcasEnMs(crudas, 22050, 1)).toEqual([[0, 4, 0], [5, 3, 232.2], [9, 1, 487.6]])
    expect(marcasEnMs(crudas, 22050, 2)).toEqual([[0, 4, 0], [5, 3, 116.1], [9, 1, 243.8]])
    expect(marcasEnMs(crudas, 0, 1)).toEqual([])
  })

  it('el WAV declara exactamente las muestras que lleva (sin relleno de códec: la muestra N es la N que suena)', () => {
    const pcm = Buffer.alloc(22050 * 2)
    const wav = wavPcm16(pcm, 22050)
    expect(wav.length).toBe(44 + pcm.length)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt32LE(24)).toBe(22050)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.readUInt32LE(40)).toBe(pcm.length)
  })
})
