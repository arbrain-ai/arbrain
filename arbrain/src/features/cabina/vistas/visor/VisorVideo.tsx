'use client'
/**
 * Visor de video para JUZGAR una edición (8 oct 2026). Objetivo: ver, comparar y pedir cambios sin salir de Arbrain.
 *
 * De Frame.io: comparar versiones (lado a lado o alternando en el mismo instante) y marcar un instante con su comentario.
 * De un editor: fotograma a fotograma (fps real por ffprobe), velocidad, J/K/L, línea de tiempo con las marcas.
 * Nunca autoplay con sonido: abre pausado y silenciado (regla de Daniel); el sonido es un botón y su deslizador.
 *
 * Pantalla completa (9 oct): el visor entero, con su capa de controles encima del video, que aparece al mover el ratón o
 * tocar y se va sola (con el cursor) a los 2.5 s. Es la base del reproductor de la skill de edición: lo de afuera existe adentro.
 *
 * Todas las versiones están montadas y quietas en el mismo instante: alternar es cambiar cuál se ve, sin recargar nada.
 * Una marca es de la línea de tiempo de la versión que se miraba; ese tiempo es lo que le llega a Levy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Columns2, Flag, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { FPS_POR_DEFECTO, OCULTAR_MANDO_MS, VELOCIDADES, formatoTiempo, fotogramaDe, modoPorDefecto, pasoDeFotograma, pasoVolumen, saltoAtras, siguienteVelocidad, tiempoEnOtra, viaPantallaCompleta, volumenAlOir, type Marca } from '../../documento/medio'
import { ComposerMarca, ListaMarcas, useMarcas } from './Marcas'
import v from './visor.module.css'

export interface Sonda { ancho: number | null; alto: number | null; fps: number | null; duracion: number | null }
export interface VersionVideo { ruta: string; archivo: string; url?: string; sonda?: Sonda | null; hash?: string; error?: string }

const proporcion = (s?: Sonda | null) => s?.ancho && s?.alto ? s.ancho / s.alto : 16 / 9
const orientacion = (s?: Sonda | null) => !s?.ancho || !s?.alto ? '' : s.alto > s.ancho * 1.05 ? 'vertical' : s.ancho > s.alto * 1.05 ? 'horizontal' : 'cuadrado'

// Ventana nativa del escritorio a pantalla completa por el puente global de Tauri (sin import: ver theme-context).
type Tauri = { invoke?: (cmd: string, args: unknown) => Promise<unknown>; metadata?: { currentWindow?: { label?: string } } }
async function ventanaCompleta(valor: boolean, siYaLoEstaba?: (ya: boolean) => void) {
  const t = (window as unknown as { __TAURI_INTERNALS__?: Tauri }).__TAURI_INTERNALS__
  if (typeof t?.invoke !== 'function') return
  const label = t.metadata?.currentWindow?.label ?? 'main'
  try {
    if (siYaLoEstaba) { const ya = !!(await t.invoke('plugin:window|is_fullscreen', { label })); siYaLoEstaba(ya); if (ya) return }
    await t.invoke('plugin:window|set_fullscreen', { label, value: valor })
  } catch { /* sin permiso: el visor igual cubre toda la ventana */ }
}

export function VisorVideo({ versiones, tiempoInicial, grande, clave }: { versiones: VersionVideo[]; tiempoInicial?: number; grande?: boolean; clave: string }) {
  const lista = useMemo(() => versiones.filter((x): x is VersionVideo & { url: string } => !!x.url), [versiones])
  const fallidas = versiones.filter(x => x.error)
  const [a, setA] = useState(0)                       // versión de los controles
  const [b, setB] = useState<number | null>(null)     // versión a su derecha, si se comparan lado a lado
  const [reproduciendo, setReproduciendo] = useState(false)
  const [t, setT] = useState(0)
  const [duraciones, setDuraciones] = useState<Record<number, number>>({})
  const [vel, setVel] = useState(1)
  const [mudo, setMudo] = useState(true)
  const [volumen, setVolumen] = useState(1)
  const [sync, setSync] = useState<'tiempo' | 'avance'>('tiempo')
  const [modoPantalla, setModoPantalla] = useState<'elemento' | 'ventana' | null>(null)
  const pantallaCompleta = modoPantalla != null
  const [borrador, setBorrador] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const barra = useRef<HTMLDivElement>(null)
  const escenaRef = useRef<HTMLDivElement>(null)
  const [anchoEscena, setAnchoEscena] = useState(0)
  const [altoVentana, setAltoVentana] = useState(800)
  const jPulsada = useRef(0)
  const { marcas, agregar, quitar, enviar } = useMarcas(clave)

  const actual = lista[Math.min(a, lista.length - 1)]
  const fps = actual?.sonda?.fps ?? FPS_POR_DEFECTO
  const dur = duraciones[a] ?? actual?.sonda?.duracion ?? 0
  const durDe = useCallback((i: number) => duraciones[i] ?? lista[i]?.sonda?.duracion ?? 0, [duraciones, lista])
  const comparando = b != null && b !== a && !!lista[b]
  const maestro = () => videos.current[a] ?? null
  const mostradas = comparando ? [a, b!] : [a]
  const nombre = (i: number) => lista[i]?.archivo ?? ''

  // Lo que se mira es el maestro; las demás versiones lo siguen en el mismo instante (o en el mismo avance).
  const alinear = useCallback((desde: number, seg: number, modo = sync) => {
    lista.forEach((_, i) => {
      const el = videos.current[i]; if (!el || i === desde) return
      const d = durDe(i); if (!d) return
      const destino = tiempoEnOtra(seg, durDe(desde), d, modo)
      if (Math.abs(el.currentTime - destino) > 0.05) el.currentTime = destino
    })
  }, [lista, durDe, sync])

  // ── El reloj: el fotograma que se ve manda; las otras versiones lo siguen ──
  useEffect(() => {
    let id = 0
    const tic = () => {
      const m = maestro()
      if (m) {
        setT(prev => Math.abs(prev - m.currentTime) > 0.5 / fps ? m.currentTime : prev)
        if (!m.paused) {
          for (const i of mostradas) {
            if (i === a) continue
            const el = videos.current[i]; if (!el) continue
            const destino = tiempoEnOtra(m.currentTime, durDe(a), durDe(i), sync)
            if (Math.abs(el.currentTime - destino) > 0.12) el.currentTime = destino
          }
        }
      }
      id = requestAnimationFrame(tic)
    }
    id = requestAnimationFrame(tic)
    return () => cancelAnimationFrame(id)
  })

  // Abrir en el tiempo que pidió Levy.
  const aplicado = useRef<number | null>(null)
  useEffect(() => {
    if (tiempoInicial == null || aplicado.current === tiempoInicial) return
    const m = maestro(); if (!m) return
    const poner = () => { m.currentTime = tiempoInicial; setT(tiempoInicial); alinear(a, tiempoInicial); aplicado.current = tiempoInicial }
    if (m.readyState >= 1) poner(); else m.addEventListener('loadedmetadata', poner, { once: true })
  }, [tiempoInicial, a, alinear, lista.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const aviso_ = (texto: string) => { setAviso(texto); window.setTimeout(() => setAviso(x => x === texto ? null : x), 2200) }

  // ── Transporte ──
  const todos = (f: (el: HTMLVideoElement, i: number) => void) => mostradas.forEach(i => { const el = videos.current[i]; if (el) f(el, i) })
  const reproducir = () => { alinear(a, maestro()?.currentTime ?? 0); todos(el => { void el.play().catch(() => undefined) }) }
  const pausar = () => todos(el => el.pause())
  const alternar = () => (maestro()?.paused ?? true) ? reproducir() : pausar()
  const irA = useCallback((seg: number) => {
    const m = maestro(); if (!m) return
    const d = durDe(a) || m.duration || 0
    const destino = Math.min(Math.max(0, seg), d > 0 ? Math.max(0, d - 0.5 / fps) : seg)
    m.currentTime = destino; setT(destino); alinear(a, destino)
  }, [a, alinear, durDe, fps]) // eslint-disable-line react-hooks/exhaustive-deps
  const fotograma = (pasos: number) => { pausar(); const m = maestro(); if (m) irA(pasoDeFotograma(m.currentTime, fps, pasos, dur)) }
  const velocidad = (x: number) => { setVel(x); lista.forEach((_, i) => { const el = videos.current[i]; if (el) el.playbackRate = x }) }
  useEffect(() => { lista.forEach((_, i) => { const el = videos.current[i]; if (el) { el.playbackRate = vel; el.muted = mudo || i !== a; el.volume = volumen } }) }, [vel, mudo, volumen, a, lista, comparando])
  const alternarSonido = () => { if (mudo) setVolumen(volumenAlOir); setMudo(x => !x) }
  const ponerVolumen = (x: number) => { setVolumen(x); setMudo(x <= 0) }

  const elegirVersion = (i: number) => {
    if (i === a || !lista[i]) return
    const m = maestro(), seg = m?.currentTime ?? 0, estabaCorriendo = !!m && !m.paused
    const destino = tiempoEnOtra(seg, durDe(a), durDe(i), sync)
    const nuevo = videos.current[i]
    if (nuevo) nuevo.currentTime = destino
    if (b === i) setB(null)
    pausar(); setA(i); setT(destino)
    if (estabaCorriendo) window.setTimeout(() => { videos.current[i] && void videos.current[i]!.play().catch(() => undefined) }, 60)
    aviso_(lista[i].archivo)
  }
  const alternarLado = () => {
    if (lista.length < 2) return
    if (comparando) { setB(null); return }
    const otra = lista.findIndex((_, i) => i !== a)
    setSync(modoPorDefecto(durDe(a), durDe(otra)))
    setB(otra)
  }

  // ── Marcas ──
  const marcarAqui = () => { pausar(); const m = maestro(); setBorrador(m?.currentTime ?? t) }
  const marcasVersion = marcas.filter(m => m.ruta === actual?.ruta)
  const crearMarca = (nota: string, enviarYa: boolean) => {
    if (borrador == null || !actual) return
    const nueva = agregar({ tiempo: borrador, nota: nota.trim(), version: actual.archivo, ruta: actual.ruta })
    if (enviarYa) { enviar([nueva]); aviso_('Levy recibió el instante') }
    setBorrador(null); raiz.current?.focus()
  }
  const saltarAMarca = (m: Marca) => {
    const i = lista.findIndex(x => x.ruta === m.ruta)
    if (i >= 0 && i !== a) elegirVersion(i)
    window.setTimeout(() => irA(m.tiempo), i >= 0 && i !== a ? 80 : 0)
  }

  // ── Barra de tiempo ──
  const [hover, setHover] = useState<number | null>(null)
  const posicion = (e: { clientX: number }) => { const r = barra.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur }
  const arrastre = useRef<{ corria: boolean } | null>(null)
  const alBajar = (e: React.PointerEvent) => {
    if (!dur) return
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { corria: !(maestro()?.paused ?? true) }
    pausar(); irA(posicion(e))
  }
  const alMover = (e: React.PointerEvent) => {
    const seg = posicion(e); setHover(seg)
    if (arrastre.current) irA(seg)
    if (e.pointerType === 'mouse') { if (!previaActiva) setPreviaActiva(true); pedirPrevia(seg) }
  }
  const alSoltar = () => { if (arrastre.current?.corria) reproducir(); arrastre.current = null }

  // ── Avance: el fotograma bajo el cursor, de un <video> aparte que nunca suena ni se ve ──
  const [previaActiva, setPreviaActiva] = useState(false)
  const [hayPrevia, setHayPrevia] = useState(false)
  const previa = useRef<HTMLVideoElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const buscandoPrevia = useRef(false)
  const pendientePrevia = useRef<number | null>(null)
  const pedirPrevia = (seg: number) => {
    const pv = previa.current
    if (!pv || pv.readyState < 1 || buscandoPrevia.current) { pendientePrevia.current = seg; return }
    pendientePrevia.current = null; buscandoPrevia.current = true; pv.currentTime = seg
  }
  const pintarPrevia = () => {
    const pv = previa.current, c = lienzo.current
    buscandoPrevia.current = false
    if (pv && c && pv.videoWidth) { c.getContext('2d')?.drawImage(pv, 0, 0, c.width, c.height); setHayPrevia(true) }
    const siguiente = pendientePrevia.current
    if (siguiente != null && pv && Math.abs(siguiente - pv.currentTime) > 0.04) pedirPrevia(siguiente)
  }
  useEffect(() => { setHayPrevia(false); buscandoPrevia.current = false }, [actual?.url])

  // ── Teclado ──
  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement).closest('textarea, select, input:not([type=range])')) return
    if ((e.target as HTMLElement).matches('input[type=range]') && e.key.startsWith('Arrow')) return   // el deslizador ya se mueve solo
    if (pantallaCompleta) despertar()
    const k = e.key.toLowerCase()
    let hecho = true
    if (k === ' ') alternar()
    else if (k === 'k') pausar()
    else if (k === 'l') { if (maestro()?.paused) { velocidad(1); reproducir() } else velocidad(siguienteVelocidad(vel)); jPulsada.current = 0 }
    else if (k === 'j') { irA((maestro()?.currentTime ?? 0) - saltoAtras(jPulsada.current)); jPulsada.current++ }
    else if (e.key === 'ArrowRight') { e.shiftKey ? irA((maestro()?.currentTime ?? 0) + 1) : fotograma(1) }
    else if (e.key === 'ArrowLeft') { e.shiftKey ? irA((maestro()?.currentTime ?? 0) - 1) : fotograma(-1) }
    else if (k === '.') fotograma(1)
    else if (k === ',') fotograma(-1)
    else if (k === 'm') marcarAqui()
    else if (k === 'c') alternarLado()
    else if (k === 'f') void alternarPantalla()
    else if (k === 's') alternarSonido()
    else if (e.key === 'ArrowUp') ponerVolumen(pasoVolumen(mudo ? 0 : volumen, 1))
    else if (e.key === 'ArrowDown') ponerVolumen(pasoVolumen(mudo ? 0 : volumen, -1))
    else if (e.key === 'Escape' && pantallaCompleta) void salirPantalla()
    else if (e.key === 'Home') irA(0)
    else if (e.key === 'End') irA(dur)
    else if (e.key === '[') velocidad(VELOCIDADES[Math.max(0, VELOCIDADES.findIndex(x => x >= vel - 1e-6) - 1)])
    else if (e.key === ']') velocidad(VELOCIDADES[Math.min(VELOCIDADES.length - 1, VELOCIDADES.findIndex(x => x >= vel - 1e-6) + 1)])
    else if (/^[1-6]$/.test(e.key)) elegirVersion(Number(e.key) - 1)
    else hecho = false
    if (hecho) { e.preventDefault(); if (k !== 'j') jPulsada.current = 0 }
  }
  const modoRef = useRef(modoPantalla); modoRef.current = modoPantalla
  const ventanaYaCompleta = useRef(false)
  const entrarVentana = () => {
    const el = raiz.current; if (!el) return
    // Capa superior (popover): escapa de cualquier contenedor del panel sin mover el nodo, así nada se recarga.
    try { el.setAttribute('popover', 'manual'); el.showPopover() } catch { el.removeAttribute('popover') }
    setModoPantalla('ventana'); el.focus()
    void ventanaCompleta(true, ya => { ventanaYaCompleta.current = ya })
  }
  const salirVentana = useCallback(() => {
    const el = raiz.current
    try { if (el?.matches(':popover-open')) el.hidePopover() } catch { /* sin popover */ }
    el?.removeAttribute('popover')
    setModoPantalla(null)
    if (!ventanaYaCompleta.current) void ventanaCompleta(false)
  }, [])
  const salirPantalla = async () => {
    if (modoRef.current === 'ventana') salirVentana()
    else if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  }
  const alternarPantalla = async () => {
    const el = raiz.current; if (!el) return
    if (modoRef.current) return salirPantalla()
    // iPhone (Safari y la PWA) no tiene requestFullscreen en elementos: solo el <video> nativo entra a
    // pantalla completa (y gira a horizontal) con webkitEnterFullscreen. 9 oct, Daniel: «quiero verlo
    // completo o en horizontal desde el teléfono y no se puede». Ahí los controles son los del sistema.
    const v = maestro() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    const tactil = !!window.matchMedia?.('(pointer: coarse)').matches
    const videoNativo = typeof v?.webkitEnterFullscreen === 'function'
    const nativo = () => { v!.muted = false; setMudo(false); v!.webkitEnterFullscreen!() }
    const via = viaPantallaCompleta({ elemento: typeof el.requestFullscreen === 'function', escritorio: isDesktopRuntime(), tactil, videoNativo })
    if (via === 'video') return nativo()
    if (via === 'elemento') {
      try { await el.requestFullscreen(); return }
      catch { if (tactil && videoNativo) return nativo() }
    }
    entrarVentana()
  }
  useEffect(() => {
    const al = () => setModoPantalla(m => document.fullscreenElement === raiz.current ? 'elemento' : m === 'elemento' ? null : m)
    document.addEventListener('fullscreenchange', al); return () => document.removeEventListener('fullscreenchange', al)
  }, [])
  // Si el visor se cierra en pantalla completa, la ventana nativa vuelve a su tamaño.
  useEffect(() => () => { if (modoRef.current === 'ventana' && !ventanaYaCompleta.current) void ventanaCompleta(false) }, [])

  // ── Capa de controles: aparece al mover o tocar, se va sola (y el cursor) ──
  const [quieto, setQuieto] = useState(false)
  const reposo = useRef(0)
  const sobreMando = useRef(false)
  const tocoOculto = useRef(false)
  const despertar = useCallback(() => {
    setQuieto(false)
    window.clearTimeout(reposo.current)
    const dormir = () => {
      if (sobreMando.current || arrastre.current) { reposo.current = window.setTimeout(dormir, OCULTAR_MANDO_MS); return }
      setQuieto(true)
    }
    reposo.current = window.setTimeout(dormir, OCULTAR_MANDO_MS)
  }, [])
  useEffect(() => { if (pantallaCompleta) despertar(); else { window.clearTimeout(reposo.current); setQuieto(false) } }, [pantallaCompleta, despertar])
  useEffect(() => () => window.clearTimeout(reposo.current), [])
  const mandoOculto = pantallaCompleta && quieto && borrador == null

  useEffect(() => {
    const el = escenaRef.current; if (!el) return
    const medir = () => { setAnchoEscena(el.clientWidth); setAltoVentana(window.innerHeight) }
    medir(); const o = new ResizeObserver(medir); o.observe(el); window.addEventListener('resize', medir)
    return () => { o.disconnect(); window.removeEventListener('resize', medir) }
  }, [lista.length])

  if (!actual) return <p className={v.aviso} role="alert">{fallidas[0]?.error ?? 'No se pudo abrir el video.'}</p>
  // El alto de la escena sigue a lo que se ve: un horizontal solo no deja franjas negras enormes; un horizontal junto a un vertical
  // (los dos formatos de una entrega) toma el alto del más alto, hasta el tope del panel.
  const tope = pantallaCompleta ? altoVentana - 190 : grande ? Math.max(260, altoVentana - 360) : Math.min(520, Math.max(220, altoVentana * 0.5))
  const huecoCol = mostradas.length > 1 ? (anchoEscena - 8 * (mostradas.length - 1)) / mostradas.length : anchoEscena
  const altoEscena = pantallaCompleta ? undefined : anchoEscena > 0 ? Math.round(Math.max(...mostradas.map(i => Math.min(tope, huecoCol / proporcion(lista[i]?.sonda))), 120)) + (comparando ? 30 : 0) : undefined
  const tiempoActual = formatoTiempo(t, { fps, fotogramas: true })
  const sondaA = actual.sonda
  const fotogramaN = fotogramaDe(t, fps)
  const p = proporcion(sondaA), anchoPrevia = p >= 1 ? 176 : Math.round(132 * p), altoPrevia = Math.round(anchoPrevia / p)
  const nivel = mudo ? 0 : volumen
  const sobre = { onPointerEnter: () => { sobreMando.current = true }, onPointerLeave: () => { sobreMando.current = false } }

  return <div ref={raiz} className={v.video} data-grande={grande || undefined} data-pantalla={pantallaCompleta || undefined} data-quieto={mandoOculto || undefined} tabIndex={0} onKeyDown={alTeclado} role="group" aria-label={`Video ${actual.archivo}`}
    onPointerMove={pantallaCompleta ? despertar : undefined}
    onPointerDownCapture={pantallaCompleta ? e => { tocoOculto.current = mandoOculto && e.pointerType !== 'mouse'; despertar() } : undefined}>
    {!pantallaCompleta && fallidas.map(f => <p key={f.ruta} className={v.aviso}>{f.archivo}: {f.error}</p>)}
    {lista.length > 1 && <div className={v.versiones} role="tablist" aria-label="Versiones" {...sobre}>
      {lista.map((x, i) => <button key={x.ruta} type="button" role="tab" aria-selected={i === a} data-derecha={comparando && i === b || undefined} onClick={() => comparando && i !== a ? setB(i) : elegirVersion(i)} title={`${x.archivo}${orientacion(x.sonda) ? ` · ${orientacion(x.sonda)}` : ''}  (${i + 1})`}>
        <kbd>{i + 1}</kbd>{x.archivo.replace(/\.[^.]+$/, '')}
      </button>)}
      <button type="button" className={v.lado} aria-pressed={comparando} onClick={alternarLado} title="Ver dos versiones lado a lado (C)"><Columns2 size={14} aria-hidden />Lado a lado</button>
      {comparando && Math.abs(durDe(a) - durDe(b!)) >= 0.5 && <span className={v.delta}>{nombre(b!)} dura {formatoTiempo(Math.abs(durDe(a) - durDe(b!)))} {durDe(b!) < durDe(a) ? 'menos' : 'más'} que {nombre(a)}</span>}
      {comparando && <div className={v.sync} role="group" aria-label="Alinear por">
        <button type="button" aria-pressed={sync === 'tiempo'} onClick={() => { setSync('tiempo'); alinear(a, maestro()?.currentTime ?? 0, 'tiempo') }}>mismo tiempo</button>
        <button type="button" aria-pressed={sync === 'avance'} onClick={() => { setSync('avance'); alinear(a, maestro()?.currentTime ?? 0, 'avance') }}>mismo avance</button>
      </div>}
    </div>}

    <div ref={escenaRef} className={v.escena} data-dos={comparando || undefined} style={altoEscena ? { height: altoEscena } : undefined}>
      {lista.map((x, i) => {
        const visible = mostradas.includes(i)
        return <figure key={x.ruta} className={v.cuadro} data-oculto={!visible || undefined} data-maestro={visible && comparando && i === a || undefined} aria-hidden={!visible}>
          {visible && comparando && <figcaption>
            <button type="button" onClick={() => i !== a && (b === i ? (setB(a), setA(i)) : elegirVersion(i))} title="Controlar esta versión">{x.archivo}</button>
            <span>{formatoTiempo(i === a ? t : videos.current[i]?.currentTime ?? 0, { fps: x.sonda?.fps ?? fps })} / {formatoTiempo(durDe(i))}{orientacion(x.sonda) ? ` · ${orientacion(x.sonda)}` : ''}</span>
          </figcaption>}
          <div className={v.pantalla}>
            <video ref={el => { videos.current[i] = el }} src={x.url} muted playsInline preload={visible ? 'auto' : 'metadata'} style={{ aspectRatio: proporcion(x.sonda) }}
              onLoadedMetadata={e => { const dv = e.currentTarget.duration; setDuraciones(d => ({ ...d, [i]: dv })) }}
              onSeeked={() => { if (i === a && !(videos.current[a]?.paused === false)) alinear(a, videos.current[a]?.currentTime ?? 0) }} onPlay={() => i === a && setReproduciendo(true)} onPause={() => i === a && setReproduciendo(false)} onEnded={() => { pausar() }}
              onClick={() => { raiz.current?.focus(); if (tocoOculto.current) { tocoOculto.current = false; return } if (i === a) alternar() }} onDoubleClick={() => void alternarPantalla()} />
          </div>
        </figure>
      })}
      {aviso && <div className={v.toast} role="status">{aviso}</div>}
    </div>

    <div className={v.mando} {...sobre}>
    <div className={v.reloj} aria-label="Línea de tiempo">
      <div ref={barra} className={v.barraTiempo} role="slider" aria-label="Posición" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} aria-valuetext={tiempoActual}
        onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onPointerLeave={() => { setHover(null); setHayPrevia(false) }}>
        {hover != null && dur > 0 && <i className={v.avance} style={{ width: `${(hover / dur) * 100}%` }} />}
        <i className={v.relleno} style={{ width: dur ? `${(t / dur) * 100}%` : 0 }} />
        {marcasVersion.map(m => <button key={m.id} type="button" className={v.bandera} data-enviada={m.enviada || undefined} style={{ left: dur ? `${(m.tiempo / dur) * 100}%` : 0 }}
          title={`${formatoTiempo(m.tiempo, { fps })} · ${m.nota || 'sin nota'}`} onPointerDown={e => e.stopPropagation()} onClick={() => irA(m.tiempo)}><Flag size={11} aria-hidden /></button>)}
        {hover != null && dur > 0 && <span className={v.pista} data-previa={hayPrevia || undefined} style={{ left: `clamp(${anchoPrevia / 2 + 4}px, ${(hover / dur) * 100}%, calc(100% - ${anchoPrevia / 2 + 4}px))` }}>
          <canvas ref={lienzo} width={anchoPrevia * 2} height={altoPrevia * 2} style={{ width: anchoPrevia, height: altoPrevia }} aria-hidden />
          {formatoTiempo(hover, { fps })}
        </span>}
        <b className={v.cabeza} style={{ left: dur ? `${(t / dur) * 100}%` : 0 }} />
      </div>
      {previaActiva && <video ref={previa} className={v.previaFuente} src={actual.url} muted playsInline preload="metadata" aria-hidden tabIndex={-1}
        onLoadedMetadata={() => { const s = pendientePrevia.current; if (s != null) pedirPrevia(s) }} onSeeked={pintarPrevia} />}
    </div>

    <div className={v.controles}>
      <button type="button" className={v.icono} onClick={() => fotograma(-1)} aria-label="Fotograma anterior" title="Fotograma anterior (←)"><SkipBack size={15} aria-hidden /></button>
      <button type="button" className={v.reproducir} onClick={alternar} aria-label={reproduciendo ? 'Pausar' : 'Reproducir'} title="Reproducir o pausar (espacio)">{reproduciendo ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}</button>
      <button type="button" className={v.icono} onClick={() => fotograma(1)} aria-label="Fotograma siguiente" title="Fotograma siguiente (→)"><SkipForward size={15} aria-hidden /></button>
      <span className={v.tiempo} title={`Fotograma ${fotogramaN}`}><b>{tiempoActual}</b><i> / {formatoTiempo(dur)}</i></span>
      <div className={v.volumen} data-mudo={nivel === 0 || undefined}>
        <button type="button" className={v.icono} aria-pressed={!mudo} onClick={alternarSonido} aria-label={mudo ? 'Activar sonido' : 'Silenciar'} title="Sonido (S): abre silenciado">{nivel === 0 ? <VolumeX size={15} aria-hidden /> : nivel < 0.5 ? <Volume1 size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}</button>
        <input type="range" min={0} max={1} step={0.05} value={nivel} onChange={e => ponerVolumen(Number(e.target.value))} aria-label="Volumen" aria-valuetext={`${Math.round(nivel * 100)} %`} title="Volumen (↑ ↓)" style={{ ['--nivel' as string]: `${nivel * 100}%` }} />
      </div>
      <label className={v.velocidad} title="Velocidad ([ y ], o L para acelerar)">
        <select value={vel} onChange={e => { velocidad(Number(e.target.value)); raiz.current?.focus() }} aria-label="Velocidad">{VELOCIDADES.map(x => <option key={x} value={x}>{x}×</option>)}</select>
      </label>
      <span className={v.formato}>{sondaA?.ancho ? `${sondaA.ancho}×${sondaA.alto} · ` : ''}{Number.isInteger(fps) ? fps : fps.toFixed(2)} fps{orientacion(sondaA) ? ` · ${orientacion(sondaA)}` : ''}</span>
      <button type="button" className={v.marcar} onClick={marcarAqui} title="Marcar este instante (M)"><Flag size={13} aria-hidden />Marcar aquí</button>
      <button type="button" className={v.icono} onClick={() => void alternarPantalla()} aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'} title={pantallaCompleta ? 'Salir de pantalla completa (F o Esc)' : 'Pantalla completa (F)'}>{pantallaCompleta ? <Minimize size={15} aria-hidden /> : <Maximize size={15} aria-hidden />}</button>
    </div>
    </div>

    {borrador != null && <div className={v.sitioComposer} {...sobre}><ComposerMarca tiempo={borrador} fps={fps} version={actual.archivo} alEnviar={nota => crearMarca(nota, true)} alGuardar={nota => crearMarca(nota, false)} alCerrar={() => { setBorrador(null); raiz.current?.focus() }} /></div>}
    {!pantallaCompleta && <ListaMarcas marcas={marcas} fps={fps} versionActual={actual.archivo} alSaltar={saltarAMarca} alQuitar={quitar} alEnviar={ms => { enviar(ms); aviso_(ms.length > 1 ? `Levy recibió ${ms.length} instantes` : 'Levy recibió el instante') }} />}
    {!pantallaCompleta && <p className={v.ayuda}>Espacio reproduce · ← → fotograma · ↑ ↓ volumen · J K L · M marca · {lista.length > 1 ? 'C compara · 1-' + Math.min(lista.length, 6) + ' versión · ' : ''}F pantalla completa</p>}
  </div>
}
