/**
 * Mapa v16 · el PUENTE del host (14 nov 2026): el lienzo del lado de las islas.
 *
 * Un solo oyente de `message` para todas las islas de la página. Cada mensaje se atribuye a su isla por `event.source`
 * (la ventana de SU iframe): un mensaje de cualquier otra ventana se ignora, y el contenido se valida (`protocolo.ts`)
 * antes de tocar nada. Desde aquí:
 *
 *   · datos     un canal con caché por fuente: la primera isla que pide `pulso:venta` dispara la lectura, las demás la
 *               comparten; `refrescar()` relee lo suscrito y solo re-envía lo que cambió (y entonces la foto se rehace)
 *   · acciones  lista blanca (`destinos.ts`), solo de una isla DESPIERTA (lo dormido no se toca) y con freno anti-ráfaga
 *   · tema      a todas, al conectar y al cambiar
 *   · vida      pausa / despertar, con la latencia medida (despertar → primer cuadro de la isla)
 *   · foto      se pide cuando la isla avisa `listo` y su huella (archivo + tema + datos) no es la de su foto guardada
 *
 * Sin React ni DOM más allá de `postMessage`: las dependencias entran por el constructor (tests/canvas/islas-puente.test.ts).
 */
import { huellaDeDatos, leerMensaje, VERSION_PROTOCOLO, type EstadoDato, type FichaIsla, type MensajeHost, type MensajeIsla, type Modo } from './protocolo'
import { leerDestino, type DestinoIsla } from './destinos'
import { mismaLectura, type LecturaFuente } from './fuentes'

/** Lo único que el puente necesita de una ventana: mandarle un mensaje. */
export interface Ventana { postMessage(m: unknown, origen: string): void }

export interface DepsPuente {
  leerFuente: (fuente: string) => Promise<LecturaFuente>
  abrir: (d: DestinoIsla, isla: string) => void
  esPropia?: (u: URL) => boolean
  /** La rueda o el pellizco sobre una isla despierta: el host mueve su cámara. */
  rueda?: (isla: string, m: Extract<MensajeIsla, { tipo: 'rueda' }>) => void
  gesto?: (isla: string, m: Extract<MensajeIsla, { tipo: 'gesto' }>) => void
  /** ¿Hace falta foto nueva para esta huella? (la que hay guardada es otra o no hay). */
  quiereFoto: (isla: string, huella: string) => boolean
  /** ¿Se puede pedir una foto AHORA? (cámara en reposo: la foto cuesta hilo). */
  puedeFotografiar?: () => boolean
  alFoto: (isla: string, bitmap: ImageBitmap, huella: string, ms?: number) => void
  /** Telemetría local (latencias, rechazos): nunca a la campana. */
  medir?: (evento: string, datos: Record<string, unknown>) => void
  ahora?: () => number
}

interface Isla {
  id: string; ruta: string; hash: string; ficha: FichaIsla; win: Ventana
  conectada: boolean; despierta: boolean
  suscritas: Set<string>
  enviados: Map<string, { valor: unknown; estado: EstadoDato }>
  despertar?: { pedido: number; t0: number }
  foto?: { pedido: number; huella: string; t0: number }
  listo: boolean
  ultimaAccion: number
}

export const FRENO_ACCIONES_MS = 350

export class PuenteIslas {
  private islas = new Map<string, Isla>()
  private cache = new Map<string, LecturaFuente>()
  private enVuelo = new Map<string, Promise<LecturaFuente>>()
  private pedido = 0
  private modo: Modo = 'oscuro'
  private ahora: () => number

  constructor(private deps: DepsPuente) {
    this.ahora = deps.ahora ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  }

  get tema() { return this.modo }

  /** Una isla montada (su iframe ya tiene ventana). Devuelve la baja. Registrar de nuevo el mismo id reemplaza la ventana. */
  registrar(id: string, ruta: string, hash: string, ficha: FichaIsla, win: Ventana, despierta: boolean): () => void {
    const previa = this.islas.get(id)
    const isla: Isla = {
      id, ruta, hash, ficha, win, conectada: false, despierta, suscritas: new Set(), enviados: new Map(), listo: false, ultimaAccion: -Infinity,
      ...(previa && previa.win === win ? { conectada: previa.conectada, suscritas: previa.suscritas, enviados: previa.enviados } : {}),
    }
    this.islas.set(id, isla)
    return () => { if (this.islas.get(id) === isla) this.islas.delete(id) }
  }

  hay(id: string) { return this.islas.has(id) }
  ids() { return [...this.islas.keys()] }

  /** Lo que llega de `window.addEventListener('message')`. Devuelve true si era de una isla (ya atendido). */
  recibir(source: unknown, data: unknown): boolean {
    let isla: Isla | undefined
    for (const i of this.islas.values()) if (i.win === source) { isla = i; break }
    if (!isla) return false
    const m = leerMensaje(data)
    if (!m) return true   // de la isla, pero no del protocolo (el script del tema, el lector): no es asunto del puente
    this.atender(isla, m)
    return true
  }

  private mandar(isla: Isla, m: MensajeHost) { try { isla.win.postMessage(m, '*') } catch { /* el iframe se fue */ } }

  private atender(isla: Isla, m: MensajeIsla) {
    switch (m.tipo) {
      case 'hola':
        isla.conectada = true
        isla.listo = false
        isla.enviados.clear()
        this.mandar(isla, { tipo: 'bienvenida', v: VERSION_PROTOCOLO, id: isla.id, despierta: isla.despierta, modo: this.modo })
        if (isla.despierta) this.marcarDespertar(isla)
        return
      case 'pedir': {
        isla.suscritas.add(m.fuente)
        const ya = this.cache.get(m.fuente)
        if (ya) this.enviar(isla, m.fuente, ya)
        else this.mandar(isla, { tipo: 'datos', fuente: m.fuente, valor: null, fecha: null, estado: 'leyendo' })
        void this.leer(m.fuente)
        return
      }
      case 'soltar': isla.suscritas.delete(m.fuente); return
      case 'accion': {
        const t = this.ahora()
        if (!isla.despierta) { this.deps.medir?.('accion-dormida', { isla: isla.id, destino: m.destino }); return }
        if (t - isla.ultimaAccion < FRENO_ACCIONES_MS) return
        const d = leerDestino(m.destino, this.deps.esPropia)
        if (!d) { this.deps.medir?.('accion-rechazada', { isla: isla.id, destino: m.destino }); return }
        isla.ultimaAccion = t
        this.deps.abrir(d, isla.id)
        return
      }
      case 'listo':
        isla.listo = true
        this.quizaFoto(isla)
        return
      case 'foto': {
        const f = isla.foto
        if (!f || f.pedido !== m.pedido) return
        isla.foto = undefined
        if (m.bitmap) this.deps.alFoto(isla.id, m.bitmap, f.huella, m.ms)
        else this.deps.medir?.('foto-fallo', { isla: isla.id, error: m.error })
        return
      }
      case 'despierta': {
        const d = isla.despertar
        if (!d || d.pedido !== m.pedido) return
        isla.despertar = undefined
        this.deps.medir?.('despertar', { isla: isla.id, ms: this.ahora() - d.t0 })
        return
      }
      case 'rueda': if (isla.despierta) this.deps.rueda?.(isla.id, m); return
      case 'gesto': if (isla.despierta) this.deps.gesto?.(isla.id, m); return
    }
  }

  private enviar(isla: Isla, fuente: string, l: LecturaFuente) {
    const prev = isla.enviados.get(fuente)
    if (prev && prev.estado === l.estado && JSON.stringify(prev.valor) === JSON.stringify(l.valor)) return
    isla.enviados.set(fuente, { valor: l.valor, estado: l.estado })
    this.mandar(isla, { tipo: 'datos', fuente, valor: l.valor, fecha: l.fecha, estado: l.estado, ...(l.error ? { error: l.error } : {}) })
  }

  /** Lee una fuente (compartiendo la lectura en curso) y la reparte a quien la tenga suscrita si cambió. */
  private leer(fuente: string): Promise<LecturaFuente> {
    const ya = this.enVuelo.get(fuente)
    if (ya) return ya
    const p = this.deps.leerFuente(fuente).catch((e: unknown): LecturaFuente => ({ estado: 'error', valor: null, fecha: null, error: e instanceof Error ? e.message : String(e) }))
      .then(l => {
        this.enVuelo.delete(fuente)
        const antes = this.cache.get(fuente)
        // Una lectura que falla NO borra un dato bueno que ya se tenía: se queda el último bueno (la isla no parpadea a error).
        if (l.estado === 'error' && antes && antes.estado === 'ok') return antes
        this.cache.set(fuente, l)
        if (!mismaLectura(antes, l)) for (const i of this.islas.values()) if (i.conectada && i.suscritas.has(fuente)) this.enviar(i, fuente, l)
        return l
      })
    this.enVuelo.set(fuente, p)
    return p
  }

  /** Relee todo lo suscrito por islas montadas (el host lo llama con su reloj, p. ej. cada 60 s, y al volver a la ventana). */
  refrescar(): Promise<unknown> {
    const fuentes = new Set<string>()
    for (const i of this.islas.values()) for (const f of i.suscritas) fuentes.add(f)
    return Promise.all([...fuentes].map(f => this.leer(f)))
  }

  /** Las fuentes de una ficha leídas de antemano (aunque la isla no esté montada): sirven para saber si su foto es vieja. */
  async precargar(fuentes: readonly string[]): Promise<Map<string, LecturaFuente>> {
    const out = new Map<string, LecturaFuente>()
    await Promise.all(fuentes.map(async f => { out.set(f, this.cache.get(f) ?? await this.leer(f)) }))
    return out
  }

  /** La huella esperada de una isla con lo que hay en caché para sus fuentes (null si falta leer alguna). */
  huellaEsperada(hash: string, fuentes: readonly string[]): string | null {
    const datos = new Map<string, { valor: unknown; estado: EstadoDato }>()
    for (const f of fuentes) {
      const l = this.cache.get(f)
      if (!l || l.estado === 'leyendo') return null
      datos.set(f, { valor: l.valor, estado: l.estado })
    }
    return huellaDeDatos(hash, this.modo, datos)
  }

  ponerTema(modo: Modo) {
    if (modo === this.modo) return
    this.modo = modo
    for (const i of this.islas.values()) if (i.conectada) { i.listo = false; this.mandar(i, { tipo: 'tema', modo }) }
  }

  /** Despierta o duerme una isla montada. */
  vida(id: string, despierta: boolean) {
    const i = this.islas.get(id)
    if (!i || i.despierta === despierta) return
    i.despierta = despierta
    if (!i.conectada) return
    if (despierta) this.marcarDespertar(i)
    else { i.despertar = undefined; this.mandar(i, { tipo: 'pausa' }) }
  }

  private marcarDespertar(i: Isla) {
    const pedido = ++this.pedido
    i.despertar = { pedido, t0: this.ahora() }
    this.mandar(i, { tipo: 'despertar', pedido })
  }

  /** La huella de lo que la isla está pintando ahora (archivo + tema + datos enviados). */
  huella(id: string): string | null {
    const i = this.islas.get(id)
    return i ? huellaDeDatos(i.hash, this.modo, i.enviados) : null
  }

  /** Pide la foto si la isla ya pintó y su huella no tiene foto. El host lo vuelve a intentar al asentarse la cámara. */
  quizaFoto(isla: Isla | string) {
    const i = typeof isla === 'string' ? this.islas.get(isla) : isla
    if (!i || !i.conectada || !i.listo || i.foto) return
    if (this.deps.puedeFotografiar && !this.deps.puedeFotografiar()) return
    // Faltan fuentes de su ficha por llegar: aún no es su estado final.
    for (const f of i.suscritas) { const e = i.enviados.get(f); if (!e || e.estado === 'leyendo') return }
    const huella = huellaDeDatos(i.hash, this.modo, i.enviados)
    if (!this.deps.quiereFoto(i.id, huella)) return
    const pedido = ++this.pedido
    i.foto = { pedido, huella, t0: this.ahora() }
    this.mandar(i, { tipo: 'foto', pedido })
    // Si la isla nunca contesta, la puerta no se queda cerrada.
    setTimeout(() => { if (i.foto?.pedido === pedido) i.foto = undefined }, 8000)
  }

  /** Reintenta las fotos pendientes (al asentarse la cámara). */
  fotografiarPendientes() { for (const i of this.islas.values()) this.quizaFoto(i) }

  /** Las fuentes que la isla recibió (las que cuenta su huella). */
  fuentesDe(id: string): string[] { return [...(this.islas.get(id)?.enviados.keys() ?? [])].sort() }

  /** ¿Esta isla ya está lista (pintó sus datos)? */
  lista(id: string) { return !!this.islas.get(id)?.listo }
}
