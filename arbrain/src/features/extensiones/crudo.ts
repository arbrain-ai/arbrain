/**
 * El panel de una extensión, servido aislado (21 nov 2026, SPEC §2). Igual que las islas del Lienzo: iframe
 * `sandbox="allow-scripts"` (origen opaco, sin cookie), por URL firmada que solo abre la carpeta `panel/` de ESA extensión
 * instalada, con la CSP de las vistas (`connect-src 'none'`: sin red; todo dato entra por `postMessage` desde Arbrain).
 * Puro (tests/extensiones/crudo.test.ts); la ruta es `app/api/extensiones/crudo/[token]/[...ruta]`.
 */
import { CSP_VISTA } from '@/features/chat/lib/html-blindado'
import { esNombreExtension } from './modelo'

/** El alcance que firma la URL: una extensión, nunca una carpeta del disco. */
export const alcancePanel = (id: string) => `ext-panel:${id}`

/** `sandbox` en la cabecera: aunque alguien abra la URL a nivel superior, corre en origen opaco (como `cspCrudo`). */
export const CSP_PANEL = `sandbox allow-scripts; ${CSP_VISTA}`

export const urlPanel = (token: string, id: string, entrada: string) =>
  `/api/extensiones/crudo/${token}/${id}/${entrada.split('/').map(encodeURIComponent).join('/')}`

/** `[id, ...resto]` de la URL contra el alcance firmado → la ruta dentro de `panel/`, o null. */
export function rutaPedida(alcance: string | null, partes: string[]): { id: string; ruta: string } | null {
  if (!alcance || partes.length < 2) return null
  const [id, ...resto] = partes.map(p => { try { return decodeURIComponent(p) } catch { return '\0' } })
  if (!esNombreExtension(id) || alcance !== alcancePanel(id)) return null
  if (resto.some(p => !p || p === '.' || p === '..' || p.includes('/') || p.includes('\\') || p.includes('\0'))) return null
  return { id, ruta: resto.join('/') }
}
