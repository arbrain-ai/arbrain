'use client'
/**
 * Visor de PDF (8 oct 2026). Objetivo: que «ábreme este PDF» se lea mejor aquí que en Vista Previa.
 *
 * Oficio tomado de Preview y Quick Look, no su interfaz: desplazamiento continuo con páginas que se pintan al acercarse
 * (y se sueltan al alejarse, así un libro de 400 páginas no come la memoria), ajuste al ancho por defecto, zoom por
 * botones, teclado o pellizco, búsqueda que cuenta («3 de 12») y pinta cada coincidencia sobre la página, miniaturas,
 * texto de verdad seleccionable y, lo propio de Arbrain, un botón sobre la selección para preguntarle a Levy con la
 * página y el archivo ya dichos. Recuerda por documento la página y el zoom donde lo dejaste.
 *
 * Lector de libros (14 nov 2026, visor de documentos): el índice del PDF (su tabla de contenido real, con el capítulo en
 * curso marcado y su nombre en la barra), papel claro, sepia o noche (Papel.tsx, el mismo del Word), una línea de oro con lo
 * leído y «Abrir en su app». Un libro de 300 o 900 páginas abre en lo que tarda la primera.
 *
 * Motor: pdf.js (worker aparte). Fuentes estándar y mapas de caracteres vienen de /pdfjs/ (public), no de un CDN.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { ChevronDown, ChevronUp, Minus, MoveHorizontal, PanelLeft, Plus, Search, Send, X } from 'lucide-react'
import { BotonAbrirEnApp } from './BotonAbrirEnApp'
import { SelectorPapel, usePapel } from './Papel'
import { indiceUtil } from './indice-pdf'
import { buscarEnPiezas, mensajePdf, type Pieza } from '../../documento/medio'
import { pedirALevy } from '../../documento/enviar'
import { BotonDescargar } from './BotonDescargar'
import v from './visor.module.css'
import { tr } from '@/shared/i18n'

type PdfJs = typeof import('pdfjs-dist')
let motor: Promise<PdfJs> | null = null
const cargarMotor = () => (motor ??= import('pdfjs-dist/webpack.mjs') as Promise<PdfJs>)

interface Tam { w: number; h: number }
interface Rect { x: number; y: number; w: number; h: number }
/** Una coincidencia: sus trozos de texto (para pintarla exacta sobre la capa de texto) y su caja aproximada (para saber a dónde desplazarse sin haber pintado la página). */
interface Hallazgo { pagina: number; trozos: { pieza: number; ini: number; fin: number }[]; aprox: Rect[] }
interface Coincidencia { trozos: Hallazgo['trozos']; activo: boolean }
interface Elemento { str: string; transform: number[]; width: number; height: number; hasEOL: boolean }
/** Una entrada del índice del libro, ya con su página. */
interface Capitulo { titulo: string; nivel: number; pagina: number | null }
interface EntradaIndice { title: string; dest: unknown; items?: EntradaIndice[] }

/** El índice (outline) del PDF aplanado, con la página de cada entrada resuelta. Hasta 3 niveles y 800 entradas. */
async function leerIndice(doc: PDFDocumentProxy): Promise<Capitulo[]> {
  const raiz = (await doc.getOutline().catch(() => null)) as EntradaIndice[] | null
  if (!raiz?.length) return []
  const out: Capitulo[] = []
  const recorrer = async (items: EntradaIndice[], nivel: number) => {
    for (const it of items) {
      if (out.length >= 800) return
      let pagina: number | null = null
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
        const ref = Array.isArray(dest) ? dest[0] : null
        if (ref && typeof ref === 'object') pagina = (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1
        else if (typeof ref === 'number') pagina = ref + 1
      } catch { /* entrada sin destino: se lista sin página */ }
      out.push({ titulo: (it.title ?? '').replace(/\s+/g, ' ').trim() || '—', nivel, pagina })
      if (it.items?.length && nivel < 2) await recorrer(it.items, nivel + 1)
    }
  }
  await recorrer(raiz, 0)
  return indiceUtil(out, doc.numPages) ? out : []
}

const MIN = 0.25, MAX = 5, MARGEN = 14, ESPACIO = 10, ANCHO_LECTURA = 920
const LLAVE = (ruta: string) => `arbrain-pdf:${ruta}`
const acotar = (x: number) => Math.min(MAX, Math.max(MIN, x))

function recordar(ruta: string): { pagina: number; modo: 'ancho' | number } | null {
  try { const j = JSON.parse(window.localStorage.getItem(LLAVE(ruta)) ?? 'null'); return j && Number.isInteger(j.pagina) ? { pagina: j.pagina, modo: j.modo === 'ancho' || typeof j.modo === 'number' ? j.modo : 'ancho' } : null } catch { return null }
}

/** Rectángulo (en unidades de la página a escala 1) de los caracteres [ini, fin) de un trozo de texto. */
function rectDe(it: Elemento, ini: number, fin: number, vp: { convertToViewportPoint(x: number, y: number): number[] }): Rect {
  const len = Math.max(1, it.str.length)
  const alto = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10
  const x0 = it.transform[4] + it.width * (ini / len), ancho = it.width * ((fin - ini) / len)
  const a = vp.convertToViewportPoint(x0, it.transform[5] - alto * 0.22), b = vp.convertToViewportPoint(x0 + ancho, it.transform[5] + alto * 0.82)
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }
}

export function VisorPdf({ url, archivo, ruta, grande, descarga }: { url: string; archivo: string; ruta: string; grande?: boolean; descarga?: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [tams, setTams] = useState<Tam[]>([])
  const guardado = useMemo(() => typeof window === 'undefined' ? null : recordar(ruta), [ruta])
  const [modo, setModo] = useState<'ancho' | number>(guardado?.modo ?? 'ancho')
  const [pagina, setPagina] = useState(guardado?.pagina ?? 1)
  const [miniaturas, setMiniaturas] = useState<boolean | null>(null)
  const [indice, setIndice] = useState<Capitulo[]>([])
  const [lateral, setLateral] = useState<'paginas' | 'indice' | null>(null)
  const [papel, setPapel] = usePapel()
  const [ancho, setAncho] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const paginas = useRef(new Map<number, HTMLElement>())
  const irA = useRef<number | null>(guardado?.pagina && guardado.pagina > 1 ? guardado.pagina : null)
  const registrar = useCallback((n: number, el: HTMLElement | null) => { if (el) paginas.current.set(n, el); else paginas.current.delete(n) }, [])

  // ── Cargar el documento ──
  useEffect(() => {
    let cancelado = false
    let tarea: { destroy(): Promise<void> } | null = null
    setDoc(null); setError(null); setProgreso(0); setIndice([])
    ;(async () => {
      const pdfjs = await cargarMotor()
      const t = pdfjs.getDocument({ url, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' })
      tarea = t
      t.onProgress = ({ loaded, total }: { loaded: number; total: number }) => { if (!cancelado && total) setProgreso(loaded / total) }
      const d = await t.promise
      if (cancelado) return
      const primera = await d.getPage(1)
      const p1 = primera.getViewport({ scale: 1 })
      const tamanos: Tam[] = Array.from({ length: d.numPages }, () => ({ w: p1.width, h: p1.height }))
      setTams(tamanos); setDoc(d)
      void leerIndice(d).then(x => { if (!cancelado) setIndice(x) })
      // El tamaño real de cada página se pide en segundo plano: un PDF con páginas mixtas (horizontales, carta, A4) las acomoda sin saltos mayores.
      for (let i = 2; i <= d.numPages && !cancelado; i++) {
        const p = await d.getPage(i)
        const vp = p.getViewport({ scale: 1 })
        if (Math.abs(vp.width - tamanos[i - 1].w) > 0.5 || Math.abs(vp.height - tamanos[i - 1].h) > 0.5) {
          tamanos[i - 1] = { w: vp.width, h: vp.height }
          if (i % 10 === 0 || i === d.numPages) setTams([...tamanos])
        }
      }
      if (!cancelado) setTams([...tamanos])
    })().catch(e => { if (!cancelado) setError(e instanceof Error ? e.message : tr('No se pudo abrir el PDF.')) })
    return () => { cancelado = true; void tarea?.destroy() }
  }, [url])

  // ── Ancho de la caja → ajuste al ancho ──
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setAncho(el.clientWidth)
    medir()
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [])
  const mostrarMiniaturas = miniaturas ?? (typeof window !== 'undefined' && (raiz.current?.clientWidth ?? 0) >= 780)
  // Ajustar al ancho, con tope de lectura: en un panel ancho la página queda como un libro sobre el escritorio (no a 260 %).
  const anchoUtil = Math.max(120, Math.min(ancho - 2 * MARGEN, ANCHO_LECTURA))
  const ajuste = tams[0] ? acotar(anchoUtil / tams[0].w) : 1
  const escala = modo === 'ancho' ? ajuste : acotar(modo)

  // El zoom no debe mover lo que estás leyendo: se conserva la proporción del scroll.
  const antes = useRef<{ escala: number; fraccion: number } | null>(null)
  useLayoutEffect(() => {
    const el = caja.current; if (!el) return
    const previa = antes.current
    if (previa && Math.abs(previa.escala - escala) > 1e-6) el.scrollTop = previa.fraccion * el.scrollHeight
    antes.current = { escala, fraccion: el.scrollHeight ? el.scrollTop / el.scrollHeight : 0 }
  }, [escala])

  const irAPagina = useCallback((n: number, suave = true) => {
    const el = paginas.current.get(n), c = caja.current
    if (!el || !c) return
    c.scrollTo({ top: el.offsetTop - MARGEN, behavior: suave ? 'smooth' : 'auto' })
  }, [])

  // Al abrir, vuelve a donde lo dejaste (cuando ya hay páginas medidas).
  useEffect(() => {
    if (doc && irA.current && paginas.current.size >= Math.min(irA.current, doc.numPages)) { const n = Math.min(irA.current, doc.numPages); irA.current = null; requestAnimationFrame(() => irAPagina(n, false)) }
  }, [doc, tams, irAPagina])

  // ── Qué página se está leyendo ──
  const hilo = useRef(0)
  const alDesplazar = () => {
    if (hilo.current) return
    hilo.current = requestAnimationFrame(() => {
      hilo.current = 0
      const c = caja.current; if (!c) return
      const linea = c.scrollTop + c.clientHeight / 3
      let actual = 1
      for (const [n, el] of paginas.current) if (el.offsetTop <= linea) actual = Math.max(actual, n)
      setPagina(actual)
    })
  }
  useEffect(() => {
    if (!doc) return
    const t = window.setTimeout(() => { try { window.localStorage.setItem(LLAVE(ruta), JSON.stringify({ pagina, modo })) } catch { /* modo privado */ } }, 400)
    return () => window.clearTimeout(t)
  }, [pagina, modo, ruta, doc])

  // ── Texto de cada página (una sola vez) ──
  const textos = useRef(new Map<number, Promise<Elemento[]>>())
  const textoDe = useCallback((n: number): Promise<Elemento[]> => {
    let p = textos.current.get(n)
    if (!p && doc) {
      p = doc.getPage(n).then(pg => pg.getTextContent()).then(tc => tc.items.filter((i): i is Extract<typeof i, { str: string; transform: number[] }> => 'str' in i && 'transform' in i).map(i => ({ str: i.str, transform: i.transform, width: i.width, height: i.height, hasEOL: i.hasEOL })))
      textos.current.set(n, p)
    }
    return p ?? Promise.resolve([])
  }, [doc])
  useEffect(() => { textos.current = new Map() }, [doc])

  // ── Búsqueda ──
  const [consulta, setConsulta] = useState('')
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [activo, setActivo] = useState(0)
  const [buscando, setBuscando] = useState<number | null>(null)
  const entrada = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!doc) return
    const q = consulta.trim()
    if (q.length < 2) { setHallazgos([]); setActivo(0); setBuscando(null); return }
    let vigente = true
    const t = window.setTimeout(async () => {
      const todos: Hallazgo[] = []
      setHallazgos([]); setActivo(0)
      for (let n = 1; n <= doc.numPages && vigente; n++) {
        if (n % 8 === 1 || n === doc.numPages) setBuscando(n)
        const items = await textoDe(n)
        const piezas: Pieza[] = items.map((it, i) => {
          const prev = items[i - 1]
          const junto = !!prev && !prev.hasEOL && Math.abs(it.transform[4] - (prev.transform[4] + prev.width)) < 0.18 * Math.max(1, Math.abs(it.transform[0]))
          return { texto: it.str, junto }
        })
        const encontrados = buscarEnPiezas(piezas, q)
        if (encontrados.length) {
          const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 })
          for (const trozos of encontrados) todos.push({ pagina: n, trozos: trozos.map(t2 => ({ pieza: t2.pieza, ini: t2.ini, fin: t2.fin })), aprox: trozos.map(t2 => rectDe(items[t2.pieza], t2.ini, t2.fin, vp)) })
          if (vigente) setHallazgos([...todos])
        }
      }
      if (vigente) { setBuscando(null); setHallazgos([...todos]) }
    }, 280)
    return () => { vigente = false; window.clearTimeout(t) }
  }, [consulta, doc, textoDe])

  const verHallazgo = useCallback((i: number) => {
    const h = hallazgos[i]; const c = caja.current, el = h && paginas.current.get(h.pagina)
    if (!h || !c || !el) return
    const y = el.offsetTop + Math.min(...h.aprox.map(r => r.y)) * escala
    const visible = y > c.scrollTop + 40 && y < c.scrollTop + c.clientHeight - 80
    if (!visible) c.scrollTo({ top: Math.max(0, y - c.clientHeight / 3), behavior: 'smooth' })
  }, [hallazgos, escala])
  const mover = (d: number) => {
    if (!hallazgos.length) return
    const i = (activo + d + hallazgos.length) % hallazgos.length
    setActivo(i); verHallazgo(i)
  }
  useEffect(() => { if (hallazgos.length && activo === 0) verHallazgo(0) }, [hallazgos.length > 0, consulta]) // eslint-disable-line react-hooks/exhaustive-deps
  const resaltesPor = useMemo(() => {
    const m = new Map<number, Coincidencia[]>()
    hallazgos.forEach((h, i) => { const l = m.get(h.pagina) ?? []; l.push({ trozos: h.trozos, activo: i === activo }); m.set(h.pagina, l) })
    return m
  }, [hallazgos, activo])

  // ── Selección → preguntar a Levy ──
  const [sel, setSel] = useState<{ texto: string; pagina: number; x: number; y: number } | null>(null)
  const [preguntando, setPreguntando] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [enviado, setEnviado] = useState(false)
  const leerSeleccion = () => {
    if (preguntando) return
    const s = window.getSelection()
    const texto = s && !s.isCollapsed ? s.toString().trim() : ''
    if (!texto || !s || !s.rangeCount) { setSel(null); return }
    // Un arrastre rara vez cae justo en el borde de una palabra: la cita se completa a palabras enteras (y la selección también).
    const rango = s.getRangeAt(0)
    const alBorde = (nodo: Node, desde: number, paso: 1 | -1) => {
      if (nodo.nodeType !== Node.TEXT_NODE) return desde
      const t = (nodo as Text).data; let i = desde
      while (paso === 1 ? i < t.length && /\S/.test(t[i]) : i > 0 && /\S/.test(t[i - 1])) i += paso
      return i
    }
    try {
      rango.setStart(rango.startContainer, alBorde(rango.startContainer, rango.startOffset, -1))
      rango.setEnd(rango.endContainer, alBorde(rango.endContainer, rango.endOffset, 1))
      s.removeAllRanges(); s.addRange(rango)
    } catch { /* se queda con lo que eligió */ }
    const completo = rango.toString().trim() || texto
    const el = (rango.startContainer instanceof Element ? rango.startContainer : rango.startContainer.parentElement)?.closest<HTMLElement>('[data-pagina]')
    if (!el || !caja.current?.contains(el)) { setSel(null); return }
    const r = rango.getBoundingClientRect(), c = raiz.current!.getBoundingClientRect()
    setSel({ texto: completo, pagina: Number(el.dataset.pagina), x: Math.min(Math.max(r.left + r.width / 2 - c.left, 90), c.width - 90), y: r.top - c.top })
    setEnviado(false)
  }
  useEffect(() => {
    const al = () => { if (preguntando) return; const s = window.getSelection(); if (!s || s.isCollapsed) setSel(null) }
    document.addEventListener('selectionchange', al); return () => document.removeEventListener('selectionchange', al)
  }, [preguntando])
  const enviar = () => {
    if (!sel) return
    pedirALevy(mensajePdf({ archivo, ruta, pagina: sel.pagina, seleccion: sel.texto, pregunta }))
    setEnviado(true); setPreguntando(false); setPregunta(''); window.getSelection()?.removeAllRanges()
    window.setTimeout(() => { setSel(null); setEnviado(false) }, 2600)
  }

  // ── Zoom y teclado ──
  const zoom = (f: number) => setModo(escala * f)
  useEffect(() => { // React registra `wheel` como pasivo: para poder frenar el zoom del navegador se escucha a mano.
    const el = caja.current; if (!el) return
    const al = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setModo(m => acotar((m === 'ancho' ? ajuste : m) * Math.exp(-e.deltaY * 0.01))) } }
    el.addEventListener('wheel', al, { passive: false }); return () => el.removeEventListener('wheel', al)
  }, [ajuste])
  const alTeclado = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); entrada.current?.focus(); entrada.current?.select(); return }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const enCampo = (e.target as HTMLElement).closest('input, textarea')
    if (enCampo) return
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.2) }
    else if (e.key === '-') { e.preventDefault(); zoom(1 / 1.2) }
    else if (e.key === '0') { e.preventDefault(); setModo('ancho') }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' && e.shiftKey) { e.preventDefault(); irAPagina(Math.min(doc?.numPages ?? 1, pagina + 1)) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' && e.shiftKey) { e.preventDefault(); irAPagina(Math.max(1, pagina - 1)) }
    else if (e.key === 'g') { e.preventDefault(); const n = Number(window.prompt(tr('Ir a la página'))); if (n >= 1) irAPagina(Math.min(n, doc?.numPages ?? 1)) }
  }

  const total = doc?.numPages ?? 0
  const conIndice = indice.filter(c => c.pagina != null).length >= 2
  const vistaLateral = lateral ?? (conIndice ? 'indice' : 'paginas')
  // El capítulo en curso: la última entrada que empieza en o antes de la página que se lee.
  const capituloActual = useMemo(() => { let k = -1; indice.forEach((c, i) => { if (c.pagina != null && c.pagina <= pagina && (k < 0 || c.pagina >= (indice[k].pagina ?? 0))) k = i }); return k }, [indice, pagina])
  const capituloPrincipal = useMemo(() => { for (let i = capituloActual; i >= 0; i--) if (indice[i].nivel === 0) return indice[i]; return capituloActual >= 0 ? indice[capituloActual] : null }, [indice, capituloActual])
  // Si no se puede pintar, al menos se puede bajar (12 nov 2026): el original abre en la app de PDF del equipo.
  if (error) return <p className={v.aviso} role="alert">{error}<BotonDescargar url={descarga} nombre={archivo} className={v.icono} /></p>

  return <div ref={raiz} className={v.pdf} data-grande={grande || undefined} data-miniaturas={mostrarMiniaturas || undefined}>
    <div className={v.barraPdf} role="toolbar" aria-label={tr('Controles del PDF')}>
      <button type="button" className={v.icono} aria-pressed={mostrarMiniaturas} aria-label={tr('Miniaturas')} title={tr('Miniaturas')} onClick={() => setMiniaturas(!mostrarMiniaturas)}><PanelLeft size={15} aria-hidden /></button>
      <div className={v.paginaCampo} title={tr('Página')} data-capitulo={capituloPrincipal ? '' : undefined}>
        <input aria-label={tr('Página actual')} inputMode="numeric" value={pagina} onChange={e => setPagina(Number(e.target.value.replace(/\D/g, '')) || 1)}
          onKeyDown={e => { if (e.key === 'Enter') irAPagina(Math.min(Math.max(1, pagina), total || 1)) }} onFocus={e => e.currentTarget.select()} />
        <span>/ {total || '…'}</span>
      </div>
      {capituloPrincipal && <span className={v.capitulo} title={capituloPrincipal.titulo} key={capituloPrincipal.titulo}>{capituloPrincipal.titulo}</span>}
      <div className={v.grupo}>
        <button type="button" className={v.icono} aria-label={tr('Alejar')} title={tr('Alejar (-)')} onClick={() => zoom(1 / 1.2)}><Minus size={15} aria-hidden /></button>
        <button type="button" className={v.porcentaje} title={tr('Ajustar al ancho (0)')} onClick={() => setModo(modo === 'ancho' ? 1 : 'ancho')}>{Math.round(escala * 100)}%</button>
        <button type="button" className={v.icono} aria-label={tr('Acercar')} title={tr('Acercar (+)')} onClick={() => zoom(1.2)}><Plus size={15} aria-hidden /></button>
        <button type="button" className={v.icono} aria-label={tr('Ajustar al ancho')} aria-pressed={modo === 'ancho'} title={tr('Ajustar al ancho')} onClick={() => setModo('ancho')}><MoveHorizontal size={15} aria-hidden /></button>
      </div>
      <div className={v.busqueda}>
        <Search size={13} aria-hidden />
        <input ref={entrada} type="search" aria-label={tr('Buscar en el PDF')} placeholder={tr('Buscar')} value={consulta} onChange={e => setConsulta(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); mover(e.shiftKey ? -1 : 1) } else if (e.key === 'Escape') { setConsulta(''); caja.current?.focus() } }} />
        {consulta.trim().length >= 2 && <span className={v.cuenta} aria-live="polite">
          {hallazgos.length ? tr('{i} de {n}', { i: activo + 1, n: hallazgos.length }) : buscando ? tr('buscando {pagina}/{total}', { pagina: buscando, total }) : tr('sin resultados')}
          {hallazgos.length > 0 && buscando ? ` · ${buscando}/${total}` : ''}
        </span>}
        {hallazgos.length > 0 && <>
          <button type="button" className={v.mini} aria-label={tr('Anterior')} onClick={() => mover(-1)}><ChevronUp size={14} aria-hidden /></button>
          <button type="button" className={v.mini} aria-label={tr('Siguiente')} onClick={() => mover(1)}><ChevronDown size={14} aria-hidden /></button>
        </>}
        {consulta && <button type="button" className={v.mini} aria-label={tr('Limpiar búsqueda')} onClick={() => setConsulta('')}><X size={13} aria-hidden /></button>}
      </div>
      <SelectorPapel papel={papel} alCambiar={setPapel} className={v.papel} />
      <BotonAbrirEnApp ruta={ruta} className={v.icono} />
      <BotonDescargar url={descarga} nombre={archivo} className={v.icono} />
    </div>
    <span className={v.leido} style={{ transform: `scaleX(${total > 1 ? (pagina - 1) / (total - 1) : total ? 1 : 0})` }} aria-hidden />
    <div className={v.cuerpoPdf}>
      {mostrarMiniaturas && doc && <aside className={v.lateral} data-vista={vistaLateral}>
        {conIndice && <div className={v.lateralTabs} role="tablist" aria-label={tr('Ver')}>
          <button type="button" role="tab" aria-selected={vistaLateral === 'indice'} onClick={() => setLateral('indice')}>{tr('Índice')}</button>
          <button type="button" role="tab" aria-selected={vistaLateral === 'paginas'} onClick={() => setLateral('paginas')}>{tr('Páginas')}</button>
        </div>}
        {vistaLateral === 'indice' && conIndice ? <IndicePdf capitulos={indice} actual={capituloActual} alElegir={irAPagina} />
          : <nav className={v.miniaturas} aria-label={tr('Páginas')}>
            {tams.map((t, i) => <Miniatura key={i} doc={doc} n={i + 1} tam={t} actual={pagina === i + 1} alElegir={irAPagina} raiz={raiz} />)}
          </nav>}
      </aside>}
      <div ref={caja} className={v.paginas} data-papel={papel} tabIndex={0} role="document" aria-label={`PDF ${archivo}`} onScroll={alDesplazar} onKeyDown={alTeclado}
        onMouseUp={leerSeleccion} onKeyUp={e => { if (e.shiftKey) leerSeleccion() }}>
        {!doc && <div className={v.cargandoPdf} aria-busy="true"><span>{tr('Abriendo {archivo}…', { archivo })}</span>{progreso > 0 && progreso < 1 && <i style={{ ['--p' as string]: `${Math.round(progreso * 100)}%` }} />}</div>}
        {doc && tams.map((t, i) => <PaginaPdf key={i} doc={doc} n={i + 1} tam={t} escala={escala} caja={caja} resaltes={resaltesPor.get(i + 1)} registrar={registrar} />)}
      </div>
    </div>
    {sel && <div className={v.seleccion} style={{ left: sel.x, top: sel.y }} onMouseDown={e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}>
      {enviado ? <span className={v.enviado}>{tr('Levy lo recibió')}</span>
        : preguntando ? <form onSubmit={e => { e.preventDefault(); enviar() }}>
          <p>«{sel.texto.length > 140 ? sel.texto.slice(0, 140) + '…' : sel.texto}» <em>{tr('p. {pagina}', { pagina: sel.pagina })}</em></p>
          <div>
            <input autoFocus value={pregunta} onChange={e => setPregunta(e.target.value)} placeholder={tr('¿Qué quieres saber? (Enter envía)')} aria-label={tr('Pregunta para Levy')} onKeyDown={e => { if (e.key === 'Escape') { setPreguntando(false); setSel(null) } }} />
            <button type="submit" aria-label={tr('Enviar a Levy')}><Send size={13} aria-hidden /></button>
          </div>
        </form>
        : <button type="button" className={v.preguntar} onClick={() => setPreguntando(true)}>{tr('Preguntar a Levy')}<small>{tr('p. {pagina}', { pagina: sel.pagina })}</small></button>}
    </div>}
  </div>
}

// memo: al leer cambia la página en curso y el resto del visor se repinta; las 300 o 900 páginas no (sus props no cambian).
const PaginaPdf = memo(function PaginaPdf({ doc, n, tam, escala, caja, resaltes, registrar }: {
  doc: PDFDocumentProxy; n: number; tam: Tam; escala: number; caja: React.RefObject<HTMLDivElement | null>
  resaltes?: Coincidencia[]; registrar: (n: number, el: HTMLElement | null) => void
}) {
  const marco = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const capa = useRef<HTMLDivElement>(null)
  const [cerca, setCerca] = useState(n <= 2)
  const tarea = useRef<RenderTask | null>(null)
  const divs = useRef<HTMLElement[]>([])
  const [capaLista, setCapaLista] = useState(0)
  const [cajas, setCajas] = useState<{ x: number; y: number; w: number; h: number; activo: boolean }[]>([])
  useEffect(() => { registrar(n, marco.current); return () => registrar(n, null) }, [n, registrar])
  useEffect(() => {
    const el = marco.current; if (!el) return
    const o = new IntersectionObserver(es => setCerca(es.some(e => e.isIntersecting)), { root: caja.current, rootMargin: '900px 0px' })
    o.observe(el); return () => o.disconnect()
  }, [caja])

  useEffect(() => {
    const c = lienzo.current, t = capa.current; if (!c || !t) return
    if (!cerca) { c.width = 0; c.height = 0; t.replaceChildren(); return }
    let vigente = true
    ;(async () => {
      const pdfjs = await cargarMotor()
      const pagina = await doc.getPage(n)
      const vp = pagina.getViewport({ scale: escala })
      let salida = Math.min(window.devicePixelRatio || 1, 2)
      while (vp.width * vp.height * salida * salida > 20_000_000 && salida > 1) salida = Math.max(1, salida - 0.25)
      if (!vigente) return
      await tarea.current?.promise.catch(() => undefined)
      if (!vigente) return
      c.width = Math.floor(vp.width * salida); c.height = Math.floor(vp.height * salida)
      c.style.width = `${Math.floor(vp.width)}px`; c.style.height = `${Math.floor(vp.height)}px`
      const r = pagina.render({ canvas: c, viewport: vp, transform: salida !== 1 ? [salida, 0, 0, salida, 0, 0] : undefined, background: 'rgb(255,255,255)' })
      tarea.current = r
      await r.promise
      if (!vigente) return
      t.replaceChildren(); t.style.setProperty('--total-scale-factor', String(escala))
      const capaTexto = new pdfjs.TextLayer({ textContentSource: pagina.streamTextContent(), container: t, viewport: vp })
      await capaTexto.render()
      if (!vigente) return
      divs.current = capaTexto.textDivs as HTMLElement[]
      setCapaLista(k => k + 1)
    })().catch(e => { if (e?.name !== 'RenderingCancelledException') console.warn(`PDF p. ${n}:`, e) })
    return () => { vigente = false; tarea.current?.cancel() }
  }, [cerca, doc, n, escala])

  // Cada coincidencia se mide sobre la letra que ya está pintada (Range sobre la capa de texto): exacta con cualquier tipografía.
  useEffect(() => {
    const el = marco.current
    if (!el || !resaltes?.length || !capaLista) { setCajas([]); return }
    const base = el.getBoundingClientRect(), k = el.offsetWidth ? base.width / el.offsetWidth : 1
    const rs: typeof cajas = []
    for (const c of resaltes) for (const tz of c.trozos) {
      const nodo = divs.current[tz.pieza]?.firstChild
      if (!nodo || nodo.nodeType !== Node.TEXT_NODE) continue
      const largo = (nodo as Text).length
      const r = document.createRange(); r.setStart(nodo, Math.min(tz.ini, largo)); r.setEnd(nodo, Math.min(tz.fin, largo))
      for (const q of Array.from(r.getClientRects())) if (q.width > 0.5) rs.push({ x: (q.left - base.left) / k, y: (q.top - base.top) / k, w: q.width / k, h: q.height / k, activo: c.activo })
    }
    setCajas(rs)
  }, [resaltes, capaLista, escala])

  return <div ref={marco} className={v.pagina} data-pagina={n} style={{ width: tam.w * escala, height: tam.h * escala }}>
    <canvas ref={lienzo} aria-hidden />
    <div ref={capa} className={v.capaTexto} />
    {cajas.length > 0 && <div className={v.resaltes} aria-hidden>{cajas.map((r, i) => <i key={i} data-activo={r.activo || undefined} style={{ left: r.x - 1, top: r.y, width: r.w + 2, height: r.h }} />)}</div>}
    <span className={v.numero}>{n}</span>
  </div>
})

/** Miniatura: se pinta solo al asomar en la barra lateral, a 96 px de ancho. */
const Miniatura = memo(function Miniatura({ doc, n, tam, actual, alElegir, raiz }: { doc: PDFDocumentProxy; n: number; tam: Tam; actual: boolean; alElegir: (n: number) => void; raiz: React.RefObject<HTMLDivElement | null> }) {
  const caja = useRef<HTMLButtonElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [cerca, setCerca] = useState(false)
  const hecho = useRef(false)
  const ancho = 96, escala = ancho / tam.w
  useEffect(() => {
    const el = caja.current; if (!el) return
    const o = new IntersectionObserver(es => setCerca(es.some(e => e.isIntersecting)), { root: raiz.current?.querySelector('nav'), rootMargin: '300px 0px' })
    o.observe(el); return () => o.disconnect()
  }, [raiz])
  useEffect(() => {
    if (!cerca || hecho.current || !lienzo.current) return
    let vigente = true
    ;(async () => {
      const p = await doc.getPage(n); const vp = p.getViewport({ scale: escala * 2 }); const c = lienzo.current!
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      await p.render({ canvas: c, viewport: vp, background: 'rgb(255,255,255)' }).promise
      if (vigente) hecho.current = true
    })().catch(() => undefined)
    return () => { vigente = false }
  }, [cerca, doc, n, escala])
  return <button ref={caja} type="button" className={v.miniatura} data-actual={actual || undefined} onClick={() => alElegir(n)} aria-label={tr('Página {n}', { n })} aria-current={actual || undefined}>
    <canvas ref={lienzo} style={{ width: ancho, height: tam.h * escala }} aria-hidden />
    <span>{n}</span>
  </button>
})

/** El índice del libro: cada entrada con su página; la del capítulo en curso lleva la luz y se mantiene a la vista. */
function IndicePdf({ capitulos, actual, alElegir }: { capitulos: Capitulo[]; actual: number; alElegir: (n: number) => void }) {
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => { lista.current?.querySelector('[data-actual]')?.scrollIntoView({ block: 'nearest' }) }, [actual])
  return <nav className={v.indicePdf} aria-label={tr('Índice del libro')}>
    <ol ref={lista}>{capitulos.map((c, i) => <li key={i} data-nivel={c.nivel} data-actual={i === actual || undefined} style={{ ['--i' as string]: Math.min(i, 20) }}>
      <button type="button" disabled={c.pagina == null} onClick={() => c.pagina != null && alElegir(c.pagina)} title={c.titulo}>
        <span>{c.titulo}</span>{c.pagina != null && <small>{c.pagina}</small>}
      </button></li>)}</ol>
  </nav>
}
