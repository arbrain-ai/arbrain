// Bandera de «Levy vivo» (7-8 nov 2026): la cara oficial con chip Arbrain, boca por atlas de visemas desde la alineación de
// ElevenLabs y el movimiento del 3D. APAGADA por defecto: sin ella Live, la voz y la cara son exactamente las de antes.
//
// Encender en un navegador: abrir cualquier página con `?levyVivo=1` (queda guardado en localStorage); `?levyVivo=0` la
// apaga. O a mano: localStorage.setItem('arbrain-levy-vivo', '1').
export const LEVY_VIVO_CLAVE = 'arbrain-levy-vivo'

export function levyVivoActivo(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('levyVivo')
    if (q === '1' || q === '0') window.localStorage.setItem(LEVY_VIVO_CLAVE, q)
    return window.localStorage.getItem(LEVY_VIVO_CLAVE) === '1'
  } catch { return false }
}

/** Separa objetos JSON de nivel superior en un flujo de texto (ElevenLabs manda uno por línea; no se depende del salto). */
export class SeparadorJson {
  private resto = ''
  push(texto: string): unknown[] {
    this.resto += texto
    const out: unknown[] = []
    let prof = 0, enCadena = false, escape = false, inicio = -1, corte = 0
    for (let i = 0; i < this.resto.length; i++) {
      const c = this.resto[i]
      if (enCadena) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') enCadena = false; continue }
      if (c === '"') enCadena = true
      else if (c === '{') { if (prof++ === 0) inicio = i }
      else if (c === '}' && prof > 0 && --prof === 0) { out.push(JSON.parse(this.resto.slice(inicio, i + 1))); corte = i + 1 }
    }
    this.resto = this.resto.slice(corte)
    return out
  }
}

export function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64), out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
