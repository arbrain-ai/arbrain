/**
 * Huecos para «ver después» (17 nov 2026). Puro: recibe lo ocupado (el calendario REAL, solo lectura, y las tareas con
 * hora) y devuelve hasta tres horas libres donde cabe el video. Nunca encima de un evento con hora: así no cae sobre
 * una llamada, el gym ni el trabajo fuerte de la mañana, que en su calendario son eventos. Los de día entero (fases,
 * recordatorios) no ocupan. Lo de otra persona (`de`) y lo que el dueño rechazó tampoco. Si hoy no cabe, propone
 * mañana. Las horas se cuentan en la hora local del navegador (la del dueño).
 */

export interface Ocupado { start: string; end: string; allDay?: boolean; de?: string | null; rechazado?: boolean }
export interface Hueco { inicio: Date; fin: Date }

/** Lo que dura el bloque: el video redondeado hacia arriba al cuarto de hora, entre 15 min y 2 h (un curso de 8 h no
 *  cabe en un bloque; se agenda su primera parte). */
export function minutosDeBloque(duracionS: number | null | undefined): number {
  const min = Math.ceil((duracionS ?? 0) / 60)
  return Math.min(120, Math.max(15, Math.ceil(min / 15) * 15))
}

const CUARTO = 15 * 60_000
const subirAlCuarto = (t: number) => Math.ceil(t / CUARTO) * CUARTO

export function huecosLibres({ ocupado, ahora, minutos, desde = 8, hasta = 20.5, margen = 10, dias = 4, cuantos = 3, separacion = 150 }: {
  ocupado: readonly Ocupado[]; ahora: Date; minutos: number
  /** Ventana del día en horas locales (8:00 a 20:30 por defecto: después viene la rutina de noche). */
  desde?: number; hasta?: number
  /** Minutos de aire antes y después de lo ocupado. */
  margen?: number; dias?: number; cuantos?: number
  /** Dos propuestas del mismo día, al menos así de separadas (para dar opciones distintas, no 18:00 y 18:15). */
  separacion?: number
}): Hueco[] {
  const largo = minutos * 60_000, aire = margen * 60_000
  const bloques = ocupado
    .filter(o => !o.allDay && !o.de && !o.rechazado)
    .map(o => ({ a: Date.parse(o.start) - aire, b: Date.parse(o.end) + aire }))
    .filter(o => Number.isFinite(o.a) && Number.isFinite(o.b) && o.b > o.a)
    .sort((x, y) => x.a - y.a)
  const candidatos: Hueco[] = []
  for (let d = 0; d < dias; d++) {
    const base = new Date(ahora); base.setDate(base.getDate() + d); base.setHours(0, 0, 0, 0)
    const abre = base.getTime() + desde * 36e5, cierra = base.getTime() + hasta * 36e5
    let t = subirAlCuarto(Math.max(abre, d === 0 ? ahora.getTime() + aire : abre))
    // Recorre lo ocupado del día: el primer lugar donde cabe en cada tramo libre es un candidato.
    for (const o of bloques) {
      if (o.b <= t) continue
      if (o.a >= cierra) break
      if (o.a - t >= largo) candidatos.push({ inicio: new Date(t), fin: new Date(t + largo) })
      t = Math.max(t, subirAlCuarto(o.b))
    }
    if (cierra - t >= largo) candidatos.push({ inicio: new Date(t), fin: new Date(t + largo) })
  }
  // Elegir: en orden de tiempo, máximo dos por día y separadas; así salen opciones de hoy y de mañana.
  const elegidos: Hueco[] = []
  for (const c of candidatos) {
    const mismoDia = elegidos.filter(e => e.inicio.toDateString() === c.inicio.toDateString())
    if (mismoDia.length >= 2) continue
    if (mismoDia.some(e => Math.abs(c.inicio.getTime() - e.inicio.getTime()) < separacion * 60_000)) continue
    elegidos.push(c)
    if (elegidos.length >= cuantos) break
  }
  return elegidos
}

/** ¿Choca esta hora con algo? Para «elegir otro»: se avisa, no se impide (la decisión es del dueño). */
export function choca(ocupado: readonly Ocupado[], inicio: Date, minutos: number): boolean {
  const a = inicio.getTime(), b = a + minutos * 60_000
  return ocupado.some(o => !o.allDay && !o.de && !o.rechazado && Date.parse(o.start) < b && Date.parse(o.end) > a)
}
