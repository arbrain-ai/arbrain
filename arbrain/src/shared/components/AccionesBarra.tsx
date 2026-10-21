'use client'
import { BookOpen, Settings } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute } from '@/lib/permissions'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { ThemeToggle } from '@/shared/components/ThemeToggle'
import { esEdicionCliente } from '@/lib/edicion'

/**
 * Pie de la barra lateral única. Rediseño del 4 oct 2026 (noche): a la izquierda el perfil, que lleva a ajustes
 * (el engrane suelto se fue ahí); a la derecha Manual, avisos con su contador y tema. Igual en escritorio y en el
 * cajón del teléfono; en el teléfono cada blanco mide 44 px.
 */
export function AccionesBarra({ onNavegar, tactil = false }: { onNavegar?: () => void; tactil?: boolean }) {
  const { role, profile, user } = useAuth()
  const libraryOpen = useLayoutStore((s) => s.libraryOpen)
  const nombre = profile?.full_name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || ''
  const inicial = (nombre || 'D').charAt(0).toUpperCase()
  const enAjustes = useAjustes((s) => s.abierto)
  const perfil = (
    <>
      {profile?.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={profile.avatar_url} alt="" className={`shrink-0 rounded-full object-cover ring-1 ring-border-subtle ${tactil ? 'size-8' : 'size-6'}`} />
        : <span className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand/80 to-brand-ink/90 font-semibold text-white ${tactil ? 'size-8 text-[13px]' : 'size-6 text-[11px]'}`} aria-hidden>{inicial}</span>}
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className={`block truncate font-medium text-foreground ${tactil ? 'text-[14px]' : 'text-[12.5px]'}`}>{nombre || 'Ajustes'}</span>
        {nombre && <span className={`block truncate text-muted ${tactil ? 'text-[12px]' : 'text-[11px]'}`}>Ajustes</span>}
      </span>
      {!nombre && <Settings className="size-4 shrink-0 text-muted" aria-hidden />}
    </>
  )
  const clasePerfil = `flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-brand ${tactil ? 'min-h-12' : 'min-h-10'} ${enAjustes ? 'bg-foreground/[0.06]' : ''}`
  return (
    <div className={`flex items-center gap-0.5 py-1.5 ${tactil ? '[&_.icon-btn-ghost]:size-11' : '[&_.icon-btn-ghost]:size-8'}`}>
      {canAccessRoute('/settings', role)
        ? <button type="button" onClick={() => { onNavegar?.(); useAjustes.getState().abrir() }} className={clasePerfil} title="Perfil y ajustes (⌘,)" aria-label="Perfil y ajustes" aria-haspopup="dialog" aria-expanded={enAjustes}>{perfil}</button>
        : <div className={clasePerfil}>{perfil}</div>}
      {/* Edición cliente: sin biblioteca (su contenido describe la instalación del autor). */}
      {!esEdicionCliente() && <button
        onClick={() => { useLayoutStore.getState().openLibrary(); onNavegar?.() }}
        className={`icon-btn-ghost size-9 ${libraryOpen ? 'text-primary' : ''}`}
        title="Manual y biblioteca"
        aria-label="Abrir el manual y la biblioteca"
      >
        <BookOpen className="size-[18px] md:size-[16px]" />
      </button>}
      {/* Campana única (1 oct): lleva el contador de avisos; el botón del cajón en la cabecera del teléfono lleva un punto. */}
      {!esEdicionCliente() && <NotificationBell compact placement="top" ghost />}
      {/* Tema (dark<->light, ⌘⌥T): lo elegido a mano dura hasta el siguiente cambio de tramo y vuelve a «por hora». */}
      <ThemeToggle compact binary ghost />
    </div>
  )
}
