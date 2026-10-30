import { Star } from 'lucide-react'
import type { ChatSession } from '../hooks/useChatHistory'
import type { SessionDotState } from '../lib/session-status'

// Indicador a la izquierda de cada conversación (4 oct 2026): el punto del semáforo, o, si es FAVORITA
// (`is_starred`, no basta con fijada: Daniel, 4 oct «las favoritas son las que además de pinneadas yo le di en
// favorita»), una ESTRELLA que lo reemplaza. La estrella NO es dorada fija (Daniel, 4 oct 18:59: no distinguía
// si trabajaba, esperaba o terminó): toma el color del MISMO estado que el punto. Una sola tabla (`VISUAL`)
// alimenta punto y estrella, así que nunca divergen; el estado sale de deriveSessionState.
//   working      ámbar que late · needs_reply azul · unread morado · read contorno gris suave (sin relleno)
export const ORO = '#ff9101'

interface VisualEstado {
  titulo: string
  punto: string
  /** Color de la estrella (relleno y trazo); `null` = solo contorno gris, sin relleno (en reposo). */
  estrella: string | null
  halo: string
}

const VISUAL: Record<SessionDotState, VisualEstado> = {
  working: {
    titulo: 'Levy está trabajando',
    punto: 'bg-yellow-400 animate-pulse shadow-[0_0_6px_rgba(250,204,21,0.8)]',
    estrella: '#fbbf24',
    halo: 'animate-pulse drop-shadow-[0_0_5px_rgba(251,191,36,0.95)]',
  },
  needs_reply: {
    titulo: 'Levy te preguntó algo: te toca a ti',
    punto: 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.85)]',
    estrella: '#3b82f6',
    halo: 'drop-shadow-[0_0_5px_rgba(59,130,246,0.85)]',
  },
  unread: {
    titulo: 'Terminó, aún sin ver',
    punto: 'bg-brand shadow-[0_0_6px_rgba(140,39,241,0.7)]',
    estrella: '#8c27f1',
    halo: 'drop-shadow-[0_0_5px_rgba(140,39,241,0.8)]',
  },
  read: {
    titulo: 'Ya la viste',
    punto: 'bg-muted/25',
    estrella: null,
    halo: '',
  },
}

export const DOT_STYLE: Record<SessionDotState, string> = {
  working: VISUAL.working.punto,
  needs_reply: VISUAL.needs_reply.punto,
  unread: VISUAL.unread.punto,
  read: VISUAL.read.punto,
}
export const DOT_TITLE: Record<SessionDotState, string> = {
  working: VISUAL.working.titulo,
  needs_reply: VISUAL.needs_reply.titulo,
  unread: VISUAL.unread.titulo,
  read: VISUAL.read.titulo,
}

/** Título de la estrella: leyenda completa (es favorita + qué estado tiene). */
export const tituloFavorita = (estado: SessionDotState) => `Favorita · ${VISUAL[estado].titulo}`

interface Props {
  sesion: Pick<ChatSession, 'is_starred' | 'archived_at'>
  estado: SessionDotState
  /** Clases extra del punto (p. ej. la separación vertical en «Ver todas»). */
  clase?: string
}

export function IndicadorConversacion({ sesion, estado, clase = '' }: Props) {
  const v = VISUAL[estado]
  if (sesion.is_starred && !sesion.archived_at) {
    return (
      <Star
        role="img"
        aria-label={tituloFavorita(estado)}
        data-favorita="true"
        data-estado={estado}
        size={11}
        strokeWidth={1.5}
        fill={v.estrella ?? 'none'}
        color={v.estrella ?? 'currentColor'}
        className={`shrink-0 ${v.estrella ? '' : 'text-muted/50'} ${v.halo} ${clase}`}
      >
        <title>{tituloFavorita(estado)}</title>
      </Star>
    )
  }
  return <span className={`size-1.5 shrink-0 rounded-full ${v.punto} ${clase}`} title={v.titulo} aria-hidden />
}
