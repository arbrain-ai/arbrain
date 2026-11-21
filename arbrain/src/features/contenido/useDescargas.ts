'use client'
/** Estado único de las descargas del cuartel: cualquier botón ve lo mismo; mientras algo baja, se relee cada 3 s. */
import { useEffect, useSyncExternalStore } from 'react'
import { ajustarDescarga, descargar, listarDescargas } from './acciones'
import type { Descarga } from './tipos'

let lista: Descarga[] = []
let error: string | null = null
const oyentes = new Set<() => void>()
let reloj: ReturnType<typeof setTimeout> | null = null
let cargada = false
let foto: { lista: Descarga[]; error: string | null } = { lista, error }

function avisar() { foto = { lista, error }; oyentes.forEach(f => f()) }

async function releer() {
  try { lista = (await listarDescargas()).descargas; error = null } catch (e) { error = (e as Error).message }
  cargada = true
  avisar()
  if (reloj) clearTimeout(reloj)
  reloj = lista.some(d => d.estado === 'bajando') && oyentes.size ? setTimeout(releer, 3000) : null
}

export function useDescargas() {
  const estado = useSyncExternalStore(f => { oyentes.add(f); return () => oyentes.delete(f) }, () => foto, () => foto)
  useEffect(() => { if (!cargada) releer() }, [])
  return {
    ...estado,
    de: (v: string) => estado.lista.find(d => d.video_id === v) ?? null,
    pedir: async (v: string, titulo: string, canal: string | null | undefined, modo: 'video' | 'audio' = 'video') => {
      const r = await descargar(v, titulo, canal, modo)
      lista = [...lista.filter(d => d.video_id !== v), r.descarga]; avisar(); setTimeout(releer, 1500)
    },
    ajustar: async (v: string, cambio: { fijada?: boolean; vista?: boolean; borrar?: boolean }) => { await ajustarDescarga(v, cambio); await releer() },
    releer,
  }
}
