import { create } from 'zustand'

/**
 * Estado de la terminal inferior (⌘J, 2 oct 2026). Las terminales viven en el motor de Arbrain;
 * aquí solo se recuerda cuáles son "las del panel", su orden, la activa, la altura y si está abierto.
 * Se guarda en este equipo (localStorage) y, al hidratar, se reconcilia con el motor.
 */
export type PestanaTerminal = { id: number; titulo: string | null }

const CLAVE = 'arbrain:terminal-panel:v1'
export const ALTO_MIN = 120
export const ALTO_INICIAL = 300

type Guardado = { abierto: boolean; alto: number; activa: number | null; pestanas: PestanaTerminal[] }

function leer(): Partial<Guardado> {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<Guardado> } catch { return {} }
}

interface TerminalPanelState extends Guardado {
  hidratado: boolean
  hidratar: () => void
  alternar: () => void
  abrir: () => void
  cerrar: () => void
  setAlto: (alto: number, persistir?: boolean) => void
  agregar: (id: number) => void
  quitar: (id: number) => void
  activar: (id: number) => void
  titular: (id: number, titulo: string | null) => void
  /** Deja solo las pestañas cuyos ids siguen vivos en el motor. */
  reconciliar: (vivos: number[]) => void
}

let ultimo = 0
export const useTerminalPanel = create<TerminalPanelState>((set, get) => {
  const guardar = () => {
    const { abierto, alto, activa, pestanas } = get()
    try { localStorage.setItem(CLAVE, JSON.stringify({ abierto, alto, activa, pestanas })) } catch { /* sin almacenamiento */ }
  }
  const fijar = (parcial: Partial<TerminalPanelState>) => { set(parcial); guardar() }
  return {
    abierto: false, alto: ALTO_INICIAL, activa: null, pestanas: [], hidratado: false,
    hidratar: () => {
      if (get().hidratado) return
      const g = leer()
      const pestanas = Array.isArray(g.pestanas) ? g.pestanas.filter(p => Number.isInteger(p?.id)) : []
      set({
        hidratado: true,
        abierto: !!g.abierto && pestanas.length > 0,
        alto: typeof g.alto === 'number' ? Math.max(ALTO_MIN, g.alto) : ALTO_INICIAL,
        pestanas,
        activa: pestanas.some(p => p.id === g.activa) ? g.activa! : pestanas[0]?.id ?? null,
      })
    },
    // Dos vías (tecla en el webview y acelerador nativo del menú) pueden llegar juntas: la segunda se ignora.
    alternar: () => { const t = Date.now(); if (t - ultimo < 250) return; ultimo = t; fijar({ abierto: !get().abierto }) },
    abrir: () => fijar({ abierto: true }),
    cerrar: () => fijar({ abierto: false }),
    setAlto: (alto, persistir = true) => { const v = Math.max(ALTO_MIN, Math.round(alto)); if (persistir) fijar({ alto: v }); else set({ alto: v }) },
    agregar: id => { if (get().pestanas.some(p => p.id === id)) return; fijar({ pestanas: [...get().pestanas, { id, titulo: null }], activa: id, abierto: true }) },
    quitar: id => {
      const { pestanas, activa } = get()
      const i = pestanas.findIndex(p => p.id === id)
      if (i < 0) return
      const resto = pestanas.filter(p => p.id !== id)
      const nueva = activa === id ? (resto[Math.min(i, resto.length - 1)]?.id ?? null) : activa
      fijar({ pestanas: resto, activa: nueva, abierto: resto.length ? get().abierto : false })
    },
    activar: id => { if (get().pestanas.some(p => p.id === id)) fijar({ activa: id }) },
    titular: (id, titulo) => {
      const p = get().pestanas.find(x => x.id === id)
      if (!p || p.titulo === titulo) return
      fijar({ pestanas: get().pestanas.map(x => x.id === id ? { ...x, titulo } : x) })
    },
    reconciliar: vivos => {
      const { pestanas, activa, abierto } = get()
      const resto = pestanas.filter(p => vivos.includes(p.id))
      if (resto.length === pestanas.length) return
      fijar({ pestanas: resto, activa: resto.some(p => p.id === activa) ? activa : resto[0]?.id ?? null, abierto: resto.length ? abierto : false })
    },
  }
})
