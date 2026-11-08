// Lo puro de Levy v4 en Live (bandera `levy4`, ver levy4.ts): los valores de c06 y las piezas del núcleo de la noche
// (labs/god-animation/practicas/2026-11-08-levy-noche/harness/src/levy4-core.js) que no dependen de three ni de React.
//
//  · C06: mirada, reposo y parpadeo de p4 (look de harness/variantes/c06/variante.json), la expresión y la deriva de su vida,
//    y la boca r5c (bocaR2). Lo que en la noche venía planificado sobre la pista entera (parpadeos en las pausas, ceja en
//    acentos, sonrisa de cierre, mirada que se aparta, respiración anclada a la voz) aquí no está: Live solo conoce la frase
//    que suena. Esos gestos siguen siendo los de B (por nivel) y el parpadeo va cada 3,2-4,8 s (≈ 15/min, el reposo de p4).
//  · FuenteVisemas: de la alineación por carácter que el reproductor guarda en `track.alineacion` a los cuadros de visemas
//    (formato visemas.json: 5 canales + 15 visemas a 30 cps) que lee la boca de c06. Son los mismos cuadros que da
//    preparar.py (levy-visemas.ts, paridad < 0,001 con voz/entreno/ref/visemas.json). Sin alineación: null (boca de B).
//  · Parpadeo por niveles (blinkNiveles), su asimetría y la identidad r5 en tiempo de ejecución (arco y cierre del
//    párpado), con estado por instancia (el identidad.js de la noche lo guardaba a nivel de módulo).
import { boca, fonemas, pista, VISEMAS, type Pista } from './levy-visemas.ts'
import { features } from './levy-lipsync.ts'
import type { VoiceTrack } from '../../live/voice/player.ts'

/** Valores de c06 (variante.json de la noche). */
export const C06 = {
  look: {
    browInner: 0.6, browOuter: 0.2,
    rest: { eyeWide: 0, eyeBlink: 0.27, eyeSquint: 0.19, cheekSquint: 0.2, mouthSmile: 0.38 },
    blinkSquash: 0.9, blinkSquashPot: 8,
    eyes: { follow: 0.12, saccade: 0.06 },
    blinkOculta: { desde: 0.44, hasta: 0.58, color: [0.02, 0.012, 0.045] as [number, number, number], emisivo: [0.012, 0.006, 0.03] as [number, number, number] },
    blinkAsim: { ojo: 'Left' as const, a: 0.05, desde: 0.27, hasta: 0.72 },
    blinkNiveles: { cierra: [0.42, 0.8], tiene: [1, 2] as [number, number], abre: [0.9, 0.64, 0.42, 0.32] },
  },
  vida: {
    parpadeo: { reposo: [3.2, 4.8] as [number, number], cejaIn: 0.5, cejaComp: 0.5, ojoAbajo: 0 },
    ceja: { amp: 0.18 }, sonrisa: { amp: 0.2 },
    suaveCabeza: { k: 14 },
    deriva: { pitch: 0.018, yaw: 0.012, roll: 0.006 },
    expresion: { pausa: { outer: 0.12, squint: 0, lid: 0, k: 0.5 }, lidRuido: 0.02, lidMirada: 0.35, sonrisaOjos: 0.22 },
  },
  bocaR2: {
    g: { vocal: 0, redLower: 0.3, redJaw: 0.05, funnel: 0.6, pucker: 0.22, cierraNorm: [0.35, 0.65], jaw: 1.1, lower: 0.75, curva: 1.45, ensancha: 0.4, ensanchaMs: 33, oRodilla: 0.6, oPend: 0.6, lowerRodilla: 0.45, lowerPend: 0.5, upperT: 0.15, upperK: 0.5 },
    labios: { aclara: 0.45, desatura: 0.2 },
    cavidadEscala: 0.9,
    oscuroAbre: { reposo: 0, lleno: 0.12 },
    forma: { inf: 0.88, sup: 0.92, plano: 0.4 },
    contorno: { k: 1, piso: 1.05, centro: 0.97, ancho: 0.3 },
    cavidadBajo: { dz: 0.005, dy: 0.003 },
    color: [0.008, 0.003, 0.02],
    interiorSuave: { borde: [0.012, 0.005, 0.028], centro: [0.002, 0.0008, 0.006], r0: 0.35, r1: 1.0 },
  },
  /** identidad.js r5 tal como corrió c06 (el arnés pisaba opciones.identidad: arco encendido, cierre desde 0,4, sin ojoOscuro). */
  identidad: { arco: 1, cierre: 1, cierreDesde: 0.4 },
}

/** Morphs de forma de boca que vuelven a su reposo antes de aplicar la boca por fonema (BOCA_REPOSO del núcleo). */
export const BOCA_REPOSO = ['jawOpen', 'mouthClose', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_U', 'viseme_DD', 'viseme_nn']

/** Lo que lee la boca de c06: visemas.json (fps, nombres de visema y cuadros [abre, ancho, redondo, cierra, muerde, …15 pesos]). */
export type Vis = { fps: number; visemas: readonly string[]; cuadros: number[][] }

/** Un cuadro de visemas.json desde la pista de levy-visemas (el mismo que escribe preparar.py a 30 cps). */
export function cuadroDePista(p: Pista, tS: number): number[] {
  const b = boca(p, tS)
  return [b.abre, b.ancho, b.redondo, b.cierra, b.muerde, ...VISEMAS.map(v => b.pesos[v])]
}

/**
 * Cuadros de una pista, calculados solo cuando hacen falta: la boca de c06 lee el cuadro del instante y los vecinos a
 * ±ensanchaMs (interpolación lineal entre cuadros), así que en cada paso se rellenan esos pocos índices de un arreglo
 * disperso del largo de la pista. Mismo resultado que tener los cuadros de la pista entera.
 */
export class VisPista {
  readonly vis: Vis
  constructor(private p: Pista, fps = 30) {
    const n = Math.max(1, Math.ceil(p.dur * fps) + 1)
    this.vis = { fps, visemas: VISEMAS, cuadros: new Array<number[]>(n) }
  }
  /** Asegura los cuadros que leerá la boca en `t` (± `margen` s). */
  preparar(t: number, margen = 0.04) {
    const { fps, cuadros } = this.vis, n = cuadros.length
    const i0 = Math.max(0, Math.floor((t - margen) * fps)), i1 = Math.min(n - 1, Math.floor((t + margen) * fps) + 1)
    for (let i = i0; i <= i1; i++) if (!cuadros[i]) cuadros[i] = cuadroDePista(this.p, i / fps)
    if (!cuadros[n - 1]) cuadros[n - 1] = cuadroDePista(this.p, (n - 1) / fps)
    return this.vis
  }
}

/**
 * De la frase que suena a los visemas de la boca de c06. Se rehace la pista cuando llega más alineación o más audio
 * (como el atlas de LevyFace con «Levy vivo»). null = la frase no trae alineación (respaldo Apple/LemonFox, o bandera
 * recién encendida): quien llama usa la boca de B por nivel.
 */
export class FuenteVisemas {
  private track: VoiceTrack | null = null
  private chars = -1
  private frames = 0
  private vp: VisPista | null = null
  vis(track: VoiceTrack | null | undefined, t: number): Vis | null {
    const al = track?.alineacion
    if (!track || !al?.chars.length) return null
    const f = features(track)
    if (track !== this.track || this.chars !== al.chars.length || f.frames - this.frames > 50 || !this.vp) {
      this.track = track; this.chars = al.chars.length; this.frames = f.frames
      this.vp = new VisPista(pista(fonemas(al, { rms: f.rms, frames: f.frames }), Math.max(f.frames / 100, al.ends[al.ends.length - 1] + 0.3)))
    }
    return this.vp.preparar(t)
  }
}

/**
 * Parpadeo por NIVELES (r3b de la noche): cada nivel se ve un cuadro de 1/30 s sea cual sea la fase del paso.
 * `blinkT` = s desde que empezó (ya sumado el dt del paso); `tiene` = cuadros cerrados de este parpadeo.
 * Devuelve el cierre 0..1, o −1 si ya terminó.
 */
export function nivelParpadeo(blinkT: number, tiene: number, BN: { cierra: number[]; abre: number[] } = C06.look.blinkNiveles): number {
  const idx = Math.ceil(blinkT * 30 - 1e-6) - 1, nc = BN.cierra.length, na = BN.abre.length
  if (idx < nc) return BN.cierra[Math.max(0, idx)]
  if (idx < nc + tiene) return 1
  if (idx < nc + tiene + na) return BN.abre[idx - nc - tiene]
  return -1
}

/** blinkAsim: el eyeBlink de la cabeza de n34 baja antes en el ojo Left; a media caída se le resta a·sin(…) (reposo y cierre intactos). */
export function asimParpadeo(w: number, A = C06.look.blinkAsim): number {
  return w > A.desde && w < A.hasta ? w - A.a * Math.sin(Math.PI * (w - A.desde) / (A.hasta - A.desde)) : w
}

/** Ruido lento de la deriva de cabeza y del párpado (suma de tres senos con fases propias), como ruido3 del núcleo. */
export function ruido3(t: number, f: [number, number, number], fases: number[], i0: number): number {
  return Math.sin(t * f[0] * 6.2832 + fases[i0]) * 0.5 + Math.sin(t * f[1] * 6.2832 + fases[i0 + 1]) * 0.3 + Math.sin(t * f[2] * 6.2832 + fases[i0 + 2]) * 0.2
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
type ConMorphs = { morphTargetDictionary?: Record<string, number>; morphTargetInfluences?: number[] }

/**
 * Identidad r5 en tiempo de ejecución (pasoIdentidad de harness/variantes/c06/identidad.js), por instancia: tras poner
 * eyeBlink, el GLB mueve `eyeBlinkArc*` con 4·w·(1−w) (párpado por fuera del globo a media caída) y `eyeBlinkCierre*` con
 * smoothstep(cierreDesde, 1, w) (borde superior cerrado en una línea). Con un GLB sin esos morphs no hace nada.
 */
export function crearIdentidad(morphMeshes: ConMorphs[], o: { arco: number; cierre: number; cierreDesde: number } = C06.identidad) {
  const arco: [number[], number, number][] = [], cierre: [number[], number, number][] = []
  for (const m of morphMeshes) {
    const d = m.morphTargetDictionary, w = m.morphTargetInfluences
    if (!d || !w) continue
    for (const sd of ['Left', 'Right']) {
      if (d['eyeBlink' + sd] !== undefined && d['eyeBlinkArc' + sd] !== undefined) arco.push([w, d['eyeBlink' + sd], d['eyeBlinkArc' + sd]])
      if (d['eyeBlink' + sd] !== undefined && d['eyeBlinkCierre' + sd] !== undefined) cierre.push([w, d['eyeBlink' + sd], d['eyeBlinkCierre' + sd]])
    }
  }
  return {
    morphs: arco.length + cierre.length,
    paso() {
      if (o.arco) for (const [w, ib, ia] of arco) { const x = Math.min(1, Math.max(0, w[ib])); w[ia] = o.arco * 4 * x * (1 - x) }
      for (const [w, ib, ic] of cierre) { const x = Math.min(1, Math.max(0, w[ib])); w[ic] = o.cierre * ss(o.cierreDesde, 1, x) }
    },
  }
}
