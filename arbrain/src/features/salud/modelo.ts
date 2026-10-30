/**
 * Vista «Salud» (5 oct 2026): la lógica pura. Sin React ni red (tests/salud/salud.test.ts).
 *
 * Nada se compara contra metas universales: cada métrica contra TU banda (p25–p75 de tus últimos 60 días medidos,
 * sin contar hoy). La lectura del día es determinista y dice su evidencia. Lo que no llega es null y se pinta
 * «sin medir»; un hábito solo se compara con el cuerpo con ≥ 5 noches por lado, y si no, dice cuántas faltan.
 */

export const METRICAS_DIA = ['sueno_horas', 'sueno_deep_h', 'sueno_rem_h', 'sueno_core_h', 'sueno_awake_h', 'hrv_ms', 'resting_hr', 'pasos', 'vo2max', 'resp_rate', 'temp_muneca'] as const
export type MetricaDia = typeof METRICAS_DIA[number]
export type Dia = { fecha: string } & Partial<Record<MetricaDia, number | null>>
export interface Noche { fecha: string; inicio: string; fin: string }
export interface PactoFila { key: string; nombre: string; unidad: string; verde: number; amarillo: number; mejor: 'alto' | 'bajo'; valor: number | null; n: number; ultima: string | null; color: 'verde' | 'amarillo' | 'rojo' | null }
export interface HabitoCat { clave: string; nombre: string }
export interface Marca { fecha: string; clave: string; hecho: boolean | null }
export interface Conexion { tieneToken: boolean; pista: string | null; ultimoEnvio: string | null; muestras: number | null; error: string | null; url: string }

/** Lo que devuelve GET /api/salud. */
export interface DatosSalud {
  fuente: 'studio' | 'arbrain'
  hoy: string
  dias: Dia[]; noches: Noche[]
  ultimoEnvio: string | null
  pacto: PactoFila[] | null
  habitos: HabitoCat[]; marcas: Marca[]
  /** La prioridad de la mañana (sistema_reflexion) si la hay: respaldo del objetivo del día. */
  prioridad: string | null
  conexion: Conexion | null
  /** Quien pregunta tiene plan personal en el calendario (hoy, Daniel): su objetivo del día sale de ahí. */
  planPersonal?: boolean
  leidoEn: string; errores: string[]
}

// ── Fechas civiles ──
export const sumarDias = (dia: string, n: number) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// ── Métricas ──
export type Mejor = 'alto' | 'bajo' | 'estable'
export interface MetricaDef { clave: MetricaDia; nombre: string; unidad: string; mejor: Mejor; formato: (v: number) => string
  /** Se acumula durante el día (pasos): hoy va en curso y no entra a ventanas ni a la lectura. */
  enCurso?: boolean
  /** Para «estable»: cuánto se puede mover sin salir de lo tuyo. */
  margen?: number }

export const horasYMin = (h: number) => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')}` }
const fijo = (d: number) => (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })

export const METRICAS: readonly MetricaDef[] = [
  { clave: 'sueno_horas', nombre: 'Sueño', unidad: '', mejor: 'alto', formato: horasYMin },
  { clave: 'hrv_ms', nombre: 'Variabilidad (HRV)', unidad: 'ms', mejor: 'alto', formato: fijo(0) },
  { clave: 'resting_hr', nombre: 'Pulso en reposo', unidad: 'lpm', mejor: 'bajo', formato: fijo(0) },
  { clave: 'resp_rate', nombre: 'Respiración dormido', unidad: 'rpm', mejor: 'estable', margen: 1, formato: fijo(1) },
  { clave: 'temp_muneca', nombre: 'Temperatura de muñeca', unidad: '°C', mejor: 'estable', margen: 0.4, formato: fijo(2) },
  { clave: 'pasos', nombre: 'Pasos', unidad: '', mejor: 'alto', enCurso: true, formato: fijo(0) },
  { clave: 'vo2max', nombre: 'VO₂ máx', unidad: 'ml/kg·min', mejor: 'alto', formato: fijo(1) },
]
export const metrica = (c: MetricaDia) => METRICAS.find(m => m.clave === c)!

// ── Tu normal ──
export const DIAS_BASE = 60
export const MIN_BASE = 10

function cuantil(ordenados: number[], q: number) {
  const pos = (ordenados.length - 1) * q, i = Math.floor(pos), f = pos - i
  return ordenados[i + 1] == null ? ordenados[i] : ordenados[i] + f * (ordenados[i + 1] - ordenados[i])
}
const valor = (d: Dia | undefined, c: MetricaDia) => { const v = d?.[c]; return typeof v === 'number' && Number.isFinite(v) ? v : null }

export interface Base { n: number; p25: number | null; p50: number | null; p75: number | null; suficiente: boolean }
/** Tu normal: los días con dato en los 60 anteriores a hoy (hoy no cuenta). Con < 10 días, aún se aprende. */
export function base(dias: Dia[], c: MetricaDia, hoy: string): Base {
  const desde = sumarDias(hoy, -DIAS_BASE)
  const vals = dias.filter(d => d.fecha >= desde && d.fecha < hoy).map(d => valor(d, c)).filter((v): v is number => v != null).sort((a, b) => a - b)
  if (!vals.length) return { n: 0, p25: null, p50: null, p75: null, suficiente: false }
  return { n: vals.length, p25: cuantil(vals, 0.25), p50: cuantil(vals, 0.5), p75: cuantil(vals, 0.75), suficiente: vals.length >= MIN_BASE }
}

export type Sentido = 'favor' | 'contra' | 'igual' | 'fuera'
export interface Tendencia { dias: number; medidos: number; media: number | null; delta: number | null; sentido: Sentido | null }

/** Qué tan lejos de tu mediana y si eso te conviene. `delta`: % (o la diferencia en unidades si la métrica es «estable»). */
export function sentidoDe(m: MetricaDef, v: number, b: Base): { delta: number; sentido: Sentido } | null {
  if (!b.suficiente || b.p50 == null) return null
  if (m.mejor === 'estable') { const delta = v - b.p50; return { delta, sentido: Math.abs(delta) > (m.margen ?? 0) ? 'fuera' : 'igual' } }
  const delta = b.p50 === 0 ? 0 : (v - b.p50) / b.p50 * 100
  if (Math.abs(delta) < 3) return { delta, sentido: 'igual' }
  return { delta, sentido: (delta > 0) === (m.mejor === 'alto') ? 'favor' : 'contra' }
}

/** Promedio de los últimos `n` días con dato contra tu mediana. Pasos: sin hoy (va en curso). */
export function tendencia(dias: Dia[], m: MetricaDef, hoy: string, n: number, b = base(dias, m.clave, hoy)): Tendencia {
  const fin = m.enCurso ? sumarDias(hoy, -1) : hoy, desde = sumarDias(fin, -(n - 1))
  const vals = dias.filter(d => d.fecha >= desde && d.fecha <= fin).map(d => valor(d, m.clave)).filter((v): v is number => v != null)
  if (!vals.length) return { dias: n, medidos: 0, media: null, delta: null, sentido: null }
  const media = vals.reduce((a, b) => a + b, 0) / vals.length
  const s = sentidoDe(m, media, b)
  return { dias: n, medidos: vals.length, media, delta: s?.delta ?? null, sentido: s?.sentido ?? null }
}

export type Posicion = 'arriba' | 'abajo' | 'dentro'
export const posicion = (v: number, b: Base): Posicion | null => !b.suficiente || b.p25 == null || b.p75 == null ? null : v > b.p75 ? 'arriba' : v < b.p25 ? 'abajo' : 'dentro'

// ── La lectura del día ──
export type Estado = 'sin-lectura' | 'vigila' | 'calma' | 'cruzadas' | 'margen' | 'normal'
export interface Senal { clave: MetricaDia; texto: string; voto: 'favor' | 'contra' | null; sinMedir?: boolean }
export interface Lectura { estado: Estado; palabra: string; hacer: string; senales: Senal[]; ultimoDia: string | null }

export const PALABRA: Record<Estado, string> = {
  'sin-lectura': 'Sin lectura de anoche', vigila: 'Vigila', calma: 'Pide calma', cruzadas: 'Señales cruzadas', margen: 'Con margen', normal: 'En tu normal',
}

const rango = (m: MetricaDef, b: Base) => b.p25 != null && b.p75 != null ? `${m.formato(b.p25)}–${m.formato(b.p75)}` : ''
const conUnidad = (m: MetricaDef, v: number) => `${m.formato(v)}${m.unidad ? ` ${m.unidad}` : ''}`

function hacerDe(estado: Estado, objetivo: string | null, senales: Senal[]): string {
  const o = objetivo ? `«${objetivo}»` : null
  switch (estado) {
    case 'sin-lectura': return 'Abre Health Auto Export en el iPhone para forzar un envío. Mientras llega, decide por cómo te sientes, no por el reloj.'
    case 'vigila': return 'Temperatura y respiración arriba de lo tuyo a la vez: suele ser lo primero que se nota antes de enfermarte. Hoy agua, entreno suave o nada y a la cama temprano; mañana mira si sigue.'
    case 'calma': return `Baja la intensidad, no el objetivo${o ? `: protege ${o} y suelta lo demás` : ''}. Gym ligero o movilidad, nada de récords, y acuéstate más temprano.`
    case 'cruzadas': {
      const contra = senales.filter(s => s.voto === 'contra').map(s => metrica(s.clave).nombre.toLowerCase())
      return `Sigue el plan sin buscar récords${contra.length ? `: ${contra.join(' y ')} viene${contra.length > 1 ? 'n' : ''} en contra` : ''}.${o ? ` ${o} va primero.` : ''}`
    }
    case 'margen': return `Día para empujar: lo exigente cabe hoy.${o ? ` Pon ${o} en tu bloque más temprano y aprovecha el gym.` : ' Aprovecha el gym y tu bloque más difícil.'}`
    case 'normal': return `Sigue el plan como está.${o ? ` ${o} va primero.` : ''}`
  }
}

/** La lectura de hoy. `objetivo`: el del día si lo hay (se nombra para protegerlo, nunca como correlación). */
export function lectura(dias: Dia[], hoy: string, objetivo: string | null = null): Lectura {
  const d = dias.find(x => x.fecha === hoy)
  const conDato = [...dias].reverse().find(x => valor(x, 'sueno_horas') != null || valor(x, 'hrv_ms') != null)
  const ultimoDia = conDato?.fecha ?? null
  const sueno = valor(d, 'sueno_horas'), hrv = valor(d, 'hrv_ms')
  if (sueno == null && hrv == null) return { estado: 'sin-lectura', palabra: PALABRA['sin-lectura'], hacer: hacerDe('sin-lectura', objetivo, []), senales: [], ultimoDia }

  const senales: Senal[] = []
  // Sueño de anoche
  const mS = metrica('sueno_horas'), bS = base(dias, 'sueno_horas', hoy)
  if (sueno == null) senales.push({ clave: 'sueno_horas', texto: 'Sueño de anoche: sin medir', voto: null, sinMedir: true })
  else {
    const corto = sueno < 6, abajo = posicion(sueno, bS) === 'abajo'
    const favor = !corto && !abajo && sueno >= 7 && (!bS.suficiente || sueno >= (bS.p50 ?? 0))
    senales.push({ clave: 'sueno_horas', voto: corto || abajo ? 'contra' : favor ? 'favor' : null,
      texto: `Dormiste ${horasYMin(sueno)}${bS.suficiente && bS.p50 != null ? ` · tu normal ${horasYMin(bS.p50)}` : ''}${corto ? ' · corto' : ''}` })
  }
  // HRV y pulso en reposo contra tu banda
  for (const c of ['hrv_ms', 'resting_hr'] as const) {
    const m = metrica(c), v = valor(d, c), b = base(dias, c, hoy)
    if (v == null) { senales.push({ clave: c, texto: `${m.nombre}: sin medir hoy`, voto: null, sinMedir: true }); continue }
    const p = posicion(v, b)
    const voto = p == null || p === 'dentro' ? null : (p === 'arriba') === (m.mejor === 'alto') ? 'favor' : 'contra'
    senales.push({ clave: c, voto, texto: `${m.nombre} ${conUnidad(m, v)} · ${p == null ? `aprendiendo tu normal (${b.n} de ${MIN_BASE} días)` : p === 'dentro' ? `dentro de tu rango (${rango(m, b)})` : `${p} de tu rango (${rango(m, b)})`}` })
  }
  // Temperatura y respiración: no votan; avisan si suben juntas.
  let tempAlta = false, respAlta = false
  for (const c of ['temp_muneca', 'resp_rate'] as const) {
    const m = metrica(c), v = valor(d, c), b = base(dias, c, hoy)
    if (v == null) { senales.push({ clave: c, texto: `${m.nombre}: sin medir anoche`, voto: null, sinMedir: true }); continue }
    if (!b.suficiente || b.p50 == null) { senales.push({ clave: c, texto: `${m.nombre} ${conUnidad(m, v)} · aprendiendo tu normal (${b.n} de ${MIN_BASE} días)`, voto: null }); continue }
    const delta = v - b.p50, alta = delta >= (c === 'temp_muneca' ? 0.5 : 1.5)
    if (c === 'temp_muneca') tempAlta = alta; else respAlta = alta
    const dTxt = `${delta >= 0 ? '+' : '−'}${m.formato(Math.abs(delta))} ${m.unidad}`
    senales.push({ clave: c, voto: alta ? 'contra' : null, texto: `${m.nombre} ${conUnidad(m, v)} · ${alta ? `${dTxt} sobre tu normal` : Math.abs(delta) > (m.margen ?? 0) ? `${dTxt} contra tu normal` : 'estable'}` })
  }

  const votan = senales.filter(s => s.clave === 'sueno_horas' || s.clave === 'hrv_ms' || s.clave === 'resting_hr')
  const favor = votan.filter(s => s.voto === 'favor').length, contra = votan.filter(s => s.voto === 'contra').length
  const hrvAbajo = votan.find(s => s.clave === 'hrv_ms')?.voto === 'contra', rhrArriba = votan.find(s => s.clave === 'resting_hr')?.voto === 'contra'
  const estado: Estado = (tempAlta && respAlta) || ((tempAlta || respAlta) && hrvAbajo && rhrArriba) ? 'vigila'
    : (sueno != null && sueno < 6) || contra >= 2 ? 'calma'
    : favor >= 1 && contra >= 1 ? 'cruzadas'
    : favor >= 2 ? 'margen'
    : 'normal'
  return { estado, palabra: PALABRA[estado], hacer: hacerDe(estado, objetivo, senales), senales, ultimoDia }
}

// ── La noche ──
export interface Fase { clave: 'sueno_deep_h' | 'sueno_core_h' | 'sueno_rem_h' | 'sueno_awake_h'; nombre: string; horas: number | null; normal: number | null }
export const FASES: readonly { clave: Fase['clave']; nombre: string }[] = [
  { clave: 'sueno_deep_h', nombre: 'Profundo' }, { clave: 'sueno_core_h', nombre: 'Núcleo' }, { clave: 'sueno_rem_h', nombre: 'REM' }, { clave: 'sueno_awake_h', nombre: 'Despierto' },
]
export function nocheDe(dias: Dia[], noches: Noche[], fecha: string) {
  const d = dias.find(x => x.fecha === fecha)
  const fases: Fase[] = FASES.map(f => ({ ...f, horas: valor(d, f.clave), normal: base(dias, f.clave, fecha).p50 }))
  const n = noches.find(x => x.fecha === fecha)
  return { total: valor(d, 'sueno_horas'), fases, inicio: n ? n.inicio.slice(11, 16) : null, fin: n ? n.fin.slice(11, 16) : null }
}

// ── La tira de 30 días ──
export interface Punto { fecha: string; valor: number | null; hoy: boolean; enCurso: boolean }
export function serie(dias: Dia[], m: MetricaDef, hoy: string, n = 30): Punto[] {
  const porFecha = new Map(dias.map(d => [d.fecha, d]))
  return Array.from({ length: n }, (_, i) => { const fecha = sumarDias(hoy, i - n + 1); return { fecha, valor: valor(porFecha.get(fecha), m.clave), hoy: fecha === hoy, enCurso: !!m.enCurso && fecha === hoy } })
}

// ── Hábitos y cuerpo ──
export const MIN_MUESTRAS = 5
export interface Grupo { noches: number; hrv: number | null; sueno: number | null; nHrv: number; nSueno: number }
export interface HabitoCuerpo { clave: string; nombre: string; hoy: boolean | null; si: Grupo; no: Grupo; sinMedir: number; suficiente: boolean; faltanSi: number; faltanNo: number }

const media = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
/**
 * Un hábito del día D contra la noche siguiente (la fila D+1: sueño de esa noche y HRV del día). Solo cuentan las marcas
 * explícitas: sin registro no es «no cumplido». Con < 5 noches medidas por lado no hay comparación, se dice cuántas faltan.
 */
export function habitoVsCuerpo(h: HabitoCat, marcas: Marca[], dias: Dia[], hoy: string): HabitoCuerpo {
  const porFecha = new Map(dias.map(d => [d.fecha, d]))
  const grupos = { si: { hrv: [] as number[], sueno: [] as number[], noches: 0 }, no: { hrv: [] as number[], sueno: [] as number[], noches: 0 } }
  let sinMedir = 0
  for (const m of marcas) {
    if (m.clave !== h.clave || m.hecho == null || m.fecha >= hoy) continue
    const sig = porFecha.get(sumarDias(m.fecha, 1)), hrv = valor(sig, 'hrv_ms'), sueno = valor(sig, 'sueno_horas')
    if (hrv == null && sueno == null) { sinMedir++; continue }
    const g = m.hecho ? grupos.si : grupos.no
    g.noches++; if (hrv != null) g.hrv.push(hrv); if (sueno != null) g.sueno.push(sueno)
  }
  const grupo = (g: typeof grupos.si): Grupo => ({ noches: g.noches, hrv: media(g.hrv), sueno: media(g.sueno), nHrv: g.hrv.length, nSueno: g.sueno.length })
  const si = grupo(grupos.si), no = grupo(grupos.no)
  const hoyMarca = marcas.find(m => m.clave === h.clave && m.fecha === hoy)?.hecho ?? null
  return { clave: h.clave, nombre: h.nombre, hoy: hoyMarca, si, no, sinMedir, suficiente: si.noches >= MIN_MUESTRAS && no.noches >= MIN_MUESTRAS,
    faltanSi: Math.max(0, MIN_MUESTRAS - si.noches), faltanNo: Math.max(0, MIN_MUESTRAS - no.noches) }
}

// ── El reloj ──
export type EstadoReloj = 'vivo' | 'reciente' | 'callado' | 'nunca'
export function reloj(ultimoEnvio: string | null, ahora: number): EstadoReloj {
  if (!ultimoEnvio) return 'nunca'
  const min = (ahora - Date.parse(ultimoEnvio)) / 60_000
  return min < 90 ? 'vivo' : min < 26 * 60 ? 'reciente' : 'callado'
}
export function hace(iso: string, ahora: number): string {
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 36) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

/** ¿Hay algo que mostrar o toca conectar el reloj? */
export const sinDatos = (x: Pick<DatosSalud, 'dias'>) => !x.dias.some(d => METRICAS_DIA.some(c => valor(d, c) != null))

/** Resumen de la vista colapsada. */
export function resumenSalud(x: DatosSalud | undefined): string | null {
  if (!x) return null
  if (sinDatos(x)) return 'sin reloj conectado'
  const l = lectura(x.dias, x.hoy)
  const s = valor(x.dias.find(d => d.fecha === x.hoy), 'sueno_horas'), h = valor(x.dias.find(d => d.fecha === x.hoy), 'hrv_ms')
  return [l.palabra, s != null ? `dormiste ${horasYMin(s)}` : null, h != null ? `HRV ${Math.round(h)} ms` : null].filter(Boolean).join(' · ')
}
