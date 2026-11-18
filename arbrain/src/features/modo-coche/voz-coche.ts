/**
 * La voz del modo coche: con el Orbe abierto, la respuesta de Arbrain suena dentro del Orbe.
 *
 * El audio lo hace tu propio Arbrain por la misma ruta del lector del chat (`/api/chat/tts`): en la edición cliente,
 * con TU llave de LemonFox (Ajustes › Voz). Sin llave, o si algo falla, suena la mejor voz en español del aparato.
 *
 * Detalles que importan en el coche:
 *   - iOS solo deja sonar audio si un toque lo «desbloqueó»: el toque que abre el Orbe reproduce un silencio en el MISMO
 *     elemento de audio que después dice las frases (`desbloquearVoz`).
 *   - Las respuestas largas se parten en pedazos (la primera oración corta) y los dos siguientes se piden mientras suena
 *     el actual: empieza a hablar en segundos, no en un minuto.
 *   - Un «oyente» (el modo coche) pausa el micrófono mientras suena la voz (eco de las bocinas), espera si estás hablando
 *     (no te pisa), mete un colchón de silencio al inicio de cada frase (el Bluetooth del coche se come las primeras
 *     sílabas) y mueve los subtítulos.
 * Límite de iOS: con el celular bloqueado o la app en segundo plano no hay voz (el texto queda escrito en el chat).
 */
import { mejorVozEspanol } from '@/features/chat/lib/chat-speech'
import { markdownHablable } from '@/features/chat/lib/lector-filtro'
import { registrarLector } from '@/features/chat/lib/lector-registro'

/** Un WAV de silencio de 0.1 s, armado aquí (sin depender de un archivo ni de un base64 que pueda venir roto). */
function silencio(): string {
  const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b)
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 2, true)
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))
}

let audio: HTMLAudioElement | null = null
let desbloqueado = false
const fila: string[] = []
let hablando = false

/** Lo que el modo coche escucha de la voz. Sin oyente (Orbe cerrado), no suena nada. */
export type OyenteVoz = {
  /** false: estás hablando; la frase espera en la fila (se reintenta con `reintentarVoz`). */
  puedeHablar?: () => boolean
  /** Justo antes de sonar la frase. */
  antesDeHablar?: (texto: string) => void
  /** Cuánto de la frase ya sonó (0 a 1). */
  alAvanzar?: (avance: number) => void
  /** La fila quedó vacía: Arbrain terminó de hablar (por ahora). */
  alTerminar?: () => void
  /** Silencio (ms) dentro del audio, al inicio de cada frase. */
  colchon?: (audio: ArrayBuffer, tipo: string | null) => ArrayBuffer
  /** Parte una frase larga en pedazos que empiezan a sonar antes. */
  partir?: (texto: string) => string[]
}
type Audio_ = { ok: true; buf: ArrayBuffer; tipo: string | null } | { ok: false; status: number }
/** El audio de los pedazos que siguen se pide mientras suena el actual. */
const adelantados = new Map<string, Promise<Audio_>>()
function pedirAudio(texto: string): Promise<Audio_> {
  return fetch('/api/chat/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto }) })
    .then(async (r): Promise<Audio_> => r.ok ? { ok: true, buf: await r.arrayBuffer(), tipo: r.headers.get('content-type') } : { ok: false, status: r.status })
}
function adelantar(): void {
  for (const t of fila.slice(0, 2)) if (!adelantados.has(t)) adelantados.set(t, pedirAudio(t).catch((): Audio_ => ({ ok: false, status: 0 })))
}
let oyente: OyenteVoz | null = null
/** Cada `callarVoz` sube la vuelta: lo que venía en camino de antes ya no suena. */
let vuelta = 0
let cortar: (() => void) | null = null

export function ponerOyenteVoz(o: OyenteVoz | null): void {
  oyente = o
  if (!o) callarVoz()
}
/** ¿Está sonando (o por sonar) una frase? */
export const vozOcupada = (): boolean => hablando || fila.length > 0
/** Ya terminaste de hablar: lo que esperaba en la fila puede sonar. */
export function reintentarVoz(): void { void siguiente() }
/** Interrumpir con un toque: se calla y se vacía lo que faltaba decir (el texto queda escrito en el chat). */
export function callarVoz(): void {
  vuelta++
  fila.length = 0
  adelantados.clear()
  cortar?.()
  try { window.speechSynthesis?.cancel() } catch { /* sin voz del sistema */ }
}

function elemento(): HTMLAudioElement {
  if (!audio) { audio = new Audio(); audio.preload = 'auto' }
  return audio
}

/** Dentro del toque que abre el Orbe: desbloquea el audio (iOS) y la voz del sistema (plan B). */
export function desbloquearVoz(): void {
  if (desbloqueado) return
  const a = elemento()
  a.src = silencio()
  a.play().then(() => { desbloqueado = true }).catch(() => { /* el próximo toque lo intenta otra vez */ })
  try { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance('')) } catch { /* sin voz del sistema */ }
}

async function siguiente(): Promise<void> {
  if (hablando) return
  if (fila.length && oyente?.puedeHablar && !oyente.puedeHablar()) return // estás hablando: espera
  const texto = fila.shift()
  if (!texto) return
  hablando = true
  const miVuelta = vuelta
  const sigue = () => miVuelta === vuelta
  try {
    const t0 = Date.now()
    const enCamino = adelantados.get(texto)
    adelantados.delete(texto)
    adelantar()
    const r = await (enCamino ?? pedirAudio(texto))
    if (!sigue()) { /* la callaron mientras llegaba */ } else if (r.ok) {
      const tipo = r.tipo || 'audio/mpeg'
      const blob = new Blob([oyente?.colchon ? oyente.colchon(r.buf, r.tipo) : r.buf], { type: tipo })
      const url = URL.createObjectURL(blob)
      const a = elemento()
      oyente?.antesDeHablar?.(texto)
      adelantar()
      const sono = await new Promise<boolean>(listo => {
        const avance = () => { if (a.duration > 0 && Number.isFinite(a.duration)) oyente?.alAvanzar?.(a.currentTime / a.duration) }
        const fin = (ok: boolean) => () => { a.removeEventListener('ended', bien); a.removeEventListener('error', mal); a.removeEventListener('timeupdate', avance); cortar = null; URL.revokeObjectURL(url); listo(ok) }
        const bien = fin(true), mal = fin(false)
        cortar = () => { a.pause(); bien() }
        a.addEventListener('ended', bien); a.addEventListener('error', mal); a.addEventListener('timeupdate', avance)
        a.src = url
        a.play().catch((e: unknown) => { registrarLector({ tipo: 'falla', motivo: `modo-coche: el navegador no dejó sonar (${e instanceof Error ? e.name : 'play'})`, servidor: true }); mal() })
      })
      if (sono) registrarLector({ tipo: 'primer-audio', ms: Date.now() - t0, toque: 'modo-coche', motor: 'servidor', velocidad: 1 })
      else if (sigue()) await conVozDelSistema(texto)
    } else {
      // Sin voz del servidor (p. ej. sin llave de LemonFox): la voz del aparato, para que igual se oiga.
      registrarLector({ tipo: 'motor', de: 'servidor', a: 'navegador', motivo: `modo-coche: el servidor respondió ${r.status}` })
      oyente?.antesDeHablar?.(texto)
      await conVozDelSistema(texto)
    }
  } catch (e) {
    registrarLector({ tipo: 'falla', motivo: `modo-coche: ${e instanceof Error ? e.message : 'sin red'}`, servidor: true })
    if (sigue()) { oyente?.antesDeHablar?.(texto); await conVozDelSistema(texto) }
  }
  hablando = false
  if (!fila.length) oyente?.alTerminar?.()
  void siguiente()
}

/** Plan B: la mejor voz en español del aparato (la misma elección que el lector del chat). */
function conVozDelSistema(texto: string): Promise<void> {
  return new Promise(listo => {
    try {
      const s = window.speechSynthesis
      const u = new SpeechSynthesisUtterance(texto)
      const voz = mejorVozEspanol(s.getVoices())
      if (voz) { u.voice = voz; u.lang = voz.lang } else u.lang = 'es-MX'
      const t = setTimeout(listo, 2000 + texto.length * 120) // por si el navegador no avisa el final
      u.onend = u.onerror = () => { clearTimeout(t); listo() }
      s.speak(u)
    } catch { listo() }
  })
}

/** Lo que se oye de una respuesta: sin tablas, bloques de código ni enlaces (las reglas del lector del chat). */
export function textoHablable(md: string): string {
  return markdownHablable(md)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [texto](enlace) → texto
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__|\*|_)(?=\S)([^*_]+?)(?<=\S)\1/g, '$2') // negritas y cursivas
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Una frase suelta (la voz al celular, `voz-celular.ts`): suena aunque el Orbe esté cerrado, en orden con las demás.
 * Con el Orbe abierto, va en pedazos como sus respuestas.
 */
export function decirFrase(frase: string): void {
  if (typeof window === 'undefined') return
  const t = frase.replace(/\s+/g, ' ').trim()
  if (!t) return
  fila.push(...(oyente?.partir ? oyente.partir(t) : [t]))
  adelantar()
  void siguiente()
}

/** Dice una respuesta dentro del Orbe (en orden, en pedazos). Solo con el modo coche abierto. */
export function decirEnCoche(respuesta: string): void {
  if (typeof window === 'undefined' || !oyente) return
  const t = textoHablable(respuesta)
  if (!t) return
  fila.push(...(oyente.partir ? oyente.partir(t) : [t]))
  adelantar()
  void siguiente()
}
