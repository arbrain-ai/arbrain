/**
 * Red de seguridad del desfase de versiones (27 oct 2026). Si una pantalla truena y el servidor ya sirve otro build, el
 * error casi siempre es la mezcla de JS viejo con RSC nuevo (React #130): recargar la página lo cura. Se recarga sola una
 * vez por build del servidor; si el error sigue con el JS al día, se queda la pantalla de error (es un bug real).
 * Pura salvo `recargarSiHayVersionNueva`. Tests: tests/actualizacion/desfase-version.test.ts.
 */

export const CLAVE_RECARGA = 'arbrain:recarga-por-desfase'

/** ¿Recargar? Solo si el servidor sirve otro build y no lo intentamos ya con ese mismo build. */
export function debeRecargar(p: { buildMio: string | null | undefined; buildServidor: string | null; yaIntentado: string | null }): boolean {
  if (!p.buildServidor || !p.buildMio) return false
  if (p.buildServidor === p.buildMio) return false
  return p.yaIntentado !== p.buildServidor
}

/** Deja el error en el log del Studio (~/Library/Logs/Arbrain/errores-pantalla.jsonl). Nunca lanza. */
export function reportarErrorDePantalla(error: Error & { digest?: string }, donde: 'pantalla' | 'global' | 'rastro', componentes: string | null = null): void {
  try {
    void fetch('/api/error-pantalla', {
      // Sin keepalive: su tope de 64 KB tiraba en silencio el componentStack de un árbol profundo. Los primeros 8 KB bastan.
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ donde, ruta: location.pathname + location.search, mensaje: error?.message?.slice(0, 1_000), stack: error?.stack?.slice(0, 6_000), componentes: componentes?.slice(0, 8_000) ?? null, digest: error?.digest, build: process.env.NEXT_PUBLIC_ARBRAIN_BUILD }),
    }).catch(() => { /* sin servidor: queda la consola */ })
  } catch { /* idem */ }
}

/** Consulta /api/version y recarga la página si el error viene de un deploy nuevo. Devuelve si recargó. */
export async function recargarSiHayVersionNueva(): Promise<boolean> {
  let buildServidor: string | null = null
  try {
    const r = await fetch('/api/version', { cache: 'no-store', signal: AbortSignal.timeout(4_000) })
    buildServidor = ((await r.json()) as { build?: string | null }).build ?? null
  } catch { return false /* servidor reiniciando: se queda el botón «Recargar» */ }
  let yaIntentado: string | null = null
  try { yaIntentado = sessionStorage.getItem(CLAVE_RECARGA) } catch { /* sin storage: un intento por carga */ }
  if (!debeRecargar({ buildMio: process.env.NEXT_PUBLIC_ARBRAIN_BUILD, buildServidor, yaIntentado })) return false
  try { sessionStorage.setItem(CLAVE_RECARGA, buildServidor!) } catch { /* idem */ }
  window.location.reload()
  return true
}
