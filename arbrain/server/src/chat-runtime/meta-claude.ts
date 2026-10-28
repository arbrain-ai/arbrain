import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { STORE_DIR } from '../config.js'

/**
 * La meta (`/goal`) de Claude Code vista desde Arbrain (27 oct 2026, Goal UX).
 *
 * Qué pasa en el CLI: `/goal <condición>` instala un Stop hook. Cada vez que Levy termina de hablar, un evaluador
 * revisa la condición; si no se cumple, el CLI inyecta un mensaje sintético «Stop hook feedback:\n[condición]: motivo»
 * y Levy vuelve a hablar DENTRO del mismo turno. El SDK cierra el turno con un solo `result` cuyo texto es la ÚLTIMA
 * vuelta. Con el perro apagado (conversación 3cc451dd, 27 oct 18:09) eso fueron 6 vueltas de «el perro sigue apagado»
 * y la respuesta larga que Daniel pidió quedó enterrada debajo.
 *
 * Límite del CLI (SDK 0.3.295, verificado con una sesión real): no hay `/goal pause` ni control para frenar las
 * vueltas; su propio tope llega tarde (~10 revisiones). `interrupt()` sí corta la vuelta en curso limpio
 * (`aborted_streaming`, sin error) y la meta sigue viva para el siguiente mensaje de Daniel. Por eso el freno vive
 * aquí, en el agent-server: se cuentan las vueltas y, al repetirse el mismo veredicto sin acción nueva, se
 * interrumpe y la meta queda «esperando a Daniel».
 *
 * Este módulo es puro salvo el estado por conversación (un JSON pequeño en el store).
 */

export type EstadoMeta = 'en_curso' | 'esperando' | 'pausada' | 'cumplida' | 'quitada'

export interface VueltaMeta {
  /** Por qué el evaluador dijo «no se cumple» antes de esta vuelta. */
  motivo: string
  /** Lo que Levy escribió en esta vuelta. */
  texto: string
  /** Herramientas que usó en esta vuelta (0 = no hizo nada nuevo). */
  herramientas: number
}

export interface VistaMeta {
  condicion: string
  /** Revisiones del evaluador en este turno. */
  revisiones: number
  estado: EstadoMeta
  vueltas: VueltaMeta[]
  /** Por qué se frenó: repetición del mismo veredicto sin acción nueva, o pausa de Daniel. */
  frenada?: 'repeticion' | 'pausa'
}

/** Cuántas revisiones seguidas sin acción nueva frenan la meta. */
export const FRENO_REVISIONES = 3

/** El mensaje sintético del CLI entre vueltas. Condición entre corchetes y el motivo del evaluador después. */
const FEEDBACK = /^Stop hook feedback:\s*\n?\s*\[([\s\S]*?)\]:\s*([\s\S]*)$/

/** Si un mensaje `user` del SDK es una revisión de la meta, su condición y motivo. */
export function leerRevision(e: Record<string, unknown>): { condicion: string; motivo: string } | null {
  if (e['type'] !== 'user' || e['parent_tool_use_id']) return null
  const content = (e['message'] as { content?: unknown } | undefined)?.content
  const texto = typeof content === 'string' ? content
    : Array.isArray(content) ? content.map(b => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : '')).join('')
      : ''
  if (!texto.startsWith('Stop hook feedback:')) return null
  const m = FEEDBACK.exec(texto.trim())
  // El CLI recorta la condición larga con «…» dentro de los corchetes; si el formato cambia, el texto entero es el motivo.
  return m ? { condicion: m[1].trim(), motivo: m[2].trim() } : { condicion: '', motivo: texto.replace(/^Stop hook feedback:\s*/, '').trim() }
}

/**
 * Levy dice que espera a Daniel (o que no le queda nada por hacer). Español e inglés: el evaluador y Levy mezclan.
 * Es la otra mitad del freno: una vuelta con herramientas que solo confirma «sigue apagado» tampoco es avance.
 */
export const ESPERA_HUMANA = /\b(cuando (lo )?(prendas|enciendas|me digas|vuelvas)|retomo cuando|sigo esperando|en espera|espero (a que|tu|que)|hasta que (hagas|prendas|enciendas|me digas)|no (lo )?puedo (prender|encender|avanzar|hacer)|no (hay|queda) (forma|nada que)|\/goal clear|waiting for (you|the user|the human)|only the (human|user) can)/i

/** ¿La vuelta no aportó acción nueva? Sin herramientas, o con texto que solo espera a Daniel. */
export const vueltaVacia = (texto: string, herramientas: number) => herramientas === 0 || ESPERA_HUMANA.test(texto)

/**
 * Sigue la meta durante UN turno de Claude: separa la respuesta principal (lo que Levy escribió antes de la primera
 * revisión) de las vueltas, y decide cuándo frenar. `pausada` = Daniel la pausó: se frena en la primera revisión.
 */
export class SeguidorMeta {
  private principal = ''
  private herramientasPrincipal = 0
  private readonly vueltas: VueltaMeta[] = []
  private condicion = ''
  private revisiones = 0
  private frenada: VistaMeta['frenada']
  private cerrada: EstadoMeta | null = null

  /** `pausada` se consulta en cada revisión: el chip puede pausar con el turno en curso. */
  constructor(private readonly pausada: () => boolean = () => false, condicionConocida = '') { this.condicion = condicionConocida }

  /** ¿Hubo al menos una revisión en este turno? Sin revisiones el turno es normal y nada cambia. */
  get activa(): boolean { return this.revisiones > 0 }
  get frenadaPor(): VistaMeta['frenada'] { return this.frenada }

  texto(delta: string): void {
    const v = this.vueltas.at(-1)
    if (v) v.texto += delta
    else this.principal += delta
  }

  herramienta(): void {
    const v = this.vueltas.at(-1)
    if (v) v.herramientas++
    else this.herramientasPrincipal++
  }

  /** Una revisión «no se cumple». Devuelve true si hay que frenar (interrumpir la vuelta que el CLI acaba de abrir). */
  revision(r: { condicion: string; motivo: string }): boolean {
    if (r.condicion) this.condicion = r.condicion
    this.revisiones++
    if (this.frenada) return true
    if (this.pausada()) { this.frenada = 'pausa'; return true }
    // Lo evaluado en esta revisión: la vuelta anterior (o la respuesta principal en la primera).
    this.vueltas.push({ motivo: r.motivo, texto: '', herramientas: 0 })
    const evaluadas = [{ texto: this.principal, herramientas: this.herramientasPrincipal }, ...this.vueltas.slice(0, -1)]
    const ultimas = evaluadas.slice(-FRENO_REVISIONES)
    if (ultimas.length >= FRENO_REVISIONES && ultimas.every(v => vueltaVacia(v.texto, v.herramientas))) {
      this.frenada = 'repeticion'
      return true
    }
    return false
  }

  /** La meta se cumplió (o el CLI la limpió) dentro del turno. */
  cumplida(): void { this.cerrada = 'cumplida' }

  /** Estado al cerrar el turno. */
  estadoFinal(): EstadoMeta {
    if (this.cerrada) return this.cerrada
    if (this.frenada === 'pausa') return 'pausada'
    // Terminó sin cumplirse: frenada por Arbrain o por el tope del CLI. En ambos casos espera a Daniel.
    return 'esperando'
  }

  /** `final`: al cerrar el turno la vuelta que el freno cortó sin texto no se enseña (en vivo sí: recibe el texto). */
  vista(estado: EstadoMeta = 'en_curso', final = false): VistaMeta {
    const vueltas = this.vueltas.filter((v, i) => !final || v.texto.trim() || v.herramientas || i < this.vueltas.length - 1).map(v => ({ ...v, texto: final ? v.texto.trim() : v.texto }))
    return { condicion: this.condicion, revisiones: this.revisiones, estado, vueltas, ...(this.frenada ? { frenada: this.frenada } : {}) }
  }

  /**
   * El texto que queda como respuesta del turno: la respuesta principal. Si la meta se cumplió en una vuelta, esa
   * conclusión se añade debajo. Si no hubo respuesta principal (Levy solo usó herramientas antes de la primera
   * revisión), la vuelta más larga hace de respuesta para que el turno nunca quede vacío.
   */
  respuesta(): string {
    const principal = this.principal.trim()
    const ultima = this.vueltas.filter(v => v.texto.trim()).at(-1)?.texto.trim() ?? ''
    if (!principal) return [...this.vueltas].map(v => v.texto.trim()).sort((a, b) => b.length - a.length)[0] ?? ''
    return this.cerrada === 'cumplida' && ultima ? `${principal}\n\n${ultima}` : principal
  }
}

// ── Estado por conversación (pausa de Daniel y última condición conocida) ──────────────────────────────────────────

export interface EstadoConversacion { condicion: string; estado: EstadoMeta; actualizado: number }

export class EstadoMetas {
  private datos: Record<string, EstadoConversacion> | null = null
  constructor(private readonly archivo = join(STORE_DIR, 'metas-claude.json'), private readonly reloj = () => Date.now()) {}

  static clave(scope: { owner: string; account: string; conversationId: string }): string {
    return `${scope.owner}|${scope.account || 'default'}|${scope.conversationId}`
  }

  private leer(): Record<string, EstadoConversacion> {
    if (this.datos) return this.datos
    try { this.datos = existsSync(this.archivo) ? JSON.parse(readFileSync(this.archivo, 'utf8')) as Record<string, EstadoConversacion> : {} } catch { this.datos = {} }
    return this.datos!
  }
  private guardar(): void {
    try { mkdirSync(dirname(this.archivo), { recursive: true }); writeFileSync(this.archivo, JSON.stringify(this.datos ?? {}, null, 1)) } catch { /* el estado vive en memoria aunque el disco falle */ }
  }

  get(clave: string): EstadoConversacion | null { return this.leer()[clave] ?? null }
  pausada(clave: string): boolean { return this.get(clave)?.estado === 'pausada' }

  poner(clave: string, estado: EstadoMeta, condicion?: string): EstadoConversacion {
    const datos = this.leer()
    const previo = datos[clave]
    if (estado === 'quitada') delete datos[clave]
    else datos[clave] = { condicion: condicion || previo?.condicion || '', estado, actualizado: this.reloj() }
    this.guardar()
    return datos[clave] ?? { condicion: previo?.condicion ?? '', estado, actualizado: this.reloj() }
  }

  /** Daniel escribió: una meta frenada por repetición vuelve a correr; la pausa suya se respeta hasta «Reanudar». */
  alEscribirPersona(clave: string): void {
    if (this.get(clave)?.estado === 'esperando') this.poner(clave, 'en_curso')
  }
}

export const estadoMetas = new EstadoMetas()

/** `/goal pause|resume` en Claude: el CLI no los tiene; Arbrain los resuelve con el freno. `/goal clear` sigue al CLI. */
export function comandoMetaLocal(message: string): 'pausar' | 'reanudar' | null {
  const m = /^\/goal\s+(pause|pausa|pausar|resume|reanudar|continuar)\s*$/i.exec(message.trim())
  if (!m) return null
  return /^(pause|pausa|pausar)$/i.test(m[1]) ? 'pausar' : 'reanudar'
}

/** `/goal clear|quitar…` (va al CLI tal cual: es el comando nativo) o `/goal <condición>` (también nativo). */
export function comandoMetaNativo(message: string): { accion: 'quitar' } | { accion: 'fijar'; condicion: string } | null {
  const rest = /^\/goal(?:\s+([\s\S]*))?$/i.exec(message.trim())?.[1]?.trim()
  if (rest === undefined || !rest || /^(status|estado|help|ayuda|\?)$/i.test(rest)) return null
  if (/^(clear|cancel|cancelar|borrar|quitar)$/i.test(rest)) return { accion: 'quitar' }
  if (comandoMetaLocal(message)) return null
  return { accion: 'fijar', condicion: rest }
}

export function textoComandoLocal(accion: 'pausar' | 'reanudar', estado: EstadoConversacion | null): string {
  const cond = estado?.condicion ? ` «${estado.condicion.length > 140 ? `${estado.condicion.slice(0, 140)}…` : estado.condicion}»` : ''
  return accion === 'pausar'
    ? `**Meta en pausa**${cond}. No vuelvo a revisarla hasta que la reanudes; tus mensajes se contestan normal.`
    : `**Meta reanudada**${cond}. Sigo revisándola al terminar cada respuesta.`
}

