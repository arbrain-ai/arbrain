'use client'
/**
 * Lo que la pantalla le pide al Studio. Lo de CEREBRO va por sus rutas (`/api/cuartel/cerebro/*`, CEREBRO.md §3); lo
 * de PANTALLAS (transcript, descargas) por `/api/contenido/*`. Cada error vuelve como texto para decirlo en pantalla.
 */
import type { Descarga, Respuesta, Transcript } from './tipos'

async function llamar<T>(url: string, init?: RequestInit & { cuerpo?: unknown }, ms = 30000): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? (init?.cuerpo ? 'POST' : 'GET'), cache: 'no-store', signal: AbortSignal.timeout(ms),
    headers: init?.cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.cuerpo ? JSON.stringify(init.cuerpo) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error ?? (r.status === 404 ? 'Aún no está disponible.' : `El Studio respondió ${r.status}.`))
  return j as T
}

export type Voto = 'sirvio' | 'no_sirvio' | 'saltado'
export const votar = (video_id: string, voto: Voto, desde: 'dosis' | 'biblioteca' | 'radar') =>
  llamar<unknown>('/api/cuartel/cerebro/voto', { cuerpo: { video_id, voto, desde } })

export const preguntar = (video_id: string, pregunta: string, historial: { pregunta: string; respuesta: string }[]) =>
  llamar<Respuesta>('/api/cuartel/cerebro/preguntar', { cuerpo: { video_id, pregunta, historial } }, 120000)

export const generarIdea = (video_id: string) => llamar<unknown>('/api/cuartel/cerebro/ideas', { cuerpo: { accion: 'generar', video_id } }, 180000)
export const moverIdea = (id: string, estado: string) => llamar<unknown>('/api/cuartel/cerebro/ideas', { cuerpo: { accion: 'estado', id, estado } })

export const leerTranscript = (v: string) => llamar<Transcript>(`/api/contenido/transcript?v=${v}`)
export const traerDescripcion = (v: string) => llamar<{ descripcion: string; titulo: string }>(`/api/contenido/descripcion?v=${encodeURIComponent(v)}`, { method: 'GET' }, 20000)
export const traerTranscript = (v: string) => llamar<Transcript>('/api/contenido/transcript', { cuerpo: { v } }, 150000)

export const listarDescargas = () => llamar<{ descargas: Descarga[] }>('/api/contenido/descargas')
export const descargar = (v: string, titulo: string, canal: string | null | undefined, modo: 'video' | 'audio') =>
  llamar<{ descarga: Descarga }>('/api/contenido/descargas', { cuerpo: { v, titulo, canal, modo } })
export const ajustarDescarga = (v: string, cambio: { fijada?: boolean; vista?: boolean; borrar?: boolean }) =>
  llamar<{ descarga: Descarga | null }>('/api/contenido/descargas', { method: 'PATCH', cuerpo: { v, ...cambio } })
export const urlArchivo = (v: string, guardar = false) => `/api/contenido/descargas/archivo?v=${v}${guardar ? '&guardar=1' : ''}`
