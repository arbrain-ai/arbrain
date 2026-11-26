// Levy de Live «como en YouTube» (18 nov 2026). Daniel, 19:58, con una captura de Live: «no la boca nueva!! por favor, entiende el
// levy de mi canal de yt los videos que he hecho recientemente como se la diferencia? porque no es un fondo 100% oscuro… se ve mucho
// mejor el movimiento de los labios y en general de todo». La comparación (labs/levy-yt-vs-live-2026-11-18) encontró que el video es
// un PLANO MEDIO: torso y hombros, la cara a ~21 % del alto, sobre el estudio cálido de la rotación del canal, con el cuerpo que
// respira y acompaña. Aquí vive la geometría de ese plano (la MISMA del compositor de los videos) y el movimiento del cuerpo en tiempo
// real, siempre como transformaciones RÍGIDAS de la figura entera (regla firmada: nada doble; nunca se funden dos dibujos).
//
// Recursos en public/levy-face/medio/, generados desde la cadena de los videos sin editarla
// (labs/levy-live-como-youtube-2026-11-18/scripts/medio_assets.py): cuerpo.webp (torso continuo + brazos en reposo, sin cabeza),
// mate.png (opacidad de la cabeza que muestrea el rig), cabeza.webp (el retrato recortado, mientras carga el rig) y
// fondo-{1,3,4}.webp (la rotación de estudios del canal, sunburst-f14-01/03/04).

export const MEDIO_URL = '/levy-face/medio'
/** Ruta de la opacidad de la cabeza RELATIVA a la base del rig (/levy-face): la recibe `capas.mate` de rig.js. */
export const MEDIO_MATE = 'medio/mate.png'
export const MEDIO_CUERPO = `${MEDIO_URL}/cuerpo.webp`
export const MEDIO_CABEZA = `${MEDIO_URL}/cabeza.webp`
/** La rotación del canal (presentador.json → fondo_rotacion): 1 estudio podcast · 3 barra morada · 4 ámbar con morado sutil. */
export const MEDIO_FONDOS = { 1: `${MEDIO_URL}/fondo-1.webp`, 3: `${MEDIO_URL}/fondo-3.webp`, 4: `${MEDIO_URL}/fondo-4.webp` } as const
/** El de Live: el estudio podcast, el del video de referencia (v3-C3, primer video de la rotación). */
export const MEDIO_FONDO = MEDIO_FONDOS[1]

// ── Geometría (rejilla del cuerpo: 1024², la de los videos) ─────────────────────────────────────────────────────────────────
/** El cuadrado del retrato (= el lienzo del rig) dentro del cuerpo: la semejanza SIFT de los videos (base-1.alin.json, escala
 *  0,5057, medida en la rejilla del retrato de 1024 px; levy-oficial.webp es idéntico píxel a píxel a levy-retrato.png). */
export const RETRATO_EN_CUERPO = { x: 252.399 / 1024, y: 7.751 / 1024, lado: 517.886 / 1024 }
/** Panel de los videos (compositor.py: ESC 0,9375 y 120 px de aire; levy3d.js: la cabeza en el punto 480, 300 del panel). */
const PANEL = { w: 960, h: 1080, esc: 0.9375, aire: 120, cabezaY: 300 }
/** Acercamiento sobre el panel: 1,2 es el tope del video en «Levy grande» (levy3d.js: z ≤ 1,2) → la cara mide ~21,6 % del alto. */
export const ZOOM_MEDIO = 1.2
/** El centro de la cabeza dentro del cuerpo, en fracción de su lado (480, 300 del panel → 512, 192 del cuerpo). */
const CABEZA_EN_CUERPO_Y = (PANEL.cabezaY - PANEL.aire) / PANEL.esc / 1024

/** Caja del cuerpo dentro del escenario (que debe tener `container-type: size`). La unidad `--u` es el alto del escenario,
 *  salvo en pantallas angostas (teléfono vertical): ahí manda el ancho para que quepan los hombros. La cabeza queda donde la
 *  pone el video: su centro al 27,8 % del alto. */
export function cajaCuerpo(zoom = ZOOM_MEDIO): { u: string; lado: string; top: string; left: string } {
  const lado = zoom * 100 * (1024 * PANEL.esc) / PANEL.h   // el cuerpo ocupa el ancho del panel: 960/1080 de su alto → 88,89·zoom
  const k = (x: number) => Number(x.toFixed(4))
  return {
    u: 'min(1cqh, 1.3cqw)',
    lado: `calc(var(--u) * ${k(lado)})`,
    top: `calc(${k(PANEL.cabezaY / PANEL.h * 100)}cqh - var(--u) * ${k(lado * CABEZA_EN_CUERPO_Y)})`,
    left: `calc(50cqw - var(--u) * ${k(lado / 2)})`,
  }
}

// ── Movimiento del cuerpo (afines 2D en coordenadas del cuerpo: x' = a·x + c·y + e, y' = b·x + d·y + f) ────────────────────
export type Afin = [number, number, number, number, number, number]
export const IDENTIDAD: Afin = [1, 0, 0, 1, 0, 0]
export function mul(m: Afin, n: Afin): Afin {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
}
export function aplicar(m: Afin, x: number, y: number): [number, number] { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
const alrededor = (px: number, py: number, m: Afin): Afin => mul(mul([1, 0, 0, 1, px, py], m), [1, 0, 0, 1, -px, -py])

/** Pivotes del compositor de los videos (gestos2d.Compositor3 y compositor.balanceo), en la rejilla del cuerpo. */
export const PIVOTES = { cintura: [512, 1024] as const, inclinarse: [512, 260] as const }

/** Cámara viva de los videos (h1_camara.PARAM): deriva lenta tipo Lissajous, 8 × 3 px del panel de 1080 a k = 1. */
export function derivaCamara(t: number): [number, number] {
  return [8 * Math.sin(2 * Math.PI * t / 8) / PANEL.esc, 3 * Math.sin(2 * Math.PI * t / 10 + Math.PI) / PANEL.esc]
}

/** Respiración del rig (life._breath: 0 en la pausa, ~1 al final de inhalar, hasta ~1,75 en un suspiro) → la escala del video
 *  (compositor.balanceo: sy = 1 + 0,0016·resp, resp en [−1, 1], cintura fija: la cabeza sube ±1,6 px de 1024). */
export function escalaRespiracion(respira: number): number {
  const r = Math.max(-1, Math.min(2, 2 * (Number.isFinite(respira) ? respira : 0) - 1))
  return 1 + 0.0016 * r
}

export type EntradaCuerpo = {
  t: number
  /** `rig.params.breath` */
  respira: number
  /** gesto de cabeza del 3D (MovimientoVivo): el balanceo de la figura lo acompaña a escala */
  ladeo?: number
  giro?: number
  /** gestos de cuerpo del catálogo (CuerpoVivo) */
  escala?: number
  dy?: number
}
/** Ganancias del balanceo: la figura entera gira sobre la cintura con el ladeo de la cabeza (±0,035 rad → ±6 px en la cabeza) y se
 *  corre de lado con el giro. Es lo que hace el video, donde el balanceo de la cabeza de LivePortrait se aplica rígido a la figura. */
const BALANCEO = { ladeo: 0.2, giroPx: 40 }

/** La transformación de la figura en este instante, en la rejilla del cuerpo (orden del compositor: cámara · gesto · balanceo). */
export function transformCuerpo(o: EntradaCuerpo): Afin {
  const [cx, cy] = PIVOTES.cintura
  const respira: Afin = alrededor(cx, cy, [1, 0, 0, escalaRespiracion(o.respira), 0, 0])
  const th = BALANCEO.ladeo * (o.ladeo ?? 0), cs = Math.cos(th), sn = Math.sin(th)
  const balanceo: Afin = mul([1, 0, 0, 1, BALANCEO.giroPx * (o.giro ?? 0), 0], alrededor(cx, cy, [cs, sn, -sn, cs, 0, 0]))
  const [ix, iy] = PIVOTES.inclinarse, s = o.escala ?? 1
  const gesto: Afin = mul([1, 0, 0, 1, 0, o.dy ?? 0], alrededor(ix, iy, [s, 0, 0, s, 0, 0]))
  const [dx, dy] = derivaCamara(o.t)
  return mul([1, 0, 0, 1, dx, dy], mul(gesto, mul(balanceo, respira)))
}

/** La afín del cuerpo como `transform` CSS de la caja (origen arriba a la izquierda); `lado` = lado de la caja en px. */
export function cssMatriz(m: Afin, lado: number): string {
  const k = lado / 1024, r = (v: number) => Number(v.toFixed(5))
  return `matrix(${r(m[0])},${r(m[1])},${r(m[2])},${r(m[3])},${r(m[4] * k)},${r(m[5] * k)})`
}

// ── Gestos de cuerpo del catálogo de los videos (acciones/catalog.json → gestos), los que caben en UNA imagen rígida ─────────
// «inclinarse» hacia la cámara (confidencia) y el golpe de «énfasis» en la palabra clave. Los de brazos (señalar, abiertas…) y el
// encogerse de hombros necesitan los dibujos de las poses: siguen solo en los videos.
type Palabra = { w: string; s: number; e: number }
const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
export const GESTOS_CUERPO = {
  inclinarse: { escala: 0.085, px: 12, ataque: 0.45, dura: 1.6, salida: 0.7, adelanto: 8 / 30, separacion: 7.0,
    disparadores: ['detalle', 'secreto', 'ojo', 'escucha', 'letra', 'nadie', 'realmente', 'confieso'] },
  enfasis: { cuerpoPx: 3, adelanto: 2 / 30, separacion: 2.0,
    disparadores: ['doble', 'mitad', 'triple', 'veces', 'nada', 'cero', 'dolares', 'centavos', 'ciento', 'millon', 'millones', 'gratis', 'todo'] },
} as const
type GestoCuerpo = keyof typeof GESTOS_CUERPO

const mj = (u: number) => { const x = Math.min(Math.max(u, 0), 1); return x ** 3 * (10 - 15 * x + 6 * x * x) }
/** 0 → 1 (mínima sacudida) → sostiene → 0 (gestos2d.sosten). */
export function sosten(t: number, ataque: number, dura: number, salida: number): number {
  if (t <= 0 || t >= ataque + dura + salida) return 0
  if (t < ataque) return mj(t / ataque)
  if (t < ataque + dura) return 1
  return 1 - mj((t - ataque - dura) / salida)
}
/** Sube rápido y cae amortiguado con un rebote pequeño (gestos2d.golpe). */
export function golpe(t: number, ataque = 0.1, caida = 0.32): number {
  if (t <= 0) return 0
  if (t < ataque) return Math.sin(0.5 * Math.PI * t / ataque)
  const x = (t - ataque) / caida
  return x < 2.2 ? Math.exp(-3.2 * x) * Math.cos(1.6 * x) : 0
}

/** Los gestos de cuerpo de las frases que suenan, en el reloj absoluto (s). Una frase puede volver a registrarse cuando llega más
 *  alineación: cada palabra dispara a lo más una vez y la separación mínima de cada capa se respeta contra todo lo agendado. */
export class CuerpoVivo {
  private eventos: { g: GestoCuerpo; t: number; clave: string }[] = []
  frase(id: string, t0: number, palabras: Palabra[]): void {
    palabras.forEach((w, i) => {
      const p = norm(w.w), clave = `${id}:${i}`
      if (this.eventos.some(e => e.clave === clave)) return
      for (const g of Object.keys(GESTOS_CUERPO) as GestoCuerpo[]) {
        const d = GESTOS_CUERPO[g]
        if (!(d.disparadores as readonly string[]).includes(p)) continue
        const t = t0 + w.s - d.adelanto
        if (this.eventos.some(e => e.g === g && Math.abs(e.t - t) < d.separacion)) continue
        this.eventos.push({ g, t, clave })
        break
      }
    })
    this.eventos.sort((a, b) => a.t - b.t)
  }
  /** (escala, dy en px del cuerpo) en el segundo absoluto `t`; olvida lo que ya pasó. */
  cuerpo(t: number): { escala: number; dy: number } {
    let escala = 1, dy = 0
    const I = GESTOS_CUERPO.inclinarse, E = GESTOS_CUERPO.enfasis
    for (const e of this.eventos) {
      if (e.t > t) break
      if (e.g === 'inclinarse') { const k = sosten(t - e.t, I.ataque, I.dura, I.salida); escala += I.escala * k; dy += I.px * k }
      else dy += E.cuerpoPx * golpe(t - e.t)
    }
    this.eventos = this.eventos.filter(e => t - e.t < 4)
    return { escala, dy }
  }
}
