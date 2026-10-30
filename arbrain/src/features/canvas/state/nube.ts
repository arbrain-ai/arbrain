/**
 * Canvas v4 — la nube.
 *
 * Lo que Daniel pidio: *"poder compartir entre sesiones desde mi laptop, ipad,
 * telefono, mac mini los diagramas"*.
 *
 * Tres piezas y una regla:
 *
 *  1. LEER / ESCRIBIR pasan por las rutas del servidor, jamas por el cliente de
 *     Supabase del navegador. Hecho de plataforma #26: sin sesion, RLS hace que
 *     el UPDATE matchee cero filas SIN error, y el cliente marca "Guardado".
 *  2. TIEMPO REAL escucha `postgres_changes` de la tabla `draw` filtrado por
 *     esta pagina. Ese canal SI puede ser del navegador: solo LEE.
 *  3. La FUSION es por elemento y por `updatedAt`. Reemplazar el documento
 *     entero con lo que llega hace que el ultimo dispositivo en hablar pise el
 *     trabajo del otro.
 *
 * ⚠️ El anti-eco vive en la version. Y ahi estaba el bug del v3: su guardado
 * humano no subia `agent_version`, asi que el otro dispositivo recibia el
 * evento y lo DESCARTABA por no ser mayor. Aqui toda escritura sube la version
 * (ver la ruta PUT), y por eso el espejo existe.
 */

import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { CanvasElement, Camera } from '../model/element'

export interface PaginaResumen {
  id: string
  nombre: string
  folderId: string | null
  actualizado: string
  version: number
  elementos: number
  esV4: boolean
  /** URL pública de la miniatura (bucket `draw-thumbnails`) o null si aún no se genera. */
  miniatura: string | null
  /** Fijado a mano en «Fijados» y cuándo se archivó. Ver `organizacion.ts`. */
  fijado: import('./organizacion').Fijado | null
  archivado: string | null
}

/** `madre`: la carpeta que la contiene (un nivel, como sfmap). `archivada`: ISO del archivo; sus subcarpetas la siguen. */
export interface Carpeta { id: string; nombre: string; orden: number; madre: string | null; archivada?: string | null }

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const j = await r.json().catch(() => ({ ok: false, error: `respuesta ilegible (${r.status})` }))
  if (!j.ok) throw new Error(j.error ?? `error ${r.status}`)
  return j as T
}

export const listarPaginas = () =>
  pedir<{ paginas: PaginaResumen[] }>('/api/canvas/pages').then(r => r.paginas)

export const listarCarpetas = () =>
  pedir<{ carpetas: Carpeta[] }>('/api/canvas/folders').then(r => r.carpetas)

export const crearPagina = (nombre?: string, folderId?: string | null) =>
  pedir<{ pagina: PaginaResumen }>('/api/canvas/pages', {
    method: 'POST', body: JSON.stringify({ nombre, folderId }),
  }).then(r => r.pagina)

/** Fija o desfija (grupo y orden al fijar). Solo `settings`: no sube la version ni mueve la fecha. */
export const fijarPagina = (id: string, fijar: boolean, grupo?: string, orden?: number) =>
  pedir(`/api/canvas/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ fijar, grupo, orden }) })

/** Archivar no borra: la marca se quita igual de facil. */
export const archivarPagina = (id: string, archivar: boolean) =>
  pedir(`/api/canvas/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ archivar }) })

/** Duplica un lienzo en su misma carpeta («… (copia)»). */
export const duplicarPagina = (id: string) =>
  pedir<{ pagina: PaginaResumen }>('/api/canvas/pages', { method: 'POST', body: JSON.stringify({ duplicarDe: id }) }).then(r => r.pagina)

/** Archiva o restaura una carpeta con sus subcarpetas (restaurar devuelve también sus lienzos). No borra nada. */
export const archivarCarpeta = (id: string, archivar: boolean) =>
  pedir('/api/canvas/folders', { method: 'PATCH', body: JSON.stringify({ accion: 'archivar', id, archivar }) })

export const crearCarpeta = (nombre?: string, madre?: string | null) =>
  pedir<{ carpeta: Carpeta }>('/api/canvas/folders', {
    method: 'POST', body: JSON.stringify({ nombre, madre: madre ?? null }),
  }).then(r => r.carpeta)

/** Mete una carpeta dentro de otra (o la saca a la raiz con `null`). Un nivel. */
export const anidarCarpeta = (id: string, madre: string | null) =>
  pedir('/api/canvas/folders', { method: 'PATCH', body: JSON.stringify({ accion: 'anidar', id, madre }) })

/** Solo el nombre: no toca el documento (ver la ruta). */
export const renombrarPagina = (paginaId: string, nombre: string) =>
  pedir('/api/canvas/folders', { method: 'PATCH', body: JSON.stringify({ accion: 'renombrarPagina', paginaId, nombre }) })

export const renombrarCarpeta = (id: string, nombre: string) =>
  pedir('/api/canvas/folders', { method: 'PATCH', body: JSON.stringify({ accion: 'renombrar', id, nombre }) })

export const borrarCarpeta = (id: string) =>
  pedir('/api/canvas/folders', { method: 'PATCH', body: JSON.stringify({ accion: 'borrar', id }) })

export const moverPagina = (paginaId: string, folderId: string | null) =>
  pedir('/api/canvas/folders', { method: 'PATCH', body: JSON.stringify({ accion: 'mover', paginaId, folderId }) })

export const borrarPagina = (id: string) =>
  pedir(`/api/canvas/pages/${id}`, { method: 'DELETE' })

export interface InformeMigracion {
  entraron: number
  porTipo: Record<string, number>
  perdidos: Array<{ tipo: string; id: string; motivo: string }>
  aproximados: string[]
}

export interface PaginaCompleta {
  id: string; nombre: string; folderId: string | null
  version: number; esV4: boolean
  /** true si viene del canvas anterior y se convirtio AL LEER (nada escrito). */
  convertida?: boolean
  informe?: InformeMigracion
  /** El tema con el que se dibujo. Solo viene en paginas del canvas anterior. */
  tema?: 'claro' | 'oscuro'
  elements: CanvasElement[]; camera: Camera | null
}

/** Persiste la conversion. Es el UNICO camino que escribe una pagina del v3. */
export const convertirPagina = (id: string) =>
  pedir<{ version: number; informe: InformeMigracion; elementos: number }>(
    `/api/canvas/pages/${id}/convertir`, { method: 'POST' })

export const cargarPagina = (id: string) =>
  pedir<{ pagina: PaginaCompleta }>(`/api/canvas/pages/${id}`).then(r => r.pagina)

export const guardarPagina = (
  id: string, elements: CanvasElement[], camera: Camera, nombre?: string,
) => pedir<{ version: number }>(`/api/canvas/pages/${id}`, {
  method: 'PUT', body: JSON.stringify({ elements, camera, nombre }),
}).then(r => r.version)

/** Lo que dice el servidor a un guardado con base: hecho, o "ya voy en otra version". */
export type RespuestaGuardado =
  | { ok: true; version: number }
  | { ok: false; conflicto: true; version: number }

/**
 * Guarda ENCIMA de una version conocida (3 oct 2026). Un 409 no es una
 * excepcion: es informacion (la version actual) y se devuelve como dato.
 */
export async function guardarSobreVersion(
  id: string, elements: CanvasElement[], camera: Camera, baseVersion: number,
): Promise<RespuestaGuardado> {
  const r = await fetch(`/api/canvas/pages/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ elements, camera, baseVersion }),
  })
  const j = await r.json().catch(() => ({ ok: false, error: `respuesta ilegible (${r.status})` }))
  if (r.status === 409 && j.conflicto) return { ok: false, conflicto: true, version: Number(j.version ?? 0) }
  if (!j.ok || typeof j.version !== 'number') throw new Error(j.error ?? `error ${r.status}`)
  return { ok: true, version: j.version }
}

export type ResultadoSinPisar =
  /** Guardado. `guardados` es lo que quedo escrito; `remoto` viene si hubo que fusionar. */
  | { ok: true; version: number; guardados: CanvasElement[]; remoto?: { elements: CanvasElement[]; version: number } }
  /** Choco dos veces: no se insiste. Lo remoto ya se trajo para que la pizarra lo fusione. */
  | { ok: false; conflicto: true; remoto: { elements: CanvasElement[]; version: number } }

/**
 * GUARDAR SIN PISAR A NADIE (3 oct 2026). La web y sfmap escriben la misma fila.
 *
 *   1. guardar sobre la version conocida
 *   2. 409 → traer lo del servidor, fusionar en tres vias (base · lo mio · lo suyo)
 *      y reintentar UNA vez sobre la version que se acaba de leer
 *   3. si vuelve a chocar, se rinde: el que llama muestra el error y la siguiente
 *      vuelta del sondeo trae y fusiona. Sin bucles: un bucle de reintentos contra
 *      otro escritor activo es como dos editores rebotandose la version sin fin.
 *
 * Las dependencias entran como funciones para poder probarlo sin red.
 */
export async function guardarSinPisar(p: {
  base: CanvasElement[] | null
  elements: CanvasElement[]
  baseVersion: number
  guardar: (elements: CanvasElement[], baseVersion: number) => Promise<RespuestaGuardado>
  traer: () => Promise<{ elements: CanvasElement[]; version: number }>
}): Promise<ResultadoSinPisar> {
  const primero = await p.guardar(p.elements, p.baseVersion)
  if (primero.ok) return { ok: true, version: primero.version, guardados: p.elements }
  const remoto = await p.traer()
  const fusion = fusionarConBase(p.base, p.elements, remoto.elements)
  const segundo = await p.guardar(fusion.elements, remoto.version)
  if (segundo.ok) return { ok: true, version: segundo.version, guardados: fusion.elements, remoto }
  return { ok: false, conflicto: true, remoto }
}

/**
 * FUSION por elemento.
 *
 * Gana el `updatedAt` mas alto. Lo local que el remoto no menciona se
 * CONSERVA: si se tirara, dibujar en el iPad borraria del lienzo lo que la
 * laptop acaba de crear y todavia no ha guardado.
 *
 * Lo remoto que falta en local se agrega. Y lo BORRADO de verdad se distingue
 * porque el remoto es el documento completo del otro lado: si un id existe en
 * local con `updatedAt` mas viejo que el guardado remoto y no esta en el
 * remoto, se fue a proposito.
 */
export function fusionar(
  local: CanvasElement[], remoto: CanvasElement[], remotoGuardadoEn: number,
): CanvasElement[] {
  const porId = new Map(local.map(e => [e.id, e]))
  const out: CanvasElement[] = []
  const vistos = new Set<string>()

  let cambio = false
  for (const r of remoto) {
    vistos.add(r.id)
    const l = porId.get(r.id)
    const gana = !l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0) ? r
      : (r.updatedAt ?? 0) < (l.updatedAt ?? 0) ? l
      // Empate: es el MISMO elemento salvo que el contenido diga otra cosa (un
      // generador puede reescribir sin subir `updatedAt`).
      : JSON.stringify(r) === JSON.stringify(l) ? l : r
    if (gana !== l) cambio = true
    out.push(gana)
  }
  for (const l of local) {
    if (vistos.has(l.id)) continue
    // Local mas NUEVO que el guardado remoto = todavia no viajo. Se conserva.
    // Local mas VIEJO = el otro lado lo borro. Se va.
    if ((l.updatedAt ?? 0) > remotoGuardadoEn) out.push(l)
    else cambio = true
  }
  /**
   * SIN CAMBIOS = EL MISMO ARREGLO (2 oct 2026).
   *
   * Devolver un arreglo nuevo con el mismo contenido hacia que el lienzo se
   * creyera editado y guardara; ese guardado avisaba al otro aparato, que hacia
   * lo mismo. Medido con dos editores abiertos en la misma pagina: la version
   * subio de 2 a 36 en un minuto sin que nadie tocara nada.
   */
  return cambio ? out : local
}

/**
 * FUSION DE TRES VIAS (3 oct 2026): la que usa la pizarra para todo lo que
 * llega de fuera, sea por el canal o por el sondeo de version.
 *
 * `fusionar` decide un borrado comparando `updatedAt` contra la hora del
 * guardado remoto, y eso falla en los dos sentidos cuando el otro lado es
 * sfmap: lo que la mano acaba de crear y aun no viaja tiene un `updatedAt`
 * MAS VIEJO que el guardado de sfmap que no lo conoce, y se iba como si sfmap
 * lo hubiera borrado. La base —lo ultimo que se sabe que tenia el servidor—
 * distingue lo que nunca viajo de lo que el otro lado quito a proposito.
 *
 *   · cambio solo de un lado ............ gana ese lado
 *   · cambio de los dos ................. gana el `updatedAt` mas alto; empate, LO LOCAL
 *                                         (lo que el usuario esta tocando no se pisa)
 *   · local sin base y sin remoto ....... nuevo de esta mano: se queda
 *   · en la base, ya no en remoto ....... el otro lado lo borro; se va, salvo que
 *                                         aqui se haya editado despues
 *   · remoto nuevo ...................... entra
 *   · en la base, borrado aqui .......... sigue borrado, salvo que alla lo editaran
 *
 * `localAporta` dice si el resultado lleva algo que el servidor todavia no
 * tiene: solo entonces hay que guardar. Sin aporte, la fusion es MIRAR y no
 * escribe (el rebote del 2 oct).
 */
export function fusionarConBase(
  base: CanvasElement[] | null, local: CanvasElement[], remoto: CanvasElement[],
): { elements: CanvasElement[]; localAporta: boolean } {
  const igual = (a: CanvasElement | undefined, b: CanvasElement | undefined) =>
    a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b))
  const enBase = new Map((base ?? []).map(e => [e.id, e]))
  const enLocal = new Map(local.map(e => [e.id, e]))
  const enRemoto = new Set(remoto.map(e => e.id))
  const out: CanvasElement[] = []
  let localAporta = false

  for (const r of remoto) {
    const l = enLocal.get(r.id)
    const b = enBase.get(r.id)
    if (!l) {
      // No esta aqui: o nunca llego (nuevo alla) o la mano lo borro.
      if (b && igual(r, b)) { localAporta = true; continue }   // borrado aqui; alla nadie lo toco
      out.push(r); continue
    }
    if (igual(l, r)) { out.push(l); continue }
    const cambioL = !b || !igual(l, b)
    const cambioR = !b || !igual(r, b)
    const gana = cambioL && !cambioR ? l
      : cambioR && !cambioL ? r
      : (r.updatedAt ?? 0) > (l.updatedAt ?? 0) ? r : l
    if (gana === l) localAporta = true
    out.push(gana)
  }
  for (const l of local) {
    if (enRemoto.has(l.id)) continue
    const b = enBase.get(l.id)
    // En la base y ya no en remoto: lo borraron alla. Se respeta, salvo que
    // la mano lo haya cambiado despues de la base (eso es trabajo vivo).
    if (b && igual(l, b)) continue
    out.push(l)
    localAporta = true
  }
  const mismo = out.length === local.length && out.every((e, i) => e === local[i])
  return { elements: mismo ? local : out, localAporta }
}

/**
 * ¿Dos arreglos dicen LO MISMO aunque sean objetos distintos? (3 oct 2026)
 *
 * Un clic para seleccionar termina en `onDragEnd`, que re-rutea y devuelve un
 * arreglo nuevo con el mismo contenido; el autoguardado lo tomaba por edicion
 * y subia la version (medido: cada clic, una escritura). Seleccionar es mirar.
 *
 * Barato a proposito: solo se comparan las piezas cuya REFERENCIA cambio, y si
 * cambiaron muchas (un gesto real sobre mucho) se da por cambiado sin medir.
 */
export function mismoContenido(a: CanvasElement[], b: CanvasElement[], tope = 64): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  let revisadas = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    if (++revisadas > tope) return false
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false
  }
  return true
}

/**
 * ¿Lo que hay en pantalla pide guardarse? Mirar, seleccionar, encuadrar desde el
 * panel o activar un embed: no. La misma regla que usa el autoguardado.
 */
export function hayCambioQueGuardar(p: {
  prev: CanvasElement[]; elements: CanvasElement[]; camaraGuardada: Camera | null; camera: Camera
}): boolean {
  const c = p.camaraGuardada
  const mismaCamara = !!c && c.x === p.camera.x && c.y === p.camera.y && c.zoom === p.camera.zoom
  return !(mismaCamara && mismoContenido(p.prev, p.elements))
}

/**
 * La version de una pagina, sin el documento: el sensor del sondeo.
 *
 * sfmap guarda por REST directo y no avisa por el canal, asi que la pizarra
 * pregunta (como sfmap pregunta por lo que guarda la web). ~100 bytes.
 */
export const versionDePagina = (id: string) =>
  pedir<{ version: number }>(`/api/canvas/pages/${id}/version`).then(r => r.version)

/** Que hacer con lo que dijo el sondeo. Puro: el reloj y la red viven afuera. */
export function decidirSondeo(p: {
  servidor: number | null; conocida: number; ocupado: boolean
}): 'nada' | 'esperar' | 'traer' {
  if (p.servidor == null || p.servidor <= p.conocida) return 'nada'
  // El usuario esta en medio de un gesto, escribiendo o guardando: se deja
  // para la vuelta siguiente. La version conocida no se mueve, asi que el
  // siguiente sondeo lo vuelve a ver.
  return p.ocupado ? 'esperar' : 'traer'
}

/** Cada cuanto se pregunta. Del orden de sfmap (4-5 s). */
export const SONDEO_MS = 4500

/**
 * Escucha los cambios de UNA pagina.
 *
 * Devuelve la funcion de baja. El canal es de solo lectura: nada de lo que
 * llegue por aqui puede escribir en la base sin pasar por el servidor.
 */
export type EstadoEspejo = 'conectando' | 'vivo' | 'sin-canal' | 'error'

export function escuchar(
  paginaId: string,
  alCambiar: (doc: { elements: CanvasElement[]; version: number; guardadoEn: number }) => void,
  alEstado?: (e: EstadoEspejo, detalle?: string) => void,
): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) { alEstado?.('sin-canal', 'faltan las llaves publicas'); return () => {} }
  alEstado?.('conectando')

  const db = createClient(url, key, { auth: { persistSession: false } })
  let vivo = true
  let ultima = 0

  const canal: RealtimeChannel = db
    .channel(`canvas-v4:${paginaId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'cambio' }, async ({ payload }) => {
      const version = Number((payload as { version?: number })?.version ?? 0)
      if (!vivo || version <= ultima) return
      ultima = version
      try {
        const pag = await cargarPagina(paginaId)
        if (!vivo) return
        alCambiar({ elements: pag.elements, version: pag.version, guardadoEn: Date.now() })
      } catch {
        alEstado?.('error', 'no se pudo traer la version nueva')
      }
    })
    .subscribe((estado, err) => {
      if (estado === 'SUBSCRIBED') alEstado?.('vivo')
      else if (estado === 'CHANNEL_ERROR') alEstado?.('error', err?.message ?? 'el canal rechazo la suscripcion')
      else if (estado === 'TIMED_OUT') alEstado?.('error', 'el canal no respondio')
      else if (estado === 'CLOSED') alEstado?.('sin-canal', 'canal cerrado')
    })

  return () => { vivo = false; void db.removeChannel(canal) }
}

/**
 * UNA IMAGEN PEGADA VIAJA COMO ARCHIVO, NO DENTRO DEL DOCUMENTO (5 oct 2026).
 *
 * Pegar leía el archivo a data URL y la metía en `src`. Cuatro capturas de pantalla de 5 000 px
 * dejaron el Customer Journey en 13 MB: cada guardado (también cada paneo) subía 13 MB, cada choque
 * con otro escritor bajaba otros 13, y la ventana del choque crecía hasta que el segundo intento
 * también chocaba — «error al guardar». Ahora la imagen se sube a Storage y el documento lleva su URL.
 *
 * Si la subida falla (sin red, sin sesión), se devuelve la data URL: perder lo que Daniel pegó es peor
 * que un documento pesado, y el error queda en consola para verse.
 */
export async function subirImagen(file: File, dataUrl: string): Promise<string> {
  try {
    const cuerpo = new FormData()
    cuerpo.append('file', file)
    const r = await fetch('/api/storage/upload', { method: 'POST', body: cuerpo })
    const j = await r.json().catch(() => ({})) as { url?: string; error?: string }
    if (r.ok && typeof j.url === 'string') return j.url
    console.warn('[lienzo] la imagen no se pudo subir; queda dentro del documento', j.error ?? r.status)
  } catch (e) {
    console.warn('[lienzo] la imagen no se pudo subir; queda dentro del documento', e)
  }
  return dataUrl
}
