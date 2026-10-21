'use client'
import { useCallback, useEffect, useState } from 'react'
import { Archive, ArrowLeft, MessageSquare, Plus } from 'lucide-react'
import type { ChatSession } from '../hooks/useChatHistory'
import { useAccountStore, CHAT_TABS } from '../stores/account-store'
import { useChatPrefsStore } from '../stores/chat-prefs-store'
import { ChatAccountTabs } from './ChatAccountTabs'
import { SessionItem } from './SessionItem'
import { EVENTO_CAMBIO_SESION } from '../lib/cambios-sesion'
import { pedirArchivadas } from '../lib/acciones-conversacion'
import { Interruptor } from '@/features/configuracion/components/Interruptor'

interface ChatSessionsProps {
  sessions: ChatSession[]
  loading: boolean
  /** La última lectura falló (base, daemon o red): se dice en vez de «Sin historial». */
  error?: string | null
  activeId: string | null
  /** Vista Crons (sesiones de fondo) en lugar de las conversaciones. La cuenta se cambia en el composer. */
  crons: boolean
  onCrons: (v: boolean) => void
  onSelect: (session: ChatSession) => void
  onNew: () => void
}

export function ChatSessions({
  sessions,
  loading,
  error = null,
  activeId,
  crons,
  onCrons,
  onSelect,
  onNew,
}: ChatSessionsProps) {
  // La pestaña Crons es opt-in (6 sep 2026): con 5 espacios el segmented se
  // desborda y Crons es ruido salvo cuando estás depurando un cron. Se prende
  // aquí mismo, al pie de la lista (2 oct 2026: antes vivía en Configuración). Ver chat-prefs-store.
  const cronsTabEnabled = useChatPrefsStore((s) => s.cronsTabEnabled)
  const setCronsTabEnabled = useChatPrefsStore((s) => s.setCronsTabEnabled)
  const cuenta = useAccountStore((s) => s.account)
  const tab = crons ? 'crons' : cuenta
  const tabs = CHAT_TABS.filter((t) => t.id === 'crons' || t.id === 'default')

  // Archivadas (1 oct 2026): salen de la lista y de «Recientes»; aquí se ven y se desarchivan. Siguen el espacio
  // de cuenta de la pestaña. Crons son transcripts del daemon, sin archivo.
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [archivadas, setArchivadas] = useState<ChatSession[] | null>(null)
  const archivable = !crons
  const enArchivadas = verArchivadas && archivable
  const cargarArchivadas = useCallback(async () => { setArchivadas(await pedirArchivadas(tab)) }, [tab])
  useEffect(() => {
    if (!enArchivadas) return
    setArchivadas(null)
    void cargarArchivadas()
    // Desarchivar o eliminar desde su menú cambia esta lista: se pide de nuevo.
    const alCambiar = () => { void cargarArchivadas() }
    window.addEventListener(EVENTO_CAMBIO_SESION, alCambiar)
    return () => window.removeEventListener(EVENTO_CAMBIO_SESION, alCambiar)
  }, [enArchivadas, cargarArchivadas])
  const lista = enArchivadas ? archivadas : sessions
  const cargando = enArchivadas ? archivadas === null : loading

  return (
    <div className="flex flex-col h-full border-r border-border-subtle">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b border-border-subtle">
        <span className="text-[10px] uppercase tracking-widest text-muted/80 font-semibold">
          {enArchivadas ? 'Archivadas' : crons ? 'Crons' : 'Todas las conversaciones'}
        </span>
        <button
          onClick={onNew}
          title="Nueva conversación"
          className="icon-btn size-7"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Con la pestaña Crons encendida, alterna entre las conversaciones y los crons. La cuenta ya no se
          elige aquí (4 oct 2026): vive en la píldora del modelo, en el composer. */}
      {cronsTabEnabled && (
        <div className="shrink-0 px-2.5 py-2 border-b border-border-subtle">
          <ChatAccountTabs
            options={[{ id: 'default', label: 'Conversaciones', sublabel: 'Las conversaciones de la cuenta activa' }, tabs[1]]}
            active={crons ? 'crons' : 'default'}
            onSelect={(t) => onCrons(t === 'crons')}
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
        {cargando ? (
          <div className="space-y-1.5 px-2 py-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-card/60 animate-pulse" />
            ))}
          </div>
        ) : !lista || lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-3 py-8 text-center">
            {enArchivadas ? <Archive size={20} className="text-muted/40" /> : <MessageSquare size={20} className="text-muted/40" />}
            <p className="text-[11px] text-muted/70">{!enArchivadas && error ? `No pude cargar tus conversaciones: ${error}. Reintentando solo…` : enArchivadas ? 'Sin conversaciones archivadas' : 'Sin historial'}</p>
          </div>
        ) : (
          lista.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={activeId === session.id}
              onSelect={() => onSelect(session)}
              onAbrir={onSelect}
            />
          ))
        )}
      </div>

      {archivable && (
        <div className="shrink-0 border-t border-border-subtle px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setVerArchivadas((v) => !v)}
            aria-pressed={enArchivadas}
            className="nav-item w-full min-h-11 text-xs md:min-h-8"
          >
            {enArchivadas ? <ArrowLeft className="size-3.5 shrink-0" aria-hidden /> : <Archive className="size-3.5 shrink-0" aria-hidden />}
            <span>{enArchivadas ? 'Volver a las conversaciones' : 'Archivadas'}</span>
          </button>
        </div>
      )}

      {/* Pestaña Crons (2 oct 2026): el interruptor vive donde se usa. Por aparato (localStorage). */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-t border-border-subtle pl-3.5 pr-1.5">
        <span className="text-xs text-muted" title="Las sesiones que abren los cron jobs y procesos de fondo">Pestaña Crons</span>
        <Interruptor activo={cronsTabEnabled} onCambio={setCronsTabEnabled} etiqueta="Mostrar la pestaña Crons en las conversaciones" />
      </div>
    </div>
  )
}
