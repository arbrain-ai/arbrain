'use client'
/**
 * Business Intelligence · de dónde lee el panel (7 nov 2026). En la app, de la API (`/api/bi`, `/api/bi/consulta`) con la
 * misma caché de la Cabina (`useFuente`: una lectura por fuente y `refrescarCabina()` cuando Levy escribe). En el banco
 * `/bi-lab`, de un proveedor simulado (capturas y video, sin sesión ni datos reales). La vista no sabe cuál es.
 */
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { releer, useFuente } from '@/features/cabina/datos'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { URL_EMBUDO, type RespuestaEmbudo } from '@/features/negocio/embudo'
import type { Consulta, Ventana } from './catalogo'
import { mensajeParaLevy, type Accion, type Grafica, type RespuestaConsulta } from './modelo'

/** Cómo está el archivo de fuentes del dueño (solo con el catálogo genérico). */
export interface EstadoFuentesBI { ruta: string; existe: boolean; errores: string[]; negocio?: string }
/**
 * Lo que entrega `/api/bi`. `catalogo` es el vigente en esta instalación (el del autor o el genérico, con `conectada` por
 * consulta): la vista valida, sugiere y pinta con él, nunca con un catálogo propio.
 */
export type RespuestaBI = { activo: false } | {
  activo: true; ruta: string; graficas: Grafica[]; errores: string[]; simulado?: string
  catalogo: Consulta[]; generico?: boolean; fuentes?: EstadoFuentesBI
}
export interface LecturaBI<T> { data?: T; error?: string }

export interface FuenteBI {
  usarGraficas(): LecturaBI<RespuestaBI>
  usarConsulta(id: string, ventana: Ventana, activa: boolean): LecturaBI<RespuestaConsulta>
  usarEmbudo(): LecturaBI<RespuestaEmbudo>
  accion(a: Accion): Promise<string | null>
  /** Le pasa la pregunta a Levy. Devuelve cómo salió. */
  preguntar(texto: string): 'enviado' | 'camino-al-chat' | 'banco'
  /** Le pasa a Levy un tema para conversar (una excepción, una gráfica). */
  conversar(texto: string): void
  /** Voz de Levy: un tramo de texto → audio. null = sin voz de servidor (se usa la del navegador). */
  voz: ((texto: string, signal: AbortSignal) => Promise<ArrayBuffer | null>) | null
  banco?: boolean
}

export const URL_BI = '/api/bi'
export const urlConsulta = (id: string, ventana: Ventana) => `/api/bi/consulta?id=${encodeURIComponent(id)}&ventana=${ventana}`

export { mensajeParaLevy }

const API: FuenteBI = {
  usarGraficas: () => useFuente<RespuestaBI>(URL_BI),
  usarConsulta: (id, ventana, activa) => useFuente<RespuestaConsulta>(activa ? urlConsulta(id, ventana) : null),
  usarEmbudo: () => useFuente<RespuestaEmbudo>(URL_EMBUDO),
  async accion(a) {
    const r = await fetch(URL_BI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }).catch(() => null)
    const body = await r?.json().catch(() => null)
    await releer(URL_BI)
    return r?.ok && body?.ok ? null : body?.error ?? 'No se pudo guardar.'
  },
  preguntar: texto => pedirALevy(mensajeParaLevy(texto)) as 'enviado' | 'camino-al-chat' | 'banco',
  conversar: texto => { pedirALevy(texto) },
  async voz(texto, signal) {
    const r = await fetch('/api/chat/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto, lector: true, velocidad: 1.5 }), signal })
    if (!r.ok) return null
    return r.arrayBuffer()
  },
}

const Ctx = createContext<FuenteBI>(API)
export const ProveedorBI = ({ fuente, children }: { fuente: FuenteBI; children: ReactNode }) => <Ctx.Provider value={fuente}>{children}</Ctx.Provider>
export const useFuenteBI = () => useContext(Ctx)

/** La pregunta en vuelo (sobrevive a ir y volver del chat): qué se preguntó y cuándo. */
const LLAVE = 'bi:preguntando'
export interface Pendiente { texto: string; en: number }
export function leerPendiente(): Pendiente | null {
  try { const p = JSON.parse(localStorage.getItem(LLAVE) ?? 'null'); return p && typeof p.texto === 'string' && typeof p.en === 'number' ? p : null } catch { return null }
}
export function usePendiente() {
  const guardar = useCallback((p: Pendiente | null) => { try { if (p) localStorage.setItem(LLAVE, JSON.stringify(p)); else localStorage.removeItem(LLAVE) } catch { /* sin almacenamiento */ } }, [])
  return guardar
}
