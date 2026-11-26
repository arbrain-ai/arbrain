/**
 * La lógica del editor, sin React (19 nov 2026, encargo `editor-interfaz`).
 *
 * El norte es la sala vieja del dueño (`sfcast/sala`): el eje de la línea de tiempo es la TOMA (el material crudo de la
 * cámara) y lo que el corte quitó se ve en ROJO donde estaba; la reproducción salta lo rojo; S/A/D trabajan en el
 * playhead. Aquí se traduce entre los dos relojes: el de la toma (segundos del archivo de la cámara) y el del corte
 * (segundos de la línea de tiempo del motor, ya cortada). Cada edición sale como operaciones del motor (rippleDelete,
 * splitClip, addMarker…) que el motor guarda como versión.
 */
import type { Cambio, Clip, ClipMedio, Evaluacion, Medio, Pista, RazonCorte, Timeline, TramoT } from './tipos'

export const EPS = 1e-4

/** Una pieza de la cámara: un tramo continuo de la toma que el corte conserva. */
export interface Pieza { clipId: string; mediaId: string; fuente: TramoT; corte: TramoT; velocidad: number }

/** La pista de la cámara: la de video (o audio) cuyo material lleva sonido y dura más. Sin ella no hay toma que mirar. */
export function pistaCamara(t: Timeline | null | undefined, medios: Medio[]): Pista | null {
  if (!t) return null
  const conAudio = new Set(medios.filter(m => m.hasAudio !== false && (m.kind === 'video' || m.kind === 'audio')).map(m => m.id))
  let mejor: Pista | null = null, mejorDur = -1
  for (const p of t.tracks) {
    if (p.kind === 'caption') continue
    const dur = p.clips.filter((c): c is ClipMedio => c.kind === 'media' && conAudio.has(c.mediaId) && c.enabled !== false)
      .reduce((s, c) => s + (c.sourceOut - c.sourceIn), 0)
    // Empate: la de video gana a la de audio (la cámara se ve).
    if (dur > mejorDur + EPS || (Math.abs(dur - mejorDur) <= EPS && p.kind === 'video' && mejor?.kind !== 'video')) { mejor = p; mejorDur = dur }
  }
  return mejorDur > 0 ? mejor : null
}

/** Las piezas de la cámara en orden de la línea de tiempo (solo las del medio principal: el de la primera pieza). */
export function piezas(p: Pista | null): Pieza[] {
  if (!p) return []
  const cs = p.clips.filter((c): c is ClipMedio => c.kind === 'media' && c.enabled !== false).sort((a, b) => a.timelineIn - b.timelineIn)
  if (!cs.length) return []
  const medio = cs[0].mediaId
  return cs.filter(c => c.mediaId === medio).map(c => {
    const v = c.speed && c.speed > 0 ? c.speed : 1
    return { clipId: c.id, mediaId: c.mediaId, fuente: { start: c.sourceIn, end: c.sourceOut }, corte: { start: c.timelineIn, end: c.timelineIn + (c.sourceOut - c.sourceIn) / v }, velocidad: v }
  })
}

/** Lo que el corte quitó de la toma (huecos entre piezas consecutivas, más el principio y el final), en tiempo de toma. */
export function cortes(ps: Pieza[], duracionToma: number): TramoT[] {
  if (!ps.length) return []
  const orden = [...ps].sort((a, b) => a.fuente.start - b.fuente.start)
  const fuera: TramoT[] = []
  let cursor = 0
  for (const p of orden) {
    if (p.fuente.start > cursor + 1 / 120) fuera.push({ start: cursor, end: p.fuente.start })
    cursor = Math.max(cursor, p.fuente.end)
  }
  if (duracionToma > cursor + 1 / 120) fuera.push({ start: cursor, end: duracionToma })
  return fuera
}

/** Tiempo de toma → tiempo de corte. Dentro de lo cortado devuelve el instante del corte (la unión) y `dentro: false`. */
export function aCorte(ps: Pieza[], toma: number): { t: number; dentro: boolean } {
  let ultimo = 0
  for (const p of ps) {
    if (toma >= p.fuente.start - EPS && toma < p.fuente.end - EPS) return { t: p.corte.start + (toma - p.fuente.start) / p.velocidad, dentro: true }
    if (p.fuente.start > toma) return { t: p.corte.start, dentro: false }
    ultimo = p.corte.end
  }
  return { t: ultimo, dentro: false }
}

/** Tiempo de corte → tiempo de toma (y la pieza). Al final exacto, el final de la última pieza. */
export function aToma(ps: Pieza[], t: number): { toma: number; pieza: number } {
  if (!ps.length) return { toma: 0, pieza: -1 }
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    if (t < p.corte.end - EPS || i === ps.length - 1) {
      const dentro = Math.min(Math.max(t, p.corte.start), p.corte.end)
      return { toma: p.fuente.start + (dentro - p.corte.start) * p.velocidad, pieza: i }
    }
  }
  return { toma: ps[ps.length - 1].fuente.end, pieza: ps.length - 1 }
}

export const duracionCorte = (ps: Pieza[]) => ps.reduce((m, p) => Math.max(m, p.corte.end), 0)

/** La pieza que sigue a la que contiene `toma`, en orden de corte (no de toma: el corte puede reordenar). */
export function siguienteEnCorte(ps: Pieza[], toma: number): number | 'fin' {
  const { t } = aCorte(ps, toma)
  const i = ps.findIndex(p => t >= p.corte.start - EPS && t < p.corte.end - EPS)
  if (i === -1 || i === ps.length - 1) return 'fin'
  return ps[i + 1].fuente.start
}

// ── Herramientas a mano (los atajos de la sala vieja) ──

export type Op =
  | { op: 'splitClip'; clipId: string; at: number }
  | { op: 'rippleDelete'; start: number; end: number; trackIds?: string[] }
  | { op: 'addMarker'; marker: { id: string; time: number; kind: 'note'; text: string; author?: string } }
  | { op: 'moveClip'; clipId: string; timelineIn: number; trackId?: string }
  | { op: 'removeClip'; clipId: string }
  | { op: 'rippleInsertGap'; at: number; duration: number; trackIds?: string[] }
  | { op: 'updateClip'; clipId: string; patch: Record<string, unknown> }

export interface Edicion { ops: Op[]; descripcion: string }

const fmtCorto = (s: number) => { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}` }

/** La pieza (índice) que contiene el instante de corte `t`. */
export function piezaEn(ps: Pieza[], t: number): number {
  return ps.findIndex(p => t >= p.corte.start - EPS && t < p.corte.end - EPS)
}

/** S: partir la pieza de la cámara en el playhead. */
export function partir(ps: Pieza[], t: number, fps: number): Edicion | null {
  const i = piezaEn(ps, t)
  if (i < 0) return null
  const p = ps[i], at = alCuadro(t, fps)
  if (at - p.corte.start < 1 / fps - EPS || p.corte.end - at < 1 / fps - EPS) return null
  return { ops: [{ op: 'splitClip', clipId: p.clipId, at }], descripcion: `Partir en ${fmtCorto(at)} (a mano, S)` }
}

/** A: quitar desde el principio de la pieza hasta el playhead. D: desde el playhead hasta el final de la pieza. */
export function recortar(ps: Pieza[], t: number, lado: 'izquierda' | 'derecha', fps: number): Edicion | null {
  const i = piezaEn(ps, t)
  if (i < 0) return null
  const p = ps[i], at = alCuadro(t, fps)
  const [start, end] = lado === 'izquierda' ? [p.corte.start, at] : [at, p.corte.end]
  if (end - start < 1 / fps - EPS) return null
  return { ops: [{ op: 'rippleDelete', start, end }], descripcion: `Recortar ${lado === 'izquierda' ? '←' : '→'} ${fmtCorto(start)}–${fmtCorto(end)} (a mano, ${lado === 'izquierda' ? 'A' : 'D'})` }
}

/** Supr sobre una selección de piezas: un rippleDelete por tramo contiguo, de atrás hacia adelante (no se mueven entre sí). */
export function borrarPiezas(ps: Pieza[], indices: number[]): Edicion | null {
  const sel = [...new Set(indices)].filter(i => ps[i]).sort((a, b) => a - b)
  if (!sel.length || sel.length === ps.length) return null
  const tramos: TramoT[] = []
  for (const i of sel) {
    const ult = tramos[tramos.length - 1]
    if (ult && Math.abs(ult.end - ps[i].corte.start) < EPS) ult.end = ps[i].corte.end
    else tramos.push({ ...ps[i].corte })
  }
  return { ops: tramos.reverse().map(r => ({ op: 'rippleDelete' as const, start: r.start, end: r.end })), descripcion: `Quitar ${sel.length === 1 ? '1 pieza' : `${sel.length} piezas`} (a mano, Supr)` }
}

/** Q / E: todas las piezas a la izquierda / derecha del playhead (la que lo contiene no entra). */
export function seleccionarLado(ps: Pieza[], t: number, lado: -1 | 1): number[] {
  return ps.map((p, i) => ({ p, i })).filter(({ p }) => lado < 0 ? p.corte.end <= t + EPS : p.corte.start >= t - EPS).map(({ i }) => i)
}

/** M: un marcador con nota en el instante de corte. */
export function marcador(t: number, texto: string, id: string): Edicion {
  return { ops: [{ op: 'addMarker', marker: { id, time: Math.max(0, t), kind: 'note', text: texto.trim() || 'Marca'} }], descripcion: `Marcador en ${fmtCorto(t)}: ${texto.trim() || 'Marca'}` }
}

/** ⌥←/→: mover un clip (que no sea de la cámara) un cuadro, o diez con ⇧. */
export function moverClip(c: Clip, cuadros: number, fps: number): Edicion | null {
  const nuevo = Math.max(0, c.timelineIn + cuadros / fps)
  if (Math.abs(nuevo - c.timelineIn) < EPS) return null
  return { ops: [{ op: 'moveClip', clipId: c.id, timelineIn: nuevo }], descripcion: `Mover «${c.label ?? c.id}» ${cuadros > 0 ? '+' : ''}${cuadros} cuadro${Math.abs(cuadros) === 1 ? '' : 's'}` }
}

export const alCuadro = (t: number, fps: number) => Math.round(t * fps) / fps

/** ↑/↓: el principio de la pieza siguiente / anterior (como CapCut), en tiempo de corte. */
export function bloque(ps: Pieza[], t: number, dir: 1 | -1): number {
  const bordes = [...new Set(ps.flatMap(p => [p.corte.start, p.corte.end]).map(x => Math.round(x * 1000) / 1000))].sort((a, b) => a - b)
  if (dir > 0) return bordes.find(b => b > t + 0.01) ?? bordes[bordes.length - 1] ?? 0
  return [...bordes].reverse().find(b => b < t - 0.05) ?? 0
}

/** ←/→: un cuadro (⇧ diez) en el tiempo del corte, así el paso salta lo cortado. */
export function pasoCuadro(ps: Pieza[], t: number, cuadros: number, fps: number): number {
  return Math.min(Math.max(0, t + cuadros / fps), duracionCorte(ps))
}

export const VELOCIDADES = [0.5, 1, 1.25, 1.5, 2] as const
export function otraVelocidad(actual: number, dir: 1 | -1): number {
  const i = VELOCIDADES.findIndex(v => Math.abs(v - actual) < 0.01)
  const j = Math.min(VELOCIDADES.length - 1, Math.max(0, (i === -1 ? 1 : i) + dir))
  return VELOCIDADES[j]
}

// ── Llamadas «Para ti» (los cortes que el pase deja al dueño) ──

export interface Llamada {
  numero: number; cambioId: string; indice: number; tramo: TramoT; nota: string; resumen?: string; tipo?: RazonCorte['kind']
  revisar?: string; eleccion?: 'cut' | 'keep'; preguntada: boolean; revisando?: boolean
}

const PENDIENTES = new Set(['ready', 'proposed', 'rendering', 'revising'])

/**
 * Las llamadas de los pases que esperan al dueño, numeradas como en Scarlet: primero lo que el pase preguntó (por el
 * orden en que llegó, `askOrder`), después los cortes que nunca revisó, en orden de la toma. El número no cambia mientras
 * el pase espera.
 */
export function llamadas(cs: Cambio[]): Llamada[] {
  const out: Llamada[] = []
  let n = 0
  const pend = cs.filter(c => PENDIENTES.has(c.state) && (c.cutReasons?.length ?? 0) > 0).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  for (const c of pend) {
    const razones = c.cutReasons ?? []
    const evals = new Map<number, Evaluacion>((c.cutAssessments ?? []).filter(e => !e.provisional).map(e => [e.index, e]))
    const elegidas = new Map((c.cutChoices ?? []).map(e => [e.index, e.choice]))
    // Lo que el pase ya decidió solo («cut» o «keep» sin preguntar) no es llamada.
    const espera = razones.map((r, i) => ({ r, i, e: evals.get(i) })).filter(({ e }) => !e || e.verdict === 'ask')
    const preguntadas = espera.filter(x => x.e?.verdict === 'ask').sort((a, b) => (a.e?.askOrder ?? 1e9) - (b.e?.askOrder ?? 1e9) || a.r.start - b.r.start)
    const sinRevisar = espera.filter(x => !x.e).sort((a, b) => a.r.start - b.r.start)
    for (const { r, i, e } of [...preguntadas, ...sinRevisar]) {
      n += 1
      out.push({ numero: n, cambioId: c.id, indice: i, tramo: { start: r.start, end: r.end }, nota: e?.reason ?? r.reason, resumen: e?.summary ?? r.summary,
        tipo: r.kind, revisar: r.check, eleccion: elegidas.get(i), preguntada: !!e, revisando: c.state === 'revising' })
    }
  }
  return out
}

export const TIPO_CORTE: Record<string, string> = { pause: 'Pausa', filler: 'Muletilla', retake: 'Retoma', coaching: 'Indicación' }

/** Lo que se manda al motor al terminar las llamadas de un cambio: aprobar con los cortes que el dueño decidió mantener. */
export function cierreDeCambio(c: Cambio, decididas: Map<number, 'cut' | 'keep'>): { listo: boolean; restoredCuts: number[] } {
  const total = c.cutReasons?.length ?? 0
  const evals = new Map((c.cutAssessments ?? []).filter(e => !e.provisional).map(e => [e.index, e.verdict]))
  const restored: number[] = []
  let faltan = 0
  for (let i = 0; i < total; i++) {
    const v = decididas.get(i) ?? (evals.get(i) === 'cut' ? 'cut' : evals.get(i) === 'keep' ? 'keep' : undefined)
    if (!v) faltan++
    else if (v === 'keep') restored.push(i)
  }
  return { listo: faltan === 0, restoredCuts: restored }
}

// ── Pistas a la vista (cámara, pantalla, gráficos, subtítulos, SFX, música) ──

export type ClasePista = 'camara' | 'pantalla' | 'graficos' | 'subtitulos' | 'sfx' | 'musica' | 'otra'

export function clasePista(p: Pista, camara: Pista | null, medios: Map<string, Medio>): ClasePista {
  if (camara && p.id === camara.id) return 'camara'
  const n = p.name.toLowerCase()
  if (p.kind === 'caption' || /subt|caption/.test(n)) return 'subtitulos'
  if (/m[uú]sica|music/.test(n)) return 'musica'
  if (/sfx|efecto|sonido/.test(n)) return 'sfx'
  if (/pantalla|screen/.test(n)) return 'pantalla'
  if (/gr[aá]fic|graphic|card|l[aá]mina|overlay/.test(n)) return 'graficos'
  const primero = p.clips.find((c): c is ClipMedio => c.kind === 'media')
  const m = primero ? medios.get(primero.mediaId) : undefined
  if (p.kind === 'audio') return 'musica'
  if (m?.kind === 'graphic' || m?.kind === 'image') return 'graficos'
  if (m?.kind === 'video') return 'pantalla'
  return 'otra'
}

export const NOMBRE_CLASE: Record<ClasePista, string> = {
  camara: 'Cámara', pantalla: 'Pantalla', graficos: 'Gráficos', subtitulos: 'Subtítulos', sfx: 'SFX', musica: 'Música', otra: 'Pista',
}

/** El orden fijo de las filas: arriba lo que se ve encima, abajo la cámara con su onda y luego el sonido. */
export const ORDEN_CLASE: ClasePista[] = ['subtitulos', 'graficos', 'pantalla', 'otra', 'camara', 'sfx', 'musica']

/** Tramo de un clip en tiempo de corte. */
export function tramoCorte(c: Clip): TramoT {
  if (c.kind === 'media') { const v = c.speed && c.speed > 0 ? c.speed : 1; return { start: c.timelineIn, end: c.timelineIn + (c.sourceOut - c.sourceIn) / v } }
  return { start: c.timelineIn, end: c.timelineOut }
}

// ── Zoom de la línea de tiempo (anclado al cursor) ──

/**
 * Píxeles de maquetación desde el borde izquierdo de `el`. Con el zoom de la ventana (CSS `zoom` en <html>, 1.2 en la de
 * el dueño) WebKit da `clientX` y el rectángulo en píxeles de pantalla: se divide entre la escala MEDIDA
 * (ancho en pantalla / ancho de maquetación), que vale en cualquier motor y con cualquier zoom.
 */
export function xEnMaqueta(el: HTMLElement, clientX: number): number {
  const r = el.getBoundingClientRect()
  const escala = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1
  return (clientX - r.left) / (escala || 1)
}


export interface Vista { inicio: number; pxPorSeg: number }

/** Zoom anclado: el instante bajo el cursor se queda bajo el cursor. */
export function zoomAnclado(v: Vista, factor: number, xCursor: number, duracion: number, ancho: number): Vista {
  const min = ancho / Math.max(1, duracion), max = 600
  const px = Math.min(max, Math.max(min, v.pxPorSeg * factor))
  const tCursor = v.inicio + xCursor / v.pxPorSeg
  const inicio = Math.max(0, Math.min(Math.max(0, duracion - ancho / px), tCursor - xCursor / px))
  return { inicio, pxPorSeg: px }
}

export function desplazar(v: Vista, dx: number, duracion: number, ancho: number): Vista {
  return { ...v, inicio: Math.max(0, Math.min(Math.max(0, duracion - ancho / v.pxPorSeg), v.inicio + dx / v.pxPorSeg)) }
}

export function formato(seg: number, fps?: number): string {
  const s = Math.max(0, seg)
  const m = Math.floor(s / 60), r = Math.floor(s - m * 60)
  const base = `${m}:${String(r).padStart(2, '0')}`
  if (!fps) return base
  return `${base}.${String(Math.floor((s - Math.floor(s)) * fps + 1e-6)).padStart(2, '0')}`
}

/** El texto que viaja a Levy con C (el mismo protocolo que las marcas del visor: `⏱ Video «…» · 2:10 (tiempo=…) · ruta=…`). */
export function mensajeComentario(o: { proyecto: string; proyectoId: string; version: string; tiempo: number; toma: number; nota: string }): string {
  const t = Math.round(o.tiempo * 100) / 100
  const cabeza = `⏱ Video «${o.proyecto} · ${o.version}» · ${formato(o.tiempo)} (tiempo=${t}) · ruta=editor:${o.proyectoId}?version=${o.version}&toma=${Math.round(o.toma * 100) / 100}`
  const nota = o.nota.trim()
  return nota ? `${cabeza}\n${nota}` : cabeza
}

/** Un tramo en tiempo de corte, visto sobre la toma: uno o varios tramos (uno por pieza que toca). */
export function tramosEnToma(ps: Pieza[], r: TramoT): TramoT[] {
  const out: TramoT[] = []
  for (const p of ps) {
    const a = Math.max(r.start, p.corte.start), b = Math.min(r.end, p.corte.end)
    if (b - a > EPS) out.push({ start: p.fuente.start + (a - p.corte.start) * p.velocidad, end: p.fuente.start + (b - p.corte.start) * p.velocidad })
  }
  // Un instante (marcador, clip de duración cero) cae en un punto.
  if (!out.length && r.end - r.start <= EPS) { const { toma } = aToma(ps, r.start); out.push({ start: toma, end: toma }) }
  return out
}

/** El índice de pieza (en orden de corte) que contiene el instante de toma, o la siguiente por toma si cae en lo cortado. */
export function piezaDeToma(ps: Pieza[], toma: number): number {
  const i = ps.findIndex(p => toma >= p.fuente.start - EPS && toma < p.fuente.end - EPS)
  if (i >= 0) return i
  let mejor = -1
  ps.forEach((p, j) => { if (p.fuente.start >= toma && (mejor < 0 || p.fuente.start < ps[mejor].fuente.start)) mejor = j })
  return mejor
}

// ── Vuelta 2 (19 nov 2026) ──

/**
 * Números estables de las llamadas (Scarlet): un número se da una vez y no se reasigna mientras el pase espera; las que
 * llegan después toman el siguiente, estén donde estén en el video. Sin llamadas pendientes, la cuenta vuelve a empezar.
 */
export function numerar(previo: Record<string, number>, ls: Llamada[]): { llamadas: Llamada[]; numeros: Record<string, number> } {
  if (!ls.length) return { llamadas: [], numeros: {} }
  const vivos = new Set(ls.map(l => `${l.cambioId}:${l.indice}`))
  const numeros: Record<string, number> = {}
  for (const [k, n] of Object.entries(previo)) if (vivos.has(k)) numeros[k] = n
  // El siguiente número nunca reusa uno ya mostrado en este pase (aunque su llamada se haya ido).
  let siguiente = Math.max(0, ...Object.values(previo)) + 1
  const out = ls.map(l => {
    const k = `${l.cambioId}:${l.indice}`
    if (numeros[k] == null) numeros[k] = siguiente++
    return { ...l, numero: numeros[k] }
  })
  for (const [k, n] of Object.entries(previo)) if (!vivos.has(k)) numeros[k] = n // se recuerdan para no reusarlos
  return { llamadas: out.sort((a, b) => a.numero - b.numero), numeros }
}

/** Un clip de media cualquiera de la línea de tiempo con su tramo en tiempo de corte. */
interface ClipEnPista { clip: ClipMedio; pista: string; corte: TramoT }
const clipsMedia = (t: Timeline): ClipEnPista[] => t.tracks.flatMap(p => p.clips.filter((c): c is ClipMedio => c.kind === 'media').map(c => ({ clip: c, pista: p.id, corte: tramoCorte(c) })))

/**
 * Arrastrar un borde de lo rojo (como la sala vieja). `borde` = 'inicio' (el final de la pieza de antes, en la toma) o
 * 'fin' (el principio de la pieza de después). Mover hacia adentro de lo rojo DEVUELVE material (abre hueco en todas las
 * pistas y alarga los clips que tocan esa unión: cámara y pantalla juntas); mover hacia afuera CORTA más (rippleDelete).
 */
export function moverBorde(t: Timeline, ps: Pieza[], rojo: TramoT, borde: 'inicio' | 'fin', nuevo: number, fps: number): Edicion | null {
  const cuadro = 1 / fps
  if (borde === 'inicio') {
    const p = ps.find(x => Math.abs(x.fuente.end - rojo.start) < 0.002)
    if (!p) return null
    const n = alCuadro(Math.min(Math.max(nuevo, p.fuente.start + cuadro), rojo.end), fps)
    const d = n - p.fuente.end
    if (Math.abs(d) < cuadro / 2) return null
    if (d < 0) {
      const a = p.corte.start + (n - p.fuente.start) / p.velocidad
      return { ops: [{ op: 'rippleDelete', start: a, end: p.corte.end }], descripcion: `Corte más largo: el borde izquierdo pasa a ${formato(n, fps)} (a mano)` }
    }
    const en = p.corte.end
    const ops: Op[] = [{ op: 'rippleInsertGap', at: en, duration: d / p.velocidad }]
    for (const c of clipsMedia(t)) if (Math.abs(c.corte.end - en) < 0.002) ops.push({ op: 'updateClip', clipId: c.clip.id, patch: { sourceOut: c.clip.sourceOut + d * ((c.clip.speed || 1) / p.velocidad) } })
    return { ops, descripcion: `Devolví ${(d).toFixed(2)} s al final de la pieza (borde izquierdo a ${formato(n, fps)}, a mano)` }
  }
  const p = ps.find(x => Math.abs(x.fuente.start - rojo.end) < 0.002)
  if (!p) return null
  const n = alCuadro(Math.max(Math.min(nuevo, p.fuente.end - cuadro), rojo.start), fps)
  const d = p.fuente.start - n
  if (Math.abs(d) < cuadro / 2) return null
  if (d < 0) {
    const b = p.corte.start + (n - p.fuente.start) / p.velocidad
    return { ops: [{ op: 'rippleDelete', start: p.corte.start, end: b }], descripcion: `Corte más largo: el borde derecho pasa a ${formato(n, fps)} (a mano)` }
  }
  const en = p.corte.start
  const ops: Op[] = [{ op: 'rippleInsertGap', at: en, duration: d / p.velocidad }]
  for (const c of clipsMedia(t)) if (Math.abs(c.corte.start - en) < 0.002) ops.push({ op: 'updateClip', clipId: c.clip.id, patch: { timelineIn: en, sourceIn: c.clip.sourceIn - d * ((c.clip.speed || 1) / p.velocidad) } })
  return { ops, descripcion: `Devolví ${d.toFixed(2)} s al principio de la pieza (borde derecho a ${formato(n, fps)}, a mano)` }
}

/** Rechazar un corte aplicado: devolver todo lo rojo (el borde izquierdo hasta el final del rojo). */
export const devolverCorte = (t: Timeline, ps: Pieza[], rojo: TramoT, fps: number) => {
  const e = moverBorde(t, ps, rojo, 'inicio', rojo.end, fps) ?? moverBorde(t, ps, rojo, 'fin', rojo.start, fps)
  return e && { ...e, descripcion: `Devolví el corte ${formato(rojo.start)}–${formato(rojo.end)} (rechazado a mano)` }
}

/** ¿El instante cae DENTRO de una palabra que suena? (el borde de un corte ahí se oye). */
export function palabraCortada(palabras: { text: string; start: number; end: number }[], t: number, margen = 0.03): string | null {
  const w = palabras.find(x => t > x.start + margen && t < x.end - margen)
  return w ? w.text.trim() : null
}

/** A/D sobre un clip de otra pista (gráfico, subtítulo, música…): recorta ese clip hasta el playhead, sin mover lo demás. */
export function recortarClip(c: Clip, t: number, lado: 'izquierda' | 'derecha', fps: number): Edicion | null {
  const r = tramoCorte(c), at = alCuadro(t, fps)
  if (at <= r.start + 1 / fps - EPS || at >= r.end - 1 / fps + EPS) return null
  const nombre = c.kind === 'caption' ? `«${c.text.slice(0, 24)}»` : `«${c.label ?? c.id}»`
  if (c.kind === 'media') {
    const v = c.speed && c.speed > 0 ? c.speed : 1
    const patch = lado === 'izquierda' ? { timelineIn: at, sourceIn: c.sourceIn + (at - c.timelineIn) * v } : { sourceOut: c.sourceIn + (at - c.timelineIn) * v }
    return { ops: [{ op: 'updateClip', clipId: c.id, patch }], descripcion: `Recortar ${nombre} ${lado === 'izquierda' ? '←' : '→'} hasta ${formato(at, fps)} (a mano)` }
  }
  const patch = lado === 'izquierda' ? { timelineIn: at } : { timelineOut: at }
  return { ops: [{ op: 'updateClip', clipId: c.id, patch }], descripcion: `Recortar ${nombre} ${lado === 'izquierda' ? '←' : '→'} hasta ${formato(at, fps)} (a mano)` }
}

/** Rechazar una pieza colocada (una lámina, una música, un SFX): sale sola, lo demás se queda. */
export const quitarPieza = (c: Clip): Edicion => ({ ops: [{ op: 'removeClip', clipId: c.id }], descripcion: `Rechacé la pieza ${c.kind === 'caption' ? `«${c.text.slice(0, 24)}»` : `«${c.label ?? c.id}»`}` })

/** Las ediciones aplicadas que se pueden revisar: cada corte en rojo (con la razón del pase que lo hizo, si se encuentra). */
export interface EdicionAplicada { clave: string; tipo: 'corte' | 'pieza'; tramo: TramoT; nota: string; cambioId?: string; spot?: number; hilo?: string; clipId?: string }

export function edicionesAplicadas(cortesToma: TramoT[], razones: { cambioId: string; hilo?: string; indice: number; nota: string; toma: TramoT }[], piezasOtras: { clip: Clip; toma: TramoT[]; clase: string }[]): EdicionAplicada[] {
  const cortesL: EdicionAplicada[] = cortesToma.map(r => {
    const m = razones.find(x => x.toma.start < r.end - 0.05 && x.toma.end > r.start + 0.05)
    return { clave: `corte:${r.start.toFixed(2)}`, tipo: 'corte', tramo: r, nota: m?.nota ?? 'Cortado', cambioId: m?.cambioId, spot: m?.indice, hilo: m?.hilo }
  })
  const piezasL: EdicionAplicada[] = piezasOtras.filter(p => p.toma.length).map(p => ({ clave: `pieza:${p.clip.id}`, tipo: 'pieza', tramo: { start: p.toma[0].start, end: p.toma[p.toma.length - 1].end },
    nota: `${p.clase}: ${p.clip.kind === 'caption' ? p.clip.text : p.clip.label ?? p.clip.id}`, clipId: p.clip.id }))
  return [...cortesL, ...piezasL].sort((a, b) => a.tramo.start - b.tramo.start)
}
