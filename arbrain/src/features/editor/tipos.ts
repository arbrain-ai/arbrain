/**
 * Tipos del motor del editor (lo mínimo que la interfaz lee), copiados de los esquemas de Scarlet.
 *
 * Adaptado de Scarlet (`packages/timeline/src/schema.ts`, `packages/shared/src/api.ts`),
 * Copyright (c) 2026 Forward Future, Inc. Licencia MIT: https://github.com/Forward-Future/scarlet/blob/main/LICENSE
 * Se permite usar, copiar, modificar y distribuir con este aviso. El resto de Arbrain es Apache-2.0.
 *
 * El motor es la única fuente de verdad: cada edición a mano es una versión suya (nunca un estado paralelo aquí).
 */

export interface TramoT { start: number; end: number }

interface ClipBase { id: string; timelineIn: number; label?: string; enabled?: boolean }
export interface ClipMedio extends ClipBase {
  kind: 'media'; mediaId: string; sourceIn: number; sourceOut: number; speed?: number; volume?: number; opacity?: number
  transform?: { x?: number; y?: number; scale?: number; [k: string]: unknown }
}
export interface ClipSubtitulo extends ClipBase { kind: 'caption'; timelineOut: number; text: string }
export interface ClipColor extends ClipBase { kind: 'color'; timelineOut: number; color?: string }
export type Clip = ClipMedio | ClipSubtitulo | ClipColor

export interface Pista { id: string; kind: 'video' | 'audio' | 'caption'; name: string; muted?: boolean; hidden?: boolean; clips: Clip[] }
export interface MarcadorT { id: string; time: number; end?: number; kind?: 'note' | 'chapter' | 'todo' | 'agent'; text: string; author?: string }
export interface Timeline { version: string; parent?: string | null; projectId: string; name?: string; tracks: Pista[]; markers: MarcadorT[]; createdAt?: string }

export interface Medio {
  id: string; kind: 'video' | 'audio' | 'image' | 'graphic'; name: string; duration?: number; fps?: number
  width?: number; height?: number; hasAudio?: boolean; status?: string
}
export interface AjustesProyecto { fps: number; width: number; height: number; aspect?: string }
export interface Proyecto { id: string; name: string; head: string | null; branch?: string; settings: AjustesProyecto; media: Medio[]; updatedAt?: string }

export interface RazonCorte { start: number; end: number; reason: string; summary?: string; kind?: 'pause' | 'filler' | 'retake' | 'coaching'; check?: string }
export interface Evaluacion { index: number; start: number; end: number; verdict: 'cut' | 'keep' | 'ask'; reason: string; summary?: string; provisional?: true; askOrder?: number }
export interface Eleccion { index: number; start?: number; end?: number; choice: 'cut' | 'keep' }
export type EstadoCambio = 'proposed' | 'rendering' | 'ready' | 'approved' | 'rejected' | 'revising' | 'failed'
export interface Cambio {
  id: string; projectId: string; fromVersion: string; toVersion: string; description: string; state: EstadoCambio
  cutReasons?: RazonCorte[]; cutAssessments?: Evaluacion[]; cutChoices?: Eleccion[]; intent?: string; createdAt?: string; updatedAt?: string
  author?: { type?: string; name?: string }; threadId?: string
}
export interface VersionResumen { version: string; parent?: string | null; description?: string; createdAt?: string; duration?: number; author?: { name?: string; type?: string }; isHead?: boolean; changeId?: string | null }

export interface Palabra { text: string; start: number; end: number }
export interface Segmento { start: number; end: number; text: string; words?: Palabra[] }
export interface Transcript { id: string; mediaId: string; language?: string; segments: Segmento[] }

/** Un corte del pase del agente, tal como lo devuelve `POST /changes/:id/cut-review` (tiempos de la toma). */
export interface CorteRevision { at: number; removed: TramoT; beforeClip?: number }
