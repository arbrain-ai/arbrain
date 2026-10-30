'use client'

/**
 * El árbol de lienzos (6 oct 2026): el MISMO para «¿Qué lienzo?» (panel, `variante="panel"`) y para la sección Lienzo
 * (riel, `variante="riel"`). Antes eran dos modelos (el panel agrupaba y la sección pintaba carpetas): Daniel veía «dos
 * sistemas de carpetas». Ahora solo cambia el ancho y los colores.
 *
 *   Fijados (la carpeta fijada primero) · carpetas plegables con sus lienzos · «Sin carpeta» · Archivados (pliegue)
 *
 * Cada lienzo: miniatura a la izquierda, título + «N elementos · fecha», ⋯ a la derecha (`MenuLienzo`). Se arrastra un lienzo
 * a una carpeta (o a «Sin carpeta») y una carpeta sobre otra; renombrar es en el sitio (Enter confirma, Escape cancela).
 * La lógica de qué va dónde es pura y vive en `state/vista-lienzos.ts`; las escrituras, en `state/acciones-lienzos.ts`.
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Archive, ChevronRight, Ellipsis, Folder, FolderOpen, Pin, Search, Shapes } from 'lucide-react'
import type { Carpeta, PaginaResumen } from '../../state/nube'
import type { AccionesLienzos } from '../../state/acciones-lienzos'
import { puedeAnidar, type NodoCarpeta } from '../../state/carpetas'
import { enCarpetaFijada } from '../../state/organizacion'
import { armarVista, esCarpetaFijada } from '../../state/vista-lienzos'
import { MenuLienzo, type Objetivo } from './MenuLienzo'
import css from './lienzos.module.css'

interface Props {
  paginas: PaginaResumen[]
  carpetas: Carpeta[]
  activa?: string | null
  a: AccionesLienzos
  onAbrir: (x: PaginaResumen) => void
  variante: 'panel' | 'riel'
  /** Colores del anfitrión (`--lz-*`); sin ellos, los del panel. */
  vars?: CSSProperties
  /** Lienzos que ya están abiertos como pestaña: se marcan «abierta», no se ocultan. */
  abiertas?: ReadonlySet<string>
  autoFoco?: boolean
  /** Selector del título (Ctrl+L): ids de los lienzos recientes, arriba y en su orden. */
  recientes?: string[]
  /** Flechas ↑↓ recorren las filas y Enter abre la marcada (en el buscador). Sin esto, el árbol solo se usa con el puntero. */
  teclado?: boolean
  /** «Leyendo tus lienzos…» o el error de lectura, mientras no hay datos. */
  estado?: string | null
  onNuevaPagina?: (folderId: string) => void
  onNuevaSubcarpeta?: (madre: string) => void
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const elementos = (n: number) => `${n.toLocaleString('es-MX')} ${n === 1 ? 'elemento' : 'elementos'}`

function Miniatura({ url }: { url: string | null }) {
  const [mala, setMala] = useState<string | null>(null)
  return <span className={css.mini} aria-hidden>
    {url && mala !== url ? <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setMala(url)} /> : <Shapes size={16} />}
  </span>
}

/** Nombre en el sitio: Enter confirma, Escape cancela, salir del campo confirma (como en el riel de siempre). */
function Nombre({ valor, onListo, onFin }: { valor: string; onListo: (v: string) => void; onFin: () => void }) {
  const cancelado = useRef(false)
  const fin = (v: string) => { if (!cancelado.current && v.trim() && v.trim() !== valor) onListo(v.trim()); onFin() }
  return <input className={css.nombre} autoFocus defaultValue={valor} aria-label="Nombre" onFocus={e => e.currentTarget.select()}
    onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
    onBlur={e => fin(e.target.value)}
    onKeyDown={e => {
      e.stopPropagation()
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') { cancelado.current = true; e.currentTarget.blur() }
    }} />
}

const alTeclear = (f: () => void) => (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); f() } }

/** Abierto/cerrado a mano por carpeta, compartido entre montajes de esta ventana. */
const plegadoRecordado: Record<string, boolean> = {}

export function ArbolLienzos({ paginas, carpetas, activa, a, onAbrir, variante, vars, abiertas, autoFoco, recientes, teclado, estado, onNuevaPagina, onNuevaSubcarpeta }: Props) {
  const [busqueda, setBusqueda] = useState('')
  // 6 oct 2026 (Daniel: «archivo uno y se cierra la carpeta»): lo abierto/cerrado a mano sobrevive a que la lista se
  // vuelva a montar tras una acción, y abrir el ⋯ de un lienzo fija abierta su carpeta (y su madre).
  const [manual, setManualCrudo] = useState<Record<string, boolean>>(() => ({ ...plegadoRecordado }))
  const setManual = (f: (m: Record<string, boolean>) => Record<string, boolean>) => setManualCrudo(m => { const n = f(m); Object.assign(plegadoRecordado, n); return n })
  const [editando, setEditando] = useState<{ tipo: 'pagina' | 'carpeta'; id: string } | null>(null)
  const [menu, setMenu] = useState<{ objetivo: Objetivo; ancla: DOMRect } | null>(null)
  const [verArchivados, setVerArchivados] = useState(false)
  const [sobre, setSobre] = useState<string | null>(null)
  /** La fila marcada con el teclado (selector). */
  const [cursor, setCursor] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ tipo: 'pagina' | 'carpeta'; id: string } | null>(null)
  const buscando = busqueda.trim().length > 0
  const v = useMemo(() => armarVista(carpetas, paginas, busqueda), [carpetas, paginas, busqueda])
  const idMenu = menu ? (menu.objetivo.tipo === 'pagina' ? menu.objetivo.pagina.id : menu.objetivo.carpeta.id) : null

  const abrirMenu = (objetivo: Objetivo, ancla: DOMRect) => {
    if (objetivo.tipo === 'pagina' && objetivo.pagina.folderId) {
      const fid = objetivo.pagina.folderId, madre = carpetas.find(c => c.id === fid)?.madre
      setManual(m => ({ ...m, [fid]: true, ...(madre ? { [madre]: true } : {}) }))
    }
    abrirMenuCrudo(objetivo, ancla)
  }
  const abrirMenuCrudo = (objetivo: Objetivo, ancla: DOMRect) => setMenu(m => {
    const id = objetivo.tipo === 'pagina' ? objetivo.pagina.id : objetivo.carpeta.id
    return m && idMenu === id ? null : { objetivo, ancla }
  })
  const punto = (e: React.MouseEvent) => new DOMRect(e.clientX, e.clientY, 0, 0)

  const cuenta = (n: NodoCarpeta<PaginaResumen>): number => n.paginas.length + n.hijas.reduce((s, h) => s + cuenta(h), 0)
  const contieneActiva = (n: NodoCarpeta<PaginaResumen>): boolean => n.paginas.some(x => x.id === activa) || n.hijas.some(contieneActiva)
  const abierta = (n: NodoCarpeta<PaginaResumen>, archivo: boolean) =>
    buscando || sobre === n.carpeta.id || (manual[n.carpeta.id] ?? (!archivo && (esCarpetaFijada(n.carpeta) || contieneActiva(n))))
  const alternar = (n: NodoCarpeta<PaginaResumen>, archivo: boolean) => setManual(m => ({ ...m, [n.carpeta.id]: !abierta(n, archivo) }))

  const filaPagina = (x: PaginaResumen, archivo = false, clave = '') => {
    const editandoEsta = editando?.tipo === 'pagina' && editando.id === x.id
    const objetivo: Objetivo = { tipo: 'pagina', pagina: x, archivada: archivo, enCarpetaFijada: enCarpetaFijada(x.folderId, carpetas) }
    return <div key={`${clave}${x.id}`} className={css.fila} data-lz-pagina={x.id} data-lz-clave={`${clave}${x.id}`} data-cursor={`${clave}${x.id}` === cursor ? '' : undefined} data-activa={x.id === activa ? '' : undefined} data-archivada={archivo ? '' : undefined} data-menu={idMenu === x.id ? '' : undefined}
      draggable={!archivo && !editandoEsta}
      onDragStart={e => { e.dataTransfer.setData('text/pagina', x.id); e.dataTransfer.effectAllowed = 'move'; arrastre.current = { tipo: 'pagina', id: x.id } }}
      onDragEnd={() => { arrastre.current = null; setSobre(null) }}
      onContextMenu={e => { e.preventDefault(); abrirMenu(objetivo, punto(e)) }}>
      <div className={css.cuerpo} data-editando={editandoEsta ? '' : undefined}
        {...(editandoEsta ? {} : { role: 'button', tabIndex: 0, onClick: () => onAbrir(x), onKeyDown: alTeclear(() => onAbrir(x)) })}>
        <Miniatura url={x.miniatura} />
        <span className={css.texto}>
          {editandoEsta
            ? <Nombre valor={x.nombre} onListo={n => a.renombrarPagina(x.id, n)} onFin={() => setEditando(null)} />
            : <b title={x.nombre}>{x.nombre}{abiertas?.has(x.id) && <i className={css.yaAbierta}>abierta</i>}{!x.esV4 && <i className={css.v3} title="Creado con el canvas anterior">v3</i>}</b>}
          <small>{elementos(x.elementos)} · {fechaCorta(x.actualizado)}</small>
        </span>
      </div>
      <button type="button" data-lz-mas className={css.mas} aria-label={`Más acciones de ${x.nombre}`} aria-haspopup="menu" aria-expanded={idMenu === x.id}
        onClick={e => abrirMenu(objetivo, e.currentTarget.getBoundingClientRect())}><Ellipsis size={16} aria-hidden /></button>
    </div>
  }

  const filaCarpeta = (n: NodoCarpeta<PaginaResumen>, nivel: number, archivo = false): React.ReactNode => {
    const c = n.carpeta, edit = editando?.tipo === 'carpeta' && editando.id === c.id, abre = abierta(n, archivo)
    const objetivo: Objetivo = { tipo: 'carpeta', carpeta: c, archivada: archivo }
    // ¿Acepta lo que se arrastra? Un lienzo, siempre (no en el archivo); una carpeta, solo si cabe en un nivel.
    const acepta = () => { const d = arrastre.current; return !archivo && (!d || d.tipo === 'pagina' || puedeAnidar(carpetas, d.id, c.id) === null) }
    return <div key={c.id} data-nivel={nivel}>
      <div className={css.carpeta} data-archivada={archivo ? '' : undefined} data-menu={idMenu === c.id ? '' : undefined} data-suelta={sobre === c.id ? 'encima' : undefined}
        draggable={!archivo && !edit}
        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/carpeta', c.id); e.dataTransfer.effectAllowed = 'move'; arrastre.current = { tipo: 'carpeta', id: c.id } }}
        onDragEnd={() => { arrastre.current = null; setSobre(null) }}
        onDragOver={e => { if (!acepta()) return; e.preventDefault(); e.stopPropagation(); setSobre(c.id) }}
        onDragLeave={() => setSobre(s => s === c.id ? null : s)}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const pid = e.dataTransfer.getData('text/pagina')
          if (pid && !archivo) { a.moverPagina(pid, c.id); setManual(m => ({ ...m, [c.id]: true })) }
          const cid = e.dataTransfer.getData('text/carpeta')
          if (cid && cid !== c.id && !archivo && puedeAnidar(carpetas, cid, c.id) === null) { a.anidarCarpeta(cid, c.id); setManual(m => ({ ...m, [c.id]: true })) }
          setSobre(null); arrastre.current = null
        }}
        onContextMenu={e => { e.preventDefault(); abrirMenu(objetivo, punto(e)) }}>
        <div className={css.carpetaCuerpo} {...(edit ? {} : { role: 'button', tabIndex: 0, 'aria-expanded': abre, onClick: () => alternar(n, archivo), onKeyDown: alTeclear(() => alternar(n, archivo)) })}>
          <ChevronRight size={13} className={css.chevron} data-abierto={abre ? '' : undefined} aria-hidden />
          {abre ? <FolderOpen size={15} aria-hidden /> : <Folder size={15} aria-hidden />}
          {edit ? <Nombre valor={c.nombre} onListo={nom => a.renombrarCarpeta(c.id, nom)} onFin={() => setEditando(null)} /> : <span title={c.nombre}>{c.nombre}</span>}
          {esCarpetaFijada(c) && !archivo && <Pin size={11} className={css.fijada} aria-label="Fijada" />}
          <span className={css.cuenta}>{cuenta(n) || ''}</span>
        </div>
        <button type="button" data-lz-mas className={css.mas} aria-label={`Más acciones de la carpeta ${c.nombre}`} aria-haspopup="menu" aria-expanded={idMenu === c.id}
          onClick={e => abrirMenu(objetivo, e.currentTarget.getBoundingClientRect())}><Ellipsis size={16} aria-hidden /></button>
      </div>
      {abre && <div className={css.hijos}>
        {n.hijas.map(h => filaCarpeta(h, nivel + 1, archivo))}
        {n.paginas.map(x => filaPagina(x, archivo))}
        {n.paginas.length === 0 && n.hijas.length === 0 && <p className={css.vacia}>vacía</p>}
      </div>}
    </div>
  }

  const porId = useMemo(() => new Map(paginas.map(x => [x.id, x])), [paginas])
  const filasRecientes = useMemo(() => buscando ? [] : (recientes ?? []).map(id => porId.get(id)).filter((x): x is PaginaResumen => !!x), [recientes, porId, buscando])

  /** ↑↓ mueven la marca por las filas visibles (en el orden en que se ven); Enter abre la marcada, o la primera. */
  const alTeclearBuscador = (e: KeyboardEvent) => {
    if (!teclado) return
    const filas = [...(raiz.current?.querySelectorAll<HTMLElement>('[data-lz-pagina]') ?? [])]
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!filas.length) return
      e.preventDefault()
      // La marca es de la FILA (un reciente también está en su carpeta): se busca por su clave, no por el lienzo.
      const i = filas.findIndex(f => f.dataset.lzClave === cursor)
      const j = i < 0 ? (e.key === 'ArrowDown' ? 0 : filas.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + filas.length) % filas.length
      setCursor(filas[j].dataset.lzClave ?? null)
      filas[j].scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      const fila = filas.find(f => f.dataset.lzClave === cursor) ?? filas[0]
      const x = fila?.dataset.lzPagina ? porId.get(fila.dataset.lzPagina) : undefined
      if (x) { e.preventDefault(); onAbrir(x) }
    }
  }

  const hayFijados = v.fijados.carpetas.length + v.fijados.paginas.length > 0
  const hayVivas = hayFijados || v.raiz.length > 0 || v.sueltas.length > 0
  const hayArchivo = v.archivados.cuenta > 0
  const vivasConCarpeta = carpetas.some(c => !c.archivada)

  return <div ref={raiz} className={css.raiz} data-variante={variante} style={vars}>
    <label className={css.buscar}><Search size={13} aria-hidden />
      <input autoFocus={autoFoco} value={busqueda} onChange={e => { setBusqueda(e.target.value); setCursor(null) }} onKeyDown={alTeclearBuscador} placeholder="Buscar un lienzo" aria-label="Buscar un lienzo" /></label>
    {estado && <p className={css.aviso}>{estado}</p>}
    {a.fallo && <p className={css.aviso} role="alert">No quedó guardado: {a.fallo}</p>}
    {!estado && !hayVivas && !hayArchivo && !filasRecientes.length && <p className={css.aviso}>{buscando ? 'Ningún lienzo se llama así.' : 'Todavía no hay lienzos.'}</p>}

    {filasRecientes.length > 0 && <section aria-label="Recientes">
      <p className={css.ceja}>Recientes</p>
      {filasRecientes.map(x => filaPagina(x, false, 'r:'))}
    </section>}

    {hayFijados && <section aria-label="Fijados">
      <p className={css.ceja} data-fijados=""><Pin size={11} aria-hidden /> Fijados</p>
      {v.fijados.carpetas.map(n => filaCarpeta(n, 0))}
      {v.fijados.paginas.map(x => filaPagina(x))}
    </section>}

    {v.raiz.length > 0 && <section aria-label="Carpetas">
      {hayFijados && <p className={css.ceja}>Carpetas</p>}
      {v.raiz.map(n => filaCarpeta(n, 0))}
    </section>}

    {(v.sueltas.length > 0 || (vivasConCarpeta && !buscando && hayVivas)) && <section aria-label="Sin carpeta">
      {/* Con nombre y como destino: sacar un lienzo de su carpeta es soltarlo AQUÍ, nunca en un hueco cualquiera. */}
      <p className={css.ceja} data-suelta={sobre === '__raiz__' ? 'encima' : undefined}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSobre('__raiz__') }}
        onDragLeave={() => setSobre(s => s === '__raiz__' ? null : s)}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const pid = e.dataTransfer.getData('text/pagina'); if (pid) a.moverPagina(pid, null)
          const cid = e.dataTransfer.getData('text/carpeta'); if (cid && carpetas.find(c => c.id === cid)?.madre) a.anidarCarpeta(cid, null)
          setSobre(null); arrastre.current = null
        }}>Sin carpeta<small>{v.sueltas.length || ''}</small></p>
      {v.sueltas.map(x => filaPagina(x))}
    </section>}

    {hayArchivo && <section className={css.archivados} aria-label="Archivados">
      <button className={css.pliegue} onClick={() => setVerArchivados(s => !s)} aria-expanded={verArchivados || buscando}>
        <ChevronRight size={12} aria-hidden data-abierto={verArchivados || buscando ? '' : undefined} /><Archive size={11} aria-hidden /> Archivados<small>{v.archivados.cuenta}</small>
      </button>
      {(verArchivados || buscando) && <>
        {v.archivados.carpetas.map(n => filaCarpeta(n, 0, true))}
        {v.archivados.paginas.map(x => filaPagina(x, true))}
      </>}
    </section>}

    {menu && <MenuLienzo objetivo={menu.objetivo} ancla={menu.ancla} carpetas={carpetas} a={a} vars={vars} onAbrir={onAbrir}
      onRenombrar={() => setEditando(menu.objetivo.tipo === 'pagina' ? { tipo: 'pagina', id: menu.objetivo.pagina.id } : { tipo: 'carpeta', id: menu.objetivo.carpeta.id })}
      onNuevaPagina={onNuevaPagina} onNuevaSubcarpeta={onNuevaSubcarpeta} onCerrar={() => setMenu(null)} />}
  </div>
}
