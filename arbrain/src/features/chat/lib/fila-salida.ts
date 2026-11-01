/**
 * Cuándo sale la fila (1 nov 2026, 07:45: «terminaste pero no salió este mensaje en automático»).
 *
 * Antes la fila solo salía en el BORDE «Levy trabajando → libre» visto con la conversación abierta. El 1 nov el
 * turno terminó a las 07:43:28 mientras el dueño estaba en otra conversación (había dejado en la fila un
 * mensaje con 2 fotos, que no se pueden inyectar al turno en curso); al volver a las 07:44:41 no hubo borde, la
 * leyenda decía «saliendo…» porque solo miraba `loading`, y nada la mandó hasta que él escribió otro mensaje.
 *
 * Ahora la salida se decide por NIVEL y la fila nunca queda sin dueño:
 *  - Fin visto aquí (el borde de siempre): sale a los 250 ms, o pausa si TÚ detuviste o el turno falló.
 *  - Fila esperando sin turno a la vista (volviste de otra conversación, las fotos terminaron de subir tarde, se
 *    perdió el reenganche): si el fin ya se vio aquí sale igual; si no, se le pregunta al servidor si hay un turno
 *    vivo en esta conversación. Vivo → espera a que el chat vivo se reenganche (y repregunta); libre → sale.
 *  - Si no puede salir (el chat se ocupó, el borrador no carga) reintenta con espera creciente y lo DICE en la
 *    leyenda; al tope queda en pausa, a la vista, y avisa. «Saliendo…» solo existe mientras de verdad sale.
 * Lo que no cambia: una fila en pausa (recargar, abrir la app, detener) nunca sale sola; «Enviar ya» sí.
 */

/** Lo que el panel ve en cada render de la conversación abierta. */
export interface VistaFila {
  conversacion: string | null
  /** Hay pendientes en la fila de esta conversación. */
  hay: boolean
  pausada: boolean
  /** `loading || despachando`: el panel sigue un turno de esta conversación. */
  turnoEnCurso: boolean
  /** Refs del envío (stream vivo, despacho, fotos subiendo): pueden adelantarse al render. */
  ocupado: boolean
  /** Borrador del composer cargado y conversación pintada. */
  listo: boolean
  /** El último turno a la vista falló o se detuvo. */
  terminoMal: boolean
}
/** `forzar`: «Enviar» a mano, sale aunque la fila esté en pausa. */
export type ResultadoSoltar = 'salio' | 'ocupado' | 'vacia' | 'pausada'
export type EstadoSalida = 'quieta' | 'esperando-turno' | 'revisando' | 'saliendo' | 'reintentando' | 'atorada'
export interface Reloj { ahora(): number; programar(fn: () => void, ms: number): unknown; cancelar(h: unknown): void }
export interface DepsSalida {
  /** Toma la fila y la manda como un mensaje. Decide con la verdad de los refs, no con el render. */
  soltar: (o: { forzar: boolean }) => ResultadoSoltar
  pausar: () => void
  /** ¿El servidor tiene un turno en curso en esta conversación? `null` = no se pudo saber. */
  turnoVivo: (conversacion: string) => Promise<boolean | null>
  reloj: Reloj
  alCambiar?: (estado: EstadoSalida, intento: number) => void
  /** Llegó al tope de reintentos: la fila quedó en pausa y hay que decírselo al dueño. */
  alAtorarse?: () => void
}

export const SOLTAR_MS = 250
/** Tras «Enviar ya» el servidor confirma la detención antes de recibir la fila. */
export const SOLTAR_YA_MS = 900
/** Al volver a una conversación se deja llegar el reenganche antes de preguntarle al servidor. */
export const ASENTAR_MS = 1_200
/** El servidor dice que el turno sigue: se vuelve a preguntar por si el reenganche no llega. */
export const REVISAR_VIVO_MS = 3_000
export const TOPE_REINTENTOS = 6
/** Sin respuesta del servidor dos veces seguidas: sale igual (el servidor ordena los turnos de la conversación). */
export const TOPE_DUDAS = 2

export function esperaReintento(intento: number): number {
  return Math.min(8_000, 500 * 2 ** Math.max(0, intento - 1))
}

export class SalidaDeFila {
  estado: EstadoSalida = 'quieta'
  intento = 0
  private vista: VistaFila | null = null
  private finVisto = false
  private manual = false
  private ya = false
  private dudas = 0
  /** La salida programada viene de «Enviar ya»: ni la detención ni el fallo la pausan. */
  private forzando = false
  private timer: unknown = null
  /** Hay una pregunta al servidor en vuelo: los renders de mientras no abren otra. */
  private enVuelo = false
  /** Sube con cada cambio de conversación o de turno: una respuesta del servidor vieja no decide nada. */
  private gen = 0

  constructor(private deps: DepsSalida) {}

  /** TÚ detuviste a Levy: al terminar, la fila queda en pausa. */
  detenidoAMano(): void { this.manual = true }
  /** «Enviar ya»: se detiene el turno y la fila sale aunque haya sido una detención. */
  enviarYa(): void { this.ya = true; this.manual = true }
  /** Mandarla ya (botón «Enviar», o lo nuevo que se formó detrás con Levy libre). */
  soltarAhora(o: { forzar?: boolean } = {}): void {
    this.cancelar(); this.intento = 0; this.dudas = 0
    this.intentar(!!o.forzar)
  }
  detener(): void { this.cancelar(); this.gen++ }

  observar(v: VistaFila): void {
    const antes = this.vista
    this.vista = v
    if (!antes || antes.conversacion !== v.conversacion) {
      // Otra conversación: lo pendiente de la anterior no la sigue. Su fila se queda guardada y se evalúa al volver.
      this.detener(); this.finVisto = false; this.manual = false; this.ya = false; this.intento = 0; this.dudas = 0
      this.poner('quieta')
      return this.evaluar(v)
    }
    if (v.turnoEnCurso) {
      if (!antes.turnoEnCurso) { this.manual = false; this.finVisto = false }
      this.detener(); this.intento = 0; this.dudas = 0
      return this.poner(v.hay ? 'esperando-turno' : 'quieta')
    }
    if (antes.turnoEnCurso) {
      // El borde: el turno terminó a la vista.
      this.finVisto = true
      if (!v.hay) { this.ya = false; return this.poner('quieta') }
      if (!this.ya && (this.manual || v.terminoMal || v.pausada)) { this.detener(); this.deps.pausar(); return this.poner('quieta') }
      const ya = this.ya
      this.ya = false
      this.programar(() => this.intentar(ya), ya ? SOLTAR_YA_MS : SOLTAR_MS, 'saliendo')
      this.forzando = ya
      return
    }
    // El fallo puede pintarse un render después del fin: si aún no salió, no sale; queda en pausa.
    if (v.terminoMal && !antes.terminoMal && this.timer != null && this.estado === 'saliendo' && !this.forzando) {
      this.detener(); this.deps.pausar(); return this.poner('quieta')
    }
    this.evaluar(v)
  }

  /** Por nivel: una fila que espera salir y nadie trabajando en esta conversación. */
  private evaluar(v: VistaFila): void {
    if (!v.hay) { this.detener(); return this.poner('quieta') }
    // En pausa no sale; si la pausa vino del tope de reintentos, la leyenda lo sigue diciendo.
    if (v.pausada) { this.detener(); return this.estado === 'atorada' ? undefined : this.poner('quieta') }
    if (v.turnoEnCurso) return this.poner('esperando-turno')
    if (this.timer != null || this.enVuelo) return
    // Terminó mal mientras estabas en otra conversación: igual que verlo aquí, queda en pausa.
    if (!this.finVisto && v.terminoMal) { this.deps.pausar(); return this.poner('quieta') }
    if (this.finVisto) return this.programar(() => this.intentar(false), SOLTAR_MS, 'saliendo')
    this.programar(() => { void this.revisar() }, ASENTAR_MS, 'revisando')
  }

  private async revisar(): Promise<void> {
    const v = this.vista
    if (!v || !v.hay || v.pausada || v.turnoEnCurso) return v ? this.evaluar(v) : undefined
    const gen = this.gen
    let vivo: boolean | null
    this.enVuelo = true
    // Sin id (conversación por crear) no hay a quién preguntarle: cuenta como «no se sabe».
    try { vivo = v.conversacion ? await this.deps.turnoVivo(v.conversacion) : null } catch { vivo = null } finally { this.enVuelo = false }
    // La respuesta es de otra conversación o de otro turno: no decide nada, pero lo de ahora se vuelve a evaluar.
    if (gen !== this.gen) return this.vista ? this.evaluar(this.vista) : undefined
    if (this.timer != null) return
    if (vivo === true) {
      this.dudas = 0
      return this.programar(() => { void this.revisar() }, REVISAR_VIVO_MS, 'esperando-turno')
    }
    if (vivo === null && ++this.dudas < TOPE_DUDAS) return this.programar(() => { void this.revisar() }, esperaReintento(this.dudas), 'revisando')
    this.dudas = 0
    this.intentar(false)
  }

  private intentar(forzar: boolean): void {
    this.timer = null
    const r = this.deps.soltar({ forzar })
    if (r === 'salio' || r === 'vacia') { this.intento = 0; return this.poner('quieta') }
    if (r === 'pausada') return this.poner('quieta')
    if (++this.intento > TOPE_REINTENTOS) {
      this.intento = 0
      this.deps.pausar()
      this.poner('atorada')
      this.deps.alAtorarse?.()
      return
    }
    // Si el chat se ocupó con otro turno, `observar` cancela esto y la fila espera a que termine.
    this.programar(() => this.intentar(forzar), esperaReintento(this.intento), 'reintentando')
  }

  private programar(fn: () => void, ms: number, estado: EstadoSalida): void {
    this.cancelar()
    this.timer = this.deps.reloj.programar(() => { this.timer = null; fn() }, ms)
    this.poner(estado)
  }
  private cancelar(): void { if (this.timer != null) this.deps.reloj.cancelar(this.timer); this.timer = null; this.forzando = false }
  private poner(estado: EstadoSalida): void {
    if (estado === this.estado && estado !== 'reintentando') return
    this.estado = estado
    this.deps.alCambiar?.(estado, this.intento)
  }
}

/** El journal del servidor (`/api/chat/active`) dice si esta conversación tiene un turno en curso. `null` si el
 *  daemon no responde o es de una versión sin journal: no se adivina. */
export async function turnoVivoEnServidor(conversacion: string): Promise<boolean | null> {
  try {
    const res = await fetch('/api/chat/active', { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    const json = await res.json() as { available?: boolean; turns?: Array<{ conversationId?: string }> }
    if (!json.available || !Array.isArray(json.turns)) return null
    return json.turns.some(t => t.conversationId === conversacion)
  } catch { return null }
}
