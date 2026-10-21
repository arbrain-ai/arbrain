'use client'
/**
 * Ajustes del panel (6 oct 2026): UNA fuente de verdad para el menú «+» — el orden de las secciones y cuáles están
 * ocultas — en el servidor (`~/.config/arbrain/panel-ajustes.json`, arbrain/server/src/cabina/panel-ajustes.ts). Daniel la
 * toca desde Ajustes › Panel o arrastrando en el «+»; Levy, con `panel {accion:"secciones"}`. Las dos puertas escriben lo mismo.
 *
 * Difusión en vivo: el latido del panel-bus (bus.ts) trae la config nueva y reporta la versión aplicada (`ajustesRev`:
 * ese es el acuse de Levy); la ventana que la recibe la reenvía a las demás por el canal de ventanas.
 * También lleva «Dónde abre Levy» (`donde`, destino-levy.ts). Ocultar una sección cierra su pestaña (Tareas, Taller o la vista) en el momento en que pasa a oculta.
 * Migración: la primera vez (sin archivo) sube el orden que Daniel tenía en localStorage y lo borra.
 */
import { create } from 'zustand'
import { AJUSTES_POR_DEFECTO, normalizarAjustes, ordenarMenu, recienOcultas, SECCIONES_MENU, type AjustesPanel, type Donde } from './menu-orden'
import { usePanelFijadas } from './fijadas'
import { escuchar, publicar } from './ventanas'

export const URL_AJUSTES = '/api/cabina/panel-ajustes'
/** El orden que Daniel acomodaba en este dispositivo antes de que viviera en el servidor (5 oct 2026). */
const CLAVE_LEGADO = 'arbrain.panelDerecho.menuOrden'

interface Estado {
  ajustes: AjustesPanel
  cargado: boolean
  error: string | null
  cargar: () => void
  /** Llegó la config del servidor o de otra ventana. Ignora una más vieja que la que ya tiene. */
  recibir: (a: AjustesPanel, avisar?: boolean) => void
  /** Daniel cambió algo (orden y/o ocultas): se ve al instante y se confirma con el servidor. */
  guardar: (cambio: { orden?: string[]; ocultas?: string[]; donde?: Donde }) => Promise<void>
  restablecer: () => Promise<void>
}

/** Cierra la pestaña de cada sección que acaba de ocultarse. */
function cerrarSeccionesOcultas(ids: string[]) {
  if (!ids.length) return
  const st = usePanelFijadas.getState()
  st.cargar()
  for (const id of ids) {
    if (id === 'tareas') { if (usePanelFijadas.getState().orden.includes('tareas')) usePanelFijadas.getState().cerrar('tareas'); continue }
    if (id === 'taller') { if (usePanelFijadas.getState().taller) usePanelFijadas.getState().cerrar('taller'); continue }
    // Calendario y Objetivos son una sola vista (alias, fijadas.ts).
    const vistas = id === 'calendario' ? ['calendario', 'objetivos'] : [id]
    for (const f of usePanelFijadas.getState().fijadas.filter(x => vistas.includes(x.input.vista))) usePanelFijadas.getState().cerrar(f.id)
  }
}

async function pedir(cuerpo: Record<string, unknown>): Promise<{ ajustes: AjustesPanel; existe: boolean; migrado?: boolean }> {
  const r = await fetch(URL_AJUSTES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const body = await r.json().catch(() => ({})) as { ajustes?: unknown; existe?: boolean; migrado?: boolean; error?: string }
  if (!r.ok || !body.ajustes) throw new Error(body.error ?? `Los ajustes del panel respondieron ${r.status}.`)
  return { ajustes: normalizarAjustes(body.ajustes), existe: body.existe !== false, migrado: body.migrado }
}

function leerLegado(): unknown {
  try { return JSON.parse(localStorage.getItem(CLAVE_LEGADO) ?? 'null') } catch { return null }
}
const borrarLegado = () => { try { localStorage.removeItem(CLAVE_LEGADO) } catch { /* sin almacenamiento */ } }

export const usePanelAjustes = create<Estado>((set, get) => {
  const poner = (a: AjustesPanel) => {
    // Primero lo que se ve (cerrar lo recién oculto) y luego la versión: quien reporta `rev` ya aplicó todo.
    cerrarSeccionesOcultas(recienOcultas(get().ajustes.ocultas, a.ocultas))
    set({ ajustes: a, error: null })
  }
  const releer = async () => {
    const r = await fetch(URL_AJUSTES, { cache: 'no-store' })
    const body = await r.json().catch(() => ({})) as { ajustes?: unknown; existe?: boolean }
    if (!r.ok || !body.ajustes) throw new Error(`Los ajustes del panel respondieron ${r.status}.`)
    return { ajustes: normalizarAjustes(body.ajustes), existe: body.existe !== false }
  }
  return {
    ajustes: AJUSTES_POR_DEFECTO,
    cargado: false,
    error: null,
    cargar: () => {
      if (get().cargado || typeof window === 'undefined') return
      set({ cargado: true })
      // Otra ventana (o el latido de la principal) trajo la config: aquí se ve igual.
      escuchar(m => { if (m.tipo === 'panel-ajustes') get().recibir(normalizarAjustes(m.ajustes), false) })
      void (async () => {
        try {
          let { ajustes, existe } = await releer()
          // Primera vez: el orden que Daniel acomodó en este dispositivo sube al servidor, una sola vez.
          if (!existe) {
            const legado = leerLegado()
            if (Array.isArray(legado)) { try { ajustes = (await pedir({ accion: 'migrar', orden: ordenarMenu(SECCIONES_MENU, legado) })).ajustes; borrarLegado() } catch { /* se reintenta al próximo arranque */ } }
          } else borrarLegado()
          get().recibir(ajustes, true)
        } catch (e) { set({ error: e instanceof Error ? e.message : 'No se pudieron leer los ajustes del panel.' }) }
      })()
    },
    recibir: (a, avisar = true) => {
      const actual = get().ajustes
      if (a.rev < actual.rev) return
      const igual = a.rev === actual.rev && a.orden.join() === actual.orden.join() && a.ocultas.join() === actual.ocultas.join() && a.donde === actual.donde
      if (igual) return
      poner(a)
      if (avisar) publicar({ tipo: 'panel-ajustes', ajustes: a })
    },
    guardar: async (cambio) => {
      const antes = get().ajustes
      const orden = cambio.orden ? ordenarMenu(SECCIONES_MENU, cambio.orden) : antes.orden
      const ocultas = cambio.ocultas ? cambio.ocultas.filter(id => SECCIONES_MENU.includes(id)) : antes.ocultas
      // Al instante, con la versión que ya había; el servidor la sube y entonces `recibir` la reemplaza.
      const donde = cambio.donde ?? antes.donde
      poner({ ...antes, orden, ocultas, donde })
      try { get().recibir((await pedir({ accion: 'guardar', orden, ocultas, donde })).ajustes, true) }
      catch (e) {
        set({ error: e instanceof Error ? e.message : 'No quedó guardado.' })
        // El servidor manda: vuelve a lo que de verdad hay.
        try { const r = await releer(); set({ ajustes: r.ajustes }) } catch { set({ ajustes: antes }) }
      }
    },
    restablecer: async () => {
      try { get().recibir((await pedir({ accion: 'restablecer' })).ajustes, true) }
      catch (e) { set({ error: e instanceof Error ? e.message : 'No se pudo restablecer.' }) }
    },
  }
})
