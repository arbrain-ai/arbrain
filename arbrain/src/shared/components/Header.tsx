'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bot, MessageSquare, FolderTree, PanelRight, Plus } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { abrirPanelEnTelefono, tocarAgente, useVistaTelefono } from '@/features/cabina/panel/telefono-pestanas'
import { AgentesTrabajando } from '@/features/cabina/panel/AgentesTrabajando'
import { Retrato } from '@/shared/components/Retrato'

/**
 * La cabecera del teléfono (10 oct 2026, Daniel: «simplifiquemos la lógica… debería estar unificado»): UNA sola en todas
 * las pantallas. Izquierda, la burbuja (el cajón de conversaciones); derecha, el interruptor chat ⇄ panel (en el chat
 * abre el panel; fuera del chat, el robot regresa a él). El centro solo dice dónde estás: Levy en el chat, el nombre de la pestaña o la marca en una sección. Las
 * pestañas, su «+» y su «Cerrar» viven en la fila de abajo (FilaPestanas.tsx), que se ve siempre fuera del chat.
 */
export function Header() {
  const { toggleConversationsDrawer, conversationsDrawerOpen, toggleDrawSidebar } = useLayoutStore()
  const pathname = usePathname()
  const router = useRouter()
  const isChatPage = pathname === '/chat'
  const isDrawPage = pathname.startsWith('/draw3')
  const isMobile = useIsMobile()
  const { vista, nombre } = useVistaTelefono()
  const enPestana = vista.tipo === 'pestana'
  const enChat = isChatPage && !enPestana
  // La campana vive al pie de la barra lateral: el botón del cajón lleva un punto si hay avisos sin leer.
  const [sinLeer, setSinLeer] = useState(0)
  useEffect(() => {
    const onSinLeer = (e: Event) => setSinLeer(Number((e as CustomEvent<number>).detail) || 0)
    window.addEventListener('avisos:sin-leer', onSinLeer)
    return () => window.removeEventListener('avisos:sin-leer', onSinLeer)
  }, [])

  return (
    <header className="titanium-header h-14 border-b border-border-subtle flex items-center justify-between px-4 relative z-10">
      <span className="specular-rim" />

      {/* Izquierda (4 oct 2026, pedido del dueño): un solo cajón, el de conversaciones (Nuevo chat, Rutinas, Fijadas,
          Recientes y, al pie, Manual, avisos, ajustes y tema). Las secciones viven en el «+» del panel derecho.
          El punto de avisos sin leer va aquí, donde vive la campana. */}
      <div className="flex min-w-9 items-center gap-2">
        {/* 6 oct 2026 (el dueño): los botones no cambian de lugar entre chat y panel; a la izquierda siempre el chat. */}
        <>
        <button
          onClick={toggleConversationsDrawer}
          className="icon-btn relative size-9"
          title="Conversaciones"
          aria-label={sinLeer ? `Conversaciones, ${sinLeer} avisos sin leer` : 'Conversaciones'}
          aria-expanded={conversationsDrawerOpen}
        >
          <MessageSquare size={18} />
          {sinLeer > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-surface" aria-hidden />}
        </button>

        {isDrawPage && isMobile && (
          <button
            onClick={toggleDrawSidebar}
            className="icon-btn size-9"
            title="Páginas y carpetas"
          >
            <FolderTree size={18} />
          </button>
        )}
        </>
      </div>

      {/* Centro: en el chat, Levy abre a Levy en persona (Live); fuera, la marca. */}
      <div className="flex min-w-0 items-center gap-2">
        {enPestana ? (
          <h1 className="truncate text-sm font-semibold leading-none text-foreground" data-titulo-pestana>{nombre}</h1>
        ) : enChat ? (<>
          <button
            onClick={() => window.dispatchEvent(new Event('openclaw:go-live'))}
            // Intención de abrir Live (5 oct 2026): el avatar 3D (29-35 MB) ya no se baja al abrir el chat; empieza
            // a bajar cuando el puntero se acerca o se toca este botón (chat/page.tsx escucha el evento).
            onPointerEnter={() => window.dispatchEvent(new Event('openclaw:prepare-live'))}
            onFocus={() => window.dispatchEvent(new Event('openclaw:prepare-live'))}
            onTouchStart={() => window.dispatchEvent(new Event('openclaw:prepare-live'))}
            className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 select-none focus:outline-none"
            title="Hablar con Levy en persona"
            aria-label="Hablar con Levy en persona"
          >
            <span className="relative shrink-0">
              <Retrato agente="levy" size={28} prioridad className="w-7 h-7 rounded-full object-cover border border-primary/40" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-background" />
            </span>
            <span className="text-sm font-semibold text-foreground leading-none">Levy</span>
          </button>
          {/* Agentes de esta conversación y lo que te espera (5 oct 2026): la misma píldora del escritorio, compacta. */}
          <AgentesTrabajando compacta />
        </>) : (
          <BrandBadge />
        )}
      </div>

      {/* Derecha (10 oct 2026, noche): interruptor chat ⇄ panel. En el chat, el panel; fuera del chat, el robot que regresa a él. */}
      <div className="flex min-w-9 items-center justify-end gap-1">
        {/* El «+» de nueva conversación (10 oct 2026, noche: El dueño lo extrañó), solo en el chat, a la izquierda del panel. */}
        {enChat && (
          <button onClick={() => window.dispatchEvent(new CustomEvent('openclaw:new-chat'))} title="Nueva conversación"
            aria-label="Nueva conversación" className="icon-btn size-9" data-boton-nueva>
            <Plus size={18} />
          </button>
        )}
        {enChat ? (
          <button onClick={abrirPanelEnTelefono} title="Abrir el panel" aria-label="Abrir el panel" className="icon-btn size-9" data-boton-panel>
            <PanelRight size={18} />
          </button>
        ) : (
          <button onClick={() => tocarAgente(pathname, url => router.push(url))} title="Volver a Levy" aria-label="Volver a Levy"
            className="icon-btn size-9" data-boton-agente>
            <Bot size={18} />
          </button>
        )}
      </div>
    </header>
  )
}

function BrandBadge() {
  return (
    <div className="relative flex items-center gap-2 px-3 py-1 rounded-full titanium-panel overflow-hidden">
      <span className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      <span className="font-sans text-[11px] font-semibold tracking-[0.18em] uppercase text-foreground">
        Arbrain
      </span>
      <span className="block w-1 h-1 rounded-full bg-gold shadow-glow-gold" />
    </div>
  )
}
