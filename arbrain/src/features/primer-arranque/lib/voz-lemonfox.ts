/**
 * Elegir la voz de LemonFox en Ajustes › Voz (13 nov 2026).
 *
 * Las voces en español que LemonFox publica en lemonfox.ai/apis/text-to-speech (sección «Spanish», consultada el
 * 13 nov 2026; `noel` salió el 18 nov porque no se pudo confirmar). La elección vive en una cookie local de la app (sin llaves, solo el nombre de la voz): así cada
 * lectura que pasa por `/api/chat/tts` la lleva sin tocar a quien llama. El daemon la vuelve a validar
 * (server/src/cliente/voz.ts › VOCES_LEMONFOX); lo que no esté en la lista suena con la de siempre (`alex`). Con la app
 * en inglés se usa la voz de inglés y esta elección no aplica.
 */
import { trMarca } from '@/shared/i18n'

export const VOCES_LEMONFOX = [
  { id: 'alex', etiqueta: 'Alex', detalle: trMarca('hombre · la de siempre') },
  { id: 'dora', etiqueta: 'Dora', detalle: trMarca('mujer') },
] as const

export type VozLemonfox = (typeof VOCES_LEMONFOX)[number]['id']
export const VOZ_LEMONFOX_DEFECTO: VozLemonfox = 'alex'
export const COOKIE_VOZ_LEMONFOX = 'arbrain-voz-lemonfox'

export function vozLemonfoxValida(v: unknown): VozLemonfox | null {
  return typeof v === 'string' && VOCES_LEMONFOX.some(x => x.id === v) ? v as VozLemonfox : null
}

/** La voz guardada en este dispositivo (o la de siempre). Solo en el navegador. */
export function leerVozLemonfox(): VozLemonfox {
  if (typeof document === 'undefined') return VOZ_LEMONFOX_DEFECTO
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_VOZ_LEMONFOX}=([^;]*)`))
  return vozLemonfoxValida(m ? decodeURIComponent(m[1]) : null) ?? VOZ_LEMONFOX_DEFECTO
}

/** Guarda la voz en este dispositivo (10 años; mismo origen, nunca sale de la app). */
export function guardarVozLemonfox(v: VozLemonfox): void {
  if (typeof document === 'undefined' || !vozLemonfoxValida(v)) return
  document.cookie = `${COOKIE_VOZ_LEMONFOX}=${encodeURIComponent(v)}; Path=/; Max-Age=315360000; SameSite=Lax`
}

/** La frase de «Probar» (en español: las voces son de español). */
export const FRASE_PRUEBA_VOZ = 'Hola. Así sueno cuando te leo las respuestas.'
