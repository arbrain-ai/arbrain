/**
 * LA POSICIÓN DEL LECTOR POR CONVERSACIÓN (2 oct 2026, pedido de Daniel: «me cambio de
 * conversación, regreso y el lector perdió el punto exacto»).
 *
 * Idea tomada de SFTerm (`speech-memory.ts`, `readpos.ts`), no su código:
 *   · SUSPENDER (cambiar de conversación, recargar, cerrar la ventana) = recordar el
 *     cursor {mensaje, párrafo, palabra} bajo la conversación.
 *   · PARAR (✕ de la barra, toggle-off, fin del mensaje) = gesto explícito o lectura
 *     terminada: se OLVIDA, la próxima empieza de cero.
 *   · No se escribe sobre lo que no se midió: la posición solo se aplica si el mensaje
 *     sigue siendo el mismo (huella del texto); si cambió, se vuelve al INICIO del mensaje.
 *
 * Diferencia con SFTerm: allá la memoria vive en RAM (una sesión de trabajo); aquí Daniel
 * pidió que sobreviva a Cmd+R y funcione en teléfono, así que se persiste en localStorage.
 *
 * PURA, sin DOM ni React: el almacenamiento se inyecta (testeable en node).
 */

export interface PosicionLector {
  /** id del mensaje que se leía (el del DOM, `data-tts-content`) */
  msgId: string
  /** párrafo (el «4» de «4/26» es idx + 1) */
  idx: number
  /** cuántos párrafos tenía el mensaje al guardar (el «26») */
  total: number
  /** offset de carácter dentro del párrafo: es el «segundo» de la voz del sistema,
   *  que no expone tiempo de audio pero sí la palabra exacta */
  offset: number
  /** huella del texto completo del mensaje al guardar */
  huella: string
  /** firma del párrafo `idx` al guardar (segundo seguro contra mensajes regenerados) */
  firmaBloque: string
  /** velocidad (índice no, valor real: 1, 1.25, 1.5…) */
  rate: number
  /** orden de guardado (mayor = más reciente) */
  seq: number
}

export interface PosicionStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export const CLAVE = 'arbrain:lector-posicion:v1'
/** Conversaciones recordadas: pasado el tope se desaloja la más vieja. */
export const TOPE = 40

/** Huella estable y barata (FNV-1a 32 bits) del texto normalizado. No es criptografía:
 *  solo distingue «mismo mensaje» de «mensaje editado o regenerado». */
export function huellaDeTexto(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${t.length}:${h.toString(16)}`
}

export class MemoriaLector {
  private mapa = new Map<string, PosicionLector>()
  private seq = 0

  private storage: PosicionStorage | null

  constructor(storage: PosicionStorage | null) {
    this.storage = storage
    this.cargar()
  }

  private cargar() {
    try {
      const raw = this.storage?.getItem(CLAVE)
      if (!raw) return
      const obj = JSON.parse(raw) as Record<string, PosicionLector>
      for (const [sesion, p] of Object.entries(obj)) {
        if (!valida(p)) continue
        this.mapa.set(sesion, p)
        this.seq = Math.max(this.seq, p.seq)
      }
    } catch { /* ilegible = vacío; nunca rompe el chat */ }
  }

  private persistir() {
    try {
      const obj: Record<string, PosicionLector> = {}
      for (const [k, v] of this.mapa) obj[k] = v
      this.storage?.setItem(CLAVE, JSON.stringify(obj))
    } catch { /* cuota o modo privado */ }
  }

  guardar(sesion: string, p: Omit<PosicionLector, 'seq'>) {
    this.mapa.set(sesion, { ...p, seq: ++this.seq })
    if (this.mapa.size > TOPE) {
      let vieja: string | null = null
      let viejaSeq = Infinity
      for (const [k, v] of this.mapa) if (v.seq < viejaSeq) { vieja = k; viejaSeq = v.seq }
      if (vieja != null) this.mapa.delete(vieja)
    }
    this.persistir()
  }

  obtener(sesion: string): PosicionLector | undefined {
    return this.mapa.get(sesion)
  }

  olvidar(sesion: string) {
    if (this.mapa.delete(sesion)) this.persistir()
  }
}

function valida(p: unknown): p is PosicionLector {
  const o = p as PosicionLector
  return !!o && typeof o.msgId === 'string' && Number.isInteger(o.idx) && o.idx >= 0
    && Number.isInteger(o.total) && o.total > 0 && typeof o.offset === 'number' && o.offset >= 0
    && typeof o.huella === 'string' && typeof o.firmaBloque === 'string'
    && typeof o.rate === 'number' && typeof o.seq === 'number'
}

export interface Resolucion {
  idx: number
  offset: number
  /** `exacta`: mismo mensaje, mismo punto. `inicio`: el mensaje cambió, se vuelve a su inicio. */
  motivo: 'exacta' | 'inicio'
}

/**
 * ¿Dónde se reanuda? Solo en el punto guardado si el mensaje es el mismo: misma huella de
 * texto, el párrafo existe, su firma coincide y el offset cabe. Cualquier duda = inicio del
 * mensaje, nunca un fragmento inválido.
 */
export function resolverPosicion(
  guardada: PosicionLector,
  actual: { huella: string; firmas: string[]; longitudes: number[] },
): Resolucion {
  const inicio: Resolucion = { idx: 0, offset: 0, motivo: 'inicio' }
  if (guardada.huella !== actual.huella) return inicio
  if (guardada.idx >= actual.firmas.length) return inicio
  if (guardada.total !== actual.firmas.length) return inicio
  if (actual.firmas[guardada.idx] !== guardada.firmaBloque) return inicio
  if (guardada.offset > (actual.longitudes[guardada.idx] ?? 0)) return inicio
  return { idx: guardada.idx, offset: guardada.offset, motivo: 'exacta' }
}
