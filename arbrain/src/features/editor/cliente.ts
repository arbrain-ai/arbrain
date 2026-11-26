'use client'
/**
 * El editor habla con el motor por la ruta del servidor de Arbrain (`/api/editor/motor/…`), que pone el token. Nada del
 * estado del corte vive aquí: cada lectura viene del motor y cada edición se le manda como versión nueva.
 */
import { NOMBRE_DUENO } from '@/config'
import type { Cambio, CorteRevision, Medio, Proyecto, Timeline, Transcript, VersionResumen } from './tipos'
import type { Op } from './modelo'

export const BASE = '/api/editor/motor'

export class ErrorMotor extends Error { constructor(msg: string, readonly status: number, readonly code?: string) { super(msg) } }

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers }, cache: 'no-store' })
  const j = await res.json().catch(() => null) as ({ error?: { code?: string; message?: string } | string } & T) | null
  if (!res.ok) {
    const e = j?.error
    throw new ErrorMotor(typeof e === 'string' ? e : e?.message ?? `El motor respondió ${res.status}`, res.status, typeof e === 'string' ? undefined : e?.code)
  }
  return j as T
}
const post = <T>(ruta: string, cuerpo: unknown = {}, metodo = 'POST') => pedir<T>(ruta, { method: metodo, body: JSON.stringify(cuerpo) })

export interface ResumenProyecto { id: string; name: string; head?: string | null; updatedAt?: string }

export const motor = {
  proyectos: () => pedir<{ projects: ResumenProyecto[] }>('/projects').then(r => r.projects),
  espacio: (id: string) => pedir<{ project: Proyecto; timeline: Timeline | null }>(`/projects/${id}?view=workspace`),
  timeline: (id: string, version = 'head') => pedir<{ timeline: Timeline }>(`/projects/${id}/timeline?version=${encodeURIComponent(version)}`).then(r => r.timeline),
  versiones: (id: string) => pedir<{ versions: VersionResumen[] }>(`/projects/${id}/versions`).then(r => r.versions),
  cambios: (id: string) => pedir<{ changes: Cambio[] }>(`/projects/${id}/changes`).then(r => r.changes),
  medios: (id: string) => pedir<{ media: Medio[] }>(`/projects/${id}/media`).then(r => r.media),
  transcript: (medio: string) => pedir<Transcript>(`/media/${medio}/transcript`),
  onda: (medio: string, puntos: number) => pedir<{ peaks: number[]; from: number; to: number }>(`/media/${medio}/waveform?points=${puntos}`),
  revision: (cambio: string) => post<{ review: { cuts: CorteRevision[]; original: Timeline; proposed: Timeline } }>(`/changes/${cambio}/cut-review`).then(r => r.review),
  /** Una edición a mano: ops sobre la versión actual, aprobada al momento (versión nueva del motor). */
  editar: (id: string, fromVersion: string, ops: Op[], description: string) =>
    post<{ change: { id: string; toVersion: string; state: string } }>(`/projects/${id}/changes?summary=true`, { fromVersion, ops, description, autoApprove: true, skipRender: true, author: { type: 'human', name: NOMBRE_DUENO() } }),
  /** Ir a una versión (deshacer / rehacer): el motor mueve la cabeza; las versiones nunca se borran. */
  irA: (id: string, version: string) => post<{ project: Proyecto }>(`/projects/${id}/versions/${version}/checkout`),
  /** Rechazo por edición: deshace solo lo que hizo esa versión, sobre la cabeza actual. */
  revertir: (id: string, version: string, expectedHead: string, branch: string) => post<unknown>(`/projects/${id}/versions/${version}/revert`, { expectedHead, branch }),
  elegir: (cambio: string, fromVersion: string, toVersion: string, choices: { index: number; choice: 'cut' | 'keep' }[]) =>
    post<{ change: Cambio }>(`/changes/${cambio}/cut-choices`, { fromVersion, toVersion, choices }, 'PUT'),
  aprobar: (cambio: string, restoredCuts: number[]) => post<{ change: Cambio; outcome?: string }>(`/changes/${cambio}/approve`, restoredCuts.length ? { restoredCuts } : {}),
  /** Un tramo del corte compuesto por el motor (todas las pistas mezcladas), de hasta 12 s. */
  tramo: (id: string, version: string, start: number, end: number) => post<{ renderId: string; start: number; end: number }>(`/projects/${id}/versions/${version}/cut-playback-file`, { start, end }),
  /** Mantener: el dueño revisó estas ediciones y se quedan (los pases del agente ya no las vuelven a dudar). */
  mantener: (id: string, threadId: string, edits: { changeId: string; spot: number; label?: string }[]) => post<unknown>(`/projects/${id}/kept-edits`, { threadId, edits }),
  tareas: (id: string) => pedir<{ tasks: { id: string; kind: string; state: string; context?: { changeId?: string } }[] }>(`/projects/${id}/tasks`).then(r => r.tasks),
  revisar: (cambio: string, texto: string, cutIndex: number, tiempo: number) =>
    post<unknown>(`/changes/${cambio}/revise`, { text: texto, position: { time: tiempo, cutIndex } }),
}

export const urlMedio = (medio: string) => `${BASE}/media/${medio}/proxy`
