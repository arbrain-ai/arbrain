'use client'
/**
 * «Escúchalo» (7 nov 2026, Daniel: «que sea 100% hablado contigo»). El panel se lee en voz de Levy, tramo por tramo, y la
 * luz va a lo que suena: cada tramo es su propio audio, así que el foco cambia cuando ese audio EMPIEZA (sincronía exacta,
 * sin estimar palabras). Voz del servidor (la de Levy) con Web Audio; si no hay, la voz del navegador en español.
 */
export interface Tramo { texto: string; foco: string | null }

type PedirVoz = ((texto: string, signal: AbortSignal) => Promise<ArrayBuffer | null>) | null

function vozNavegador(texto: string, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!s) return setTimeout(resolve, Math.min(9000, texto.length * 55))
    const u = new SpeechSynthesisUtterance(texto)
    const voces = s.getVoices().filter(v => /^es/i.test(v.lang))
    u.voice = voces.find(v => /juan/i.test(v.name)) ?? voces.find(v => /es[-_]MX/i.test(v.lang)) ?? voces[0] ?? null
    u.lang = u.voice?.lang ?? 'es-MX'
    u.rate = 1.15
    const fin = () => { signal.removeEventListener('abort', corta); resolve() }
    const corta = () => { s.cancel(); fin() }
    u.onend = fin; u.onerror = fin
    signal.addEventListener('abort', corta)
    s.speak(u)
  })
}

/** Lee los tramos en orden; `alFoco` recibe el foco del tramo que empieza a sonar (null al terminar). */
export async function narrar(tramos: Tramo[], pedir: PedirVoz, alFoco: (foco: string | null, i: number) => void, signal: AbortSignal) {
  const C = typeof window !== 'undefined' ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
  let ctx: AudioContext | null = null
  try { if (pedir && C) { ctx = new C(); if (ctx.state !== 'running') await ctx.resume().catch(() => {}) } } catch { ctx = null }
  const pedirBuffer = async (t: Tramo) => {
    if (!ctx || !pedir) return null
    try { const b = await pedir(t.texto, signal); return b ? await ctx.decodeAudioData(b) : null } catch { return null }
  }
  let siguiente = tramos.length ? pedirBuffer(tramos[0]) : null
  try {
    for (let i = 0; i < tramos.length; i++) {
      if (signal.aborted) break
      const buffer = await siguiente
      siguiente = i + 1 < tramos.length ? pedirBuffer(tramos[i + 1]) : null
      if (signal.aborted) break
      alFoco(tramos[i].foco, i)
      if (buffer && ctx) {
        await new Promise<void>(resolve => {
          const fuente = ctx!.createBufferSource()
          fuente.buffer = buffer
          fuente.connect(ctx!.destination)
          const corta = () => { try { fuente.stop() } catch { /* ya paró */ } resolve() }
          fuente.onended = () => { signal.removeEventListener('abort', corta); resolve() }
          signal.addEventListener('abort', corta)
          fuente.start()
        })
        await pausa(260, signal)
      } else {
        await vozNavegador(tramos[i].texto, signal)
      }
    }
  } finally {
    alFoco(null, -1)
    void ctx?.close().catch(() => {})
  }
}

const pausa = (ms: number, signal: AbortSignal) => new Promise<void>(r => { const t = setTimeout(r, ms); signal.addEventListener('abort', () => { clearTimeout(t); r() }) })
