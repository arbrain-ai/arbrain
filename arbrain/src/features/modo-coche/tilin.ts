// El tilín del modo coche: avisa que el Orbe ya te escucha. Dos notas suaves que suben (mi y la agudos), hechas con
// senos en el mismo contexto de audio que abrió el toque (iOS lo exige). Suena a medio volumen y una vez por turno.

const NOTAS = [
  { t: 0, f: 1318.5, g: 0.3 },
  { t: 0.09, f: 1760, g: 0.24 },
]
const VOLUMEN = 0.4
/** Lo que suena fuerte: mientras, el micrófono no lo toma por tu voz. */
export const TILIN_MS = 450

/** Toca el tilín en este contexto de audio. Devuelve cuánto suena fuerte (ms). */
export function tocarTilin(contexto: AudioContext | null): number {
  if (!contexto || contexto.state === 'closed') return 0
  void contexto.resume().catch(() => {})
  const t0 = contexto.currentTime + 0.03
  const salida = contexto.createGain()
  salida.gain.value = VOLUMEN
  salida.connect(contexto.destination)
  for (const nota of NOTAS) {
    // La nota y un armónico tenue: claro sin sonar a pitido.
    for (const [multiplo, ganancia, caida] of [[1, 1, 0.9], [2, 0.18, 0.35]] as const) {
      const t = t0 + nota.t
      const o = contexto.createOscillator()
      const g = contexto.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(nota.f * multiplo, t)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(nota.g * ganancia, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + caida)
      o.connect(g)
      g.connect(salida)
      o.start(t)
      o.stop(t + caida + 0.05)
    }
  }
  return TILIN_MS
}
