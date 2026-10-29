/**
 * MARCAS EXACTAS PARA LA VOZ DE LEMONFOX (29 oct 2026). Daniel: «si solo es preciso 95% del tiempo hay desfases que me
 * cortan la concentración».
 *
 * La voz `levy` del Studio trae sus marcas de la misma síntesis (voice.ts › synthesizeLector). LemonFox solo devuelve
 * audio, y hasta hoy el lector del alumno estimaba por silencios (src/features/chat/lib/tiempos-estimados.ts). Aquí el
 * daemon del alumno le pide a Groq (whisper, con la llave que ya tiene para dictar) cuándo empieza cada palabra en ESE
 * audio, alinea esas palabras con el texto pedido y entrega la misma tabla `X-Marcas` que la voz del Studio:
 * `[desde, largo, ms]` en unidades UTF-16 del texto y milisegundos del audio entregado.
 *
 * Whisper solo no basta: medido contra las marcas exactas de `sayd` (29 oct), sus inicios de palabra se adelantan
 * ~30–70 ms de media y, tras una pausa, hasta 850 ms (mete el silencio dentro de la palabra siguiente). Por eso el audio
 * manda donde es inequívoco: el arranque de la voz y cada pausa entre frases salen del PCM; whisper solo dice qué
 * palabra viene después de cada pausa y cómo se reparten las palabras DENTRO de la frase.
 *
 * Todo lo de aquí es puro salvo `transcribirConTiempos` (la llamada a Groq). Nunca se registra la llave ni el cuerpo
 * crudo del proveedor.
 */

/** `[desde, largo, ms]` de una palabra del texto, como `X-Marcas`. */
export type Marca = [number, number, number]

/** Una palabra de Groq (`verbose_json` con `timestamp_granularities[]=word`), en segundos. */
export interface PalabraGroq { word: string; start: number; end: number }

// ── Normalización: qué cuenta como «la misma palabra» ────────────────────────────────────────────────────────────────

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve']
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

/** Un entero en palabras, como lo dice la voz («21» → «veintiuno», «2026» → «dos mil veintiseis»). */
export function enPalabras(n: number): string {
  if (!Number.isInteger(n) || n < 0) return ''
  if (n < 30) return UNIDADES[n]
  if (n < 100) return DECENAS[Math.floor(n / 10)] + (n % 10 ? ' y ' + UNIDADES[n % 10] : '')
  if (n === 100) return 'cien'
  if (n < 1000) return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ' ' + enPalabras(n % 100) : '')
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000)
    return (miles === 1 ? 'mil' : enPalabras(miles) + ' mil') + (n % 1000 ? ' ' + enPalabras(n % 1000) : '')
  }
  return String(n).split('').map((d) => UNIDADES[Number(d)]).join(' ')
}

/**
 * Lo que suena de un pedazo de texto, en letras comparables: sin acentos ni puntuación, números en palabras («80/20» y
 * «80-20» dan lo mismo) y las grafías que en español suenan igual unidas (v/b, z/s, c/qu/k, ll/y, h muda). Así «Sí»,
 * «si,», «vemos» y «bemos» casan, y un «12:00» del texto casa con el «12» o el «doce» de whisper.
 */
export function clave(s: string): string {
  return s
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\d+/g, (d) => ` ${enPalabras(Number(d))} `)
    .replace(/[^a-z]/g, '')
    .replace(/qu/g, 'k').replace(/c(?=[ei])/g, 's').replace(/c/g, 'k').replace(/z/g, 's').replace(/v/g, 'b')
    .replace(/ll/g, 'y').replace(/h/g, '').replace(/w/g, 'u')
}

// ── Alineación texto ↔ Groq ──────────────────────────────────────────────────────────────────────────────────────────

/** Tramo `/\S+/` del texto en unidades UTF-16 (las mismas palabras que el resaltado del lector). */
export interface Token { desde: number; hasta: number }
export function tokens(texto: string): Token[] {
  return [...texto.matchAll(/\S+/g)].map((m) => ({ desde: m.index!, hasta: m.index! + m[0].length }))
}

// Un texto de lector es de ≤ 320 caracteres; esto deja holgura para 5,000 sin que la tabla pase de ~16 MB.
const CELDAS_MAX = 16_000_000

export interface TiempoGroq { inicio: number; fin: number }

/**
 * Inicio y fin (según Groq) de cada palabra del texto, o `null` si no tiene letras que sonar («—») o whisper no la
 * escribió. Alinea LETRA A LETRA (distancia de edición sobre `clave`), no palabra a palabra: whisper parte, une o
 * cambia palabras («SaaS» → «SAS», «80/20» → «80-20», «OneDrive» → «One Drive») y lo que importa es en qué letra suya
 * cae la primera letra de cada palabra del texto. Solo cuentan las letras que casan IGUAL (una cambiada no dice nada de
 * dónde está); el instante de una letra se reparte dentro de su palabra de Groq. `iguales`: cuántas letras del texto
 * casaron, para saber si whisper oyó este texto.
 */
export function tiemposDeGroq(texto: string, palabras: PalabraGroq[]): Array<TiempoGroq | null> & { iguales?: number; letras?: number } {
  const toks = tokens(texto)
  const A: number[] = [] // dueño (palabra del texto) de cada letra
  let sa = ''
  toks.forEach((t, k) => { const c = clave(texto.slice(t.desde, t.hasta)); sa += c; for (let i = 0; i < c.length; i++) A.push(k) })
  const B: number[] = [] // instante de cada letra de Groq
  const Bfin: number[] = []
  let sb = ''
  for (const p of palabras) {
    if (!(Number.isFinite(p.start) && Number.isFinite(p.end))) continue
    const c = clave(p.word)
    const ini = Math.max(0, p.start)
    const fin = Math.max(ini, p.end)
    for (let i = 0; i < c.length; i++) { B.push(ini + ((fin - ini) * i) / c.length); Bfin.push(fin) }
    sb += c
  }
  const out: Array<TiempoGroq | null> & { iguales?: number; letras?: number } = toks.map(() => null)
  out.iguales = 0
  out.letras = sa.length
  const n = sa.length
  const m = sb.length
  if (!n || !m || (n + 1) * (m + 1) > CELDAS_MAX) return out
  // Distancia de edición con su camino: 0 = diagonal (igual o cambiada), 1 = letra del texto sin par, 2 = letra de Groq
  // sin par. En empate gana la diagonal.
  const ancho = m + 1
  const paso = new Uint8Array((n + 1) * ancho)
  let prev = new Int32Array(ancho)
  let fila = new Int32Array(ancho)
  for (let j = 0; j <= m; j++) { prev[j] = j; paso[j] = 2 }
  for (let i = 1; i <= n; i++) {
    fila[0] = i
    paso[i * ancho] = 1
    const ca = sa.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const diag = prev[j - 1] + (ca === sb.charCodeAt(j - 1) ? 0 : 1)
      const arriba = prev[j] + 1
      const izq = fila[j - 1] + 1
      if (diag <= arriba && diag <= izq) { fila[j] = diag; paso[i * ancho + j] = 0 }
      else if (arriba <= izq) { fila[j] = arriba; paso[i * ancho + j] = 1 }
      else { fila[j] = izq; paso[i * ancho + j] = 2 }
    }
    ;[prev, fila] = [fila, prev]
  }
  // Letra de Groq que le tocó a cada letra del texto (-1: ninguna).
  const par = new Int32Array(n).fill(-1)
  for (let i = n, j = m; i > 0 || j > 0;) {
    const p = i > 0 && j > 0 ? paso[i * ancho + j] : i > 0 ? 1 : 2
    if (p === 0) { par[i - 1] = j - 1; i--; j-- }
    else if (p === 1) i--
    else j--
  }
  for (let i = 0; i < n; i++) {
    const k = A[i]
    if (par[i] < 0 || sa.charCodeAt(i) !== sb.charCodeAt(par[i])) continue
    out.iguales++
    const t = B[par[i]]
    const f = Bfin[par[i]]
    const o = out[k]
    if (!o) out[k] = { inicio: t, fin: f }
    else o.fin = Math.max(o.fin, f)
  }
  return out
}

// ── El audio manda donde es inequívoco ───────────────────────────────────────────────────────────────────────────────

/**
 * Silencios del audio, `[inicio, fin]` en segundos: ventanas de 5 ms, callado = 35 dB por debajo de lo fuerte de la
 * propia voz (percentil 95). La misma regla que `silenciosDe` del lector (tiempos-estimados.ts; el server no importa
 * código de la web).
 */
export function silencios(pcm: Float32Array, sr: number, minimo = 0.03): Array<[number, number]> {
  const h = Math.max(1, Math.round(sr * 0.005))
  const n = Math.floor(pcm.length / h)
  if (n < 2) return []
  const db = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = i * h; j < (i + 1) * h; j++) s += pcm[j] * pcm[j]
    db[i] = 10 * Math.log10(s / h + 1e-12)
  }
  const umbral = Array.from(db).sort((a, b) => a - b)[Math.floor(0.95 * (n - 1))] - 35
  const out: Array<[number, number]> = []
  let ini = -1
  for (let i = 0; i <= n; i++) {
    const callado = i < n && db[i] < umbral
    if (callado && ini < 0) ini = i
    else if (!callado && ini >= 0) {
      if (ini === 0 || i === n || ((i - ini) * h) / sr >= minimo) out.push([(ini * h) / sr, (i * h) / sr])
      ini = -1
    }
  }
  return out
}

/**
 * Segundo en que empieza cada palabra del texto, con Groq como guía y el audio como juez:
 *   1. Las palabras que whisper no escribió toman su lugar por letras entre las vecinas que sí.
 *   2. La primera palabra arranca donde arranca la voz (whisper siempre dice 0.00).
 *   3. Cada frontera tras puntuación busca su pausa en el audio cerca de donde whisper la puso; la palabra que sigue
 *      arranca donde la pausa acaba.
 *   4. Dentro de la frase manda whisper, sin salirse de la voz de esa frase.
 * `null` si whisper no reconoció casi nada del texto (otro audio, otro idioma): mejor el respaldo que unas marcas falsas.
 */
export function inicios(texto: string, palabras: PalabraGroq[], pcm: Float32Array, sr: number): Array<number | null> | null {
  const toks = tokens(texto)
  const g = tiemposDeGroq(texto, palabras)
  const sonoras = toks.map((t) => clave(texto.slice(t.desde, t.hasta)).length)
  // Whisper oyó este texto si casó igual al menos el 60 % de sus letras (a 3x llega a alucinar «¡Suscríbete al canal!»).
  if (!g.letras || (g.iguales ?? 0) < 0.6 * g.letras) return null
  const duracion = pcm.length / sr

  // 1. Huecos: por letras entre la vecina anterior y la siguiente que whisper sí escribió.
  const ini: number[] = new Array(toks.length).fill(NaN)
  const fin: number[] = new Array(toks.length).fill(NaN)
  for (let k = 0; k < toks.length; k++) if (g[k]) { ini[k] = g[k]!.inicio; fin[k] = g[k]!.fin }
  for (let k = 0; k < toks.length;) {
    if (!Number.isNaN(ini[k])) { k++; continue }
    let q = k
    while (q < toks.length && Number.isNaN(ini[q])) q++
    const t0 = k > 0 ? fin[k - 1] : 0
    const t1 = q < toks.length ? ini[q] : Math.max(t0, k > 0 ? fin[k - 1] : duracion)
    const pesos = toks.slice(k, q).map((_, i) => sonoras[k + i] + 1)
    const total = pesos.reduce((a, b) => a + b, 0)
    let acc = 0
    for (let i = k; i < q; i++) { ini[i] = t0 + ((t1 - t0) * acc) / total; acc += pesos[i - k]; fin[i] = t0 + ((t1 - t0) * acc) / total }
    k = q
  }
  for (let k = 1; k < toks.length; k++) ini[k] = Math.max(ini[k], ini[k - 1])

  // 2. Bordes de la voz.
  const sil = silencios(pcm, sr)
  const voz0 = sil.length && sil[0][0] === 0 ? sil[0][1] : 0
  const vozFin = sil.length && sil[sil.length - 1][1] >= duracion - 0.006 ? sil[sil.length - 1][0] : duracion
  if (!(vozFin - voz0 > 0.05)) return null

  // 3. Pausas. La voz de LemonFox llega a callar solo 40 ms tras un punto, lo mismo que el cierre de la «k» de «escucho»:
  //    la duración sola no las distingue. Lo que sí: una voz sintética solo pausa en la puntuación. Por eso se recorre
  //    cada frontera que va tras puntuación (o tras algo que no suena, como «—») y se le busca SU silencio donde whisper
  //    la puso: entre el inicio de la palabra y el fin de la anterior, más una ventana. Whisper se equivoca en los dos
  //    sentidos: estira el fin a través de la pausa y de la palabra siguiente («reales,» hasta 10.92, «no» desde 10.60) o
  //    arranca la palabra dentro de la anterior («cuenta,» 8.34–8.96, «no» desde 8.44). Ahí dentro gana el silencio más
  //    largo. Una coma que la voz no calló se queda sin ancla: el cierre de una oclusiva fuera de la ventana no cuenta.
  const interiores = sil.filter(([a, b]) => a > voz0 && b < vozFin)
  const porPalabra = (vozFin - voz0) / Math.max(1, toks.length)
  const VENTANA = Math.max(0.08, Math.min(0.2, 0.6 * porPalabra))
  const ancla = new Map<number, [number, number]>() // palabra que arranca tras la pausa → pausa
  let libre = 0 // primer silencio que todavía se puede usar (en orden)
  for (let k = 1; k < toks.length; k++) {
    if (sonoras[k] === 0) continue
    let p = k - 1
    while (p > 0 && sonoras[p] === 0) p--
    const puntuada = sonoras[k - 1] === 0 || /[.,;:!?…—–)»"”]$/.test(texto.slice(toks[k - 1].desde, toks[k - 1].hasta))
    if (!puntuada) continue
    const desde = Math.min(ini[k], fin[p]) - VENTANA
    const hasta = Math.max(ini[k], fin[p]) + VENTANA
    let mejor = -1
    for (let s = libre; s < interiores.length; s++) {
      const [a, b] = interiores[s]
      if (a > hasta) break
      if (b < desde) continue
      if (mejor < 0 || b - a > interiores[mejor][1] - interiores[mejor][0]) mejor = s
    }
    if (mejor >= 0) { ancla.set(k, interiores[mejor]); libre = mejor + 1 }
  }

  // 4. Dentro de cada frase manda whisper, acotado a la voz de esa frase: nada antes de que acabe la pausa anterior ni
  //    después de que empiece la siguiente.
  const out: Array<number | null> = new Array(toks.length).fill(null)
  const cortes = [0, ...[...ancla.keys()].sort((x, y) => x - y), toks.length]
  for (let c = 0; c < cortes.length - 1; c++) {
    const p = cortes[c]
    const q = cortes[c + 1] // primera palabra de la frase siguiente
    const t0 = p === 0 ? voz0 : ancla.get(p)![1]
    const t1 = q < toks.length ? ancla.get(q)![0] : vozFin
    for (let k = p; k < q; k++) {
      if (sonoras[k] === 0) continue
      out[k] = k === p ? t0 : Math.min(t1, Math.max(t0, ini[k]))
    }
  }
  let ultimo = 0
  for (let k = 0; k < out.length; k++) if (out[k] != null) { out[k] = Math.max(out[k]!, ultimo); ultimo = out[k]! }
  return out
}

/** La tabla de `X-Marcas` para `texto` con las palabras de Groq sobre este PCM, o `null` (el lector usa su respaldo). */
export function marcasLemonfox(texto: string, palabras: PalabraGroq[], pcm: Float32Array, sr: number): Marca[] | null {
  const t = inicios(texto, palabras, pcm, sr)
  if (!t) return null
  const toks = tokens(texto)
  const out: Marca[] = []
  toks.forEach((tk, k) => { if (t[k] != null) out.push([tk.desde, tk.hasta - tk.desde, Math.round(t[k]! * 10_000) / 10]) })
  return out.length ? out : null
}

// ── WAV ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** PCM de un WAV de 16 bits (el `response_format: 'wav'` de LemonFox). Mezcla a mono. `null` si no es eso. */
export function leerWav(buf: Buffer): { pcm: Float32Array; sr: number; s16: Int16Array } | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let p = 12
  let sr = 0
  let canales = 0
  let bits = 0
  let formato = 0
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4)
    let largo = buf.readUInt32LE(p + 4)
    if (id === 'fmt ') {
      formato = buf.readUInt16LE(p + 8); canales = buf.readUInt16LE(p + 10); sr = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22)
    } else if (id === 'data') {
      // Un WAV servido en streaming trae el largo en 0 o 0xFFFFFFFF: manda lo que llegó.
      if (!largo || p + 8 + largo > buf.length) largo = buf.length - p - 8
      if ((formato !== 1 && formato !== 0xfffe) || bits !== 16 || !canales || !sr) return null
      const cuadros = Math.floor(largo / (2 * canales))
      const s16 = new Int16Array(cuadros)
      const pcm = new Float32Array(cuadros)
      for (let i = 0; i < cuadros; i++) {
        let s = 0
        for (let c = 0; c < canales; c++) s += buf.readInt16LE(p + 8 + 2 * (i * canales + c))
        s16[i] = Math.round(s / canales)
        pcm[i] = s / canales / 32768
      }
      return { pcm, sr, s16 }
    }
    p += 8 + largo + (largo & 1)
  }
  return null
}

/** WAV PCM de 16 bits mono con los tamaños exactos: la muestra N del archivo es la N que suena. */
export function wav(s16: Int16Array, sr: number): Buffer {
  const h = Buffer.alloc(44)
  const bytes = s16.length * 2
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(bytes, 40)
  return Buffer.concat([h, Buffer.from(s16.buffer, s16.byteOffset, bytes)])
}

/**
 * El mismo audio a 16 kHz para subirlo a Groq (whisper lo pasa a 16 kHz de todos modos): un tercio menos de bytes que
 * los 24 kHz de LemonFox, que es lo que tarda en subir desde la casa del alumno. Promedio de cada ventana: basta como
 * filtro para voz.
 */
export function a16k(pcm: Float32Array, sr: number): Int16Array {
  if (sr === 16_000) return Int16Array.from(pcm, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32768))))
  const r = sr / 16_000
  const n = Math.floor(pcm.length / r)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * r)
    const b = Math.max(a + 1, Math.floor((i + 1) * r))
    let s = 0
    for (let j = a; j < b && j < pcm.length; j++) s += pcm[j]
    out[i] = Math.max(-32768, Math.min(32767, Math.round((s / (b - a)) * 32768)))
  }
  return out
}

// ── Groq ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const TRANSCRIPCIONES = 'https://api.groq.com/openai/v1/audio/transcriptions'
// whisper-large-v3 (no turbo): medido el 29 oct contra sayd, inicios con la mitad de error que turbo y la misma demora.
export const MODELO_TIEMPOS = 'whisper-large-v3'

/**
 * Palabras con su inicio y fin en `audio` (un WAV). `null` si Groq falla, tarda o no da palabras: el lector sigue con su
 * respaldo. Nunca devuelve la llave ni el cuerpo crudo del proveedor.
 */
export async function transcribirConTiempos(audio: Buffer, llave: string, transport: typeof fetch = fetch, espera = 8_000): Promise<{ palabras: PalabraGroq[] } | { error: string; status?: number }> {
  const fd = new FormData()
  fd.set('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'voz.wav')
  fd.set('model', MODELO_TIEMPOS)
  fd.set('language', 'es')
  fd.set('response_format', 'verbose_json')
  fd.append('timestamp_granularities[]', 'word')
  fd.set('temperature', '0')
  try {
    const r = await transport(TRANSCRIPCIONES, { method: 'POST', headers: { Authorization: `Bearer ${llave.trim()}` }, body: fd, signal: AbortSignal.timeout(espera) })
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return { error: r.status === 429 ? 'groq_saturado' : r.status === 401 || r.status === 403 ? 'groq_llave' : 'groq_error', status: r.status } }
    const j = (await r.json()) as { words?: unknown }
    const palabras = Array.isArray(j.words)
      ? (j.words as Array<Record<string, unknown>>).filter((w) => typeof w.word === 'string' && typeof w.start === 'number' && typeof w.end === 'number').map((w) => ({ word: w.word as string, start: w.start as number, end: w.end as number }))
      : []
    return palabras.length ? { palabras } : { error: 'groq_sin_palabras' }
  } catch (e) {
    const nombre = (e as Error)?.name
    return { error: nombre === 'TimeoutError' || nombre === 'AbortError' ? 'groq_tiempo' : 'groq_sin_red' }
  }
}
