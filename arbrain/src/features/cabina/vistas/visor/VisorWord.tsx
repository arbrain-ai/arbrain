'use client'
/**
 * Visor de Word (.docx) (14 nov 2026, Daniel: «un visualizador de docs tipo PDF reader, Word…»). Que un .docx se lea aquí
 * como documento, no como texto suelto: sus hojas con su tamaño y márgenes, títulos, listas, tablas, imágenes, encabezados
 * y pies, con las fuentes que trae.
 *
 *  · Motor: docx-preview (Apache-2.0; usa jszip) y DOMPurify, los dos con import dinámico: no pesan al abrir la app.
 *    Se renderiza fuera de la página, se sanea (documento/sanear-docx.ts) y solo entonces se pega.
 *  · Índice lateral con los títulos del documento (por su estilo: Título, Título 1…4 o su nivel de esquema) que sigue la
 *    lectura; búsqueda que cuenta («3 de 12») y resalta sin tocar el documento (CSS Custom Highlight API); zoom con ajuste
 *    al ancho; papel claro, sepia o noche (Papel.tsx, el mismo del PDF); modo lectura que reacomoda el texto al ancho del
 *    panel (en el teléfono una hoja carta no cabe).
 *  · Los enlaces externos se abren en el navegador del sistema; los internos (índices de Word) saltan dentro del documento.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, ChevronDown, ChevronUp, FileText, ListTree, Minus, MoveHorizontal, Plus, Search, X } from 'lucide-react'
import { destinoDeEnlace, sanearRenderizado } from '../../documento/sanear-docx'
import { abrirEnNavegador } from '@/lib/navegador'
import { BotonDescargar } from './BotonDescargar'
import { BotonAbrirEnApp } from './BotonAbrirEnApp'
import { SelectorPapel, usePapel } from './Papel'
import v from './visor.module.css'
import w from './word.module.css'
import { tr } from '@/shared/i18n'

type Motor = { docx: typeof import('docx-preview'); purificador: { sanitize(nodo: Node, opciones: Record<string, unknown>): unknown } }
let motor: Promise<Motor> | null = null
const cargarMotor = () => (motor ??= Promise.all([import('docx-preview'), import('dompurify')]).then(([docx, p]) => ({ docx, purificador: p.default as unknown as Motor['purificador'] })))

const MAX_BYTES = 60 * 1024 * 1024
const MARGEN = 28
interface Titulo { id: string; texto: string; nivel: number }

/** Clase de docx-preview para un estilo (misma regla que su escapeClassName). */
const claseDeEstilo = (prefijo: string, id: string) => `${prefijo}_${id.replace(/[ .]+/g, '-').replace(/[&]+/g, 'and').toLowerCase()}`

/** Qué estilos de párrafo son títulos y de qué nivel (0 = Título del documento). */
function nivelesDeTitulo(doc: unknown, prefijo: string): Map<string, number> {
  const out = new Map<string, number>()
  const estilos = (doc as { stylesPart?: { styles?: { id?: string; name?: string; target?: string; paragraphProps?: { outlineLevel?: number } }[] } })?.stylesPart?.styles ?? []
  for (const st of estilos) {
    if (!st.id || (st.target && st.target !== 'p')) continue
    const nombre = String(st.name ?? '').toLowerCase().trim()
    const m = /^(heading|t[ií]tulo|encabezado)\s*(\d)$/.exec(nombre)
    const esquema = st.paragraphProps?.outlineLevel
    const nivel = /^(title|t[ií]tulo)$/.test(nombre) ? 0 : m ? Number(m[2]) : typeof esquema === 'number' && esquema >= 0 && esquema < 9 ? esquema + 1 : null
    if (nivel != null && nivel <= 4) out.set(claseDeEstilo(prefijo, st.id), nivel)
  }
  return out
}

/** Minúsculas y sin acentos, carácter por carácter (mismo largo: los índices sirven para el texto original). */
const plegar = (s: string) => { let o = ''; for (const c of s) o += (c.normalize('NFD')[0] ?? c).toLowerCase(); return o }

type CssHighlights = { set(n: string, h: unknown): void; delete(n: string): void }
const resaltador = () => (typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: CssHighlights }).highlights : null)
const Resalte = () => (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight

export function VisorWord({ url, archivo, ruta, hash, bytes, grande, descarga }: { url: string; archivo: string; ruta: string; hash?: string; bytes?: number; grande?: boolean; descarga?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const prefijo = `arbdocx${id}`
  const raiz = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const hoja = useRef<HTMLDivElement>(null)
  const estilos = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | { error: string }>('cargando')
  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [paginaAncho, setPaginaAncho] = useState(816)
  const [paginas, setPaginas] = useState(0)
  const [ancho, setAncho] = useState(0)
  const [modo, setModo] = useState<'ancho' | number>('ancho')
  const [indice, setIndice] = useState<boolean | null>(null)
  const [lectura, setLectura] = useState<boolean | null>(null)
  const [papel, setPapel] = usePapel()
  // El enlace firmado rota cada 6 h aunque el archivo sea el mismo: se vuelve a pintar solo si cambia el archivo (`hash`).
  const enlace = useRef(url); enlace.current = url

  // ── Ancho del escritorio ──
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setAncho(el.clientWidth)
    medir(); const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [])
  const angosto = ancho > 0 && ancho < 560
  const enLectura = lectura ?? angosto

  // ── Renderizar (otra vez si el archivo cambia o se pasa a modo lectura) ──
  useEffect(() => {
    let vivo = true
    setEstado('cargando')
    if (bytes && bytes > MAX_BYTES) { setEstado({ error: tr('Este documento pesa {mb} MB: es demasiado para el visor. Descárgalo o ábrelo en su app.', { mb: Math.round(bytes / 1048576) }) }); return }
    ;(async () => {
      const [{ docx, purificador }, r] = await Promise.all([cargarMotor(), fetch(enlace.current, { cache: 'no-store' })])
      if (!r.ok) throw new Error(tr('No se pudo leer el archivo ({estado}).', { estado: r.status }))
      const datos = await r.arrayBuffer()
      const cuerpo = document.createElement('div'), css = document.createElement('div')
      const doc = await docx.renderAsync(datos, cuerpo, css, {
        className: prefijo, inWrapper: true, breakPages: !enLectura, ignoreWidth: enLectura, ignoreHeight: enLectura, ignoreLastRenderedPageBreak: true,
        renderHeaders: !enLectura, renderFooters: !enLectura, renderFootnotes: true, renderEndnotes: true, renderComments: false, renderChanges: false,
        renderAltChunks: false, useBase64URL: false, experimental: false, ignoreFonts: false, trimXmlDeclaration: true,
      })
      if (!vivo || !hoja.current || !estilos.current) return
      sanearRenderizado(cuerpo, css, purificador)
      // Títulos para el índice.
      const niveles = nivelesDeTitulo(doc, prefijo)
      const encontrados: Titulo[] = []
      if (niveles.size) for (const p of Array.from(cuerpo.querySelectorAll<HTMLElement>('p'))) {
        if (p.closest('header, footer, table')) continue
        let nivel: number | undefined
        for (const c of Array.from(p.classList)) { const n = niveles.get(c); if (n != null) { nivel = n; break } }
        const texto = (p.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (nivel == null || !texto) continue
        p.id ||= `${prefijo}-t${encontrados.length}`
        p.dataset.titulo = String(nivel)
        encontrados.push({ id: p.id, texto: texto.length > 90 ? texto.slice(0, 88) + '…' : texto, nivel })
        if (encontrados.length >= 400) break
      }
      estilos.current.replaceChildren(...Array.from(css.childNodes))
      hoja.current.replaceChildren(...Array.from(cuerpo.childNodes))
      const secciones = hoja.current.querySelectorAll<HTMLElement>(`section.${prefijo}`)
      // Un .docx sin tamaño de página (los que exporta pandoc, por ejemplo) saldría de borde a borde: carta con márgenes de 1″.
      if (!enLectura) for (const sec of Array.from(secciones)) {
        if (!sec.style.width) { sec.style.width = '816px'; if (!sec.style.minHeight) sec.style.minHeight = '1056px' }
        if (!sec.style.paddingLeft && !sec.style.padding) sec.style.padding = '96px'
      }
      const primera = secciones[0]
      setPaginaAncho(primera ? Math.max(320, primera.offsetWidth) : 816)
      setPaginas(secciones.length)
      setTitulos(encontrados)
      setEstado('listo')
    })().catch(e => { if (vivo) setEstado({ error: e instanceof Error ? e.message : tr('No se pudo abrir el documento.') }) })
    return () => { vivo = false }
  }, [hash ?? url, bytes, prefijo, enLectura]) // eslint-disable-line react-hooks/exhaustive-deps

  const escalaAncho = Math.min(1.5, Math.max(0.3, (ancho - 2 * MARGEN) / paginaAncho))
  const escala = enLectura ? 1 : modo === 'ancho' ? escalaAncho : Math.min(4, Math.max(0.25, modo))
  const zoom = (f: number) => setModo(Math.min(4, Math.max(0.25, escala * f)))
  const mostrarIndice = titulos.length > 1 && (indice ?? (raiz.current?.clientWidth ?? 0) >= 820)

  // ── Índice que sigue la lectura ──
  const [actual, setActual] = useState<string | null>(null)
  const hilo = useRef(0)
  const alDesplazar = () => {
    if (hilo.current || !titulos.length) return
    hilo.current = requestAnimationFrame(() => {
      hilo.current = 0
      const c = caja.current; if (!c) return
      const tope = c.getBoundingClientRect().top + c.clientHeight * 0.28
      let vigente: string | null = titulos[0]?.id ?? null
      for (const t of titulos) { const el = document.getElementById(t.id); if (el && el.getBoundingClientRect().top <= tope) vigente = t.id; else if (el) break }
      setActual(vigente)
    })
  }
  useEffect(() => { alDesplazar() }, [titulos]) // eslint-disable-line react-hooks/exhaustive-deps
  const irA = useCallback((elId: string) => {
    const el = document.getElementById(elId), c = caja.current
    if (!el || !c) return
    const y = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 24
    c.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
    el.animate?.([{ backgroundColor: 'rgba(255, 145, 1, 0.28)' }, { backgroundColor: 'transparent' }], { duration: 1400, easing: 'ease-out' })
  }, [])

  // ── Enlaces: los internos saltan, los externos van al navegador del sistema ──
  const alClic = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || !hoja.current?.contains(a)) return
    e.preventDefault()
    const d = destinoDeEnlace(a.getAttribute('href'))
    if (d?.tipo === 'ancla') { const el = document.getElementById(d.id) ?? hoja.current.querySelector<HTMLElement>(`[name="${CSS.escape(d.id)}"]`); if (el) { el.id ||= `${prefijo}-a${Date.now()}`; irA(el.id) } }
    else if (d?.tipo === 'externo') void abrirEnNavegador(d.url)
  }

  // ── Buscar ──
  const [consulta, setConsulta] = useState('')
  const [hallazgos, setHallazgos] = useState<Range[]>([])
  const [activo, setActivo] = useState(0)
  const entrada = useRef<HTMLInputElement>(null)
  const nombreH = `arbdoc${id}`
  useEffect(() => {
    const q = plegar(consulta.trim())
    if (q.length < 2 || estado !== 'listo' || !hoja.current) { setHallazgos([]); setActivo(0); return }
    const k = window.setTimeout(() => {
      const rangos: Range[] = []
      for (const p of Array.from(hoja.current!.querySelectorAll<HTMLElement>('p, li, td > div, h1, h2, h3, h4'))) {
        if (p.querySelector('p')) continue
        const nodos: { n: Text; ini: number }[] = []
        let texto = ''
        const camino = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
        for (let n = camino.nextNode() as Text | null; n; n = camino.nextNode() as Text | null) { nodos.push({ n, ini: texto.length }); texto += n.data }
        const plano = plegar(texto)
        for (let i = plano.indexOf(q); i >= 0 && rangos.length < 2000; i = plano.indexOf(q, i + q.length)) {
          const donde = (pos: number) => { let j = nodos.length - 1; while (j > 0 && nodos[j].ini > pos) j--; return { n: nodos[j].n, o: Math.min(pos - nodos[j].ini, nodos[j].n.length) } }
          const a = donde(i), b = donde(i + q.length)
          const r = document.createRange(); r.setStart(a.n, a.o); r.setEnd(b.n, b.o); rangos.push(r)
        }
      }
      setHallazgos(rangos); setActivo(0)
    }, 220)
    return () => window.clearTimeout(k)
  }, [consulta, estado])
  useEffect(() => {
    const hl = resaltador(), H = Resalte()
    if (!hl || !H) return
    if (!hallazgos.length) { hl.delete(nombreH); hl.delete(`${nombreH}a`); return }
    hl.set(nombreH, new H(...hallazgos))
    hl.set(`${nombreH}a`, new H(hallazgos[activo]))
    return () => { hl.delete(nombreH); hl.delete(`${nombreH}a`) }
  }, [hallazgos, activo, nombreH])
  const verHallazgo = useCallback((i: number) => {
    const r = hallazgos[i], c = caja.current
    if (!r || !c) return
    const b = r.getBoundingClientRect(), cb = c.getBoundingClientRect()
    if (b.top < cb.top + 40 || b.bottom > cb.bottom - 40) c.scrollTo({ top: Math.max(0, b.top - cb.top + c.scrollTop - c.clientHeight / 3), behavior: 'smooth' })
    if (!resaltador()) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) }
  }, [hallazgos])
  useEffect(() => { if (hallazgos.length) verHallazgo(activo) }, [hallazgos, activo, verHallazgo])
  const mover = (d: number) => { if (hallazgos.length) setActivo(a => (a + d + hallazgos.length) % hallazgos.length) }

  const alTeclado = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); entrada.current?.focus(); entrada.current?.select(); return }
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea')) return
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.15) }
    else if (e.key === '-') { e.preventDefault(); zoom(1 / 1.15) }
    else if (e.key === '0') { e.preventDefault(); setModo('ancho') }
  }
  useEffect(() => { // ⌘/Ctrl + rueda: zoom (React registra `wheel` como pasivo)
    const el = caja.current; if (!el) return
    const al = (e: WheelEvent) => { if ((e.ctrlKey || e.metaKey) && !enLectura) { e.preventDefault(); setModo(m => Math.min(4, Math.max(0.25, (m === 'ancho' ? escalaAncho : m) * Math.exp(-e.deltaY * 0.01)))) } }
    el.addEventListener('wheel', al, { passive: false }); return () => el.removeEventListener('wheel', al)
  }, [escalaAncho, enLectura])

  // El índice entra con la lectura ya medida (no salta al abrir).
  useLayoutEffect(() => { if (estado === 'listo') alDesplazar() }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const error = typeof estado === 'object' ? estado.error : null
  const progreso = useProgreso(caja, estado === 'listo')
  const estiloHighlight = useMemo(() => `::highlight(${nombreH}){background:rgba(255,214,10,.5);color:inherit}::highlight(${nombreH}a){background:rgba(255,145,1,.85);color:#1a1208}`, [nombreH])

  return <div ref={raiz} className={w.word} data-grande={grande || undefined} data-indice={mostrarIndice || undefined} onKeyDown={alTeclado}>
    <style>{estiloHighlight}</style>
    <div className={w.barra} role="toolbar" aria-label={tr('Controles del documento')}>
      <button type="button" className={v.icono} aria-pressed={mostrarIndice} disabled={titulos.length < 2} aria-label={tr('Índice')} title={titulos.length < 2 ? tr('Este documento no trae títulos') : tr('Índice')} onClick={() => setIndice(!mostrarIndice)}><ListTree size={15} aria-hidden /></button>
      {paginas > 1 && !enLectura && <span className={w.paginas}>{tr('{n} hojas', { n: paginas })}</span>}
      {!enLectura && <div className={v.grupo}>
        <button type="button" className={v.icono} aria-label={tr('Alejar')} title={tr('Alejar (-)')} onClick={() => zoom(1 / 1.15)}><Minus size={15} aria-hidden /></button>
        <button type="button" className={v.porcentaje} title={tr('Ajustar al ancho (0)')} onClick={() => setModo(modo === 'ancho' ? 1 : 'ancho')}>{Math.round(escala * 100)}%</button>
        <button type="button" className={v.icono} aria-label={tr('Acercar')} title={tr('Acercar (+)')} onClick={() => zoom(1.15)}><Plus size={15} aria-hidden /></button>
        <button type="button" className={v.icono} aria-label={tr('Ajustar al ancho')} aria-pressed={modo === 'ancho'} title={tr('Ajustar al ancho')} onClick={() => setModo('ancho')}><MoveHorizontal size={15} aria-hidden /></button>
      </div>}
      <div className={w.vista} role="radiogroup" aria-label={tr('Cómo verlo')}>
        <button type="button" role="radio" aria-checked={!enLectura} onClick={() => setLectura(false)} title={tr('Como página: su tamaño y márgenes')}><FileText size={13} aria-hidden />{tr('Página')}</button>
        <button type="button" role="radio" aria-checked={enLectura} onClick={() => setLectura(true)} title={tr('Lectura: el texto se acomoda al ancho del panel')}><BookOpenText size={13} aria-hidden />{tr('Lectura')}</button>
      </div>
      <SelectorPapel papel={papel} alCambiar={setPapel} className={w.papel} />
      <div className={`${v.busqueda} ${w.busqueda}`}>
        <Search size={13} aria-hidden />
        <input ref={entrada} type="search" aria-label={tr('Buscar en el documento')} placeholder={tr('Buscar')} value={consulta} onChange={e => setConsulta(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); mover(e.shiftKey ? -1 : 1) } else if (e.key === 'Escape') setConsulta('') }} />
        {consulta.trim().length >= 2 && <span className={v.cuenta} aria-live="polite">{hallazgos.length ? tr('{i} de {n}', { i: activo + 1, n: hallazgos.length }) : tr('sin resultados')}</span>}
        {hallazgos.length > 0 && <>
          <button type="button" className={v.mini} aria-label={tr('Anterior')} onClick={() => mover(-1)}><ChevronUp size={14} aria-hidden /></button>
          <button type="button" className={v.mini} aria-label={tr('Siguiente')} onClick={() => mover(1)}><ChevronDown size={14} aria-hidden /></button>
        </>}
        {consulta && <button type="button" className={v.mini} aria-label={tr('Limpiar búsqueda')} onClick={() => setConsulta('')}><X size={13} aria-hidden /></button>}
      </div>
      <BotonAbrirEnApp ruta={ruta} className={v.icono} />
      <BotonDescargar url={descarga} nombre={archivo} className={v.icono} />
    </div>
    <span className={w.progreso} style={{ transform: `scaleX(${progreso})` }} aria-hidden />
    <div className={w.cuerpo}>
      {mostrarIndice && <nav className={w.indice} aria-label={tr('Índice del documento')}>
        <p className={w.indiceTitulo}>{tr('Contenido')}</p>
        <ol>{titulos.map((t, i) => <li key={t.id} data-nivel={t.nivel} data-actual={actual === t.id || undefined} style={{ ['--i' as string]: Math.min(i, 18) }}>
          <button type="button" onClick={() => irA(t.id)} title={t.texto}>{t.texto}</button></li>)}</ol>
      </nav>}
      <div ref={caja} className={w.escritorio} data-papel={papel} data-lectura={enLectura || undefined} tabIndex={0} role="document" aria-label={tr('Documento {archivo}', { archivo })} onScroll={alDesplazar} onClick={alClic}>
        {error && <p className={v.aviso} role="alert">{error}</p>}
        {estado === 'cargando' && <div className={w.cargando} aria-busy="true"><div className={w.hojaFantasma}>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div><span>{tr('Abriendo {archivo}…', { archivo })}</span></div>}
        <div ref={estilos} hidden />
        <div ref={hoja} className={w.hoja} data-listo={estado === 'listo' || undefined} style={!enLectura && estado === 'listo' ? { zoom: escala } : undefined} />
      </div>
    </div>
  </div>
}

/** Cuánto se ha leído (0 a 1): una línea de oro bajo la barra. */
function useProgreso(caja: React.RefObject<HTMLDivElement | null>, listo: boolean) {
  const [p, setP] = useState(0)
  useEffect(() => {
    const c = caja.current; if (!c || !listo) return
    let k = 0
    const leer = () => { k = 0; const max = c.scrollHeight - c.clientHeight; setP(max > 0 ? Math.min(1, c.scrollTop / max) : 1) }
    const al = () => { if (!k) k = requestAnimationFrame(leer) }
    leer(); c.addEventListener('scroll', al, { passive: true })
    return () => { c.removeEventListener('scroll', al); cancelAnimationFrame(k) }
  }, [caja, listo])
  return p
}
