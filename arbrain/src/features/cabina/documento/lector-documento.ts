/**
 * «Escuchar» en las pestañas del panel (7 oct 2026, pedido de Daniel: «con eso lee y avanza muy rápido»).
 *
 * Es una función DEL VISOR, no de cada archivo: el motor de voz es el del chat (chat-speech.ts, una sola voz, un solo
 * singleton) y este módulo solo le consigue el texto de un documento abierto y le presta las manos para pintarlo:
 *
 *   pestaña (data-fijada)  →  agente (lector-agente.ts) extrae bloques  →  lector-seleccion.ts decide cuáles se leen
 *        →  el motor lee un ESPEJO de esos bloques (mismo textContent, así los offsets coinciden)
 *        →  el puente devuelve cada palabra al documento real: pintar / ver / toque.
 *
 *  · .md y .txt: el agente corre aquí, sobre el contenedor `[data-lector-dom]` de la vista.
 *  · .html: el agente vive DENTRO del iframe aislado (lo inyecta el servidor, tema-html.ts) y se habla por postMessage.
 *
 * Velocidad: la última que se usó se recuerda (localStorage) y se aplica al arrancar.
 */
import { useSyncExternalStore } from 'react'
import { chatSpeech, type PuenteLector } from '@/features/chat/lib/chat-speech'
import { crearAgenteLector, type AgenteLector } from './lector-agente'
import { seleccionarBloques, type BloqueCrudo } from './lector-seleccion'

export type ResultadoLector = 'leyendo' | 'parado' | 'vacio' | 'sin-fuente' | 'sin-respuesta'

const LLAVE_VELOCIDAD = 'arbrain-lector-doc-vel'
const ESPERA_IFRAME_MS = 20_000
const EXTENSIONES = /\.(html?|md|markdown|txt)$/i

export const idLector = (fijadaId: string) => `doc:${fijadaId}`
export const sePuedeEscuchar = (ruta: string | undefined) => !!ruta && EXTENSIONES.test(ruta)

export function velocidadGuardada(): number | null {
  try {
    const v = Number(window.localStorage.getItem(LLAVE_VELOCIDAD))
    return v > 0 ? v : null
  } catch { return null }
}
export function guardarVelocidad(rate: number) {
  try { window.localStorage.setItem(LLAVE_VELOCIDAD, String(rate)) } catch { /* modo privado */ }
}

// ── Qué pestaña se está preparando (extraer un documento largo toma un respiro) ──
let preparando: string | null = null
const oyentes = new Set<() => void>()
const fijarPreparando = (id: string | null) => { preparando = id; oyentes.forEach(l => l()) }
/** `true` mientras el documento de esa pestaña se está leyendo del DOM (antes de que suene). */
export function usePreparando(fijadaId: string): boolean {
  return useSyncExternalStore(
    cb => { oyentes.add(cb); return () => { oyentes.delete(cb) } },
    () => preparando === fijadaId,
    () => false,
  )
}

// ── El agente dentro del iframe, con la misma forma que el local ──
function agenteRemoto(marco: HTMLIFrameElement, alToque: (i: number, offset: number) => void, falloExtraer: () => void): AgenteLector & { soltar(): void } {
  const ventana = () => marco.contentWindow
  const enviar = (m: object) => ventana()?.postMessage(m, '*')
  let pedido = 0
  let listoPendiente: ((b: Array<{ t: string; tabla: boolean; enc: boolean }>) => void) | null = null
  let espera: ReturnType<typeof setTimeout> | null = null
  const al = (e: MessageEvent) => {
    if (e.source !== ventana() || !e.data) return
    if (e.data.tipo === 'arbrain-lector-toque' && typeof e.data.i === 'number') alToque(e.data.i, Number(e.data.offset) || 0)
    else if (e.data.tipo === 'arbrain-lector-bloques' && e.data.id === pedido && listoPendiente) {
      if (espera) clearTimeout(espera)
      const f = listoPendiente
      listoPendiente = null
      f(Array.isArray(e.data.bloques) ? e.data.bloques : [])
    }
  }
  window.addEventListener('message', al)
  return {
    // `pedir` activa el agente dentro del iframe y extrae en el mismo mensaje.
    activar() {},
    extraer(listo) {
      listoPendiente = listo
      enviar({ tipo: 'arbrain-lector-pedir', id: ++pedido })
      // Un HTML servido antes de esta función (o de otro origen) no contesta: no es un fallo mudo.
      espera = setTimeout(() => { if (listoPendiente) { listoPendiente = null; falloExtraer() } }, ESPERA_IFRAME_MS)
    },
    pintar: (bloque, desde, hasta) => enviar({ tipo: 'arbrain-lector-pintar', i: bloque, desde, hasta }),
    limpiar: () => enviar({ tipo: 'arbrain-lector-limpiar' }),
    ver: bloque => enviar({ tipo: 'arbrain-lector-ver', i: bloque }),
    cerrar() { enviar({ tipo: 'arbrain-lector-cerrar' }); this.soltar() },
    soltar() { if (espera) clearTimeout(espera); listoPendiente = null; window.removeEventListener('message', al) },
  }
}

let vigia: ReturnType<typeof setInterval> | null = null
const quitarVigia = () => {
  if (vigia) clearInterval(vigia)
  vigia = null
}

/**
 * Empieza (o detiene, si ya suena) la lectura del documento de una pestaña. Devuelve cómo quedó.
 * `fijadaId` es el de la pestaña: su vista lleva `data-fijada`.
 */
export async function alternarLectura(fijadaId: string): Promise<ResultadoLector> {
  if (!chatSpeech) return 'sin-fuente'
  const id = idLector(fijadaId)
  if (chatSpeech.isActive(id)) { chatSpeech.stop(); return 'parado' }
  if (preparando === fijadaId) { fijarPreparando(null); return 'parado' } // segundo clic mientras prepara = cancelar
  const raiz = document.querySelector<HTMLElement>(`[data-fijada="${CSS.escape(fijadaId)}"]`)
  const marco = raiz?.querySelector<HTMLIFrameElement>('iframe[data-lector]') ?? null
  const dom = raiz?.querySelector<HTMLElement>('[data-lector-dom]') ?? null
  if (!raiz || (!marco && !dom)) return 'sin-fuente'

  let bloqueDe = new Map<number, number>() // índice en el documento → índice en el motor
  const alToque = (i: number, offset: number) => {
    const k = bloqueDe.get(i)
    if (k != null && chatSpeech.isActive(id)) chatSpeech.saltarA(k, offset)
  }
  fijarPreparando(fijadaId)
  const crudos = await new Promise<{ agente: AgenteLector; bloques: BloqueCrudo[] } | null>(listo => {
    let agente: AgenteLector
    const fallo = () => { agente.cerrar(); listo(null) }
    agente = marco ? agenteRemoto(marco, alToque, fallo) : crearAgenteLector(dom!, window, alToque)
    agente.activar()
    agente.extraer(bloques => listo({ agente, bloques }))
  })
  const cancelado = preparando !== fijadaId
  fijarPreparando(null)
  if (!crudos) return 'sin-respuesta'
  const { agente, bloques } = crudos
  const elegidos = cancelado ? [] : seleccionarBloques(bloques)
  if (!elegidos.length) { agente.cerrar(); return cancelado ? 'parado' : 'vacio' }
  bloqueDe = new Map(elegidos.map((o, k) => [o, k]))

  const puente: PuenteLector = {
    pintar: (k, desde, hasta) => agente.pintar(elegidos[k], desde, hasta),
    limpiar: () => agente.limpiar(),
    ver: k => agente.ver(elegidos[k]),
    cerrar: () => { agente.cerrar(); quitarVigia() },
  }
  const v = velocidadGuardada()
  if (v) chatSpeech.fijarVelocidad(v)
  chatSpeech.toggle(id, dom ?? raiz, undefined, undefined, { textos: elegidos.map(i => bloques[i].t), puente })

  // Si la pestaña se cierra o el iframe se recrea (el archivo cambió en disco), nada que leer: parar.
  // Un solo intervalo mientras dura la lectura (no uno por botón: lección del chat).
  quitarVigia()
  vigia = setInterval(() => {
    if (!chatSpeech.isActive(id)) return quitarVigia()
    if (!raiz.isConnected || (marco && !marco.isConnected) || (dom && !dom.isConnected)) chatSpeech.stop()
  }, 1500)
  return chatSpeech.isActive(id) ? 'leyendo' : 'vacio'
}
