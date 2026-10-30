'use client'
/**
 * Lo que espera una decisión de Daniel: la pregunta de un modelo que Levy no lleva y los avisos que piden un sí/no.
 * Lo leen Tareas (la lista completa) y la píldora del encabezado del chat («· 1 te espera», 5 oct 2026), que
 * reemplazó a la fila de píldoras sobre el cuerpo del panel. Una sola lectura por fuente (datos.ts).
 */
import { useCallback, useEffect, useState } from 'react'
import { releer, useFuente } from '../datos'
import { preguntaAlgo, trabajandoAhora, ultimaRespuesta } from '../trabajos-modelo'
import { urlPanel, type Terminal, type Trabajos } from './datos'
import { esEdicionCliente } from '@/lib/edicion'

export interface Aviso { id: string; created_at: string; kind: string; title: string; body: string | null; url: string | null; read_at: string | null }

/** Sube a «Espera tu decisión» la pregunta de un modelo en una sesión que Levy no lleva, o la de un subagente de
 *  Levy que él no atendió a tiempo (`escalado`, 5 oct 2026). Lo demás lo atiende Levy (retomar), y un agente que
 *  solo terminó no pide nada. */
export const pideRevision = (t: Terminal) => preguntaAlgo(t) && (!t.subagente || !!t.subagente.escalado)
/** Avisos que piden un sí/no o un dato explícito. Los demás (reportes, cierres) son informativos. */
export const PIDE_DECISION = new Set(['decision', 'aprobacion', 'pregunta'])
/** La firma cambia cuando el agente dice algo nuevo: lo revisado no vuelve, lo nuevo sí. */
export const firmaRevision = (t: Terminal) => `${t.id}:${t.subagente?.creado ?? ''}:${t.subagente?.escalado ?? ''}:${(t.subagente?.pregunta?.texto ?? ultimaRespuesta(t)?.texto ?? '').slice(0, 80)}`

const CAMBIO_VISTOS = 'arbrain:vistos'
const leerVistos = (clave: string) => { try { return new Set<string>(JSON.parse(localStorage.getItem(clave) ?? '[]')) } catch { return new Set<string>() } }

/** Lo que Daniel ya revisó se recuerda en este dispositivo; Tareas y la píldora del chat lo ven a la vez. */
function useVistos(clave: string): [Set<string>, (id: string) => void] {
  const [vistas, setVistas] = useState<Set<string>>(new Set())
  useEffect(() => {
    const leer = () => setVistas(leerVistos(clave))
    const alCambiar = (e: Event) => { if ((e as CustomEvent<string>).detail === clave) leer() }
    leer()
    window.addEventListener(CAMBIO_VISTOS, alCambiar)
    return () => window.removeEventListener(CAMBIO_VISTOS, alCambiar)
  }, [clave])
  const marcar = useCallback((id: string) => {
    const n = leerVistos(clave).add(id)
    try { localStorage.setItem(clave, JSON.stringify([...n].slice(-300))) } catch { /* sin almacenamiento */ }
    setVistas(n)
    window.dispatchEvent(new CustomEvent(CAMBIO_VISTOS, { detail: clave }))
  }, [clave])
  return [vistas, marcar]
}

/** Lo que pide algo al dueño y cuántos agentes trabajan (una sola lectura por fuente, ver datos.ts). */
export function usePendientes() {
  const trabajos = useFuente<Trabajos>(urlPanel(false), 4000)
  // Edición cliente: no hay buzón de avisos (es una tabla del negocio de Daniel).
  const avisos = useFuente<{ avisos: Aviso[] }>(esEdicionCliente() ? null : '/api/avisos', 30_000)
  const [revisados, marcarRevisado] = useVistos('arbrain.panel.agentesRevisados')
  const [leidos, setLeidos] = useState<Set<string>>(new Set())
  // Tareas = solo lo que pide algo al dueño (Fase 2: «si tú te encargaste, no me lo muestres»).
  // Los agentes viven en el Taller; aquí sube solo la pregunta de un modelo que Levy no lleva.
  // Los avisos informativos (reportes, cierres) se quedan en la campana y en «Lo que llegó».
  const terminales = trabajos.data?.terminales ?? []
  const piden = terminales.filter(t => pideRevision(t) && !revisados.has(firmaRevision(t)))
  const trabajando = trabajandoAhora(trabajos.data).total
  const sinLeer = (avisos.data?.avisos ?? []).filter(a => !a.read_at && !leidos.has(a.id) && PIDE_DECISION.has(a.kind))
  const marcarLeido = async (a: Aviso) => {
    setLeidos(l => new Set(l).add(a.id))
    // Relee la fuente compartida: la píldora del chat baja su «te espera» sin esperar el siguiente ciclo.
    try { await fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [a.id] }) }); void releer('/api/avisos') }
    catch { setLeidos(l => { const n = new Set(l); n.delete(a.id); return n }) }
  }
  return { trabajos, avisos, piden, sinLeer, trabajando, marcarRevisado, marcarLeido }
}
