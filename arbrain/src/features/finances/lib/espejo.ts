/**
 * El espejo de Finanzas (6 nov 2026). Lógica pura de lo que pinta la parte de arriba: sin React, sin red.
 *
 * Daniel: «solo quiero ver lo que tengo», «así como pusiste la línea verde, quiero ver la línea roja», «dos vistas, una
 * acumulado y otra los días que recibí y gasté específicamente». Tres cifras (lo que tienes, entró, salió) y una gráfica:
 *  · Acumulado: lo que entró y lo que salió sumado día con día. Cada línea llega hasta su último movimiento (después no hay
 *    dato, no un cero), y al cierre de cada mes vale lo mismo que la suma de los meses.
 *  · Por día: solo los días con dinero; tocar uno muestra sus movimientos (concepto, cuenta y monto).
 */
import type { FinanceCoverage, FinanceFx, FinanceMovement, MonthTotal } from '../types/finances'
import { pesosDe } from './finanzas'
import { clasificar, MESES_CORTO, nombreMes } from './granularidad'
import { cortesPorFuente, fechaCorta, nombreCategoria, nombreCuenta, nombreFuente, suma, type DiaGrafica } from './modelo'

// ── Acumulado ───────────────────────────────────────────────────────────────────────────────────────────

export interface SerieAcumulada {
  fechas: string[]
  entro: number[]
  salio: number[]
  /** Último índice con dinero de cada serie (−1 = ninguno): la línea termina ahí. */
  finEntro: number
  finSalio: number
}

/** Más que esto entre un mes y sus días no es redondeo (falta o sobra un movimiento): no se concilia, se deja como está. */
const REDONDEO_MAX = 50

/**
 * El acumulado del rango. Con `meses`, cada mes que el rango cubre completo se concilia contra su total: la API redondea cada
 * día y cada mes por separado, y la diferencia de redondeo (unos pesos) se pone en el último día con dinero de ese mes. Así,
 * al cierre de cada mes la línea vale exactamente la suma de los meses. `desdeElPrincipio` (rango «Todo»): el primer mes
 * también está completo aunque el rango empiece a la mitad, porque antes del primer movimiento no hay nada.
 */
export function serieAcumulada(dias: DiaGrafica[], meses?: MonthTotal[], desdeElPrincipio = false): SerieAcumulada {
  const e = dias.map(d => d.entro + suma(d.agrEntro)), s = dias.map(d => d.salio + suma(d.agrSalio))
  if (meses?.length && dias.length) {
    const primero = dias[0].fecha, total = new Map(meses.map(m => [m.month, m]))
    const porMes = new Map<string, { e: number; s: number; ue: number; us: number }>()
    dias.forEach((d, i) => {
      const x = porMes.get(d.fecha.slice(0, 7)) ?? { e: 0, s: 0, ue: -1, us: -1 }
      x.e += e[i]; x.s += s[i]
      if (e[i] !== 0) x.ue = i
      if (s[i] !== 0) x.us = i
      porMes.set(d.fecha.slice(0, 7), x)
    })
    for (const [ym, x] of porMes) {
      const t = total.get(ym)
      if (!t || (!desdeElPrincipio && `${ym}-01` < primero)) continue
      if (x.ue >= 0 && Math.abs(t.income_mxn - x.e) <= REDONDEO_MAX) e[x.ue] += t.income_mxn - x.e
      if (x.us >= 0 && Math.abs(t.expense_mxn - x.s) <= REDONDEO_MAX) s[x.us] += t.expense_mxn - x.s
    }
  }
  const out: SerieAcumulada = { fechas: dias.map(d => d.fecha), entro: [], salio: [], finEntro: -1, finSalio: -1 }
  let ce = 0, cs = 0
  dias.forEach((d, i) => {
    ce += e[i]; cs += s[i]
    out.entro.push(ce); out.salio.push(cs)
    if (d.entro > 0 || d.agrEntro.length) out.finEntro = i
    if (d.salio > 0 || d.agrSalio.length) out.finSalio = i
  })
  return out
}

/** Lo que entró y salió en el rango, igual que el final de cada línea. */
export const totalesDe = (s: SerieAcumulada) => ({ entro: s.finEntro >= 0 ? s.entro[s.finEntro] : 0, salio: s.finSalio >= 0 ? s.salio[s.finSalio] : 0 })

/** El acumulado al cierre de cada mes del rango: { 'YYYY-MM': { entro, salio } }. Sirve para cuadrar contra los meses. */
export function cierresDeMes(s: SerieAcumulada): Map<string, { entro: number; salio: number }> {
  const out = new Map<string, { entro: number; salio: number }>()
  s.fechas.forEach((f, i) => out.set(f.slice(0, 7), { entro: s.entro[i], salio: s.salio[i] }))
  return out
}

// ── Por día ─────────────────────────────────────────────────────────────────────────────────────────────

export interface DiaConDinero { i: number; fecha: string; entro: number; salio: number }

/** Los días del rango en que entró o salió dinero registrado ese día. */
export const diasConDinero = (dias: DiaGrafica[]): DiaConDinero[] =>
  dias.flatMap((d, i) => (d.entro > 0 || d.salio > 0 ? [{ i, fecha: d.fecha, entro: d.entro, salio: d.salio }] : []))

export interface MovDelDia {
  id: string
  tipo: 'ingreso' | 'gasto'
  concepto: string
  cuenta: string
  /** En pesos de su día. */
  mxn: number
  /** El monto en su divisa si no es MXN (p. ej. US$105.50 de Polar). */
  original: { monto: number; moneda: string } | null
}

/** Lo que dice un movimiento en una línea: sin etiquetas internas, sin la cuenta repetida («Banco A: Café» en la cuenta
 *  Banco-A = «Café») y solo su primera frase. */
export function concepto(m: Pick<FinanceMovement, 'type' | 'note' | 'category' | 'registered_by' | 'account_name'>): string {
  const nota = (m.note ?? '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
  if (m.type === 'ingreso' && m.category === 'Polar' && (m.registered_by === 'polar-sync' || /^Revenue Polar/i.test(nota))) {
    const n = /(\d+)\s+órdenes?/i.exec(nota)?.[1]
    return n ? `Ventas de Polar · ${n} ${n === '1' ? 'orden' : 'órdenes'}` : 'Ventas de Polar'
  }
  if (!nota) return m.type === 'gasto' ? nombreCategoria(m.category ?? 'otros') : nombreFuente(m.category ?? 'otros')
  const pre = /^([^:]{1,40}):\s+(.+)$/.exec(nota)
  const raiz = (m.account_name ?? '').split(/[-\s]/)[0].toLowerCase()
  const texto = pre && raiz.length >= 2 && pre[1].split(/\s/)[0].toLowerCase() === raiz ? pre[2] : nota
  // La primera frase: lo que pasó. El resto (de dónde se leyó, qué falta confirmar) se queda en la nota completa.
  // Corta en «;» o en un punto seguido de mayúscula (no en «incl. renovaciones» ni en «22.9»).
  return texto.split(/;\s+|(?<=[^\d\s]\.)\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)[0].replace(/[.;]$/, '')
}

/** Los movimientos que forman las barras de un día: ingresos y gastos vivos con fecha real, los que entran primero. */
export function movimientosDelDia(movs: FinanceMovement[], fecha: string, fx: FinanceFx): MovDelDia[] {
  return movs
    .filter(m => m.date === fecha && !m.is_correction && (m.type === 'ingreso' || m.type === 'gasto') && clasificar(m).granularidad === 'dia')
    .map(m => ({
      id: m.id, tipo: m.type as 'ingreso' | 'gasto', concepto: concepto(m), cuenta: m.account_name ? nombreCuenta(m.account_name) : '',
      mxn: pesosDe(m, fx), original: m.currency !== 'MXN' ? { monto: Number(m.amount), moneda: m.currency } : null,
    }))
    .sort((a, b) => (a.tipo === b.tipo ? b.mxn - a.mxn : a.tipo === 'ingreso' ? -1 : 1))
}

// ── Formato ─────────────────────────────────────────────────────────────────────────────────────────────

/** Tres cifras significativas: $3.76 M, $488 mil, $48.8 mil, $950. Para el final de una línea, donde no cabe el peso exacto. */
export function compacto(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  const sig = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, '')
  if (a >= 999_500) return `${s}$${sig(a / 1_000_000)} M`
  if (a >= 1_000) return `${s}$${sig(a / 1_000)} mil`
  return `${s}$${Math.round(a)}`
}

/** «jueves 5 de noviembre de 2026». */
export function diaLargo(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const semana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${semana} ${d} de ${nombreMes(iso.slice(0, 7))} de ${y}`
}

/** «5 nov 2026» si no es de este año; «5 nov» si lo es. */
export const fechaConAnio = (iso: string, hoy: string) => fechaCorta(iso, iso.slice(0, 4) !== hoy.slice(0, 4))

/** El periodo que cubren Entró, Salió y la gráfica, una sola vez: «4 ene 2024 – 6 nov 2026» o «8 oct – 6 nov». */
export function periodo(desde: string | undefined, hoy: string): string {
  if (!desde) return ''
  const otroAnio = desde.slice(0, 4) !== hoy.slice(0, 4)
  return `${fechaCorta(desde, otroAnio)} – ${fechaCorta(hoy, otroAnio)}`
}

/** La línea de honestidad: hasta qué fecha hay estados de cuenta de cada tarjeta y banco, del más viejo al más nuevo.
 *  null si no hay ninguno. Cada pedazo va entero (la vista no lo parte a la mitad). */
export function lineaCobertura(cov: FinanceCoverage | undefined, hoy: string): { titulo: string; cortes: string[] } | null {
  const cortes = cortesPorFuente(cov)
  if (!cortes.length) return null
  return { titulo: 'Estados de cuenta hasta:', cortes: [...cortes].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre)).map(c => `${c.nombre} ${fechaConAnio(c.fecha, hoy)}`) }
}

// ── Eje X ───────────────────────────────────────────────────────────────────────────────────────────────

export interface MarcaX { i: number; texto: string }

/**
 * Las etiquetas del eje del tiempo para `fechas` (una por día) en `ancho` px. Hasta ~45 días, días; si no, el inicio de
 * cada mes cada 1, 2, 3, 6 o 12 meses, lo primero que quepa. El año va en enero y en la primera etiqueta.
 */
export function marcasX(fechas: string[], ancho: number): MarcaX[] {
  const n = fechas.length
  if (!n) return []
  const px = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * ancho)
  if (n <= 45) {
    const cabe = Math.max(1, Math.floor(ancho / 84))
    const paso = Math.max(1, Math.ceil(n / cabe))
    return fechas.flatMap((f, i) => ((n - 1 - i) % paso === 0 ? [{ i, texto: fechaCorta(f) }] : []))
  }
  const inicios = fechas.flatMap((f, i) => (f.endsWith('-01') ? [{ i, f }] : []))
  for (const meses of [1, 2, 3, 6, 12]) {
    const elegidos = inicios.filter(({ f }) => (Number(f.slice(5, 7)) - 1) % meses === 0)
    const minimo = meses === 12 ? 34 : 56
    const holgado = elegidos.every((e, k) => k === 0 || px(e.i) - px(elegidos[k - 1].i) >= minimo)
    if (!holgado && meses !== 12) continue
    const marcas = elegidos.map(({ i, f }, k) => {
      const y = f.slice(0, 4), m = Number(f.slice(5, 7)) - 1
      if (meses === 12) return { i, texto: y }
      return { i, texto: m === 0 || k === 0 ? `${MESES_CORTO[m]} ${y}` : MESES_CORTO[m] }
    })
    // Solo años: el primer tramo también lleva el suyo, al inicio, si cabe antes del siguiente.
    if (meses === 12 && (!marcas.length || px(marcas[0].i) >= 40) && !fechas[0].endsWith('-01-01')) marcas.unshift({ i: 0, texto: fechas[0].slice(0, 4) })
    return marcas
  }
  return []
}

// ── Eje Y ───────────────────────────────────────────────────────────────────────────────────────────────

/** Un paso «bonito» (1, 2, 2.5, 5 × 10^k) para cubrir `max` en unos `tramos`. */
export function pasoBonito(max: number, tramos = 4): number {
  const crudo = Math.max(max, 1) / tramos, k = 10 ** Math.floor(Math.log10(crudo)), r = crudo / k
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * k
}
