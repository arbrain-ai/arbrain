'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { mutationFor } from './model'
import type { MutationResult, PlanItem, PlanMutation, PlanningSnapshot } from './types'

/**
 * Autoguardado de la hoja de detalle (5 oct 2026, bug de Daniel: cambió el título de un evento, dio «Listo» y Google nunca
 * recibió el cambio; «super smooth, quizá debería haber un autoguardado incluso»).
 *
 * El guardado ya no vive dentro de la hoja: vive aquí, en el calendario, que no se desmonta al cerrarla. La hoja solo
 * DECLARA lo que quiere (`editar`); el guardián lo pinta al instante en todas las vistas (capa optimista sobre la lectura),
 * lo escribe por la misma pluma tras una pausa corta, en fila (una escritura a la vez, con el etag de la anterior), y
 * si el proveedor no confirma, quita la capa (la vista vuelve a lo que Google tiene) y lo AVISA. Nunca en silencio.
 */
export type Fase = 'quieto' | 'pendiente' | 'guardando' | 'guardado' | 'error'
export interface EstadoGuardado { fase: Fase; error?: string }
export interface Edicion {
  item: PlanItem
  /** Datos de la actualización; `null` cuando solo cambia el proyecto de una tarea. */
  data: Record<string, unknown> | null
  /** Proyecto destino de una tarea (`move`), si cambió. */
  mover?: string | null
}
export interface Autoguardado {
  editar: (e: Edicion) => void
  /** Escribe ya lo pendiente (de un elemento o de todos) y espera la fila. `true` si todo quedó confirmado. */
  vaciar: (id?: string) => Promise<boolean>
  reintentar: (id: string) => void
  estado: (id: string) => EstadoGuardado
  aplicar: (snapshot: PlanningSnapshot) => PlanningSnapshot
}

interface Entrada {
  item: PlanItem
  data: Record<string, unknown> | null
  mover?: string | null
  sucia: boolean
  fase: Fase
  error?: string
  timer?: ReturnType<typeof setTimeout>
  /** Lo que se pinta encima de la lectura mientras no esté confirmado. */
  capa: Record<string, unknown> | null
  /** La última operación enviada: reintentarla tal cual (mismo requestId) respeta la idempotencia de la pluma. */
  ultima?: PlanMutation
  reenviar?: boolean
}

const QUIETO: EstadoGuardado = { fase: 'quieto' }

/** Lo que la mutación cambia, con nombres de PlanItem (eventData/taskData usan los mismos). */
export function capaDe(data: Record<string, unknown> | null, mover?: string | null): Record<string, unknown> | null {
  const capa: Record<string, unknown> = {}
  if (data) for (const [k, v] of Object.entries(data)) if (k !== 'timeZone' && k !== 'recurrence' && v !== undefined) capa[k] = v
  if (mover) capa.projectId = mover
  return Object.keys(capa).length ? capa : null
}

export function aplicarCapas(snapshot: PlanningSnapshot, capas: Map<string, Record<string, unknown>>): PlanningSnapshot {
  if (!capas.size) return snapshot
  const toca = (id: string) => capas.get(id)
  return { ...snapshot,
    events: snapshot.events.map(e => { const c = toca(e.id); return c ? { ...e, ...c } as typeof e : e }),
    tasks: snapshot.tasks.map(t => { const c = toca(t.id); return c ? { ...t, ...c } as typeof t : t }) }
}

/** El núcleo, sin React: una fila de escrituras, una capa por elemento y su estado. El hook solo lo envuelve. */
export class Guardian {
  private entradas = new Map<string, Entrada>()
  private fila: Promise<unknown> = Promise.resolve()
  constructor(private o: {
    ownerId: () => string | undefined
    escribir: (m: PlanMutation) => Promise<MutationResult>
    onFallo: (titulo: string, mensaje: string, reintentar: () => void) => void
    onCambio: () => void
    demora: number
  }) {}

  private async escribirEntrada(id: string): Promise<boolean> {
    const e = this.entradas.get(id)
    if (!e) return true
    if (!e.sucia) return e.fase !== 'error'
    const owner = this.o.ownerId()
    if (!owner) { e.fase = 'error'; e.error = 'Sin identidad: vuelve a abrir el calendario.'; this.o.onCambio(); return false }
    const data = e.data, mover = e.mover
    e.sucia = false; e.fase = 'guardando'; e.error = undefined; this.o.onCambio()
    try {
      let actual = e.item
      if (data) {
        // Un reintento sin ediciones nuevas reenvía la MISMA operación: si la anterior sí llegó, la pluma devuelve su recibo.
        const m = e.reenviar && e.ultima ? e.ultima : mutationFor(actual, owner, data)
        e.ultima = m; e.reenviar = false
        const r = await this.o.escribir(m); actual = r.event ?? r.task ?? actual
      }
      if (mover && actual.kind === 'task' && mover !== actual.projectId) { const r = await this.o.escribir(mutationFor(actual, owner, { projectId: mover }, 'move')); actual = r.task ?? actual }
      // La siguiente escritura de este elemento usa su etag/updatedAt nuevo.
      e.item = actual
      if (!e.sucia) { e.fase = 'guardado'; e.capa = null }
      this.o.onCambio()
      return true
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'El proveedor no confirmó el cambio.'
      if (e.sucia) { this.o.onCambio(); return false } // llegó otra edición encima: su propia escritura decide
      e.fase = 'error'; e.error = mensaje; e.capa = null
      this.o.onCambio()
      this.o.onFallo(String(data?.title ?? e.item.title), mensaje, () => this.reintentar(id))
      return false
    }
  }

  private encolar(id: string) {
    const e = this.entradas.get(id)
    if (e?.timer) { clearTimeout(e.timer); e.timer = undefined }
    const paso = this.fila.then(() => this.escribirEntrada(id))
    this.fila = paso.catch(() => false)
    return paso
  }

  editar({ item, data, mover }: Edicion) {
    const previa = this.entradas.get(item.id)
    // Conserva el elemento más reciente (etag confirmado) si ya hubo escrituras en esta sesión.
    const e: Entrada = previa ?? { item, data, sucia: false, fase: 'quieto', capa: null }
    if (!previa) this.entradas.set(item.id, e)
    e.data = data; e.mover = mover; e.sucia = true; e.fase = 'pendiente'; e.error = undefined; e.reenviar = false
    e.capa = capaDe(data, mover)
    if (e.timer) clearTimeout(e.timer)
    e.timer = setTimeout(() => { void this.encolar(item.id) }, this.o.demora)
    this.o.onCambio()
  }

  reintentar(id: string) {
    const e = this.entradas.get(id)
    if (!e || e.fase !== 'error') return
    e.sucia = true; e.reenviar = true; e.fase = 'pendiente'; e.capa = capaDe(e.data, e.mover); this.o.onCambio()
    void this.encolar(id)
  }

  async vaciar(id?: string) {
    const ids = id ? [id] : [...this.entradas.keys()]
    const pasos = ids.filter(i => this.entradas.get(i)?.sucia).map(i => this.encolar(i))
    await this.fila
    const res = await Promise.all(pasos)
    return res.every(Boolean) && ids.every(i => this.entradas.get(i)?.fase !== 'error')
  }

  estado(id: string): EstadoGuardado {
    const e = this.entradas.get(id)
    return e ? { fase: e.fase, error: e.error } : QUIETO
  }

  vivas() { return [...this.entradas.values()].some(e => e.sucia || e.fase === 'guardando') }

  aplicar(snapshot: PlanningSnapshot) {
    const capas = new Map<string, Record<string, unknown>>()
    for (const [id, e] of this.entradas) if (e.capa) capas.set(id, e.capa)
    return aplicarCapas(snapshot, capas)
  }
}

export function useAutoguardado({ ownerId, escribir, onFallo, demora = 600 }: {
  ownerId: string | undefined
  escribir: (m: PlanMutation) => Promise<MutationResult>
  /** Aviso visible fuera de la hoja (la hoja puede estar cerrada cuando el proveedor responde). */
  onFallo: (titulo: string, mensaje: string, reintentar: () => void) => void
  demora?: number
}): Autoguardado {
  const deps = useRef({ ownerId, escribir, onFallo }); deps.current = { ownerId, escribir, onFallo }
  const [version, setVersion] = useState(0)
  const [g] = useState(() => new Guardian({ ownerId: () => deps.current.ownerId, escribir: m => deps.current.escribir(m),
    onFallo: (t, m, r) => deps.current.onFallo(t, m, r), onCambio: () => setVersion(v => v + 1), demora }))

  // Cerrar la ventana con algo sin confirmar: escribirlo ya y pedir confirmación al navegador.
  useEffect(() => {
    const salir = (ev: BeforeUnloadEvent) => { if (!g.vivas()) return; void g.vaciar(); ev.preventDefault() }
    window.addEventListener('beforeunload', salir)
    // Si la pantalla se desmonta, lo pendiente se escribe igual (la fila no depende de React).
    return () => { window.removeEventListener('beforeunload', salir); void g.vaciar() }
  }, [g])

  // Un objeto nuevo por versión: quien lo recibe se repinta con el estado y la capa al día.
  return useMemo(() => ({ editar: e => g.editar(e), vaciar: id => g.vaciar(id), reintentar: id => g.reintentar(id),
    estado: id => g.estado(id), aplicar: s => g.aplicar(s) }), [g, version]) // eslint-disable-line react-hooks/exhaustive-deps
}
