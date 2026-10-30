/**
 * Canvas v4 — guardado automatico.
 *
 * Este archivo existe para no repetir los cuatro bugs mas caros del v3
 * (HECHOS-DE-PLATAFORMA §D). Los cuatro son el MISMO patron apareciendo en
 * lugares distintos: un actuador que reporta exito sin sensar el resultado.
 *
 *   D1  guardar desde el cliente bajo RLS sin sesion matchea 0 filas SIN ERROR.
 *       El cliente marcaba "Guardado", limpiaba el estado sucio y actualizaba su
 *       cache — mientras el servidor nunca recibio nada. El escritorio paso DOS
 *       DIAS sin persistir una pagina antes de que alguien lo notara.
 *   D2  una respuesta de lectura puede llegar DESPUES de un guardado mas
 *       reciente y pisarlo; el autosave la re-persiste como si fuera intencion
 *       del usuario. Forense: un save de las 9:44:59 con 382 elementos, perdido.
 *   D3  pegar durante la carga en frio compite con el fetch inicial. Un
 *       reemplazo incondicional borra el pegado en milisegundos.
 *   D4  cambiar de pagina rapido compite con el guardado asincrono.
 *
 * Las defensas de aqui son ESTRUCTURALES, no disciplina:
 *   · un solo camino de escritura, que EXIGE acuse del servidor
 *   · sucio POR PAGINA CON SECUENCIA (un booleano compartido pierde las
 *     ediciones hechas durante un guardado en vuelo)
 *   · los guardados de una pagina se SERIALIZAN
 *   · toda lectura mas vieja que el ultimo guardado se DESCARTA
 */

import type { CanvasElement, Camera } from '../model/element'

export interface SaveResult {
  ok: boolean
  /** Version que el SERVIDOR confirma. Es el acuse: sin esto no hubo guardado. */
  version?: number
  error?: string
  /** Cuanto esperar antes de reintentar este fallo (un choque espera la vuelta del sondeo, no 2 s). */
  reintentaEn?: number
  /**
   * Un fallo que se cura solo (chocar con otro escritor: el sondeo trae, fusiona y reintenta). No se pinta como
   * error mientras no se repita: la barra decia "error al guardar" en rojo por un choque que se resolvia en 4 s.
   */
  transitorio?: boolean
  /**
   * Lo pendiente ya no es de nadie que este abierto (se cambio de pagina o se borro la que tenia): no se escribe
   * ni se reintenta. Reintentarlo era peor que fallar: a los 2 s la pagina nueva ya habia cargado, el cinturon
   * pasaba y lo de la pagina VIEJA se escribia en la NUEVA.
   */
  descartar?: boolean
}

export type SaveFn = (payload: {
  pageId: string
  elements: CanvasElement[]
  camera: Camera
  baseVersion: number
}) => Promise<SaveResult>

export interface AutosaveOptions {
  debounceMs?: number
  retryMs?: number
  onStatus?: (s: AutosaveStatus) => void
}

export type AutosaveStatus =
  | { kind: 'limpio'; version: number }
  | { kind: 'sucio'; pendientes: number }
  | { kind: 'guardando' }
  | { kind: 'error'; mensaje: string; reintentaEn: number }
  /** Choco con otro escritor y se reintenta solo. Neutro: no es un fallo todavia. */
  | { kind: 'sincronizando'; mensaje: string }
  /**
   * No se guarda A PROPOSITO. No es un fallo.
   *
   * Una pagina del canvas anterior se abre convertida en memoria y no se
   * escribe hasta que Daniel lo pida. Reportarlo como 'error' era mentir en la
   * direccion que asusta: la barra decia "error al guardar" cuando el sistema
   * estaba haciendo exactamente lo correcto.
   */
  | { kind: 'bloqueado'; motivo: string }

/** Choques seguidos tolerados antes de admitir que es un error de verdad. */
const TRANSITORIOS_TOLERADOS = 3

export class Autosave {
  private seq = 0
  /** Secuencia del ultimo cambio ya confirmado por el servidor. */
  private savedSeq = 0
  private version = 0
  private inFlight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { elements: CanvasElement[]; camera: Camera; pageId?: string } | null = null
  private lastError: string | null = null
  private transitorios = 0

  constructor(
    private pageId: string,
    private save: SaveFn,
    private options: AutosaveOptions = {},
  ) {}

  /**
   * Marca un cambio. La SECUENCIA es la clave: un booleano `dirty` compartido
   * se limpia cuando termina un guardado que empezo ANTES de la ultima edicion,
   * y esa edicion se pierde en silencio.
   */
  mark(elements: CanvasElement[], camera: Camera, pageId?: string): void {
    this.seq++
    // `pageId` = de QUE pagina son estos elementos, sellado al marcar. El que guarda decide con ese sello, no con
    // la pagina que este abierta cuando el rebote dispare.
    this.pending = { elements, camera, pageId }
    this.emit()
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.options.debounceMs ?? 900)
  }

  /**
   * Cambia lo pendiente SIN adelantar el reloj (3 oct 2026). Tras un choque
   * doble con otro escritor, lo pendiente debe ser la fusion —si no, el
   * reintento escribiria la foto vieja y borraria lo del otro—, pero el
   * reintento espera la vuelta del sondeo, no el rebote de 700 ms.
   */
  reemplazar(elements: CanvasElement[], camera: Camera, pageId?: string): void {
    this.seq++
    this.pending = { elements, camera, pageId }
    if (!this.timer && !this.inFlight) {
      this.timer = setTimeout(() => void this.flush(), this.options.debounceMs ?? 900)
    }
  }

  /** Fuerza el guardado ya. Se usa al salir de la pagina. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    // Los guardados de una pagina se SERIALIZAN: dos en paralelo se pisan y el
    // que llega ultimo no es necesariamente el mas nuevo (D4).
    if (this.inFlight) { await this.inFlight; if (this.isClean()) return }
    if (!this.pending || this.isClean()) return

    const snapshotSeq = this.seq
    const payload = this.pending
    this.options.onStatus?.({ kind: 'guardando' })

    this.inFlight = (async () => {
      try {
        const res = await this.save({
          pageId: payload.pageId ?? this.pageId, elements: payload.elements,
          camera: payload.camera, baseVersion: this.version,
        })
        // EL ACUSE ES OBLIGATORIO. Sin `ok` y sin version del servidor, NO se
        // marca limpio. Ese es exactamente el bug de los dos dias: el cliente
        // se declaraba guardado por no ver un error.
        if (res.descartar) {
          // Nada que reintentar: lo pendiente era de una pagina que ya no esta. Si despues se marco algo nuevo
          // (de la pagina actual), eso sigue su curso.
          this.savedSeq = snapshotSeq
          this.lastError = null
          this.transitorios = 0
          this.emit()
          if (!this.isClean()) this.timer = setTimeout(() => void this.flush(), 0)
          return
        }
        if (!res.ok || typeof res.version !== 'number') {
          const mensaje = res.error ?? 'el servidor no confirmo el guardado'
          const espera = res.reintentaEn ?? this.options.retryMs ?? 2000
          if (res.transitorio && ++this.transitorios < TRANSITORIOS_TOLERADOS) {
            this.options.onStatus?.({ kind: 'sincronizando', mensaje })
          } else {
            this.lastError = mensaje
            this.options.onStatus?.({ kind: 'error', mensaje, reintentaEn: espera })
          }
          this.timer = setTimeout(() => void this.flush(), espera)
          return
        }
        this.version = res.version
        this.lastError = null
        this.transitorios = 0
        // Solo se limpia HASTA la secuencia que se guardo. Lo editado mientras
        // el guardado viajaba sigue sucio, como debe ser.
        this.savedSeq = snapshotSeq
        this.emit()
        if (!this.isClean()) this.timer = setTimeout(() => void this.flush(), 0)
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e)
        this.options.onStatus?.({ kind: 'error', mensaje: this.lastError, reintentaEn: this.options.retryMs ?? 2000 })
        this.timer = setTimeout(() => void this.flush(), this.options.retryMs ?? 2000)
      } finally {
        this.inFlight = null
      }
    })()
    await this.inFlight
  }

  /**
   * Detiene los reintentos y suelta el temporizador.
   *
   * No es opcional: sin esto, un guardado que falla se reprograma para siempre.
   * Un componente que se desmonta con un error pendiente deja un lazo vivo que
   * sigue golpeando el servidor y mantiene el proceso despierto — y en Node
   * ademas impide que el programa termine, que fue como se descubrio.
   */
  dispose(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.pending = null
  }

  isClean(): boolean { return this.savedSeq === this.seq }
  /** Hay un guardado viajando: lo que diga el servidor ahora puede ser mi propio eco. */
  guardando(): boolean { return this.inFlight !== null }
  currentVersion(): number { return this.version }
  setVersion(v: number): void { this.version = v; this.savedSeq = this.seq }

  /**
   * ¿Esta lectura sigue siendo valida, o es mas vieja que lo ya guardado?
   *
   * Es la defensa de D2/D3: una respuesta que salio antes del ultimo guardado
   * NO se aplica. Aplicarla pisa trabajo real, y el autosave lo re-persiste
   * como si el usuario lo hubiera querido.
   */
  acceptsRead(readVersion: number): boolean {
    return readVersion >= this.version
  }

  private emit(): void {
    if (this.lastError) return
    this.options.onStatus?.(this.isClean()
      ? { kind: 'limpio', version: this.version }
      : { kind: 'sucio', pendientes: this.seq - this.savedSeq })
  }
}

/**
 * Un solo merge para TODOS los caminos de entrada (lectura inicial, refetch,
 * tiempo real). Tratar "recien leido" distinto de "llego por realtime"
 * (reemplazar vs mergear) es exactamente lo que causo D2 y D3.
 *
 * Por elemento gana el `updatedAt` mas nuevo; lo local que el remoto no conoce
 * SE CONSERVA — durante una carga en frio, cualquier elemento presente es por
 * definicion una edicion viva del usuario, no basura que limpiar.
 */
export function mergeElements(local: CanvasElement[], remote: CanvasElement[]): CanvasElement[] {
  const localById = new Map(local.map(e => [e.id, e]))
  const remoteIds = new Set(remote.map(e => e.id))
  const merged = remote.map(r => {
    const l = localById.get(r.id)
    if (!l) return r
    return (r.updatedAt ?? 0) >= (l.updatedAt ?? 0) ? r : l
  })
  for (const l of local) if (!remoteIds.has(l.id)) merged.push(l)
  return merged
}
