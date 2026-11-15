/**
 * Voz y micrófono por sistema operativo (29 oct 2026, un fundador en Windows 11: «tengo la impresión de que en Windows las
 * cosas funcionan diferentes… lo de la voz por ejemplo»).
 *
 * Módulo puro (sin window, sin React): lo usan el dictado (VoiceInput), el lector (chat-speech) y Ajustes › Voz, y las
 * pruebas lo corren con plataformas simuladas.
 *
 *   - El idioma por defecto sale del sistema de la persona: en España, es-ES; sin un español en sus idiomas, es-MX.
 *   - Un fallo del micrófono se explica en una línea con el camino de SU sistema. Antes el botón se ponía rojo dos
 *     segundos y volvía, sin decir nada: en Windows el micrófono lo puede bloquear Windows (Privacidad), el aviso de la
 *     app o del navegador, u otro programa que lo tiene tomado (Teams, Zoom, Discord).
 *   - La grabación se manda con el tipo que de verdad grabó el navegador (WebView2 y Chrome: webm/opus; Safari: mp4).
 */

import { enIngles, tr, trMarca } from '@/shared/i18n'

export type Plataforma = 'windows' | 'mac' | 'linux' | 'otro'

/** Sistema a partir del user agent (WebView2 y Edge dicen «Windows NT»). */
export function plataformaDe(ua: string): Plataforma {
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh|iPhone|iPad/i.test(ua)) return 'mac'
  if (/Linux|X11/i.test(ua)) return 'linux'
  return 'otro'
}

/**
 * El español de la persona con su región (`es-ES`, `es-MX`, `es-AR`…), el primero que aparezca en sus idiomas. Sin
 * región («es») o sin español: null (el lector queda con su orden de siempre y `lang = 'es-MX'`).
 */
export function idiomaPreferido(idiomas: readonly string[] | undefined | null): string | null {
  for (const l of idiomas ?? []) {
    const m = /^es[-_]([a-z]{2}|\d{3})$/i.exec(l.trim())
    if (m) return `es-${m[1].toUpperCase()}`
  }
  return null
}

/** El inglés de la persona con su región (`en-US`, `en-GB`…), el primero de sus idiomas; sin uno, null. */
export function idiomaPreferidoIngles(idiomas: readonly string[] | undefined | null): string | null {
  for (const l of idiomas ?? []) {
    const m = /^en[-_]([a-z]{2})$/i.exec(l.trim())
    if (m) return `en-${m[1].toUpperCase()}`
  }
  return null
}

/**
 * `lang` de una frase cuando no hay voz en español elegida: el sistema busca la más parecida.
 *
 * `apple` (12 nov 2026, Daniel a las 07:41: «wtf porque se cambio la voz a voz de vieja si tenia la de juan»). En Apple
 * la voz no se fija por nombre (WebKit no expone a Juan, ver chat-speech.ts › currentVoice) y el `lang` decide quién
 * habla. Medido el 12 nov en un WKWebView del Studio (macOS en `es-419`, el mismo texto, volumen 0): `es-MX` → Juan
 * (29.1 s, Juan nativo 29.2 s); `es-419` → una voz compacta femenina (23.5 s; Mónica y Paulina compactas, 22.8 s). Desde
 * el 29 oct el lector mandaba el `es-419` del sistema y la voz de respaldo dejó de ser Juan. En Apple solo existen voces
 * de México y de España: España conserva la suya; cualquier otro español (419, US, AR…) pide la de México, que es Juan.
 */
export function idiomaDeRespaldo(idiomas: readonly string[] | undefined | null, apple = false, ingles = enIngles()): string {
  // Ajustes › Idioma en English (13 nov 2026): el inglés del sistema de la persona, o el de EE. UU.
  if (ingles) return idiomaPreferidoIngles(idiomas) ?? 'en-US'
  const suyo = idiomaPreferido(idiomas)
  if (apple) return suyo === 'es-ES' ? 'es-ES' : 'es-MX'
  return suyo ?? 'es-MX'
}

/**
 * Voces «novedad» de Apple (Eloquence y efectos): caricaturas, no lectura. Si una de ellas sale por el lector, es un
 * error (12 nov 2026: «voz de vieja» = Grandma/Abuela). Ningún respaldo las elige, en ningún sistema. Nombres en inglés y
 * en español (macOS los traduce según el idioma del sistema).
 */
const VOCES_NOVEDAD = /\b(abuel[ao]|grand(ma|pa)|eddy|flo|reed|rocko|sandy|shelley|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)\b/i

export function esVozNovedad(v: { name: string; voiceURI?: string }): boolean {
  return VOCES_NOVEDAD.test(v.name) || /\.eloquence\./i.test(v.voiceURI ?? '')
}

/** Ajustes › Voz cuando el sistema no trae ninguna voz en español (la frase saldría con acento inglés). */
export function consejoSinVozEspanol(p: Plataforma): string {
  if (enIngles()) return tr('Tu sistema no tiene una voz en inglés: agrega una en los ajustes de voz de tu sistema y reinicia Arbrain.')
  if (p === 'windows') return 'Tu Windows no tiene una voz en español. Agrégala en Configuración › Hora e idioma › Voz › Agregar voces (Español), reinicia Arbrain y listo.'
  if (p === 'mac') return 'Tu Mac no tiene una voz en español. Agrégala en Ajustes del Sistema › Accesibilidad › Contenido hablado › Voz del sistema › Gestionar voces.'
  return 'Tu sistema no tiene una voz en español: instala una (en Linux, por ejemplo, el paquete speech-dispatcher con espeak-ng).'
}

// ── Grabación del dictado ─────────────────────────────────────────────────────────────────────────────────────────

/** En orden de preferencia. Groq acepta los cuatro; webm/opus es lo que graba Chromium (WebView2, Chrome, Edge). */
export const FORMATOS_GRABACION = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const

/** El primer formato que el navegador sabe grabar, o `undefined` (que el navegador elija el suyo). */
export function formatoGrabacion(soporta: ((tipo: string) => boolean) | undefined): string | undefined {
  if (!soporta) return undefined
  return FORMATOS_GRABACION.find((t) => { try { return soporta(t) } catch { return false } })
}

/**
 * Dictado ligero (12 nov 2026, Daniel: «siento que se me acaban rapidísimo los datos al hablar contigo»). Safari graba AAC
 * sin tope de bitrate (el real lo dice la bitácora `dictado.jsonl`); para Whisper la voz a 32 kbps sobra. Solo el chat lo
 * pide, solo en un cliente remoto (el teléfono por Funnel): la app de la Mac y Live graban como siempre.
 */
export const DICTADO_BPS_LIGERO = 32_000

/** ¿Este dictado va por datos móviles? Remoto y fuera de la app de escritorio. Pura. */
export function dictadoLigero(hostname: string, escritorio: boolean): boolean {
  return !escritorio && !/^(localhost|127\.0\.0\.1|\[?::1\]?|tauri\.localhost)$/i.test(hostname)
}

/** Opciones del MediaRecorder: el formato elegido y, si va ligero, el tope de bitrate. Pura. */
export function opcionesGrabacion(mimeType: string | undefined, ligero: boolean): MediaRecorderOptions | undefined {
  const o: MediaRecorderOptions = {}
  if (mimeType) o.mimeType = mimeType
  if (ligero) o.audioBitsPerSecond = DICTADO_BPS_LIGERO
  return Object.keys(o).length ? o : undefined
}

/**
 * Línea de `dictado.jsonl` (servidor, junto a `lector.jsonl`): cuánto pesó cada dictado. Los campos llegan en el mismo
 * POST de la transcripción (cero pedidos extra); `bytes` y `tipo` los mide el servidor sobre el archivo recibido. Nunca
 * el texto ni el audio. Pura, para el test.
 */
export function lineaDictado(campos: { bytes: number; tipo: string; segundos?: unknown; bps_pedido?: unknown; bps_real?: unknown; ligero?: unknown }, equipo: string, ahora: Date): string {
  const num = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null }
  const segundos = num(campos.segundos)
  const kbps = segundos ? Math.round((campos.bytes * 8) / segundos / 100) / 10 : null
  return JSON.stringify({
    en: ahora.toISOString(), equipo: equipo.slice(0, 160), tipo: String(campos.tipo).slice(0, 60), bytes: campos.bytes,
    segundos, kbps_efectivo: kbps, bps_pedido: num(campos.bps_pedido), bps_real: num(campos.bps_real), ligero: campos.ligero === '1' || campos.ligero === true,
  }) + '\n'
}

/**
 * Tipo del archivo que se manda a transcribir: el que de verdad grabó el MediaRecorder, sin los códecs. El servidor
 * elige la extensión por él (`audioFilename`): un mp4 etiquetado como webm lo rechaza Groq.
 */
export function tipoDeGrabacion(mimeRecorder: string | undefined | null): { tipo: string; nombre: string } {
  const base = (mimeRecorder ?? '').toLowerCase().split(';')[0].trim()
  const ext: Record<string, string> = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }
  const e = ext[base]
  return e ? { tipo: base, nombre: `grabacion.${e}` } : { tipo: 'audio/webm', nombre: 'grabacion.webm' }
}

// ── Mensajes de fallo ─────────────────────────────────────────────────────────────────────────────────────────────

/** Error que lanza el dictado cuando el Centro de permisos de macOS dice que no (asegurarPermiso). */
export const SIN_PERMISO_MAC = 'Micrófono sin permiso'

/**
 * Una línea que dice qué pasó y dónde se arregla en SU sistema. `escritorio`: la app de Arbrain (WebView2 en Windows,
 * WKWebView en Mac); si no, un navegador.
 */
export function mensajeFalloMicrofono(error: unknown, p: Plataforma, escritorio: boolean): string {
  const nombre = (error as { name?: string } | null)?.name ?? ''
  const texto = (error as { message?: string } | null)?.message ?? String(error ?? '')
  if (texto === SIN_PERMISO_MAC) return tr('macOS no le da el micrófono a Arbrain. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.')
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError' || nombre === 'PermissionDeniedError') {
    // Chromium dice «Permission denied by system» cuando lo bloquea el sistema operativo y «Permission denied» cuando
    // lo bloqueó la persona en el aviso de la app o del navegador.
    const sistema = /system/i.test(texto)
    if (p === 'windows') {
      if (sistema) return tr('Windows no deja usar el micrófono. Abre Configuración › Privacidad y seguridad › Micrófono y activa «Acceso al micrófono» y «Permitir que las aplicaciones de escritorio accedan al micrófono»; luego vuelve a intentarlo.')
      return escritorio
        ? tr('Arbrain no tiene el micrófono. Revisa Configuración › Privacidad y seguridad › Micrófono (acceso y apps de escritorio activados) y, si Arbrain te preguntó por el micrófono, elige «Permitir».')
        : tr('El navegador bloqueó el micrófono. Pulsa el candado junto a la dirección, permite el micrófono y vuelve a intentarlo.')
    }
    if (p === 'mac') {
      return sistema || escritorio
        ? tr('macOS no deja usar el micrófono. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.')
        : tr('El navegador bloqueó el micrófono. Permítelo en los ajustes del sitio y vuelve a intentarlo.')
    }
    return tr('El micrófono está bloqueado. Permítelo en los ajustes del sitio o del sistema y vuelve a intentarlo.')
  }
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError' || nombre === 'OverconstrainedError') {
    return p === 'windows'
      ? tr('No encuentro un micrófono. Conéctalo o elígelo en Configuración › Sistema › Sonido › Entrada.')
      : tr('No encuentro un micrófono conectado.')
  }
  if (nombre === 'NotReadableError' || nombre === 'TrackStartError' || nombre === 'AbortError') {
    return tr('Otro programa tiene tomado el micrófono (Teams, Zoom, Discord…). Ciérralo y vuelve a intentarlo.')
  }
  if (nombre === 'NotSupportedError' || nombre === 'TypeError' || /MediaRecorder|mediaDevices/i.test(texto)) {
    return tr('Aquí no se puede grabar audio. Usa la app de Arbrain o un navegador al día (Chrome o Edge).')
  }
  return tr('No pude usar el micrófono. Vuelve a intentarlo.')
}

/** Lo que dijo la transcripción cuando falló (el servidor ya manda una frase en español sin secretos). */
export function mensajeFalloTranscripcion(status: number, cuerpo: { error?: unknown; code?: unknown } | null): string {
  if (typeof cuerpo?.error === 'string' && cuerpo.error.trim() && cuerpo.error.length <= 240) return cuerpo.error.trim()
  if (status === 401 || status === 403) return tr('Tu sesión se cerró. Vuelve a entrar y dicta de nuevo.')
  return tr('No se pudo transcribir. Vuelve a intentarlo.')
}

/**
 * Ajustes › Esta computadora fuera de macOS. El Centro de permisos lee los de macOS (src-tauri/src/permisos.rs); en
 * Windows y Linux la app no tiene qué leer y antes pintaba «Permisos de macOS · 0 de 0 permitidos» y la firma de una Mac.
 * Aquí, en una línea, dónde decide SU sistema.
 */
export function permisosFueraDeMac(p: Plataforma): { titulo: string; texto: string } {
  if (p === 'windows') {
    return {
      titulo: tr('Micrófono en Windows'),
      texto: tr('Windows decide el micrófono, no Arbrain: la primera vez que dictas, Arbrain te pregunta y eliges «Permitir». Si no te deja, abre Configuración › Privacidad y seguridad › Micrófono y activa «Acceso al micrófono» y «Permitir que las aplicaciones de escritorio accedan al micrófono».'),
    }
  }
  return {
    titulo: tr('Micrófono'),
    texto: tr('Tu sistema decide el micrófono: la primera vez que dictas, Arbrain te pregunta y eliges «Permitir».'),
  }
}
