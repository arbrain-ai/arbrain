'use client'
import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from '@/shared/components/Header'
import { ColumnaConversaciones } from '@/shared/components/ColumnaConversaciones'
import { useBarras } from '@/shared/stores/barras-store'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { useGlobalShortcuts } from '@/shared/hooks/useGlobalShortcuts'
import { useAtajosCtrl } from '@/shared/hooks/useAtajosCtrl'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import { useAnchoBarra, BARRA_MIN, BARRA_MAX } from '@/shared/hooks/useAnchoBarra'
import { KeyboardShortcutsHelp } from '@/shared/components/KeyboardShortcutsHelp'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { RouteGuard } from '@/shared/components/RouteGuard'
import { KeepAliveRouter } from '@/shared/components/KeepAliveRouter'
import { RuntimeStatusPill } from '@/shared/components/RuntimeStatusPill'
import { ZoomController } from '@/shared/components/ZoomController'
import { LibraryOverlay } from '@/shared/components/LibraryOverlay'
import { ModalAjustes } from '@/features/configuracion/components/ModalAjustes'
import { ConfirmacionesHumanas } from '@/features/permisos/components/ConfirmacionesHumanas'
import { EstadoArbrain } from '@/shared/components/EstadoArbrain'
import { FrenoGeneral } from '@/features/seguridad/components/Seguridad'
import { esEdicionCliente } from '@/lib/edicion'

/** Edición cliente: el freno pide el clic humano en un diálogo (AUDITORIA I8). En la instalación de Daniel no hay endpoint. */
const EDICION_CLIENTE = esEdicionCliente()
import { PanelDerechoShell, recordarSegmentoTaller } from '@/features/cabina/panel/PanelDerecho'
import { FilaPestanas } from '@/features/cabina/panel/FilaPestanas'
import { useReabrirEnChat, useVistaTelefono } from '@/features/cabina/panel/telefono-pestanas'
import { abrirCasa } from '@/features/cabina/panel/Secciones'
import { TerminalInferior } from '@/features/cabina/terminal/TerminalInferior'
import { LLAVE_PARTE_MEMORIA } from '@/features/cabina/panel/MemoriaTaller'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { conversationsDrawerOpen, closeConversationsDrawer, toggleConversationsDrawer, drawFullscreen, libraryOpen, panelDerechoOpen } = useLayoutStore()
  // Gesto: deslizar desde el borde izquierdo -> abre el cajón de conversaciones (móvil; es lo que más se usa
  // en un teléfono que abre en el chat). No interfiere con la biblioteca (que tiene su propio gesto de borde)
  // porque solo actúa con los dos cajones cerrados.
  const edgeStart = useRef<{ x: number; y: number } | null>(null)
  const [edgeDrag, setEdgeDrag] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const pathname = usePathname()
  // "Móvil" independiente de la orientación: un teléfono en landscape (ancho > 768)
  // ya no se trata como desktop, así el header y el sidebar-overlay siguen visibles.
  const isMobile = useIsMobile()
  const barra = useAnchoBarra()
  // Teléfono (6 oct 2026): con una pestaña del panel a pantalla completa, el chat queda tapado debajo (montado, con su scroll y borrador).
  const enPestana = useVistaTelefono().vista.tipo === 'pestana'
  // Teléfono (10 oct 2026): reabrir la app tras un rato fuera es abrirla; lo primero, el chat con una conversación nueva.
  useReabrirEnChat()
  // Escritorio (4 oct 2026): una sola barra lateral, la de conversaciones, con su visibilidad guardada
  // en este equipo. Se hidrata antes del primer pintado para que no parpadee entre el estado inicial y el guardado.
  const verConversaciones = useBarras((s) => s.conversaciones)
  useLayoutEffect(() => { useBarras.getState().hidratar() }, [])
  // A mobile visit starts with content visible; opening the drawer remains an
  // explicit gesture. Also closes it when a desktop window becomes narrow.
  useEffect(() => {
    if (isMobile) closeConversationsDrawer()
  }, [isMobile, closeConversationsDrawer])

  // `?panel=tareas` o `?panel=taller[&taller=registro]` (5 oct 2026): las redirecciones de las pantallas retiradas
  // (/todotask, /ops, /activity) aterrizan con su pestaña abierta en el panel. El parámetro se consume y se borra.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), panel = q.get('panel')
    if (panel !== 'tareas' && panel !== 'taller') return
    if (panel === 'taller' && q.get('taller')) recordarSegmentoTaller(q.get('taller')!)
    // `&cerebro=1` (/segundo-cerebro, 5 oct 2026): Taller › Memoria abre en «Ver tu cerebro».
    if (q.get('cerebro')) try { localStorage.setItem(LLAVE_PARTE_MEMORIA, 'cerebro') } catch { /* sin almacenamiento */ }
    abrirCasa(panel)
    q.delete('panel'); q.delete('taller'); q.delete('cerebro')
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q.size ? `?${q}` : ''}${window.location.hash}`)
  }, [pathname])

  // Auto-exit fullscreen when navigating away from Draw
  useEffect(() => {
    if (drawFullscreen && !pathname?.startsWith('/draw3')) {
      useLayoutStore.getState().exitDrawFullscreen()
    }
  }, [pathname, drawFullscreen])

  // AI-first: crear tarea = pedírsela a Levy (el chat se abre con el draft listo).
  const askLevy = useAskLevy()
  const handleCreateTask = useCallback(() => {
    askLevy('Crea una tarea: ')
  }, [askLevy])

  const handleShowHelp = useCallback(() => {
    setHelpOpen(true)
  }, [])

  useAtajosCtrl()
  useGlobalShortcuts({
    onCreateTask: handleCreateTask,
    onShowHelp: handleShowHelp,
  })

  // Atajo global Cmd+Option+S — abre/cierra el panel de atajos desde cualquier lugar
  // (incluso con foco en un input). Gotcha Mac: Option+S produce 'ß', usar e.code.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyS') {
        e.preventDefault()
        setHelpOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Sync keyboard metrics from the visual viewport. ALL routes (incl. /chat)
  // shrink the app shell to the visual viewport height when the keyboard opens.
  // The chat composer is an in-flow flex child, so it rides up flush above the
  // keyboard with no fixed positioning, no translate, no gap — one coordinate
  // system. (Single source of truth: do NOT also set --app-h in ZoomController.)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let rafId: number
    let fullHeight = Math.max(window.innerHeight, vv.height, document.documentElement.clientHeight)
    const currentUiZoom = () => {
      const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')
      const zoom = Number.parseFloat(raw)
      return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    }
    const clearViewportVars = () => {
      document.documentElement.style.removeProperty('--app-h')
      document.documentElement.style.removeProperty('--visual-viewport-h')
      document.documentElement.style.removeProperty('--visual-viewport-top')
      document.documentElement.style.removeProperty('--keyboard-bottom')
    }
    const sync = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const root = document.documentElement
        const zoom = currentUiZoom()
        const active = document.activeElement as HTMLElement | null
        const activeEditable = !!active && (
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'INPUT' ||
          active.isContentEditable
        )
        if (!activeEditable) {
          fullHeight = Math.max(fullHeight, window.innerHeight, vv.height, root.clientHeight)
        }
        const layoutHeight = Math.max(window.innerHeight, root.clientHeight)
        const viewportBase = Math.max(fullHeight, layoutHeight)
        const keyboardInset = Math.max(0, layoutHeight - vv.height - vv.offsetTop)
        const keyboardDelta = Math.max(0, viewportBase - vv.height - vv.offsetTop)
        const isKeyboard = activeEditable && (keyboardDelta > 80 || vv.height < viewportBase * 0.82)
        root.classList.toggle('keyboard-open', isKeyboard)
        root.style.setProperty('--visual-viewport-h', `${vv.height / zoom}px`)
        root.style.setProperty('--visual-viewport-top', `${vv.offsetTop / zoom}px`)
        root.style.setProperty('--keyboard-bottom', `${keyboardInset / zoom}px`)
        if (isKeyboard) {
          root.style.setProperty('--app-h', `${vv.height / zoom}px`)
        } else {
          root.style.removeProperty('--app-h')
          clearViewportVars()
        }
      })
    }
    // Foco (19 oct 2026, iPhone: «no se ve la caja de texto»): el foco puede salir del composer y volver sin que el
    // teclado se cierre (re-render del textarea, enviar, flechas ↑↓ de la barra de accesorios, foco programático). El
    // visualViewport no cambia de alto, así que no llega ningún resize. Antes, un temporizador de focusout BORRABA
    // --app-h a ciegas 300 ms después: el shell volvía a 100dvh con el teclado arriba y el composer quedaba debajo
    // del teclado. Ahora el focusout y el focusin solo vuelven a MEDIR; sync() decide con el viewport real.
    const timers = new Set<number>()
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => { timers.delete(id); fn() }, ms)
      timers.add(id)
    }
    const resyncSoon = () => { for (const ms of [60, 320, 700]) later(sync, ms) }
    const onFocusOut = () => {
      resyncSoon()
      // iOS puede dejar la página desplazada al cerrar el teclado: con el foco fuera de todo campo, volver arriba.
      later(() => {
        const a = document.activeElement as HTMLElement | null
        const editable = !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable)
        if (!editable && window.scrollY !== 0) window.scrollTo(0, 0)
      }, 320)
    }
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    document.addEventListener('focusin', resyncSoon)
    document.addEventListener('focusout', onFocusOut)
    sync()
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      document.removeEventListener('focusin', resyncSoon)
      document.removeEventListener('focusout', onFocusOut)
      timers.forEach(clearTimeout)
      cancelAnimationFrame(rafId)
      clearViewportVars()
    }
  }, [])

  // Anti-pan: iOS pans the layout viewport to "reveal" the caret on focus, even
  // though the shell already shrank to the visual viewport (caret is visible).
  // That pan is the "input jumps up too much" bug — the composer ends up a full
  // keyboard-height too high. Undo it REACTIVELY on every visual-viewport scroll
  // while an editable is focused, instead of 3 fixed-timer shots that miss frames
  // mid-animation. One handler, tied to the actual pan event, so it can't
  // overshoot and can't get stuck. scrollTo(0,0) when already at 0 is a no-op, so
  // this converges instead of looping. Inner list scroll ([data-scroll-region])
  // fires element scroll, not window/visualViewport scroll, so it's unaffected.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const isEditable = (el: Element | null) =>
      !!el && ((el as HTMLElement).tagName === 'TEXTAREA' ||
        (el as HTMLElement).tagName === 'INPUT' ||
        (el as HTMLElement).isContentEditable)
    const pin = () => {
      if (!isEditable(document.activeElement)) return
      if (window.scrollY !== 0 || vv.offsetTop > 0.5) window.scrollTo(0, 0)
    }
    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target as Element | null)) return
      requestAnimationFrame(pin)
    }
    vv.addEventListener('scroll', pin)
    window.addEventListener('scroll', pin, { passive: true })
    window.addEventListener('focusin', onFocusIn)
    return () => {
      vv.removeEventListener('scroll', pin)
      window.removeEventListener('scroll', pin)
      window.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  // While the keyboard is open, block the document from panning under it. Scroll
  // stays allowed inside the messages list ([data-scroll-region]); everywhere
  // else the touch drag is cancelled so iOS can't shift the fixed shell.
  //
  // EXCEPCIÓN (bug input móvil): un target EDITABLE (textarea/input/contentEditable)
  // también queda exento — con el teclado abierto el foco ESTÁ en el composer, así
  // que un preventDefault ciego mataba el scroll dentro del textarea Y la selección
  // de texto (arrastrar para seleccionar dispara touchmove). El commit d0ea377 añadió
  // CSS de scroll pero era inerte porque el gesto se cancelaba aquí, aguas arriba.
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!document.documentElement.classList.contains('keyboard-open')) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-scroll-region], textarea, input, [contenteditable]:not([contenteditable="false"])')) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [])

  // Shell height = 26-may known-good: var(--app-h, 100dvh). --app-h is set only
  // while the keyboard is open (shrinks the shell above it); otherwise 100dvh
  // fills the screen. --ui-zoomed-app-h sits between them for desktop zoom and is
  // unset at zoom=1 (mobile), so mobile resolves to 100dvh exactly like 26-may.
  const appHeight = 'var(--app-h, var(--ui-zoomed-app-h, 100dvh))'
  // 100% (NO 100vw): 100vw incluye el gutter de la scrollbar y desbordaba unos px en la
  // laptop (scrollbar horizontal + píldora descentrada). 100% = ancho real del shell
  // fixed inset-0 (sin gutter). El var de zoom se conserva para el zoom del UI (!=1).
  const appWidth = 'var(--ui-zoomed-app-w, 100%)'
  // Alto de las columnas laterales: el del shell menos la zona segura.
  const alturaEscritorio = 'calc(var(--app-h, var(--ui-zoomed-app-h, 100dvh)) - env(safe-area-inset-top, 0px))'
  // 6 oct 2026 (Daniel: «se ve blanco y el resto sombreado, no son buenas prácticas»): el cajón es una hoja de alto completo
  // que tapa también la cabecera, con esquinas redondeadas del lado abierto y sombra suave, como las hojas de iOS;
  // antes empezaba debajo de la cabecera y era un bloque blanco de canto duro.
  const cajonMovil = 'fixed left-0 top-0 z-50 flex w-[min(20rem,84vw)] shrink-0 flex-col overflow-hidden rounded-r-[28px] bg-surface pt-[env(safe-area-inset-top,0px)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
  // La sombra y el filo solo con el cajón abierto: cerrado queda fuera de pantalla, pero su sombra (48 px de desenfoque) se asomaba como un borde gris a la izquierda.
  const cajonAbierto = 'translate-x-0 shadow-[12px_0_48px_-16px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10'
  return (
    <div className="fixed inset-0 mission-shell overflow-hidden">
    <ZoomController />
    {/* Ajustes (6 oct 2026): ventana flotante sobre toda la app; no cambia la ruta. */}
    <ModalAjustes />
    {EDICION_CLIENTE && <ConfirmacionesHumanas />}
    {/* Resiliencia (12 oct 2026): verde / reparando / necesito ayuda, leído de la app nativa (funciona sin el web). */}
    {EDICION_CLIENTE && <EstadoArbrain />}
    {/* Seguridad del alumno (12 oct 2026): «Pausar todo» siempre a la mano y la franja de pausa. */}
    {EDICION_CLIENTE && <FrenoGeneral />}
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: appHeight,
        width: appWidth,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* Header — solo móvil (incluye landscape de teléfono). Desktop usa sidebar
          rail + Cmd+Ctrl+H. isMobile en vez del breakpoint de ancho para que el
          header NO desaparezca al girar el teléfono. */}
      {/* Franja de la barra de estado (safe-area, PWA black-translucent): mismo color sólido
          que la cabecera del teléfono (c6339bd6), sin el degradado del shell ni vidrio. */}
      {!drawFullscreen && isMobile && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-20" style={{ height: 'env(safe-area-inset-top, 0px)', background: 'var(--surface)' }} />
      )}
      {/* 6 oct 2026 (el dueño: «¿por qué hasta arriba se ve como blur?»): la franja de la barra de estado del teléfono
          mostraba el degradado gris del fondo (.mission-shell, --background) y no el color de la cabecera (--surface).
          Una franja sólida del mismo color la une a la cabecera; el velo del cajón (z-45) sigue tapándola. */}
      {isMobile && <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[44] bg-surface" style={{ height: 'env(safe-area-inset-top, 0px)' }} />}
      {!drawFullscreen && isMobile && <Header />}
      {/* Segunda fila (6 oct 2026; siempre visible desde el 10 oct): las pestañas abiertas del panel y el «+». */}
      {!drawFullscreen && isMobile && <FilaPestanas />}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Gesto: borde izquierdo -> abre el cajón de conversaciones (móvil, sin overlays activos) */}
        {isMobile && !conversationsDrawerOpen && !drawFullscreen && !libraryOpen && !enPestana && (
          <div
            className="absolute left-0 top-0 h-full z-40"
            style={{ width: 20, touchAction: 'pan-y' }}
            onTouchStart={(e) => { const t = e.touches[0]; edgeStart.current = { x: t.clientX, y: t.clientY } }}
            onTouchMove={(e) => {
              if (!edgeStart.current) return
              const t = e.touches[0]
              const dx = t.clientX - edgeStart.current.x
              const dy = t.clientY - edgeStart.current.y
              if (dx > 0 && Math.abs(dx) > Math.abs(dy)) setEdgeDrag(Math.min(dx, 120))
            }}
            onTouchEnd={() => { if (edgeDrag > 55) toggleConversationsDrawer(); setEdgeDrag(0); edgeStart.current = null }}
          />
        )}
        {edgeDrag > 0 && (
          <div className="absolute left-0 top-0 h-full z-40 pointer-events-none" style={{ width: edgeDrag }}>
            <div className="h-full w-full bg-gradient-to-r from-primary/25 to-transparent" />
          </div>
        )}
        {/* Mobile overlay (incluye landscape de teléfono): un toque fuera cierra el cajón. */}
        {conversationsDrawerOpen && !drawFullscreen && isMobile && (
          <div
            className="fixed inset-0 z-[45] bg-black/30 backdrop-blur-[2px] animate-[fadeIn_200ms_ease-out]"
            onClick={closeConversationsDrawer}
          />
        )}

        {/* ESCRITORIO: una sola barra lateral, la de conversaciones. Oculta se vuelve a mostrar con ⌘⇧B, `[` o el asa
            del borde. Las secciones ya no tienen barra: viven en el «+» del panel, por ruta directa y con Ctrl+1…7. */}
        <div className="contents" data-oculta-enfoque>

        {!isMobile && !drawFullscreen && !verConversaciones && (
          <button
            onClick={() => useBarras.getState().alternarConversaciones()}
            className="solo-escritorio icon-btn absolute left-1 top-1/2 z-30 flex size-7 -translate-y-1/2"
            title="Mostrar las conversaciones (⌘⇧B)"
            aria-label="Mostrar las conversaciones"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {!isMobile && !drawFullscreen && verConversaciones && (
          <aside
            aria-label="Conversaciones"
            className={`solo-escritorio relative z-10 flex shrink-0 flex-col overflow-visible border-r border-border-subtle bg-surface/90 shadow-depth-rest-soft backdrop-blur-xl ${barra.arrastrando ? '' : 'transition-[width] duration-300 ease-in-out'}`}
            style={{ height: alturaEscritorio, width: barra.ancho }}
          >
            {/* Divisor para cambiar el ancho, como el del panel derecho. Hijo directo del aside (el hook mide
                su padre). Debajo del botón de esconder (z-20) para que ese siga a mano. */}
            <div
              role="separator" aria-orientation="vertical" tabIndex={0}
              aria-label="Cambiar el ancho de la columna de conversaciones" aria-valuenow={barra.ancho} aria-valuemin={BARRA_MIN} aria-valuemax={BARRA_MAX}
              title="Arrastra para cambiar el ancho · doble clic para volver al tamaño inicial"
              onPointerDown={barra.empezar} onKeyDown={barra.teclas} onDoubleClick={barra.restablecer}
              className="group/divisor absolute -right-[5px] top-0 bottom-0 z-10 w-2.5 cursor-col-resize touch-none outline-none"
            >
              <span className={`absolute left-1 top-0 bottom-0 w-0.5 transition-colors ${barra.arrastrando ? 'bg-brand/55' : 'bg-transparent group-hover/divisor:bg-brand/55 group-focus-visible/divisor:bg-brand/55'}`} aria-hidden />
            </div>
            <button
              onClick={() => useBarras.getState().alternarConversaciones()}
              className="icon-btn absolute -right-3 top-1/2 z-20 flex size-7 -translate-y-1/2"
              title="Esconder las conversaciones"
              aria-label="Esconder las conversaciones"
            >
              <ChevronLeft size={14} />
            </button>
            <ColumnaConversaciones />
          </aside>
        )}

        {/* TELÉFONO: un solo cajón, el de conversaciones con su pie (Manual, avisos, ajustes, tema). Cerrado sigue
            fuera de pantalla (transform) pero vivo en el árbol de accesibilidad — iOS Speak Screen
            ("Abrir lector") lo leía ANTES que los mensajes. inert + aria-hidden lo sacan del árbol de verdad. */}
        {!drawFullscreen && isMobile && (
          <>
            <aside
              inert={!conversationsDrawerOpen}
              aria-hidden={!conversationsDrawerOpen}
              aria-label="Conversaciones"
              className={`${conversationsDrawerOpen ? cajonAbierto : '-translate-x-full'} ${cajonMovil}`}
              style={{ height: 'var(--app-h, var(--ui-zoomed-app-h, 100dvh))' }}
            >
              <ColumnaConversaciones tactil onElegir={() => { closeConversationsDrawer(); useLayoutStore.getState().setPanelDerecho(false) }} />
            </aside>
          </>
        )}

        {/* Main Content — `relative` so pages can fill it with `absolute inset-0` (reliable scroll).
            El wrapper keyed por sección anima la ENTRADA de cada ruta (transición global premium);
            es absolute inset-0 para que el transform no rompa el posicionamiento de las páginas. */}
        </div>
        <main data-shell-main inert={enPestana || undefined} className="relative flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Terminal inferior (⌘J, 2 oct 2026): la página se queda con el espacio de arriba y el panel con el de abajo. */}
          <div className="relative min-h-0 min-w-0 flex-1">
          <RouteGuard>
            <div key={pathname?.split('/')[1] ?? ''} className="page-enter absolute inset-0">
              <KeepAliveRouter>{children}</KeepAliveRouter>
            </div>
          </RouteGuard>
          {/* Biblioteca: en DESKTOP se monta dentro de <main> (absolute inset-0) para que
              el sidebar siga visible y colapsable al lado. En móvil el overlay usa fixed
              inset-0 (tapa header + todo). El switch vive dentro de LibraryOverlay. */}
          <LibraryOverlay />
          </div>
          {!drawFullscreen && <div className="contents" data-terminal-inferior><TerminalInferior /></div>}
        </main>
        {/* Panel derecho (1 oct, diseño v2): tareas del dueño y de sus agentes, lo que
            Levy mostró y el Taller. Columna redimensionable en escritorio; hoja en el teléfono. */}
        <PanelDerechoShell />
      </div>

      {!drawFullscreen && (
        <>
          {/* Punto verde de runtime: solo desktop (en móvil no se necesita). Oculto con la
              biblioteca abierta: el overlay desktop es absolute z-50 dentro de <main> y este
              pill es fixed z-50 — sin ocultarlo, pintaba encima del header de la biblioteca. */}
          {/* Con el panel derecho abierto el pill taparía su botón de cerrar; el panel ya dice si está en vivo. */}
          {/* Edición cliente: sin la píldora del espejo local-first (sincroniza con la nube del dueño). */}
          {!isMobile && !libraryOpen && !panelDerechoOpen && !EDICION_CLIENTE && <div className="solo-escritorio contents"><RuntimeStatusPill /></div>}
          <KeyboardShortcutsHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </>
      )}
    </div>
    </div>
  )
}
