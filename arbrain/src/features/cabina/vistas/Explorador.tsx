'use client'
/**
 * Explorador de archivos (8 oct 2026, Daniel: «un explorador de archivos como el de los editores… principalmente por control»).
 * El árbol del repo como el lateral de VS Code o el de SFTerm, con la piel de la casa (Luminorphism, Inter, el lenguaje de
 * movimiento): carpetas plegables, íconos por tipo, buscar por nombre y, al tocar un archivo, su pestaña de documento
 * (md, txt, html, imágenes, video, PDF con el visor único; el código en solo lectura con color).
 *
 *  · Un clic abre la pestaña de VISTA PREVIA, que el siguiente clic reemplaza; doble clic (o Enter con ⌘) la deja fija.
 *  · Teclado de árbol: ↑ ↓ recorren, → abre o entra, ← cierra o sube, Enter abre, «/» o ⌘F busca, Esc limpia la búsqueda.
 *  · Lo abierto se recuerda por raíz en este dispositivo. «Ubicar» despliega hasta el archivo de la pestaña a la vista.
 *  · Opcional: sección del «+» que se apaga en Ajustes › Panel (para los clientes que no la quieran). Visible por defecto.
 * Seguridad en el servidor: /api/cabina/explorador (sin «..», sin node_modules/.git/.next ni credenciales) y, al abrir,
 * /api/cabina/documento con sus propias reglas. Modelo puro: features/cabina/explorador/arbol.ts y abrir.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact } from 'react'
import {
  ChevronRight, ChevronsDownUp, Crosshair, File, FileAudio, FileCode2, FileCog, FileImage, FileJson, FileText, FileType2, FileVideo,
  Folder, FolderOpen, Globe, RefreshCw, Search, X,
} from 'lucide-react'
import { mov, escalon, Cifra } from '@/shared/movimiento'
import { releer, useFuente } from '../datos'
import { resolverDestino } from '../panel/bus'
import { usePanelFijadas } from '../panel/fijadas'
import { ventanaDe } from '../panel/pestanas-fuera'
import { mostrarPanel } from '../panel/ventanas'
import { absoluta, ancestros, claseDe, type Clase, type Entrada, type Resultado } from '../explorador/arbol'
import { inputArchivo, planApertura } from '../explorador/abrir'
import l from '../luz.module.css'
import x from './explorador.module.css'

const URL_BASE = '/api/cabina/explorador'
const urlDir = (dir: string) => `${URL_BASE}?dir=${encodeURIComponent(dir)}`
const urlBuscar = (q: string) => `${URL_BASE}?buscar=${encodeURIComponent(q)}`
const CLAVE_ABIERTAS = 'arbrain.explorador.abiertas'

interface Carpeta { raiz: { nombre: string; ruta: string }; total: number; deGit: boolean; aviso?: string; dir: string; abs: string; entradas: Entrada[] }
/** `total` = cuántas coincidencias hay en todo el árbol (se pintan las más cercanas). */
interface Busqueda { consulta: string; resultados: Resultado[]; total: number }

const ICONO: Record<Clase, typeof File> = {
  md: FileText, texto: FileText, codigo: FileCode2, datos: FileJson, config: FileCog, imagen: FileImage, video: FileVideo, audio: FileAudio, pdf: FileType2, html: Globe, otro: File,
}
const entero = (n: number) => Math.round(n).toLocaleString('es-MX')

// ── Lo abierto, por raíz, en este dispositivo ──
function leerAbiertas(raiz: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_ABIERTAS) ?? 'null'); return new Set(v?.raiz === raiz && Array.isArray(v.abiertas) ? v.abiertas.filter((s: unknown) => typeof s === 'string') : []) } catch { return new Set() }
}
function guardarAbiertas(raiz: string, abiertas: Set<string>) {
  try { localStorage.setItem(CLAVE_ABIERTAS, JSON.stringify({ raiz, abiertas: [...abiertas].slice(0, 400) })) } catch { /* sin almacenamiento */ }
}

/**
 * Abre un archivo como pestaña: previa (un clic) o fija (doble clic). Va a la ventana que marca «Dónde abre Levy» (izquierda por
 * defecto, 8 oct 2026, Daniel: el árbol se queda donde está y cada archivo se abre en la otra ventana); con una sola ventana, en la misma.
 * La vista previa que se reemplaza es la de esa ventana; un archivo ya abierto se trae donde esté.
 */
async function abrirArchivo(ruta: string, nombre: string, modo: 'previa' | 'fija') {
  const destino = await resolverDestino()
  const st = usePanelFijadas.getState()
  st.cargar()
  const plan = planApertura(st.fijadas, ruta, modo, id => ventanaDe(st.enVentana, id) === destino.ventana)
  let id: string
  if (plan.tipo === 'traer') {
    id = plan.id
    if (plan.fijar) { const f = st.fijadas.find(p => p.id === id)!; st.actualizar(id, { ...f.input, explorador: 'fija' }) }
    st.activar(id)
  } else if (plan.tipo === 'reemplazar') {
    id = plan.id
    st.actualizar(id, inputArchivo(ruta, nombre, 'previa'))
    st.activar(id)
  } else {
    id = st.fijar(`mano-documento-${Date.now().toString(36)}`, inputArchivo(ruta, nombre, modo), true, { ventana: destino.ventana })
  }
  mostrarPanel(id)
}

/** Las rutas de los documentos abiertos como pestaña, y la que está a la vista. */
function useAbiertosEnPanel() {
  const fijadas = usePanelFijadas(s => s.fijadas)
  const activa = usePanelFijadas(s => s.activa)
  return useMemo(() => {
    const rutas = new Set(fijadas.flatMap(f => f.input.vista === 'documento' && f.input.ruta ? [f.input.ruta] : []))
    const actual = fijadas.find(f => f.id === activa && f.input.vista === 'documento')?.input.ruta
      ?? [...fijadas].filter(f => f.input.vista === 'documento' && f.input.explorador).sort((a, b) => b.en - a.en)[0]?.input.ruta
    return { rutas, actual }
  }, [fijadas, activa])
}

export function VistaExplorador({ grande }: { grande?: boolean }) {
  const raizLectura = useFuente<Carpeta>(urlDir(''))
  const raiz = raizLectura.data
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [consulta, setConsulta] = useState('')
  const [foco, setFoco] = useState<string | null>(null)
  const arbol = useRef<HTMLDivElement>(null), buscador = useRef<HTMLInputElement>(null)
  const raizRuta = raiz?.raiz.ruta
  useEffect(() => { if (raizRuta) setAbiertas(leerAbiertas(raizRuta)) }, [raizRuta])
  // Para marcar lo abierto en el panel aunque el explorador viva en el chat o en una ventana que aún no las leyó.
  useEffect(() => { usePanelFijadas.getState().cargar() }, [])
  const { rutas: enPanel, actual } = useAbiertosEnPanel()

  const alternar = useCallback((ruta: string, abrir?: boolean) => {
    setAbiertas(prev => {
      const sig = new Set(prev)
      const quiero = abrir ?? !sig.has(ruta)
      if (quiero) sig.add(ruta); else sig.delete(ruta)
      if (raizRuta) guardarAbiertas(raizRuta, sig)
      return sig
    })
  }, [raizRuta])
  const plegarTodo = () => { const vacio = new Set<string>(); setAbiertas(vacio); if (raizRuta) guardarAbiertas(raizRuta, vacio) }

  /** Despliega hasta `rel` y lo enfoca (búsqueda de una carpeta, «Ubicar»). */
  const revelar = useCallback((rel: string, abrirla = false) => {
    setConsulta('')
    setAbiertas(prev => {
      const sig = new Set([...prev, ...ancestros(rel), ...(abrirla ? [rel] : [])])
      if (raizRuta) guardarAbiertas(raizRuta, sig)
      return sig
    })
    setFoco(rel)
    // Tras pintar las carpetas que se abrieron (pueden tardar en llegar): reintenta un momento.
    let n = 0
    const intentar = () => {
      const el = arbol.current?.querySelector<HTMLElement>(`[data-fila="${CSS.escape(rel)}"]`)
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); return }
      if (++n < 30) setTimeout(intentar, 100)
    }
    requestAnimationFrame(intentar)
  }, [raizRuta])

  const actualRel = raizRuta && actual?.startsWith(raizRuta + '/') ? actual.slice(raizRuta.length + 1) : null

  // «/» o ⌘F con el foco dentro del explorador: a buscar.
  const teclaRaiz = (e: TeclaReact<HTMLDivElement>) => {
    const enCampo = e.target instanceof HTMLInputElement
    if (!enCampo && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'))) { e.preventDefault(); buscador.current?.focus(); buscador.current?.select() }
  }

  /** Navegación de árbol por el DOM: cada fila visible lleva data-fila; el orden del DOM es el orden visual. */
  const moverFoco = (desde: HTMLElement, delta: number | 'inicio' | 'fin') => {
    const filas = [...(arbol.current?.querySelectorAll<HTMLElement>('[data-fila]') ?? [])]
    const i = filas.indexOf(desde)
    const j = delta === 'inicio' ? 0 : delta === 'fin' ? filas.length - 1 : Math.max(0, Math.min(filas.length - 1, i + delta))
    const el = filas[j]
    if (el) { el.focus(); setFoco(el.dataset.fila ?? null) }
  }
  const teclaFila = (e: TeclaReact<HTMLButtonElement>, ent: Entrada, abierta: boolean) => {
    const el = e.currentTarget
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moverFoco(el, 1); break
      case 'ArrowUp': e.preventDefault(); moverFoco(el, -1); break
      case 'Home': e.preventDefault(); moverFoco(el, 'inicio'); break
      case 'End': e.preventDefault(); moverFoco(el, 'fin'); break
      case 'ArrowRight':
        e.preventDefault()
        if (ent.tipo === 'carpeta') { if (!abierta) alternar(ent.ruta, true); else moverFoco(el, 1) }
        break
      case 'ArrowLeft': {
        e.preventDefault()
        if (ent.tipo === 'carpeta' && abierta) { alternar(ent.ruta, false); break }
        const padre = ent.ruta.includes('/') ? ent.ruta.slice(0, ent.ruta.lastIndexOf('/')) : null
        if (padre) { const p = arbol.current?.querySelector<HTMLElement>(`[data-fila="${CSS.escape(padre)}"]`); p?.focus(); setFoco(padre) }
        break
      }
      case 'Enter':
        if (ent.tipo === 'archivo' && raizRuta) { e.preventDefault(); abrirArchivo(absoluta(raizRuta, ent.ruta), ent.nombre, e.metaKey || e.ctrlKey ? 'fija' : 'previa') }
        break
    }
  }

  return <div className={x.explorador} data-grande={grande || undefined} onKeyDown={teclaRaiz}>
    <header className={`${x.cabeza} ${mov.entra}`} style={escalon(0)}>
      <div className={x.cabezaFila}>
        <p className={l.ceja}>Archivos · <b>{raiz?.raiz.nombre ?? '…'}</b></p>
        <span className={x.acciones}>
          {actualRel && <button className={x.accion} onClick={() => revelar(actualRel)} title="Ubicar en el árbol el archivo que tienes abierto" aria-label="Ubicar el archivo abierto"><Crosshair size={14} aria-hidden /></button>}
          <button className={x.accion} onClick={plegarTodo} disabled={!abiertas.size} title="Plegar todas las carpetas" aria-label="Plegar todo"><ChevronsDownUp size={14} aria-hidden /></button>
          <button className={x.accion} onClick={() => { void releer(urlDir('')); for (const d of abiertas) void releer(urlDir(d)) }} title="Volver a leer el disco" aria-label="Recargar"><RefreshCw size={13} aria-hidden /></button>
        </span>
      </div>
      <p className={x.total}>
        {raiz ? <><b><Cifra valor={raiz.total} clave={`explorador-${raiz.raiz.ruta}`} formato={entero} /></b> {raiz.total === 1 ? 'archivo' : 'archivos'}{raiz.deGit ? ' · respeta .gitignore' : ''}</> : ' '}
      </p>
      <label className={x.buscador}>
        <Search size={14} aria-hidden />
        <input ref={buscador} value={consulta} onChange={e => setConsulta(e.target.value)} placeholder="Buscar por nombre" spellCheck={false} aria-label="Buscar archivos por nombre"
          onKeyDown={e => {
            if (e.key === 'Escape' && consulta) { e.preventDefault(); e.stopPropagation(); setConsulta('') }
            else if (e.key === 'ArrowDown') { e.preventDefault(); arbol.current?.querySelector<HTMLElement>('[data-fila]')?.focus() }
            else if (e.key === 'Enter') { e.preventDefault(); arbol.current?.querySelector<HTMLElement>('[data-fila]')?.click() }
          }} />
        {consulta ? <button className={x.limpiar} onClick={() => { setConsulta(''); buscador.current?.focus() }} aria-label="Limpiar la búsqueda"><X size={13} aria-hidden /></button> : <kbd className={x.tecla}>/</kbd>}
      </label>
      {raiz?.aviso && <p className={`${l.aviso} ${mov.aparece}`}>{raiz.aviso}</p>}
    </header>

    <div ref={arbol} className={x.arbol} role="tree" aria-label={`Archivos de ${raiz?.raiz.nombre ?? 'la raíz'}`}>
      {!raiz ? <Cargando error={raizLectura.error} />
        : consulta.trim() ? <Resultados consulta={consulta} raiz={raiz.raiz.ruta} enPanel={enPanel} actual={actual} onCarpeta={rel => revelar(rel, true)} onTecla={(e, el) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); moverFoco(el, 1) } else if (e.key === 'ArrowUp') { e.preventDefault(); const filas = arbol.current?.querySelectorAll('[data-fila]'); if (filas?.[0] === el) buscador.current?.focus(); else moverFoco(el, -1) }
        }} />
        : <Nivel dir="" nivel={1} entradas={raiz.entradas} raiz={raiz.raiz.ruta} abiertas={abiertas} alternar={alternar} foco={foco ?? raiz.entradas[0]?.ruta ?? null} setFoco={setFoco}
          enPanel={enPanel} actual={actual} teclaFila={teclaFila} />}
    </div>
    <p className={x.pie}>Un clic abre la vista previa · doble clic la deja fija · solo lectura para el código</p>
  </div>
}

function Cargando({ error }: { error?: string }) {
  if (error) return <p className={`${l.aviso} ${mov.aparece}`}>No pude leer los archivos: {error}</p>
  return <div className={x.cargando} aria-label="Leyendo los archivos"><span /><span /><span /><span /><span /></div>
}

interface PropsNivel {
  dir: string; nivel: number; entradas: Entrada[]; raiz: string; abiertas: Set<string>; alternar: (ruta: string, abrir?: boolean) => void
  foco: string | null; setFoco: (r: string) => void; enPanel: Set<string>; actual?: string
  teclaFila: (e: TeclaReact<HTMLButtonElement>, ent: Entrada, abierta: boolean) => void
}

/** Las filas de una carpeta; cada subcarpeta abierta pide lo suyo al servidor (perezoso) y se pinta debajo. */
function Nivel(p: PropsNivel) {
  if (!p.entradas.length) return <p className={x.vacio} style={{ ['--nivel' as string]: p.nivel }}>Carpeta vacía</p>
  return <>{p.entradas.map((ent, k) => <Rama key={ent.ruta} {...p} ent={ent} k={k} />)}</>
}

function Rama({ ent, k, ...p }: PropsNivel & { ent: Entrada; k: number }) {
  const abierta = ent.tipo === 'carpeta' && p.abiertas.has(ent.ruta)
  const abs = absoluta(p.raiz, ent.ruta)
  return <div role="none">
    <Fila ent={ent} nivel={p.nivel} k={k} abierta={abierta} enfocable={p.foco === ent.ruta} enPanel={p.enPanel.has(abs)} actual={p.actual === abs}
      onClick={() => { p.setFoco(ent.ruta); if (ent.tipo === 'carpeta') p.alternar(ent.ruta); else abrirArchivo(abs, ent.nombre, 'previa') }}
      onDoble={() => { if (ent.tipo === 'archivo') abrirArchivo(abs, ent.nombre, 'fija') }}
      onTecla={e => p.teclaFila(e, ent, abierta)} onFoco={() => p.setFoco(ent.ruta)} />
    {abierta && <Hijos {...p} dir={ent.ruta} nivel={p.nivel + 1} />}
  </div>
}

function Hijos(p: Omit<PropsNivel, 'entradas'>) {
  const { data, error } = useFuente<Carpeta>(urlDir(p.dir))
  return <div role="group" className={x.grupo} style={{ ['--nivel' as string]: p.nivel }}>
    {data ? <Nivel {...p} entradas={data.entradas} />
      : error ? <p className={x.vacio} style={{ ['--nivel' as string]: p.nivel }}>{error}</p>
      : <p className={`${x.vacio} ${x.leyendo}`} style={{ ['--nivel' as string]: p.nivel }}>Leyendo…</p>}
  </div>
}

function IconoEntrada({ ent, abierta }: { ent: Pick<Entrada, 'nombre' | 'tipo'>; abierta?: boolean }) {
  if (ent.tipo === 'carpeta') { const I = abierta ? FolderOpen : Folder; return <I size={15} className={x.icono} data-clase="carpeta" aria-hidden /> }
  const clase = claseDe(ent.nombre), I = ICONO[clase]
  return <I size={15} className={x.icono} data-clase={clase} aria-hidden />
}

function Fila({ ent, nivel, k, abierta, enfocable, enPanel, actual, onClick, onDoble, onTecla, onFoco }: {
  ent: Entrada; nivel: number; k: number; abierta: boolean; enfocable: boolean; enPanel: boolean; actual: boolean
  onClick: () => void; onDoble: () => void; onTecla: (e: TeclaReact<HTMLButtonElement>) => void; onFoco: () => void
}) {
  return <button type="button" role="treeitem" className={`${x.fila} ${mov.entra}`} style={{ ...escalon(Math.min(k, 10)), ['--nivel' as string]: nivel }}
    data-fila={ent.ruta} data-tipo={ent.tipo} data-actual={actual || undefined} data-en-panel={enPanel || undefined}
    aria-level={nivel} aria-expanded={ent.tipo === 'carpeta' ? abierta : undefined} aria-selected={actual}
    tabIndex={enfocable ? 0 : -1} onClick={onClick} onDoubleClick={onDoble} onKeyDown={onTecla} onFocus={onFoco}
    title={ent.tipo === 'carpeta' ? `${ent.ruta} · ${ent.n ?? 0} archivos` : ent.ruta}>
    <span className={x.chevron} data-abierta={abierta || undefined} aria-hidden>{ent.tipo === 'carpeta' && <ChevronRight size={13} />}</span>
    <IconoEntrada ent={ent} abierta={abierta} />
    <span className={x.nombre}>{ent.nombre}</span>
    {ent.tipo === 'carpeta' ? <small className={x.cuenta}>{ent.n?.toLocaleString('es-MX')}</small> : enPanel && <i className={x.punto} aria-label="abierto en el panel" />}
  </button>
}

/** La búsqueda por nombre: archivos y carpetas, con la coincidencia marcada y su carpeta debajo. */
function Resultados({ consulta, raiz, enPanel, actual, onCarpeta, onTecla }: {
  consulta: string; raiz: string; enPanel: Set<string>; actual?: string; onCarpeta: (rel: string) => void
  onTecla: (e: TeclaReact<HTMLButtonElement>, el: HTMLElement) => void
}) {
  const [q, setQ] = useState(consulta.trim())
  useEffect(() => { const t = setTimeout(() => setQ(consulta.trim()), 140); return () => clearTimeout(t) }, [consulta])
  const { data, error } = useFuente<Busqueda>(q ? urlBuscar(q) : null)
  const lista = data && data.consulta === q ? data : null
  if (error && !lista) return <p className={l.aviso}>{error}</p>
  if (!lista) return <Cargando />
  if (!lista.resultados.length) return <p className={x.sinNada}>Nada se llama «{q}».</p>
  const n = lista.resultados.length
  return <>
    <p className={x.cuantos}>{n < lista.total ? `Los ${n} más cercanos de ${lista.total.toLocaleString('es-MX')}` : `${n} ${n === 1 ? 'resultado' : 'resultados'}`}</p>
    {lista.resultados.map((r, k) => {
      const abs = absoluta(raiz, r.ruta), carpeta = r.ruta.includes('/') ? r.ruta.slice(0, r.ruta.lastIndexOf('/')) : ''
      return <button key={r.ruta} type="button" role="treeitem" aria-level={1} className={`${x.fila} ${x.resultado} ${mov.entra}`} style={{ ...escalon(Math.min(k, 10)), ['--nivel' as string]: 1 }}
        data-fila={r.ruta} data-tipo={r.tipo} data-actual={actual === abs || undefined} data-en-panel={enPanel.has(abs) || undefined} tabIndex={k === 0 ? 0 : -1}
        onClick={() => r.tipo === 'carpeta' ? onCarpeta(r.ruta) : abrirArchivo(abs, r.nombre, 'previa')}
        onDoubleClick={() => { if (r.tipo === 'archivo') abrirArchivo(abs, r.nombre, 'fija') }}
        onKeyDown={e => onTecla(e, e.currentTarget)} title={r.ruta}>
        <span className={x.chevron} aria-hidden />
        <IconoEntrada ent={r} />
        <span className={x.nombreResultado}>
          <span className={x.nombre}>{r.nombre.slice(0, r.marca[0])}<mark>{r.nombre.slice(r.marca[0], r.marca[1])}</mark>{r.nombre.slice(r.marca[1])}</span>
          {carpeta && <small className={x.ruta}>{carpeta}</small>}
        </span>
      </button>
    })}
  </>
}
