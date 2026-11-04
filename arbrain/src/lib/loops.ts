/**
 * Loops de negocio (3 nov 2026, prototipo detrás de `ARBRAIN_LOOPS=1`; spec: docs/builds/loops-negocio-2026-11-03/SPEC.md).
 * Lo que la web sabe de un loop y las reglas puras de su vista. La fuente es el daemon (`server/src/cliente/loops.ts`):
 * aquí no se decide nada, solo se agrupa y se dice en palabras del dueño.
 */
import type { Tarjeta } from '@/features/decisiones/lib/bandeja'
import { resumen } from '@/features/rutinas/model'

export type Prioridad = 1 | 2 | 3
export type ModoLoop = 'pregunta-antes' | 'lo-haces-tu' | 'solo-revisa'
export type Toca = 'contactar' | 'pagar' | 'publicar'
export type EstadoCorrida = 'en-orden' | 'excepcion' | 'fallo' | 'sin-contrato'

export interface LoopAgregado { rutina: string; activa: boolean; proxima: number | null; ultima: number | null; resultado: string | null; agregado: number }
export interface PlantillaVista {
  id: string; nombre: string; queVigila: string; teSube: string; prioridad: Prioridad; icono: string
  schedule: string; frecuencia: string; modelo: 'haiku' | 'sonnet' | 'opus'; esfuerzo: 'low' | 'medium' | 'high'
  para: 'dueno' | 'consultor' | 'ambos'; toca?: Toca; modo: ModoLoop; agregado: LoopAgregado | null
}
export interface CorridaVista {
  id: number; rutina: string; plantilla: string; nombre: string; icono: string
  /** Milisegundos. */
  corrida: number; estado: EstadoCorrida; resumen: string; manual: boolean
  respuesta?: 'si' | 'no' | 'otro'; tarjeta?: Tarjeta
}
export interface VistaLoops {
  activo: boolean; tz?: string; error?: string
  prioridades?: Record<Prioridad, { nombre: string; que: string }>
  plantillas?: PlantillaVista[]; corridas?: CorridaVista[]
  resumen?: { loops: number; corridas: number; solas: number; enBandeja: number; fallas: number }
}

export const PRIORIDAD: Record<Prioridad, { corta: string; nombre: string; que: string }> = {
  1: { corta: 'P1', nombre: 'Esencial', que: 'todo negocio los quiere' },
  2: { corta: 'P2', nombre: 'Recomendado', que: 'casi todos los usan' },
  3: { corta: 'P3', nombre: 'Útil', que: 'depende de tu negocio' },
}

const MODELO: Record<PlantillaVista['modelo'], string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
const ESFUERZO: Record<PlantillaVista['esfuerzo'], string> = { low: 'bajo', medium: 'medio', high: 'alto' }
/** «Sonnet · medio»: con qué modelo y cuánto piensa (es lo que de verdad corre). */
export const chipModelo = (p: Pick<PlantillaVista, 'modelo' | 'esfuerzo'>) => `${MODELO[p.modelo]} · ${ESFUERZO[p.esfuerzo]}`

const VERBO: Record<Toca, string> = { contactar: 'contactar', pagar: 'pagar', publicar: 'publicar' }
const TU: Record<Toca, string> = { contactar: 'tú contactas', pagar: 'tú pagas', publicar: 'tú publicas' }
/** Cómo trata lo irreversible, en una frase corta para el chip. */
export function chipModo(p: Pick<PlantillaVista, 'modo' | 'toca'>): string {
  if (p.modo === 'solo-revisa' || !p.toca) return 'Solo revisa'
  if (p.modo === 'lo-haces-tu') return `Te deja listo ${p.toca === 'pagar' ? 'el pago' : 'el texto'}; ${TU[p.toca]}`
  return `Pregunta antes de ${VERBO[p.toca]}`
}

/** Las plantillas por prioridad, P1 primero, en el orden del catálogo. Pura. */
export function porPrioridad<T extends { prioridad: Prioridad }>(lista: T[]): { prioridad: Prioridad; items: T[] }[] {
  return ([1, 2, 3] as Prioridad[]).map(prioridad => ({ prioridad, items: lista.filter(p => p.prioridad === prioridad) })).filter(g => g.items.length > 0)
}

/** Las corridas por día civil (más nuevo primero): «Hoy», «Ayer», «lun 2 nov». Pura. */
export function porDia(corridas: CorridaVista[], ahora: number, tz = 'America/Mexico_City'): { dia: string; titulo: string; items: CorridaVista[] }[] {
  const clave = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz })
  const hoy = clave(ahora), ayer = clave(ahora - 86_400_000)
  const grupos = new Map<string, CorridaVista[]>()
  for (const c of [...corridas].sort((a, b) => b.corrida - a.corrida || b.id - a.id)) {
    const k = clave(c.corrida)
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }
  return [...grupos.entries()].map(([dia, items]) => ({
    dia, items,
    titulo: dia === hoy ? 'Hoy' : dia === ayer ? 'Ayer' : new Date(items[0].corrida).toLocaleDateString('es-MX', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''),
  }))
}

/** ¿La tarjeta de esta corrida sigue esperando a la persona? */
export const esperaTuToque = (c: CorridaVista) => !!c.tarjeta && (c.tarjeta.estado === 'pendiente' || c.tarjeta.estado === 'en_cola')

/** Lo que dice cada corrida en la línea de tiempo. Pura. */
export function estadoCorrida(c: CorridaVista): { tono: 'ok' | 'excepcion' | 'decidida' | 'fallo' | 'sin-dato'; texto: string } {
  if (c.estado === 'en-orden') return { tono: 'ok', texto: 'Se archivó sola' }
  if (c.estado === 'fallo') return { tono: 'fallo', texto: 'Falló' }
  if (c.estado === 'sin-contrato') return { tono: 'sin-dato', texto: 'No supe leer su resultado' }
  if (esperaTuToque(c)) return { tono: 'excepcion', texto: 'Espera tu toque' }
  const r = c.respuesta ?? c.tarjeta?.respuesta
  return { tono: 'decidida', texto: r === 'si' ? 'Dijiste Sí' : r === 'no' ? 'Dijiste No' : r === 'otro' ? 'Pediste otra cosa' : 'Decidida' }
}

/** Qué porcentaje de las corridas se resolvió sin ti. null sin corridas (sin dato no es 100 %). Pura. */
export function porcentajeSolas(r: { corridas: number; solas: number } | undefined): number | null {
  if (!r || r.corridas === 0) return null
  return Math.round((r.solas / r.corridas) * 100)
}

/** Las últimas N corridas de un loop, de la más vieja a la más nueva (los puntos de su tarjeta). Pura. */
export function ultimasDe(corridas: CorridaVista[], rutina: string, n = 10): CorridaVista[] {
  return corridas.filter(c => c.rutina === rutina).sort((a, b) => a.corrida - b.corrida || a.id - b.id).slice(-n)
}

/** La pestaña con que abre: sin loops, las plantillas; con algo esperando tu toque, Revisar; si no, tus loops. Pura. */
export function pestanaInicial(v: VistaLoops): 'tus' | 'revisar' | 'plantillas' {
  const agregados = (v.plantillas ?? []).filter(p => p.agregado).length
  if (!agregados) return 'plantillas'
  return (v.resumen?.enBandeja ?? 0) > 0 ? 'revisar' : 'tus'
}

/** El último resultado guardado de un loop, en una línea («En orden: …», «Subió a tu bandeja: …», «Error: …»). Pura. */
export function ultimaLinea(resultado: string | null): { tono: 'ok' | 'excepcion' | 'fallo' | 'sin-dato'; texto: string } | null {
  const t = resultado?.replace(/\s+/g, ' ').trim()
  if (!t) return null
  // El tono sale del texto crudo; lo que se muestra se corta en fin de frase con «…» (resumen de Rutinas), nunca a media palabra.
  const corto = (x: string) => resumen(x, 220) ?? x
  if (/^en orden:/i.test(t)) return { tono: 'ok', texto: corto(t) }
  if (/^subió a tu bandeja:/i.test(t)) return { tono: 'excepcion', texto: corto(t) }
  if (/^error:/i.test(t)) return { tono: 'fallo', texto: `Falló: ${corto(t.replace(/^error:\s*/i, ''))}` }
  return { tono: 'sin-dato', texto: corto(t) }
}

/** El cuerpo que llega del navegador para agregar: solo el id de la plantilla. Pura. */
export function cuerpoAgregar(j: unknown): { plantilla: string } | { error: string } {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>
  return typeof o.plantilla === 'string' && /^[a-z0-9-]{1,60}$/.test(o.plantilla) ? { plantilla: o.plantilla } : { error: 'Falta qué plantilla agregar.' }
}

/** Los ids de rutina que son loops (para no repetirlos en «Tus rutinas» cuando la pestaña de loops está a la vista). */
export const esRutinaLoop = (id: string) => id.startsWith('loop-')
