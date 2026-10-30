'use client'
/**
 * Archivero del panel (3 oct 2026, firmado por Daniel): «Guardar» deja la pestaña en «+ › Guardadas»; un
 * clic la reabre como pestaña. Desde el 4 oct (Daniel) el marcador alterna EN SITIO, guardar ↔ quitar, sin
 * cerrar la vista (`useGuardado`). La lista vive en el Studio y la
 * comparten la app y Levy (arbrain/server/src/cabina/archivero.ts): lo que Levy guarda con
 * `mostrar {guardar:true}` aparece aquí, y su `archivero {accion:'abrir'}` deja un pedido que esta
 * ventana atiende (`useAtenderPedidos`).
 */
import { useEffect, useRef, useState } from 'react'
import type { MostrarInput } from '../model'
import { titulo } from '../Cabina'
import { releer, useFuente } from '../datos'
import { usePanelFijadas, type Fijada } from './fijadas'
import { mostrarPanel } from './ventanas'
import { entradaDe } from './guardado'

export interface Entrada {
  id: string; nombre: string; input: MostrarInput; conversacion?: string
  guardadaEn: string; abiertoEn: string | null; rutaOriginal?: string
  pedido?: { accion: 'abrir'; en: string }
}

export const URL_ARCHIVERO = '/api/cabina/archivero'

/** La lista (se relee sola cada `cadaMs` mientras alguien la mira). */
export function useArchivero(cadaMs?: number) {
  return useFuente<{ entradas: Entrada[] }>(URL_ARCHIVERO, cadaMs)
}

async function pedir(cuerpo: Record<string, unknown>): Promise<Entrada> {
  const r = await fetch(URL_ARCHIVERO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const body = await r.json().catch(() => ({})) as { entrada?: Entrada; error?: string }
  void releer(URL_ARCHIVERO)
  if (!r.ok || !body.entrada) throw new Error(body.error ?? `El archivero respondió ${r.status}.`)
  return body.entrada
}

/**
 * El marcador de una pestaña (4 oct 2026, Daniel: «al darle guardar me saca, y quitar no quita»). Alterna en
 * sitio: la vista se queda abierta, el ícono cambia al instante (optimista) y la verdad vuelve del archivero.
 * Guardar dos veces es la misma entrada (el daemon la reconoce por su clave); quitar algo que ya no estaba, no falla.
 */
export function useGuardado(f: Fijada) {
  const { data } = useArchivero()
  const [optimista, setOptimista] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entrada = data ? entradaDe(data.entradas, f) : undefined
  const guardada = optimista ?? (data ? !!entrada : !!f.guardada)
  const alternar = async () => {
    if (optimista !== null) return
    const quiero = !guardada
    setOptimista(quiero); setError(null)
    try {
      if (quiero) await pedir({ accion: 'guardar', input: f.input, nombre: titulo(f.input), conversacion: f.conversacion })
      else {
        const id = entrada?.id ?? (f.id.startsWith('guardada-') ? f.id.slice('guardada-'.length) : null)
        if (id) await pedir({ accion: 'sacar', id }).catch(e => { if (!/No está en el archivero/.test(String(e?.message))) throw e })
      }
      await releer(URL_ARCHIVERO)
      // La marca local decide si se cierra sola al cambiar de conversación: guardada, se queda.
      usePanelFijadas.getState().marcarGuardada(f.id, quiero)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo usar el archivero.') }
    finally { setOptimista(null) }
  }
  return { guardada, alternar, ocupado: optimista !== null, error }
}

/** Reabrir desde Guardadas: vuelve como pestaña (marcada guardada: no se cierra sola) y apunta `abiertoEn`. */
export function reabrir(e: Entrada) {
  const id = usePanelFijadas.getState().fijar(`guardada-${e.id}`, { ...e.input, titulo: e.input.titulo ?? e.nombre }, true, { guardada: true })
  mostrarPanel(id)
  void pedir({ accion: 'abierta', id: e.id }).catch(() => { /* el dato de abiertoEn no es crítico */ })
  return id
}

export const sacarDelArchivero = (id: string) => pedir({ accion: 'sacar', id })

/** Pedidos de Levy («ábreme lo que guardé de…»): los atiende la ventana principal mientras vive. */
export function useAtenderPedidos() {
  const { data } = useArchivero(5000)
  const atendidos = useRef(new Set<string>())
  useEffect(() => {
    for (const e of data?.entradas ?? []) {
      if (!e.pedido || atendidos.current.has(`${e.id}:${e.pedido.en}`)) continue
      atendidos.current.add(`${e.id}:${e.pedido.en}`)
      reabrir(e)
    }
  }, [data])
}
