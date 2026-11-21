'use client'
/**
 * La columna derecha del editor: «Para ti» (las llamadas numeradas que esperan al dueño), el transcript (búsqueda y clic
 * que lleva al instante, sin reproducir: lección de Scarlet) y las versiones del motor (ir a una, o deshacer solo lo que
 * hizo esa edición).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { formato, TIPO_CORTE, type EdicionAplicada, type Llamada } from './modelo'
import type { Segmento, TramoT, VersionResumen } from './tipos'
import { aEspanol } from './textos'
import s from './editor.module.css'

export type PestanaLado = 'para-ti' | 'hechas' | 'transcript' | 'versiones'

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')

export function Lado(p: {
  pestana: PestanaLado; setPestana: (x: PestanaLado) => void
  llamadas: Llamada[]; abierta: number | null; alAbrir: (n: number) => void
  segmentos: Segmento[] | null; cortes: TramoT[]; toma: number; alBuscar: (toma: number) => void
  versiones: VersionResumen[]; cabeza: string | null; alIr: (v: string) => void; alRevertir: (v: string) => void; ocupado: boolean
  hechas: EdicionAplicada[]; mantenidas: Set<string>; alMantener: (e: EdicionAplicada) => void; alRechazar: (e: EdicionAplicada) => void
}) {
  const porRevisar = p.hechas.filter(e => !p.mantenidas.has(e.clave)).length
  const pendientes = p.llamadas.filter(l => !l.eleccion).length
  return <aside className={s.lado}>
    <div className={s.pestanas} role="tablist">
      <button role="tab" data-activa={p.pestana === 'para-ti' ? '' : undefined} onClick={() => p.setPestana('para-ti')}>Para ti{pendientes ? ` · ${pendientes}` : ''}</button>
      <button role="tab" data-activa={p.pestana === 'hechas' ? '' : undefined} onClick={() => p.setPestana('hechas')} data-testid="pestana-hechas">Hechas{porRevisar ? ` · ${porRevisar}` : ''}</button>
      <button role="tab" data-activa={p.pestana === 'transcript' ? '' : undefined} onClick={() => p.setPestana('transcript')}>Transcript</button>
      <button role="tab" data-activa={p.pestana === 'versiones' ? '' : undefined} onClick={() => p.setPestana('versiones')}>Versiones</button>
    </div>
    <div className={s.cuerpoLado}>
      {p.pestana === 'para-ti' && <ParaTi {...p} />}
      {p.pestana === 'hechas' && <Hechas {...p} />}
      {p.pestana === 'transcript' && <TranscriptVista segmentos={p.segmentos} cortes={p.cortes} toma={p.toma} alBuscar={p.alBuscar} />}
      {p.pestana === 'versiones' && <Versiones {...p} />}
    </div>
  </aside>
}

function ParaTi({ llamadas, abierta, alAbrir }: { llamadas: Llamada[]; abierta: number | null; alAbrir: (n: number) => void }) {
  if (!llamadas.length) return <p className={s.nada}>Nada espera tu decisión. Cuando el pase de Levy dude de un corte, aparece aquí con su número.</p>
  return <>{llamadas.map(l => <button key={`${l.cambioId}:${l.indice}`} className={s.item} data-abierta={abierta === l.numero ? '' : undefined}
    data-decidida={l.eleccion ? '' : undefined} onClick={() => alAbrir(l.numero)}>
    <span className={s.n}>{l.numero}</span>
    <span><p>{aEspanol(l.resumen ?? l.nota)}</p>
      <small>{formato(l.tramo.start)}–{formato(l.tramo.end)} · {TIPO_CORTE[l.tipo ?? ''] ?? 'Corte'}{l.revisando ? ' · Revisando…' : l.eleccion ? ` · ${l.eleccion === 'cut' ? 'aprobado' : 'mantenido'}` : ''}</small></span>
  </button>)}</>
}

function TranscriptVista({ segmentos, cortes, toma, alBuscar }: { segmentos: Segmento[] | null; cortes: TramoT[]; toma: number; alBuscar: (t: number) => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const palabras = useMemo(() => (segmentos ?? []).flatMap((sg, si) => (sg.words?.length ? sg.words : [{ text: sg.text, start: sg.start, end: sg.end }]).map((w, wi) => ({ ...w, si, wi, n: normal(w.text) }))), [segmentos])
  const halladas = useMemo(() => {
    const qs = normal(q).split(/\s+/).filter(Boolean)
    if (!qs.length) return [] as number[]
    const out: number[] = []
    for (let k = 0; k + qs.length <= palabras.length; k++) if (qs.every((x, j) => palabras[k + j].n.includes(x))) out.push(k)
    return out
  }, [q, palabras])
  const hallado = useMemo(() => {
    const n = normal(q).split(/\s+/).filter(Boolean).length
    return new Set(halladas.flatMap(k => Array.from({ length: n }, (_, j) => k + j)))
  }, [halladas, q])
  const actual = useRef<HTMLSpanElement | null>(null)
  useEffect(() => { actual.current?.scrollIntoView({ block: 'nearest' }) }, [toma])
  const ir = (dir: 1 | -1) => {
    if (!halladas.length) return
    const j = (i + dir + halladas.length) % halladas.length
    setI(j); alBuscar(palabras[halladas[j]].start)
  }
  if (!segmentos) return <p className={s.nada}>El transcript aún no está (el motor lo prepara al importar la toma).</p>
  const cortada = (w: { start: number; end: number }) => cortes.some(c => (w.start + w.end) / 2 >= c.start && (w.start + w.end) / 2 < c.end)
  let k = -1
  return <>
    <div className={s.buscar}>
      <input value={q} onChange={e => { setQ(e.target.value); setI(0) }} placeholder="Buscar en lo dicho" aria-label="Buscar en el transcript"
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ir(e.shiftKey ? -1 : 1) } if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }} />
      {q && <small>{halladas.length ? `${i + 1} de ${halladas.length}` : 'sin resultados'}</small>}
    </div>
    {segmentos.map((sg, si) => {
      const enEste = toma >= sg.start && toma < sg.end
      const ws = sg.words?.length ? sg.words : [{ text: sg.text, start: sg.start, end: sg.end }]
      return <p key={si} className={s.segmento} data-actual={enEste ? '' : undefined}>
        <time>{formato(sg.start)}</time>
        {ws.map((w, wi) => {
          k++
          const esActual = toma >= w.start && toma < w.end
          return <span key={wi}><span ref={esActual ? actual : undefined} className={s.palabra} data-actual={esActual ? '' : undefined}
            data-cortada={cortada(w) ? '' : undefined} data-hallada={hallado.has(k) ? '' : undefined}
            onClick={() => alBuscar(w.start)}>{w.text.trim()}</span>{' '}</span>
        })}
      </p>
    })}
  </>
}

function Versiones({ versiones, cabeza, alIr, alRevertir, ocupado }: { versiones: VersionResumen[]; cabeza: string | null; alIr: (v: string) => void; alRevertir: (v: string) => void; ocupado: boolean }) {
  if (!versiones.length) return <p className={s.nada}>Sin versiones todavía.</p>
  const hora = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
  return <>{versiones.map(v => {
    const esCabeza = v.version === cabeza
    return <div key={v.version} className={s.version} data-cabeza={esCabeza ? '' : undefined}>
      <p>{aEspanol(v.description) || 'Versión'}<small>{v.version.slice(0, 8)} · {hora(v.createdAt)} · {v.author?.name ?? ''}{typeof v.duration === 'number' ? ` · ${formato(v.duration)}` : ''}</small></p>
      {!esCabeza && <button className={s.boton} disabled={ocupado} onClick={() => alIr(v.version)} title="Volver a esta versión (la cabeza se mueve; nada se borra)">Ir</button>}
      {v.parent && <button className={s.boton} disabled={ocupado} onClick={() => alRevertir(v.version)} title="Deshacer solo lo que hizo esta edición, sobre la versión actual">Rechazar</button>}
    </div>
  })}</>
}

/** Lo ya aplicado (cortes en rojo y piezas colocadas): Mantener lo da por bueno; ✕ lo rechaza solo a él (versión nueva del motor). */
function Hechas({ hechas, mantenidas, alMantener, alRechazar, alBuscar, ocupado }: { hechas: EdicionAplicada[]; mantenidas: Set<string>; alMantener: (e: EdicionAplicada) => void; alRechazar: (e: EdicionAplicada) => void; alBuscar: (t: number) => void; ocupado: boolean }) {
  if (!hechas.length) return <p className={s.nada}>Todavía no hay ediciones aplicadas.</p>
  return <>{hechas.map(e => {
    const ok = mantenidas.has(e.clave)
    return <div key={e.clave} className={s.version} data-cabeza={ok ? '' : undefined} data-testid="hecha">
      <p role="button" tabIndex={0} onClick={() => alBuscar(Math.max(0, e.tramo.start - 1.5))} style={{ cursor: 'pointer' }}>
        {e.tipo === 'corte' ? 'Corte · ' : ''}{e.nota}<small>{formato(e.tramo.start)}–{formato(e.tramo.end)} de la toma{ok ? ' · mantenida' : ''}</small></p>
      {!ok && <button className={s.boton} disabled={ocupado} onClick={() => alMantener(e)} title="Se queda así">Mantener</button>}
      <button className={s.boton} disabled={ocupado} onClick={() => alRechazar(e)} title={e.tipo === 'corte' ? 'Devolver lo cortado (versión nueva)' : 'Quitar esta pieza sola (versión nueva)'} aria-label="Rechazar">✕</button>
    </div>
  })}</>
}
