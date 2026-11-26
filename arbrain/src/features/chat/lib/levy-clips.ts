// Clips de la cara completa para ESCUCHAR y PENSAR (18-19 nov 2026, encargo C). LivePortrait no cabe en tiempo real en el
// Studio (2,5 cps medidos contra 25 necesarios: labs/levy-live-como-youtube-2026-11-18/B-LIVEPORTRAIT.md), así que estos
// momentos van horneados: el retrato oficial movido con el campo de LivePortrait (cabeza, mejillas, cejas, párpados, mirada),
// cuadro por cuadro, en un MP4 con color y opacidad lado a lado. Al hablar manda el rig con el atlas de la boca.
//
// Regla firmada (4 oct): nada doble. Por eso NUNCA se funden el clip y el rig. Cada clip sale de la pose neutra y vuelve a ella
// entre gesto y gesto; en los tramos neutros el clip ES el retrato, píxel por píxel, igual que el rig en reposo. El cambio
// clip ↔ rig es un corte en un cuadro neutro: dos imágenes iguales. Si hay que salir a media pose (llega la voz), el clip
// avanza a 4× hasta su siguiente tramo neutro (≤ 0,4 s; la voz local tarda 0,45-0,8 s en sonar desde que se encarga).
//
// Recursos: public/levy-face/medio/clips/{escuchar,pensar}.mp4 y clips.json, horneados con
// labs/levy-live-como-youtube-2026-11-18/scripts/clips_{controles,hornear}.py.

export type NombreClip = 'escuchar' | 'pensar'
export type Clip = { cuadros: number; cps: number; neutros: [number, number][]; archivo: string; lado: number }
export type Manifiesto = Record<NombreClip, Clip>
export const CLIPS_URL = '/levy-face/medio/clips'
/** Velocidad para volver a neutro cuando hay que salir a media pose. */
export const VELOCIDAD_SALIDA = 4
/** Pensar puede durar minutos (herramientas): tras estas vueltas el clip sale en su siguiente neutro y deja este descanso al pensar
 *  del rig (mirada que se va, ceja que duda) antes de volver; un bucle de 8 s repetido sin fin se nota. */
export const VUELTAS_MAX = 2
export const DESCANSO_MS = 12_000

export function esNeutro(c: Clip, f: number): boolean {
  return c.neutros.some(([a, b]) => f >= a && f <= b)
}

/** El primer cuadro neutro en o después de `f`; si no queda ninguno, el principio del ciclo (cuadro 0, que es neutro). */
export function siguienteNeutro(c: Clip, f: number): number {
  for (const [a, b] of c.neutros) if (f <= b) return Math.max(a, f)
  return c.cuadros
}

/** ¿Qué clip toca? Ninguno mientras haya voz sonando, encargada o recién terminada: ahí manda el rig con la boca. */
export function clipDeseado(o: { estado: string; vozActiva: boolean }): NombreClip | null {
  if (o.vozActiva) return null
  return o.estado === 'listening' ? 'escuchar' : o.estado === 'thinking' ? 'pensar' : null
}

type Fase = 'quieto' | 'entrando' | 'corriendo' | 'saliendo'
export type VideoConCuadros = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number }

const VERT = `#version 300 es
in vec2 p; out vec2 v;
void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`
// color a la izquierda, opacidad a la derecha; sale premultiplicado como el rig (capas.mate)
const FRAG = `#version 300 es
precision mediump float;
in vec2 v; uniform sampler2D t; out vec4 o;
void main() { vec2 uv = vec2(v.x * 0.5, v.y); vec3 c = texture(t, uv).rgb; float a = texture(t, uv + vec2(0.5, 0.0)).r; o = vec4(c * a, a); }`

/** Pinta en `canvas` un cuadro de video con color y opacidad lado a lado (premultiplicado, como el rig con capas.mate). */
export function crearPintor(canvas: HTMLCanvasElement): { pintar: (v: HTMLVideoElement) => void; soltar: () => void } {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) throw new Error('WebGL2 no disponible')
  const sh = (tipo: number, src: string) => { const s = gl.createShader(tipo)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog)
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  return {
    pintar: (v) => { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v); gl.drawArrays(gl.TRIANGLES, 0, 3) },
    soltar: () => { try { gl.getExtension('WEBGL_lose_context')?.loseContext() } catch { /* ya se fue */ } },
  }
}

/** Un video escondido en el DOM (WebKit no decodifica cuadros de un video suelto), mudo y en línea. */
export function videoEscondido(src: string, contenedor: HTMLElement, loop: boolean): VideoConCuadros {
  const v = document.createElement('video') as VideoConCuadros
  v.src = src; v.muted = true; v.playsInline = true; v.loop = loop; v.preload = 'auto'
  v.setAttribute('aria-hidden', 'true')
  Object.assign(v.style, { position: 'absolute', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' })
  contenedor.appendChild(v)
  return v
}

/** Reproduce los clips en su lienzo (encima del rig, en la misma caja de la cabeza) y decide cuándo se ven. */
export class ClipsVivos {
  private pintor: ReturnType<typeof crearPintor>
  private videos: Partial<Record<NombreClip, VideoConCuadros>> = {}
  private fase: Fase = 'quieto'
  private actual: NombreClip | null = null
  private vueltas = 0
  private descansoHasta = 0
  private visible = false
  private vivo = true
  /** Cuadro del clip que se ve (para el banco de pruebas y la salida). */
  cuadro = 0
  /** Cambios de visibilidad: true = se ve el clip y se esconde el rig; false = al revés. Siempre en un cuadro neutro. */
  onVisible: ((v: boolean) => void) | null = null
  /** Registro de cortes (banco de pruebas): [ms, clip, cuadro, entra|sale]. */
  cortes: [number, NombreClip, number, 'entra' | 'sale'][] = []

  constructor(canvas: HTMLCanvasElement, private manifiesto: Manifiesto, contenedor: HTMLElement, base = CLIPS_URL) {
    this.pintor = crearPintor(canvas)
    for (const nombre of ['escuchar', 'pensar'] as NombreClip[]) this.videos[nombre] = videoEscondido(`${base}/${manifiesto[nombre].archivo}`, contenedor, true)
  }

  /** Cada cuadro del rig: qué clip toca y si el rig está quieto (sin parpadeo a medias) para poder entrar. */
  pedir(nombre: NombreClip | null, rigQuieto: boolean): void {
    if (!this.vivo) return
    if (this.fase === 'quieto') { if (nombre && rigQuieto && performance.now() >= this.descansoHasta) this.entrar(nombre); return }
    if (this.fase === 'entrando') { if (nombre !== this.actual) this.cancelar(); return }
    if (this.fase === 'corriendo' && nombre !== this.actual) {
      const c = this.manifiesto[this.actual!]
      if (esNeutro(c, this.cuadro)) this.salir()
      else { this.fase = 'saliendo'; const v = this.videos[this.actual!]; if (v) v.playbackRate = VELOCIDAD_SALIDA }
    }
  }

  /** Pausa todo (ventana oculta); al volver, el rig decide de nuevo. */
  dormir(): void { if (this.fase !== 'quieto') { this.salir(); } }

  get viendo(): NombreClip | null { return this.visible ? this.actual : null }
  /** Hay un clip entrando, corriendo o volviendo a neutro: el rig se queda en la pose del retrato. */
  get ocupado(): boolean { return this.fase !== 'quieto' }
  /** Descanso tras VUELTAS_MAX vueltas: el rig hace su propio gesto hasta que vuelva el clip. */
  get descansando(): boolean { return performance.now() < this.descansoHasta }

  private entrar(nombre: NombreClip) {
    const v = this.videos[nombre]; if (!v) return
    this.fase = 'entrando'; this.actual = nombre; this.cuadro = 0; this.vueltas = 0
    v.playbackRate = 1
    try { v.currentTime = 0 } catch { /* aún sin metadatos */ }
    const alCuadro = (_: number, meta: { mediaTime: number }) => {
      if (!this.vivo || this.actual !== nombre || this.fase === 'quieto') return
      const c = this.manifiesto[nombre]
      const f = Math.min(c.cuadros - 1, Math.max(0, Math.round(meta.mediaTime * c.cps)))
      if (f < this.cuadro - c.cuadros / 2 && this.fase === 'corriendo' && ++this.vueltas >= VUELTAS_MAX) {
        // dio la vuelta (el bucle volvió al principio): basta de este clip por un rato; sale en el neutro donde está (el cuadro 0)
        this.descansoHasta = performance.now() + DESCANSO_MS; this.fase = 'saliendo'
      }
      this.cuadro = f
      this.pintar(v)
      if (this.fase === 'entrando') {
        if (!esNeutro(c, f)) { this.cancelar(); return }          // por seguridad: solo se entra en un cuadro neutro
        this.fase = 'corriendo'; this.mostrar(true, nombre, f)
      } else if (this.fase === 'saliendo' && esNeutro(c, f)) { this.salir(); return }
      v.requestVideoFrameCallback?.(alCuadro)
    }
    if (!v.requestVideoFrameCallback) { this.cancelar(); return }  // sin cuadros sincronizados no hay corte limpio: se queda el rig
    v.requestVideoFrameCallback(alCuadro)
    void v.play().catch(() => this.cancelar())
  }

  private salir() {
    const nombre = this.actual
    if (nombre) { const v = this.videos[nombre]; v?.pause(); if (v) v.playbackRate = 1 }
    if (this.visible && nombre) this.mostrar(false, nombre, this.cuadro)
    this.fase = 'quieto'; this.actual = null
  }

  private cancelar() {
    const v = this.actual ? this.videos[this.actual] : undefined
    v?.pause()
    if (this.visible && this.actual) this.mostrar(false, this.actual, this.cuadro)
    this.fase = 'quieto'; this.actual = null
  }

  private mostrar(v: boolean, nombre: NombreClip, f: number) {
    this.visible = v
    this.cortes.push([Math.round(performance.now()), nombre, f, v ? 'entra' : 'sale'])
    if (this.cortes.length > 200) this.cortes.shift()
    this.onVisible?.(v)
  }

  private pintar(v: HTMLVideoElement) { this.pintor.pintar(v) }

  dispose() {
    this.vivo = false
    for (const v of Object.values(this.videos)) { if (!v) continue; v.pause(); v.removeAttribute('src'); v.load(); v.remove() }
    this.pintor.soltar()
  }
}
