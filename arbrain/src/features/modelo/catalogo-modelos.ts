import { esEspacioClaude } from '@/shared/lib/espacios-chat'
import { nombreModelo } from '@/shared/lib/uso-modelo'

/**
 * Catálogo del selector de modelos (2 oct 2026). La verdad vive en el daemon (`/modelos/catalogo`): qué modelos
 * existen, si están verificados, su precio por millón (OpenRouter) y cuáles están encendidos. Aquí solo la lógica
 * pura que comparten el selector del chat y Configuración → Modelos. Pruebas: tests/modelo/catalogo-modelos.test.ts.
 */
export interface ModeloCatalogo {
  id: string
  nombre: string
  laboratorio: string
  descripcion: string
  puesto: number | null
  via: 'suscripcion' | 'openrouter'
  /** Espacio del chat donde corre. */
  cuenta: string
  /** Lo que se manda a `/model` (Claude) o el id de OpenRouter; null si no se pudo resolver. */
  modelo: string | null
  openrouter: { id: string; existe: boolean | null; precio: { entrada: number | null; salida: number | null } | null }
  disponible: boolean
  motivo: string | null
  habilitado: boolean
}

export interface Catalogo { consultadoEn: string; errorOpenRouter: string | null; modelos: ModeloCatalogo[] }

/** USD por millón: «$0.10», «$0.015», «$20». */
export function formatoUsd(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v === 0) return '$0'
  if (v >= 10) return `$${Math.round(v)}`
  if (v >= 0.1) return `$${v.toFixed(2)}`
  return `$${Number(v.toPrecision(2))}`
}

/** «$0.10 / $0.50 por millón» (entrada / salida), o null sin precio. */
export function precioPorMillon(m: Pick<ModeloCatalogo, 'openrouter'>): string | null {
  const p = m.openrouter.precio
  if (!p || (p.entrada == null && p.salida == null)) return null
  return `${formatoUsd(p.entrada)} / ${formatoUsd(p.salida)}`
}

/**
 * ¿Elegir este modelo cabe en la conversación abierta? Claude cambia de modelo dentro de una conversación de Claude
 * (Opus ↔ Sonnet ↔ Fable). Un modelo por OpenRouter vive en su espacio: cambiar de motor o de laboratorio abre una
 * conversación nueva (los hilos no se pueden mover entre motores).
 */
export function cabeEnConversacion(m: Pick<ModeloCatalogo, 'via' | 'cuenta'>, espacio: string): boolean {
  return m.via === 'suscripcion' ? esEspacioClaude(espacio) : m.cuenta === espacio
}

/** ¿Es el modelo que corre la conversación abierta? En un espacio por API, el del espacio; en Claude, por nombre. */
export function esModeloActual(m: Pick<ModeloCatalogo, 'via' | 'cuenta' | 'modelo' | 'nombre'>, espacio: string, modeloActual: string | null | undefined): boolean {
  if (m.via === 'openrouter') return m.cuenta === espacio
  if (!esEspacioClaude(espacio) || !modeloActual) return false
  return m.modelo === modeloActual || nombreModelo(modeloActual) === m.nombre
}

/** Lo que muestra el selector: encendidos y disponibles, Claude primero y luego OpenRouter, en orden del catálogo. */
export function modelosDelSelector(c: Catalogo | null): { claude: ModeloCatalogo[]; openrouter: ModeloCatalogo[] } {
  const visibles = (c?.modelos ?? []).filter(m => m.habilitado && m.disponible)
  return { claude: visibles.filter(m => m.via === 'suscripcion'), openrouter: visibles.filter(m => m.via === 'openrouter') }
}

/**
 * Daemon sin el catálogo (404, aún sin reiniciar): el selector sigue sirviendo con la lista vieja de Claude, sin
 * los alias de la cuenta, Haiku ni Fable (fuera del selector por decisión de Daniel).
 */
export function catalogoDeRespaldo(lista: Array<{ value: string; displayName: string; description?: string }>): Catalogo {
  const elegir = (re: RegExp) => lista.find(m => re.test(m.value) && /\[1m\]/.test(m.value)) ?? lista.find(m => re.test(m.value))
  const filas: Array<[RegExp, string, string, string]> = [
    [/opus/i, 'opus-5.5', 'Opus 5.5', 'El más capaz para el trabajo de todos los días'],
    [/sonnet/i, 'sonnet-5.5', 'Sonnet 5.5', 'Rápido para tareas de rutina'],
  ]
  const modelos = filas.flatMap(([re, id, nombre, descripcion]) => {
    const fila = elegir(re)
    return fila ? [{ id, nombre, laboratorio: 'Anthropic', descripcion, puesto: null, via: 'suscripcion' as const, cuenta: 'default', modelo: fila.value,
      openrouter: { id: '', existe: null, precio: null }, disponible: true, motivo: null, habilitado: true }] : []
  })
  return { consultadoEn: '', errorOpenRouter: null, modelos }
}
