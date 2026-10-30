'use client'
import { useState } from 'react'
import { Archive, Clock, Pin, Star } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ChatSession } from '../hooks/useChatHistory'
import { deriveSessionState } from '../lib/session-status'
import { textMessageTitle } from '../lib/text-attachments'
import { esProtegida } from '../lib/atajos-conversacion'
import { renombrar } from '../lib/acciones-conversacion'
import { EditorTitulo } from './EditorTitulo'
import { IndicadorConversacion } from './IndicadorConversacion'
import { MenuConversacion, useMenuConversacion } from './MenuConversacion'

// Semáforo del sidebar (modelo de Daniel, 1 oct 2026): ver IndicadorConversacion. Las favoritas (`is_starred`,
// no todas las fijadas) llevan una estrella dorada en lugar del punto.

// ─── Shared session list item ──────────────────────────────────────────────────
//
// Fila de la lista «Ver todas» (ChatSessions). Título + línea de meta (icono + tiempo relativo) y el menú «⋯»
// COMPARTIDO con «Recientes» (MenuConversacion): fijar, marcar (no) leído, cambiar nombre, bifurcar, archivar y
// eliminar con sus atajos. Cambiar nombre es en el lugar del título (Enter guarda, Escape cancela).
//
// El hilo «Automatizaciones» es fijo: solo se puede fijar, y se muestra como «Reportes».

export interface SessionItemProps {
  session: ChatSession
  active: boolean
  onSelect: () => void
  /** Abre OTRA conversación (la copia recién bifurcada). */
  onAbrir: (session: ChatSession) => void
}

export function SessionItem({ session, active, onSelect, onAbrir }: SessionItemProps) {
  const [editando, setEditando] = useState(false)
  const menu = useMenuConversacion(session, { onRenombrar: () => setEditando(true), onAbrir })

  const timeAgo = formatDistanceToNow(new Date(session.updated_at), {
    addSuffix: false,
    locale: es,
  })

  const isProtected = esProtegida(session)
  const dotState = deriveSessionState(session)
  const hasAttention = dotState === 'needs_reply' || dotState === 'unread'

  return (
    <div
      onKeyDown={menu.alTeclaFila}
      className={`group relative mx-1.5 rounded-lg border transition-all
        ${active ? 'nav-item-active border-border-accent' : 'border-transparent hover:bg-card-hover'}
        ${menu.abierto && !active ? 'bg-card-hover' : ''}`}
    >
      {/* Clickable area. El «⋯» ocupa el margen derecho (pr-12 en el teléfono: blanco táctil de 44 px). */}
      <div
        onClick={() => !editando && onSelect()}
        onKeyDown={(e) => { if (!editando && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect() } }}
        role="button"
        tabIndex={editando ? -1 : 0}
        className="flex items-start gap-2 px-2.5 py-2 cursor-pointer pr-12 md:pr-9 focus-visible:outline-2 focus-visible:outline-brand rounded-lg"
      >
        {/* Punto del semáforo */}
        <IndicadorConversacion sesion={session} estado={dotState} clase={session.is_starred && !session.archived_at ? 'mt-[3px]' : 'mt-[5px]'} />
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {editando ? (
            <EditorTitulo
              valor={session.title}
              onConfirmar={(nuevo) => { setEditando(false); void renombrar(session, nuevo) }}
              onCancelar={() => setEditando(false)}
            />
          ) : (
            <p className={`text-xs font-medium leading-snug line-clamp-2 ${
              active
                ? 'text-foreground'
                : hasAttention
                  ? 'text-foreground/90 group-hover:text-foreground'
                  : 'text-muted group-hover:text-foreground/75'
            }`}>
              {isProtected ? 'Reportes' : textMessageTitle(session.title)}
            </p>
          )}

          {!editando && (
            // Conversaciones UNIFICADAS (2026-07-08): chat y CLI son el mismo
            // historial por cuenta — sin distintivo "CLI" ni icono aparte.
            <div className="flex items-center gap-1 text-[10px] text-muted/70">
              {isProtected ? (
                <Clock size={9} className="text-emerald-400/80 shrink-0" />
              ) : session.archived_at ? (
                <Archive size={9} className="text-muted shrink-0" aria-label="Archivada" />
              ) : session.is_starred ? (
                <Star size={9} className="text-muted shrink-0" aria-label="Favorita" />
              ) : session.is_favorite ? (
                <Pin size={9} className="text-muted shrink-0" aria-label="Fijada" />
              ) : (
                <Clock size={9} className="shrink-0" />
              )}
              <span className="truncate">{timeAgo}</span>
            </div>
          )}
        </div>
      </div>

      {/* «⋯»: al pasar el mouse o con el foco en escritorio; siempre en el teléfono. Sin menú en las solo-SDK. */}
      {!editando && (
        <MenuConversacion
          sesion={session}
          control={menu}
          clase={`absolute right-0 top-0 z-10 flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand md:right-1.5 md:top-1.5 md:size-7 md:pointer-fine:opacity-0 md:pointer-fine:group-hover:opacity-100 md:pointer-fine:group-focus-within:opacity-100 ${menu.abierto ? '!opacity-100 bg-foreground/10 !text-foreground' : ''}`}
        />
      )}
    </div>
  )
}
