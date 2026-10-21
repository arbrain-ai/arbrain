/**
 * Entrar a Arbrain (5 oct 2026): las reglas puras del login, sin React ni Supabase, para probarlas.
 *
 * Daniel desde la laptop: «justo después de dar Enter no hay animación de clic, ni hover, ni nada que parezca
 * que realmente está buscando». La forma tiene cinco fases visibles y una sola dirección:
 *   quieta → entrando → (lenta) → adentro → (se abre el chat)
 *                     ↘ error → quieta, con lo escrito intacto
 */

export type FaseEntrada = 'quieta' | 'entrando' | 'lenta' | 'adentro' | 'error'

/** A partir de aquí «entrando» dice que la red va lenta y que sigue intentando: el silencio parece cuelgue. */
export const LENTA_MS = 5000

/** Solo rutas propias: `/algo`, nunca `//otro-sitio` ni una URL completa. Sin destino válido, el chat. */
export function destinoSeguro(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/chat'
}

/**
 * El error que ve Daniel. Supabase y el navegador hablan en inglés técnico; aquí se dice qué pasó y qué hacer.
 * Lo desconocido se muestra tal cual: inventar una causa es peor que un mensaje feo.
 */
export function mensajeDeError(crudo: string | null | undefined): { texto: string; campo: 'email' | 'password' | null } {
  const m = (crudo ?? '').trim()
  if (!m) return { texto: 'No se pudo entrar. Vuelve a intentarlo.', campo: null }
  if (/invalid login credentials|invalid.*password|wrong password/i.test(m)) return { texto: 'El correo o la contraseña no coinciden.', campo: 'password' }
  if (/email not confirmed/i.test(m)) return { texto: 'Este correo aún no está confirmado. Revisa tu bandeja.', campo: 'email' }
  if (/not authorized|access denied|unauthorized/i.test(m)) return { texto: 'Este correo no tiene acceso a Arbrain.', campo: 'email' }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/i.test(m)) {
    return { texto: 'Arbrain no respondió. Revisa tu conexión y vuelve a intentarlo; lo que escribiste sigue aquí.', campo: null }
  }
  return { texto: m, campo: null }
}
