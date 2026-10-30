import { instalacion } from '@/config'
import { shiftDay } from '@/features/sistema/calendar-days'
import type { Marca } from './habitos-dia'

/**
 * «Hábitos de hoy» (22 oct 2026, Daniel entrando al monk mode hasta Monterrey): tres casillas grandes al pie del Día, con racha,
 * «nunca falles dos veces», la tira de 30 días y la cuadrícula de la temporada. Lógica pura, sin React
 * (tests/planning/habitos-hoy.test.ts). Escriben por la pluma de siempre (useHabitRecords → /api/sistema).
 *
 * `inicio` es el primer día que cuenta (la temporada arranca el 23 oct): antes de él no hay historia que contar ni rellenar.
 */

/** Los días de la tira, del más viejo al de hoy. */
export const DIAS_TIRA = 30
export function diasTira(hoy: string, n = DIAS_TIRA): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(hoy, i - n + 1))
}

/** Racha: días seguidos cumplidos que terminan hoy (o ayer, si hoy aún no se marca: el día no ha terminado). Nunca antes de `inicio`. */
export function rachaActual(marca: (fecha: string) => Marca, hoy: string, inicio: string | null): number {
  let d = marca(hoy) === true ? hoy : shiftDay(hoy, -1), dias = 0
  while ((!inicio || d >= inicio) && marca(d) === true && dias < 3660) { dias++; d = shiftDay(d, -1) }
  return dias
}

/**
 * «Nunca falles dos veces»: ayer no quedó cumplido y hoy todavía no. Ayer sin marca cuenta como fallo aquí a propósito: la
 * temporada se llena a diario y el aviso es el empujón, no una estadística. Solo si ayer ya era parte de la temporada.
 */
export function noSeRompe(marca: (fecha: string) => Marca, hoy: string, inicio: string | null): boolean {
  const ayer = shiftDay(hoy, -1)
  if (inicio && ayer < inicio) return false
  return marca(hoy) !== true && marca(ayer) !== true
}

export type EstadoCelda = 'hecho' | 'fallado' | 'vacio' | 'fuera' | 'futuro'
/** Cómo se pinta un día: antes del arranque no hay historia (aunque existan marcas viejas: «la historia arranca el 23»); el
 *  futuro aún no existe; hoy sin marca está «vacío», no fallado. */
export function estadoCelda(m: Marca, fecha: string, hoy: string, inicio: string | null): EstadoCelda {
  if (fecha > hoy) return 'futuro'
  if (inicio && fecha < inicio) return 'fuera'
  return m === true ? 'hecho' : m === false ? 'fallado' : 'vacio'
}

/** Las semanas (lunes a domingo) que cubren la temporada; los días de fuera quedan como `null` para alinear la cuadrícula. */
export function semanasTemporada(desde: string, hasta: string): (string | null)[][] {
  const dow = (f: string) => (new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7 // lunes = 0
  const semanas: (string | null)[][] = []
  let lunes = shiftDay(desde, -dow(desde))
  while (lunes <= hasta) {
    semanas.push(Array.from({ length: 7 }, (_, i) => { const f = shiftDay(lunes, i); return f >= desde && f <= hasta ? f : null }))
    lunes = shiftDay(lunes, 7)
  }
  return semanas
}

/**
 * Porcentaje de una semana: casillas cumplidas sobre las posibles, contando los días ya vividos desde `inicio` (hoy completo:
 * el número sube mientras marcas). Sin días vividos no hay porcentaje (null), nunca un 0 inventado.
 */
export function porcentajeSemana(dias: (string | null)[], claves: string[], marca: (fecha: string, clave: string) => Marca, hoy: string, inicio: string | null) {
  const vividos = dias.filter((f): f is string => !!f && f <= hoy && (!inicio || f >= inicio))
  const posibles = vividos.length * claves.length
  if (!posibles) return null
  const hechos = vividos.reduce((n, f) => n + claves.filter(c => marca(f, c) === true).length, 0)
  return { hechos, posibles, pct: Math.round(hechos / posibles * 100) }
}

/** La semana de hoy dentro de la temporada (o null si hoy no cae en ella). */
export function semanaDeHoy(semanas: (string | null)[][], hoy: string) {
  return semanas.find(s => s.includes(hoy)) ?? null
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** La línea de la cuenta regresiva: qué día de la temporada es y cuánto falta para el premio. */
export function cuentaRegresiva(hoy: string, t: { arranque: string; hasta: string; premio: string }): { dia: number | null; total: number; texto: string } {
  const total = dias(t.arranque, t.hasta) + 1
  if (hoy < t.arranque) {
    const n = dias(hoy, t.arranque)
    return { dia: null, total, texto: `Empieza ${n === 1 ? 'mañana' : `en ${n} días`} · ${dias(hoy, t.hasta)} días para ${t.premio}` }
  }
  if (hoy > t.hasta) return { dia: total, total, texto: `Temporada cerrada · ${t.premio}` }
  const dia = dias(t.arranque, hoy) + 1, faltan = dias(hoy, t.hasta)
  return { dia, total, texto: faltan === 0 ? `Día ${dia} de ${total} · hoy es ${t.premio}` : `Día ${dia} de ${total} · ${faltan === 1 ? 'falta 1 día' : `faltan ${faltan} días`} para ${t.premio}` }
}

/** «1 día», «12 días». */
export const textoRacha = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** Dentro de la fila, el dígito 1…9 marca la casilla de esa posición (el orden de `sistema_habitos`). */
export function casillaDeTecla(e: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing'>, total: number): number | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || e.isComposing) return null
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code) ?? /^([1-9])$/.exec(e.key)
  if (!m) return null
  const i = Number(m[1]) - 1
  return i < total ? i : null
}

/**
 * Hábitos que el calendario NUNCA pinta (24 oct 2026, regla dura del dueño; la lista vive en `config/instalacion.ts`): ni en «Hábitos de hoy», ni en la hoja del Día, ni en
 * Metas, ni en el teléfono; tampoco con el candado de privado. Se excluyen por clave, explícitamente, antes de cualquier otro filtro.
 */
export const FUERA_DEL_CALENDARIO: ReadonlySet<string> = new Set(instalacion().habitosFueraDelCalendario)
export const seMuestra = (clave: string) => !FUERA_DEL_CALENDARIO.has(clave)
