/**
 * La meta (`/goal`) en el chat (27 oct 2026, Goal UX). El daemon separa la respuesta principal del turno de las vueltas
 * que el evaluador de Claude Code va pidiendo (server › chat-runtime/meta-claude.ts) y manda eventos `goal`. Aquí:
 *   · el resumen del bloque plegado bajo la respuesta («Meta: 6 revisiones · sin cumplir · espera a Daniel»);
 *   · el estado del chip sobre el compositor, derivado del hilo (la última meta de un turno y los comandos `/goal`).
 * Puro: sin React ni red.
 */
import { NOMBRE_DUENO } from '@/config'

export type EstadoMeta = 'en_curso' | 'esperando' | 'pausada' | 'cumplida' | 'quitada'

export interface VueltaMeta { motivo: string; texto: string; herramientas: number }

/** Lo que el daemon manda en el evento `goal` y guarda en el snapshot del turno (`runtimeSnapshot.goal`). */
export interface MetaTurno {
  condicion: string
  revisiones: number
  estado: EstadoMeta
  vueltas: VueltaMeta[]
  frenada?: 'repeticion' | 'pausa'
}

const nombre = () => { try { return NOMBRE_DUENO() } catch { return 'ti' } }

/** Estado en palabras para el chip. */
export function estadoEnPalabras(estado: EstadoMeta): string {
  switch (estado) {
    case 'en_curso': return 'en curso'
    case 'esperando': return `esperando a ${nombre()}`
    case 'pausada': return 'en pausa'
    case 'cumplida': return 'cumplida'
    case 'quitada': return 'quitada'
  }
}

/** «Meta: 6 revisiones · sin cumplir · espera a Daniel». El renglón del bloque plegado bajo la respuesta. */
export function resumenMeta(meta: MetaTurno, enVivo = false): string {
  const n = meta.revisiones
  const partes = [`Meta: ${n} ${n === 1 ? 'revisión' : 'revisiones'}`]
  if (meta.estado === 'cumplida') partes.push('cumplida')
  else if (enVivo && meta.estado === 'en_curso') partes.push('revisando')
  else partes.push('sin cumplir')
  if (meta.estado === 'esperando') partes.push(`espera a ${nombre()}`)
  else if (meta.estado === 'pausada') partes.push('en pausa')
  return partes.join(' · ')
}

/** Quita el recorte del CLI y deja la condición en una línea legible. */
export function condicionCorta(condicion: string, max = 90): string {
  const una = condicion.replace(/\s+/g, ' ').trim()
  return una.length > max ? `${una.slice(0, max - 1).trimEnd()}…` : una
}

type MensajeHilo = { role: 'user' | 'assistant'; content: string; meta?: MetaTurno | null; streaming?: boolean }

/** Lo que el chip necesita: la meta vigente del hilo, o null si no hay (nunca hubo, se quitó o se cumplió hace rato). */
export interface MetaVigente { condicion: string; estado: EstadoMeta; enVivo: boolean }

/**
 * La meta vigente, leyendo el hilo de atrás hacia adelante: el primer marcador manda. Marcadores: un turno con `meta`
 * (lo que reportó el daemon), o un mensaje de Daniel `/goal …` (fijar, pausar, reanudar, quitar). `pausada` del
 * daemon (por el chip) llega por `override`, porque no siempre hay turno que lo cuente.
 */
export function metaVigente(mensajes: readonly MensajeHilo[], override?: { estado: EstadoMeta; condicion?: string } | null): MetaVigente | null {
  let base: MetaVigente | null = null
  for (let i = mensajes.length - 1; i >= 0 && !base; i--) {
    const m = mensajes[i]
    if (m.role === 'assistant' && m.meta) {
      if (m.meta.estado === 'quitada') return null
      base = { condicion: m.meta.condicion, estado: m.streaming && m.meta.estado === 'en_curso' ? 'en_curso' : m.meta.estado, enVivo: !!m.streaming }
      continue
    }
    if (m.role !== 'user') continue
    const cmd = /^\/goal(?:\s+([\s\S]*))?$/i.exec(m.content.trim())
    if (!cmd) continue
    const resto = (cmd[1] ?? '').trim()
    if (!resto || /^(status|estado|help|ayuda|\?)$/i.test(resto)) continue
    if (/^(clear|cancel|cancelar|borrar|quitar)$/i.test(resto)) return null
    if (/^(pause|pausa|pausar)$/i.test(resto)) { base = { condicion: '', estado: 'pausada', enVivo: false }; continue }
    if (/^(resume|reanudar|continuar)$/i.test(resto)) { base = { condicion: '', estado: 'en_curso', enVivo: false }; continue }
    base = { condicion: resto, estado: 'en_curso', enVivo: false }
  }
  // Pausar/reanudar sin condición: se completa con la meta anterior del hilo.
  if (base && !base.condicion) {
    const previa = [...mensajes].reverse().find(m => m.role === 'assistant' && m.meta?.condicion)?.meta?.condicion
      ?? [...mensajes].reverse().map(m => m.role === 'user' ? /^\/goal\s+(?!pause|pausa|pausar|resume|reanudar|continuar|clear|status)([\s\S]+)$/i.exec(m.content.trim())?.[1] : undefined).find(Boolean)
    base = { ...base, condicion: previa ?? '' }
  }
  if (override) {
    if (override.estado === 'quitada') return null
    base = { condicion: override.condicion || base?.condicion || '', estado: override.estado, enVivo: base?.enVivo ?? false }
  }
  if (!base || !base.condicion) return null
  return base
}
