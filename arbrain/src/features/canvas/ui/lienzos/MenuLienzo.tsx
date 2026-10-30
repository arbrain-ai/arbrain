'use client'

/**
 * El menú ⋯ de la lista de lienzos (6 oct 2026): UN componente para el panel «¿Qué lienzo?» y para la sección Lienzo, para
 * lienzos y para carpetas. El 80/20 que pidió Daniel: abrir, renombrar, mover, duplicar, fijar, archivar, eliminar.
 *
 * Tres vistas dentro del mismo recuadro: las acciones, «Mover a…» (las carpetas donde puede caer) y la confirmación de
 * eliminar (en el sitio, sin diálogo del sistema). Va en un portal: ningún `overflow` del panel o del riel lo recorta.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, ArrowLeft, Check, Copy, ExternalLink, FolderInput, FolderPlus, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import type { Carpeta, PaginaResumen } from '../../state/nube'
import type { AccionesLienzos } from '../../state/acciones-lienzos'
import { puedeSerMadre } from '../../state/carpetas'
import { destinosDeCarpeta, destinosDePagina, type Destino } from '../../state/vista-lienzos'
import { aFijo, zoomUI } from '@/shared/lib/zoom-ui'
import css from './lienzos.module.css'

export type Objetivo =
  | { tipo: 'pagina'; pagina: PaginaResumen; archivada: boolean; enCarpetaFijada: boolean }
  | { tipo: 'carpeta'; carpeta: Carpeta; archivada: boolean }

interface Props {
  objetivo: Objetivo
  /** El botón (o el punto del clic derecho) del que cuelga el menú. */
  ancla: DOMRect
  carpetas: Carpeta[]
  a: AccionesLienzos
  vars?: CSSProperties
  onAbrir?: (x: PaginaResumen) => void
  onRenombrar: () => void
  /** Solo la sección Lienzo (que crea con su propio flujo): «Lienzo nuevo aquí» y «Subcarpeta nueva». */
  onNuevaPagina?: (folderId: string) => void
  onNuevaSubcarpeta?: (madre: string) => void
  onCerrar: () => void
}

interface Item { clave: string; etiqueta: string; icono: ReactNode; hacer: () => void; peligro?: boolean; sigue?: boolean; sepAntes?: boolean }
type Vista = 'principal' | 'mover' | 'confirmar'

export function MenuLienzo(p: Props) {
  const { objetivo: o, a } = p
  const [vista, setVista] = useState<Vista>('principal')
  const caja = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number } | null>(null)
  const nombre = o.tipo === 'pagina' ? o.pagina.nombre : o.carpeta.nombre

  // Debajo del botón, alineado a su derecha; si no cabe, arriba. Se vuelve a medir al cambiar de vista (cambia el alto).
  useLayoutEffect(() => {
    const el = caja.current; if (!el) return
    // 6 oct 2026: bajo el zoom de la UI (⌘+) se mide en px de pantalla y se convierte al poner left/top; antes el menú creía
    // caber abajo, se salía de la ventana y Archivar/Eliminar quedaban fuera de la vista.
    const z = zoomUI()
    const { width: w, height: h } = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const alto = Math.min(h, vh - 16)
    const left = Math.max(8, Math.min(p.ancla.right - w, vw - w - 8))
    const abajo = vh - p.ancla.bottom - 12, arriba = p.ancla.top - 12
    let top: number
    if (alto <= abajo) top = p.ancla.bottom + 4
    else if (alto <= arriba) top = p.ancla.top - alto - 4
    else top = Math.max(8, vh - alto - 8)
    setPos({ left: aFijo(left, z), top: aFijo(top, z), maxHeight: alto < h ? aFijo(alto, z) : undefined })
  }, [p.ancla, vista])

  useEffect(() => {
    // El botón ⋯ que lo abrió lo cierra él mismo (alternar); aquí solo lo de fuera.
    const fuera = (e: PointerEvent) => {
      const t = e.target as Element
      if (caja.current?.contains(t) || t.closest?.('[data-lz-mas][aria-expanded="true"]')) return
      p.onCerrar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); vista === 'principal' ? p.onCerrar() : setVista('principal'); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const botones = [...(caja.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
      if (!botones.length) return
      e.preventDefault()
      const i = botones.indexOf(document.activeElement as HTMLButtonElement)
      botones[(i + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) % botones.length].focus()
    }
    const cerrar = () => p.onCerrar()
    window.addEventListener('pointerdown', fuera, true)
    window.addEventListener('keydown', tecla, true)
    window.addEventListener('resize', cerrar)
    return () => { window.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', tecla, true); window.removeEventListener('resize', cerrar) }
  }, [p, vista])

  // Al abrir y al cambiar de vista, el foco entra al primer botón (el teclado puede recorrer el menú).
  useEffect(() => { caja.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus() }, [vista])

  const cerrando = (f: () => void) => () => { f(); p.onCerrar() }
  const items: Item[] = []
  if (o.tipo === 'pagina') {
    const x = o.pagina
    if (p.onAbrir) items.push({ clave: 'abrir', etiqueta: 'Abrir', icono: <ExternalLink size={15} />, hacer: cerrando(() => p.onAbrir!(x)) })
    if (o.archivada) items.push({ clave: 'restaurar', etiqueta: 'Restaurar', icono: <ArchiveRestore size={15} />, hacer: cerrando(() => a.archivarPagina(x, false)) })
    else items.push({ clave: 'renombrar', etiqueta: 'Renombrar', icono: <Pencil size={15} />, hacer: cerrando(p.onRenombrar) })
    items.push({ clave: 'mover', etiqueta: 'Mover a carpeta…', icono: <FolderInput size={15} />, hacer: () => setVista('mover'), sigue: true })
    if (!o.archivada) {
      items.push({ clave: 'duplicar', etiqueta: 'Duplicar', icono: <Copy size={15} />, hacer: cerrando(() => a.duplicarPagina(x.id)) })
      // En una carpeta fijada el pin no aplica: manda la carpeta (se saca de ella para soltarlo).
      if (!o.enCarpetaFijada) items.push(x.fijado
        ? { clave: 'fijar', etiqueta: 'Quitar de fijados', icono: <PinOff size={15} />, hacer: cerrando(() => a.alternarFijado(x)) }
        : { clave: 'fijar', etiqueta: 'Fijar arriba', icono: <Pin size={15} />, hacer: cerrando(() => a.alternarFijado(x)) })
      items.push({ clave: 'archivar', etiqueta: 'Archivar', icono: <Archive size={15} />, hacer: cerrando(() => a.archivarPagina(x, true)) })
    }
    items.push({ clave: 'eliminar', etiqueta: 'Eliminar', icono: <Trash2 size={15} />, hacer: () => setVista('confirmar'), peligro: true, sigue: true, sepAntes: true })
  } else {
    const c = o.carpeta
    if (o.archivada) items.push({ clave: 'restaurar', etiqueta: 'Restaurar carpeta', icono: <ArchiveRestore size={15} />, hacer: cerrando(() => a.archivarCarpeta(c, false)) })
    else {
      if (p.onNuevaPagina) items.push({ clave: 'nueva', etiqueta: 'Lienzo nuevo aquí', icono: <Plus size={15} />, hacer: cerrando(() => p.onNuevaPagina!(c.id)) })
      if (p.onNuevaSubcarpeta && puedeSerMadre(p.carpetas, c.id)) items.push({ clave: 'sub', etiqueta: 'Subcarpeta nueva', icono: <FolderPlus size={15} />, hacer: cerrando(() => p.onNuevaSubcarpeta!(c.id)) })
      items.push({ clave: 'renombrar', etiqueta: 'Renombrar', icono: <Pencil size={15} />, hacer: cerrando(p.onRenombrar) })
      if (destinosDeCarpeta(p.carpetas, c.id).length) items.push({ clave: 'mover', etiqueta: 'Mover a…', icono: <FolderInput size={15} />, hacer: () => setVista('mover'), sigue: true })
      items.push({ clave: 'archivar', etiqueta: 'Archivar carpeta', icono: <Archive size={15} />, hacer: cerrando(() => a.archivarCarpeta(c, true)) })
    }
    items.push({ clave: 'eliminar', etiqueta: 'Eliminar carpeta', icono: <Trash2 size={15} />, hacer: () => setVista('confirmar'), peligro: true, sigue: true, sepAntes: true })
  }

  const destinos: Destino[] = vista !== 'mover' ? [] : o.tipo === 'pagina' ? destinosDePagina(p.carpetas) : destinosDeCarpeta(p.carpetas, o.carpeta.id)
  const actual = o.tipo === 'pagina' ? o.pagina.folderId : o.carpeta.madre
  const irA = (d: Destino) => { if (o.tipo === 'pagina') a.moverPagina(o.pagina.id, d.id); else a.anidarCarpeta(o.carpeta.id, d.id); p.onCerrar() }
  const eliminar = () => { if (o.tipo === 'pagina') a.borrarPagina(o.pagina.id); else a.borrarCarpeta(o.carpeta.id); p.onCerrar() }

  return createPortal(
    <div ref={caja} className={css.menu} role="menu" aria-label={`Acciones de ${nombre}`} style={{ ...p.vars, left: pos?.left ?? 0, top: pos?.top ?? 0, ...(pos?.maxHeight ? { maxHeight: pos.maxHeight, overflowY: 'auto' as const } : {}), visibility: pos ? 'visible' : 'hidden' }}>
      {vista === 'principal' && items.map(i => <div key={i.clave}>
        {i.sepAntes && <div className={css.sep} role="separator" />}
        <button role="menuitem" className={css.item} data-peligro={i.peligro ? '' : undefined} onClick={i.hacer}>{i.icono}<span>{i.etiqueta}</span></button>
      </div>)}
      {vista === 'mover' && <>
        <div className={css.menuTitulo}><button aria-label="Volver" onClick={() => setVista('principal')}><ArrowLeft size={14} /></button>Mover a…</div>
        {destinos.map(d => <button key={d.id ?? 'raiz'} role="menuitem" className={css.item} disabled={d.id === actual} onClick={() => irA(d)}>
          <span>{d.etiqueta}</span>{d.id === actual && <Check size={14} aria-label="Está aquí" />}
        </button>)}
      </>}
      {vista === 'confirmar' && <div className={css.confirma}>
        <p>¿Eliminar «{nombre}»?</p>
        <small>{o.tipo === 'pagina'
          ? 'Sale de tus lienzos. El borrado es suave: el trabajo sigue en la base.'
          : 'Sus lienzos y subcarpetas salen a la raíz; no se borra ninguno.'}</small>
        <div><button onClick={() => setVista('principal')}>Cancelar</button><button data-peligro="" onClick={eliminar}>Eliminar</button></div>
      </div>}
    </div>,
    document.body)
}
