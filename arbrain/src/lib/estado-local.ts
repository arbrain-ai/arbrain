/**
 * Salida limpia de una pantalla de error que se repite (31 oct 2026). Un fundador en Windows, recién actualizado a la
 * 0.2.17, quedó atrapado en «Esta pantalla tuvo un problema» (TypeError: Cannot read properties of undefined (reading
 * 'id')): ni «Recargar» ni «Ir al inicio» lo quitaban, porque las dos vuelven a pintar lo mismo con lo que el navegador
 * guardó de la vista (la última conversación, el panel y sus pestañas, la caché de mensajes y la del service worker).
 *
 * Desde aquí, los dos botones de la pantalla de error primero tiran ese estado de vista y luego cargan de nuevo, sin el
 * `?session=` que reabriría la misma conversación. Lo que es de la persona no se toca: borradores del chat, envíos y
 * cambios del calendario pendientes, comentarios sin mandar, tema y estilo. Sus conversaciones y archivos viven en su
 * servidor, no en el navegador. Pruebas: tests/soporte/estado-local.test.ts. Reporte: docs/builds/soporte-pantalla-id-2026-10-31.
 */
import { PREFIJO_INSTANTANEAS } from '@/lib/local-first/browser-store'

/** Llaves de localStorage que son de la persona (no de la vista): se conservan. */
export const CONSERVAR: readonly RegExp[] = [
  /^arbrain:composer:/, // borradores del chat (composer-drafts.ts)
  /pending/i, // envíos del calendario y de objetivos que aún no confirma el servidor
  /draft|borrador/i,
  /^arbrain\.comentariosEntregable$/, // comentarios del Documento sin mandar
  /^mission-control-theme/, // tema elegido y hasta cuándo
  /^arbrain-estilo$/,
  /^arbrain-hora-forzada$/,
]

/** Qué llaves de localStorage se quitan: todo lo que no es de la persona. Pura. */
export function clavesDeVista(claves: Iterable<string>): string[] {
  return [...claves].filter(k => !CONSERVAR.some(re => re.test(k)))
}

/**
 * A dónde ir tras limpiar. «Ir al inicio» va a `/`; «Recargar» se queda en la misma pantalla pero sin búsqueda ni
 * ancla (un `?session=` reabriría la conversación que falló). Pura.
 */
export function destinoTrasLimpiar(href: string, inicio: boolean): string {
  if (inicio) return '/'
  try {
    const u = new URL(href)
    return u.pathname || '/'
  } catch { return '/' }
}

interface Almacen { readonly length: number; key(i: number): string | null; removeItem(k: string): void; clear?(): void }

function llavesDe(s: Almacen): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k != null) out.push(k) }
  return out
}

/** Quita el estado de vista de localStorage y vacía sessionStorage. Devuelve las llaves quitadas. Nunca lanza. */
export function limpiarAlmacenes(local: Almacen | null, sesion: Almacen | null): string[] {
  const quitadas: string[] = []
  if (local) {
    try { for (const k of clavesDeVista(llavesDe(local))) { try { local.removeItem(k); quitadas.push(k) } catch { /* sigue */ } } } catch { /* sin acceso */ }
  }
  if (sesion) {
    try { if (sesion.clear) sesion.clear(); else for (const k of llavesDe(sesion)) sesion.removeItem(k) } catch { /* sin acceso */ }
  }
  return quitadas
}

const conTope = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>(r => setTimeout(r, ms))])

/** Cachés del navegador: instantáneas de IndexedDB (no borradores ni colas), service worker y su Cache Storage. */
async function limpiarCaches(): Promise<void> {
  await Promise.allSettled([
    (async () => {
      const { keys, delMany } = await import('idb-keyval')
      const viejas = (await keys()).filter(k => typeof k === 'string' && k.startsWith(PREFIJO_INSTANTANEAS))
      if (viejas.length) await delMany(viejas)
    })(),
    (async () => {
      if (!('serviceWorker' in navigator)) return
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    })(),
    (async () => {
      if (typeof caches === 'undefined') return
      for (const n of await caches.keys()) await caches.delete(n)
    })(),
  ])
}

/**
 * Lo que hacen «Recargar» e «Ir al inicio» en la pantalla de error: limpia (con tope de 3 s: si algo se cuelga, se
 * navega igual) y carga de nuevo. Una carga completa, no navegación suave: el estado en memoria que falló se va con ella.
 */
export async function salirLimpio(inicio: boolean): Promise<void> {
  try {
    limpiarAlmacenes(typeof localStorage === 'undefined' ? null : localStorage, typeof sessionStorage === 'undefined' ? null : sessionStorage)
    await conTope(limpiarCaches(), 3_000)
  } catch { /* lo que no se pudo limpiar no detiene la salida */ }
  location.replace(destinoTrasLimpiar(location.href, inicio))
}
