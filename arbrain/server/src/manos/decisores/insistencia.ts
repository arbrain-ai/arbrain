/**
 * Regla de insistencia de las manos (noche del 2 oct, falla real: Levy se rindió en el 3.er guardado de X
 * cuando el pedido era el 6.º).
 *
 * Cuando un camino no avanza, se prueba el siguiente; no se pide ayuda ni se reporta «no pude» mientras queden
 * caminos y presupuesto. El criterio de parada es explícito y medible (ver `PARADA`).
 *
 * Es la misma regla en tres lugares: el texto `REGLA_INSISTENCIA` va en las instrucciones del MCP y en el
 * sistema del cerebro (los modelos la leen); `Insistencia` la aplica en código (guiones, recetas y pruebas);
 * `recorrerLista` es su forma para listas largas y virtuales (X, YouTube, WhatsApp).
 *
 * Jev puede ordenar los caminos que quedan (opciones cerradas). Privacidad: solo recibe nombres de caminos y
 * contadores (cuántos intentos, si hubo avance), nunca contenido de la pantalla ni el pedido.
 */
import { DUENO, DUENO_M } from '../../dueno.js'
import type { Decisor } from '../contrato.js'

/** Caminos en orden por defecto: del más barato y local al que salta la interfaz. */
export const CAMINOS = ['rueda', 'teclado', 'extension', 'buscador', 'url_directa'] as const
export type Camino = typeof CAMINOS[number]

export const DESCRIPCION_CAMINO: Record<Camino, string> = {
  rueda: 'rueda o scroll sobre el contenedor de la lista',
  teclado: 'teclas con la página enfocada (j/k, espacio, AvPág, flechas, Tab)',
  extension: 'la extensión Arbrain (web_actuar por índice, scroll por el depurador)',
  buscador: 'el buscador del propio sitio o app',
  url_directa: 'abrir la URL directa del destino (permalink, canal, búsqueda)',
}

/** Criterio de parada: el primero que se cumpla detiene la insistencia. */
export interface Parada { sinAvancePorCamino: number; intentosMax: number; presupuestoMs: number }
export const PARADA: Parada = {
  /** Intentos seguidos sin avance en un mismo camino antes de pasar al siguiente. */
  sinAvancePorCamino: 2,
  /** Intentos totales (todos los caminos). */
  intentosMax: 12,
  /** Presupuesto de tiempo de la insistencia (ms). */
  presupuestoMs: 90_000,
}

export const REGLA_INSISTENCIA = `Regla de insistencia: si un camino no avanza, prueba el siguiente sin pedir ayuda: rueda → teclado (j/k, espacio, AvPág) → extensión web_* → buscador del sitio → URL directa. «Avance» = aparece algo nuevo (más elementos de la lista, otra URL, el valor cambió); compruébalo leyendo, no lo supongas. Parada explícita: el objetivo verificado; o ${PARADA.sinAvancePorCamino} intentos sin avance en cada uno de los caminos; o ${PARADA.intentosMax} intentos; o ${PARADA.presupuestoMs / 1000} s; o el freno pide a ${DUENO} (eso nunca se insiste). Al parar sin lograrlo, reporta qué caminos probaste y qué leíste en cada uno. En listas largas o virtuales cuenta por identificador (URL, id) y exige que cada lectura se solape con la anterior: si no se solapa, te saltaste elementos, sube un poco y vuelve a leer.`

export interface IntentoCamino { camino: Camino; avance: boolean; ms: number; detalle?: string }

export type Veredicto =
  | { seguir: true; camino: Camino; motivo: string }
  | { seguir: false; motivo: string }

/**
 * Estado de la insistencia: registra intentos y decide el siguiente camino o la parada.
 * `disponibles` acota los caminos que existen en ese contexto (p. ej. sin extensión, sin buscador).
 */
export class Insistencia {
  readonly intentos: IntentoCamino[] = []
  private readonly t0: number
  private orden: Camino[]

  constructor(disponibles: readonly Camino[] = CAMINOS, private readonly reloj: () => number = () => Date.now(), private readonly parada: Parada = PARADA) {
    this.orden = CAMINOS.filter(c => disponibles.includes(c))
    this.t0 = reloj()
  }

  get caminos(): readonly Camino[] { return this.orden }

  /** Jev (u otro decisor) reordena los caminos que quedan; si falla o duda, queda el orden por defecto. */
  async ordenarCon(decisor: Decisor | undefined, contexto: { tipo: 'lista' | 'campo' | 'navegacion' }): Promise<void> {
    const quedan = this.orden.filter(c => !this.agotado(c))
    if (!decisor || quedan.length < 2) return
    try {
      const d = await decisor.decidir({
        pregunta: `Las manos de una Mac intentan un objetivo de tipo «${contexto.tipo}». ¿Qué camino conviene probar primero?`,
        // Solo contadores: nada de la pantalla ni del pedido (privacidad, decisión de Daniel del 2 oct).
        estado: { paso: `intentos ${this.intentos.length}; fallidos: ${[...new Set(this.intentos.filter(i => !i.avance).map(i => i.camino))].join(', ') || 'ninguno'}` },
        opciones: Object.fromEntries(quedan.map(c => [c, DESCRIPCION_CAMINO[c]])),
      })
      const elegido = d.eleccion as Camino
      if (quedan.includes(elegido)) this.orden = [elegido, ...this.orden.filter(c => c !== elegido)]
    } catch { /* el decisor cedió: orden por defecto */ }
  }

  registrar(i: Omit<IntentoCamino, 'ms'> & { ms?: number }): void { this.intentos.push({ ms: 0, ...i }) }

  /** Intentos seguidos sin avance al final del historial de ese camino. */
  private sinAvanceSeguidos(c: Camino): number {
    let n = 0
    for (let k = this.intentos.length - 1; k >= 0; k--) {
      const i = this.intentos[k]
      if (i.camino !== c) continue
      if (i.avance) break
      n++
    }
    return n
  }

  agotado(c: Camino): boolean { return this.sinAvanceSeguidos(c) >= this.parada.sinAvancePorCamino }

  /** ¿Seguir? y con qué camino. El último camino que avanzó se repite mientras avance. */
  siguiente(objetivoCumplido = false): Veredicto {
    if (objetivoCumplido) return { seguir: false, motivo: 'objetivo verificado' }
    if (this.intentos.length >= this.parada.intentosMax) return { seguir: false, motivo: `${this.parada.intentosMax} intentos sin lograrlo` }
    if (this.reloj() - this.t0 >= this.parada.presupuestoMs) return { seguir: false, motivo: `presupuesto de ${this.parada.presupuestoMs / 1000} s agotado` }
    const ult = this.intentos[this.intentos.length - 1]
    if (ult && ult.avance) return { seguir: true, camino: ult.camino, motivo: `${ult.camino} avanza: se repite` }
    const libre = this.orden.find(c => !this.agotado(c))
    if (!libre) return { seguir: false, motivo: `los ${this.orden.length} caminos sin avance (${this.orden.join(', ')})` }
    return { seguir: true, camino: libre, motivo: ult ? `${ult.camino} no avanzó: se prueba ${libre}` : `primer camino: ${libre}` }
  }

  /** Resumen para el reporte final («qué caminos probaste y qué leíste»). */
  resumen(): string {
    const por = new Map<Camino, { n: number; avances: number }>()
    for (const i of this.intentos) { const x = por.get(i.camino) ?? { n: 0, avances: 0 }; x.n++; if (i.avance) x.avances++; por.set(i.camino, x) }
    return [...por].map(([c, x]) => `${c} ×${x.n} (${x.avances} con avance)`).join(' · ') || 'sin intentos'
  }
}

// ---------- Listas largas y virtuales ----------

export interface LecturaLista { ids: string[] }

export interface OpcionesRecorrer {
  /** Cuántos elementos hacen falta (p. ej. 6 para «el 6.º»). */
  objetivo: number
  /** Lee los identificadores visibles, en orden. */
  leer: () => Promise<LecturaLista>
  /** Ejecuta un intento del camino dado (bajar la lista). Devuelve false si el camino no existe aquí. */
  avanzar: (c: Camino) => Promise<boolean>
  /** Retrocede un poco cuando una lectura no se solapa (la lista se saltó elementos). */
  retroceder?: () => Promise<void>
  /** Caminos que existen en este contexto (por defecto rueda, teclado, extensión). */
  caminos?: readonly Camino[]
  decisor?: Decisor
  reloj?: () => number
  parada?: Parada
}

export interface ResultadoRecorrer { ok: boolean; ids: string[]; motivo: string; intentos: IntentoCamino[]; resumen: string }

/**
 * Recorre una lista virtual hasta tener `objetivo` elementos en orden, con la regla de insistencia.
 * Cuenta por identificador y solo acepta lecturas que se solapan con lo ya visto: en X o YouTube un salto de
 * rueda demasiado grande desmonta elementos y el «6.º» sería otro.
 */
export async function recorrerLista(op: OpcionesRecorrer): Promise<ResultadoRecorrer> {
  const ins = new Insistencia(op.caminos ?? ['rueda', 'teclado', 'extension'], op.reloj, op.parada)
  await ins.ordenarCon(op.decisor, { tipo: 'lista' })
  const ids: string[] = []
  const sumar = (l: LecturaLista): 'avanzo' | 'igual' | 'salto' => {
    if (ids.length && l.ids.length && !l.ids.some(x => ids.includes(x))) return 'salto'
    const antes = ids.length
    for (const x of l.ids) if (!ids.includes(x)) ids.push(x)
    return ids.length > antes ? 'avanzo' : 'igual'
  }
  sumar(await op.leer())
  for (;;) {
    const v = ins.siguiente(ids.length >= op.objetivo)
    if (!v.seguir) return { ok: ids.length >= op.objetivo, ids, motivo: v.motivo, intentos: ins.intentos, resumen: ins.resumen() }
    const t = (op.reloj ?? Date.now)()
    const existe = await op.avanzar(v.camino).catch(() => false)
    let r = existe ? sumar(await op.leer()) : 'igual'
    // Se pasó: sube de a poco hasta volver a solaparse (máx. 3 veces); sin solape no se cuenta nada.
    for (let k = 0; r === 'salto' && op.retroceder && k < 3; k++) {
      await op.retroceder()
      r = sumar(await op.leer())
    }
    ins.registrar({ camino: v.camino, avance: r === 'avanzo', ms: (op.reloj ?? Date.now)() - t, detalle: existe ? r : 'camino no disponible' })
  }
}
