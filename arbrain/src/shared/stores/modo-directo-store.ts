'use client'
import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { enmascarar, velo as compilarVelo, type Diccionario, type Velo } from '@/lib/modo-directo/reglas'
import { CLAVE_DIRECTO as CLAVE } from '@/lib/modo-directo/cubrir'
import { esEdicionCliente } from '@/lib/edicion'

/**
 * Modo directo (7 nov 2026): el interruptor de la app. La verdad vive en el daemon (/api/modo-directo →
 * ~/.config/arbrain/modo-directo.json), la misma que leen las herramientas de la Cabina; aquí:
 *  - se pinta primero lo que este equipo recuerda (localStorage), para que recargar la app a mitad del directo no
 *    enseñe nada ni un cuadro antes de que responda el servidor;
 *  - se confirma con el servidor al cargar, cada 5 s y al volver a la ventana; las otras ventanas se enteran por `storage`;
 *  - prender es optimista y, si el servidor no contesta, se queda prendido aquí (lo seguro); apagar espera al servidor.
 */

export const URL_DIRECTO = '/api/modo-directo'

interface Estado {
  prendido: boolean
  /** El servidor ya lo confirmó (o lo negó) al menos una vez. */
  confirmado: boolean
  desde: string | null
  velo: Velo | null
  error: string | null
  ocupado: boolean
  iniciar: () => () => void
  releer: () => Promise<void>
  poner: (prendido: boolean) => Promise<void>
  alternar: () => Promise<void>
}

const leerLocal = (): boolean => { try { return window.localStorage.getItem(CLAVE) === '1' } catch { return false } }
const guardarLocal = (v: boolean) => { try { window.localStorage.setItem(CLAVE, v ? '1' : '0') } catch { /* modo privado */ } }

interface Respuesta { estado?: { prendido?: boolean; desde?: string | null }; diccionario?: Diccionario; error?: string }
function veloDe(r: Respuesta, prendido: boolean): Velo | null {
  if (!prendido) return null
  const d = r.diccionario
  return compilarVelo({ nombres: Array.isArray(d?.nombres) ? d.nombres : [], literales: Array.isArray(d?.literales) ? d.literales : [] })
}

let iniciado = 0
let reloj: ReturnType<typeof setInterval> | null = null

export const useModoDirecto = create<Estado>((set, get) => {
  const aplicar = (r: Respuesta) => {
    const prendido = r.estado?.prendido === true
    guardarLocal(prendido)
    // El velo nuevo conserva los nombres que ya había si esta respuesta no los trajo (servidor sin daemon).
    const v = veloDe(r, prendido)
    set({ prendido, confirmado: true, desde: r.estado?.desde ?? null, velo: prendido ? (v?.nombres || v?.literales.length ? v : get().velo ?? v) : null, error: null })
  }
  return {
    prendido: false, confirmado: false, desde: null, velo: null, error: null, ocupado: false,
    iniciar: () => {
      // Edición cliente (v0.2.24): el modo directo es de la instalación original; sin su ruta, ni se consulta.
      if (typeof window === 'undefined' || esEdicionCliente()) return () => {}
      if (iniciado++ === 0) {
        const local = leerLocal()
        if (local) set({ prendido: true, velo: compilarVelo({ nombres: [] }) })
        void get().releer()
        reloj = setInterval(() => { if (document.visibilityState === 'visible' && !get().ocupado) void get().releer() }, 5_000)
        window.addEventListener('storage', alStorage)
        window.addEventListener('focus', alFoco)
      }
      return () => {
        if (--iniciado > 0) return
        if (reloj) clearInterval(reloj)
        reloj = null
        window.removeEventListener('storage', alStorage)
        window.removeEventListener('focus', alFoco)
      }
    },
    releer: async () => {
      try {
        const r = await fetch(URL_DIRECTO, { cache: 'no-store' })
        const body = await r.json().catch(() => ({})) as Respuesta
        if (!r.ok || !body.estado) throw new Error(body.error ?? `El modo directo respondió ${r.status}.`)
        if (get().ocupado) return
        aplicar(body)
      } catch (e) { set({ error: e instanceof Error ? e.message : 'Sin respuesta del servidor.' }) }
    },
    poner: async (prendido) => {
      // Prender se ve al instante (lo seguro); apagar espera la confirmación.
      if (prendido) { guardarLocal(true); set({ prendido: true, velo: get().velo ?? compilarVelo({ nombres: [] }) }) }
      set({ ocupado: true })
      try {
        const r = await fetch(URL_DIRECTO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prendido }) })
        const body = await r.json().catch(() => ({})) as Respuesta
        if (!r.ok || !body.estado) throw new Error(body.error ?? `El modo directo respondió ${r.status}.`)
        set({ ocupado: false })
        aplicar(body)
      } catch (e) {
        const motivo = e instanceof Error ? e.message : 'Sin respuesta del servidor.'
        set({ ocupado: false, error: prendido ? `Prendido en esta ventana, pero el servidor no lo supo (${motivo}): la Cabina todavía no está avisada.` : `No se apagó: ${motivo}` })
      }
    },
    alternar: () => get().poner(!get().prendido),
  }
})

function alStorage(e: StorageEvent) {
  if (e.key !== CLAVE) return
  const prendido = e.newValue === '1'
  if (prendido !== useModoDirecto.getState().prendido) {
    useModoDirecto.setState({ prendido, velo: prendido ? useModoDirecto.getState().velo ?? compilarVelo({ nombres: [] }) : null })
    void useModoDirecto.getState().releer()
  }
}
function alFoco() { void useModoDirecto.getState().releer() }

/** Monta la sincronización (una sola por ventana, aunque se llame desde varios componentes) y da el estado. */
export function useDirecto() {
  const prendido = useModoDirecto(s => s.prendido)
  useEffect(() => useModoDirecto.getState().iniciar(), [])
  return prendido
}

/**
 * Para los textos que se parten en piezas al pintarse (código resaltado, el literal de un comando, la salida de una
 * herramienta): con el modo prendido se tapan ANTES de partirse, donde el velo del DOM ya no vería la llave entera.
 */
export function useTapar(): (texto: string) => string {
  const prendido = useModoDirecto(s => s.prendido)
  const v = useModoDirecto(s => s.velo)
  return useCallback((texto: string) => (prendido && texto ? enmascarar(texto, v) : texto), [prendido, v])
}
