// Los subtítulos del modo coche, al ritmo de lo que SUENA. Un cursor recorre el texto de la frase que suena siguiendo
// el avance de su audio; el subtítulo muestra un pedazo que cabe en dos renglones (y el anterior, más tenue).

export type Subtitulo = { anterior: string; actual: string }

/** Lo que cabe en dos renglones del subtítulo grande (15 px en hasta 560 px de ancho). */
const PEDAZO_MAX = 90

type Pedazo = { texto: string; fin: number; cierraOracion: boolean }

const limpiar = (t: string) => t.replace(/\*+|`/g, '').replace(/\s+/g, ' ').trim()

/** Parte un texto en pedazos de subtítulo: sus oraciones; las largas, por sus comas o por palabras. */
export function pedazos(texto: string): Pedazo[] {
  const salida: Pedazo[] = []
  for (const m of texto.matchAll(/[^.!?…]+(?:[.!?…]+["»”)]*|$)\s*/g)) {
    const inicio = m.index ?? 0
    const oracion = m[0]
    if (!limpiar(oracion)) continue
    const cierra = /[.!?…]["»”)]*\s*$/.test(oracion)
    if (limpiar(oracion).length <= PEDAZO_MAX) {
      salida.push({ texto: limpiar(oracion), fin: inicio + oracion.length, cierraOracion: cierra })
      continue
    }
    // Una oración larga: se junta por cláusulas (comas, punto y coma, dos puntos) hasta llenar el pedazo.
    const clausulas = [...oracion.matchAll(/[^,;:]+[,;:]?\s*/g)]
    let desde = 0
    let hasta = 0
    const cerrar = (final: boolean) => {
      const trozo = oracion.slice(desde, hasta)
      if (limpiar(trozo)) salida.push({ texto: limpiar(trozo), fin: inicio + hasta, cierraOracion: final && cierra })
      desde = hasta
    }
    for (const c of clausulas) {
      const finC = (c.index ?? 0) + c[0].length
      if (hasta > desde && limpiar(oracion.slice(desde, finC)).length > PEDAZO_MAX) cerrar(false)
      hasta = finC
      // Una cláusula sola que no cabe: por palabras.
      while (limpiar(oracion.slice(desde, hasta)).length > PEDAZO_MAX) {
        const corte = oracion.lastIndexOf(' ', desde + PEDAZO_MAX)
        const fin = hasta
        hasta = corte > desde ? corte + 1 : desde + PEDAZO_MAX
        cerrar(false)
        hasta = fin
      }
    }
    cerrar(true)
  }
  return salida
}

/** Donde la voz hace pausa: después de cada puntuación (punto, coma, dos puntos…), con su espacio. */
function pausasDe(texto: string): { fin: number; oracion: boolean }[] {
  return [...texto.matchAll(/([.!?…]+["»”)]*|[,;:])(\s+|$)/g)].map((m) => ({ fin: (m.index ?? 0) + m[0].length, oracion: /[.!?…]/.test(m[1]) }))
}

/** El pedazo donde va el cursor (la letra que suena) y el anterior. */
function pedazoEn(lista: Pedazo[], cursor: number): number {
  const i = lista.findIndex((p) => p.fin > cursor)
  return i < 0 ? lista.length - 1 : i
}

const iguales = (a: Subtitulo | null, b: Subtitulo) => a?.actual === b.actual && a?.anterior === b.anterior

// ── La voz principal: un cursor al ritmo de su voz ─────────────────────

/** Letras por segundo de voz audible a velocidad 1 (medido en vivo; se ajusta solo). */
const RITMO_INICIAL = 21
/** Su voz suena (RMS de lo que sale); por debajo, es una pausa. */
const SUENA = 0.008
/** Una pausa así de larga es el final de una oración (las de coma son más cortas, hasta ~350 ms). */
const PAUSA_ORACION_MS = 380
/**
 * Hasta dónde se acomoda el cursor en esa pausa: un poco atrás (se adelantó) o adelante (iba atrasado).
 * Nunca atrás de la última pausa en que se acomodó: en la prueba en vivo, las comas largas lo hacían
 * regresar una y otra vez a la oración anterior.
 */
const ACOMODO_ATRAS = 40
const ACOMODO_ADELANTE = 60
/** Lo más que el cursor espera al final de una oración a que llegue su pausa (por si no la hubo). */
const ESPERA_ORACION_MS = 2500

export class RelojSubtitulos {
  /** El texto de cada respuesta, por su id (llega antes que su audio). */
  private textos = new Map<string, string>()
  private activa: string | null = null
  private cursor = 0
  private ritmo = RITMO_INICIAL
  private sonoMs = 0
  private pausaMs = 0
  private acomodado = true
  /** El final de oración cuya pausa ya pasó: el cursor ya puede seguir a la siguiente. */
  private liberada = -1
  private esperandoMs = 0
  /** Desde qué letra y desde cuánto sonido se mide el ritmo de verdad (la última pausa de oración). */
  private ancla = { letra: 0, sonoMs: 0 }
  /** El último pedazo de la respuesta anterior (el renglón tenue al empezar la siguiente). */
  private previo = ''
  private mostrado: Subtitulo | null = null

  agregar(respuesta: string, delta: string) {
    this.textos.set(respuesta, (this.textos.get(respuesta) ?? '') + delta)
  }

  /** Empezó a sonar el audio de esta respuesta. */
  empezar(respuesta: string) {
    if (this.activa && this.activa !== respuesta) this.terminar(false, 1)
    this.activa = respuesta
    this.cursor = 0
    this.sonoMs = this.pausaMs = this.esperandoMs = 0
    this.acomodado = true
    this.liberada = -1
    this.ancla = { letra: 0, sonoMs: 0 }
  }

  /**
   * Dejó de sonar. `entera`: sonó completa (no la cortaron): el cursor llega al final y el ritmo
   * aprende de lo que de verdad tardó.
   */
  terminar(entera: boolean, velocidad: number): Subtitulo | null {
    const texto = this.activa ? (this.textos.get(this.activa) ?? '') : ''
    if (entera && texto) {
      this.aprender(texto.length, velocidad)
      this.cursor = texto.length
    }
    const subtitulo = this.calcular()
    if (this.activa) this.textos.delete(this.activa)
    this.activa = null
    this.previo = this.mostrado?.actual ?? this.previo
    return subtitulo
  }

  /** Cada cuadro (50 ms): avanza mientras su voz suena; en una pausa larga se acomoda. Devuelve el cambio. */
  cuadro(dtMs: number, nivel: number, velocidad: number): Subtitulo | null {
    if (!this.activa) return null
    const texto = this.textos.get(this.activa) ?? ''
    if (nivel > SUENA) {
      this.sonoMs += dtMs
      this.pausaMs = 0
      this.acomodado = false
      this.avanzar(texto, (this.ritmo * velocidad * dtMs) / 1000, dtMs)
    } else {
      this.pausaMs += dtMs
      if (this.pausaMs >= PAUSA_ORACION_MS && !this.acomodado) {
        this.acomodado = true
        this.acomodar(texto, velocidad)
      }
    }
    return this.calcular()
  }

  /** Avanza, pero se queda al final de cada oración hasta oír su pausa (o un rato, por si no la hubo). */
  private avanzar(texto: string, letras: number, dtMs: number) {
    const destino = Math.min(texto.length, this.cursor + letras)
    const fin = pedazos(texto).find((p) => p.cierraOracion && p.fin > this.cursor && p.fin !== this.liberada)?.fin
    if (fin === undefined || destino < fin - 1) {
      this.cursor = destino
      this.esperandoMs = 0
      return
    }
    this.cursor = fin - 1
    this.esperandoMs += dtMs
    if (this.esperandoMs > ESPERA_ORACION_MS) {
      this.liberada = fin
      this.esperandoMs = 0
    }
  }

  /**
   * En una pausa larga la voz está en una puntuación: el cursor va a la más cercana (punto, coma, dos
   * puntos) y el ritmo aprende. Si es el final de una oración, ya puede seguir a la siguiente. (En la
   * prueba en vivo, irse siempre al final de la oración adelantaba el subtítulo en las comas largas.)
   */
  private acomodar(texto: string, velocidad: number) {
    const aqui = this.cursor + 1
    let mejor: { fin: number; oracion: boolean } | null = null
    for (const p of pausasDe(texto)) {
      if (p.fin <= this.ancla.letra) continue
      const d = p.fin - aqui
      if (d > ACOMODO_ADELANTE) break
      if (d >= -ACOMODO_ATRAS && (!mejor || Math.abs(d) < Math.abs(mejor.fin - aqui))) mejor = p
    }
    if (!mejor) return
    this.aprender(mejor.fin, velocidad)
    this.cursor = mejor.fin - 1
    if (mejor.oracion) this.liberada = mejor.fin
    this.esperandoMs = 0
    this.ancla = { letra: mejor.fin, sonoMs: this.sonoMs }
  }

  /** El ritmo de verdad desde la última pausa de oración hasta esta letra. */
  private aprender(letra: number, velocidad: number) {
    const ms = this.sonoMs - this.ancla.sonoMs
    const letras = letra - this.ancla.letra
    if (ms < 800 || letras < 12) return
    const medido = letras / (ms / 1000) / velocidad
    this.ritmo = Math.min(26, Math.max(9, this.ritmo * 0.5 + medido * 0.5))
  }

  private calcular(): Subtitulo | null {
    const texto = this.activa ? (this.textos.get(this.activa) ?? '') : ''
    const lista = pedazos(texto)
    if (!lista.length) return null
    const i = pedazoEn(lista, this.cursor)
    const nuevo = { anterior: i > 0 ? lista[i - 1].texto : this.previo, actual: lista[i].texto }
    if (iguales(this.mostrado, nuevo)) return null
    this.mostrado = nuevo
    return nuevo
  }

  /** Al cerrar la voz: nada pendiente (el ritmo aprendido se queda para la siguiente). */
  soltar() {
    this.textos.clear()
    this.activa = null
    this.previo = ''
    this.mostrado = null
  }
}

// ── El respaldo: una frase con su audio ────────────────────────────────

/** Los subtítulos de una frase que suena: el pedazo según cuánto del audio ya sonó. */
export class SubtitulosDeFrase {
  private lista: Pedazo[] = []
  private largo = 0
  private previo = ''
  private mostrado: Subtitulo | null = null

  /** Empieza a sonar una frase; `previo`: lo último que se vio de la anterior. */
  empezar(frase: string, previo: string): Subtitulo {
    this.lista = pedazos(frase)
    this.largo = frase.length
    this.previo = previo
    this.mostrado = null
    return this.en(0) ?? { anterior: previo, actual: limpiar(frase) }
  }

  /** ¿Tiene más de un pedazo? (si no, no hace falta seguir su avance). */
  get larga(): boolean {
    return this.lista.length > 1
  }

  /** `avance`: de 0 a 1, cuánto del audio de la frase ya sonó. */
  en(avance: number): Subtitulo | null {
    if (!this.lista.length) return null
    const i = pedazoEn(this.lista, Math.max(0, Math.min(1, avance)) * this.largo)
    const nuevo = { anterior: i > 0 ? this.lista[i - 1].texto : this.previo, actual: this.lista[i].texto }
    if (iguales(this.mostrado, nuevo)) return null
    this.mostrado = nuevo
    return nuevo
  }
}
