'use client'
import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, X, ChevronDown, ArrowUpRight, Check } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { usePushSubscription } from '../hooks/usePushSubscription'
import type { AccionAviso, AvisoVista } from '@/features/avisos/bandeja'
import { zoomUI } from '@/shared/lib/zoom-ui'
import c from './campana.module.css'

// La campana (25 sep 2026; decisiones, no reportes, 29 oct). Lee /api/avisos ya agrupado (features/avisos/bandeja.ts):
// «Urgente» solo si es riesgo real (y entonces encima de todo: rara vez hay y no se entierra bajo decisiones), «Te toca
// decidir» con su conteo (el número de la campana) y «Para saber» plegado. Cada aviso dice quién/qué en una línea, la decisión en una frase y trae sus botones. «Publicar» y
// «Descartar» son el toque de /decidir (POST /api/avisos/accion): nada se publica sin ese toque. Lo que se resolvió
// solo (decisión tomada, grabación encontrada, alerta repetida) ya no llega. La telemetría vive en la bitácora.

interface Bandeja { decidir: AvisoVista[]; urgente: AvisoVista[]; saber: AvisoVista[]; pendientes: number }
const VACIA: Bandeja = { decidir: [], urgente: [], saber: [], pendientes: 0 }
/** Decisiones a la vista antes de «Ver más»: lo urgente no queda enterrado bajo una fila larga. */
const A_LA_VISTA = 3

interface NotificationBellProps {
  compact?: boolean
  placement?: 'top' | 'bottom'
  // ghost = botón sutil sin marco/placa titanium (acciones secundarias del sidebar)
  ghost?: boolean
}

const PANEL_W = 360 // layout px
const GAP = 8 // visual px entre botón y panel

function ago(iso: string) {
  const text = formatDistanceToNowStrict(new Date(iso), { locale: es })
  return `hace ${text.replace(' segundos', ' s').replace(' minutos', ' min').replace(' minuto', ' min').replace(' horas', ' h').replace(' hora', ' h')}`
}

export function NotificationBell({ compact = true, placement = 'bottom', ghost = false }: NotificationBellProps) {
  const [bandeja, setBandeja] = useState<Bandeja>(VACIA)
  const [failed, setFailed] = useState(false)
  const [cargado, setCargado] = useState(false)
  // Por aviso: el botón en curso, lo que salió mal y lo que ya se tocó (sale de la lista con un respiro).
  const [enCurso, setEnCurso] = useState<Record<string, AccionAviso['tipo']>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [hechos, setHechos] = useState<Record<string, string>>({})
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [verSaber, setVerSaber] = useState(false)
  const [verTodas, setVerTodas] = useState(false)
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
      const data = await res.json() as Bandeja
      setBandeja({ decidir: data.decidir ?? [], urgente: data.urgente ?? [], saber: data.saber ?? [], pendientes: data.pendientes ?? 0 })
      setFailed(false)
    } catch { setFailed(true) }
    finally { setCargado(true) }
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
  const pendientes = Math.max(0, bandeja.decidir.filter(a => !hechos[a.id]).length)
  useEffect(() => { window.dispatchEvent(new CustomEvent('avisos:sin-leer', { detail: pendientes })) }, [pendientes])

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

  // Lo informativo cuenta como visto al abrir la campana (now.md y la píldora del chat leen `read_at`); lo que pide
  // decisión o es urgente sigue hasta su botón o hasta que su causa se resuelva.
  useEffect(() => {
    if (!isOpen) return
    const ids = bandeja.saber.filter(a => !a.read_at).map(a => a.id)
    if (!ids.length) return
    void fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => undefined)
  }, [isOpen, bandeja.saber])

  const quitar = (id: string) => setTimeout(() => {
    setBandeja(b => ({ ...b, decidir: b.decidir.filter(a => a.id !== id), urgente: b.urgente.filter(a => a.id !== id) }))
    setHechos(h => { const n = { ...h }; delete n[id]; return n })
  }, 1100)

  const tocar = async (a: AvisoVista, accion: 'publicar' | 'descartar' | 'duda' | 'visto') => {
    if (enCurso[a.id]) return
    setEnCurso(e => ({ ...e, [a.id]: accion }))
    setErrores(e => { const n = { ...e }; delete n[a.id]; return n })
    try {
      const res = await fetch('/api/avisos/accion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, accion }) })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; motivo?: string; mensaje?: string; error?: string }
      if (data.ok) {
        // El recap se publica al momento; la respuesta de la comunidad sale en la siguiente vuelta de ht-pipeline.
        const publicado = a.source === 'ht-grupales' ? 'Publicado. La cohorte ya lo ve.' : 'Publicado. Sale en la siguiente vuelta.'
        setHechos(h => ({ ...h, [a.id]: accion === 'publicar' ? publicado : accion === 'descartar' ? 'Descartado. No se publica.' : accion === 'duda' ? 'Tu duda sube a revisión. No se publica.' : 'Listo' }))
        quitar(a.id)
      } else if (data.motivo === 'ya-respondida') {
        setHechos(h => ({ ...h, [a.id]: 'Ya estaba respondida' }))
        quitar(a.id)
      } else {
        setErrores(e => ({ ...e, [a.id]: data.mensaje ?? data.error ?? 'No se pudo. Intenta de nuevo.' }))
      }
    } catch {
      setErrores(e => ({ ...e, [a.id]: 'Sin conexión. No se publicó nada.' }))
    } finally {
      setEnCurso(e => { const n = { ...e }; delete n[a.id]; return n })
    }
  }

  const irA = (url: string) => {
    setIsOpen(false)
    if (url.startsWith('/')) router.push(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handlePushToggle = () => {
    if (pushStatus === 'subscribed') unsubscribe()
    else if (pushStatus === 'unsubscribed') subscribe()
  }

  const boton = (a: AvisoVista, x: AccionAviso, principal: boolean) => {
    const ocupado = enCurso[a.id] === x.tipo
    const base = `inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] transition-colors disabled:opacity-40 md:min-h-8 md:text-[12px]`
    const clase = principal
      ? `l-tecla ${base} border border-border bg-card font-semibold text-foreground hover:bg-card-hover`
      : `${base} font-medium text-muted hover:bg-foreground/[0.06] hover:text-foreground`
    if (x.tipo === 'abrir') {
      const externo = !x.url.startsWith('/')
      return (
        <button key={`${x.tipo}-${x.etiqueta}`} type="button" className={clase} onClick={() => irA(x.url)}>
          {x.etiqueta}{externo && <ArrowUpRight size={13} aria-hidden="true" />}
        </button>
      )
    }
    if (x.tipo === 'borrador') {
      const abierto = abiertos.has(a.id)
      return (
        <button key={`${x.tipo}-${x.etiqueta}`} type="button" className={clase} aria-expanded={abierto}
          onClick={(e) => {
            const li = e.currentTarget.closest('li')
            setAbiertos(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n })
            // Lo que se va a publicar se lee completo: la tarjeta abierta entra a la vista sobre el pie.
            if (!abierto) requestAnimationFrame(() => li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
          }}>
          {abierto ? 'Ocultar borrador' : x.etiqueta}
        </button>
      )
    }
    const tipo = x.tipo
    return (
      <button key={`${tipo}-${x.etiqueta}`} type="button" className={clase} disabled={!!enCurso[a.id]} onClick={() => void tocar(a, tipo)}>
        {ocupado && <span className="size-3 animate-spin rounded-full border border-border-accent border-t-foreground/70" aria-hidden="true" />}
        {x.etiqueta}
      </button>
    )
  }

  const tarjeta = (a: AvisoVista, urgente = false) => {
    const hecho = hechos[a.id]
    const principal = a.acciones.find(x => x.tipo === 'publicar') ?? a.acciones.find(x => x.tipo === 'abrir')
    return (
      <li key={a.id} className={`${c.tarjeta} border-b border-border-subtle px-4 py-3 last:border-b-0`} data-saliendo={hecho ? '' : undefined}>
        <div className="flex items-start gap-2.5">
          {urgente && <span className={c.puntoUrgente} aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground md:text-[13px]" title={a.titulo}>{a.titulo}</p>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">{ago(a.created_at)}</span>
            </div>
            {hecho ? (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-foreground md:text-[12px]"><Check size={14} aria-hidden="true" />{hecho}</p>
            ) : (
              <>
                {a.frase && <p className="mt-0.5 text-[13px] leading-snug text-foreground/85 md:text-[12.5px]">{a.frase}</p>}
                {a.cita && !abiertos.has(a.id) && <p className="mt-0.5 truncate text-[12.5px] text-muted md:text-[12px]">«{a.cita}»</p>}
                {abiertos.has(a.id) && (
                  <div className="mt-2 space-y-2 text-[13px] leading-relaxed md:text-[12.5px]">
                    {a.cita && <div><p className="text-[11px] font-medium text-muted">Escribió</p><p className={`${c.borrador} pl-2.5 text-foreground/85`}>{a.cita}</p></div>}
                    {a.borrador && <div><p className="text-[11px] font-medium text-muted">Levy respondería</p><p className={`${c.borrador} pl-2.5 text-foreground`}>{a.borrador}</p></div>}
                    {a.url && !a.acciones.some(x => x.tipo === 'abrir' && x.etiqueta === 'Editar') && <button type="button" onClick={() => irA(a.url!)} className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-foreground">Editar antes de publicar <ArrowUpRight size={12} aria-hidden="true" /></button>}
                  </div>
                )}
                {a.acciones.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {a.acciones.map(x => boton(a, x, x === principal))}
                  </div>
                )}
                {errores[a.id] && <p className="mt-1.5 text-[12px] text-foreground" role="alert">{errores[a.id]}</p>}
              </>
            )}
          </div>
        </div>
      </li>
    )
  }

  const filaSaber = (a: AvisoVista) => {
    const destino = a.acciones.find((x): x is Extract<AccionAviso, { tipo: 'abrir' }> => x.tipo === 'abrir')
    const contenido = (
      <>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/85 md:text-[12.5px]">{a.titulo}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted">{ago(a.created_at)}</span>
        </span>
        {a.frase && <span className="block truncate text-[12.5px] text-muted md:text-[12px]">{a.frase}</span>}
      </>
    )
    return (
      <li key={a.id}>
        {destino
          ? <button type="button" onClick={() => irA(destino.url)} className="block w-full px-4 py-2 text-left transition-colors hover:bg-foreground/[0.05]">{contenido}</button>
          : <div className="px-4 py-2">{contenido}</div>}
      </li>
    )
  }

  const { decidir, urgente, saber } = bandeja
  const calma = !decidir.length && !urgente.length
  const ceja = 'flex items-center gap-2 px-4 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted'

  const content = (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground md:text-sm">Avisos</h3>
        <div className="flex items-center gap-1">
          {pushStatus !== 'unsupported' && pushStatus !== 'loading' && (
            <button
              onClick={handlePushToggle}
              disabled={pushLoading || pushStatus === 'denied'}
              title={pushStatus === 'denied' ? 'Bloqueado: permítelo en los ajustes del navegador' : pushStatus === 'subscribed' ? 'Silenciar este dispositivo' : 'Recibir avisos en este dispositivo'}
              aria-label={pushStatus === 'subscribed' ? 'Silenciar avisos en este dispositivo' : 'Recibir avisos en este dispositivo'}
              className={`grid size-9 place-items-center rounded-lg transition-colors disabled:opacity-40 ${pushStatus === 'subscribed' ? 'text-foreground' : 'text-muted'}`}
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
        {failed && !cargado ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">No se pudieron leer los avisos. Se reintenta solo.</p>
        ) : (
          <>
            {urgente.length > 0 && (
              <section aria-label="Urgente">
                <h4 className={ceja}>Urgente</h4>
                <ul>{urgente.map(a => tarjeta(a, true))}</ul>
              </section>
            )}
            {decidir.length > 0 && (
              <section aria-label="Te toca decidir">
                <h4 className={ceja}><span className={c.puntoDecidir} aria-hidden="true" />Te toca decidir<span className="tabular-nums text-foreground">{pendientes}</span></h4>
                <ul>{(verTodas ? decidir : decidir.slice(0, A_LA_VISTA)).map(a => tarjeta(a))}</ul>
                {decidir.length > A_LA_VISTA && (
                  <button type="button" onClick={() => setVerTodas(v => !v)} aria-expanded={verTodas}
                    className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-[13px] font-medium text-muted hover:text-foreground md:text-[12px]">
                    {verTodas ? 'Ver menos' : `Ver las ${decidir.length - A_LA_VISTA} restantes`}
                    <ChevronDown size={14} className={`transition-transform ${verTodas ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                )}
              </section>
            )}
            {calma && cargado && (
              <div className="flex flex-col items-center gap-1.5 px-6 pb-6 pt-8 text-center">
                <p className="text-[15px] font-semibold text-foreground">Nada te espera</p>
                <p className="max-w-[18rem] text-[13px] leading-relaxed text-muted">Aquí llega solo lo que pide tu toque. Lo demás queda en «Para saber».</p>
              </div>
            )}
            {saber.length > 0 && (
              <section aria-label="Para saber" className={calma ? '' : 'mt-1 border-t border-border-subtle'}>
                <button type="button" onClick={() => setVerSaber(v => !v)} aria-expanded={verSaber}
                  className={`${ceja} w-full pb-3 text-left hover:text-foreground`}>
                  Para saber<span className="tabular-nums">{saber.length}</span>
                  <ChevronDown size={14} className={`ml-auto transition-transform ${verSaber ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {verSaber && <ul className="pb-2">{saber.map(filaSaber)}</ul>}
              </section>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-[12px] leading-snug text-muted md:text-[11px]">
        Lo que corre solo vive en{' '}
        <Link href="/rutinas" onClick={() => setIsOpen(false)} className="font-semibold text-foreground">Rutinas</Link>. Lo técnico lo revisa Levy.
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
        aria-label={pendientes ? `Avisos, ${pendientes} ${pendientes === 1 ? 'decisión pendiente' : 'decisiones pendientes'}` : 'Avisos'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="size-[18px] md:size-[15px]" />
        {compact && pendientes > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
            {pendientes > 9 ? '9+' : pendientes}
          </span>
        )}
        {!compact && (
          <>
            <span>Avisos</span>
            {pendientes > 0 && (
              <span className="ml-auto rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                {pendientes > 9 ? '9+' : pendientes}
              </span>
            )}
          </>
        )}
      </button>

      {panel}
    </div>
  )
}
