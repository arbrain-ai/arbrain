'use client'
/**
 * Terminal inferior de Arbrain (⌘J, 2 oct 2026). Pedido de Daniel: «como en SFTerm con cmd+J ya puedo
 * abrir terminales por debajo, quisiera lograr lo mismo acá».
 *
 * - ⌘J abre/cierra (atajo en `useGlobalShortcuts`); Escape no lo cierra (es del programa que corre).
 * - Cada pestaña es un PTY del motor de Arbrain: sobrevive al cerrar el panel, a recargar y a reiniciar
 *   el agent-server, y aparece en «trabajos». Cerrar la pestaña (x) sí cierra su PTY.
 * - Se redimensiona arrastrando el borde superior (doble clic = tamaño inicial); la altura se recuerda.
 * - Las pestañas ya visitadas siguen conectadas con el panel oculto; al abrir, la activa toma el foco.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, TerminalSquare, X } from 'lucide-react'
import { useTerminalPanel, ALTO_INICIAL, ALTO_MIN } from '@/shared/stores/terminal-panel-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { PtyPanel, enfocarTerminal, hayFocoEnTerminal, FUENTE } from './PtyPanel'
import s from './terminal.module.css'

const MARGEN_SUPERIOR = 140 // lo mínimo que se deja al contenido de la página sobre el panel

const etiqueta = (titulo: string | null, i: number) => {
  const t = (titulo ?? '').trim()
  if (!t) return `zsh ${i + 1}`
  // Los shells titulan «usuario@host:ruta»: de eso solo importa la última carpeta.
  const ruta = t.includes(':') ? t.slice(t.lastIndexOf(':') + 1) : t
  const base = ruta.replace(/\/+$/, '').split('/').pop() || ruta
  return base.length > 26 ? `${base.slice(0, 25)}…` : base
}

export function TerminalInferior() {
  const isMobile = useIsMobile()
  const { abierto, alto, activa, pestanas, hidratado } = useTerminalPanel()
  const ref = useRef<HTMLElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  // Solo se conectan las pestañas que ya se vieron (cada una es una conexión SSE).
  const [vistas, setVistas] = useState<Set<number>>(new Set())
  const antes = useRef<Element | null>(null)

  useLayoutEffect(() => { useTerminalPanel.getState().hidratar() }, [])
  // Acelerador nativo de la app de escritorio (menú Ver > Terminal, ⌘J): llega como evento al webview.
  useEffect(() => {
    const alternar = () => useTerminalPanel.getState().alternar()
    window.addEventListener('arbrain:terminal-alternar', alternar)
    return () => window.removeEventListener('arbrain:terminal-alternar', alternar)
  }, [])

  // Tras recargar, las pestañas guardadas se contrastan con el motor (un PTY pudo cerrarse mientras tanto).
  useEffect(() => {
    if (!hidratado) return
    let cancelado = false
    void fetch('/api/cabina/panel-terminal', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
      if (!cancelado && j && Array.isArray(j.ids)) useTerminalPanel.getState().reconciliar(j.ids)
    }).catch(() => {})
    return () => { cancelado = true }
  }, [hidratado])

  useEffect(() => { if (abierto && activa != null) setVistas(v => v.has(activa) ? v : new Set(v).add(activa)) }, [abierto, activa])

  const nueva = useCallback(async () => {
    if (creando) return
    setCreando(true); setError(null)
    try {
      const caja = ref.current
      // Oculto mide 0: se estima con el ancho de la página (ventana menos las barras) y la altura guardada.
      const ancho = (caja?.clientWidth || Math.max(400, window.innerWidth - 380)) - 20, altoCuerpo = (caja?.clientHeight || alto) - 34 - 10
      // Medida estimada de la letra (monoespaciada de 12 px): el ajuste fino llega al conectar.
      const cols = Math.max(20, Math.floor(ancho / (FUENTE.size * 0.6))), rows = Math.max(5, Math.floor(altoCuerpo / (FUENTE.size * FUENTE.lineHeight)))
      const r = await fetch('/api/cabina/panel-terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'crear', cols, rows }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || typeof j.id !== 'number') throw new Error(j.error ?? 'El motor no abrió la terminal.')
      useTerminalPanel.getState().agregar(j.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la terminal.')
    } finally { setCreando(false) }
  }, [creando, alto])

  // Abrir sin ninguna pestaña (primer ⌘J) crea la primera.
  const auto = useRef(false)
  useEffect(() => {
    if (abierto && hidratado && pestanas.length === 0 && !auto.current) { auto.current = true; void nueva().finally(() => { auto.current = false }) }
  }, [abierto, hidratado, pestanas.length, nueva])

  // El foco: al abrir va a la terminal; al cerrar vuelve a donde estaba el usuario.
  const estabaAbierto = useRef(false)
  useEffect(() => {
    if (abierto && !estabaAbierto.current) { if (!hayFocoEnTerminal()) antes.current = document.activeElement }
    if (!abierto && estabaAbierto.current) {
      const previo = antes.current as HTMLElement | null
      antes.current = null
      if (hayFocoEnTerminal() || document.activeElement === document.body) requestAnimationFrame(() => { if (previo?.isConnected) previo.focus(); else (document.activeElement as HTMLElement | null)?.blur?.() })
    }
    estabaAbierto.current = abierto
  }, [abierto])

  const cerrarPestana = useCallback((id: number) => {
    useTerminalPanel.getState().quitar(id)
    setVistas(v => { const n = new Set(v); n.delete(id); return n })
    void fetch('/api/cabina/panel-terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'cerrar', id }) }).catch(() => {})
    requestAnimationFrame(() => enfocarTerminal(useTerminalPanel.getState().activa))
  }, [])
  // El shell terminó solo (`exit`): la pestaña se va sin más. El PTY ya no existe.
  const terminoSolo = useCallback((id: number) => {
    useTerminalPanel.getState().quitar(id)
    setVistas(v => { const n = new Set(v); n.delete(id); return n })
    requestAnimationFrame(() => enfocarTerminal(useTerminalPanel.getState().activa))
  }, [])
  const titular = useCallback((id: number, t: string) => useTerminalPanel.getState().titular(id, t), [])

  // ── redimensionar con el borde superior ──
  const maximo = useCallback(() => {
    const padre = ref.current?.parentElement
    return padre ? Math.max(ALTO_MIN, padre.clientHeight - MARGEN_SUPERIOR) : 800
  }, [])
  const fijar = useCallback((v: number, persistir = true) => useTerminalPanel.getState().setAlto(Math.min(Math.max(v, ALTO_MIN), maximo()), persistir), [maximo])
  const empezar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const y0 = e.clientY, h0 = ref.current?.offsetHeight ?? alto
    const barra = e.currentTarget
    barra.setPointerCapture(e.pointerId)
    setArrastrando(true)
    const mover = (ev: PointerEvent) => fijar(h0 + (y0 - ev.clientY), false)
    const soltar = (ev: PointerEvent) => {
      barra.removeEventListener('pointermove', mover); barra.removeEventListener('pointerup', soltar); barra.removeEventListener('pointercancel', soltar)
      setArrastrando(false)
      fijar(h0 + (y0 - ev.clientY))
      enfocarTerminal(useTerminalPanel.getState().activa)
    }
    barra.addEventListener('pointermove', mover); barra.addEventListener('pointerup', soltar); barra.addEventListener('pointercancel', soltar)
  }
  const teclas = (e: React.KeyboardEvent) => {
    const paso = e.shiftKey ? 96 : 24, h = ref.current?.offsetHeight ?? alto
    if (e.key === 'ArrowUp') { e.preventDefault(); fijar(h + paso) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); fijar(h - paso) }
    else if (e.key === 'Home') { e.preventDefault(); fijar(maximo()) }
    else if (e.key === 'End') { e.preventDefault(); fijar(ALTO_MIN) }
  }

  // Si la ventana se encoge, el panel no se come la página.
  useEffect(() => {
    if (!abierto) return
    const ajustar = () => { const m = maximo(); if (useTerminalPanel.getState().alto > m) useTerminalPanel.getState().setAlto(m, false) }
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [abierto, maximo])

  if (isMobile || !hidratado || (pestanas.length === 0 && !abierto)) return null

  return <section ref={ref} data-terminal-panel aria-label="Terminal" hidden={!abierto}
    className={`${s.panel} ${arrastrando ? s.arrastrando : ''}`} style={{ height: Math.min(alto || ALTO_INICIAL, 4000) }}>
    <div role="separator" aria-orientation="horizontal" tabIndex={0} aria-label="Cambiar la altura de la terminal"
      aria-valuenow={alto} aria-valuemin={ALTO_MIN}
      title="Arrastra para cambiar la altura · doble clic para volver al tamaño inicial"
      className={s.divisor} onPointerDown={empezar} onKeyDown={teclas} onDoubleClick={() => fijar(ALTO_INICIAL)}>
      <span aria-hidden />
    </div>
    <header className={s.barra}>
      <div className={s.pestanas} role="tablist" aria-label="Terminales">
        {pestanas.map((p, i) => <div key={p.id} role="tab" aria-selected={p.id === activa} data-activa={p.id === activa || undefined} className={s.pestana}
          onMouseDown={e => { if (e.button === 1) { e.preventDefault(); cerrarPestana(p.id) } }}
          onClick={() => { useTerminalPanel.getState().activar(p.id) }}>
          <TerminalSquare size={12} aria-hidden />
          <span className={s.titulo} title={p.titulo ?? undefined}>{etiqueta(p.titulo, i)}</span>
          <button className={s.cerrarPestana} aria-label={`Cerrar la terminal ${etiqueta(p.titulo, i)}`} title="Cerrar esta terminal"
            onClick={e => { e.stopPropagation(); cerrarPestana(p.id) }}><X size={12} aria-hidden /></button>
        </div>)}
        <button className={s.mas} onClick={() => void nueva()} disabled={creando} aria-label="Nueva terminal" title="Nueva terminal"><Plus size={14} aria-hidden /></button>
      </div>
      <span className={s.atajo} aria-hidden>⌘J</span>
      <button className={s.ocultar} onClick={() => useTerminalPanel.getState().cerrar()} aria-label="Ocultar la terminal" title="Ocultar (⌘J) · las terminales siguen vivas"><ChevronDown size={14} aria-hidden /></button>
    </header>
    <div className={s.cuerpo}>
      {pestanas.filter(p => vistas.has(p.id) || p.id === activa && abierto).map(p => <PtyPanel key={p.id} id={p.id} visible={abierto} activa={p.id === activa} onFin={terminoSolo} onTitulo={titular} />)}
      {error && <div className={s.velo} role="alert"><span>{error}</span><button className={s.enlace} onClick={() => void nueva()}>Reintentar</button></div>}
      {!error && pestanas.length === 0 && <p className={s.velo}>Abriendo una terminal…</p>}
    </div>
  </section>
}
