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

/** `lang` de una frase cuando no hay voz en español elegida: el sistema busca la más parecida. */
export function idiomaDeRespaldo(idiomas: readonly string[] | undefined | null): string {
  return idiomaPreferido(idiomas) ?? 'es-MX'
}

/** Ajustes › Voz cuando el sistema no trae ninguna voz en español (la frase saldría con acento inglés). */
export function consejoSinVozEspanol(p: Plataforma): string {
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
  if (texto === SIN_PERMISO_MAC) return 'macOS no le da el micrófono a Arbrain. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.'
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError' || nombre === 'PermissionDeniedError') {
    // Chromium dice «Permission denied by system» cuando lo bloquea el sistema operativo y «Permission denied» cuando
    // lo bloqueó la persona en el aviso de la app o del navegador.
    const sistema = /system/i.test(texto)
    if (p === 'windows') {
      if (sistema) return 'Windows no deja usar el micrófono. Abre Configuración › Privacidad y seguridad › Micrófono y activa «Acceso al micrófono» y «Permitir que las aplicaciones de escritorio accedan al micrófono»; luego vuelve a intentarlo.'
      return escritorio
        ? 'Arbrain no tiene el micrófono. Revisa Configuración › Privacidad y seguridad › Micrófono (acceso y apps de escritorio activados) y, si Arbrain te preguntó por el micrófono, elige «Permitir».'
        : 'El navegador bloqueó el micrófono. Pulsa el candado junto a la dirección, permite el micrófono y vuelve a intentarlo.'
    }
    if (p === 'mac') {
      return sistema || escritorio
        ? 'macOS no deja usar el micrófono. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono.'
        : 'El navegador bloqueó el micrófono. Permítelo en los ajustes del sitio y vuelve a intentarlo.'
    }
    return 'El micrófono está bloqueado. Permítelo en los ajustes del sitio o del sistema y vuelve a intentarlo.'
  }
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError' || nombre === 'OverconstrainedError') {
    return p === 'windows'
      ? 'No encuentro un micrófono. Conéctalo o elígelo en Configuración › Sistema › Sonido › Entrada.'
      : 'No encuentro un micrófono conectado.'
  }
  if (nombre === 'NotReadableError' || nombre === 'TrackStartError' || nombre === 'AbortError') {
    return 'Otro programa tiene tomado el micrófono (Teams, Zoom, Discord…). Ciérralo y vuelve a intentarlo.'
  }
  if (nombre === 'NotSupportedError' || nombre === 'TypeError' || /MediaRecorder|mediaDevices/i.test(texto)) {
    return 'Aquí no se puede grabar audio. Usa la app de Arbrain o un navegador al día (Chrome o Edge).'
  }
  return 'No pude usar el micrófono. Vuelve a intentarlo.'
}

/** Lo que dijo la transcripción cuando falló (el servidor ya manda una frase en español sin secretos). */
export function mensajeFalloTranscripcion(status: number, cuerpo: { error?: unknown; code?: unknown } | null): string {
  if (typeof cuerpo?.error === 'string' && cuerpo.error.trim() && cuerpo.error.length <= 240) return cuerpo.error.trim()
  if (status === 401 || status === 403) return 'Tu sesión se cerró. Vuelve a entrar y dicta de nuevo.'
  return 'No se pudo transcribir. Vuelve a intentarlo.'
}

/**
 * Ajustes › Esta computadora fuera de macOS. El Centro de permisos lee los de macOS (src-tauri/src/permisos.rs); en
 * Windows y Linux la app no tiene qué leer y antes pintaba «Permisos de macOS · 0 de 0 permitidos» y la firma de una Mac.
 * Aquí, en una línea, dónde decide SU sistema.
 */
export function permisosFueraDeMac(p: Plataforma): { titulo: string; texto: string } {
  if (p === 'windows') {
    return {
      titulo: 'Micrófono en Windows',
      texto: 'Windows decide el micrófono, no Arbrain: la primera vez que dictas, Arbrain te pregunta y eliges «Permitir». Si no te deja, abre Configuración › Privacidad y seguridad › Micrófono y activa «Acceso al micrófono» y «Permitir que las aplicaciones de escritorio accedan al micrófono».',
    }
  }
  return {
    titulo: 'Micrófono',
    texto: 'Tu sistema decide el micrófono: la primera vez que dictas, Arbrain te pregunta y eliges «Permitir».',
  }
}
