/** Instrumentación de latencia por turno de Live. Marcas absolutas (performance.now); resumen en consola y en globalThis.__latenciaLive. */
export type Mark = 'voiceEnd' | 'endpoint' | 'sttDone' | 'send' | 'firstToken' | 'firstSentence' | 'firstByte' | 'firstSound'
const ORDER: Mark[] = ['voiceEnd', 'endpoint', 'sttDone', 'send', 'firstToken', 'firstSentence', 'firstByte', 'firstSound']
const LABEL: Record<Mark, string> = { voiceEnd: 'fin de voz', endpoint: 'silencio detectado', sttDone: 'transcripción', send: 'envío al LLM', firstToken: 'primer token', firstSentence: 'primera frase', firstByte: 'primer byte de audio', firstSound: 'primer sonido' }
export type TurnSummary = { marks: Partial<Record<Mark, number>>; steps: { label: string; ms: number }[]; totalMs: number | null; provider: string | null; fallback: string | null; agent: string }

export class LatencyTrace {
  marks: Partial<Record<Mark, number>> = {}
  provider: string | null = null
  fallback: string | null = null
  logged = false
  constructor(readonly agent = 'levy') {}
  /** Solo la primera marca de cada tipo cuenta. */
  mark(name: Mark, at = performance.now()) { if (this.marks[name] === undefined) this.marks[name] = at }
  summary(): TurnSummary {
    const present = ORDER.filter(m => this.marks[m] !== undefined)
    const steps = present.slice(1).map((m, i) => ({ label: `${LABEL[present[i]]} → ${LABEL[m]}`, ms: Math.round(this.marks[m]! - this.marks[present[i]]!) }))
    const start = this.marks.voiceEnd ?? this.marks.send, end = this.marks.firstSound
    return { marks: this.marks, steps, totalMs: start !== undefined && end !== undefined ? Math.round(end - start) : null, provider: this.provider, fallback: this.fallback, agent: this.agent }
  }
  /** Una sola vez por turno, cuando ya sonó o falló. */
  log() {
    if (this.logged) return
    this.logged = true
    const s = this.summary()
    const line = `[latencia-live] turno (${s.agent}, voz ${s.provider ?? '?'}${s.fallback ? `, respaldo por ${s.fallback}` : ''}): ${s.steps.map(x => `${x.label} ${x.ms} ms`).join(' | ')} | TOTAL ${s.totalMs ?? '?'} ms`
    console.info(line)
    const g = globalThis as { __latenciaLive?: TurnSummary[] }
    ;(g.__latenciaLive ??= []).push(s)
    if (g.__latenciaLive.length > 50) g.__latenciaLive.shift()
  }
}
