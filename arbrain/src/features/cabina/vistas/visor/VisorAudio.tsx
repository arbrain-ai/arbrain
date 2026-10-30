'use client'
/**
 * Visor de audio (8 oct 2026): la forma de onda es el mapa. Se decodifica en el navegador (hasta 120 MB) y se dibuja una
 * sola vez en barras; clic o arrastre para ir a un punto, las mismas marcas con comentario que en video (el instante viaja
 * a Levy como `tiempo`). Abre pausado: un audio nunca suena solo.
 */
import { useEffect, useRef, useState } from 'react'
import { Flag, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { VELOCIDADES, formatoTiempo, siguienteVelocidad, saltoAtras } from '../../documento/medio'
import { ComposerMarca, ListaMarcas, useMarcas } from './Marcas'
import v from './visor.module.css'

const BARRAS = 220
const MAX_BYTES = 120 * 1024 * 1024

/** Picos por barra de un archivo de audio. null si no se pudo decodificar (el reproductor sigue funcionando sin forma). */
async function picos(url: string): Promise<number[] | null> {
  try {
    const r = await fetch(url)
    const largo = Number(r.headers.get('content-length') ?? 0)
    if (largo > MAX_BYTES) return null
    const buf = await r.arrayBuffer()
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    try {
      const audio = await ctx.decodeAudioData(buf)
      const canal = audio.getChannelData(0), paso = Math.max(1, Math.floor(canal.length / BARRAS))
      const out: number[] = []
      for (let i = 0; i < BARRAS; i++) {
        let max = 0
        const ini = i * paso, fin = Math.min(canal.length, ini + paso)
        for (let j = ini; j < fin; j += Math.max(1, Math.floor(paso / 64))) max = Math.max(max, Math.abs(canal[j]))
        out.push(max)
      }
      const tope = Math.max(...out, 0.001)
      return out.map(x => x / tope)
    } finally { void ctx.close() }
  } catch { return null }
}

export function VisorAudio({ url, ruta, archivo, tiempoInicial, clave }: { url: string; ruta: string; archivo: string; tiempoInicial?: number; clave: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const barra = useRef<HTMLDivElement>(null)
  const [onda, setOnda] = useState<number[] | null | undefined>(undefined)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [suena, setSuena] = useState(false)
  const [vel, setVel] = useState(1)
  const [borrador, setBorrador] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const jPulsada = useRef(0)
  const { marcas, agregar, quitar, enviar } = useMarcas(clave, 'Audio')

  useEffect(() => { let vivo = true; setOnda(undefined); picos(url).then(p => { if (vivo) setOnda(p) }); return () => { vivo = false } }, [url])
  useEffect(() => {
    let id = 0
    const tic = () => { const a = audio.current; if (a) setT(prev => Math.abs(prev - a.currentTime) > 0.03 ? a.currentTime : prev); id = requestAnimationFrame(tic) }
    id = requestAnimationFrame(tic); return () => cancelAnimationFrame(id)
  }, [])
  const aplicado = useRef<number | null>(null)
  useEffect(() => {
    const a = audio.current; if (!a || tiempoInicial == null || aplicado.current === tiempoInicial) return
    const poner = () => { a.currentTime = tiempoInicial; aplicado.current = tiempoInicial }
    if (a.readyState >= 1) poner(); else a.addEventListener('loadedmetadata', poner, { once: true })
  }, [tiempoInicial, url])

  const irA = (s: number) => { const a = audio.current; if (!a) return; a.currentTime = Math.min(Math.max(0, s), a.duration || s); setT(a.currentTime) }
  const alternar = () => { const a = audio.current; if (!a) return; if (a.paused) void a.play().catch(() => undefined); else a.pause() }
  const velocidad = (x: number) => { setVel(x); if (audio.current) audio.current.playbackRate = x }
  const posicion = (e: { clientX: number }) => { const r = barra.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur }
  const arrastrando = useRef(false)
  const toast = (x: string) => { setAviso(x); window.setTimeout(() => setAviso(y => y === x ? null : y), 2200) }
  const marcarAqui = () => { audio.current?.pause(); setBorrador(audio.current?.currentTime ?? t) }
  const crear = (nota: string, enviarYa: boolean) => {
    if (borrador == null) return
    const m = agregar({ tiempo: borrador, nota: nota.trim(), version: archivo, ruta })
    if (enviarYa) { enviar([m]); toast('Levy recibió el instante') }
    setBorrador(null); raiz.current?.focus()
  }
  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select')) return
    const k = e.key.toLowerCase(); let hecho = true
    if (k === ' ') alternar()
    else if (k === 'k') audio.current?.pause()
    else if (k === 'l') { if (audio.current?.paused) { velocidad(1); alternar() } else velocidad(siguienteVelocidad(vel)); jPulsada.current = 0 }
    else if (k === 'j') { irA((audio.current?.currentTime ?? 0) - saltoAtras(jPulsada.current)); jPulsada.current++ }
    else if (e.key === 'ArrowRight') irA((audio.current?.currentTime ?? 0) + (e.shiftKey ? 10 : 1))
    else if (e.key === 'ArrowLeft') irA((audio.current?.currentTime ?? 0) - (e.shiftKey ? 10 : 1))
    else if (k === 'm') marcarAqui()
    else if (e.key === 'Home') irA(0)
    else hecho = false
    if (hecho) { e.preventDefault(); if (k !== 'j') jPulsada.current = 0 }
  }
  const frac = dur ? t / dur : 0
  const marcasAqui = marcas.filter(m => m.ruta === ruta)

  return <div ref={raiz} className={v.audio} tabIndex={0} onKeyDown={alTeclado} role="group" aria-label={`Audio ${archivo}`}>
    <audio ref={audio} src={url} preload="metadata" onLoadedMetadata={e => { const dv = e.currentTarget.duration; setDur(dv) }} onPlay={() => setSuena(true)} onPause={() => setSuena(false)} onEnded={() => setSuena(false)} />
    <div ref={barra} className={v.onda} role="slider" aria-label="Posición" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
      onPointerDown={e => { if (!dur) return; e.currentTarget.setPointerCapture(e.pointerId); arrastrando.current = true; irA(posicion(e)) }}
      onPointerMove={e => { if (arrastrando.current) irA(posicion(e)) }} onPointerUp={() => { arrastrando.current = false }}>
      {onda === undefined && <span className={v.ondaEstado}>Dibujando la forma de onda…</span>}
      {onda === null && <span className={v.ondaEstado}>Sin forma de onda (archivo muy grande o formato que el navegador no decodifica)</span>}
      {onda && <div className={v.barras} aria-hidden>{onda.map((p, i) => <i key={i} data-pasado={i / onda.length < frac || undefined} style={{ height: `${Math.max(4, p * 100)}%` }} />)}</div>}
      {marcasAqui.map(m => <button key={m.id} type="button" className={v.bandera} data-enviada={m.enviada || undefined} style={{ left: dur ? `${(m.tiempo / dur) * 100}%` : 0 }} title={`${formatoTiempo(m.tiempo)} · ${m.nota || 'sin nota'}`}
        onPointerDown={e => e.stopPropagation()} onClick={() => irA(m.tiempo)}><Flag size={11} aria-hidden /></button>)}
      <b className={v.cabeza} style={{ left: `${frac * 100}%` }} />
    </div>
    <div className={v.controles}>
      <button type="button" className={v.icono} onClick={() => irA(t - 5)} aria-label="Atrás 5 segundos"><SkipBack size={15} aria-hidden /></button>
      <button type="button" className={v.reproducir} onClick={alternar} aria-label={suena ? 'Pausar' : 'Reproducir'}>{suena ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}</button>
      <button type="button" className={v.icono} onClick={() => irA(t + 5)} aria-label="Adelante 5 segundos"><SkipForward size={15} aria-hidden /></button>
      <span className={v.tiempo}><b>{formatoTiempo(t, { fotogramas: false })}</b><i> / {formatoTiempo(dur)}</i></span>
      <label className={v.velocidad}><select value={vel} onChange={e => velocidad(Number(e.target.value))} aria-label="Velocidad">{VELOCIDADES.map(x => <option key={x} value={x}>{x}×</option>)}</select></label>
      <button type="button" className={v.marcar} onClick={marcarAqui} title="Marcar este instante (M)"><Flag size={13} aria-hidden />Marcar aquí</button>
    </div>
    {aviso && <div className={v.toast} role="status" data-fijo>{aviso}</div>}
    {borrador != null && <ComposerMarca tiempo={borrador} fps={30} version={archivo} alEnviar={n => crear(n, true)} alGuardar={n => crear(n, false)} alCerrar={() => { setBorrador(null); raiz.current?.focus() }} />}
    <ListaMarcas marcas={marcas} fps={30} versionActual={archivo} alSaltar={m => irA(m.tiempo)} alQuitar={quitar} alEnviar={ms => { enviar(ms); toast(ms.length > 1 ? `Levy recibió ${ms.length} instantes` : 'Levy recibió el instante') }} />
    <p className={v.ayuda}>Espacio reproduce · ← → 1 s (Mayús 10 s) · J K L · M marca</p>
  </div>
}
