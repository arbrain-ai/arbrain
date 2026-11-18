/**
 * El aviso de que el Orbe se pausó SOLO (en la computadora: 2 minutos sin oírte, o empezaste a escribir en el chat).
 * Dos notas que BAJAN (el tilín de escuchar sube): «ya no te escucho».
 */
export function tocarTonoPausa(contexto: AudioContext | null): void {
  if (!contexto || contexto.state === 'closed') return
  try {
    void contexto.resume().catch(() => {})
    const t0 = contexto.currentTime + 0.03
    for (const [t, f] of [[0, 1047], [0.14, 784]] as const) {
      const o = contexto.createOscillator()
      const g = contexto.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t0 + t)
      g.gain.linearRampToValueAtTime(0.16, t0 + t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.6)
      o.connect(g).connect(contexto.destination)
      o.start(t0 + t)
      o.stop(t0 + t + 0.65)
    }
  } catch { /* sin tono */ }
}
