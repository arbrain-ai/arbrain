'use client'
import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Bot, CalendarDays, Wallet, User, TriangleAlert, Sparkles, X, Check } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { usePushSubscription } from '../hooks/usePushSubscription'
import type { AvisoKind } from '@/features/avisos/policy'
import { zoomUI } from '@/shared/lib/zoom-ui'

// La campana (25 sep 2026). Lee `avisos` por /api/avisos: solo lo que le importa
// al dueño (un agente terminó o necesita permiso, agenda, dinero, una persona, el
// servidor se detuvo). La telemetría va a la bitácora y nunca aparece aquí. La
// tabla `notifications` (herencia OpenClaw) nunca tuvo emisor y ya no se lee.

interface Aviso { id: string; created_at: string; kind: AvisoKind; title: string; body: string | null; url: string | null; read_at: string | null }

interface NotificationBellProps {
  compact?: boolean
  placement?: 'top' | 'bottom'
  // ghost = botón sutil sin marco/placa titanium (acciones secundarias del sidebar)
  ghost?: boolean
}

const PANEL_W = 360 // layout px
const GAP = 8 // visual px entre botón y panel

const KIND: Record<AvisoKind, { icon: typeof Bell; label: string; tone: string }> = {
  agente: { icon: Bot, label: 'Agente', tone: 'text-primary bg-primary/12' },
  agenda: { icon: CalendarDays, label: 'Agenda', tone: 'text-gold bg-gold/12' },
  dinero: { icon: Wallet, label: 'Dinero', tone: 'text-success bg-success/12' },
  persona: { icon: User, label: 'Persona', tone: 'text-sky-400 bg-sky-400/12' },
  alerta: { icon: TriangleAlert, label: 'Servidor', tone: 'text-error bg-error/12' },
  otro: { icon: Sparkles, label: 'Aviso', tone: 'text-muted bg-card-hover' },
}

function ago(iso: string) {
  const text = formatDistanceToNowStrict(new Date(iso), { locale: es })
  return `hace ${text.replace(' segundos', ' s').replace(' minutos', ' min').replace(' minuto', ' min').replace(' horas', ' h').replace(' hora', ' h')}`
}

export function NotificationBell({ compact = true, placement = 'bottom', ghost = false }: NotificationBellProps) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [unread, setUnread] = useState(0)
  const [failed, setFailed] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const isMobile = useIsMobile()
  const router = useRouter()
  // Posición del panel (portaleado a <body> para escapar el overflow del sidebar).
  const [coords, setCoords] = useState<{ left: number; top: number; up: boolean; maxHeight: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { status: pushStatus, loading: pushLoading, subscribe, unsubscribe } = usePushSubscription()

  const fetchAvisos = useCallback(async () => {
    try {
      const res = await fetch('/api/avisos', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as { avisos: Aviso[]; unread: number }
      setAvisos(data.avisos)
      setUnread(data.unread)
      setFailed(false)
    } catch { setFailed(true) }
  }, [])

  // Sin canal realtime: se lee al abrir la app, al volver a ella, al abrir el panel
  // y cada minuto con la app visible. Un push recibido también pide releer (sw.js).
  useEffect(() => {
    void fetchAvisos()
    const poll = () => { if (!document.hidden) void fetchAvisos() }
    const timer = setInterval(poll, 60_000)
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'aviso-recibido') void fetchAvisos() }
    window.addEventListener('focus', poll)
    // La Cabina avisa cuando Levy atendió avisos o marcó leídos desde el chat.
    window.addEventListener('cabina:refrescar', poll)
    document.addEventListener('visibilitychange', poll)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', poll)
      document.removeEventListener('visibilitychange', poll)
      window.removeEventListener('cabina:refrescar', poll)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [fetchAvisos])
  useEffect(() => { if (isOpen) void fetchAvisos() }, [isOpen, fetchAvisos])
  // La campana vive en la barra lateral: el botón del menú del teléfono muestra un punto
  // con lo que se lee aquí (una sola lectura, nunca dos canales).
  useEffect(() => { window.dispatchEvent(new CustomEvent('avisos:sin-leer', { detail: unread })) }, [unread])

  // Posiciona el panel anclado al botón (solo escritorio; en el teléfono es una hoja
  // inferior). Gotcha (mismo que el DragOverlay del board): el UI tiene CSS `zoom` en
  // <html> (--ui-zoom, Cmd +/-); en WebKit getBoundingClientRect devuelve coords de
  // PANTALLA pero un `left`/`top` sobre un fixed hijo del <html> zoomeado se
  // re-interpreta en coords zoomeadas. Se compensa dividiendo entre --ui-zoom.
  const recomputePosition = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const z = zoomUI()
    const r = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    const panelVisualW = Math.min(PANEL_W * z, vw - 2 * margin)
    const visualLeft = Math.max(margin, Math.min(r.left, vw - panelVisualW - margin))
    const up = placement === 'top'
    const visualTop = up ? r.top - GAP : r.bottom + GAP
    const availVisualH = (up ? visualTop - margin : vh - visualTop - margin)
    setCoords({ left: visualLeft / z, top: visualTop / z, up, maxHeight: Math.max(96, availVisualH) / z })
  }, [placement])

  useLayoutEffect(() => {
    if (!isOpen || isMobile) return
    recomputePosition()
    const t1 = setTimeout(recomputePosition, 180)
    const t2 = setTimeout(recomputePosition, 340)
    const onChange = () => recomputePosition()
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [isOpen, isMobile, recomputePosition])

  // Cerrar con click afuera (el panel vive en un portal: se chequean botón y panel) o Escape.
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setIsOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString()
    setAvisos((prev) => prev.map((a) => (!ids || ids.includes(a.id)) && !a.read_at ? { ...a, read_at: now } : a))
    setUnread((n) => ids ? Math.max(0, n - avisos.filter((a) => ids.includes(a.id) && !a.read_at).length) : 0)
    await fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) }).catch(() => undefined)
  }

  const openAviso = (a: Aviso) => {
    if (!a.read_at) void markRead([a.id])
    setIsOpen(false)
    if (a.url && a.url.startsWith('/')) router.push(a.url)
  }

  const handlePushToggle = () => {
    if (pushStatus === 'subscribed') unsubscribe()
    else if (pushStatus === 'unsubscribed') subscribe()
  }

  const nuevos = avisos.filter((a) => !a.read_at)
  const antes = avisos.filter((a) => a.read_at)

  const row = (a: Aviso) => {
    const k = KIND[a.kind] ?? KIND.otro
    const Icon = k.icon
    return (
      <button key={a.id} type="button" onClick={() => openAviso(a)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-card-hover active:bg-card-hover">
        <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${k.tone}`} aria-hidden="true"><Icon size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-[14px] md:text-[13px] ${a.read_at ? 'font-medium text-foreground/80' : 'font-semibold text-foreground'}`}>{a.title}</span>
            <span className="shrink-0 text-[11px] text-muted">{ago(a.created_at)}</span>
          </span>
          {a.body && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted md:text-[12px]">{a.body}</span>}
          <span className="sr-only">{k.label}{a.read_at ? '' : ', sin leer'}</span>
        </span>
        {!a.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
      </button>
    )
  }

  const content = (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground md:text-sm">Avisos</h3>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button onClick={() => void markRead()} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] text-primary md:text-xs">
              <Check size={14} />Marcar leídos
            </button>
          )}
          {pushStatus !== 'unsupported' && pushStatus !== 'loading' && (
            <button
              onClick={handlePushToggle}
              disabled={pushLoading || pushStatus === 'denied'}
              title={pushStatus === 'denied' ? 'Bloqueado: permítelo en los ajustes del navegador' : pushStatus === 'subscribed' ? 'Silenciar este dispositivo' : 'Recibir avisos en este dispositivo'}
              aria-label={pushStatus === 'subscribed' ? 'Silenciar avisos en este dispositivo' : 'Recibir avisos en este dispositivo'}
              className={`grid size-9 place-items-center rounded-lg transition-colors disabled:opacity-40 ${pushStatus === 'subscribed' ? 'text-primary' : 'text-muted'}`}
            >
              {pushLoading ? <span className="size-3 animate-spin rounded-full border border-border-accent border-t-foreground/70" />
                : pushStatus === 'subscribed' ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
          )}
          {isMobile && (
            <button onClick={() => setIsOpen(false)} className="grid size-9 place-items-center rounded-lg text-muted" aria-label="Cerrar avisos"><X size={18} /></button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {failed && !avisos.length ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">No se pudieron leer los avisos. Se reintenta solo.</p>
        ) : avisos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><Bell size={20} /></span>
            <p className="text-[15px] font-semibold text-foreground">Todo en calma</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-muted">Aquí solo llega lo que te importa: un agente que terminó o necesita permiso, tu agenda, tu dinero, una persona o tu servidor detenido.</p>
          </div>
        ) : (
          <>
            {nuevos.length > 0 && <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Nuevos</p>}
            {nuevos.map(row)}
            {antes.length > 0 && <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Antes</p>}
            {antes.map(row)}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border-subtle px-4 py-3 text-[12px] leading-snug text-muted md:text-[11px]">
        Lo que corre solo y su último resultado vive en{' '}
        <Link href="/rutinas" onClick={() => setIsOpen(false)} className="font-semibold text-primary">Rutinas</Link>. Los detalles técnicos los revisa Levy.
      </div>
    </>
  )

  const panel = isOpen && typeof document !== 'undefined'
    ? isMobile
      ? createPortal(
          <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/45" onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}>
            <div ref={panelRef} role="dialog" aria-label="Avisos"
              className="avisos-sheet flex max-h-[82dvh] flex-col overflow-hidden rounded-t-[22px] border-t border-border-subtle bg-surface"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/15" aria-hidden="true" />
              {content}
            </div>
          </div>,
          document.body,
        )
      : coords && createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Avisos"
            className="titanium-panel flex flex-col overflow-hidden rounded-xl"
            // position/boxShadow van INLINE a propósito: `.titanium-panel` (globals.css)
            // define position:relative y box-shadow en una regla SIN @layer, que por las
            // reglas de CSS Cascade Layers le gana a las utilidades de Tailwind.
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              width: `min(${PANEL_W / 16}rem, calc(100vw - 1rem))`,
              maxHeight: Math.min(coords.maxHeight, 560),
              transform: coords.up ? 'translateY(-100%)' : undefined,
              boxShadow: 'var(--depth-hover)',
              zIndex: 70,
            }}
          >
            {content}
          </div>,
          document.body,
        )
    : null

  return (
    <div className={compact ? 'relative' : 'relative w-full'}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={compact ? `${ghost ? 'icon-btn-ghost' : 'icon-btn'} size-10 relative` : 'nav-item w-full text-sm md:text-xs'}
        title="Avisos"
        aria-label={unread ? `Avisos, ${unread} sin leer` : 'Avisos'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="size-[18px] md:size-[15px]" />
        {compact && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        {!compact && (
          <>
            <span>Avisos</span>
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </>
        )}
      </button>

      {panel}
    </div>
  )
}
