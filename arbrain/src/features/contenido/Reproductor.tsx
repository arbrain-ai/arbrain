'use client'
/**
 * Reproductor del cuartel (15 nov 2026). El video se reproduce EN YouTube (incrustado, `www.youtube.com` para que una
 * sesión con Premium valga); Arbrain solo lo enmarca. Lo que YouTube pone para engancharte se tapa con velos propios:
 * al pausar (su repisa de «más videos») y al terminar (su pantalla final de recomendaciones). Sin comentarios: el
 * incrustado no los trae. `rel=0` deja las sugerencias, si alguna se cuela, solo del mismo canal.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { ESPERA_ARRANQUE_MS, motivoNoArranca, type MotivoNoArranca } from './modelo'
import s from './cuartel.module.css'

type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allow: boolean): void; getCurrentTime(): number; getDuration(): number
  destroy(): void; getPlayerState(): number; setPlaybackRate(r: number): void; getPlaybackRate(): number
}
type YTNs = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer; PlayerState: Record<string, number> }
declare global { interface Window { YT?: YTNs; onYouTubeIframeAPIReady?: () => void } }

let cargaApi: Promise<YTNs> | null = null
function apiYouTube(): Promise<YTNs> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin ventana'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  cargaApi ??= new Promise((res, rej) => {
    const previo = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previo?.(); if (window.YT) res(window.YT) }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    tag.onerror = () => { cargaApi = null; rej(new Error('No cargó el reproductor de YouTube.')) }
    document.head.appendChild(tag)
  })
  return cargaApi
}

function silencioDePrueba() { try { return localStorage.getItem('cuartel:silencio') === '1' } catch { return false } }

export interface ControlReproductor { ir(s: number): void; tiempo(): number; duracion(): number; pausar(): void; reproducir(): void; velocidad(r: number): void }
export type EstadoReproductor = 'cargando' | 'listo' | 'sonando' | 'pausa' | 'fin' | 'error'

const ERRORES: Record<number, string> = {
  2: 'El video no es válido.', 5: 'El reproductor falló en este navegador.', 100: 'El video ya no existe o es privado.',
  101: 'El creador no deja incrustar este video.', 150: 'El creador no deja incrustar este video.', 153: 'YouTube rechazó el incrustado (falta el origen).',
}

export const Reproductor = forwardRef<ControlReproductor, {
  videoId: string
  inicio?: number | null
  titulo: string
  alTerminar?: () => void
  alTiempo?: (s: number) => void
  /** El creador no deja incrustarlo (errores 101/150): quien lo enmarca ofrece verlo descargado. */
  alNoIncrustable?: () => void
  /**
   * No arrancó en `ESPERA_ARRANQUE_MS` o YouTube devolvió un error: quien lo enmarca ofrece verlo descargado ahí mismo.
   * Nunca se manda a youtube.com (en el teléfono de Daniel la app y el sitio están cerrados a propósito).
   */
  alNoArranca?: (motivo: MotivoNoArranca, detalle?: string) => void
  /** Cada cambio de estado (16 nov 2026: la barra propia de la sala pinta play/pausa con esto). */
  alEstado?: (e: EstadoReproductor) => void
  final?: React.ReactNode
}>(function Reproductor({ videoId, inicio, titulo, alTerminar, alTiempo, alNoIncrustable, alNoArranca, alEstado, final }, ref) {
  const caja = useRef<HTMLDivElement>(null)
  const jugador = useRef<YTPlayer | null>(null)
  const [estado, setEstado] = useState<EstadoReproductor>('cargando')
  const [error, setError] = useState<string | null>(null)
  const alTerminarRef = useRef(alTerminar), alTiempoRef = useRef(alTiempo), alNoIncRef = useRef(alNoIncrustable), alNoArrRef = useRef(alNoArranca)
  const alEstadoRef = useRef(alEstado)
  useEffect(() => { alTerminarRef.current = alTerminar; alTiempoRef.current = alTiempo; alNoIncRef.current = alNoIncrustable; alNoArrRef.current = alNoArranca; alEstadoRef.current = alEstado })
  useEffect(() => { alEstadoRef.current?.(estado) }, [estado])

  useImperativeHandle(ref, () => ({
    ir: (t: number) => { const p = jugador.current; if (!p) return; p.seekTo(Math.max(0, t), true); p.playVideo() },
    tiempo: () => jugador.current?.getCurrentTime?.() ?? 0,
    duracion: () => jugador.current?.getDuration?.() ?? 0,
    pausar: () => jugador.current?.pauseVideo?.(),
    reproducir: () => jugador.current?.playVideo?.(),
    velocidad: (r: number) => jugador.current?.setPlaybackRate?.(r),
  }), [])

  useEffect(() => {
    let vivo = true, reloj = 0, apiCargada = false, arranco = false
    setEstado('cargando'); setError(null)
    const destino = document.createElement('div')
    caja.current?.replaceChildren(destino)
    const fallar = (motivo: MotivoNoArranca, detalle?: string) => {
      if (!vivo) return
      clearTimeout(vigia)
      if (alNoArrRef.current) { alNoArrRef.current(motivo, detalle); return }
      setEstado('error'); setError(detalle ?? (motivo === 'sin-api' ? 'Este dispositivo no alcanza youtube.com.' : 'YouTube no contestó a tiempo.'))
    }
    // Vigía (15 nov 2026, PWA del iPhone): si YouTube no dice «listo» en 8 s, no se gira para siempre.
    const vigia = window.setTimeout(() => { if (!arranco) fallar(motivoNoArranca(apiCargada)) }, ESPERA_ARRANQUE_MS)
    apiYouTube().then(YT => {
      if (!vivo) return
      apiCargada = true
      jugador.current = new YT.Player(destino, {
        videoId, host: 'https://www.youtube.com', width: '100%', height: '100%',
        // `origin` y `widget_referrer` dicen a YouTube quién incrusta (sin eso responde el error 153); `playsinline` evita
        // que el iPhone salte a pantalla completa nativa.
        playerVars: { rel: 0, playsinline: 1, iv_load_policy: 3, autoplay: 1, enablejsapi: 1, origin: window.location.origin, widget_referrer: window.location.origin + '/', start: Math.max(0, Math.floor(inicio ?? 0)), color: 'white',
          // Pruebas sin bocinas (regla del Studio: nada suena): `localStorage['cuartel:silencio'] = '1'` arranca en mute.
          ...(silencioDePrueba() ? { mute: 1 } : {}) },
        events: {
          onReady: () => { if (!vivo) return; arranco = true; clearTimeout(vigia); setEstado('listo') },
          onError: (e: { data: number }) => {
            if (!vivo) return
            arranco = true; clearTimeout(vigia)
            if ((e.data === 101 || e.data === 150) && alNoIncRef.current) { alNoIncRef.current(); return }
            fallar('error', ERRORES[e.data] ?? `YouTube devolvió el error ${e.data}.`)
          },
          onStateChange: (e: { data: number }) => {
            if (!vivo) return
            if (!arranco) { arranco = true; clearTimeout(vigia) }
            if (e.data === 1) setEstado('sonando')
            else if (e.data === 2) setEstado('pausa')
            else if (e.data === 0) { setEstado('fin'); alTerminarRef.current?.() }
          },
        },
      })
      reloj = window.setInterval(() => { const t = jugador.current?.getCurrentTime?.(); if (typeof t === 'number') alTiempoRef.current?.(t) }, 500)
    }).catch(() => fallar('sin-api'))
    return () => { vivo = false; clearInterval(reloj); clearTimeout(vigia); try { jugador.current?.destroy() } catch { /* ya no estaba */ } jugador.current = null }
    // `inicio` solo cuenta al nacer el reproductor; luego se salta con `ir`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return <div className={s.pantalla} data-estado={estado}>
    <div ref={caja} className={s.marco} aria-label={`Reproductor: ${titulo}`} />
    {estado === 'cargando' && <div className={s.velo} aria-hidden><span className={s.respira} /></div>}
    {estado === 'pausa' && <button className={`${s.velo} ${s.veloPausa}`} onClick={() => jugador.current?.playVideo()} aria-label="Seguir viendo">
      <span className={s.botonPlay}><Play size={26} fill="currentColor" /></span><small>En pausa · sin sugerencias de YouTube</small>
    </button>}
    {estado === 'fin' && <div className={`${s.velo} ${s.veloFin}`}>
      {final ?? <p className={s.finTexto}>Terminaste este.</p>}
      <button className={s.repetir} onClick={() => { jugador.current?.seekTo(0, true); jugador.current?.playVideo() }}><RotateCcw size={13} /> Otra vez</button>
    </div>}
    {estado === 'error' && <div className={`${s.velo} ${s.veloFin}`}>
      <p className={s.finTexto}>{error}</p>
    </div>}
  </div>
})
