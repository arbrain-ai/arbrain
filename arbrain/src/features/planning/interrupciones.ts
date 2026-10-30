import { esDelegable, inferirDrip } from './drip'

/**
 * Interrupciones a la persona en cosas de Reemplazar o Delegar (25 oct 2026, Daniel firmó el segundo número de la revisión del
 * domingo). La fuente honesta, y lo único que cuenta: los avisos de las rutinas que DECLARARON pedir su decisión (metadata
 * `pide_decision` en `chat_messages`, carpeta Rutinas en morado; ver `declaracionDecision` en shared/constants/rutinas-hilos.ts).
 * Cada uno se clasifica por DRIP con el texto de su decisión (o el nombre de la rutina): es inferencia, corregible como cualquier
 * evento. Lo que NO se mide todavía: las preguntas que Levy hace dentro del chat (no llevan marca). La pantalla lo dice así; sin
 * fuente (edición del alumno sin la tabla), «sin medir», nunca un cero.
 */
export interface FilaDecision { creado: string; decision: string | null; rutina: string | null }
export interface Interrupciones {
  medido: true
  /** Avisos que pidieron decisión en el rango. */
  total: number
  /** De esos, los que caen en Reemplazar o Delegar: lo que un agente con regla firmada podría haber decidido solo. */
  rd: number
  /** Hasta tres decisiones R/D, para nombrar la regla que falta (1:3:1). */
  ejemplos: string[]
}
export type LecturaInterrupciones = Interrupciones | { medido: false; motivo: string }

export function contarInterrupciones(filas: readonly FilaDecision[]): Interrupciones {
  const rd = filas.filter(f => {
    const t = (f.decision || f.rutina || '').trim()
    return t ? esDelegable(inferirDrip({ id: 'aviso', title: t, start: '', end: '' }).cuadrante) : false
  })
  const ejemplos = [...new Set(rd.map(f => (f.decision || f.rutina || '').trim()))].slice(0, 3)
  return { medido: true, total: filas.length, rd: rd.length, ejemplos }
}
