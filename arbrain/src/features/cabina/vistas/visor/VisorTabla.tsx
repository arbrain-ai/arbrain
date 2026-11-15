'use client'
/**
 * Visor de tablas: Excel (.xlsx) y CSV/TSV (14 nov 2026, Daniel: «un visualizador de docs tipo PDF reader, Word, Excel
 * tables, CSV… súper!»). Que una hoja se lea y se interrogue aquí mejor que abriéndola en otra app.
 *
 *  · Rejilla virtual en los dos ejes: solo se pintan las filas y columnas a la vista (100 mil filas no la traban).
 *    Encabezado y número de fila fijos; las columnas que el libro trae inmovilizadas, también.
 *  · Cada columna sabe su tipo (número, moneda, porcentaje, fecha, texto) y se alinea y formatea como tal; los negativos
 *    en rojo; las hojas en pestañas; el título que el libro trae arriba del encabezado se lee como título, no como fila.
 *  · Ordenar tocando el encabezado (asc → desc → original); el embudo filtra la columna: valores con casillas, «contiene»,
 *    o un rango con su histograma. Búsqueda en toda la hoja, sin acentos ni mayúsculas, que resalta lo que encontró.
 *  · Una celda elegida dice su referencia, su texto completo y su fórmula; la barra de abajo resume su columna (suma,
 *    promedio, mínimo, máximo) sobre lo filtrado, como la barra de estado de Excel. Teclado: flechas, ⌘C, ⌘F, Esc.
 *
 * Los lectores (csv.ts, xlsx.ts con fflate) se descargan solo al abrir una tabla. Todo se lee en esta computadora.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, Check, Filter, FilterX, Search, X } from 'lucide-react'
import { filtrar, filtroActivo, frecuentes, histograma, normalizar, ordenar, resumir, cifra, type Columna, type FiltroColumna, type Tabla } from '../../documento/tabla/modelo'
import { serialAMs, msASerial } from '../../documento/tabla/formato'
import type { LibroVista } from '../../documento/tabla/cargar'
import { BotonDescargar } from './BotonDescargar'
import { BotonAbrirEnApp } from './BotonAbrirEnApp'
import v from './visor.module.css'
import t from './tabla.module.css'
import { enIngles, localeIntl, tr, trn } from '@/shared/i18n'

type Motor = typeof import('../../documento/tabla/cargar')
let motor: Promise<Motor> | null = null
const cargarMotor = () => (motor ??= import('../../documento/tabla/cargar'))

/** Más grande que esto se baja o se abre en su app: el visor no es una base de datos. */
const MAX_BYTES = 80 * 1024 * 1024
const ALTO = 30, ALTO_CAB = 40, SOBRA_FILAS = 10, SOBRA_COLS = 2

interface Orden { col: number; dir: 1 | -1 }
interface Seleccion { r: number; c: number }
interface EstadoHoja { orden: Orden | null; filtros: Map<number, FiltroColumna>; consulta: string; sel: Seleccion | null; anchos: number[] | null }
const NUEVO: EstadoHoja = { orden: null, filtros: new Map(), consulta: '', sel: null, anchos: null }

export function VisorTabla({ url, tipo, archivo, ruta, hash, bytes, grande, descarga }: {
  url: string; tipo: 'csv' | 'xlsx'; archivo: string; ruta: string; hash?: string; bytes?: number; grande?: boolean; descarga?: string
}) {
  const [libro, setLibro] = useState<LibroVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoja, setHoja] = useState(0)
  const [estados, setEstados] = useState<Record<number, EstadoHoja>>({})
  const raiz = useRef<HTMLDivElement>(null)
  // El enlace firmado rota cada 6 h aunque el archivo sea el mismo: se relee solo si cambia el archivo (`hash`).
  const enlace = useRef(url); enlace.current = url

  // ── Leer el archivo (y otra vez si cambia en disco: `hash` es tamaño + fecha) ──
  useEffect(() => {
    let vivo = true
    setError(null)
    if (bytes && bytes > MAX_BYTES) { setError(tr('Este archivo pesa {mb} MB: es demasiado para el visor. Descárgalo o ábrelo en su app.', { mb: Math.round(bytes / 1048576) })); return }
    ;(async () => {
      const [m, r] = await Promise.all([cargarMotor(), fetch(enlace.current, { cache: 'no-store' })])
      if (!r.ok) throw new Error(tr('No se pudo leer el archivo ({estado}).', { estado: r.status }))
      const datos = new Uint8Array(await r.arrayBuffer())
      // Un respiro para que se pinte «Abriendo…» antes de leer un archivo grande.
      await new Promise(ok => setTimeout(ok, 16))
      const l = m.abrirLibro(datos, tipo, archivo, { idioma: enIngles() ? 'en' : 'es', locale: localeIntl() })
      if (!vivo) return
      setLibro(l)
      setHoja(h => (h < l.hojas.length ? h : Math.max(0, l.hojas.findIndex(x => !x.oculta))))
    })().catch(e => { if (vivo) setError(e instanceof Error ? e.message : tr('No se pudo abrir la tabla.')) })
    return () => { vivo = false }
  }, [hash ?? url, tipo, archivo, bytes]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => (libro?.hojas ?? []).map((h, i) => ({ ...h, i })).filter((h, _, todas) => !h.oculta || todas.every(x => x.oculta)), [libro])
  const actual = libro?.hojas[hoja]
  const tabla = actual?.tabla
  const est = estados[hoja] ?? NUEVO
  const cambiar = useCallback((f: (e: EstadoHoja) => EstadoHoja) => setEstados(s => ({ ...s, [hoja]: f(s[hoja] ?? NUEVO) })), [hoja])

  // Búsqueda: el campo responde al instante; la tabla, 140 ms después.
  const [texto, setTexto] = useState('')
  useEffect(() => { setTexto(est.consulta) }, [hoja]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = window.setTimeout(() => cambiar(e => e.consulta === texto ? e : { ...e, consulta: texto, sel: null }), 140); return () => window.clearTimeout(k) }, [texto, cambiar])

  const indices = useMemo(() => {
    if (!tabla) return []
    let ix = filtrar(tabla, est.filtros, est.consulta)
    if (est.orden) ix = ordenar(tabla, ix, est.orden.col, est.orden.dir)
    return ix
  }, [tabla, est.filtros, est.consulta, est.orden])

  const anchos = useMemo(() => tabla ? (est.anchos && est.anchos.length === tabla.columnas.length ? est.anchos : tabla.columnas.map(c => c.ancho)) : [], [tabla, est.anchos])
  const fijarAncho = useCallback((k: number, w: number) => cambiar(e => { const a = [...(e.anchos && tabla && e.anchos.length === tabla.columnas.length ? e.anchos : tabla?.columnas.map(c => c.ancho) ?? [])]; a[k] = w; return { ...e, anchos: a } }), [cambiar, tabla])
  const alOrdenar = useCallback((k: number, dir?: 1 | -1) => cambiar(e => {
    const o = e.orden
    const siguiente: Orden | null = dir ? { col: k, dir } : !o || o.col !== k ? { col: k, dir: 1 } : o.dir === 1 ? { col: k, dir: -1 } : null
    return { ...e, orden: siguiente }
  }), [cambiar])
  const ponerFiltro = useCallback((k: number, f: FiltroColumna | null) => cambiar(e => { const m = new Map(e.filtros); if (f && filtroActivo(f)) m.set(k, f); else m.delete(k); return { ...e, filtros: m, sel: null } }), [cambiar])
  const filtrosActivos = [...est.filtros.values()].filter(filtroActivo).length
  const elegir = useCallback((s: Seleccion | null) => cambiar(e => ({ ...e, sel: s })), [cambiar])

  // ── Embudo (popover de filtro) ──
  const [embudo, setEmbudo] = useState<{ col: number; x: number; y: number } | null>(null)
  const abrirEmbudo = useCallback((k: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect(), c = raiz.current!.getBoundingClientRect()
    setEmbudo(e => e?.col === k ? null : { col: k, x: Math.max(8, Math.min(r.right - c.left - 300, c.width - 308)), y: r.bottom - c.top + 6 })
  }, [])
  useEffect(() => { setEmbudo(null) }, [hoja])

  const buscador = useRef<HTMLInputElement>(null)
  const alTeclado = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); buscador.current?.focus(); buscador.current?.select() }
  }

  if (error) return <p className={v.aviso} role="alert">{error}<span className={t.accionesAviso}><BotonAbrirEnApp ruta={ruta} className={v.icono} /><BotonDescargar url={descarga} nombre={archivo} className={v.icono} /></span></p>

  const filas = tabla?.filas ?? 0
  return <div ref={raiz} className={t.tabla} data-grande={grande || undefined} onKeyDown={alTeclado}>
    <div className={t.barra} role="toolbar" aria-label={tr('Controles de la tabla')}>
      {visibles.length > 1 && <Pestanas hojas={visibles} actual={hoja} alElegir={i => setHoja(i)} />}
      {libro && visibles.length <= 1 && <span className={t.etiqueta}>{tipo === 'csv' ? <>CSV<i>{libro.separador === '\t' ? 'TSV' : tr('separado por {sep}', { sep: tr(libro.separador === ';' ? 'punto y coma' : libro.separador === '|' ? 'barra' : 'coma') })}</i></> : actual?.nombre}</span>}
      <div className={`${v.busqueda} ${t.busqueda}`}>
        <Search size={13} aria-hidden />
        <input ref={buscador} type="search" aria-label={tr('Buscar en la tabla')} placeholder={tr('Buscar en la hoja')} value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setTexto('') }} />
        {est.consulta.trim() && <span className={v.cuenta} aria-live="polite">{trn(indices.length, '1 fila', '{n} filas', { n: indices.length.toLocaleString(localeIntl()) })}</span>}
        {texto && <button type="button" className={v.mini} aria-label={tr('Limpiar búsqueda')} onClick={() => setTexto('')}><X size={13} aria-hidden /></button>}
      </div>
      {filtrosActivos > 0 && <button type="button" className={t.quitar} onClick={() => cambiar(e => ({ ...e, filtros: new Map(), sel: null }))} title={tr('Quitar todos los filtros')}>
        <FilterX size={13} aria-hidden />{trn(filtrosActivos, '1 filtro', '{n} filtros')}</button>}
      <BotonAbrirEnApp ruta={ruta} className={v.icono} />
      <BotonDescargar url={descarga} nombre={archivo} className={v.icono} />
    </div>
    {!tabla ? <div className={t.cargando} aria-busy="true"><Esqueleto /><span>{tr('Abriendo {archivo}…', { archivo })}</span></div>
      : <>
        {tabla.preambulo.length > 0 && <div className={t.preambulo}>{tabla.preambulo.slice(0, 3).map((p, i) => i === 0 ? <h3 key={i}>{p}</h3> : <p key={i}>{p}</p>)}</div>}
        {filas === 0 ? <p className={t.vacia}>{tr('Esta hoja está vacía.')}</p>
          : <Rejilla key={hoja} tabla={tabla} indices={indices} anchos={anchos} fijarAncho={fijarAncho} orden={est.orden} alOrdenar={alOrdenar}
            filtros={est.filtros} abrirEmbudo={abrirEmbudo} consulta={est.consulta} sel={est.sel} setSel={elegir}
            letras={tipo === 'xlsx'} conCombinadas={!est.orden && !filtrosActivos && !est.consulta.trim()} />}
        {filas > 0 && indices.length === 0 && <div className={t.sinFilas}><p>{tr('Ninguna fila coincide.')}</p>
          <button type="button" className={t.quitar} onClick={() => { setTexto(''); cambiar(e => ({ ...e, filtros: new Map(), consulta: '', sel: null })) }}><FilterX size={13} aria-hidden />{tr('Quitar búsqueda y filtros')}</button></div>}
        <Pie tabla={tabla} indices={indices} sel={est.sel} libro={libro!} />
      </>}
    {embudo && tabla && tabla.columnas[embudo.col] && <Embudo key={embudo.col} col={tabla.columnas[embudo.col]} k={embudo.col} tabla={tabla} x={embudo.x} y={embudo.y}
      filtro={est.filtros.get(embudo.col)} orden={est.orden} alOrdenar={alOrdenar} ponerFiltro={ponerFiltro} cerrar={() => setEmbudo(null)} />}
  </div>
}

// ── Pestañas de hojas: la luz se desliza a la elegida ──
function Pestanas({ hojas, actual, alElegir }: { hojas: { nombre: string; i: number; tabla: Tabla }[]; actual: number; alElegir: (i: number) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const [luz, setLuz] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const b = caja.current?.querySelector<HTMLElement>(`[data-hoja="${actual}"]`)
    if (b) { setLuz({ x: b.offsetLeft, w: b.offsetWidth }); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
  }, [actual, hojas])
  return <div ref={caja} className={t.pestanas} role="tablist" aria-label={tr('Hojas')}>
    {luz && <span className={t.luz} style={{ transform: `translateX(${luz.x}px)`, width: luz.w }} aria-hidden />}
    {hojas.map(h => <button key={h.i} type="button" role="tab" data-hoja={h.i} aria-selected={h.i === actual} onClick={() => alElegir(h.i)}
      title={trn(h.tabla.filas, '{hoja} · 1 fila', '{hoja} · {n} filas', { hoja: h.nombre, n: h.tabla.filas.toLocaleString(localeIntl()) })}>
      {h.nombre}<small>{h.tabla.filas.toLocaleString(localeIntl())}</small></button>)}
  </div>
}

function Esqueleto() {
  return <div className={t.esqueleto} aria-hidden>{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
}

/** El glifo del tipo de la columna: se lee de un vistazo qué hay abajo. */
function Glifo({ c }: { c: Columna }) {
  if (c.tipo === 'fecha') return <CalendarDays size={11} className={t.glifo} aria-label={tr('fechas')} />
  const g = c.tipo === 'numero' ? (c.porcentaje ? '%' : c.moneda ? (c.moneda.length <= 2 ? c.moneda : '$') : '#') : c.tipo === 'booleano' ? '✓' : c.tipo === 'vacia' ? '∅' : 'Aa'
  return <span className={t.glifo} aria-hidden>{g}</span>
}

const esNumerica = (c: Columna) => c.tipo === 'numero' || c.tipo === 'fecha'
const sinPuntero = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

// ── La rejilla ──
interface PropsRejilla {
  tabla: Tabla; indices: number[]; anchos: number[]; fijarAncho: (k: number, w: number) => void
  orden: Orden | null; alOrdenar: (k: number) => void; filtros: Map<number, FiltroColumna>; abrirEmbudo: (k: number, el: HTMLElement) => void
  consulta: string; sel: Seleccion | null; setSel: (s: Seleccion | null) => void; letras: boolean; conCombinadas: boolean
}

function Rejilla({ tabla, indices, anchos, fijarAncho, orden, alOrdenar, filtros, abrirEmbudo, consulta, sel, setSel, letras, conCombinadas }: PropsRejilla) {
  const caja = useRef<HTMLDivElement>(null)
  const [vista, setVista] = useState({ top: 0, left: 0, w: 900, h: 520 })
  const n = indices.length
  // Columnas a la vista (las de ancho cero son las que el libro esconde) y su posición.
  const cols = useMemo(() => anchos.map((w, k) => ({ k, w })).filter(x => x.w > 0), [anchos])
  const xs = useMemo(() => { const a = [0]; for (const c of cols) a.push(a[a.length - 1] + c.w); return a }, [cols])
  const fijas = Math.min(tabla.fijas, cols.length)
  const anchoFijas = xs[fijas]
  const ultimaFila = tabla.numeroFila[tabla.numeroFila.length - 1] ?? 1
  const gutter = Math.max(46, String(ultimaFila).length * 8 + 26)
  const total = xs[cols.length]

  // Rango de filas y columnas a pintar.
  const r0 = Math.max(0, Math.floor(vista.top / ALTO) - SOBRA_FILAS)
  const r1 = Math.min(n, Math.ceil((vista.top + vista.h) / ALTO) + SOBRA_FILAS)
  let c0 = fijas
  while (c0 < cols.length && xs[c0 + 1] <= vista.left + anchoFijas) c0++
  let c1 = c0
  while (c1 < cols.length && xs[c1] < vista.left + vista.w - gutter) c1++
  c0 = Math.max(fijas, c0 - SOBRA_COLS); c1 = Math.min(cols.length, c1 + SOBRA_COLS)

  const leer = useCallback(() => {
    const c = caja.current; if (!c) return
    setVista(p => (p.top === c.scrollTop && p.left === c.scrollLeft && p.w === c.clientWidth && p.h === c.clientHeight ? p : { top: c.scrollTop, left: c.scrollLeft, w: c.clientWidth, h: c.clientHeight }))
  }, [])
  const hilo = useRef(0)
  const alDesplazar = () => { if (!hilo.current) hilo.current = requestAnimationFrame(() => { hilo.current = 0; leer() }) }
  useEffect(() => { const c = caja.current; if (!c) return; leer(); const o = new ResizeObserver(leer); o.observe(c); return () => { o.disconnect(); cancelAnimationFrame(hilo.current) } }, [leer])

  // Entrada: las primeras filas suben escalonadas una sola vez; al reordenar, la rejilla «respira».
  const [entrando, setEntrando] = useState(true)
  useEffect(() => { const k = window.setTimeout(() => setEntrando(false), 1100); return () => window.clearTimeout(k) }, [])
  const [pulso, setPulso] = useState(0)
  const firma = `${orden?.col ?? ''}:${orden?.dir ?? ''}:${filtros.size}:${consulta}`
  const previa = useRef(firma)
  useEffect(() => { if (previa.current !== firma) { previa.current = firma; setPulso(p => p + 1); caja.current?.scrollTo({ top: 0 }) } }, [firma])

  // ── Teclado ──
  const visibleEn = useCallback((r: number, k: number) => {
    const c = caja.current; if (!c) return
    const y = r * ALTO
    if (y < c.scrollTop) c.scrollTop = y
    else if (y + ALTO + ALTO_CAB > c.scrollTop + c.clientHeight) c.scrollTop = y + ALTO + ALTO_CAB - c.clientHeight
    const pos = cols.findIndex(x => x.k === k)
    if (pos < fijas || pos < 0) return
    const x0 = xs[pos], x1 = xs[pos + 1]
    if (x0 - anchoFijas < c.scrollLeft) c.scrollLeft = x0 - anchoFijas
    else if (gutter + x1 > c.scrollLeft + c.clientWidth) c.scrollLeft = gutter + x1 - c.clientWidth
  }, [cols, xs, fijas, anchoFijas, gutter])
  const mover = (dr: number, dc: number, absoluto?: Partial<Seleccion>) => {
    if (!n || !cols.length) return
    const actual = sel ?? { r: 0, c: cols[0].k }
    const pos = Math.max(0, cols.findIndex(x => x.k === actual.c))
    const r = Math.max(0, Math.min(n - 1, absoluto?.r ?? actual.r + dr))
    const p = Math.max(0, Math.min(cols.length - 1, absoluto?.c ?? pos + dc))
    setSel({ r, c: cols[p].k }); visibleEn(r, cols[p].k)
  }
  const alTeclado = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, button')) return
    const pagina = Math.max(1, Math.floor((vista.h - ALTO_CAB) / ALTO) - 1)
    const meta = e.metaKey || e.ctrlKey
    const tecla = e.key
    if (meta && tecla.toLowerCase() === 'c' && sel) { e.preventDefault(); void navigator.clipboard?.writeText(tabla.columnas[sel.c]?.textos[indices[sel.r]] ?? ''); return }
    const pasos: Record<string, () => void> = {
      ArrowDown: () => meta ? mover(0, 0, { r: n - 1 }) : mover(1, 0), ArrowUp: () => meta ? mover(0, 0, { r: 0 }) : mover(-1, 0),
      ArrowRight: () => meta ? mover(0, 0, { c: cols.length - 1 }) : mover(0, 1), ArrowLeft: () => meta ? mover(0, 0, { c: 0 }) : mover(0, -1),
      Enter: () => mover(e.shiftKey ? -1 : 1, 0), Tab: () => mover(0, e.shiftKey ? -1 : 1),
      PageDown: () => mover(pagina, 0), PageUp: () => mover(-pagina, 0), Home: () => mover(0, 0, meta ? { r: 0, c: 0 } : { c: 0 }), End: () => mover(0, 0, meta ? { r: n - 1, c: cols.length - 1 } : { c: cols.length - 1 }),
      Escape: () => setSel(null),
    }
    if (pasos[tecla]) { e.preventDefault(); pasos[tecla]() }
  }

  // ── Ancho de columna: arrastrar el borde; doble clic, a la medida de su contenido ──
  const medidor = useRef<CanvasRenderingContext2D | null>(null)
  const autoAjustar = (k: number) => {
    const c = tabla.columnas[k]
    medidor.current ??= document.createElement('canvas').getContext('2d')
    const ctx = medidor.current; if (!ctx) return
    const fuente = getComputedStyle(caja.current!).fontFamily
    ctx.font = `13px ${fuente}`
    let w = 0
    const paso = Math.max(1, Math.floor(indices.length / 3000))
    for (let i = 0; i < indices.length; i += paso) w = Math.max(w, ctx.measureText(c.textos[indices[i]] ?? '').width)
    ctx.font = `600 12.5px ${fuente}`
    w = Math.max(w + 26, ctx.measureText(c.nombre).width + 58)
    fijarAncho(k, Math.round(Math.min(640, Math.max(56, w))))
  }
  const arrastrar = (k: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = anchos[k]
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const mov = (ev: PointerEvent) => fijarAncho(k, Math.round(Math.max(48, Math.min(900, w0 + ev.clientX - x0))))
    const fin = () => { el.removeEventListener('pointermove', mov); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin) }
    el.addEventListener('pointermove', mov); el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin)
  }

  const q = normalizar(consulta.trim())
  const selCol = sel?.c ?? -1
  // Columnas donde la búsqueda encontró algo (en las primeras 800 filas que pasaron): su encabezado se marca.
  const halladas = useMemo(() => {
    const s = new Set<number>()
    if (!q) return s
    const muestra = indices.slice(0, 800)
    tabla.columnas.forEach((c, k) => { const n = c.normal ?? c.textos.map(normalizar); if (muestra.some(i => n[i]?.includes(q))) s.add(k) })
    return s
  }, [q, indices, tabla])
  const posicionFija = (pos: number) => gutter + xs[pos]
  const celdaCabeza = (pos: number) => {
    const { k, w } = cols[pos]
    const c = tabla.columnas[k]
    const ord = orden?.col === k ? orden.dir : 0
    const fijo = pos < fijas
    return <div key={k} role="columnheader" className={t.th} data-num={esNumerica(c) || undefined} data-orden={ord || undefined} data-filtro={filtroActivo(filtros.get(k)) || undefined}
      data-col-sel={selCol === k || undefined} data-fija={fijo || undefined} data-hallada={halladas.has(k) || undefined} style={{ width: w, ...(fijo ? { left: posicionFija(pos) } : {}) }}
      aria-sort={ord === 1 ? 'ascending' : ord === -1 ? 'descending' : 'none'}>
      {/* Con ratón, el encabezado ordena y el embudo filtra; con el dedo (sin hover) el encabezado abre el embudo, que trae los dos. */}
      <button type="button" className={t.thBoton} onClick={e => { if (sinPuntero()) abrirEmbudo(k, e.currentTarget.parentElement!); else alOrdenar(k) }} title={tr('Ordenar por «{col}»', { col: c.nombre })}>
        {letras && tabla.encabezado && <span className={t.letra}>{c.letra}</span>}
        <span className={t.thNombre}>{c.nombre}</span>
        <Glifo c={c} />
        <span className={t.flecha} aria-hidden>{ord === -1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}</span>
      </button>
      <button type="button" className={t.embudo} onClick={e => { e.stopPropagation(); abrirEmbudo(k, e.currentTarget.parentElement!) }} aria-label={tr('Filtrar «{col}»', { col: c.nombre })} title={tr('Filtrar y ordenar')}>
        <Filter size={12} aria-hidden />
      </button>
      <span className={t.asa} onPointerDown={e => arrastrar(k, e)} onDoubleClick={() => autoAjustar(k)} title={tr('Arrastra para cambiar el ancho · doble clic: a su medida')} aria-hidden />
    </div>
  }

  const filasPintadas: React.ReactNode[] = []
  for (let r = r0; r < r1; r++) {
    const i = indices[r]
    filasPintadas.push(<Fila key={r} r={r} i={i} tabla={tabla} cols={cols} xs={xs} c0={c0} c1={c1} fijas={fijas} anchoFijas={anchoFijas} gutter={gutter} total={total}
      q={q} selC={sel && sel.r === r ? sel.c : -1} setSel={setSel} entra={entrando && r < 26} combinadas={conCombinadas ? tabla.combinadas.get(i) : undefined} />)
  }

  return <div ref={caja} className={t.rejilla} tabIndex={0} onScroll={alDesplazar} onKeyDown={alTeclado} role="grid" aria-rowcount={n + 1} aria-colcount={cols.length}
    aria-label={tr('Tabla')} style={{ ['--gutter' as string]: `${gutter}px` }}>
    <div className={t.lienzo} style={{ width: gutter + total, height: ALTO_CAB + n * ALTO }}>
      <div className={t.cabeza} role="row" style={{ width: gutter + total, height: ALTO_CAB }}>
        <div className={t.esquina} style={{ width: gutter }} aria-hidden>{n.toLocaleString(localeIntl())}</div>
        {Array.from({ length: fijas }, (_, p) => celdaCabeza(p))}
        <div className={t.hueco} style={{ width: xs[c0] - anchoFijas }} />
        {Array.from({ length: c1 - c0 }, (_, j) => celdaCabeza(c0 + j))}
      </div>
      <div className={t.cuerpo} style={{ height: n * ALTO }} data-pulso={pulso ? (pulso % 2 ? 'a' : 'b') : undefined}>{filasPintadas}</div>
    </div>
  </div>
}

interface PropsFila {
  r: number; i: number; tabla: Tabla; cols: { k: number; w: number }[]; xs: number[]; c0: number; c1: number; fijas: number; anchoFijas: number; gutter: number; total: number
  q: string; selC: number; setSel: (s: Seleccion | null) => void; entra: boolean; combinadas?: { c0: number; c1: number }[]
}

const Fila = memo(function Fila({ r, i, tabla, cols, xs, c0, c1, fijas, anchoFijas, gutter, total, q, selC, setSel, entra, combinadas }: PropsFila) {
  const celda = (pos: number, ancho?: number) => {
    const { k, w } = cols[pos]
    const c = tabla.columnas[k]
    const texto = c.textos[i] ?? ''
    const fija = pos < fijas
    let cuerpo: React.ReactNode = texto
    let hallada = false
    if (q && texto) {
      const nt = normalizar(texto), j = nt.indexOf(q)
      if (j >= 0) { hallada = true; if (nt.length === texto.length) cuerpo = <>{texto.slice(0, j)}<mark>{texto.slice(j, j + q.length)}</mark>{texto.slice(j + q.length)}</> }
    }
    return <div key={k} role="gridcell" className={t.td} data-num={esNumerica(c) || undefined} data-centro={c.tipo === 'booleano' || undefined} data-rojo={c.rojos[i] || undefined}
      data-sel={selC === k || undefined} data-hallada={hallada || undefined} data-fija={fija || undefined} data-error={/^#[A-Z/0!?]+[!?A]?$/.test(texto) || undefined}
      style={{ width: ancho ?? w, ...(fija ? { left: gutter + xs[pos] } : {}) }} title={texto.length > 28 ? texto : undefined}
      onMouseDown={() => setSel({ r, c: k })}>{cuerpo}</div>
  }
  const pintadas: React.ReactNode[] = []
  let desde = c0
  // Una combinada que empieza antes del rango visible se pinta desde su inicio (si no, su texto desaparece al desplazar).
  const comb = combinadas?.slice().sort((a, b) => a.c0 - b.c0)
  if (comb) for (const m of comb) { const p0 = cols.findIndex(x => x.k === m.c0); if (p0 >= fijas && p0 < desde && cols.findIndex(x => x.k === m.c1) >= desde) desde = p0 }
  for (let p = desde; p < c1; p++) {
    const m = comb?.find(x => x.c0 === cols[p].k)
    if (m) {
      const p1 = cols.findIndex(x => x.k === m.c1)
      if (p1 > p) { pintadas.push(celda(p, xs[p1 + 1] - xs[p])); p = p1; continue }
    }
    pintadas.push(celda(p))
  }
  return <div className={t.fila} role="row" data-par={r % 2 || undefined} data-fila-sel={selC >= 0 || undefined} data-entra={entra || undefined}
    style={{ top: r * ALTO, width: gutter + total, ...(entra ? { ['--i' as string]: r } : {}) }}>
    <div className={t.numFila} style={{ width: gutter }}>{tabla.numeroFila[i]}</div>
    {Array.from({ length: fijas }, (_, p) => celda(p))}
    <div className={t.hueco} style={{ width: xs[desde] - anchoFijas }} />
    {pintadas}
  </div>
})

// ── Barra de estado: la celda elegida y el resumen de su columna ──
function Pie({ tabla, indices, sel, libro }: { tabla: Tabla; indices: number[]; sel: Seleccion | null; libro: LibroVista }) {
  const loc = localeIntl()
  const col = sel ? tabla.columnas[sel.c] : null
  const res = useMemo(() => col ? resumir(col, indices) : null, [col, indices])
  const i = sel ? indices[sel.r] : undefined
  const fechaTexto = (x: number) => { const ms = col?.fechaSerial ? serialAMs(x) : x; return new Date(ms).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }
  const decimales = col?.tipo === 'numero' ? Math.min(4, Math.max(0, ...col.textos.slice(0, 50).map(s => (/\.(\d+)/.exec(s)?.[1].length ?? 0)))) : 2
  return <div className={t.pie} aria-live="polite">
    <span className={t.cuentaFilas}>{indices.length === tabla.filas
      ? trn(tabla.filas, '1 fila', '{n} filas', { n: tabla.filas.toLocaleString(loc) })
      : tr('{n} de {total} filas', { n: indices.length.toLocaleString(loc), total: tabla.filas.toLocaleString(loc) })}
      <i>· {trn(tabla.columnas.length, '1 columna', '{n} columnas', { n: tabla.columnas.length })}</i>
      {tabla.recortada && <i>· {tr('recortada')}</i>}</span>
    {col && i != null && <span className={t.celda}>
      <b>{col.letra}{tabla.numeroFila[i]}</b>
      <span className={t.valor}>{col.textos[i] || <em>{tr('vacía')}</em>}</span>
      {col.formulas?.[i] && <code title={`=${col.formulas[i]}`}>={col.formulas[i]}</code>}
    </span>}
    {res && col && <span className={t.resumen}>
      {res.suma != null ? <>
        <span><i>Σ</i>{cifra(res.suma, loc, decimales)}</span>
        <span><i>{tr('prom.')}</i>{cifra(res.promedio!, loc, decimales)}</span>
        <span><i>{tr('mín.')}</i>{cifra(res.min!, loc, decimales)}</span>
        <span><i>{tr('máx.')}</i>{cifra(res.max!, loc, decimales)}</span>
      </> : res.min != null && col.tipo === 'fecha' ? <span><i>{tr('del')}</i>{fechaTexto(res.min)} <i>{tr('al')}</i>{fechaTexto(res.max!)}</span>
        : <><span><i>{tr('llenas')}</i>{res.llenas.toLocaleString(loc)}</span><span><i>{tr('distintos')}</i>{res.distintos.toLocaleString(loc)}</span></>}
    </span>}
    {!col && <span className={t.ayudaPie}>{tr('Toca una celda: aquí verás su valor y el resumen de su columna.')}</span>}
    {libro.ms > 400 && !col && <span className={t.ayudaPie}>{tr('leída en {s} s', { s: (libro.ms / 1000).toFixed(1) })}</span>}
  </div>
}

// ── El embudo: ordenar y filtrar UNA columna ──
function Embudo({ col, k, tabla, x, y, filtro, orden, alOrdenar, ponerFiltro, cerrar }: {
  col: Columna; k: number; tabla: Tabla; x: number; y: number; filtro?: FiltroColumna; orden: Orden | null
  alOrdenar: (k: number, dir?: 1 | -1) => void; ponerFiltro: (k: number, f: FiltroColumna | null) => void; cerrar: () => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(`.${t.embudo}`)) cerrar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('pointerdown', fuera, true); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla) }
  }, [cerrar])
  const todos = useMemo(() => Array.from({ length: tabla.filas }, (_, i) => i), [tabla])
  const numerica = esNumerica(col)
  const loc = localeIntl()
  const ord = orden?.col === k ? orden.dir : 0
  return <div ref={caja} className={t.pop} style={{ left: x, top: y }} role="dialog" aria-label={tr('Filtrar «{col}»', { col: col.nombre })}>
    <header>
      <b>{col.nombre}</b>
      <span>{tr(col.tipo === 'numero' ? (col.porcentaje ? 'porcentajes' : col.moneda ? 'montos' : 'números') : col.tipo === 'fecha' ? 'fechas' : col.tipo === 'booleano' ? 'sí o no' : 'texto')}</span>
    </header>
    <div className={t.ordenes}>
      <button type="button" aria-pressed={ord === 1} onClick={() => alOrdenar(k, 1)}><ArrowUp size={12} aria-hidden />{numerica ? (col.tipo === 'fecha' ? tr('Antiguas primero') : tr('Menor a mayor')) : 'A → Z'}</button>
      <button type="button" aria-pressed={ord === -1} onClick={() => alOrdenar(k, -1)}><ArrowDown size={12} aria-hidden />{numerica ? (col.tipo === 'fecha' ? tr('Recientes primero') : tr('Mayor a menor')) : 'Z → A'}</button>
    </div>
    {numerica ? <Rango col={col} k={k} todos={todos} filtro={filtro} ponerFiltro={ponerFiltro} loc={loc} />
      : <Valores col={col} k={k} todos={todos} filtro={filtro} ponerFiltro={ponerFiltro} loc={loc} />}
    <footer>
      {filtroActivo(filtro) ? <button type="button" className={t.limpiar} onClick={() => ponerFiltro(k, null)}><FilterX size={12} aria-hidden />{tr('Quitar filtro')}</button> : <span />}
      <button type="button" className={t.listo} onClick={cerrar}><Check size={13} aria-hidden />{tr('Listo')}</button>
    </footer>
  </div>
}

function Valores({ col, k, todos, filtro, ponerFiltro, loc }: { col: Columna; k: number; todos: number[]; filtro?: FiltroColumna; ponerFiltro: (k: number, f: FiltroColumna | null) => void; loc: string }) {
  const lista = useMemo(() => frecuentes(col, todos, 400), [col, todos])
  const distintos = useMemo(() => new Set(col.textos).size, [col])
  const contiene = filtro?.contiene ?? ''
  const nq = normalizar(contiene.trim())
  const vistos = nq ? lista.filter(x => normalizar(x.texto).includes(nq)) : lista
  const marcados = filtro?.valores
  const marcado = (s: string) => !marcados || marcados.has(s)
  const alternar = (s: string) => {
    const base = new Set(marcados ?? lista.map(x => x.texto))
    if (base.has(s)) base.delete(s); else base.add(s)
    ponerFiltro(k, { ...filtro, valores: base.size === lista.length && distintos === lista.length ? undefined : base })
  }
  const max = lista[0]?.n ?? 1
  return <div className={t.valores}>
    <label className={t.campo}><Search size={12} aria-hidden /><input autoFocus placeholder={tr('Contiene…')} value={contiene} onChange={e => ponerFiltro(k, { ...filtro, contiene: e.target.value })} aria-label={tr('Filas que contienen')} /></label>
    <div className={t.todos}>
      <button type="button" onClick={() => ponerFiltro(k, { ...filtro, valores: undefined })}>{tr('Todos')}</button>
      <button type="button" onClick={() => ponerFiltro(k, { ...filtro, valores: new Set() })}>{tr('Ninguno')}</button>
      <span>{trn(distintos, '1 valor', '{n} valores', { n: distintos.toLocaleString(loc) })}</span>
    </div>
    <ul role="listbox" aria-multiselectable>
      {vistos.slice(0, 250).map((x, j) => <li key={x.texto} role="option" aria-selected={marcado(x.texto)} onClick={() => alternar(x.texto)} style={{ ['--i' as string]: Math.min(j, 14) }}>
        <span className={t.casilla} aria-hidden>{marcado(x.texto) && <Check size={11} strokeWidth={3} />}</span>
        <span className={t.valorTexto}>{x.texto === '' ? <em>{tr('(vacío)')}</em> : x.texto}</span>
        <span className={t.barraValor} style={{ ['--p' as string]: x.n / max }} aria-hidden />
        <small>{x.n.toLocaleString(loc)}</small>
      </li>)}
    </ul>
    {lista.length < distintos && <p className={t.nota}>{tr('Se listan los {n} más frecuentes; «Contiene…» busca en todos.', { n: lista.length })}</p>}
  </div>
}

const aFechaInput = (v: number | undefined, serial: boolean) => v == null ? '' : new Date(serial ? serialAMs(v) : v).toISOString().slice(0, 10)
const deFechaInput = (s: string, serial: boolean, fin: boolean) => { if (!s) return undefined; const ms = Date.parse(`${s}T${fin ? '23:59:59.999' : '00:00:00'}Z`); return Number.isFinite(ms) ? (serial ? msASerial(ms) : ms) : undefined }

function Rango({ col, k, todos, filtro, ponerFiltro, loc }: { col: Columna; k: number; todos: number[]; filtro?: FiltroColumna; ponerFiltro: (k: number, f: FiltroColumna | null) => void; loc: string }) {
  const h = useMemo(() => histograma(col, todos, 32), [col, todos])
  if (!h) return <p className={t.nota}>{tr('Esta columna no trae valores numéricos.')}</p>
  const fecha = col.tipo === 'fecha', serial = !!col.fechaSerial
  const lo = filtro?.min ?? h.min, hi = filtro?.max ?? h.max
  const tope = Math.max(...h.cuentas, 1)
  const paso = (h.max - h.min) / h.cuentas.length || 1
  const dentro = (j: number) => h.min + (j + 1) * paso >= lo && h.min + j * paso <= hi
  const etiqueta = (x: number) => fecha ? new Date(serial ? serialAMs(x) : x).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : cifra(x, loc)
  const poner = (min?: number, max?: number) => ponerFiltro(k, { ...filtro, min, max })
  return <div className={t.rango}>
    <svg viewBox={`0 0 ${h.cuentas.length * 10} 60`} preserveAspectRatio="none" className={t.histograma} aria-hidden>
      {h.cuentas.map((n, j) => <rect key={j} x={j * 10 + 1} width={8} y={60 - Math.max(n ? 2 : 0, n / tope * 58)} height={Math.max(n ? 2 : 0, n / tope * 58)} rx={1.5}
        data-dentro={dentro(j) || undefined} style={{ ['--i' as string]: j }} />)}
    </svg>
    <div className={t.extremos}><span>{etiqueta(h.min)}</span><span>{etiqueta(h.max)}</span></div>
    <div className={t.entradas}>
      {fecha ? <>
        <label>{tr('Desde')}<input type="date" value={aFechaInput(filtro?.min, serial)} onChange={e => poner(deFechaInput(e.target.value, serial, false), filtro?.max)} /></label>
        <label>{tr('Hasta')}<input type="date" value={aFechaInput(filtro?.max, serial)} onChange={e => poner(filtro?.min, deFechaInput(e.target.value, serial, true))} /></label>
      </> : <>
        <label>{tr('Mínimo')}<input type="number" inputMode="decimal" step="any" placeholder={cifra(h.min, loc)} value={filtro?.min ?? ''} onChange={e => poner(e.target.value === '' ? undefined : Number(e.target.value), filtro?.max)} /></label>
        <label>{tr('Máximo')}<input type="number" inputMode="decimal" step="any" placeholder={cifra(h.max, loc)} value={filtro?.max ?? ''} onChange={e => poner(filtro?.min, e.target.value === '' ? undefined : Number(e.target.value))} /></label>
      </>}
    </div>
  </div>
}
