// Gestos de BRAZOS del Levy de los videos en Live «Como en YouTube» (19 nov 2026). En el video Levy acompaña lo que dice con las
// manos (~13 gestos por minuto, gestos2d). Se hornean con el mismo motor del canal
// (labs/levy-live-como-youtube-2026-11-18/scripts/brazos_clips.py) y el manifiesto (gestos.json) dice cuáles trae Live.
// Hoy solo el PUÑO en la palabra fuerte: en el encuadre de Live (la cara a ~21 % del alto) las manos en reposo quedan bajo la barra
// de escribir, y «abiertas» y el golpe de «énfasis» pasan a la altura de la cintura: no se veían (medido en la ventana real) y le
// quitaban su turno al puño, que sube al pecho. Señalar no (en Live no hay nada en pantalla a qué señalar) y contar tampoco (regla
// del canal: los números no se cuentan con los dedos).
//
// Cada clip es el cuerpo completo; su primer y su último cuadro son el reposo exacto de cuerpo.webp. El cambio imagen ↔ clip se
// hace en esos cuadros (dos imágenes iguales): nunca se funden dos cuerpos (regla firmada: nada doble). El gesto arranca para que
// la pose llegue en la palabra, como en los videos («la mano llega antes de la palabra»).

import { crearPintor, videoEscondido, type VideoConCuadros } from './levy-clips.ts'

export const BRAZOS_URL = '/levy-face/medio/gestos'
export type NombreBrazo = 'abiertas' | 'puno' | 'enfasis'
export type ClipBrazo = { archivo: string; cuadros: number; cps: number; llega: number }
export type ManifiestoBrazos = Partial<Record<NombreBrazo, ClipBrazo>>

/** Disparadores del catálogo de los videos (acciones/catalog.json → gestos), sin acentos; `*` = raíz. */
export const DISPARADORES: Record<NombreBrazo, string[]> = {
  abiertas: ['como', 'imagina', 'todos', 'gente', 'negocio', 'negocios', 'clientes', 'mundo', 'cualquier*', 'explic*', 'modelos'],
  puno: ['riesgo', 'nunca', 'clave', 'seguro', 'garantia', 'dinero', 'real', 'importante', 'gano', 'gana', 'record', 'veredicto'],
  enfasis: ['doble', 'mitad', 'triple', 'veces', 'nada', 'cero', 'dolares', 'centavos', 'ciento', 'millon', 'millones', 'gratis', 'todo'],
}
/** Reglas del catálogo: ≥ 2,8 s entre poses de brazos; el énfasis, ≥ 2 s. Un gesto que llega tarde > 0,35 s ya no se hace. */
export const REGLAS_BRAZOS = { minEntre: 2.8, minEnfasis: 2.0, tardeMax: 0.35 }

type Palabra = { w: string; s: number; e: number }
const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
export function disparaA(palabra: string): NombreBrazo | null {
  const p = norm(palabra)
  if (!p) return null
  for (const g of ['enfasis', 'puno', 'abiertas'] as NombreBrazo[]) {
    if (DISPARADORES[g].some(d => (d.endsWith('*') ? p.startsWith(d.slice(0, -1)) : p === d))) return g
  }
  return null
}

/** La agenda de gestos de brazos de las frases que suenan (reloj absoluto, s). */
export class AgendaBrazos {
  private eventos: { g: NombreBrazo; t: number; clave: string }[] = []
  constructor(private man: ManifiestoBrazos) {}
  /** `t0` = segundo absoluto en que empieza la frase; las palabras traen su tiempo dentro de ella. `ahora` (s): un gesto que ya no
   *  llega a tiempo no se agenda, para que no le quite su lugar al siguiente (la primera palabra de una frase casi nunca alcanza). */
  frase(id: string, t0: number, palabras: Palabra[], ahora = -Infinity): void {
    palabras.forEach((w, i) => {
      const clave = `${id}:${i}`
      if (this.eventos.some(e => e.clave === clave)) return
      const g = disparaA(w.w)
      const c = g ? this.man[g] : undefined
      if (!g || !c) return                                       // el manifiesto no trae ese gesto
      const t = t0 + w.s - c.llega / c.cps                       // arranca para que la pose llegue en la palabra
      if (t < ahora - REGLAS_BRAZOS.tardeMax) return
      const sep = g === 'enfasis' ? REGLAS_BRAZOS.minEnfasis : REGLAS_BRAZOS.minEntre
      // nunca dos clips encimados (son el mismo cuerpo) y la separación del catálogo
      if (this.eventos.some(e => Math.abs(e.t - t) < Math.max(sep, (e.t < t ? this.man[e.g]! : c).cuadros / c.cps))) return
      this.eventos.push({ g, t, clave })
    })
    this.eventos.sort((a, b) => a.t - b.t)
  }
  /** El gesto que toca arrancar en `t` (y olvida los que ya pasaron de largo). */
  toca(t: number): NombreBrazo | null {
    while (this.eventos.length && this.eventos[0].t < t - REGLAS_BRAZOS.tardeMax) this.eventos.shift()
    if (this.eventos.length && this.eventos[0].t <= t) return this.eventos.shift()!.g
    return null
  }
  get pendientes(): number { return this.eventos.length }
}

/** Reproduce los gestos en un lienzo del tamaño del cuerpo. Mientras corre uno, el cuerpo estático se esconde (`onVisible`). */
export class BrazosVivos {
  private pintor: ReturnType<typeof crearPintor>
  private videos: Partial<Record<NombreBrazo, VideoConCuadros>> = {}
  private actual: NombreBrazo | null = null
  private visible = false
  private vivo = true
  readonly agenda: AgendaBrazos
  onVisible: ((v: boolean) => void) | null = null
  /** Registro (banco de pruebas): [ms, gesto, cuadro, entra|sale]. */
  cortes: [number, NombreBrazo, number, 'entra' | 'sale'][] = []

  constructor(canvas: HTMLCanvasElement, private man: ManifiestoBrazos, contenedor: HTMLElement, base = BRAZOS_URL) {
    this.pintor = crearPintor(canvas)
    this.agenda = new AgendaBrazos(man)
    for (const g of Object.keys(DISPARADORES) as NombreBrazo[]) { const c = man[g]; if (c) this.videos[g] = videoEscondido(`${base}/${c.archivo}`, contenedor, false) }
  }

  get corriendo(): NombreBrazo | null { return this.actual }

  /** Cada cuadro del rig, con el reloj absoluto (s). */
  tick(t: number): void {
    if (!this.vivo || this.actual) return
    const g = this.agenda.toca(t)
    if (g) this.correr(g)
  }

  private correr(g: NombreBrazo) {
    const v = this.videos[g], c = this.man[g]
    if (!c || !v?.requestVideoFrameCallback) return               // sin cuadros sincronizados no hay cambio limpio: se queda el reposo
    this.actual = g
    try { v.currentTime = 0 } catch { /* sin metadatos aún */ }
    let primero = true
    const alCuadro = (_: number, meta: { mediaTime: number }) => {
      if (!this.vivo || this.actual !== g) return
      const f = Math.min(c.cuadros - 1, Math.max(0, Math.round(meta.mediaTime * c.cps)))
      this.pintor.pintar(v)
      if (primero) { primero = false; if (f > 1) { this.terminar(f); return } this.mostrar(true, f) }
      if (f >= c.cuadros - 1) { this.terminar(f); return }        // el último cuadro es el reposo: ahí vuelve la imagen
      v.requestVideoFrameCallback!(alCuadro)
    }
    v.requestVideoFrameCallback(alCuadro)
    v.onended = () => { if (this.actual === g) this.terminar(c.cuadros - 1) }
    void v.play().catch(() => this.terminar(0))
  }

  private terminar(f: number) {
    const g = this.actual; if (!g) return
    this.videos[g]?.pause()
    if (this.visible) this.mostrar(false, f)
    this.actual = null
  }

  private mostrar(v: boolean, f: number) {
    this.visible = v
    if (this.actual) this.cortes.push([Math.round(performance.now()), this.actual, f, v ? 'entra' : 'sale'])
    if (this.cortes.length > 200) this.cortes.shift()
    this.onVisible?.(v)
  }

  /** Ventana oculta: el gesto en curso se suelta y vuelve el reposo. */
  dormir(): void { if (this.actual) this.terminar(0) }

  dispose() {
    this.vivo = false
    for (const v of Object.values(this.videos)) { if (!v) continue; v.pause(); v.removeAttribute('src'); v.load(); v.remove() }
    this.pintor.soltar()
  }
}
