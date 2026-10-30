'use client'
/**
 * Receptor del bus del panel (4 oct 2026). Levy ya no depende de que esta ventana pinte su mensaje en el
 * momento justo: `mostrar {fijar|soltar|guardar}` deja un comando en el Studio y ESTA ventana lo aplica
 * sobre el panel real, sin importar quién abrió cada pestaña, y responde con un acuse que lleva el estado
 * verdadero del panel. Cada pocos segundos (y al cambiar el panel) también reporta sus pestañas, así Levy
 * sabe si hay alguien conectado y qué ve Daniel. Contrato: arbrain/server/src/cabina/panel-bus.ts.
 */
import { SEGMENTOS_TALLER, useSegmentoTaller } from './taller-segmento'
import { useEffect } from 'react'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import type { MostrarInput } from '../model'
import { coincide, reportar, nombrePestana, type PestanaReporte } from './bus-puro'
import { usePanelFijadas } from './fijadas'
import { usePanelAjustes } from './panel-ajustes'
import { medirVentanas, mostrarPanel } from './ventanas'
import { normalizarAjustes } from './menu-orden'
import { describirDestino, elegirVentana } from './destino-levy'
import { dispositivoId, escrituras, sinSdk } from './presencia'
import { nombreVentana, PRINCIPAL, ventanaDe } from './pestanas-fuera'
import { useRecientesStore } from '@/features/chat/stores/recientes-store'
import { pedidoCompartido, recibirCompartido } from './compartido'
import type { RespuestaCompartido } from './compartido-puro'

interface Comando { id: string; accion: 'fijar' | 'soltar' | 'guardar'; input: MostrarInput; conversacion?: string }
interface Acuse { comando: string; ok: boolean; detalle: string; cerradas: string[]; abiertas: string[]; pestanas: PestanaReporte[]; /** En qué ventana quedó lo que abrió. */ donde?: string }
/** La ventana que recibe lo que Levy abre, y cómo decirlo. */
export interface DestinoLevy { ventana: string; texto: string }

const URL_PANEL = '/api/cabina/panel'
const CADA_MS = 3000
const CLAVE_APLICADOS = 'arbrain.panelBus.aplicados'

function idDeVentana(): string {
  try {
    let id = sessionStorage.getItem('arbrain.panelBus.cliente')
    if (!id) { id = `w-${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem('arbrain.panelBus.cliente', id) }
    return id
  } catch { return `w-${Math.random().toString(36).slice(2, 10)}` }
}
function leerAplicados(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_APLICADOS) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}
function anotarAplicado(id: string) {
  try { localStorage.setItem(CLAVE_APLICADOS, JSON.stringify([...leerAplicados(), id].slice(-60))) } catch { /* sin almacenamiento */ }
}

/** El panel tal como está ahora. `casaEn` dice en qué ventana vive cada casa (Tareas, Taller); `conversacion`, la que Daniel tiene abierta. */
export function estadoReal() {
  const st = usePanelFijadas.getState()
  const casaEn = { ...(st.orden.includes('tareas') ? { tareas: nombreVentana(ventanaDe(st.enVentana, 'tareas')) } : {}), ...(st.taller ? { taller: nombreVentana(ventanaDe(st.enVentana, 'taller')) } : {}) }
  const conversacion = useRecientesStore.getState().activaId
  return { pestanas: reportar(st.fijadas, st.activa, st.enVentana), casa: { tareas: st.orden.includes('tareas'), taller: st.taller }, casaEn, activa: st.activa, ajustesRev: usePanelAjustes.getState().ajustes.rev, ...(conversacion ? { conversacion: sinSdk(conversacion) } : {}) }
}

/**
 * «Dónde abre Levy»: mide las ventanas de Arbrain donde están AHORA y elige según el ajuste (izquierda por defecto, 7 oct 2026).
 * Si no puede medir o la elegida no existe, el panel principal. Nunca lanza.
 */
export async function resolverDestino(): Promise<DestinoLevy> {
  const donde = usePanelAjustes.getState().ajustes.donde
  try {
    const medidas = await medirVentanas()
    const ventana = elegirVentana(donde, medidas)
    return { ventana, texto: describirDestino(donde, ventana, medidas) }
  } catch { return { ventana: PRINCIPAL, texto: `${nombreVentana(PRINCIPAL)} (no pude medir las ventanas)` } }
}

/** ¿Este pedido abre algo nuevo que deba ir a la ventana elegida? Fijar (y guardar con fijar), nunca soltar. */
export const abreAlgo = (cmd: Pick<Comando, 'accion' | 'input'>) => cmd.accion === 'fijar' || (cmd.accion === 'guardar' && !!cmd.input.fijar)

/** Aplica un comando de Levy sobre el panel real y dice qué pasó de verdad. */
export function aplicar(cmd: Comando, destino?: DestinoLevy): Acuse {
  const st = usePanelFijadas.getState()
  st.cargar()
  const input = cmd.input
  let ok = true, detalle = '', cerradas: string[] = [], abiertas: string[] = [], donde: string | undefined
  const cerrarVista = () => {
    const c = usePanelFijadas.getState().soltarVista(input)
    cerradas = c.map(f => nombrePestana(f.input))
    // Verdad, no esperanza: tras cerrar no puede quedar ninguna que coincida.
    const quedan = usePanelFijadas.getState().fijadas.filter(f => input.pestana ? f.id === input.pestana : coincide(f.input, input))
    if (!c.length) detalle = `no había ninguna pestaña que coincida con ${input.pestana ? `el id ${input.pestana}` : `${input.vista}${input.ruta ? ` · ${input.ruta}` : input.paginaId ? ` · ${input.paginaId}` : ''}`}; no cerré nada`
    if (quedan.length) detalle = `siguen abiertas: ${quedan.map(f => nombrePestana(f.input)).join(', ')}`
    return quedan.length === 0
  }
  try {
    if (cmd.accion === 'soltar') ok = cerrarVista()
    else if (cmd.accion === 'guardar' && !input.fijar) ok = cerrarVista()
    else {
      const antes = new Set(usePanelFijadas.getState().fijadas.map(f => f.id))
      const id = usePanelFijadas.getState().fijar(`levy-${cmd.id}`, input, true, { deLevy: true, conversacion: cmd.conversacion, guardada: cmd.accion === 'guardar', ventana: destino?.ventana })
      const existia = antes.has(id)
      mostrarPanel(id)
      const f = usePanelFijadas.getState().fijadas.find(x => x.id === id)
      // Dónde quedó de verdad (la pestaña que ya existía se queda donde Daniel la tenía).
      const real = ventanaDe(usePanelFijadas.getState().enVentana, id)
      donde = destino && real === destino.ventana ? destino.texto : `${nombreVentana(real)}${existia ? ' (ya estaba abierta ahí)' : ''}`
      // Servidores, Rutinas y Memoria no son pestaña propia: abren el Taller en su pestaña (fijadas.ts). Levy recibe cuál.
      if (id === 'taller') {
        ok = usePanelFijadas.getState().taller
        const seg = SEGMENTOS_TALLER.find(t => t.id === useSegmentoTaller.getState().segmento)
        if (ok) abiertas = [`Taller · ${seg?.etiqueta ?? 'Agentes'}`]; else detalle = 'el Taller no quedó abierto'
      }
      else {
        ok = !!f
        if (f) abiertas = [nombrePestana(f.input)]
        else detalle = 'la pestaña no quedó en el panel'
      }
    }
  } catch (e) { ok = false; detalle = e instanceof Error ? e.message : 'falló al aplicar' }
  return { comando: cmd.id, ok, detalle, cerradas, abiertas, pestanas: estadoReal().pestanas, ...(donde && abiertas.length ? { donde } : {}) }
}

/**
 * El pulso del latido. Un `setTimeout` de una ventana oculta u ocluida lo frena el navegador (a uno por minuto o peor), y la app
 * «abierta y en uso» dejaba de latir: Levy la veía desconectada (7 oct 2026). Un Worker no se frena así; sin Worker, `setInterval`.
 */
function pulso(cada: number, latir: () => void): () => void {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${cada})`], { type: 'text/javascript' }))
    const w = new Worker(url)
    URL.revokeObjectURL(url)
    w.onmessage = latir
    return () => w.terminate()
  } catch {
    const t = setInterval(latir, cada)
    return () => clearInterval(t)
  }
}

/** Monta el latido y la atención de pedidos (solo la ventana principal). */
export function useAtenderPanel() {
  useEffect(() => {
    const clientId = idDeVentana()
    const etiqueta = isDesktopRuntime() ? 'App de escritorio de Arbrain' : 'Arbrain en el navegador'
    const dispositivo = dispositivoId()
    let vivo = true, enCurso = false, otraVez = false
    const acuses: Acuse[] = []
    const aplicados = new Set(leerAplicados())
    usePanelAjustes.getState().cargar()

    const sincronizar = async () => {
      if (enCurso) { otraVez = true; return }
      enCurso = true
      const enviados = acuses.splice(0)
      try {
        const r = await fetch(URL_PANEL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ clientId, etiqueta, dispositivo, escribio: escrituras(), ...estadoReal(), acuses: enviados, compartido: pedidoCompartido() }) })
        if (!r.ok) throw new Error(String(r.status))
        const { comandos, ajustes, compartido } = await r.json() as { comandos?: Comando[]; ajustes?: { rev: number; orden: string[]; ocultas: string[]; donde?: string }; compartido?: RespuestaCompartido }
        // El panel compartido entre aparatos (14 oct 2026, compartido.ts): lo que cambió en otro aparato llega aquí. Va ANTES de
        // los comandos de Levy, para que lo que él abra caiga sobre el panel ya al día.
        recibirCompartido(compartido)
        // La config del «+» (Ajustes › Panel, o Levy) viaja en el latido: se aplica y la próxima vez se reporta su versión (el acuse).
        if (ajustes) usePanelAjustes.getState().recibir(normalizarAjustes(ajustes), true)
        for (const cmd of comandos ?? []) {
          if (aplicados.has(cmd.id)) {
            // Ya lo apliqué pero el servidor no tiene mi acuse (recargué antes de enviarlo): acuso con el estado de ahora.
            if (!acuses.some(a => a.comando === cmd.id)) { acuses.push({ comando: cmd.id, ok: true, detalle: 'aplicado antes de recargar la ventana', cerradas: [], abiertas: [], pestanas: estadoReal().pestanas }); otraVez = true }
            continue
          }
          aplicados.add(cmd.id); anotarAplicado(cmd.id)
          // Lo que Levy abre cae en la ventana que Daniel eligió (por defecto la de la izquierda): se mide antes de aplicar.
          acuses.push(aplicar(cmd, abreAlgo(cmd) ? await resolverDestino() : undefined)); otraVez = true
        }
      } catch { acuses.unshift(...enviados) } // sin conexión con el Studio: el acuse sale en el próximo latido
      finally { enCurso = false }
      if (vivo && otraVez) { otraVez = false; void sincronizar() }
    }
    const latir = () => { void sincronizar() }
    latir()
    const parar = pulso(CADA_MS, latir)
    // Al volver a la ventana o a la red, late en el acto sin esperar al pulso.
    const alVolver = () => { if (!document.hidden) latir() }
    document.addEventListener('visibilitychange', alVolver); window.addEventListener('focus', latir); window.addEventListener('online', latir)
    // Cualquier cambio del panel (a mano o por Levy) se reporta enseguida, sin esperar al latido.
    let aviso: ReturnType<typeof setTimeout> | undefined
    const reportarYa = () => { clearTimeout(aviso); aviso = setTimeout(() => { void sincronizar() }, 400) }
    const sub1 = usePanelFijadas.subscribe(reportarYa)
    const sub2 = usePanelAjustes.subscribe((st, antes) => { if (st.ajustes.rev !== antes.ajustes.rev) reportarYa() })
    return () => { vivo = false; parar(); clearTimeout(aviso); sub1(); sub2(); document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('focus', latir); window.removeEventListener('online', latir) }
  }, [])
}
