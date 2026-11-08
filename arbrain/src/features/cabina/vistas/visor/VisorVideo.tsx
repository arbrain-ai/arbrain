'use client'
/**
 * Visor de video de la vista documento. Rehecho el 6 nov 2026 (Daniel, 18:20: «wtf doy clic a pantalla completa y me saca
 * escucha quiero esto mas simple pero funcional! … asegurate que el diseño este tan hermoso como el propio arbrain como el
 * boton de enviar por ejemplo»).
 *
 * A la vista, solo lo que se usa: reproducir (la tecla del botón de enviar, la misma familia), la barra que se arrastra con
 * el dedo, el tiempo, velocidad, sonido y pantalla completa. Abre pausado y silenciado (regla de Daniel).
 * Teclado, sin ocupar pantalla (8 nov 2026, Daniel: «esc salir pantalla completa, f full size, flechas adelantar y atrasar, space
 * pausa y play»): Espacio pausa/reproduce, F pantalla completa, Esc sale, ← → ±5 s (Shift: un fotograma), ↑ ↓ volumen, y para editar
 * J/K/L, M marca un instante para Levy (el mensaje
 * «⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=…»), 1-6 versión y C lado a lado cuando Levy manda varias versiones.
 *
 * Pantalla completa (por qué sacaba): el visor salía del flujo del hilo, la vista se encogía, quedaba fuera de pantalla y
 * el hilo la dormía (useALaVista desmonta lo que se aleja): el video desaparecía. Ahora el visor se marca `data-en-uso`
 * ANTES de entrar y la vista no se duerme mientras dure (Cabina.tsx › enUso). Tres vías:
 *   - teléfono (iPhone, iPad): la pantalla completa nativa del <video> (webkitEnterFullscreen), con sus controles y el giro;
 *   - escritorio con la API: requestFullscreen del contenedor, con estos mismos controles encima;
 *   - sin la API (WKWebView sin pantalla completa de elementos): el visor como capa superior (popover) y la ventana nativa a
 *     pantalla completa.
 * El <video> nunca se remonta: al salir sigue en el mismo segundo.
 *
 * Mientras corre (7 nov 2026, Daniel: «parpadea se traba si lo veo en pantalla pequeña si funciona bien»): el visor se
 * re-renderizaba entero en cada cuadro (~40 veces por segundo) solo para mover la barra y el reloj, y cada vez la página
 * entera recalculaba estilo y composición; en grande la barra mide cuatro veces más y se repintaba igual. Ahora el reloj
 * cambia cuando cambia el segundo (otroSegundo) y la barra se pinta directo, sin React, cuando la perilla avanza un píxel
 * de pantalla (moverBarra): 13:41 en la barra grande son ~6 repintes por segundo, no 40.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Columns2, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { FPS_POR_DEFECTO, OCULTAR_MANDO_MS, VELOCIDADES, altoDeEscenario, celdaDeMiniatura, espacioLibre, formatoTiempo, modoPorDefecto, moverBarra, otroSegundo, pasoDeFlecha, pasoDeFotograma, pasoVolumen, saltoAtras, siguienteVelocidad, textoFallaVideo, tiempoEnOtra, viaPantallaCompleta, volumenAlOir, type Marca } from '../../documento/medio'
import { zoomUI } from '@/shared/lib/zoom-ui'
import { ComposerMarca, ListaMarcas, useMarcas } from './Marcas'
import { registrarVisor, type VisorConEspacio } from './espacio'
import { BotonVelocidad } from './Velocidad'
import { useMiniaturas } from './useMiniaturas'
import tecla from '@/features/chat/components/boton-enviar.module.css'
import v from './visor.module.css'

export interface Sonda { ancho: number | null; alto: number | null; fps: number | null; duracion: number | null }
export interface VersionVideo { ruta: string; archivo: string; url?: string; sonda?: Sonda | null; hash?: string; error?: string }

const proporcion = (s?: Sonda | null) => s?.ancho && s?.alto ? s.ancho / s.alto : 16 / 9

type VideoWebkit = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitDisplayingFullscreen?: boolean }
type Modo = 'video' | 'elemento' | 'ventana'

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

export function VisorVideo({ versiones, tiempoInicial, grande, clave, alReintentar }: { versiones: VersionVideo[]; tiempoInicial?: number; grande?: boolean; clave: string; alReintentar?: () => void }) {
  const lista = useMemo(() => versiones.filter((x): x is VersionVideo & { url: string } => !!x.url), [versiones])
  const fallidas = versiones.filter(x => x.error)
  const [a, setA] = useState(0)                       // la versión que se mira y se controla
  const [b, setB] = useState<number | null>(null)     // la de su derecha, si se comparan lado a lado
  const [reproduciendo, setReproduciendo] = useState(false)
  const [t, setT] = useState(0)                       // el reloj que se lee: cambia por segundo, o exacto tras un salto
  const tRef = useRef(0)
  const ponerT = useCallback((seg: number) => { tRef.current = seg; setT(seg) }, [])
  const [duraciones, setDuraciones] = useState<Record<number, number>>({})
  const [vel, setVel] = useState(1)
  const [mudo, setMudo] = useState(true)
  const [volumen, setVolumen] = useState(1)
  const [modo, setModo] = useState<Modo | null>(null)
  const [borrador, setBorrador] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const barra = useRef<HTMLDivElement>(null)
  const anchoBarra = useRef(0)                       // en píxeles de pantalla
  const pintado = useRef(-1)                         // el segundo que la barra muestra
  const escenaRef = useRef<HTMLDivElement>(null)
  const [anchoEscena, setAnchoEscena] = useState(0)
  const [altoVentana, setAltoVentana] = useState(800)   // px de pantalla; altoDeEscenario lo pasa a px de la interfaz con el zoom
  const [zoom, setZoom] = useState(1)
  const [libre, setLibre] = useState<number | null>(null)   // alto que queda para el escenario en el panel principal (px de la interfaz)
  const jPulsada = useRef(0)
  const pos = useRef({ t: 0, corria: false })        // lo último visto del video que se mira (para no perderlo si cambia su enlace)
  const { marcas, agregar, quitar, enviar } = useMarcas(clave)

  const actual = lista[Math.min(a, lista.length - 1)]
  const fps = actual?.sonda?.fps ?? FPS_POR_DEFECTO
  const dur = duraciones[a] ?? actual?.sonda?.duracion ?? 0
  const durDe = useCallback((i: number) => duraciones[i] ?? lista[i]?.sonda?.duracion ?? 0, [duraciones, lista])
  const comparando = b != null && b !== a && !!lista[b]
  const maestro = () => videos.current[a] ?? null
  const mostradas = comparando ? [a, b!] : [a]
  const sync = comparando ? modoPorDefecto(durDe(a), durDe(b!)) : 'tiempo'
  // Pantalla completa propia (la nativa del teléfono trae la suya y aquí no se pinta nada encima).
  const pantalla = modo === 'elemento' || modo === 'ventana'

  // Las demás versiones siguen a la que se mira (mismo instante, o mismo avance si miden distinto).
  const alinear = useCallback((desde: number, seg: number) => {
    lista.forEach((_, i) => {
      const el = videos.current[i]; if (!el || i === desde) return
      const d = durDe(i); if (!d) return
      const destino = tiempoEnOtra(seg, durDe(desde), d, sync)
      if (Math.abs(el.currentTime - destino) > 0.05) el.currentTime = destino
    })
  }, [lista, durDe, sync])

  // La barra se pinta sin React (--avance en su estilo): moverla no re-renderiza el visor.
  const pintarAvance = useCallback((seg: number, d: number) => {
    const el = barra.current; if (!el) return
    el.style.setProperty('--avance', String(d > 0 ? Math.min(1, Math.max(0, seg / d)) : 0))
    pintado.current = seg
  }, [])

  // ── El reloj: lo que se ve manda; la otra versión lo sigue ──
  // Lee el video y mueve reloj y barra. No depende de requestAnimationFrame: 8 nov 2026, una captura de Daniel mostraba el
  // reloj en 0:16 con el video ya en el ~0:30 (la escena de ese fotograma). Cuando la ventana queda tapada o sin foco, el
  // navegador deja de dar cuadros de animación pero el video sigue sonando; el reloj se leía solo ahí y se quedaba atrás.
  const sincronizar = () => {
    const m = maestro(); if (!m) return
    const ct = m.currentTime
    pos.current = { t: ct, corria: !m.paused }
    if (otroSegundo(tRef.current, ct)) ponerT(ct)
    if (moverBarra(pintado.current, ct, dur, anchoBarra.current)) pintarAvance(ct, dur)
  }
  const ultimoCuadro = useRef(0)
  useEffect(() => {
    let id = 0
    const tic = () => {
      ultimoCuadro.current = performance.now()
      sincronizar()
      const m = maestro()
      if (m && !m.paused && comparando) {
        const el = videos.current[b!]
        const destino = tiempoEnOtra(m.currentTime, durDe(a), durDe(b!), sync)
        if (el && Math.abs(el.currentTime - destino) > 0.12) el.currentTime = destino
      }
      id = requestAnimationFrame(tic)
    }
    id = requestAnimationFrame(tic)
    // Red de seguridad: si hace más de 0.7 s que no hay cuadro de animación, el reloj se lee por temporizador (y por los
    // eventos timeupdate/seeked del propio video, abajo).
    const guardia = window.setInterval(() => { if (performance.now() - ultimoCuadro.current > 700) sincronizar() }, 500)
    return () => { cancelAnimationFrame(id); window.clearInterval(guardia) }
  })

  // Abrir en el tiempo que pidió Levy.
  const aplicado = useRef<number | null>(null)
  useEffect(() => {
    if (tiempoInicial == null || aplicado.current === tiempoInicial) return
    const m = maestro(); if (!m) return
    const poner = () => { m.currentTime = tiempoInicial; ponerT(tiempoInicial); alinear(a, tiempoInicial); aplicado.current = tiempoInicial }
    if (m.readyState >= 1) poner(); else m.addEventListener('loadedmetadata', poner, { once: true })
  }, [tiempoInicial, a, alinear, lista.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const avisar = (texto: string) => { setAviso(texto); window.setTimeout(() => setAviso(x => x === texto ? null : x), 2200) }

  // ── Que nunca se quede congelado en silencio (8 nov 2026) ──
  // «Cargando…» si busca o espera datos más de medio segundo; si falla, qué pasó y «Reintentar» (y un reintento solo, una vez).
  const [espera, setEspera] = useState(false)
  const [falla, setFalla] = useState<string | null>(null)
  const temporizadorEspera = useRef(0), autoReintento = useRef(0), temporizadorFalla = useRef(0)
  const alEmpezarEspera = () => { window.clearTimeout(temporizadorEspera.current); temporizadorEspera.current = window.setTimeout(() => setEspera(true), 500) }
  const alTerminarEspera = () => { window.clearTimeout(temporizadorEspera.current); setEspera(false); setFalla(null); autoReintento.current = 0 }
  useEffect(() => () => { window.clearTimeout(temporizadorEspera.current); window.clearTimeout(temporizadorFalla.current) }, [])
  /** Vuelve a pedir el documento (enlace fresco) y recarga el video en el mismo segundo y con el mismo play. */
  const recuperar = () => {
    const m = maestro(); if (!m) return
    const { t: guardado, corria } = pos.current.t > 0 ? pos.current : { t: m.currentTime, corria: false }
    window.clearTimeout(temporizadorFalla.current)
    setFalla(null); setEspera(true)
    alReintentar?.()
    m.addEventListener('loadedmetadata', () => { try { m.currentTime = guardado } catch { /* sin metadatos */ } if (corria) void m.play().catch(() => undefined) }, { once: true })
    m.load()
  }
  const alFallar = (el: HTMLVideoElement) => {
    window.clearTimeout(temporizadorEspera.current); setEspera(false)
    setFalla(textoFallaVideo(el.error?.code))
    if (autoReintento.current < 1) { autoReintento.current++; temporizadorFalla.current = window.setTimeout(recuperar, 1200) }
  }
  // Si el enlace cambia (el servidor firmó otro), el <video> se recarga solo desde el segundo 0 y en pausa: aquí vuelve al
  // segundo en que estaba y, si corría, sigue corriendo. Corre antes de pintar y de cualquier evento, con lo último visto.
  const urlsVistas = useRef<string[]>([])
  useLayoutEffect(() => {
    lista.forEach((x, i) => {
      const previa = urlsVistas.current[i]; urlsVistas.current[i] = x.url
      if (previa === undefined || previa === x.url || i !== a) return
      const el = videos.current[i], { t: guardado, corria } = pos.current
      if (!el || !(guardado > 0.5)) return
      el.addEventListener('loadedmetadata', () => { try { el.currentTime = guardado } catch { /* sin metadatos */ } if (corria) void el.play().catch(() => undefined) }, { once: true })
    })
  }, [lista]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transporte ──
  const todos = (f: (el: HTMLVideoElement) => void) => mostradas.forEach(i => { const el = videos.current[i]; if (el) f(el) })
  const reproducir = () => { alinear(a, maestro()?.currentTime ?? 0); todos(el => { void el.play().catch(() => undefined) }) }
  const pausar = () => todos(el => el.pause())
  const alternar = () => (maestro()?.paused ?? true) ? reproducir() : pausar()
  const irA = useCallback((seg: number) => {
    const m = maestro(); if (!m) return
    const d = durDe(a) || m.duration || 0
    const destino = Math.min(Math.max(0, seg), d > 0 ? Math.max(0, d - 0.5 / fps) : seg)
    m.currentTime = destino; ponerT(destino); alinear(a, destino)
  }, [a, alinear, durDe, fps, ponerT]) // eslint-disable-line react-hooks/exhaustive-deps
  const fotograma = (pasos: number) => { pausar(); const m = maestro(); if (m) irA(pasoDeFotograma(m.currentTime, fps, pasos, dur)) }
  const velocidad = (x: number) => { setVel(x); lista.forEach((_, i) => { const el = videos.current[i]; if (el) el.playbackRate = x }) }
  useEffect(() => { lista.forEach((_, i) => { const el = videos.current[i]; if (el) { el.playbackRate = vel; el.muted = mudo || i !== a; el.volume = volumen } }) }, [vel, mudo, volumen, a, lista, comparando])
  const alternarSonido = () => { if (mudo) setVolumen(volumenAlOir); setMudo(x => !x) }
  const ponerVolumen = (x: number) => { setVolumen(x); setMudo(x <= 0) }

  const elegirVersion = (i: number) => {
    if (i === a || !lista[i]) return
    const m = maestro(), seg = m?.currentTime ?? 0, corria = !!m && !m.paused
    const destino = tiempoEnOtra(seg, durDe(a), durDe(i), sync)
    const nuevo = videos.current[i]
    if (nuevo) nuevo.currentTime = destino
    if (b === i) setB(null)
    pausar(); setA(i); ponerT(destino)
    if (corria) window.setTimeout(() => { void videos.current[i]?.play().catch(() => undefined) }, 60)
    avisar(lista[i].archivo)
  }
  const alternarLado = () => {
    if (lista.length < 2) return
    setB(comparando ? null : lista.findIndex((_, i) => i !== a))
  }

  // ── Marcas (M): el instante y su nota le llegan a Levy ──
  const marcarAqui = () => { pausar(); setBorrador(maestro()?.currentTime ?? t) }
  const crearMarca = (nota: string, enviarYa: boolean) => {
    if (borrador == null || !actual) return
    const nueva = agregar({ tiempo: borrador, nota: nota.trim(), version: actual.archivo, ruta: actual.ruta })
    if (enviarYa) { enviar([nueva]); avisar('Levy recibió el instante') }
    setBorrador(null); raiz.current?.focus()
  }
  const saltarAMarca = (m: Marca) => {
    const i = lista.findIndex(x => x.ruta === m.ruta)
    if (i >= 0 && i !== a) elegirVersion(i)
    window.setTimeout(() => irA(m.tiempo), i >= 0 && i !== a ? 80 : 0)
  }

  // ── Vista previa bajo el cursor (miniatura + instante), sin React: se mueve con el ratón sin re-renderizar el visor ──
  const moverVista = (clientX: number) => {
    const bar = barra.current, caja = vista.current; if (!bar || !caja || !(dur > 0)) return
    const r = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width)), seg = ratio * dur
    // `left` en px de la interfaz (como el resto del diseño): por eso va el ancho propio de la barra, no el de pantalla.
    const ancho = bar.clientWidth, mitad = caja.offsetWidth / 2
    caja.style.left = `${Math.min(Math.max(ratio * ancho, mitad), Math.max(mitad, ancho - mitad))}px`
    const hoja = miniaturasRef.current, cuadro = cuadroVista.current
    if (hoja && cuadro) { const c = celdaDeMiniatura(hoja, seg), k = escalaRef.current; cuadro.style.backgroundPosition = `-${c.col * hoja.ancho * k}px -${c.fila * hoja.alto * k}px` }
    if (tiempoVista.current) tiempoVista.current.textContent = formatoTiempo(seg)
    caja.dataset.visible = ''
  }
  const ocultarVista = () => { delete vista.current?.dataset.visible }

  // ── Barra de avance: se arrastra con el dedo o el ratón; mientras se arrastra, el video espera ──
  const [arrastrando, setArrastrando] = useState(false)
  const arrastre = useRef<{ corria: boolean } | null>(null)
  const posicion = (x: number) => { const r = barra.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * dur }
  const alBajar = (e: React.PointerEvent) => {
    if (!dur) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { corria: !(maestro()?.paused ?? true) }
    setArrastrando(true); pausar(); irA(posicion(e.clientX)); moverVista(e.clientX)
  }
  const alMover = (e: React.PointerEvent) => { if (arrastre.current) irA(posicion(e.clientX)); moverVista(e.clientX) }
  const alSoltar = () => { if (!arrastre.current) return; if (arrastre.current.corria) reproducir(); arrastre.current = null; setArrastrando(false) }

  // Tras un salto, una pausa, otra versión o la duración que llega: la barra exacta (mientras corre la mueve el reloj).
  useLayoutEffect(() => { pintarAvance(maestro()?.currentTime ?? tRef.current, dur) }, [t, dur, a, reproduciendo, pintarAvance]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pantalla completa ──
  const modoRef = useRef(modo); modoRef.current = modo
  const ventanaYaCompleta = useRef(false)
  /** Marca el visor en uso ANTES de salir del flujo: la vista del hilo no se duerme mientras dure (Cabina.tsx › enUso). */
  const enUso = (si: boolean) => { const el = raiz.current; if (!el) return; if (si) el.dataset.enUso = ''; else delete el.dataset.enUso }
  const entrarVentana = () => {
    const el = raiz.current; if (!el) return
    // Capa superior (popover): escapa de cualquier contenedor del panel sin mover el nodo, así nada se recarga.
    try { el.setAttribute('popover', 'manual'); el.showPopover() } catch { el.removeAttribute('popover') }
    setModo('ventana'); el.focus()
    void ventanaCompleta(true, ya => { ventanaYaCompleta.current = ya })
  }
  const salirVentana = useCallback(() => {
    const el = raiz.current
    try { if (el?.matches(':popover-open')) el.hidePopover() } catch { /* sin popover */ }
    el?.removeAttribute('popover')
    setModo(null); enUso(false)
    if (!ventanaYaCompleta.current) void ventanaCompleta(false)
  }, [])
  const salirPantalla = async () => {
    if (modoRef.current === 'ventana') salirVentana()
    else if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  }
  const alternarPantalla = async () => {
    const el = raiz.current, m = maestro() as VideoWebkit | null
    if (!el || !m) return
    if (modoRef.current) return salirPantalla()
    const via = viaPantallaCompleta({
      elemento: typeof el.requestFullscreen === 'function' && document.fullscreenEnabled !== false,
      tactil: !!window.matchMedia?.('(pointer: coarse)').matches,
      videoNativo: typeof m.webkitEnterFullscreen === 'function',
    })
    enUso(true)
    if (via === 'video') {
      // Quien pide pantalla completa en el teléfono quiere verlo: con sonido (el botón físico lo baja).
      m.muted = false; setMudo(false); setModo('video')
      try { m.webkitEnterFullscreen!() } catch { setModo(null); enUso(false) }
      return
    }
    if (via === 'elemento') {
      try { await el.requestFullscreen(); return } catch { /* WKWebView puede negarla: la capa propia */ }
    }
    entrarVentana()
  }
  useEffect(() => {
    const al = () => {
      const dentro = document.fullscreenElement === raiz.current
      setModo(m => dentro ? 'elemento' : m === 'elemento' ? null : m)
      enUso(dentro || modoRef.current === 'ventana')
    }
    document.addEventListener('fullscreenchange', al); return () => document.removeEventListener('fullscreenchange', al)
  }, [])
  // La nativa del teléfono avisa en el <video>: al salir, el mismo elemento sigue en su segundo.
  useEffect(() => {
    const m = maestro() as VideoWebkit | null; if (!m) return
    const fin = () => { setModo(x => x === 'video' ? null : x); enUso(false) }
    m.addEventListener('webkitendfullscreen', fin)
    return () => m.removeEventListener('webkitendfullscreen', fin)
  }, [a, lista.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // Si el visor se cierra en pantalla completa, la ventana nativa vuelve a su tamaño.
  useEffect(() => () => { if (modoRef.current === 'ventana' && !ventanaYaCompleta.current) void ventanaCompleta(false) }, [])

  // ── En pantalla completa, los controles se van solos (y el cursor) y vuelven al mover o tocar ──
  const [quieto, setQuieto] = useState(false)
  const reposo = useRef(0)
  const sobreMando = useRef(false)
  const despertar = useCallback(() => {
    setQuieto(false)
    window.clearTimeout(reposo.current)
    const dormir = () => {
      if (sobreMando.current || arrastre.current) { reposo.current = window.setTimeout(dormir, OCULTAR_MANDO_MS); return }
      setQuieto(true)
    }
    reposo.current = window.setTimeout(dormir, OCULTAR_MANDO_MS)
  }, [])
  useEffect(() => { if (pantalla && reproduciendo) despertar(); else { window.clearTimeout(reposo.current); setQuieto(false) } }, [pantalla, reproduciendo, despertar])
  useEffect(() => () => window.clearTimeout(reposo.current), [])
  const mandoOculto = pantalla && quieto && borrador == null

  // ── Teclado (Espacio lo reparte espacio.ts: es de este visor si es el último que se tocó a la vista) ──
  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement).closest('textarea, select, input')) return
    if (pantalla) despertar()
    const k = e.key.toLowerCase()
    let hecho = true
    if (k === 'k') pausar()
    else if (k === 'l') { if (maestro()?.paused) { velocidad(1); reproducir() } else velocidad(siguienteVelocidad(vel)); jPulsada.current = 0 }
    else if (k === 'j') { irA((maestro()?.currentTime ?? 0) - saltoAtras(jPulsada.current)); jPulsada.current++ }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // ← → adelantan y atrasan sin parar el video; con Shift, un fotograma (pausa: es para editar).
      const paso = pasoDeFlecha(e.key, e.shiftKey)
      if (paso && 'segundos' in paso) irA((maestro()?.currentTime ?? 0) + paso.segundos)
      else if (paso) fotograma(paso.fotogramas)
    }
    else if (k === 'm') marcarAqui()
    else if (k === 'c') alternarLado()
    else if (k === 'f') void alternarPantalla()
    else if (k === 's') alternarSonido()
    else if (e.key === 'ArrowUp') ponerVolumen(pasoVolumen(mudo ? 0 : volumen, 1))
    else if (e.key === 'ArrowDown') ponerVolumen(pasoVolumen(mudo ? 0 : volumen, -1))
    else if (e.key === 'Escape' && pantalla) void salirPantalla()
    else if (e.key === 'Home') irA(0)
    else if (e.key === 'End') irA(dur)
    else if (e.key === '[') velocidad(VELOCIDADES[Math.max(0, VELOCIDADES.findIndex(x => x >= vel - 1e-6) - 1)])
    else if (e.key === ']') velocidad(VELOCIDADES[Math.min(VELOCIDADES.length - 1, VELOCIDADES.findIndex(x => x >= vel - 1e-6) + 1)])
    else if (/^[1-6]$/.test(e.key)) elegirVersion(Number(e.key) - 1)
    else hecho = false
    // La tecla que usó el visor no sigue: ← → no mueven también el párrafo del lector ni [ esconde la barra lateral.
    if (hecho) { e.preventDefault(); e.stopPropagation(); if (k !== 'j') jPulsada.current = 0 }
  }
  // Safari no enfoca un botón al hacer clic: tras tocar play o la barra el foco quedaba fuera del visor y F, las flechas y Esc no le llegaban.
  const focoAlTocar = (e: React.PointerEvent) => { if (!(e.target as HTMLElement).closest('textarea, input, select')) raiz.current?.focus({ preventScroll: true }) }
  // En pantalla completa propia el foco puede quedar fuera (la capa superior o la ventana nativa lo sueltan): mientras dure, las teclas
  // del visor (Esc, F, flechas) se oyen en la ventana. Dentro del visor ya las oye su propio onKeyDown; Espacio lo reparte espacio.ts.
  const alTecladoRef = useRef(alTeclado); alTecladoRef.current = alTeclado
  useEffect(() => {
    if (!pantalla) return
    const oir = (e: KeyboardEvent) => {
      const r = raiz.current
      if (!r || e.defaultPrevented || e.isComposing || r.contains(e.target as Node)) return
      alTecladoRef.current(e as unknown as React.KeyboardEvent)
    }
    window.addEventListener('keydown', oir, true)
    return () => window.removeEventListener('keydown', oir, true)
  }, [pantalla])
  const alEspacio = useRef(() => {}); alEspacio.current = () => { if (pantalla) despertar(); alternar() }
  const espacio = useRef<VisorConEspacio | null>(null)
  useEffect(() => {
    const yo: VisorConEspacio = { raiz: () => raiz.current, alternar: () => alEspacio.current(), tocado: Date.now() }
    espacio.current = yo
    const baja = registrarVisor(yo)
    return () => { baja(); espacio.current = null }
  }, [])
  const tocar = () => { if (espacio.current) espacio.current.tocado = Date.now() }
  // La velocidad no se repinta con el reloj: callback estable (Velocidad.tsx).
  const velocidadRef = useRef(velocidad); velocidadRef.current = velocidad
  const cambiarVelocidad = useCallback((x: number) => { velocidadRef.current(x) }, [])

  useEffect(() => {
    const el = escenaRef.current; if (!el) return
    const medir = () => {
      const alto = window.visualViewport?.height ?? window.innerHeight, z = zoomUI(), r = raiz.current
      setAnchoEscena(el.clientWidth); setAltoVentana(alto); setZoom(z)
      // El espacio real que queda bajo donde empieza el visor (no una holgura fija): en pantalla completa no aplica. Con el
      // visor en reposo (sin scroll): su escenario crece hasta llenar el panel y los controles quedan pegados al fondo.
      setLibre(r && !modoRef.current ? espacioLibre({ altoVentana: alto, arriba: r.getBoundingClientRect().top, zoom: z, fijo: r.offsetHeight - el.offsetHeight }) : null)
      anchoBarra.current = (barra.current?.clientWidth ?? 0) * (window.devicePixelRatio || 1)
    }
    // `arbrain:ui-zoom`: ⌘+/⌘− cambia el zoom (ZoomController) y con él cuánto mide en pantalla un alto en px.
    medir(); const o = new ResizeObserver(medir); o.observe(el); if (raiz.current) o.observe(raiz.current); if (barra.current) o.observe(barra.current); window.addEventListener('resize', medir); window.addEventListener('arbrain:ui-zoom', medir)
    return () => { o.disconnect(); window.removeEventListener('resize', medir); window.removeEventListener('arbrain:ui-zoom', medir) }
  }, [lista.length])

  // Miniaturas bajo la barra, como YouTube: la hoja la genera el servidor una vez (solo para videos de más de 30 s).
  const miniaturas = useMiniaturas(dur > 30 ? actual?.url : undefined)
  const miniaturasRef = useRef(miniaturas); miniaturasRef.current = miniaturas
  const vista = useRef<HTMLDivElement>(null), cuadroVista = useRef<HTMLElement>(null), tiempoVista = useRef<HTMLElement>(null)
  const escalaVista = pantalla ? 1.5 : 1
  const escalaRef = useRef(escalaVista); escalaRef.current = escalaVista

  if (!actual) return <p className={v.aviso} role="alert">{fallidas[0]?.error ?? 'No se pudo abrir el video.'}</p>
  // El alto sigue a lo que se ve: un horizontal no deja franjas negras enormes; un vertical (los cortos 9:16) toma la pantalla
  // menos sus controles, sin pasarse de ella. Siempre en px de la interfaz (÷ zoom): ver altoDeEscenario.
  const vertical = !comparando && proporcion(actual.sonda) < 0.9
  const hueco = mostradas.length > 1 ? (anchoEscena - 8) / 2 : anchoEscena
  const altoEscena = pantalla || anchoEscena <= 0 ? undefined : altoDeEscenario({ grande: !!grande, vertical, altoVentana, zoom, libre, hueco, proporciones: mostradas.map(i => proporcion(lista[i]?.sonda)) })
  const sobre = { onPointerEnter: () => { sobreMando.current = true }, onPointerLeave: () => { sobreMando.current = false } }
  const Reproducir = reproduciendo ? Pause : Play

  return <div ref={raiz} className={v.video} data-grande={grande || undefined} data-pantalla={pantalla || undefined} data-quieto={mandoOculto || undefined}
    tabIndex={0} onKeyDown={alTeclado} role="group" aria-label={`Video ${actual.archivo}`}
    onPointerMove={pantalla ? despertar : undefined} onFocus={tocar} onPointerDownCapture={e => { tocar(); focoAlTocar(e); if (pantalla) despertar() }}>
    {!pantalla && fallidas.map(f => <p key={f.ruta} className={v.aviso}>{f.archivo}: {f.error}</p>)}
    {lista.length > 1 && <div className={v.versiones} role="tablist" aria-label="Versiones" {...sobre}>
      {lista.map((x, i) => <button key={x.ruta} type="button" role="tab" aria-selected={i === a} data-derecha={comparando && i === b || undefined}
        onClick={() => comparando && i !== a ? setB(i) : elegirVersion(i)} title={`${x.archivo} (${i + 1})`}>{x.archivo.replace(/\.[^.]+$/, '')}</button>)}
      <button type="button" className={v.lado} aria-pressed={comparando} onClick={alternarLado} title="Dos versiones lado a lado (C)"><Columns2 size={14} aria-hidden />Lado a lado</button>
    </div>}

    <div ref={escenaRef} className={v.escena} data-dos={comparando || undefined} style={altoEscena ? { height: altoEscena } : undefined}>
      {lista.map((x, i) => {
        const visible = mostradas.includes(i)
        return <figure key={x.ruta} className={v.cuadro} data-oculto={!visible || undefined} data-maestro={visible && comparando && i === a || undefined} aria-hidden={!visible}>
          {visible && comparando && <figcaption>{x.archivo}</figcaption>}
          <div className={v.pantalla}>
            <video ref={el => { videos.current[i] = el }} src={x.url} muted playsInline preload={visible ? 'auto' : 'metadata'}
              onLoadedMetadata={e => { const dv = e.currentTarget.duration; setDuraciones(d => ({ ...d, [i]: dv })) }}
              onTimeUpdate={() => { if (i === a) sincronizar() }} onSeeked={() => { if (i === a) { sincronizar(); alTerminarEspera() } }}
              onSeeking={() => { if (i === a) alEmpezarEspera() }} onWaiting={() => { if (i === a) alEmpezarEspera() }}
              onPlaying={() => { if (i === a) alTerminarEspera() }} onCanPlay={() => { if (i === a) alTerminarEspera() }}
              onError={e => { if (i === a) alFallar(e.currentTarget) }}
              onPlay={() => i === a && setReproduciendo(true)} onPause={() => i === a && setReproduciendo(false)} onEnded={() => pausar()}
              onClick={() => { raiz.current?.focus({ preventScroll: true }); if (i === a) alternar() }} onDoubleClick={() => void alternarPantalla()} />
          </div>
        </figure>
      })}
      {/* En pausa, la tecla grande al centro: el primer toque del teléfono cae aquí. */}
      {!reproduciendo && !comparando && <button type="button" className={`${tecla.enviar} ${v.teclaCentro}`} onClick={reproducir} aria-label="Reproducir"><Play aria-hidden /></button>}
      {aviso && <div className={v.toast} role="status">{aviso}</div>}
      {espera && !falla && <div className={v.espera} role="status" aria-live="polite"><i aria-hidden /><span>Cargando…</span></div>}
      {falla && <div className={v.falla} role="alert"><span>{falla}</span><button type="button" className={v.secundario} onClick={recuperar}>Reintentar</button></div>}
    </div>

    <div className={v.mando} {...sobre}>
      <div ref={barra} className={v.barraTiempo} data-arrastrando={arrastrando || undefined} role="slider" aria-label="Posición" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} aria-valuetext={formatoTiempo(t)}
        tabIndex={-1} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={e => { alSoltar(); if (e.pointerType !== 'mouse') ocultarVista() }} onPointerCancel={() => { alSoltar(); ocultarVista() }} onPointerLeave={() => { if (!arrastre.current) ocultarVista() }}>
        <i className={v.pista} />
        <i className={v.relleno} />
        {marcas.filter(m => m.ruta === actual.ruta).map(m => <button key={m.id} type="button" className={v.bandera} data-enviada={m.enviada || undefined} style={{ left: `${dur ? (m.tiempo / dur) * 100 : 0}%` }}
          title={`${formatoTiempo(m.tiempo, { fps })} · ${m.nota || 'sin nota'}`} aria-label={`Marca en ${formatoTiempo(m.tiempo)}`} onPointerDown={e => e.stopPropagation()} onClick={() => irA(m.tiempo)} />)}
        <b className={v.perilla} />
        <div ref={vista} className={v.vista} aria-hidden>
          {miniaturas && <i ref={cuadroVista} className={v.vistaCuadro} style={{ width: miniaturas.ancho * escalaVista, height: miniaturas.alto * escalaVista, backgroundImage: `url("${miniaturas.hoja}")`, backgroundSize: `${miniaturas.cols * miniaturas.ancho * escalaVista}px ${miniaturas.filas * miniaturas.alto * escalaVista}px` }} />}
          <b ref={tiempoVista} className={v.vistaTiempo}>0:00</b>
        </div>
      </div>
      <div className={v.controles}>
        <button type="button" className={`${tecla.enviar} ${v.tecla}`} onClick={alternar} aria-label={reproduciendo ? 'Pausar' : 'Reproducir'} title="Reproducir o pausar (espacio)"><Reproducir aria-hidden /></button>
        <span className={v.tiempo}><b>{formatoTiempo(t)}</b><i> / {formatoTiempo(dur)}</i></span>
        <span className={v.empuje} aria-hidden />
        <BotonVelocidad vel={vel} alCambiar={cambiarVelocidad} atajos="L acelera" />
        <button type="button" className={v.icono} aria-pressed={!mudo} onClick={alternarSonido} aria-label={mudo ? 'Activar sonido' : 'Silenciar'} title="Sonido (S): abre silenciado">{mudo ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}</button>
        <button type="button" className={v.icono} onClick={() => void alternarPantalla()} aria-label={pantalla ? 'Salir de pantalla completa' : 'Pantalla completa'} title={pantalla ? 'Salir (F o Esc)' : 'Pantalla completa (F)'}>{pantalla ? <Minimize aria-hidden /> : <Maximize aria-hidden />}</button>
      </div>
    </div>

    {borrador != null && <div className={v.sitioComposer} {...sobre}><ComposerMarca tiempo={borrador} fps={fps} version={actual.archivo} alEnviar={nota => crearMarca(nota, true)} alGuardar={nota => crearMarca(nota, false)} alCerrar={() => { setBorrador(null); raiz.current?.focus() }} /></div>}
    {!pantalla && marcas.length > 0 && <ListaMarcas marcas={marcas} fps={fps} versionActual={actual.archivo} alSaltar={saltarAMarca} alQuitar={quitar} alEnviar={ms => { enviar(ms); avisar(ms.length > 1 ? `Levy recibió ${ms.length} instantes` : 'Levy recibió el instante') }} />}
  </div>
}
