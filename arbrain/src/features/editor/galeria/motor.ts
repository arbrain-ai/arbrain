/**
 * Los proyectos del motor de edición (Scarlet, MIT, sin ventana; `CONTRATO-MOTOR.md` de la obra del 19 nov). Solo
 * lectura y solo desde el servidor de Arbrain: el token vive en un archivo 600 y el navegador nunca lo ve. Si el motor no
 * responde, la galería lo dice y sigue con lo demás (falta de lectura no es cero proyectos).
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Estado, EtapaVideo, TarjetaVideo } from './tipos'

export const MOTOR_URL = () => process.env.ARBRAIN_EDITOR_MOTOR_URL || 'http://127.0.0.1:47420/api'
const RUTA_TOKEN = () => process.env.ARBRAIN_EDITOR_MOTOR_TOKEN_ARCHIVO || path.join(homedir(), 'Library', 'Application Support', 'arbrain-editor', 'data', 'access-token')

export function tokenMotor(): string | null {
  try { return readFileSync(RUTA_TOKEN(), 'utf8').trim() || null } catch { return null }
}

export interface ProyectoMotor {
  id: string; name: string; archived?: boolean; createdAt?: string; updatedAt?: string; mediaCount?: number; pendingChanges?: number
  duration?: number; poster?: { mediaId?: string; time?: number } | null; activity?: { kind?: string; count?: number }[]
}

/** GET /projects del motor. null = no respondió (sin token, apagado o error). */
export async function leerMotor(f: typeof fetch = fetch): Promise<ProyectoMotor[] | null> {
  const token = tokenMotor()
  if (!token) return null
  try {
    const r = await f(`${MOTOR_URL()}/projects`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000), cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json() as { projects?: unknown }
    return Array.isArray(j.projects) ? (j.projects as ProyectoMotor[]).filter(p => p && typeof p.id === 'string' && /^[\w-]{1,80}$/.test(p.id) && !p.archived) : null
  } catch { return null }
}

/** El estado de un proyecto del motor: el agente editando → Cortando; cambios por revisar → Para revisar; con material → Grabado. */
export function estadoMotor(p: ProyectoMotor): Estado<EtapaVideo> {
  if ((p.activity ?? []).some(a => a?.kind === 'editing' && (a.count ?? 0) > 0)) return { clave: 'cortando', etiqueta: 'Cortando · en el motor', tono: 'wait' }
  if ((p.pendingChanges ?? 0) > 0) return { clave: 'revisar', etiqueta: `Para revisar · ${p.pendingChanges} ${p.pendingChanges === 1 ? 'cambio' : 'cambios'}`, tono: 'wait' }
  if ((p.mediaCount ?? 0) > 0) return { clave: 'grabado', etiqueta: 'Grabado · en el motor', tono: 'idle' }
  return { clave: 'guion', etiqueta: 'Proyecto vacío', tono: 'idle' }
}

export function tarjetaMotor(p: ProyectoMotor): TarjetaVideo {
  const id = `m/${p.id}`
  return {
    id, origen: 'motor', carpeta: null, titulo: p.name || p.id, fecha: p.updatedAt ?? p.createdAt ?? null, youtube_id: null,
    portada: p.poster?.mediaId ? `/api/editor/galeria/portada?id=${encodeURIComponent(id)}` : null, portada_de: p.poster?.mediaId ? 'cuadro' : null,
    video: estadoMotor(p), post: { clave: 'sin-post', etiqueta: 'Sin post', tono: 'idle' },
    huecos: ['titulos', 'descripcion', 'post', 'miniatura', 'fecha', 'finales'], vistas: null, duracion: p.duration ?? null,
  }
}
