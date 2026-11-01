/**
 * Fotos en fila por el servidor (1 nov 2026, opción B del reporte docs/builds/fila-mensajes-2026-11-01, firmada a las
 * 08:46: «ok lo que tú consideres»).
 *
 * Un mensaje con fotos escrito mientras Levy trabaja ya no espera en la fila del DISPOSITIVO (que solo sale si una
 * pantalla ve terminar el turno). Viaja al servidor en el acto, como el texto (`inyectar: true`, mismo id): el motor
 * no toma fotos a media vuelta, así que el servidor lo guarda y lo manda como turno propio al cerrar el actual, antes
 * que los avisos de subagentes, aunque el dueño esté en otra conversación o con la app cerrada.
 *
 * El dispositivo se queda con un espejo editable en la caja de la fila: este controlador lo concilia con el servidor
 * repitiendo el MISMO envío (idempotente por id: nunca nace un segundo turno) y decide qué hacer con la respuesta.
 *  - Espera en el servidor → se queda en la caja con «en el servidor»; se vuelve a preguntar al terminar el turno.
 *  - Ya es su turno → sale de la caja (el chat vivo lo pinta).
 *  - El servidor no lo mandará (detuviste a Levy, se rechazó) → vuelve a ser del dispositivo, en pausa.
 *  - Sin red o servidor caído → reintenta con espera creciente y la caja lo dice. Repetir es seguro: mismo id.
 * Editar o quitar lo retiran primero en el servidor (`/api/chat/inyeccion`), y solo si aún no salió.
 */
import type { Reloj } from './fila-salida'
import type { DesenlaceEnvio } from './inyecciones'
import { mensajePorDefecto, separarAdjuntos } from './adjuntos'

export interface PendienteServidor { id: string; texto: string; imagenes?: string[] }
export type EstadoEnServidor = 'enviando' | 'en_servidor' | 'reintentando'
export interface EstadoItemServidor { estado: EstadoEnServidor; intento: number }
export type Veredicto = 'espera' | 'salio' | 'devolver' | 'reintentar'

/** Lo que viaja: el texto tal cual o, sin texto, el mismo de un envío normal. Determinista: cada reintento manda
 *  exactamente lo mismo y el servidor lo reconoce como el mismo mensaje. */
export function cuerpoDelPendiente(item: PendienteServidor): { message: string; imageUrl: string } {
  const imageUrl = (item.imagenes ?? []).join('\n')
  const { imagenes, documentos } = separarAdjuntos(imageUrl)
  return { message: item.texto.trim() || mensajePorDefecto(imagenes.length, documentos.length), imageUrl }
}

/** Qué significa la respuesta del servidor para el espejo de la caja. */
export function veredicto(d: DesenlaceEnvio): Veredicto {
  if (d.tipo === 'en_fila_servidor') return 'salio'
  if (d.tipo === 'inyectado') return d.estado === 'unread' ? 'devolver' : d.estado === 'sent' || d.estado === 'requeued' ? 'salio' : 'espera'
  // 409: el id ya existe en el servidor como turno (salió). Solo la lápida de un retiro vuelve al dispositivo.
  if (d.status === 409) return d.codigo === 'turn_cancelled' ? 'devolver' : 'salio'
  if (d.status === 400 || d.status === 403 || d.status === 404) return 'devolver'
  return 'reintentar'
}

/** Al ver terminar el turno aquí: el servidor suelta la fila justo después de cerrar. */
export const AL_TERMINAR_MS = 400
/** Sin turno a la vista (volviste de otra conversación, el turno corre sin reenganche): cada cuánto se pregunta. */
export const REVISAR_LIBRE_MS = 3_000
/** Con el turno a la vista el borde de fin dispara la pregunta; esto es solo la red de seguridad. */
export const REVISAR_TRABAJANDO_MS = 15_000
export const ESPERA_MAX_MS = 15_000
export function esperaReintento(intento: number): number { return Math.min(ESPERA_MAX_MS, 1_000 * 2 ** Math.max(0, intento - 1)) }

export interface VistaServidor {
  conversacion: string | null
  /** Los pendientes de la caja que viven en el servidor, en orden. */
  pendientes: PendienteServidor[]
  /** `loading || despachando`: el panel sigue un turno de esta conversación. */
  turnoEnCurso: boolean
}
export interface DepsFilaServidor {
  reloj: Reloj
  /** POST /api/chat/stream con `inyectar: true` y el id del pendiente: lo registra o pregunta por él. */
  enviar: (conversacion: string, item: PendienteServidor) => Promise<DesenlaceEnvio>
  /** Ya es su propio turno en el servidor: sale de la caja. */
  salio: (id: string) => void
  /** El servidor no lo va a mandar: vuelve a ser del dispositivo, en pausa, a la vista. */
  devolver: (id: string, motivo: 'detenido' | 'rechazado') => void
  alCambiar?: (estados: ReadonlyMap<string, EstadoItemServidor>) => void
}

interface Seguimiento extends EstadoItemServidor { timer: unknown; enVuelo: boolean }

export class FilaServidor {
  private conversacion: string | null = null
  private vista: VistaServidor = { conversacion: null, pendientes: [], turnoEnCurso: false }
  private seg = new Map<string, Seguimiento>()
  constructor(private deps: DepsFilaServidor) {}

  /** Cada render de la conversación abierta. */
  observar(v: VistaServidor): void {
    const terminoAqui = this.vista.turnoEnCurso && !v.turnoEnCurso && v.conversacion === this.conversacion
    if (v.conversacion !== this.conversacion) { this.detener(); this.conversacion = v.conversacion }
    this.vista = v
    const ids = new Set(v.pendientes.map(p => p.id))
    for (const id of [...this.seg.keys()]) if (!ids.has(id)) this.olvidar(id)
    for (const p of v.pendientes) {
      const s = this.seg.get(p.id)
      if (!s) this.programar(p.id, 0, 'enviando', 0) // nuevo, o la caja lo trae al abrir la conversación
      else if (terminoAqui && !s.enVuelo) this.programar(p.id, AL_TERMINAR_MS, s.estado, s.intento)
    }
  }

  /** Recién formado: se manda ya, sin esperar al render. */
  registrar(conversacion: string, item: PendienteServidor): void {
    if (conversacion !== this.conversacion) { this.detener(); this.conversacion = conversacion }
    if (!this.vista.pendientes.some(p => p.id === item.id)) this.vista = { ...this.vista, conversacion, pendientes: [...this.vista.pendientes, item] }
    this.programar(item.id, 0, 'enviando', 0)
  }

  /** Editar o quitar: deja de seguirlo (una respuesta en vuelo ya no decide nada). */
  olvidar(id: string): void {
    const s = this.seg.get(id)
    if (s) this.deps.reloj.cancelar(s.timer)
    if (this.seg.delete(id)) this.avisar()
  }

  detener(): void {
    for (const s of this.seg.values()) this.deps.reloj.cancelar(s.timer)
    if (this.seg.size) { this.seg.clear(); this.avisar() }
  }

  private programar(id: string, ms: number, estado: EstadoEnServidor, intento: number): void {
    const previo = this.seg.get(id)
    if (previo) this.deps.reloj.cancelar(previo.timer)
    const s: Seguimiento = { estado, intento, enVuelo: previo?.enVuelo ?? false, timer: null }
    s.timer = this.deps.reloj.programar(() => { void this.revisar(id) }, ms)
    this.seg.set(id, s)
    if (!previo || previo.estado !== estado || previo.intento !== intento) this.avisar()
  }

  private async revisar(id: string): Promise<void> {
    const s = this.seg.get(id), conversacion = this.conversacion
    const item = this.vista.pendientes.find(p => p.id === id)
    if (!s || !item || !conversacion || s.enVuelo) return
    s.enVuelo = true
    let d: DesenlaceEnvio
    try { d = await this.deps.enviar(conversacion, item) }
    catch (e) { d = { tipo: 'rechazado', motivo: e instanceof Error ? e.message : 'sin red' } }
    const ahora = this.seg.get(id)
    if (ahora) ahora.enVuelo = false
    // Cambiaste de conversación, o lo editaste o quitaste mientras preguntaba: esta respuesta ya no decide nada.
    if (!ahora || conversacion !== this.conversacion || !this.vista.pendientes.some(p => p.id === id)) return
    switch (veredicto(d)) {
      case 'espera': this.programar(id, this.vista.turnoEnCurso ? REVISAR_TRABAJANDO_MS : REVISAR_LIBRE_MS, 'en_servidor', 0); return
      case 'salio': this.olvidar(id); this.deps.salio(id); return
      case 'devolver': this.olvidar(id); this.deps.devolver(id, d.tipo === 'inyectado' ? 'detenido' : 'rechazado'); return
      case 'reintentar':
        // Ya estaba guardado en el servidor: una pregunta sin respuesta no lo saca de ahí; solo se repregunta.
        if (ahora.estado === 'en_servidor') this.programar(id, REVISAR_LIBRE_MS, 'en_servidor', 0)
        else this.programar(id, esperaReintento(ahora.intento + 1), 'reintentando', ahora.intento + 1)
    }
  }

  private avisar(): void {
    this.deps.alCambiar?.(new Map([...this.seg].map(([id, s]) => [id, { estado: s.estado, intento: s.intento }])))
  }
}
