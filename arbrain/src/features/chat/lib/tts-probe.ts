/**
 * SONDA DEL HILO PRINCIPAL — instrumento temporal para cazar qué traba el chat.
 *
 * POR QUÉ EXISTE (medido el 28 jul 2026, no teoría):
 * El lector por voz se desincronizaba en conversaciones largas. Se midió el motor de voz
 * aislado en el MISMO iPhone (iOS 18.7, Paulina, 1.5x, mismo troceo por frases) con
 * /tts-lab.html: 168 boundaries, drift constante de -0.01s, hueco máximo entre frases de
 * 0.01s, cero colgadas. El motor es PERFECTO. Y en la app, el mismo motor se desincroniza.
 *
 * La diferencia es el entorno: el audio lo produce el sistema y no depende del hilo de JS,
 * pero los eventos que mueven el resaltado SÍ. Si el hilo se bloquea, los eventos se
 * encolan: el naranja se congela mientras la voz sigue, `onend` no se procesa y la
 * siguiente frase nunca se manda a hablar (de ahí los silencios de ~20s), y al liberarse
 * el hilo todo se procesa de golpe y el resaltado salta.
 *
 * Falta saber QUÉ bloquea. Esta sonda lo mide en el dispositivo real:
 *  · un latido de 100ms que detecta cuánto se atrasó el event loop (= cuánto estuvo tieso)
 *  · las últimas marcas antes de cada bloqueo, para atribuirlo a un culpable concreto
 *
 * Se activa SOLO con ?ttsdebug=1 en la URL (o localStorage 'tts-probe'). Apagada, `mark()`
 * es un `if` y nada más: cero costo en el uso normal — que es justo lo que estamos
 * cuidando.
 *
 * TEMPORAL: cuando el culpable esté identificado y arreglado, esto se borra entero.
 */

type Marca = { t: number; que: string }
type Bloqueo = { t: number; ms: number; antes: string[] }

const LIMITE_MS = 250 // a partir de aquí, un retraso del latido cuenta como bloqueo

class Sonda {
  activa = false
  private marcas: Marca[] = []
  private bloqueos: Bloqueo[] = []
  private latido: ReturnType<typeof setInterval> | null = null
  private t0 = 0
  private lagMax = 0
  private listeners = new Set<() => void>()
  private cached = { on: false, lagMax: 0, bloqueos: 0, ultimo: '' }

  arranca() {
    if (this.activa || typeof window === 'undefined') return
    this.activa = true
    this.t0 = performance.now()
    let esperado = performance.now() + 100
    this.latido = setInterval(() => {
      const ahora = performance.now()
      const lag = ahora - esperado
      esperado = ahora + 100
      if (lag > LIMITE_MS) {
        this.lagMax = Math.max(this.lagMax, lag)
        this.bloqueos.push({
          t: ahora - this.t0,
          ms: Math.round(lag),
          // Las marcas de la ventana anterior al bloqueo son los sospechosos: lo último
          // que corrió antes de que el hilo dejara de responder.
          antes: this.marcas.filter((m) => ahora - m.t < lag + 400).map((m) => m.que).slice(-6),
        })
        if (this.bloqueos.length > 60) this.bloqueos.shift()
        this.emit()
      }
      if (this.marcas.length > 120) this.marcas = this.marcas.slice(-60)
    }, 100)
  }

  /** Marca un sospechoso. Llamar ANTES del trabajo pesado, no después. */
  mark(que: string) {
    if (!this.activa) return
    this.marcas.push({ t: performance.now(), que })
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  private emit() {
    const ult = this.bloqueos[this.bloqueos.length - 1]
    this.cached = {
      on: this.activa,
      lagMax: Math.round(this.lagMax),
      bloqueos: this.bloqueos.length,
      ultimo: ult ? `${ult.ms}ms · ${ult.antes.join(' → ') || 'sin marcas'}` : '',
    }
    this.listeners.forEach((l) => l())
  }
  getState() {
    return this.cached
  }

  reporte() {
    const orden = [...this.bloqueos].sort((a, b) => b.ms - a.ms)
    const culpables = new Map<string, { n: number; ms: number }>()
    for (const b of this.bloqueos) {
      const clave = b.antes[b.antes.length - 1] ?? '(sin marca)'
      const prev = culpables.get(clave) ?? { n: 0, ms: 0 }
      culpables.set(clave, { n: prev.n + 1, ms: prev.ms + b.ms })
    }
    return [
      `SONDA DEL HILO — ${navigator.userAgent}`,
      `ventana: ${((performance.now() - this.t0) / 1000).toFixed(0)}s`,
      `bloqueos (>${LIMITE_MS}ms): ${this.bloqueos.length}   peor: ${Math.round(this.lagMax)}ms`,
      ``,
      `PEORES BLOQUEOS`,
      ...orden.slice(0, 12).map((b) => `  ${String(b.ms).padStart(6)}ms  @${(b.t / 1000).toFixed(1)}s  ← ${b.antes.join(' → ') || '(sin marcas)'}`),
      ``,
      `POR CULPABLE (marca inmediatamente anterior)`,
      ...[...culpables.entries()]
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, 10)
        .map(([k, v]) => `  ${String(v.ms).padStart(6)}ms en ${String(v.n).padStart(3)}x  ${k}`),
    ].join('\n')
  }
}

export const sonda = new Sonda()

if (typeof window !== 'undefined') {
  const url = new URLSearchParams(window.location.search)
  const on = url.get('ttsdebug') === '1' || window.localStorage.getItem('tts-probe') === '1'
  if (on) {
    // Persistir: el PWA navega y perdería el query param.
    try { window.localStorage.setItem('tts-probe', '1') } catch { /* modo privado */ }
    sonda.arranca()
  }
  if (url.get('ttsdebug') === '0') {
    try { window.localStorage.removeItem('tts-probe') } catch { /* modo privado */ }
  }
}
