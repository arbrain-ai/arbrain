/**
 * Canvas v4 — persistencia LOCAL del banco de pruebas.
 *
 * POR QUE LOCAL Y NO LA TABLA `draw`:
 *
 * La tabla vive en la base de PRODUCCION de Daniel, con sus 115 paginas reales.
 * Escribir ahi —aunque sea una fila nueva y aunque el formato sea aditivo— es
 * una decision que le toca a el, no a mi. El spec dice que el formato evoluciona
 * de forma aditiva; no dice que yo pueda empezar a escribir en su produccion sin
 * avisarle.
 *
 * Asi que el banco de pruebas persiste en IndexedDB y el camino a la tabla queda
 * DECLARADO como pendiente de su firma. El modulo `Autosave` es el mismo: lo
 * unico que cambia es la funcion de guardado que se le inyecta, y por eso probar
 * aqui prueba el camino completo — incluido el acuse obligatorio, que es
 * justamente lo que fallaba en el v3.
 */

import type { SaveFn, SaveResult } from './autosave'
import type { CanvasElement, Camera } from '../model/element'

const DB = 'canvas-v4'
const STORE = 'documentos'

interface Guardado {
  pageId: string
  elements: CanvasElement[]
  camera: Camera
  version: number
  at: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'pageId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('no se pudo abrir la base local'))
  })
}

function tx<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, modo)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('fallo la operacion local'))
  }))
}

/**
 * Guardar con ACUSE. Devuelve la version que quedo escrita, y solo despues de
 * RELEER lo escrito.
 *
 * Releer no es paranoia: el bug de los dos dias del v3 fue exactamente que el
 * cliente se declaraba guardado sin que nadie confirmara nada. Un `ok` que no
 * verifica no es un acuse, es una esperanza.
 */
export const saveLocal: SaveFn = async ({ pageId, elements, camera, baseVersion }): Promise<SaveResult> => {
  try {
    const version = baseVersion + 1
    const doc: Guardado = { pageId, elements, camera, version, at: Date.now() }
    await tx('readwrite', s => s.put(doc))
    const leido = await tx<Guardado | undefined>('readonly', s => s.get(pageId))
    if (!leido || leido.version !== version) {
      return { ok: false, error: 'el guardado no se pudo verificar al releer' }
    }
    return { ok: true, version }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function loadLocal(pageId: string): Promise<Guardado | null> {
  try {
    return (await tx<Guardado | undefined>('readonly', s => s.get(pageId))) ?? null
  } catch {
    return null
  }
}

/**
 * LA CÁMARA DE CADA PÁGINA, EN ESTE APARATO (5 oct 2026).
 *
 * Moverse por una página de la nube subía el documento ENTERO y le sumaba una versión: en «Customer Journey ·
 * Cerebro Artificial» eran 8 MB por cada paneo, y cada versión nueva obligaba a los demás editores abiertos a
 * traerse otros 8 MB y fusionar. Mirar no es editar. La cámara es además del aparato (la laptop y el iPad no ven
 * lo mismo), así que vive aquí y viaja a la nube solo de paso, cuando se guarda una edición de verdad.
 */
const CLAVE_CAMARAS = 'canvas-v4:camaras'

export function leerCamaraLocal(pageId: string): Camera | null {
  try {
    const c = (JSON.parse(localStorage.getItem(CLAVE_CAMARAS) ?? '{}') as Record<string, Camera>)[pageId]
    return c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.zoom) && c.zoom > 0 ? c : null
  } catch { return null }
}

export function guardarCamaraLocal(pageId: string, c: Camera): void {
  try {
    const todas = JSON.parse(localStorage.getItem(CLAVE_CAMARAS) ?? '{}') as Record<string, Camera>
    todas[pageId] = { x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100, zoom: Math.round(c.zoom * 1e4) / 1e4 }
    localStorage.setItem(CLAVE_CAMARAS, JSON.stringify(todas))
  } catch { /* sin almacenamiento: se vuelve a abrir en la cámara de la nube */ }
}
