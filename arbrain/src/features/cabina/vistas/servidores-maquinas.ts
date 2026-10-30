/**
 * Servidores por máquina (4 oct 2026): en qué máquina vive cada fila, sin React (lo prueba tests/cabina/servidores-maquinas.test.ts).
 * La asignación sale del `endpoint` de cada sonda (host de su url / ssh; «localhost» si es un servicio launchd),
 * que expone el agent-server tal como lo mide; no de nombres a mano. Reglas, en orden:
 *  1. Loopback, localhost, *.ts.net o *.local → Studio (lo que corre aquí o entra por su Funnel).
 *  2. Host de una fila de «maquinas» que no sea el Studio (la sonda ssh del VPS) → VPS.
 *  3. Plataforma gestionada conocida (NUBE_SUFIJOS) → Nube. Hoy ninguna fila lo es y entonces la pestaña no aparece.
 *  4. Cualquier otro host público (dominio propio, sslip.io, workers.dev) → VPS. AMBIGUO por diseño: el host no
 *     dice detrás de qué máquina está (Cloudflare y el dominio solo son la puerta). Todo lo público que miden
 *     hoy los miembros (SaaS Factory, el sitio de la marca, la gratuita, labs) se sirve desde el VPS; si algo pasa a otra
 *     plataforma, agregar su sufijo a NUBE_SUFIJOS.
 *  5. Sin endpoint (foto de un servidor anterior a este campo): host de `detalle.url`; si tampoco, el grupo decide: «miembros» se comprueba desde afuera → VPS; lo demás → Studio.
 */
import type { FilaServidor } from './servidores-veredicto'

export type Maquina = 'studio' | 'vps' | 'nube'
export const MAQUINAS: { id: Maquina; titulo: string; nota: string }[] = [
  { id: 'studio', titulo: 'Studio · local', nota: 'lo que corre en este Mac Studio' },
  { id: 'vps', titulo: 'VPS', nota: 'lo que vive en el servidor remoto' },
  { id: 'nube', titulo: 'Nube', nota: 'servicios gestionados fuera de tus máquinas' },
]
export const NUBE_SUFIJOS = ['vercel.app', 'vercel.com', 'netlify.app', 'pages.dev', 'supabase.co', 'supabase.com']

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|.+\.(ts\.net|local))$/
const sufijo = (h: string, s: string) => h === s || h.endsWith(`.${s}`)

export function hostDe(f: Pick<FilaServidor, 'endpoint' | 'detalle'>): string | null {
  if (f.endpoint) return f.endpoint.toLowerCase()
  const u = f.detalle?.url
  if (typeof u === 'string') { try { return new URL(u).hostname.toLowerCase() } catch { /* sin host */ } }
  return null
}

export function maquinaDe(f: Pick<FilaServidor, 'endpoint' | 'detalle' | 'grupo'>, vpsHosts: ReadonlySet<string>): Maquina {
  const h = hostDe(f)
  if (!h) return f.grupo === 'miembros' ? 'vps' : 'studio'
  if (LOCAL.test(h)) return 'studio'
  if (vpsHosts.has(h)) return 'vps'
  if (NUBE_SUFIJOS.some(s => sufijo(h, s))) return 'nube'
  return 'vps'
}

/** Hosts remotos declarados por las filas de «maquinas» (la sonda ssh del VPS). */
export function hostsVps(filas: FilaServidor[]): Set<string> {
  const out = new Set<string>()
  for (const f of filas) if (f.grupo === 'maquinas') { const h = hostDe(f); if (h && !LOCAL.test(h)) out.add(h) }
  return out
}

export interface PorMaquina { id: Maquina; titulo: string; nota: string; filas: FilaServidor[]; bien: number; texto: string; tono: 'ok' | 'lento' | 'caido' | 'sin-dato' }

/** Reparte las filas en pestañas (Studio primero, luego VPS; Nube solo si tiene filas) con su resumen propio. */
export function porMaquina(filas: FilaServidor[]): PorMaquina[] {
  const vps = hostsVps(filas)
  return MAQUINAS.map(m => {
    const fs = filas.filter(f => maquinaDe(f, vps) === m.id)
    const n = (e: FilaServidor['estado']) => fs.filter(f => f.estado === e).length
    const bien = n('ok'), mal = fs.length - bien
    const tono = n('caido') ? 'caido' : n('sin-dato') ? 'sin-dato' : n('lento') ? 'lento' : 'ok'
    const texto = mal === 0 ? 'todo bien' : `${mal} con ${mal === 1 ? 'problema' : 'problemas'}`
    return { ...m, filas: fs, bien, texto, tono } as PorMaquina
  }).filter(m => m.filas.length > 0)
}
