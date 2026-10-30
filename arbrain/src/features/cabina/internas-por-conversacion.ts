/**
 * Las tareas internas de los turnos de Levy, separadas por conversación (1 oct 2026).
 *
 * Daniel: «el tema de los subagentes quizá debería estar separado entre conversaciones en el
 * panel». Cada `TareaInterna` ya trae `conversacion` (id del chat) y `turno`; aquí vive la regla
 * de agrupación que comparten el Taller del panel derecho y la vista «trabajos» de la Cabina.
 * Es pura (sin React ni red) para probarla con `tsx --test`; los títulos y el «abrir» viven
 * en `conversaciones.ts`.
 */
import { esDeHoy, esProceso, type EstadoInterna, type TareaInterna, type Terminal } from './trabajos-modelo'
import { agenteTerminado } from './terminados'
import { textMessageTitle } from '../chat/lib/text-attachments'

/** Un trabajo que corre pesa más que uno que falló, que uno detenido, que uno terminado. */
const PESO: Record<EstadoInterna, number> = { trabajando: 0, 'falló': 1, detenida: 2, completada: 3 }
const ms = (iso: string) => Date.parse(iso) || 0
/** Dentro de un grupo: por estado y, a igualdad, lo más reciente primero (como la lista de antes). */
const porEstadoYReciente = (a: TareaInterna, b: TareaInterna) => PESO[a.estado] - PESO[b.estado] || ms(b.actualizado) - ms(a.actualizado)
/** `sdk:<id>` y `<id>` son la misma conversación para quien la abre desde el chat. */
const sinPrefijo = (id: string) => id.replace(/^sdk:/, '')

export interface GrupoInternas {
  /** Id de la conversación del chat; '' si la tarea no lo trae (registro viejo). */
  conversacion: string
  /** Es la conversación que Daniel tiene abierta ahora. */
  activa: boolean
  corriendo: TareaInterna[]
  /** Lo que ya no corre y terminó (o falló) hoy; lo viejo no cuenta. */
  terminadas: TareaInterna[]
  fallaron: number
  /** Subagentes lanzados con `delegar` desde esta conversación (3 oct 2026): vivos y ya terminados. */
  agentes: Terminal[]
  agentesTerminados: Terminal[]
  /** Actividad más reciente del grupo (ms), para ordenar los grupos. */
  reciente: number
}

export interface InternasAgrupadas {
  grupos: GrupoInternas[]
  /** Totales de todos los grupos: los contadores del encabezado de la sección. */
  corriendo: number
  terminadas: number
  fallaron: number
}

export interface OpcionesAgrupar {
  /** Conversación abierta en el chat (solo si Daniel está en /chat): va primero. */
  activaId?: string | null
  /** Qué terminadas cuentan. Por omisión, las de hoy (México); la vista de la Cabina las cuenta todas. */
  esHoy?: (iso: string) => boolean
  /** Subagentes de Levy (terminales con `subagente`): se agrupan por su `origen` (Daniel, 3 oct 07:05). */
  agentes?: readonly Terminal[]
}

/**
 * Una entrada por conversación con algo que contar: tareas corriendo o terminadas hoy.
 * Orden: la abierta primero; luego las que tienen algo corriendo; y a igualdad, la de actividad
 * más reciente. Dentro de cada una, como antes: estado y después lo más reciente.
 */
export function agruparInternas(internas: readonly TareaInterna[], { activaId = null, esHoy = esDeHoy, agentes = [] }: OpcionesAgrupar = {}): InternasAgrupadas {
  const porConversacion = new Map<string, TareaInterna[]>()
  const agentesPor = new Map<string, Terminal[]>()
  for (const t of agentes) {
    const id = sinPrefijo(t.subagente?.origen ?? '')
    agentesPor.set(id, [...(agentesPor.get(id) ?? []), t])
    if (!porConversacion.has(id)) porConversacion.set(id, [])
  }
  for (const t of internas) {
    // Una terminada de otro día no entra: igual que antes, solo cuenta lo de hoy.
    if (t.estado !== 'trabajando' && !esHoy(t.actualizado)) continue
    const id = sinPrefijo(t.conversacion ?? '')
    const lista = porConversacion.get(id)
    if (lista) lista.push(t); else porConversacion.set(id, [t])
  }
  const activa = activaId ? sinPrefijo(activaId) : null
  const grupos: GrupoInternas[] = [...porConversacion].map(([conversacion, tareas]) => {
    const ordenadas = [...tareas].sort(porEstadoYReciente)
    const terminadas = ordenadas.filter(t => t.estado !== 'trabajando')
    const suyos = [...(agentesPor.get(conversacion) ?? [])].sort((a, b) => ms(b.subagente?.creado ?? '') - ms(a.subagente?.creado ?? ''))
    return {
      agentes: suyos.filter(t => !agenteTerminado(t)),
      agentesTerminados: suyos.filter(agenteTerminado),
      conversacion,
      activa: activa !== null && conversacion !== '' && sinPrefijo(conversacion) === activa,
      corriendo: ordenadas.filter(t => t.estado === 'trabajando'),
      terminadas,
      fallaron: terminadas.filter(t => t.estado === 'falló').length,
      reciente: Math.max(0, ...tareas.map(t => ms(t.actualizado)), ...suyos.map(t => ms(t.subagente?.creado ?? ''))),
    }
  })
  const vivo = (g: GrupoInternas) => g.corriendo.length > 0 || g.agentes.length > 0
  // «Sin conversación» siempre al final: no es una conversación que Daniel pueda abrir.
  grupos.sort((a, b) => Number(b.activa) - Number(a.activa) || Number(a.conversacion === '') - Number(b.conversacion === '') || Number(vivo(b)) - Number(vivo(a)) || b.reciente - a.reciente)
  return {
    grupos,
    corriendo: grupos.reduce((n, g) => n + g.corriendo.length, 0),
    terminadas: grupos.reduce((n, g) => n + g.terminadas.length, 0),
    fallaron: grupos.reduce((n, g) => n + g.fallaron, 0),
  }
}

/** Lo que corre en una conversación, separado en agentes y procesos (14 oct 2026, Daniel: «dice 9 agentes pero muchos
 *  son procesos de la terminal»). Un comando en segundo plano cuelga del subagente que lo lanzó (`padre`, SDK
 *  `parent_task_id`) si ese agente sigue corriendo aquí; si lo lanzó el hilo principal de Levy, su agente ya no se ve
 *  o el registro es viejo (sin `padre`), queda en `sueltos`. Ningún proceso cuenta como agente. */
export interface CorriendoSeparado {
  agentes: TareaInterna[]
  procesosDe: Map<string, TareaInterna[]>
  sueltos: TareaInterna[]
  procesos: number
}
export function separarProcesos(corriendo: readonly TareaInterna[]): CorriendoSeparado {
  const agentes = corriendo.filter(t => !esProceso(t))
  const ids = new Set(agentes.map(t => t.id))
  const procesosDe = new Map<string, TareaInterna[]>(), sueltos: TareaInterna[] = []
  let procesos = 0
  for (const t of corriendo) {
    if (!esProceso(t)) continue
    procesos++
    if (t.padre && ids.has(t.padre)) procesosDe.set(t.padre, [...(procesosDe.get(t.padre) ?? []), t])
    else sueltos.push(t)
  }
  return { agentes, procesosDe, sueltos, procesos }
}

/** Lo mínimo que se necesita de una conversación del chat para ponerle nombre. */
export interface ConversacionConTitulo { id: string; title?: string | null; sdkSessionId?: string }

/** El título de la conversación, sin los adjuntos de texto que el mensaje trae pegados ni saltos de línea. */
export const tituloLimpio = (titulo: string | null | undefined): string | null => {
  const t = textMessageTitle(titulo ?? '').replace(/\s+/g, ' ').trim()
  return t || null
}

/** Busca el título de `id` en las listas que la app ya tiene (publicadas, traídas, fijadas). */
export function tituloDe(id: string, listas: readonly (readonly ConversacionConTitulo[])[]): string | null {
  if (!id) return null
  const buscado = sinPrefijo(id)
  for (const lista of listas) {
    const s = lista.find(x => sinPrefijo(x.id) === buscado || x.sdkSessionId === buscado)
    const t = s ? tituloLimpio(s.title) : null
    if (t) return t
  }
  return null
}

/** Cuando ninguna lista la conoce: rótulo honesto con el inicio del id, para distinguir una de otra. */
export const sinTitulo = (id: string) => id ? `Otra conversación · ${sinPrefijo(id).slice(0, 6)}` : 'Otra conversación'
