'use client'

/**
 * Las acciones de la lista de lienzos (6 oct 2026): UNA sola implementación para «¿Qué lienzo?» (panel) y para la sección
 * Lienzo. Cada anfitrión pone su estado (`paginas`, `carpetas`) y recibe de vuelta el mismo conjunto de acciones: cambian en
 * pantalla al instante, se confirman con la base y, si la base las rechaza, vuelven y dicen por qué en `fallo`.
 *
 * Una escritura a la vez por lienzo (el servidor lee y mezcla `settings`; dos clics rápidos no deben cruzarse).
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import * as Nube from './nube'
import type { Carpeta, PaginaResumen } from './nube'
import { alMiniatura, rellenarMiniaturas } from './miniaturas'
import { carpetaArchivada, conSubcarpetas } from './vista-lienzos'
import { GRUPO_GENERAL, ordenAlFinal } from './organizacion'
import type { Theme } from '../theme/tokens'

const cola = new Map<string, Promise<unknown>>()
const enCola = <T,>(clave: string, trabajo: () => Promise<T>): Promise<T> => {
  const t = (cola.get(clave) ?? Promise.resolve()).catch(() => {}).then(trabajo)
  cola.set(clave, t)
  return t
}

export interface EstadoLienzos {
  paginas: PaginaResumen[]; carpetas: Carpeta[]
  setPaginas: Dispatch<SetStateAction<PaginaResumen[]>>; setCarpetas: Dispatch<SetStateAction<Carpeta[]>>
  /** Tras cada escritura confirmada (el panel relee su fuente compartida). */
  alTerminar?: () => void
  /** Un lienzo se borró: el anfitrión suelta el que tenga abierto. */
  alBorrarPagina?: (id: string) => void
  /** Rellenar miniaturas solo mientras la lista se ve, y con este tema. */
  miniaturas?: { activo: boolean; tema: Theme }
}

export interface AccionesLienzos {
  fallo: string | null
  renombrarPagina: (id: string, nombre: string) => void
  renombrarCarpeta: (id: string, nombre: string) => void
  moverPagina: (id: string, folderId: string | null) => void
  anidarCarpeta: (id: string, madre: string | null) => void
  duplicarPagina: (id: string) => void
  alternarFijado: (x: PaginaResumen) => void
  archivarPagina: (x: PaginaResumen, si: boolean) => void
  borrarPagina: (id: string) => void
  archivarCarpeta: (c: Carpeta, si: boolean) => void
  borrarCarpeta: (id: string) => void
  nuevaCarpeta: (madre?: string | null) => void
}

export function useAccionesLienzos(e: EstadoLienzos): AccionesLienzos {
  const [fallo, setFallo] = useState<string | null>(null)
  // Las funciones de abajo viven en la primera vuelta de cada clic: el estado más reciente entra por una referencia.
  const ref = useRef(e); ref.current = e

  /** Aplica en pantalla, escribe en cola; si la base dice que no, deshace y avisa. */
  const hacer = useCallback((clave: string, aplicar: () => void, deshacer: () => void, escribir: () => Promise<unknown>) => {
    setFallo(null)
    aplicar()
    enCola(clave, escribir).then(() => ref.current.alTerminar?.()).catch(err => {
      deshacer()
      setFallo(err instanceof Error ? err.message : 'No se pudo guardar.')
    })
  }, [])

  const parchePagina = (id: string, p: Partial<PaginaResumen>) => ref.current.setPaginas(ps => ps.map(x => x.id === id ? { ...x, ...p } : x))
  const parcheCarpeta = (id: string, p: Partial<Carpeta>) => ref.current.setCarpetas(cs => cs.map(c => c.id === id ? { ...c, ...p } : c))
  const pagina = (id: string) => ref.current.paginas.find(x => x.id === id)
  const carpeta = (id: string) => ref.current.carpetas.find(c => c.id === id)

  const acciones: AccionesLienzos = {
    fallo,
    renombrarPagina: (id, nombre) => {
      const antes = pagina(id)?.nombre; if (antes === undefined || antes === nombre) return
      hacer(id, () => parchePagina(id, { nombre }), () => parchePagina(id, { nombre: antes }), () => Nube.renombrarPagina(id, nombre))
    },
    renombrarCarpeta: (id, nombre) => {
      const antes = carpeta(id)?.nombre; if (antes === undefined || antes === nombre) return
      hacer(`c:${id}`, () => parcheCarpeta(id, { nombre }), () => parcheCarpeta(id, { nombre: antes }), () => Nube.renombrarCarpeta(id, nombre))
    },
    moverPagina: (id, folderId) => {
      const antes = pagina(id); if (!antes || antes.folderId === folderId) return
      hacer(id, () => parchePagina(id, { folderId }), () => parchePagina(id, { folderId: antes.folderId }), () => Nube.moverPagina(id, folderId))
    },
    anidarCarpeta: (id, madre) => {
      const antes = carpeta(id); if (!antes || antes.madre === madre) return
      hacer(`c:${id}`, () => parcheCarpeta(id, { madre }), () => parcheCarpeta(id, { madre: antes.madre }), () => Nube.anidarCarpeta(id, madre))
    },
    duplicarPagina: id => {
      setFallo(null)
      enCola(id, () => Nube.duplicarPagina(id)).then(p => { ref.current.setPaginas(ps => [p, ...ps]); ref.current.alTerminar?.() })
        .catch(err => setFallo(err instanceof Error ? err.message : 'No se pudo duplicar.'))
    },
    alternarFijado: x => {
      const antes = x.fijado
      if (antes) return hacer(x.id, () => parchePagina(x.id, { fijado: null }), () => parchePagina(x.id, { fijado: antes }), () => Nube.fijarPagina(x.id, false))
      const orden = ordenAlFinal(ref.current.paginas)
      hacer(x.id, () => parchePagina(x.id, { fijado: { grupo: GRUPO_GENERAL, orden } }), () => parchePagina(x.id, { fijado: null }), () => Nube.fijarPagina(x.id, true, GRUPO_GENERAL, orden))
    },
    archivarPagina: (x, si) => {
      // Restaurar un lienzo cuya carpeta sigue archivada lo sacaría a un sitio oculto: sale a «Sin carpeta».
      const salir = !si && carpetaArchivada(ref.current.carpetas, x.folderId)
      hacer(x.id,
        () => parchePagina(x.id, { archivado: si ? new Date().toISOString() : null, ...(salir ? { folderId: null } : {}) }),
        () => parchePagina(x.id, { archivado: x.archivado, folderId: x.folderId }),
        async () => { if (salir) await Nube.moverPagina(x.id, null); await Nube.archivarPagina(x.id, si) })
    },
    borrarPagina: id => {
      setFallo(null)
      enCola(id, () => Nube.borrarPagina(id)).then(() => {
        ref.current.setPaginas(ps => ps.filter(x => x.id !== id)); ref.current.alBorrarPagina?.(id); ref.current.alTerminar?.()
      }).catch(err => setFallo(err instanceof Error ? err.message : 'No se pudo eliminar.'))
    },
    archivarCarpeta: (c, si) => {
      const todas = new Set(conSubcarpetas(ref.current.carpetas, c.id))
      const antesC = ref.current.carpetas, antesP = ref.current.paginas
      const ahora = new Date().toISOString()
      hacer(`c:${c.id}`,
        () => {
          ref.current.setCarpetas(cs => cs.map(k => todas.has(k.id) ? { ...k, archivada: si ? ahora : null, ...(!si && k.id === c.id && c.madre && carpeta(c.madre)?.archivada ? { madre: null } : {}) } : k))
          // Restaurar devuelve la carpeta con sus lienzos (el servidor limpia su marca de archivado).
          if (!si) ref.current.setPaginas(ps => ps.map(x => x.folderId && todas.has(x.folderId) ? { ...x, archivado: null } : x))
        },
        () => { ref.current.setCarpetas(antesC); ref.current.setPaginas(antesP) },
        () => Nube.archivarCarpeta(c.id, si))
    },
    borrarCarpeta: id => {
      setFallo(null)
      enCola(`c:${id}`, () => Nube.borrarCarpeta(id)).then(() => {
        // Sus subcarpetas y lienzos salen a la raíz en el servidor; la pantalla lo refleja.
        ref.current.setCarpetas(cs => cs.filter(c => c.id !== id).map(c => c.madre === id ? { ...c, madre: null } : c))
        ref.current.setPaginas(ps => ps.map(x => x.folderId === id ? { ...x, folderId: null } : x))
        ref.current.alTerminar?.()
      }).catch(err => setFallo(err instanceof Error ? err.message : 'No se pudo eliminar la carpeta.'))
    },
    nuevaCarpeta: madre => {
      setFallo(null)
      Nube.crearCarpeta(madre ? 'Subcarpeta nueva' : undefined, madre).then(c => { ref.current.setCarpetas(cs => [...cs, c]); ref.current.alTerminar?.() })
        .catch(err => setFallo(err instanceof Error ? err.message : 'No se pudo crear la carpeta.'))
    },
  }

  // Una miniatura nueva (guardado o backfill) cambia la imagen de su fila sin releer la lista.
  useEffect(() => alMiniatura((id, url) => ref.current.setPaginas(ps => ps.map(x => x.id === id ? { ...x, miniatura: url } : x))), [])
  const m = e.miniaturas, hay = e.paginas.length > 0
  useEffect(() => {
    if (!m?.activo || !hay) return
    // Con la ventana oculta no se gasta (rellenarMiniaturas se sale): se retoma cuando vuelve a verse.
    const arrancar = () => { if (!document.hidden) void rellenarMiniaturas(ref.current.paginas, m.tema) }
    arrancar()
    document.addEventListener('visibilitychange', arrancar)
    return () => document.removeEventListener('visibilitychange', arrancar)
  }, [m?.activo, m?.tema, hay])

  return acciones
}
