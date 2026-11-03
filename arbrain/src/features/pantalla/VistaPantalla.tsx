'use client'
/**
 * «Pantalla de tu servidor» (modo servidor, 1 nov 2026; docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md).
 *
 * La persona MIRA en vivo la pantalla virtual donde trabaja Levy (Chrome en Xvfb, en su servidor), desde su Arbrain o
 * su teléfono. Solo mirar: esta vista no manda clics, teclas ni texto. Cada cuadro es un JPEG que se pide a
 * `/api/manos/pantalla/captura` con la misma sesión que el resto de la web; sin sesión, 401. Nada de esto abre un
 * puerto: la web sigue en 127.0.0.1 y al teléfono llega por `tailscale serve` (su red privada).
 *
 * Ritmo: un cuadro tras otro (nunca dos a la vez), ~2 por segundo con la pestaña a la vista; en pausa con la pestaña
 * oculta (el teléfono no gasta datos ni batería) y cada 5 s mientras la pantalla está apagada.
 */
import { useEffect, useRef, useState } from 'react'
import { MonitorPlay, Pause, Play } from 'lucide-react'

interface Estado {
  instalada: boolean
  encendida?: boolean
  /** Memoria proporcional (PSS) de la pantalla y del navegador. */
  memoria_mb?: { pantalla: number; navegador: number }
  sin_uso_s?: number | null
  apaga_tras_s?: number
  ventanas?: number
  error?: string
}

type Fase = 'cargando' | 'viva' | 'apagada' | 'sin_pantalla' | 'error'

const PAUSA_VIVA_MS = 450
const PAUSA_APAGADA_MS = 5000

function minutos(s?: number | null): string {
  if (s == null) return ''
  return s < 60 ? 'hace un momento' : `hace ${Math.round(s / 60)} min`
}

export function VistaPantalla() {
  const [fase, setFase] = useState<Fase>('cargando')
  const [src, setSrc] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pausada, setPausada] = useState(false)
  const [cuadros, setCuadros] = useState(0)
  // En el teléfono la pantalla (1440×900) se ve chica en vertical: un toque la abre a pantalla completa (gira el
  // teléfono para verla en horizontal); otro toque la cierra.
  const [grande, setGrande] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const anterior = useRef<string | null>(null)

  // Cuadros: uno tras otro, mientras la pestaña está a la vista y no está en pausa.
  useEffect(() => {
    if (pausada) return
    let vivo = true
    let reloj: ReturnType<typeof setTimeout> | null = null
    const siguiente = (ms: number) => { if (vivo) reloj = setTimeout(pedir, ms) }
    async function pedir() {
      if (!vivo) return
      if (document.visibilityState !== 'visible') return siguiente(1000)
      const ancho = Math.min(1440, Math.max(480, Math.round((caja.current?.clientWidth ?? 1080) * (window.devicePixelRatio || 1))))
      try {
        const r = await fetch(`/api/manos/pantalla/captura?ancho=${ancho}&calidad=60&t=${Date.now()}`, { cache: 'no-store' })
        if (r.status === 204) { setFase('apagada'); return siguiente(PAUSA_APAGADA_MS) }
        if (r.status === 404) { setFase('sin_pantalla'); return }
        if (r.status === 401) { window.location.href = '/sin-sesion'; return }
        if (!r.ok) {
          const j = await r.json().catch(() => ({})) as { error?: string }
          setError(j.error ?? `La pantalla no respondió (${r.status}).`); setFase('error')
          return siguiente(PAUSA_APAGADA_MS)
        }
        const url = URL.createObjectURL(await r.blob())
        if (!vivo) { URL.revokeObjectURL(url); return }
        if (anterior.current) URL.revokeObjectURL(anterior.current)
        anterior.current = url
        setSrc(url); setFase('viva'); setError(null); setCuadros(n => n + 1)
        siguiente(PAUSA_VIVA_MS)
      } catch {
        setError('Tu Arbrain no respondió.'); setFase('error'); siguiente(PAUSA_APAGADA_MS)
      }
    }
    void pedir()
    return () => { vivo = false; if (reloj) clearTimeout(reloj) }
  }, [pausada])

  // Estado (memoria, minutos sin uso) cada 10 s.
  useEffect(() => {
    let vivo = true
    const leer = () => fetch('/api/manos/pantalla', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (vivo && j) setEstado(j) }).catch(() => {})
    void leer()
    const t = setInterval(leer, 10_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  useEffect(() => () => { if (anterior.current) URL.revokeObjectURL(anterior.current) }, [])

  const memoria = estado?.memoria_mb ? Math.round(estado.memoria_mb.pantalla + estado.memoria_mb.navegador) : null

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MonitorPlay size={18} className="shrink-0 text-foreground/70" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground/90">Pantalla de tu servidor</h1>
            <p className="text-xs text-muted">
              Solo mirar · {fase === 'viva' ? 'en vivo' : fase === 'apagada' ? 'apagada' : fase === 'cargando' ? 'conectando…' : fase === 'sin_pantalla' ? 'sin pantalla virtual' : 'sin señal'}
              {memoria != null && estado?.encendida ? ` · ${memoria} MB` : ''}
              {estado?.encendida && estado.sin_uso_s != null ? ` · último uso ${minutos(estado.sin_uso_s)}` : ''}
            </p>
          </div>
        </div>
        {fase !== 'sin_pantalla' && (
          <button
            type="button"
            onClick={() => setPausada(p => !p)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-foreground/80 hover:bg-foreground/5"
            aria-label={pausada ? 'Reanudar la vista' : 'Pausar la vista'}
          >
            {pausada ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            {pausada ? 'Reanudar' : 'Pausar'}
          </button>
        )}
      </header>

      <div ref={caja} className="solid-card relative w-full overflow-hidden" style={{ aspectRatio: '1440 / 900' }}>
        {src && fase !== 'sin_pantalla' && (
          <button type="button" onClick={() => setGrande(true)} className="block h-full w-full cursor-zoom-in" aria-label="Ver la pantalla en grande">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Lo que se ve ahora en la pantalla virtual de tu servidor" className={`h-full w-full object-contain ${fase === 'viva' ? '' : 'opacity-40'}`} draggable={false} />
          </button>
        )}
        {fase !== 'viva' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="max-w-sm text-sm leading-snug text-muted">
              {fase === 'cargando' && 'Conectando con la pantalla de tu servidor…'}
              {fase === 'apagada' && 'La pantalla está apagada. Se enciende sola cuando Levy la usa (por ejemplo, cuando le pides abrir un sitio) y se apaga tras un rato sin uso.'}
              {fase === 'sin_pantalla' && 'Este Arbrain no tiene pantalla virtual. En tu servidor se instala con: bash arbrain/scripts/instalar/nube.sh pantalla'}
              {fase === 'error' && (error ?? 'Sin señal de la pantalla.')}
            </p>
          </div>
        )}
      </div>

      {grande && src && (
        <button type="button" onClick={() => setGrande(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-1" aria-label="Cerrar la vista grande">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="La pantalla virtual de tu servidor, en grande" className="max-h-full max-w-full object-contain" draggable={false} />
        </button>
      )}

      <p className="text-xs leading-snug text-muted">
        Toca la imagen para verla en grande. Lo que ves aquí solo viaja por tu red privada (Tailscale) y con tu sesión. Levy no puede enviar, pagar, borrar ni
        publicar sin tu pedido en el chat{cuadros > 0 ? '' : '.'}{cuadros > 0 ? `. Cuadros recibidos: ${cuadros}.` : ''}
      </p>
    </main>
  )
}
