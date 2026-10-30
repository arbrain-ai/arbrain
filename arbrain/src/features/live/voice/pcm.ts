/** Incremental s16le decoder. HTTP chunks are not aligned to sample boundaries. */
export class PcmDecoder {
  private carry: number | null = null
  decode(chunk: Uint8Array): Float32Array {
    const input = this.carry === null ? chunk : Uint8Array.from([this.carry, ...chunk])
    const n = Math.floor(input.byteLength / 2)
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
    const result = new Float32Array(n)
    for (let i = 0; i < n; i++) result[i] = view.getInt16(i * 2, true) / 32768
    this.carry = input.byteLength % 2 ? input[input.byteLength - 1] : null
    return result
  }
  finish() { if (this.carry !== null) throw new Error('El audio terminó con una muestra incompleta.') }
}
export function rms(samples: Float32Array) {
  if (!samples.length) return 0
  let sum = 0
  for (const value of samples) sum += value * value
  return Math.sqrt(sum / samples.length)
}
/** Token stream → natural speech clauses; short first clause reduces useful response latency. */
export class SpeechClauses {
  private pending = ''
  private first = true
  push(delta: string): string[] {
    this.pending += delta
    const output: string[] = []
    while (this.pending) {
      const min = this.first ? 14 : 65
      let end = -1
      for (let i = 0; i < this.pending.length - 1; i++) {
        const ch = this.pending[i]
        if (i >= min && /[.!?;\n]/.test(ch) && /\s/.test(this.pending[i+1])) { end = i+1; break }
        // Primeras palabras: tras ~5 palabras (24 caracteres) el primer trozo sale en el siguiente espacio, sin esperar la puntuación.
        if (this.first && i >= 24 && ch === ' ') { end = i + 1; break }
        if (this.first && i >= 14 && /[,:]/.test(ch) && /\s/.test(this.pending[i+1])) { end=i+1;break }
      }
      if (end < 0 && this.pending.length > 450) end = this.pending.lastIndexOf(' ', 450)
      if (end <= 0) break
      const clause = this.pending.slice(0,end).trim()
      this.pending = this.pending.slice(end).trimStart()
      if (clause) { output.push(clause);this.first=false }
    }
    return output
  }
  flushSentence() {
    const text=this.pending.trim()
    if(!/[.!?]$/.test(text)||/\d\.$/.test(text))return []
    return this.flush()
  }
  flush() { const text=this.pending.trim(); this.pending='';return text ? [text] : [] }
}
/** Text-to-speech projection: code and tool protocol remain visual, not spoken. */
export function speechText(text:string){
 return text.replace(/```[\s\S]*?(?:```|$)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\[[^\]]*$/g,'').replace(/<[^>]*>/g,' ').replace(/\[panel:[^\]]*\]/g,' ').replace(/[*_`#]/g,'').replace(/\s+/g,' ').trimStart()
}
