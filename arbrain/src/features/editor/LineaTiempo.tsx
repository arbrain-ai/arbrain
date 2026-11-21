'use client'
/**
 * La línea de tiempo del editor: el eje es la TOMA (como la sala vieja). Cada pista en su fila (subtítulos, gráficos,
 * pantalla, cámara con su onda, SFX, música); lo que el corte quitó, en rojo donde estaba (clic = escucharlo); las
 * llamadas que esperan al dueño, en ámbar con su número. Rueda = desplazar; ⌘/pellizco + rueda = zoom anclado al cursor.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { desplazar, formato, xEnMaqueta, zoomAnclado, type ClasePista, type Pieza, type Vista } from './modelo'
import type { TramoT } from './tipos'
import s from './editor.module.css'

export interface FilaLinea { id: string; clase: ClasePista; nombre: string; clips: { id: string; etiqueta: string; tramos: TramoT[] }[] }
export interface LlamadaEnLinea { numero: number; tramo: TramoT; decidida?: 'cut' | 'keep' }

const NOMBRE_ANCHO = 96


export function LineaTiempo(p: {
  duracion: number; toma: number; piezas: Pieza[]; cortes: TramoT[]; filas: FilaLinea[]; picos: number[] | null
  llamadas: LlamadaEnLinea[]; abierta: number | null; marcadores: { id: string; toma: number; texto: string }[]
  elegidas: number[]; clipElegido: string | null
  alBuscar: (toma: number) => void; alCorte: (r: TramoT) => void; alPieza: (i: number, sumar: boolean) => void
  alLlamada: (n: number) => void; alClip: (id: string) => void
  /** Soltar un borde de lo rojo en otro instante de la toma. */
  alBorde?: (rojo: TramoT, borde: 'inicio' | 'fin', nuevo: number) => void
}) {
  const [arrastre, setArrastre] = useState<{ rojo: TramoT; borde: 'inicio' | 'fin'; t: number } | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(1000)
  const [vista, setVista] = useState<Vista>({ inicio: 0, pxPorSeg: 8 })
  const ajustada = useRef(false)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(Math.max(200, el.clientWidth - NOMBRE_ANCHO)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // La primera vez (y si cambia la toma): toda la toma a la vista.
  useEffect(() => {
    if (p.duracion > 0 && (!ajustada.current || vista.pxPorSeg < ancho / p.duracion)) { ajustada.current = true; setVista({ inicio: 0, pxPorSeg: ancho / p.duracion }) }
  }, [p.duracion, ancho]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rueda: desplazar; con ⌘ o pellizco (ctrlKey), zoom anclado al cursor.
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const rueda = (e: WheelEvent) => {
      e.preventDefault()
      const x = xEnMaqueta(el, e.clientX) - NOMBRE_ANCHO
      if (e.ctrlKey || e.metaKey) setVista(v => zoomAnclado(v, Math.exp(-e.deltaY * 0.01), Math.max(0, x), p.duracion, ancho))
      else setVista(v => desplazar(v, Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY, p.duracion, ancho))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [p.duracion, ancho])

  // El playhead nunca se sale de la vista mientras suena.
  useEffect(() => {
    const fin = vista.inicio + ancho / vista.pxPorSeg
    if (p.toma < vista.inicio || p.toma > fin) setVista(v => ({ ...v, inicio: Math.max(0, Math.min(p.toma - (ancho / v.pxPorSeg) * 0.15, p.duracion - ancho / v.pxPorSeg)) }))
  }, [p.toma]) // eslint-disable-line react-hooks/exhaustive-deps

  const vista2 = vista
  const x = (t: number) => (t - vista.inicio) * vista.pxPorSeg
  const w = (r: TramoT) => Math.max(2, (r.end - r.start) * vista.pxPorSeg)
  const visible = (r: TramoT) => r.end >= vista.inicio && r.start <= vista.inicio + ancho / vista.pxPorSeg
  const tDeEvento = (e: React.MouseEvent) => {
    return Math.max(0, Math.min(p.duracion, vista.inicio + xEnMaqueta(e.currentTarget as HTMLElement, e.clientX) / vista.pxPorSeg))
  }

  const marcas = useMemo(() => {
    const visibleSeg = ancho / vista.pxPorSeg
    const paso = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => s * vista.pxPorSeg >= 70) ?? 600
    const out: number[] = []
    for (let t = Math.floor(vista.inicio / paso) * paso; t <= vista.inicio + visibleSeg; t += paso) if (t >= vista.inicio) out.push(t)
    return out
  }, [vista, ancho])

  const ordenadas = p.filas
  return <div className={s.linea} ref={caja} data-testid="linea-tiempo">
    <div className={s.regla} onClick={e => p.alBuscar(tDeEvento(e))}>
      {marcas.map(t => <span key={t} style={{ left: x(t) }}>{formato(t)}</span>)}
      {p.marcadores.filter(m => visible({ start: m.toma, end: m.toma })).map(m => <i key={m.id} className={s.marcador} style={{ left: x(m.toma) }} title={m.texto} />)}
    </div>
    {ordenadas.map(f => <div key={f.id} className={s.fila} data-clase={f.clase} data-vacia={f.clase !== 'camara' && !f.clips.length ? '' : undefined}>
      <div className={s.nombreFila}>{f.nombre}</div>
      {f.clase === 'camara'
        ? <div className={s.carril} onClick={e => p.alBuscar(tDeEvento(e))} data-testid="carril-camara">
          <Onda picos={p.picos} duracion={p.duracion} vista={vista} ancho={ancho} />
          {p.piezas.map((pz, i) => visible(pz.fuente) && <i key={pz.clipId} className={s.pieza} data-elegida={p.elegidas.includes(i) ? '' : undefined}
            style={{ left: x(pz.fuente.start), width: w(pz.fuente) }}
            onClick={e => { e.stopPropagation(); p.alBuscar(Math.max(pz.fuente.start, vista.inicio + xEnMaqueta(e.currentTarget.parentElement!, e.clientX) / vista.pxPorSeg)); p.alPieza(i, e.shiftKey || e.metaKey) }} />)}
          {p.cortes.map((c, i) => {
            const vista = arrastre && arrastre.rojo === c ? (arrastre.borde === 'inicio' ? { start: Math.min(arrastre.t, c.end), end: c.end } : { start: c.start, end: Math.max(arrastre.t, c.start) }) : c
            return visible(vista) && <i key={`c${i}`} className={s.corte} style={{ left: x(vista.start), width: w(vista) }} data-testid="corte-rojo"
              title={`Cortado ${formato(c.start)}–${formato(c.end)} · clic: escucharlo · arrastra un borde para ajustarlo`} onClick={e => { e.stopPropagation(); p.alCorte(c) }}>
              {p.alBorde && (['inicio', 'fin'] as const).filter(b => (b === 'inicio' ? c.start > 0.01 : c.end < p.duracion - 0.01)).map(b => <b key={b} className={s.asa} data-borde={b} data-testid={`asa-${b}`}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => {
                  e.stopPropagation(); e.preventDefault()
                  const carril = (e.currentTarget.parentElement as HTMLElement).parentElement as HTMLElement
                  const vista0 = vista2
                  const enT = (cx: number) => Math.max(0, Math.min(p.duracion, vista0.inicio + xEnMaqueta(carril, cx) / vista0.pxPorSeg))
                  setArrastre({ rojo: c, borde: b, t: enT(e.clientX) })
                  const mover = (ev: PointerEvent) => setArrastre({ rojo: c, borde: b, t: enT(ev.clientX) })
                  const soltar = (ev: PointerEvent) => {
                    window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar)
                    setArrastre(null)
                    const t = enT(ev.clientX)
                    if (Math.abs(t - (b === 'inicio' ? c.start : c.end)) > 0.02) p.alBorde?.(c, b, t)
                  }
                  window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar)
                }} />)}
            </i>
          })}
          {p.llamadas.map(l => visible(l.tramo) && <i key={`l${l.numero}`} className={s.llamada} style={{ left: x(l.tramo.start), width: w(l.tramo) }}
            data-abierta={p.abierta === l.numero ? '' : undefined} data-decidida={l.decidida} title={`Llamada ${l.numero}`}
            onClick={e => { e.stopPropagation(); p.alLlamada(l.numero) }}><b>{l.numero}</b></i>)}
        </div>
        : <div className={s.carril} onClick={e => p.alBuscar(tDeEvento(e))}>
          {f.clips.flatMap(c => c.tramos.filter(visible).map((r, j) => <span key={`${c.id}${j}`} className={s.clip} data-clase={f.clase}
            style={{ left: x(r.start), width: w(r), outline: p.clipElegido === c.id ? '1px solid #a968f7' : undefined }} title={c.etiqueta}
            onClick={e => { e.stopPropagation(); p.alClip(c.id) }}>{c.etiqueta}</span>))}
        </div>}
    </div>)}
    <div className={s.capaLinea}><i className={s.playhead} style={{ left: x(p.toma) }} /></div>
  </div>
}

function Onda({ picos, duracion, vista, ancho }: { picos: number[] | null; duracion: number; vista: Vista; ancho: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = lienzo.current
    if (!c || !picos?.length || duracion <= 0) return
    const dpr = window.devicePixelRatio || 1
    const alto = c.clientHeight || 50
    c.width = Math.round(ancho * dpr); c.height = Math.round(alto * dpr)
    const g = c.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    g.clearRect(0, 0, ancho, alto)
    g.fillStyle = 'rgba(236,236,241,0.42)'
    const porSeg = picos.length / duracion
    for (let px = 0; px < ancho; px++) {
      const t0 = vista.inicio + px / vista.pxPorSeg, t1 = vista.inicio + (px + 1) / vista.pxPorSeg
      const a = Math.floor(t0 * porSeg), b = Math.max(a + 1, Math.floor(t1 * porSeg))
      let m = 0
      for (let i = a; i < b && i < picos.length; i++) m = Math.max(m, Math.abs(picos[i]))
      const h = Math.max(1, m * (alto - 8))
      g.fillRect(px, (alto - h) / 2, 1, h)
    }
  }, [picos, duracion, vista, ancho])
  return <canvas ref={lienzo} className={s.onda} aria-hidden />
}

