/**
 * Comentarios sobre el entregable de un agente, mandados en lote (29 oct 2026; idea 3 del reporte de Warp, reimplementada
 * desde su descripción: «el agente recibe todo el lote y lo aplica en una iteración»).
 *
 * Daniel comenta donde revisa: un párrafo de un documento (vista Documento) o una línea de un diff (Taller › Historia).
 * Cada comentario guarda archivo, línea y lo citado. Se juntan aquí, por agente, hasta que él aprieta «Mandar N
 * comentarios»: un solo POST a `/api/cabina/comentarios`, que el agent-server arma como UN mensaje y entrega por `retomar`
 * (`acciones-tablero.ts › mensajeComentarios`).
 *
 * Lo puro (línea de una cita, línea nueva de un diff, a qué agente va, el envío) se prueba en node; el almacén vive en
 * localStorage para no perder lo escrito si se cierra la pestaña.
 */
import { sinRespuestaDelServidor } from '@/lib/edicion'
import { useSyncExternalStore } from 'react'
import type { Trabajos } from '../trabajos-modelo'

export interface ComentarioPendiente {
  id: string
  ruta: string
  linea?: number
  cita?: string
  texto: string
  /** A qué agente va (si se supo); si no, la bandeja deja elegir. */
  agente?: number
  creado: number
}

export interface AgenteAbierto { id: number; nombre: string; cwd: string; rama?: string }

/** Los subagentes de Levy abiertos (los únicos que reciben comentarios por la misma vía que «Responder»). */
export function agentesAbiertos(data: Trabajos | undefined): AgenteAbierto[] {
  return (data?.terminales ?? []).flatMap(t => {
    const s = t.subagente
    if (!s || typeof s.id !== 'number' || (s as { cerrado?: string }).cerrado) return []
    return [{ id: s.id, nombre: s.nombre, cwd: s.cwd, ...(s.rama ? { rama: s.rama } : {}) }]
  })
}

const conTilde = (r: string) => r.replace(/^\/Users\/[^/]+(?=\/|$)/, '~').replace(/^\/home\/[^/]+(?=\/|$)/, '~').replace(/\/+$/, '')

/** El agente cuya carpeta contiene el archivo (la más profunda gana), o el de esa rama. */
export function agenteParaRuta(ruta: string, agentes: AgenteAbierto[], pista: { rama?: string; carpeta?: string } = {}): number | undefined {
  if (pista.rama) { const a = agentes.find(x => x.rama === pista.rama); if (a) return a.id }
  if (pista.carpeta) { const c = conTilde(pista.carpeta); const a = agentes.find(x => conTilde(x.cwd) === c || conTilde(x.cwd).endsWith('/' + c)); if (a) return a.id }
  const r = conTilde(ruta)
  const dentro = agentes.filter(a => { const c = conTilde(a.cwd); return r.startsWith(c + '/') })
  return dentro.sort((a, b) => b.cwd.length - a.cwd.length)[0]?.id
}

const normal = (s: string) => s.replace(/[*_`#>\[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * La línea (1 = primera) del texto fuente donde empieza lo citado: el párrafo que se ve renderizado se busca en el
 * markdown sin sus marcas. undefined si no aparece.
 */
export function lineaDeCita(fuente: string, cita: string): number | undefined {
  const c = normal(cita).slice(0, 40)
  if (c.length < 3) return undefined
  const lineas = fuente.split('\n')
  // un párrafo puede partirse en varias líneas del fuente: desde cada línea con texto se miran las cinco siguientes
  for (let i = 0; i < lineas.length; i++) if (normal(lineas[i]) && normal(lineas.slice(i, i + 5).join(' ')).startsWith(c)) return i + 1
  const i = lineas.findIndex(l => normal(l).includes(c.slice(0, 24)))
  return i >= 0 ? i + 1 : undefined
}

/** Línea del diff en el archivo NUEVO: `desde` es la primera; cuentan las iguales, las añadidas y las cambiadas. */
export function lineaNuevaDelDiff(desde: number, tipos: ReadonlyArray<'igual' | 'mas' | 'menos' | 'cambio'>, indice: number): number | undefined {
  let n = desde
  for (let i = 0; i < indice; i++) if (tipos[i] !== 'menos') n++
  return tipos[indice] === 'menos' ? undefined : n
}

/** Lo que viaja al servidor (sin ids ni fechas). */
export function envioDe(cs: ComentarioPendiente[]): { ruta: string; linea?: number; cita?: string; texto: string }[] {
  return cs.map(c => ({ ruta: c.ruta, texto: c.texto.trim(), ...(c.linea ? { linea: c.linea } : {}), ...(c.cita ? { cita: c.cita.slice(0, 1200) } : {}) }))
}

/** «Mandar 4 comentarios a «armar la app»». */
export const textoBoton = (n: number, nombre?: string) => `Mandar ${n} ${n === 1 ? 'comentario' : 'comentarios'}${nombre ? ` a «${nombre}»` : ''}`

// ── Edición cliente (30 oct 2026): el lote va a SU chat con Levy, como borrador ──
/** Evento que recibe el chat abierto para dejar un borrador en su caja (ChatPanel). Nunca envía. */
export const EVENTO_BORRADOR_CHAT = 'arbrain:chat-borrador'

/**
 * El lote como UN mensaje para Levy: cada comentario con su archivo, línea y lo citado. En la edición cliente no hay
 * agentes abiertos en terminales: el dueño revisa el borrador en su chat y lo manda él.
 */
export function mensajeParaLevy(cs: ComentarioPendiente[]): string {
  const items = envioDe(cs).map((c, i) => `${i + 1}. \`${c.ruta}${c.linea ? `:${c.linea}` : ''}\`${c.cita ? ` · «${c.cita.replace(/\s+/g, ' ').trim().slice(0, 200)}»` : ''}\n   ${c.texto}`)
  return `${cs.length === 1 ? 'Un comentario' : `${cs.length} comentarios`} sobre lo que me entregaste. Aplícalos en una sola pasada y dime qué cambiaste:\n\n${items.join('\n')}`
}

/** «Mandar 3 comentarios a Levy» (cliente). */
export const textoBotonLevy = (n: number) => `Mandar ${n} ${n === 1 ? 'comentario' : 'comentarios'} a Levy`

/** Deja el lote en el chat: si ya está abierto, por el evento; si no, abre `/chat?draft=`. Quita los pendientes. */
export function comentariosAlChat(cs: ComentarioPendiente[], ir: (url: string) => void): string {
  const texto = mensajeParaLevy(cs)
  if (globalThis.location?.pathname === '/chat') globalThis.dispatchEvent?.(new CustomEvent(EVENTO_BORRADOR_CHAT, { detail: texto }))
  else ir(`/chat?draft=${encodeURIComponent(texto)}`)
  comentarios.quitarVarios(cs.map(c => c.id))
  return 'Quedaron en tu chat con Levy como borrador: revísalos y mándalos.'
}

// ── Almacén (localStorage, compartido entre vistas) ──
const CLAVE = 'arbrain.comentariosEntregable'
let lista: ComentarioPendiente[] | null = null
const oyentes = new Set<() => void>()
function leer(): ComentarioPendiente[] {
  if (lista) return lista
  try { const v = JSON.parse(globalThis.localStorage?.getItem(CLAVE) ?? '[]'); lista = Array.isArray(v) ? v : [] } catch { lista = [] }
  return lista!
}
function escribir(nueva: ComentarioPendiente[]) {
  lista = nueva
  try { globalThis.localStorage?.setItem(CLAVE, JSON.stringify(nueva)) } catch { /* sin almacenamiento: vive en memoria */ }
  for (const f of oyentes) f()
}
export const comentarios = {
  todos: leer,
  agregar(c: Omit<ComentarioPendiente, 'id' | 'creado'>): ComentarioPendiente {
    const nuevo = { ...c, id: Math.random().toString(36).slice(2, 10), creado: Date.now() }
    escribir([...leer(), nuevo])
    return nuevo
  },
  quitar(id: string) { escribir(leer().filter(c => c.id !== id)) },
  asignar(ids: string[], agente: number) { escribir(leer().map(c => ids.includes(c.id) ? { ...c, agente } : c)) },
  quitarVarios(ids: string[]) { escribir(leer().filter(c => !ids.includes(c.id))) },
  /** Pruebas. */
  _reiniciar(v: ComentarioPendiente[] = []) { lista = v; for (const f of oyentes) f() },
}
const vacio: ComentarioPendiente[] = []
export function useComentarios(): ComentarioPendiente[] {
  return useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f) } }, leer, () => vacio)
}

/** Manda el lote. Devuelve el texto del servidor («Le llegaron tus 4 comentarios…») o lanza con su error. */
export async function mandarComentarios(agente: number, cs: ComentarioPendiente[]): Promise<string> {
  const r = await fetch('/api/cabina/comentarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente, comentarios: envioDe(cs) }), signal: AbortSignal.timeout(60_000) })
  const b = await r.json().catch(() => ({})) as { texto?: string; error?: string }
  if (!r.ok) throw new Error(b.error ?? sinRespuestaDelServidor())
  comentarios.quitarVarios(cs.map(c => c.id))
  return b.texto ?? 'Enviados.'
}
