'use client'
/**
 * El reproductor COMPUESTO (vuelta 2, 19 nov 2026): lo que está en las pistas se ve y se oye junto, igual que saldrá en
 * el export, porque lo compone el motor mismo (`cut-playback-file`: render de 12 s del corte, con caché por segmento; el
 * motor solo vuelve a renderizar lo que cambió). Dos `<video>` alternados: mientras uno suena, el otro ya tiene cargado el
 * tramo siguiente, así no hay hueco entre tramos. Mide el tiempo de clic a imagen (lo enseña el sello y queda en
 * `data-latencia` para las pruebas).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BASE, motor } from './cliente'

export const VENTANA = 12
interface Tramo { k: number; start: number; end: number; url: string }

export function useCompuesto(o: { proyecto: string; version: string | null; duracion: number; activo: boolean; alTiempo: (t: number) => void; alError: (m: string) => void }) {
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null)
  const [activo, setActivo] = useState<0 | 1>(0)
  const [sonando, setSonando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [latencia, setLatencia] = useState<number | null>(null)
  const cache = useRef(new Map<string, Promise<Tramo>>())
  const st = useRef({ actual: null as Tramo | null, siguiente: null as Tramo | null, activo: 0 as 0 | 1, quiereSonar: false, version: o.version })
  const videos = () => [a.current, b.current] as const
  const op = useRef(o); op.current = o

  // Cambió la versión (una edición, una decisión): lo cargado ya no vale.
  useEffect(() => { st.current.version = o.version; st.current.siguiente = null }, [o.version])

  const tramo = useCallback((k: number): Promise<Tramo> => {
    const v = st.current.version
    const key = `${v}:${k}`
    let p = cache.current.get(key)
    if (!p) {
      const ini = k * VENTANA, fin = Math.min(op.current.duracion, ini + VENTANA)
      p = motor.tramo(op.current.proyecto, v ?? 'head', ini, fin).then(r => ({ k, start: r.start, end: r.end, url: `${BASE}/renders/${r.renderId}/file?wait=1` }))
      p.catch(() => cache.current.delete(key))
      cache.current.set(key, p)
    }
    return p
  }, [])

  const cargarEn = (v: HTMLVideoElement, t: Tramo, en: number) => new Promise<void>(res => {
    // Si `seeked` no llega (WebKit no siempre lo da al buscar el mismo instante), sigue igual a los 5 s.
    const plazo = setTimeout(() => listo(), 5000)
    const listo = () => { clearTimeout(plazo); v.removeEventListener('seeked', listo); res() }
    const poner = () => { v.removeEventListener('loadedmetadata', poner); v.addEventListener('seeked', listo); v.currentTime = Math.max(0, en - t.start) }
    if (v.getAttribute('src') !== t.url) { v.addEventListener('loadedmetadata', poner); v.src = t.url; v.load() } else poner()
  })

  const precargar = useCallback(async (k: number) => {
    if (k * VENTANA >= op.current.duracion) { st.current.siguiente = null; return }
    try {
      const t = await tramo(k)
      const otro = videos()[st.current.activo === 0 ? 1 : 0]
      if (!otro) return
      st.current.siguiente = t
      await cargarEn(otro, t, k * VENTANA)
    } catch { /* se pide al llegar */ }
  }, [tramo])

  /** Ir al instante `t` del corte (segundos). */
  const buscar = useCallback(async (t: number, tocar?: boolean) => {
    const t0 = performance.now()
    const k = Math.max(0, Math.floor(Math.min(t, op.current.duracion - 0.05) / VENTANA))
    setCargando(true)
    try {
      const tr = await tramo(k)
      const v = videos()[st.current.activo]
      if (!v) return
      const sonaba = tocar ?? st.current.quiereSonar
      v.pause()
      await cargarEn(v, tr, t)
      st.current.actual = tr
      setLatencia(Math.round(performance.now() - t0))
      op.current.alTiempo(t)
      if (sonaba) { st.current.quiereSonar = true; await v.play().catch(() => {}) }
      void precargar(k + 1)
    } catch (e) {
      op.current.alError(`El motor no pudo componer este tramo: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setCargando(false) }
  }, [tramo, precargar])

  const tocar = useCallback((si?: boolean) => {
    const v = videos()[st.current.activo]
    if (!v) return
    const quiere = si ?? v.paused
    st.current.quiereSonar = quiere
    if (quiere) { if (!st.current.actual) void buscar(0, true); else void v.play().catch(() => {}) } else v.pause()
  }, [buscar])

  // El reloj: el tiempo del corte es el inicio del tramo + el del video; al final del tramo, el otro video toma la posta.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = st.current, v = videos()[s.activo]
      if (v && s.actual && !v.paused) {
        const t = s.actual.start + v.currentTime
        const fin = (s.actual.k + 1) * VENTANA
        if (t >= fin - 0.03 || v.ended) {
          const sig = s.siguiente, otro = videos()[s.activo === 0 ? 1 : 0]
          if (sig && sig.k === s.actual.k + 1 && otro) {
            v.pause(); s.activo = s.activo === 0 ? 1 : 0; setActivo(s.activo); s.actual = sig; s.siguiente = null
            void otro.play().catch(() => {}); void precargar(sig.k + 1)
          } else if (fin >= op.current.duracion - 0.05) { v.pause(); s.quiereSonar = false }
          else { void buscar(fin, true) }
        } else op.current.alTiempo(t)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [buscar, precargar])

  useEffect(() => {
    const vs = videos().filter(Boolean) as HTMLVideoElement[]
    const on = () => setSonando(vs.some(v => !v.paused)), off = on
    vs.forEach(v => { v.addEventListener('play', on); v.addEventListener('pause', off) })
    return () => vs.forEach(v => { v.removeEventListener('play', on); v.removeEventListener('pause', off) })
  }, [])
  // Al apagarse (vista Toma), se calla.
  useEffect(() => { if (!o.activo) videos().forEach(v => v?.pause()) }, [o.activo])
  const velocidad = useCallback((x: number) => videos().forEach(v => { if (v) v.playbackRate = x }), [])

  const elementos = <>
    <video ref={a} playsInline preload="auto" data-testid="video-compuesto" style={{ display: o.activo && activo === 0 ? 'block' : 'none' }} />
    <video ref={b} playsInline preload="auto" style={{ display: o.activo && activo === 1 ? 'block' : 'none' }} />
  </>
  return { elementos, buscar, tocar, sonando, cargando, latencia, velocidad }
}
