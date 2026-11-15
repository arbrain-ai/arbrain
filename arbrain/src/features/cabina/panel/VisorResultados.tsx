'use client'
/**
 * «Ver resultados» (11 nov 2026, Daniel: «un visor de sus resultados, no tanto code review o PR sino evidencia con
 * imágenes, gráficas y todo… uno técnico pa ti, uno visual pa mí»).
 *
 * Arriba, el resumen humano de su respuesta; luego la galería grande con lo que entregó (imágenes, videos, PDFs, HTML),
 * cada pieza con «Abrir en el panel». Lo técnico (cambios, commits, pruebas y comandos, archivos de código y su
 * respuesta completa) va plegado en «Para Levy». La regla de qué es evidencia: `evidencia-modelo.ts`; el disco:
 * `/api/cabina/evidencia`. Solo lectura: abrir el visor no cambia nada del agente.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, ExternalLink, GitBranch, Loader2, X } from 'lucide-react'
import { abrirSeccion } from './Secciones'
import { cambiosEnPalabras, VEREDICTO, type FilaTablero } from '../tablero-modelo'
import type { Comando, PiezaEvidencia } from '../evidencia-modelo'
import { pedirSegmentoTaller } from './taller-segmento'
import { pedirCarrilHistoria } from '@/features/historia/carril-pedido'
import v from './visor-resultados.module.css'
import { tr } from '@/shared/i18n'

export interface PedidoVisor { agente: number | null; cwd: string; nombre: string; respuesta?: string | null; fila?: FilaTablero | null }
interface Evidencia { resumen: string | null; piezas: PiezaEvidencia[]; tecnico: { respuesta: string | null; commits: string[]; comandos: Comando[]; archivos: string[]; bitacora: boolean } }

function useEvidencia(p: PedidoVisor) {
  const [datos, setDatos] = useState<Evidencia | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    setDatos(null); setError(null)
    fetch('/api/cabina/evidencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente: p.agente, cwd: p.cwd, texto: p.respuesta ?? undefined }), cache: 'no-store', signal: AbortSignal.timeout(40_000) })
      .then(async r => { const b = await r.json().catch(() => ({})) as Evidencia & { error?: string }; if (!r.ok) throw new Error(b.error ? tr(b.error) : tr('El Studio respondió {estado}.', { estado: r.status })); return b })
      .then(b => { if (vivo) setDatos(b) }, e => { if (vivo) setError(e instanceof Error ? e.message : tr('No se pudo leer su evidencia.')) })
    return () => { vivo = false }
  }, [p.agente, p.cwd, p.respuesta])
  return { datos, error }
}

const tamano = (b: number) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export function VisorResultados({ pedido, onCerrar, onRecibido, recibido = false }: { pedido: PedidoVisor; onCerrar: () => void; onRecibido?: () => Promise<void> | void; recibido?: boolean }) {
  const { datos, error } = useEvidencia(pedido)
  const [grande, setGrande] = useState<number | null>(null)
  const [marcando, setMarcando] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const imagenes = (datos?.piezas ?? []).filter(x => x.clase === 'imagen')
  const mover = useCallback((d: number) => setGrande(i => i == null || !imagenes.length ? i : (i + d + imagenes.length) % imagenes.length), [imagenes.length])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (grande != null) setGrande(null); else onCerrar() }
      if (grande != null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); mover(e.key === 'ArrowRight' ? 1 : -1) }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [grande, mover, onCerrar])
  useEffect(() => { caja.current?.focus() }, [])
  const abrir = (x: PiezaEvidencia) => { abrirSeccion({ vista: 'documento', ruta: x.ruta, titulo: `${pedido.nombre} · ${x.nombre}` }); onCerrar() }
  const f = pedido.fila
  const tec = datos?.tecnico
  const pruebas = tec?.comandos.filter(c => c.prueba) ?? []
  const otros = tec?.comandos.filter(c => !c.prueba) ?? []
  const hayTecnico = !!(f?.cambios || f?.juicio || tec?.commits.length || tec?.comandos.length || tec?.archivos.length || tec?.respuesta)
  const marcar = async () => { if (!onRecibido) return; setMarcando(true); try { await onRecibido() } finally { setMarcando(false) } }
  if (typeof document === 'undefined') return null
  return createPortal(<div className={v.fondo} onPointerDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
    <div ref={caja} className={v.caja} role="dialog" aria-modal="true" aria-label={tr('Resultados de {nombre}', { nombre: pedido.nombre })} tabIndex={-1}>
      <header className={v.cabeza}>
        <div className={v.cabezaTexto}>
          <p className={v.ceja}>{tr('Resultados')}{f?.juicio ? ` · ${tr(VEREDICTO[f.juicio.veredicto])}` : ''}</p>
          <h2 className={v.titulo}>{pedido.nombre}</h2>
          {datos ? <p className={v.resumen} data-vacio={!datos.resumen || undefined}>{datos.resumen ?? tr('Terminó sin dejar un resumen.')}</p>
            : !error && <p className={v.resumen} data-vacio>{tr('Buscando lo que entregó…')}</p>}
        </div>
        <div className={v.acciones}>
          {onRecibido && <button type="button" className={v.boton} data-hecho={recibido || undefined} onClick={() => void marcar()} disabled={marcando || recibido} title={recibido ? tr('Ya lo marcaste como recibido') : tr('Lo saca de «Trabajando para ti»; queda en «Recibidos»')}>
            {marcando ? <Loader2 size={14} aria-hidden /> : <Check size={14} aria-hidden />}{recibido ? tr('Recibido') : tr('Marcar recibido')}
          </button>}
          <button type="button" className={v.cerrar} onClick={onCerrar} aria-label={tr('Cerrar el visor')} title={tr('Cerrar (Esc)')}><X size={18} aria-hidden /></button>
        </div>
      </header>
      <div className={v.cuerpo}>
        {error && <p className={v.vacio} role="alert">{error}</p>}
        {!datos && !error && <div className={v.cargando} aria-busy="true"><span /><span /><span /></div>}
        {datos && (datos.piezas.length
          ? <div className={v.galeria} data-una={datos.piezas.length === 1 || undefined}>{datos.piezas.map(x => <Pieza key={x.ruta} x={x} onGrande={() => setGrande(imagenes.indexOf(x))} onAbrir={() => abrir(x)} />)}</div>
          : <p className={v.vacio}>{tec?.respuesta ? tr('No dejó imágenes, videos ni documentos para ver. Lo que dijo está en «Para Levy».') : tr('No dejó imágenes, videos ni documentos para ver.')}</p>)}
        {datos && hayTecnico && <details className={v.tecnico}>
          <summary><ChevronRight size={13} aria-hidden />{tr('Para Levy · lo técnico')}</summary>
          <div className={v.tecnicoCuerpo}>
            {f?.juicio && <section><h4>{tr('Revisión del juez')}</h4><p>{tr(VEREDICTO[f.juicio.veredicto])} · {f.juicio.razon}</p></section>}
            {f?.cambios && <section><h4>{tr('Cambios en su rama')}</h4><p>{f.cambios.rama} · {cambiosEnPalabras(f.cambios)} · <button type="button" className={v.enlace} onClick={() => { pedirCarrilHistoria(f.cambios!.rama); pedirSegmentoTaller('historia'); onCerrar() }}><GitBranch size={12} aria-hidden />{tr('Ver el diff')}</button></p></section>}
            {!!tec?.commits.length && <section><h4>{tr('Commits')}</h4><ul>{tec.commits.map(c => <li key={c}><code>{c}</code></li>)}</ul></section>}
            {pruebas.length > 0 && <section><h4>{tr('Pruebas y typecheck')}</h4><Comandos lista={pruebas} /></section>}
            {otros.length > 0 && <section><h4>{tr('Últimos comandos')}</h4><Comandos lista={otros} /></section>}
            {!!tec?.archivos.length && <section><h4>{tr('Archivos que tocó')}</h4><ul>{tec.archivos.map(a => <li key={a}><code>{a}</code></li>)}</ul></section>}
            <section><h4>{tr('Carpeta')}</h4><code>{pedido.cwd || '—'}</code></section>
            {tec?.respuesta && <section><h4>{tr('Su respuesta completa')}</h4><pre className={v.respuesta}>{tec.respuesta}</pre></section>}
          </div>
        </details>}
      </div>
    </div>
    {grande != null && imagenes[grande] && <div className={v.grande} onPointerDown={e => { if (e.target === e.currentTarget) setGrande(null) }} role="dialog" aria-label={imagenes[grande].nombre}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagenes[grande].url} alt={imagenes[grande].nombre} />
      {imagenes.length > 1 && <>
        <button type="button" className={v.flecha} data-lado="izq" onClick={() => mover(-1)} aria-label={tr('Anterior')}><ChevronLeft size={20} aria-hidden /></button>
        <button type="button" className={v.flecha} data-lado="der" onClick={() => mover(1)} aria-label={tr('Siguiente')}><ChevronRight size={20} aria-hidden /></button>
      </>}
      <p className={v.grandeNombre}>{imagenes[grande].nombre}{imagenes.length > 1 ? ` · ${tr('{n} de {total}', { n: grande + 1, total: imagenes.length })}` : ''}</p>
    </div>}
  </div>, document.body)
}

function Pieza({ x, onGrande, onAbrir }: { x: PiezaEvidencia; onGrande: () => void; onAbrir: () => void }) {
  return <figure className={v.pieza} style={{ margin: 0 }}>
    <div className={v.marco}>
      {x.clase === 'imagen' && <button type="button" className={v.miniatura} onClick={onGrande} title={tr('Verla en grande')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={x.url} alt={x.nombre} loading="lazy" />
      </button>}
      {x.clase === 'video' && <video src={`${x.url}#t=0.5`} controls preload="metadata" playsInline muted />}
      {x.clase === 'pdf' && <iframe src={x.url} title={x.nombre} loading="lazy" />}
      {x.clase === 'html' && <iframe src={x.url} title={x.nombre} loading="lazy" sandbox="allow-scripts" />}
    </div>
    <figcaption className={v.pie}>
      <span className={v.pieNombre} title={x.ruta}>{x.nombre}</span>
      <span>{tamano(x.bytes)}</span>
      <button type="button" className={v.pieAbrir} onClick={onAbrir} title={tr('Abrirlo en el panel, con su visor completo')}><ExternalLink size={11} aria-hidden />{tr('Abrir')}</button>
    </figcaption>
  </figure>
}

function Comandos({ lista }: { lista: Comando[] }) {
  return <ul>{lista.map((c, i) => <li key={i}>
    {c.ok === false ? <X size={12} className={v.mal} aria-label={tr('falló')} /> : c.ok ? <Check size={12} className={v.ok} aria-label={tr('salió bien')} /> : <span className={v.ok}>·</span>}
    <span><code>{c.comando}</code>{c.codigo ? ` · ${tr('código {codigo}', { codigo: c.codigo })}` : ''}</span>
  </li>)}</ul>
}
