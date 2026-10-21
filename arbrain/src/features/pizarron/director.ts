/**
 * El director del pizarrón (7 oct 2026): lleva el reloj. Toma los pasos que Levy escribió, pide su voz (con el tiempo
 * de cada carácter) antes de que haga falta, la reproduce y manda cada acotación al escenario en la palabra exacta.
 * Congela para predecir, anota cada gesto del alumno y despierta a Levy en el chat cuando hace falta su respuesta.
 *
 * Sin React: la vista (VistaPizarron.tsx) lo crea, le pasa el iframe y pinta su estado.
 */
import { partirVoz, type Marca, type Segmento, type Tramo } from './marcas'
import { mensajeDeRespuesta, type EstadoSesion, type Evento, type Gesto, type ModoPrediccion, type Paso } from './modelo'

export type Fase = 'cargando' | 'hablando' | 'esperando-gesto' | 'prediciendo' | 'esperando-levy' | 'pausado' | 'cerrada' | 'reproduciendo' | 'fin-reproduccion'
export interface EstadoDirector {
  fase: Fase; paso: string | null; pasos: number; hechos: number
  velocidad: number; silencio: boolean; subtitulos: boolean; lapiz: boolean
  aviso: string | null; espera: string | null; sinVoz: boolean
}
interface VozLista { url: string; alin: { c: string[]; s: number[]; e: number[] } }

const VELOCIDADES = [1, 1.15, 1.3, 1.5, 1.75]

/** El tiempo del director. En vivo es el de la página; para exportar video, uno virtual que se avanza cuadro a cuadro. */
export interface Reloj { ahora(): number; dormir(ms: number): Promise<void>; cuadro(f: () => void): void; virtual?: boolean }
export const relojReal: Reloj = { ahora: () => performance.now(), dormir: ms => new Promise(r => setTimeout(r, ms)), cuadro: f => { requestAnimationFrame(f) } }
export class RelojVirtual implements Reloj {
  virtual = true
  private t = 0
  private esperas: { hasta: number; r: () => void }[] = []
  private cuadros: (() => void)[] = []
  ahora() { return this.t }
  dormir(ms: number) { return new Promise<void>(r => this.esperas.push({ hasta: this.t + ms, r })) }
  cuadro(f: () => void) { this.cuadros.push(f) }
  /** Avanza dt milisegundos: despierta lo que vencía y corre una vez cada cuadro pedido. */
  async avanzar(dt: number) {
    this.t += dt
    const listas = this.esperas.filter(e => e.hasta <= this.t); this.esperas = this.esperas.filter(e => e.hasta > this.t)
    listas.forEach(e => e.r())
    const fs = this.cuadros.splice(0); fs.forEach(f => f())
    await new Promise(r => setTimeout(r, 0)) // deja correr las promesas que despertaron
  }
}
/** Lo que el exportador mezcla: cada tramo de voz con su instante en la línea de tiempo virtual. */
export interface Pista { url: string; inicioMs: number; velocidad: number }

export class Director {
  private marco: Window | null = null
  private listo = false
  private pendientes: unknown[] = []
  private sesion: EstadoSesion | null = null
  private cola: Paso[] = []
  private conocidos = new Set<string>()
  private corriendo = false
  private vivo = true
  private vozCache = new Map<string, Promise<VozLista | null>>()
  private audio: HTMLAudioElement | null = null
  private pausaHasta: Promise<void> | null = null
  private soltarPausa: (() => void) | null = null
  private esperaGesto: { que: string; listo: () => void } | null = null
  private esperaRespuesta: ((r: { modo: ModoPrediccion; valor: unknown; png?: string | null } | null) => void) | null = null
  private inicioPaso = 0
  private pasoActual: string | null = null
  private bufferEventos: Record<string, unknown>[] = []
  private ultimoGesto = new Map<string, number>()
  private tFlush: ReturnType<typeof setTimeout> | null = null
  modoReproduccion = false
  private reloj: Reloj
  /** Para exportar: los tramos de voz que sonaron y cuándo. */
  pistas: Pista[] = []
  e: EstadoDirector

  constructor(private o: {
    sesionId: string
    alEstado: (e: EstadoDirector) => void
    enviarChat: (texto: string) => void
    anotar: (eventos: Record<string, unknown>[]) => Promise<void>
    pedirVoz: (texto: string) => Promise<VozLista | null>
    reloj?: Reloj
  }) {
    this.reloj = o.reloj ?? relojReal
    const guardada = (() => { try { return JSON.parse(localStorage.getItem('arbrain.pizarron.prefs') ?? '{}') as Partial<EstadoDirector> } catch { return {} } })()
    this.e = { fase: 'cargando', paso: null, pasos: 0, hechos: 0, velocidad: guardada.velocidad ?? 1, silencio: guardada.silencio ?? false, subtitulos: guardada.subtitulos ?? true, lapiz: false, aviso: null, espera: null, sinVoz: false }
  }

  // ── estado ──
  private fijar(p: Partial<EstadoDirector>) {
    this.e = { ...this.e, ...p }
    try { localStorage.setItem('arbrain.pizarron.prefs', JSON.stringify({ velocidad: this.e.velocidad, silencio: this.e.silencio, subtitulos: this.e.subtitulos })) } catch { /* sin almacenamiento */ }
    this.o.alEstado(this.e)
  }

  // ── escenario ──
  conectar(w: Window | null) { this.marco = w; this.listo = false }
  /** Todo lo que cambió el pizarrón, en orden: si el escenario renace (el iframe se recargó), se rehace al instante. */
  private historial: { tipo: string; datos: Record<string, unknown> }[] = []
  private yaHuboListo = false
  private congelado: Record<string, unknown> | null = null
  private post(tipo: string, datos: Record<string, unknown> = {}) {
    if (tipo === 'reiniciar') this.historial = []
    else if (['objeto', 'imagen', 'paso', 'marca', 'trazos', 'gesto', 'entintar', 'lapiz'].includes(tipo)) { this.historial.push({ tipo, datos }); if (this.historial.length > 6000) this.historial.splice(0, 1000) }
    if (tipo === 'congelar') this.congelado = datos
    if (tipo === 'descongelar') this.congelado = null
    const m = { pz: 1, tipo, ...datos }
    if (!this.listo || !this.marco) { this.pendientes.push(m); return }
    this.marco.postMessage(m, '*')
  }
  recibir(m: { tipo: string; [k: string]: unknown }) {
    if (m.tipo === 'listo') {
      // Un segundo «listo» = el escenario renació vacío: se le rehace todo lo vivido, al instante, y se sigue.
      if (this.yaHuboListo) {
        this.listo = true
        const w = this.marco
        w?.postMessage({ pz: 1, tipo: 'iniciar', luz: this.sesion?.sesion.luz ?? 'papel', subtitulos: this.e.subtitulos, virtual: !!this.reloj.virtual }, '*')
        for (const h of this.historial) w?.postMessage({ pz: 1, tipo: h.tipo, ...h.datos, ...(h.tipo === 'paso' || h.tipo === 'marca' ? { instantaneo: true } : {}) }, '*')
        if (this.congelado) w?.postMessage({ pz: 1, tipo: 'congelar', ...this.congelado }, '*')
        this.pendientes = []
        return
      }
      this.listo = true; this.yaHuboListo = true
      this.marco?.postMessage({ pz: 1, tipo: 'iniciar', luz: this.sesion?.sesion.luz ?? 'papel', subtitulos: this.e.subtitulos, virtual: !!this.reloj.virtual }, '*')
      for (const p of this.pendientes.splice(0)) this.marco?.postMessage(p, '*')
      return
    }
    if (m.tipo === 'cuadro') { const r = this.ackCuadro; this.ackCuadro = null; r?.(); return }
    if (m.tipo === 'gesto') return this.gesto(m.gesto as Gesto)
    if (m.tipo === 'respuesta') { const r = this.esperaRespuesta; this.esperaRespuesta = null; r?.({ modo: m.modo as ModoPrediccion, valor: m.valor, png: m.png as string | null }); return }
    if (m.tipo === 'error') { this.anotar({ tipo: 'error', donde: String(m.donde).slice(0, 200), mensaje: String(m.mensaje).slice(0, 800) }); this.fijar({ aviso: `${m.donde}: ${m.mensaje}`.slice(0, 220) }); return }
    if (m.tipo === 'declarado' && !this.modoReproduccion) this.anotar({ tipo: 'declarado', el: m.el, objeto: m.objeto, params: m.params, anclas: m.anclas, metodos: m.metodos })
  }

  private gesto(g: Gesto) {
    if (this.modoReproduccion) return
    // Arrastrar genera decenas de cambios por segundo: se anotan ~8 por segundo por parámetro, siempre el último.
    const clave = g.tipo === 'param' ? `${g.el}.${g.param}` : g.tipo === 'evento' ? `${g.el}:${g.evento}` : g.id
    const ahora = this.reloj.ahora()
    if (g.tipo === 'param' && ahora - (this.ultimoGesto.get(clave) ?? 0) < 120) { this.ultimoGesto.set(clave + ':pend', ahora); this.pendienteGesto.set(clave, g); this.programarUltimo(clave); return }
    this.ultimoGesto.set(clave, ahora)
    this.anotar({ tipo: 'gesto', gesto: g, paso: this.pasoActual, rel: Math.round(ahora - this.inicioPaso) })
    const esp = this.esperaGesto
    if (esp) {
      const [el, que] = esp.que.split('.')
      const cumple = (g.tipo === 'param' && g.el === el && (!que || g.param === que)) || (g.tipo === 'evento' && g.el === el && (!que || g.evento === que))
      if (cumple) { this.esperaGesto = null; setTimeout(esp.listo, 700) }
    }
  }
  private pendienteGesto = new Map<string, Gesto>()
  private tPend = new Map<string, ReturnType<typeof setTimeout>>()
  private programarUltimo(clave: string) {
    if (this.tPend.has(clave)) return
    this.tPend.set(clave, setTimeout(() => { this.tPend.delete(clave); const g = this.pendienteGesto.get(clave); if (g) { this.pendienteGesto.delete(clave); this.ultimoGesto.set(clave, 0); this.gesto(g) } }, 130))
  }

  private anotar(e: Record<string, unknown>) {
    if (this.modoReproduccion) return
    this.bufferEventos.push(e)
    if (this.tFlush) return
    this.tFlush = setTimeout(() => { this.tFlush = null; const lote = this.bufferEventos.splice(0); if (lote.length) void this.o.anotar(lote).catch(() => { this.bufferEventos.unshift(...lote) }) }, 350)
  }

  // ── sesión ──
  /** Primera carga: lo ya visto se reconstruye al instante; lo nuevo se reproduce con voz. */
  cargar(s: EstadoSesion) {
    this.sesion = s
    this.registrarRecursos(s)
    const vistos = new Set(s.eventos.filter(e => e.tipo === 'fin-paso').map(e => (e as { paso: string }).paso))
    const respuestas = new Map<string, Extract<Evento, { tipo: 'respuesta' }>>()
    for (const e of s.eventos) if (e.tipo === 'respuesta') respuestas.set(e.paso, e)
    // Los gestos vuelven en SU paso: lo que Levy movió después de un gesto manda sobre él (como pasó en vivo).
    const porPaso = new Map<string, Evento[]>(), sueltos: Evento[] = []
    for (const e of s.eventos) if (e.tipo === 'gesto') { const pid = (e as Evento & { paso?: string }).paso; if (pid) { if (!porPaso.has(pid)) porPaso.set(pid, []); porPaso.get(pid)!.push(e) } else sueltos.push(e) }
    let i = 0
    for (; i < s.sesion.pasos.length; i++) {
      const p = s.sesion.pasos[i]
      if (!vistos.has(p.id)) break
      this.conocidos.add(p.id)
      this.restaurarPaso(p, respuestas.get(p.id))
      this.restaurarGestos(porPaso.get(p.id) ?? [])
    }
    this.restaurarGestos(sueltos)
    for (; i < s.sesion.pasos.length; i++) { this.conocidos.add(s.sesion.pasos[i].id); this.cola.push(s.sesion.pasos[i]) }
    if (s.sesion.cierre) this.post('entintar')
    this.fijar({ pasos: s.sesion.pasos.length, hechos: vistos.size, fase: this.cola.length ? 'hablando' : s.sesion.cierre ? 'cerrada' : 'esperando-levy' })
    this.precargar()
    void this.correr()
  }
  /** Sondeo: Levy escribió pasos nuevos (o cerró la sesión). */
  actualizar(s: EstadoSesion) {
    const antes = this.sesion
    this.sesion = s
    this.registrarRecursos(s)
    for (const p of s.sesion.pasos) if (!this.conocidos.has(p.id)) { this.conocidos.add(p.id); if (!this.modoReproduccion) this.cola.push(p) }
    if (s.sesion.cierre && !antes?.sesion.cierre) this.post('entintar')
    this.fijar({ pasos: s.sesion.pasos.length, ...(s.sesion.cierre && !this.cola.length && !this.corriendo ? { fase: 'cerrada' } : {}) })
    this.precargar()
    if (!this.modoReproduccion) void this.correr()
  }
  private registrarRecursos(s: EstadoSesion) {
    for (const [id, o] of Object.entries(s.objetos)) this.post('objeto', { id, codigo: o.codigo, ficha: o.ficha })
    for (const [id, im] of Object.entries(s.imagenes)) this.post('imagen', { id, url: im.url, ancho: im.ancho, alto: im.alto })
  }
  private restaurarPaso(p: Paso, respuesta?: Extract<Evento, { tipo: 'respuesta' }>) {
    this.post('paso', { paso: p, instantaneo: true })
    const marcas = (voz?: string) => { for (const s of voz ? partirVoz(voz).segmentos : []) if (s.tipo === 'voz') for (const m of s.marcas) this.post('marca', { marca: m.marca, instantaneo: true }) }
    marcas(p.voz)
    if (respuesta && p.predice?.revela) marcas(p.predice.revela)
  }
  private restaurarGestos(eventos: Evento[]) {
    const ultimos = new Map<string, Gesto>(), trazos: Gesto[] = []
    for (const e of eventos) if (e.tipo === 'gesto') { const g = e.gesto; if (g.tipo === 'param') ultimos.set(`${g.el}.${g.param}`, g); if (g.tipo === 'trazo') trazos.push(g) }
    if (trazos.length) this.post('trazos', { trazos })
    for (const g of ultimos.values()) this.post('gesto', { gesto: g })
  }

  // ── voz ──
  private precargar() {
    const tramos: string[] = []
    for (const p of this.cola) for (const v of [p.voz, p.predice?.revela]) for (const s of v ? partirVoz(v).segmentos : []) if (s.tipo === 'voz' && s.hablado.trim()) tramos.push(s.hablado)
    // De dos en dos, en orden: lo siguiente que se va a decir llega primero.
    let i = 0
    const siguiente = () => { while (i < tramos.length && this.vozCache.has(tramos[i])) i++; if (i >= tramos.length) return; const t = tramos[i++]; void this.obtenerVoz(t).finally(siguiente) }
    siguiente(); siguiente()
  }
  private obtenerVoz(texto: string) {
    let p = this.vozCache.get(texto)
    if (!p) {
      // Un tropiezo de la voz (límite de concurrencia, red) se reintenta; un fallo no se queda en la caché.
      p = (async () => { for (let i = 0; i < 3; i++) { const v = await this.o.pedirVoz(texto).catch(() => null); if (v) return v; await new Promise(r => setTimeout(r, 900 * (i + 1))) } return null })()
      this.vozCache.set(texto, p)
      void p.then(v => { if (!v) this.vozCache.delete(texto) })
    }
    return p
  }

  // ── el bucle ──
  private async correr() {
    if (this.corriendo || !this.vivo) return
    this.corriendo = true
    try {
      while (this.cola.length && this.vivo) {
        const p = this.cola.shift()!
        await this.reproducirPaso(p)
      }
    } finally { this.corriendo = false }
    if (!this.vivo) return
    if (this.modoReproduccion) { this.fijar({ fase: 'fin-reproduccion', paso: null }); this.post('camara', { accion: 'todo' }); return }
    this.fijar({ fase: this.sesion?.sesion.cierre ? 'cerrada' : 'esperando-levy', paso: null, espera: null })
  }

  private async reproducirPaso(p: Paso, grabado?: { respuesta?: Extract<Evento, { tipo: 'respuesta' }>; gestos: { rel: number; gesto: Gesto }[] }) {
    this.pasoActual = p.id; this.inicioPaso = this.reloj.ahora()
    this.fijar({ fase: this.modoReproduccion ? 'reproduciendo' : 'hablando', paso: p.id, aviso: null })
    this.anotar({ tipo: 'inicio-paso', paso: p.id })
    this.post('paso', { paso: p, instantaneo: false })
    // En la reproducción, los gestos del alumno vuelven a su momento dentro del paso.
    let pasoVivo = true
    if (grabado) for (const g of grabado.gestos) void this.reloj.dormir(g.rel / this.e.velocidad).then(() => { if (pasoVivo) this.post('gesto', { gesto: g.gesto }) })
    await this.hablarTodo(p.voz)
    if (!this.vivo) return
    if (p.predice && this.vivo) {
      this.fijar({ fase: 'prediciendo' })
      this.post('congelar', { pasoId: p.id, pregunta: p.predice.pregunta, modo: p.predice.modo, en: p.predice.en, pista: p.predice.pista })
      let r: { modo: ModoPrediccion; valor: unknown; png?: string | null } | null
      if (grabado?.respuesta) { await this.reloj.dormir(1600); r = { modo: grabado.respuesta.modo, valor: grabado.respuesta.valor }; this.post('descongelar') }
      // Reproduciendo una predicción que nadie contestó: se ve la pregunta un momento y sigue (no espera para siempre).
      else if (grabado) { await this.reloj.dormir(2200); r = null; this.post('descongelar') }
      else r = await new Promise(res => { this.esperaRespuesta = res })
      // Si el pizarrón se desmontó esperando, el paso NO se vio: no se anota (al volver se repite).
      if (!this.vivo) return
      if (r && !this.modoReproduccion) {
        this.anotar({ tipo: 'respuesta', paso: p.id, modo: r.modo, valor: r.valor, ...(r.png ? { foto: r.png } : {}) })
        this.o.enviarChat(mensajeDeRespuesta(this.o.sesionId, this.sesion?.sesion.tema ?? '', p.id, r.modo, r.valor))
      }
      if (p.predice.revela) { this.fijar({ fase: this.modoReproduccion ? 'reproduciendo' : 'hablando' }); await this.hablarTodo(p.predice.revela) }
    }
    pasoVivo = false
    if (!this.vivo) return
    this.anotar({ tipo: 'fin-paso', paso: p.id })
    this.fijar({ hechos: this.e.hechos + 1 })
  }

  private async hablarTodo(voz?: string) {
    if (!voz) return
    const { segmentos } = partirVoz(voz)
    for (const s of segmentos) { if (!this.vivo) return; await this.segmento(s) }
    this.post('subtitulo', { texto: null })
  }
  private async segmento(s: Segmento) {
    await this.puerta()
    if (s.tipo === 'pausa') { await this.reloj.dormir((s.segundos * 1000) / this.e.velocidad); return }
    if (s.tipo === 'espera') {
      if (this.modoReproduccion) { await this.reloj.dormir(1200); return }
      this.fijar({ fase: 'esperando-gesto', espera: s.marca.texto ?? 'Tu turno: muévelo tú' })
      if (s.marca.texto) this.post('subtitulo', { texto: s.marca.texto, hasta: s.marca.texto.length })
      await new Promise<void>(res => { this.esperaGesto = { que: s.que, listo: res } })
      this.fijar({ fase: 'hablando', espera: null })
      return
    }
    await this.hablar(s)
  }

  /** Un tramo hablado: el audio manda el reloj y cada acotación cae en su carácter. */
  private async hablar(s: Tramo) {
    const marcas = [...s.marcas].sort((a, b) => a.en - b.en)
    const frases = partirFrases(s.hablado)
    const disparar = (hasta: number, instantaneo = false) => { while (marcas.length && marcas[0].en <= hasta) this.post('marca', { marca: marcas.shift()!.marca, instantaneo }) }
    let ultimoSub = -1
    const sub = (k: number) => {
      const f = frases.find(x => k < x.fin) ?? frases[frases.length - 1]
      if (!f) return
      // Solo al cambiar de palabra: el subtítulo avanza por palabras, no por letras.
      const corte = s.hablado.indexOf(' ', k) < 0 ? s.hablado.length : s.hablado.indexOf(' ', k)
      if (corte === ultimoSub) return
      ultimoSub = corte
      this.post('subtitulo', { texto: s.hablado.slice(f.ini, f.fin).trim(), hasta: Math.max(0, corte - f.ini) })
    }
    if (!s.hablado.trim()) { disparar(Infinity); return }
    const voz = await this.obtenerVoz(s.hablado)
    if (!this.vivo) return
    // Sin voz para ESTE tramo (tras reintentar): solo este va con la voz del equipo; el siguiente vuelve a intentar la de Levy.
    if (!voz) { this.fijar({ sinVoz: true, aviso: 'Un tramo salió con la voz del equipo: la de Levy no respondió a tiempo.' }); await this.hablarDispositivo(s, disparar, sub); disparar(Infinity); return }
    if (this.e.sinVoz) this.fijar({ sinVoz: false, aviso: null })
    const tiempos = mapaTiempos(s.hablado, voz.alin)
    const fin = voz.alin.e.length ? voz.alin.e[voz.alin.e.length - 1] : 0
    if (this.reloj.virtual) {
      // Exportando: nada suena; el reloj virtual manda y el tramo queda anotado para la mezcla.
      const t0 = this.reloj.ahora()
      this.pistas.push({ url: voz.url, inicioMs: t0, velocidad: this.e.velocidad })
      await new Promise<void>(res => {
        const tic = () => {
          if (!this.vivo) return res()
          const t = ((this.reloj.ahora() - t0) / 1000) * this.e.velocidad
          let k = 0; while (k < tiempos.length && tiempos[k] <= t) k++
          disparar(k); sub(Math.max(0, k - 1))
          if (t >= fin + 0.05) return res()
          this.reloj.cuadro(tic)
        }
        tic()
      })
      disparar(Infinity); return
    }
    const a = this.audio ?? (this.audio = new Audio())
    a.src = voz.url; a.playbackRate = this.e.velocidad; a.muted = this.e.silencio
    ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
    let reloj: () => number = () => a.currentTime
    try { await a.play() }
    catch {
      // El navegador no dejó sonar (sin gesto previo): el reloj corre igual, en silencio, y se avisa.
      const t0 = performance.now(); reloj = () => ((performance.now() - t0) / 1000) * this.e.velocidad
      this.fijar({ aviso: 'Toca ▶ en la barra para oír a Levy (el navegador pidió un gesto).' })
    }
    await new Promise<void>(res => {
      let terminado = false
      const acabar = () => { if (terminado) return; terminado = true; a.onended = null; res() }
      a.onended = acabar
      const tic = () => {
        if (terminado || !this.vivo) { acabar(); return }
        if (this.e.fase === 'pausado') { requestAnimationFrame(tic); return }
        const t = reloj()
        let k = 0
        while (k < tiempos.length && tiempos[k] <= t) k++
        disparar(k)
        sub(Math.max(0, k - 1))
        if (t >= fin + 0.05 && (a.ended || a.paused)) { acabar(); return }
        requestAnimationFrame(tic)
      }
      requestAnimationFrame(tic)
    })
    disparar(Infinity)
  }

  /** Respaldo: la voz del equipo (Web Speech). Los límites de palabra mueven las acotaciones; sin ellos, el tiempo estimado. */
  private hablarDispositivo(s: Tramo, disparar: (k: number) => void, sub: (k: number) => void) {
    return new Promise<void>(res => {
      // Modo mudo (pruebas): nunca la voz del sistema, que sale por los altavoces aunque el navegador esté silenciado.
      const mudo = (() => { try { return localStorage.getItem('arbrain.pizarron.mudo') === '1' } catch { return false } })()
      const synth = typeof speechSynthesis !== 'undefined' && !mudo ? speechSynthesis : null
      const porTiempo = () => {
        const cps = 15 * this.e.velocidad, t0 = performance.now()
        const tic = () => { if (!this.vivo) return res(); const k = Math.floor(((performance.now() - t0) / 1000) * cps); disparar(k); sub(Math.min(k, s.hablado.length - 1)); if (k >= s.hablado.length) return res(); setTimeout(tic, 50) }
        tic()
      }
      if (!synth || this.e.silencio) return porTiempo()
      const u = new SpeechSynthesisUtterance(s.hablado)
      u.lang = 'es-MX'; u.rate = this.e.velocidad
      const v = synth.getVoices().find(x => /Juan|Paulina/i.test(x.name) && x.lang.startsWith('es')) ?? synth.getVoices().find(x => x.lang.startsWith('es'))
      if (v) u.voice = v
      u.onboundary = ev => { disparar(ev.charIndex + (ev.charLength || 1)); sub(ev.charIndex) }
      u.onend = () => res(); u.onerror = () => res()
      synth.speak(u)
    })
  }

  // ── pausa ──
  private puerta() { return this.pausaHasta ?? Promise.resolve() }
  alternarPausa() {
    if (this.e.fase === 'pausado') {
      this.soltarPausa?.(); this.pausaHasta = null; this.soltarPausa = null
      void this.audio?.play().catch(() => {})
      this.post('pausa', { activa: false })
      this.fijar({ fase: this.corriendo ? (this.modoReproduccion ? 'reproduciendo' : 'hablando') : 'esperando-levy', aviso: null })
      return
    }
    // Sonar por primera vez requiere un gesto: este clic lo es.
    if (this.audio && this.audio.paused && this.corriendo && this.e.aviso?.startsWith('Toca')) { void this.audio.play().catch(() => {}); this.fijar({ aviso: null }); return }
    this.pausaHasta = new Promise(r => { this.soltarPausa = r })
    this.audio?.pause()
    speechSynthesis?.cancel?.()
    this.post('pausa', { activa: true })
    this.fijar({ fase: 'pausado' })
  }
  velocidad() {
    const i = VELOCIDADES.indexOf(this.e.velocidad), v = VELOCIDADES[(i + 1) % VELOCIDADES.length]
    if (this.audio) this.audio.playbackRate = v
    this.fijar({ velocidad: v })
  }
  silencio() { const s = !this.e.silencio; if (this.audio) this.audio.muted = s; this.fijar({ silencio: s }) }
  subtitulos() { const s = !this.e.subtitulos; this.post('subtitulos', { activos: s }); this.fijar({ subtitulos: s }) }
  lapiz() { const l = !this.e.lapiz; this.post('lapiz', { activo: l }); this.fijar({ lapiz: l }) }
  verTodo() { this.post('camara', { accion: 'todo' }) }
  /** «Sigue»: suelta una espera de gesto o una predicción sin contestar. */
  seguir() {
    if (this.esperaGesto) { const e = this.esperaGesto; this.esperaGesto = null; e.listo(); return }
    if (this.esperaRespuesta) { const r = this.esperaRespuesta; this.esperaRespuesta = null; this.post('descongelar'); r(null) }
  }
  /** Le pasa al chat algo que el alumno dijo desde el pizarrón. */
  decir(texto: string) {
    const t = texto.trim(); if (!t) return
    this.anotar({ tipo: 'mensaje', texto: t })
    this.o.enviarChat(`✎ Pizarrón «${this.sesion?.sesion.tema ?? ''}» · ${this.pasoActual ?? 'inicio'}: ${t}`)
  }

  // ── exportar a video ──
  private ackCuadro: (() => void) | null = null
  /** El escenario pinta el instante tMs del reloj virtual y avisa cuando terminó (el exportador toma la foto después). */
  pintarCuadro(tMs: number) {
    return new Promise<void>(r => { this.ackCuadro = r; this.post('reloj', { t: tMs / 1000 }); setTimeout(() => { if (this.ackCuadro === r) { this.ackCuadro = null; r() } }, 2000) })
  }
  /** Para exportar: la sesión entra sin reproducirse en vivo. */
  fijarSesion(s: EstadoSesion) { this.sesion = s; for (const p of s.sesion.pasos) this.conocidos.add(p.id); this.fijar({ pasos: s.sesion.pasos.length }) }
  get listoEscenario() { return this.listo }

  /** Vuelve a ver la sesión entera con la voz y los gestos donde ocurrieron. */
  async reproducir() {
    if (!this.sesion) return
    this.detenerTodo()
    this.modoReproduccion = true; this.vivo = true
    this.post('reiniciar'); this.registrarRecursos(this.sesion)
    const ev = this.sesion.eventos
    const respuestas = new Map<string, Extract<Evento, { tipo: 'respuesta' }>>()
    const gestos = new Map<string, { rel: number; gesto: Gesto }[]>()
    for (const e of ev) {
      if (e.tipo === 'respuesta') respuestas.set(e.paso, e)
      const x = e as Evento & { paso?: string; rel?: number }
      if (e.tipo === 'gesto' && x.paso) { if (!gestos.has(x.paso)) gestos.set(x.paso, []); gestos.get(x.paso)!.push({ rel: x.rel ?? 0, gesto: e.gesto }) }
    }
    // Toda la voz antes de empezar (ya está en caché): la reproducción no se detiene a esperar la red.
    await Promise.all(this.sesion.sesion.pasos.flatMap(p => [p.voz, p.predice?.revela]).flatMap(v => v ? partirVoz(v).segmentos : []).flatMap(s => s.tipo === 'voz' && s.hablado.trim() ? [this.obtenerVoz(s.hablado)] : []))
    this.fijar({ fase: 'reproduciendo', hechos: 0 })
    this.cola = []
    this.corriendo = true
    try {
      for (const p of this.sesion.sesion.pasos) { if (!this.vivo || !this.modoReproduccion) break; await this.reproducirPaso(p, { respuesta: respuestas.get(p.id), gestos: gestos.get(p.id) ?? [] }) }
      if (this.sesion.sesion.cierre) this.post('entintar')
    } finally { this.corriendo = false }
    if (this.modoReproduccion) { this.post('camara', { accion: 'todo' }); this.fijar({ fase: 'fin-reproduccion', paso: null }) }
  }
  /** Sale de la reproducción y deja el pizarrón como estaba. */
  volverAlVivo() {
    if (!this.sesion) return
    this.detenerTodo()
    this.modoReproduccion = false; this.vivo = true
    this.cola = []; this.conocidos.clear()
    this.post('reiniciar')
    this.cargar(this.sesion)
  }
  private detenerTodo() {
    this.vivo = false
    this.audio?.pause()
    try { speechSynthesis?.cancel?.() } catch { /* sin voz */ }
    this.esperaGesto = null; this.esperaRespuesta?.(null); this.esperaRespuesta = null
    this.soltarPausa?.(); this.pausaHasta = null
  }
  destruir() { this.detenerTodo(); if (this.tFlush) { clearTimeout(this.tFlush); const lote = this.bufferEventos.splice(0); if (lote.length) void this.o.anotar(lote) } }
}

/** Para cada carácter hablado, el segundo en que empieza. Si el proveedor normalizó el texto, se reparte por proporción. */
export function mapaTiempos(hablado: string, alin: { c: string[]; s: number[] }): number[] {
  const n = hablado.length
  if (alin.c.length === n) return alin.s.slice()
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(alin.s[Math.min(alin.s.length - 1, Math.floor((i / Math.max(1, n)) * alin.s.length))] ?? 0)
  return out
}
export function partirFrases(t: string): { ini: number; fin: number }[] {
  const out: { ini: number; fin: number }[] = []
  const re = /[^.!?…:;]+[.!?…:;]*\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) { if (!m[0]) break; out.push({ ini: m.index, fin: m.index + m[0].length }) }
  if (!out.length) out.push({ ini: 0, fin: t.length })
  // Frases demasiado largas para una línea se parten en comas.
  return out.flatMap(f => {
    if (f.fin - f.ini < 140) return [f]
    const partes: { ini: number; fin: number }[] = []; let ini = f.ini
    for (let i = f.ini; i < f.fin; i++) if (t[i] === ',' && i - ini > 50) { partes.push({ ini, fin: i + 1 }); ini = i + 1 }
    partes.push({ ini, fin: f.fin }); return partes
  })
}
export type { Marca }
