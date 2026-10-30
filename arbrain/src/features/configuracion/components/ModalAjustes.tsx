'use client'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Bell, ChevronLeft, ChevronRight, Compass, Cpu, Filter, KeyRound, Keyboard, Laptop, Lock, Mic, Palette, PanelRight, Search, ShieldHalf, Smartphone, Tag, Target, UserCircle, Users, X, type LucideIcon } from 'lucide-react'
import { SeccionModelo } from '@/features/modelo/SeccionModelo'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { buscarAjustes, defDe, type IdSeccion } from '../secciones'
import { SeccionApariencia, SeccionAvisos, SeccionCuenta, SeccionEstilo, SeccionMac } from './Secciones'
import { SeccionTelefono } from '@/features/telefono/SeccionTelefono'
import { SeccionAtajos } from './SeccionAtajos'
import { SeccionPanel } from './SeccionPanel'
import { PanelLlaves } from '@/features/primer-arranque/components/PanelLlaves'
import { PanelVoz } from '@/features/primer-arranque/components/PanelVoz'
import { SeccionPrivacidad } from '@/features/primer-arranque/components/SeccionPrivacidad'
import { SeccionSeguridad } from '@/features/seguridad/components/Seguridad'
import { SeccionClientes, SeccionEmbudo, SeccionEquipo, SeccionNorte, SeccionOferta } from './SeccionesNegocio'

const ICONOS: Record<IdSeccion, LucideIcon> = {
  norte: Compass, equipo: Users, clientes: Target, oferta: Tag, embudo: Filter,
  cuenta: UserCircle, apariencia: Palette, avisos: Bell, modelo: Cpu, panel: PanelRight, atajos: Keyboard, mac: Laptop, llaves: KeyRound, voz: Mic, privacidad: Lock, seguridad: ShieldHalf, telefono: Smartphone,
}

const FOCOS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Ajustes como ventana flotante (6 oct 2026, Daniel: «mira cómo se sobreponen a todo, no en el espacio donde va Levy»).
 * Va montada en el shell: velo tenue sobre TODA la app, tarjeta grande centrada con la nav a la izquierda (buscador
 * arriba, grupos El negocio · Tú · Arbrain · Esta computadora) y la sección a la derecha con su propio scroll. Esc, la × o un clic en
 * el velo la cierran y debajo todo queda como estaba (no toca la ruta). En el teléfono es una hoja a pantalla completa
 * con lista → sección y botón de volver. Estado en `ajustes-store`; `/settings` y `?seccion=` la abren sobre /chat.
 */
export function ModalAjustes() {
  const { abierto, seccion, enLista } = useAjustes()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  if (!montado || !abierto) return null
  return createPortal(<Ventana seccion={seccion} enLista={enLista} />, document.body)
}

function Ventana({ seccion, enLista }: { seccion: IdSeccion; enLista: boolean }) {
  const movil = useIsMobile()
  const [consulta, setConsulta] = useState('')
  const tarjeta = useRef<HTMLDivElement>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const pulsoEnVelo = useRef(false)
  const resultados = useMemo(() => buscarAjustes(consulta), [consulta])
  const actual = defDe(seccion)
  const verLista = movil && enLista
  const verNav = !movil || enLista

  const cerrar = () => useAjustes.getState().cerrar()
  const ir = (id: IdSeccion) => {
    useAjustes.setState({ seccion: id, enLista: false })
    if (!movil) return
    tarjeta.current?.querySelector<HTMLElement>('[data-ajustes-contenido]')?.scrollTo({ top: 0 })
  }

  // Esc cierra (con texto en el buscador, primero lo limpia). En captura y sin dejarlo pasar: pantalla completa y el
  // doble Esc del chat no deben ver este Esc. El foco vuelve a donde estaba al abrir.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    if (!movil) buscador.current?.focus({ preventScroll: true })
    else tarjeta.current?.focus({ preventScroll: true })
    const teclas = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        if (buscador.current && document.activeElement === buscador.current && buscador.current.value) { setConsulta(''); return }
        cerrar()
        return
      }
      if (e.key === 'Tab' && tarjeta.current) {
        const focos = [...tarjeta.current.querySelectorAll<HTMLElement>(FOCOS)].filter((el) => el.offsetParent !== null)
        if (!focos.length) return
        const primero = focos[0], ultimo = focos[focos.length - 1]
        if (!tarjeta.current.contains(document.activeElement)) { e.preventDefault(); primero.focus() }
        else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
      }
    }
    window.addEventListener('keydown', teclas, true)
    const html = document.documentElement, overflow = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', teclas, true)
      html.style.overflow = overflow
      if (previo && document.contains(previo)) previo.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const planas = resultados.flatMap((g) => g.secciones.map((s) => s.seccion.id))
  const alBuscador = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && planas.length) { e.preventDefault(); ir(planas[0]) }
  }

  const nav = (
    <nav aria-label="Secciones de ajustes" className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2 pt-1 md:pt-4">
        <label className="relative block">
          <span className="sr-only">Buscar en ajustes</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={buscador}
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={alBuscador}
            placeholder="Buscar en ajustes"
            className="input-field min-h-10 w-full pl-9 pr-3 text-[13px]"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        {resultados.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">Nada coincide con «{consulta}».</p>}
        {resultados.map(({ grupo, secciones }) => (
          <div key={grupo.id} className="mt-3 first:mt-1">
            <h2 className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted/70">{grupo.titulo}</h2>
            <ul className="space-y-0.5">
              {secciones.map(({ seccion: s, coincidencias }) => {
                const Icono = ICONOS[s.id]
                const activa = s.id === seccion && !verLista
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={activa ? 'page' : undefined}
                      onClick={() => ir(s.id)}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand md:min-h-9 ${
                        activa ? 'bg-brand/15 text-foreground shadow-[inset_0_0_0_1px_rgba(var(--brand-rgb),0.22)]' : 'text-foreground/80 hover:bg-foreground/[0.06]'
                      }`}
                    >
                      <Icono className={`size-4 shrink-0 ${activa ? 'text-brand-ink' : 'text-muted'}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{s.nombre}</span>
                        {coincidencias.length > 0 && <span className="block truncate text-[11px] text-muted">{coincidencias.join(' · ')}</span>}
                      </span>
                      {movil && <ChevronRight className="size-4 shrink-0 text-muted/60" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div
      className="ajustes-velo fixed inset-0 z-[120] flex items-stretch justify-center bg-black/40 md:items-center md:p-[calc(5vh/var(--ui-zoom,1))]"
      onMouseDown={(e) => { pulsoEnVelo.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && pulsoEnVelo.current) cerrar() }}
      // Bajo el zoom de la UI (⌘+) el velo mide la ventana real y la tarjeta divide vh/vw entre el zoom (6 oct 2026).
      style={{ width: 'var(--ui-zoomed-app-w, 100%)', height: 'var(--ui-zoomed-app-h, 100%)' }}
      data-ajustes-velo
    >
      <div
        ref={tarjeta}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        tabIndex={-1}
        data-ajustes
        style={{ boxShadow: '0 40px 100px -24px rgba(0,0,0,0.6), 0 0 0 1px rgba(var(--brand-rgb), 0.14), inset 0 1px 0 rgba(255,255,255,0.07)' }}
        className="ajustes-tarjeta relative flex h-full w-full overflow-hidden bg-surface pt-[env(safe-area-inset-top)] outline-none md:h-[calc(90vh/var(--ui-zoom,1))] md:max-h-[920px] md:w-[calc(90vw/var(--ui-zoom,1))] md:max-w-[1240px] md:rounded-3xl md:border md:border-border md:pt-0"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(var(--brand-rgb),0.13),transparent)]" />

        {verNav && (
          <div className={`relative flex min-h-0 flex-col md:w-72 md:shrink-0 md:border-r md:border-border-subtle md:bg-background/35 ${movil ? 'w-full' : ''}`}>
            {movil && (
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <h1 className="font-sans text-xl font-semibold tracking-tight text-foreground">Ajustes</h1>
                <BotonCerrar onClick={cerrar} />
              </div>
            )}
            {nav}
          </div>
        )}

        {!verLista && (
          <section aria-labelledby="ajustes-titulo" className="relative flex min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 items-start gap-2 px-4 pb-3 pt-3 sm:px-8 md:pt-6">
              {movil && (
                <button type="button" onClick={() => useAjustes.setState({ enLista: true })} aria-label="Volver a la lista de ajustes" className="icon-btn-ghost -ml-2 grid size-11 shrink-0 place-items-center">
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
              )}
              <div className="min-w-0 flex-1 pt-1.5 md:pt-0">
                <h2 id="ajustes-titulo" className="font-sans text-lg font-semibold tracking-tight text-foreground md:text-xl">{actual.nombre}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{actual.detalle}.</p>
              </div>
              <BotonCerrar onClick={cerrar} />
            </header>
            <div data-ajustes-contenido data-scroll-region className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto max-w-3xl px-4 pb-24 pt-2 sm:px-8">
                {seccion === 'norte' && <SeccionNorte />}
                {seccion === 'equipo' && <SeccionEquipo />}
                {seccion === 'clientes' && <SeccionClientes />}
                {seccion === 'oferta' && <SeccionOferta />}
                {seccion === 'embudo' && <SeccionEmbudo />}
                {seccion === 'modelo' && <SeccionModelo />}
                {seccion === 'apariencia' && <><SeccionApariencia /><SeccionEstilo /></>}
                {seccion === 'cuenta' && <SeccionCuenta />}
                {seccion === 'avisos' && <SeccionAvisos />}
                {seccion === 'mac' && <SeccionMac />}
                {seccion === 'panel' && <SeccionPanel />}
                {seccion === 'atajos' && <SeccionAtajos />}
                {seccion === 'llaves' && <PanelLlaves />}
                {seccion === 'voz' && <PanelVoz />}
                {seccion === 'privacidad' && <SeccionPrivacidad />}
                {seccion === 'seguridad' && <SeccionSeguridad />}
                {seccion === 'telefono' && <SeccionTelefono />}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function BotonCerrar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Cerrar ajustes" title="Cerrar (Esc)" className="icon-btn-ghost grid size-11 shrink-0 place-items-center md:size-9">
      <X className="size-5 md:size-4" aria-hidden />
    </button>
  )
}
