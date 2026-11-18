/**
 * El motor del Orbe del modo coche: un orbe de DOS CAPAS, pintado en un <canvas> 2D.
 *
 *   1. cáscara TRASERA  — puntos de una esfera (Fibonacci), tenues, del lado de atrás
 *   2. resplandor del corazón
 *   3. la BRASA — chispas que nacen abajo, suben, titilan y mueren dentro de la cáscara
 *   4. cáscara FRONTAL  — los puntos de adelante, más brillantes
 *
 * Ese orden da el volumen: el corazón vive DENTRO de la cáscara. Los colores salen de la paleta que escoge cada quien
 * (paletas.ts); el ESTADO decide qué tono va en la piel y cuál en la brasa, y cuánto se mueve. El `nivel` (0 a 1) es el
 * volumen de quien habla en ese momento: tu micrófono al escuchar o la voz de Arbrain al hablar.
 */
import { CARMESI, FONDO, LUNA, type Paleta, type RGB, type Tonos } from './paletas'

export type EstadoOrbe = 'reposo' | 'escucha' | 'pensando' | 'respondiendo' | 'hablando' | 'error'

type Look = {
  piel: Tonos
  /** [color al fondo, color al frente] de las chispas. */
  brasa: readonly [RGB, RGB]
  /** Vueltas por segundo de la cáscara (radianes/s). */
  giro: number
  /** Cuánto respira la cáscara sola y cuánto sigue a la voz. */
  respira: number
  voz: number
  /** Subida de las chispas y cuántas hay (0 a 1). */
  sube: number
  chispas: number
  /** Brillo del corazón. */
  corazon: number
}

function look(e: EstadoOrbe, p: Paleta): Look {
  const brasaDe = (t: Tonos): readonly [RGB, RGB] => [t[2], t[0]]
  switch (e) {
    case 'escucha': return { piel: LUNA, brasa: brasaDe(p.principal), giro: 0.35, respira: 0.02, voz: 0.16, sube: 0.5, chispas: 0.7, corazon: 0.55 }
    // Pensando: piel y brasa se invierten para que siga visible y se note el cambio.
    case 'pensando': return { piel: p.acento, brasa: brasaDe(p.principal), giro: 0.9, respira: 0.035, voz: 0, sube: 1.2, chispas: 1, corazon: 0.7 }
    case 'respondiendo':
    case 'hablando': return { piel: p.principal, brasa: [LUNA[2], [255, 255, 255]], giro: 0.45, respira: 0.02, voz: 0.2, sube: 0.8, chispas: 0.9, corazon: 0.85 }
    case 'error': return { piel: CARMESI, brasa: brasaDe(CARMESI), giro: 0.15, respira: 0.01, voz: 0, sube: 0.3, chispas: 0.4, corazon: 0.4 }
    default: return { piel: p.principal, brasa: brasaDe(p.acento), giro: 0.22, respira: 0.025, voz: 0.05, sube: 0.45, chispas: 0.6, corazon: 0.5 }
  }
}

const mezcla = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`
const TAU = Math.PI * 2
const PUNTOS = 240
const MAX_CHISPAS = 46
/** Radio de la cáscara / lado del lienzo. */
export const RADIO = 0.34
const FUNDIDO_S = 0.35

type Punto = { x: number; y: number; z: number; fase: number }
type Chispa = { x: number; y: number; vida: number; dura: number; tam: number; fase: number }

function esfera(n: number): Punto[] {
  const phi = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const th = phi * i
    return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, fase: (i * 2.399) % TAU }
  })
}

export class OrbeMotor {
  private paleta: Paleta
  private estado: EstadoOrbe = 'reposo'
  private desde: Look
  private hacia: Look
  private fundido = 1
  private t = 0
  private angulo = 0
  private nivelSuave = 0
  private readonly puntos = esfera(PUNTOS)
  private chispas: Chispa[] = []

  constructor(paleta: Paleta) {
    this.paleta = paleta
    this.desde = this.hacia = look('reposo', paleta)
  }

  /** Cambia de paleta al instante (la persona escogió otros colores). */
  ponerPaleta(p: Paleta): void {
    this.paleta = p
    this.desde = this.hacia = look(this.estado, p)
    this.fundido = 1
  }

  /** Salta al estado sin transición (primer cuadro o movimiento reducido). */
  fijar(e: EstadoOrbe): void {
    this.estado = e
    this.desde = this.hacia = look(e, this.paleta)
    this.fundido = 1
  }

  /** Cambia de estado con un fundido corto de colores. */
  cambiar(e: EstadoOrbe): void {
    if (e === this.estado) return
    this.desde = this.actual()
    this.hacia = look(e, this.paleta)
    this.estado = e
    this.fundido = 0
  }

  private actual(): Look {
    const k = this.fundido
    if (k >= 1) return this.hacia
    const a = this.desde, b = this.hacia
    const n = (x: number, y: number) => x + (y - x) * k
    return {
      piel: [mezcla(a.piel[0], b.piel[0], k), mezcla(a.piel[1], b.piel[1], k), mezcla(a.piel[2], b.piel[2], k)],
      brasa: [mezcla(a.brasa[0], b.brasa[0], k), mezcla(a.brasa[1], b.brasa[1], k)],
      giro: n(a.giro, b.giro), respira: n(a.respira, b.respira), voz: n(a.voz, b.voz), sube: n(a.sube, b.sube),
      chispas: n(a.chispas, b.chispas), corazon: n(a.corazon, b.corazon),
    }
  }

  /** Avanza el tiempo `dt` segundos con el volumen `nivel` (0 a 1). */
  avanzar(dt: number, nivel: number): void {
    this.t += dt
    this.fundido = Math.min(1, this.fundido + dt / FUNDIDO_S)
    const l = this.actual()
    // Sube rápido y baja despacio: la cáscara no tiembla con cada sílaba.
    const k = nivel > this.nivelSuave ? 0.45 : 0.12
    this.nivelSuave += (nivel - this.nivelSuave) * k
    this.angulo = (this.angulo + dt * (l.giro + this.nivelSuave * l.voz * 2)) % TAU
    // Chispas: nacen abajo del corazón y suben.
    const quiere = Math.round(MAX_CHISPAS * l.chispas)
    if (this.chispas.length < quiere && Math.random() < 0.5 + this.nivelSuave) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.45
      this.chispas.push({ x: Math.cos(a) * r, y: 0.25 + Math.random() * 0.25, vida: 0, dura: 1.2 + Math.random() * 1.6, tam: 0.05 + Math.random() * 0.07, fase: Math.random() * TAU })
    }
    for (const c of this.chispas) {
      c.vida += dt
      c.y -= dt * (0.18 + 0.35 * l.sube + this.nivelSuave * 0.4)
      c.x += Math.sin(this.t * 1.7 + c.fase) * dt * 0.05
    }
    this.chispas = this.chispas.filter(c => c.vida < c.dura && c.y > -0.7)
  }

  /** Pinta un cuadro en un lienzo de `w`×`h` (en píxeles CSS). */
  pintar(ctx: CanvasRenderingContext2D, w: number, h: number, nivel: number): void {
    const l = this.actual()
    const lado = Math.min(w, h)
    const cx = w / 2, cy = h / 2
    const v = Math.max(this.nivelSuave, nivel * 0.6)
    const R = lado * RADIO * (1 + Math.sin(this.t * 1.3) * l.respira + v * l.voz)

    // El pozo: un disco oscuro de bordes suaves, para que el Orbe flote sobre cualquier fondo.
    const pozo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, lado * 0.5)
    pozo.addColorStop(0, rgba(FONDO, 0.95))
    pozo.addColorStop(0.72, rgba(FONDO, 0.85))
    pozo.addColorStop(1, rgba(FONDO, 0))
    ctx.fillStyle = pozo
    ctx.fillRect(0, 0, w, h)

    const cos = Math.cos(this.angulo), sin = Math.sin(this.angulo)
    const incl = 0.35, ci = Math.cos(incl), si = Math.sin(incl)
    const proyectados = this.puntos.map(p => {
      const x = p.x * cos + p.z * sin
      const z0 = -p.x * sin + p.z * cos
      const y = p.y * ci - z0 * si
      const z = p.y * si + z0 * ci
      const onda = 1 + Math.sin(this.t * 2.1 + p.fase) * l.respira * 1.5 + v * l.voz * 0.6 * Math.sin(p.fase * 3 + this.t * 6)
      return { x: cx + x * R * onda, y: cy + y * R * onda, z }
    })

    const puntos = (atras: boolean) => {
      for (const p of proyectados) {
        if ((p.z < 0) !== atras) continue
        const prof = (p.z + 1) / 2 // 0 atrás, 1 adelante
        const color = atras ? mezcla(l.piel[2], l.piel[1], prof * 2) : mezcla(l.piel[1], l.piel[0], (prof - 0.5) * 2)
        const tam = lado * (atras ? 0.0045 : 0.006 + 0.003 * prof)
        ctx.fillStyle = rgba(color, atras ? 0.25 + prof * 0.5 : 0.6 + prof * 0.4)
        ctx.beginPath()
        ctx.arc(p.x, p.y, tam, 0, TAU)
        ctx.fill()
      }
    }

    puntos(true)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    // El corazón: un resplandor que late con la voz.
    const brillo = l.corazon * (0.55 + 0.45 * v + 0.08 * Math.sin(this.t * 2.4))
    const nucleo = ctx.createRadialGradient(cx, cy + R * 0.1, 0, cx, cy, R * 0.85)
    nucleo.addColorStop(0, rgba(l.brasa[1], 0.55 * brillo))
    nucleo.addColorStop(0.45, rgba(l.brasa[0], 0.28 * brillo))
    nucleo.addColorStop(1, rgba(l.brasa[0], 0))
    ctx.fillStyle = nucleo
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.9, 0, TAU)
    ctx.fill()
    // La brasa: chispas que suben y titilan.
    for (const c of this.chispas) {
      const vida = c.vida / c.dura
      const a = Math.sin(vida * Math.PI) * (0.6 + 0.4 * Math.sin(this.t * 9 + c.fase)) * (0.6 + 0.6 * v)
      const x = cx + c.x * R, y = cy + c.y * R, r = c.tam * R * (1 - vida * 0.4)
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, rgba(l.brasa[1], a))
      g.addColorStop(1, rgba(l.brasa[0], 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    puntos(false)
  }
}
