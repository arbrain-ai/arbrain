'use client'
/**
 * Estado único de lo tuyo (guardados y ver después): cualquier tarjeta, la Sala y el riel ven lo mismo. Optimista: el
 * toque se ve al instante y el Studio confirma; si no confirma, vuelve a como estaba y se dice. También lleva el aviso
 * chico del pie («Guardado · Deshacer»), uno a la vez.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { aplicar, VACIO, type CambioMios, type FichaVideo, type Mios } from './mios'
import { tr } from '@/shared/i18n'

export interface Aviso { id: number; texto: string; deshacer?: () => void; error?: boolean }

let mios: Mios = VACIO
let origen = null as string | null
let cargado = false
let error = null as string | null
let aviso = null as Aviso | null
let reloj: ReturnType<typeof setTimeout> | null = null
const oyentes = new Set<() => void>()
let foto: { mios: Mios; cargado: boolean; error: string | null; aviso: Aviso | null; origen: string | null } = { mios, cargado, error, aviso, origen }
const avisar = () => { foto = { mios, cargado, error, aviso, origen }; oyentes.forEach(f => f()) }

async function pedir(init?: RequestInit): Promise<Mios & { origen?: string | null }> {
  const r = await fetch('/api/contenido/mios', { cache: 'no-store', signal: AbortSignal.timeout(20000), ...init })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error ?? tr('El Studio respondió {n}.', { n: r.status }))
  return j as Mios & { origen?: string | null }
}

export async function releerMios() {
  try { const j = await pedir(); mios = { version: 1, guardados: j.guardados, despues: j.despues }; origen = j.origen ?? null; error = null }
  catch (e) { error = (e as Error).message }
  cargado = true; avisar()
}

export function mostrarAviso(texto: string, extra: Omit<Aviso, 'id' | 'texto'> = {}) {
  aviso = { id: Date.now(), texto, ...extra }; avisar()
  if (reloj) clearTimeout(reloj)
  reloj = setTimeout(() => { aviso = null; avisar() }, extra.deshacer ? 7000 : 3800)
}
export function cerrarAviso() { aviso = null; avisar() }

/** Un cambio: se ve ya, se escribe en el Studio; si falla, se revierte y se dice. */
export async function cambiar(c: CambioMios): Promise<boolean> {
  const antes = mios
  mios = aplicar(mios, c); avisar()
  try { const j = await pedir({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); mios = { version: 1, guardados: j.guardados, despues: j.despues }; avisar(); return true }
  catch (e) { mios = antes; mostrarAviso(tr('No se guardó: {motivo}', { motivo: (e as Error).message }), { error: true }); return false }
}

export function useMios() {
  const estado = useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f) } }, () => foto, () => foto)
  useEffect(() => { if (!cargado) void releerMios() }, [])
  return estado
}

/** Guardar o quitar, con su aviso y su deshacer. */
export async function alternarGuardado(v: FichaVideo, guardado: boolean) {
  if (guardado) {
    if (await cambiar({ accion: 'quitar', video_id: v.video_id })) mostrarAviso(tr('Quitado de Guardados'), { deshacer: () => void cambiar({ accion: 'guardar', video: v }) })
  } else if (await cambiar({ accion: 'guardar', video: v })) mostrarAviso(tr('Guardado'), { deshacer: () => void cambiar({ accion: 'quitar', video_id: v.video_id }) })
}

/** Origen del enlace del bloque: el de esta misma página. El que daba el Studio (`NEXT_PUBLIC_SITE_URL`) era
 *  `localhost:3000`, que no es donde sirve; y como dentro de la app el enlace se reconoce por ruta
 *  (`planning/enlace-interno.ts`), el puerto puede cambiar entre arranques sin romperlo. */
export const origenEnlace = () => (typeof window !== 'undefined' ? window.location.origin : origen ?? '')
