/**
 * La Semana en horas (9 oct 2026, pedido de Daniel: una vista de calendario normal con las horas del día del tramo
 * configurable `TRAMO`). Lógica pura de la rejilla, sin DOM: qué pedazo de
 * cada bloque cae en cada día, a qué altura, cuántos van lado a lado y qué queda fuera del tramo despierto (eso no se pierde:
 * se cuenta arriba o abajo de su columna). La usan la sección Calendario, la pestaña del panel y la vista del chat.
 */
import { eventData, taskData } from './model'
import type { PlanItem } from './types'
import { ordenarAgenda } from './agenda-llamadas'

/**
 * Lo de día completo en la Semana (25 oct 2026, Daniel: «termina de limpiar el ruido»): lo de varios días (uno a uno, demo day,
 * viajes) es UNA barra que cruza sus días, nunca una copia por columna. Primer y último día civil (inclusive) de algo de día completo.
 */
export function tramoDeTodoElDia(e: { start: string; end: string }): [string, string] {
  const a = e.start.slice(0, 10), fin = new Date(`${e.end.slice(0, 10)}T12:00:00Z`)
  fin.setUTCDate(fin.getUTCDate() - 1)
  const z = fin.toISOString().slice(0, 10)
  return [a, z < a ? a : z]
}
export const esDeVariosDias = (e: { start: string; end: string }) => { const [a, z] = tramoDeTodoElDia(e); return z > a }
/** Dónde cae una barra en los días a la vista: columnas de rejilla (1-based, fin exclusivo) y si sigue fuera. null = no se ve. */
export function columnasDeBarra(dias: readonly string[], desde: string, hasta: string): { a: number; z: number; antes: boolean; despues: boolean } | null {
  if (!dias.length || hasta < dias[0] || desde > dias[dias.length - 1]) return null
  const a = Math.max(0, dias.findIndex(d => d >= desde)), z = dias.reduce((k, d, i) => d <= hasta ? i : k, -1)
  return { a: a + 1, z: z + 2, antes: desde < dias[0], despues: hasta > dias[dias.length - 1] }
}

/** El tramo de horas visible de la agenda. Cambiarlo aquí cambia las tres superficies. */
export const TRAMO = { desde: 5, hasta: 22 } as const
/** Paso del arrastre y del clic para crear, en minutos. */
export const PASO_ARRASTRE = 15
export const PASO_CREAR = 30
const MIN_DIA = 1440

export interface Bloque {
  id: string
  titulo: string
  /** Epoch ms. */
  inicio: number
  fin: number
  color: string | null
  /** Se puede arrastrar (evento editable o tarea con hora). */
  movible: boolean
  tarea?: boolean
  /** Se repite: pesa menos a la vista que un compromiso único. */
  rutina?: boolean
  prioridad?: boolean
  /** Con otras personas (invitados o Meet): borde sólido más grueso (10 oct 2026). */
  compromiso?: boolean
  /** Tarea con hora pero sin duración en Todoist (19 oct 2026): un chip en el borde, no un bloque que parte columnas. */
  sinDuracion?: boolean
  /** El brief de la misma persona, plegado en la tarjeta de su llamada (`ordenarAgenda`). */
  brief?: Bloque
  /** Lo que dice la tarjeta (el nombre en una llamada); sin esto, `titulo`. */
  corto?: string
  /** DRIP (24 oct 2026): el cuadrante, la etiqueta «delegable», de quién es ya y si está protegido. */
  drip?: 'producir' | 'invertir' | 'reemplazar' | 'delegar'
  delegable?: boolean
  delegadoA?: string | null
  protegido?: boolean
  /** Sección de la agenda (secciones.ts, 26 oct 2026): color de la barra lateral e icono chico. */
  seccion?: 'gym' | 'clase' | 'unoauno' | 'trabajo' | 'personal'
  /** Marcado «no negociable» en la descripción del evento. */
  innegociable?: boolean
}

/** Lo que se pinta de un bloque en un día: minutos desde las 00:00, ya recortados al tramo. */
export interface Pieza {
  bloque: Bloque
  dia: string
  desde: number
  hasta: number
  /** Columna dentro de su grupo de solapes y cuántas columnas tiene el grupo. */
  col: number
  cols: number
  /** El bloque sigue antes o después de lo que se ve (cruza la medianoche o el tramo). */
  sigueArriba: boolean
  sigueAbajo: boolean
  /** Hay chips de tareas a su altura: deja libre el borde derecho de la columna para ellos. */
  resguardo?: boolean
}

/** Tareas sin duración que caen juntas (a menos de `CHIP_MIN` de la primera): un solo chip en el borde, con su cuenta si son varias. */
export interface GrupoChips { dia: string; desde: number; bloques: Bloque[] }

export interface DiaEnHoras {
  piezas: Pieza[]; antes: Bloque[]; despues: Bloque[]
  /** Ventanas de disponibilidad («Llamadas con aplicantes»): banda de fondo detrás de las tarjetas, sin columna. */
  bandas?: Pieza[]
  chips?: GrupoChips[]
}

/** Lo que mide un chip de tarea en minutos al decidir qué bloque le deja el borde y qué chips se juntan. */
export const CHIP_MIN = 20

/**
 * Semana de llamadas (19 oct 2026, Daniel con la captura del lunes 19 partido en cuatro columnas ilegibles): el mismo criterio
 * que el Día. Las ventanas de disponibilidad van de banda, el brief se pliega en la tarjeta de su llamada y las tareas con hora
 * sin duración se vuelven chips del borde. Las tareas nunca entran al reparto de llamadas.
 */
export interface Reparto { tarjetas: Bloque[]; bandas: Bloque[]; chips: Bloque[] }
export function repartir(bloques: Bloque[]): Reparto {
  const { bloques: eventos, bandas } = ordenarAgenda(bloques.filter(b => !b.tarea))
  const tareas = bloques.filter(b => b.tarea)
  return { tarjetas: [...eventos, ...tareas.filter(b => !b.sinDuracion)], bandas, chips: tareas.filter(b => b.sinDuracion) }
}

/** Medianoche local de un día civil `yyyy-MM-dd`. */
export function medianoche(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
/** La medianoche del día siguiente (no siempre son 24 h exactas en zonas con horario de verano). */
export function medianocheSiguiente(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d + 1).getTime()
}
/** Minutos desde la medianoche local del día, para un instante de ese día. */
export function minutoDelDia(ms: number, dia: string): number {
  const f = new Date(ms), base = new Date(medianoche(dia))
  const dias = Math.round((new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime() - base.getTime()) / 86_400_000)
  return dias * MIN_DIA + f.getHours() * 60 + f.getMinutes() + f.getSeconds() / 60
}
/** El instante local de un minuto del día. */
export function instante(dia: string, minuto: number): Date {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d, 0, Math.round(minuto))
}

/**
 * Reparte los bloques de un día: lo que cae en el tramo se vuelve pieza con su columna; lo que queda entero antes o después
 * del tramo se devuelve aparte para avisarlo. Un bloque de duración cero ocupa un paso, para que se vea y se pueda tocar.
 */
export function diaEnHoras(bloques: Bloque[], dia: string, tramo: { desde: number; hasta: number } = TRAMO, reparto: Reparto = repartir(bloques)): DiaEnHoras {
  const ini = medianoche(dia), fin = medianocheSiguiente(dia)
  const top = tramo.desde * 60, bottom = tramo.hasta * 60
  const piezas: Pieza[] = [], antes: Bloque[] = [], despues: Bloque[] = [], bandas: Pieza[] = [], sueltas: Pieza[] = []
  /** Recorta un bloque al día y al tramo: pieza, o dónde queda si cae entero fuera. */
  const recortar = (b: Bloque): Pieza | 'antes' | 'despues' | null => {
    const finReal = Math.max(b.fin, b.inicio + PASO_ARRASTRE * 60_000)
    if (b.inicio >= fin || finReal <= ini) return null
    // Un bloque que empezó ayer se cuenta solo en su primer día visible para «antes/después»; aquí basta recortar.
    const a = b.inicio <= ini ? 0 : minutoDelDia(b.inicio, dia), z = finReal >= fin ? MIN_DIA : minutoDelDia(finReal, dia)
    if (z <= top) return b.inicio >= ini ? 'antes' : null
    if (a >= bottom) return 'despues'
    return { bloque: b, dia, desde: Math.max(a, top), hasta: Math.min(z, bottom), col: 0, cols: 1,
      sigueArriba: b.inicio < ini || a < top, sigueAbajo: finReal > fin || z > bottom }
  }
  const repartirEn = (b: Bloque, destino: Pieza[]) => {
    const r = recortar(b)
    if (r === 'antes') antes.push(b); else if (r === 'despues') despues.push(b); else if (r) destino.push(r)
  }
  for (const b of reparto.tarjetas) repartirEn(b, piezas)
  for (const b of reparto.chips) repartirEn(b, sueltas)
  for (const b of reparto.bandas) { const r = recortar(b); if (r && typeof r === 'object') bandas.push(r) }
  // Los chips que caen juntos se vuelven uno; los bloques a su altura les dejan el borde derecho.
  const chips: GrupoChips[] = []
  for (const p of [...sueltas].sort((x, y) => x.desde - y.desde || x.bloque.id.localeCompare(y.bloque.id))) {
    const g = chips[chips.length - 1]
    if (g && p.desde - g.desde < CHIP_MIN) g.bloques.push(p.bloque); else chips.push({ dia, desde: p.desde, bloques: [p.bloque] })
  }
  const conChip = (p: Pieza) => chips.some(g => g.desde < p.hasta && p.desde < g.desde + CHIP_MIN)
  return { piezas: acomodar(piezas).map(p => conChip(p) ? { ...p, resguardo: true } : p), antes, despues, bandas, chips }
}

/**
 * Dónde va un bloque dentro de su columna: los encimados siempre lado a lado, a partes iguales (25 oct 2026, dirección Riel;
 * antes, en cascada como Google cuando no cabían a 64 px). El título no se parte: si no cabe, se acorta con su elipsis.
 * `ancho` es lo útil de la columna en px. Devuelve px desde el borde izquierdo y el ancho.
 */
export function lugarEnColumna(col: number, cols: number, ancho: number): { left: number; width: number } {
  if (cols <= 1 || ancho <= 0) return { left: 0, width: Math.max(0, ancho) }
  const parte = ancho / cols
  return { left: col * parte, width: parte }
}

/**
 * Solapes lado a lado: los bloques que se tocan forman un grupo; dentro del grupo cada uno toma la primera columna libre y
 * todos comparten el ancho del grupo. Orden estable: primero el que empieza antes y, a igual hora, el más largo.
 */
export function acomodar(piezas: Pieza[]): Pieza[] {
  const orden = [...piezas].sort((x, y) => x.desde - y.desde || (y.hasta - y.desde) - (x.hasta - x.desde) || x.bloque.id.localeCompare(y.bloque.id))
  const salida: Pieza[] = []
  let grupo: Pieza[] = [], finGrupo = -1, columnas: number[] = []
  const cerrar = () => { const n = columnas.length; for (const p of grupo) salida.push({ ...p, cols: n }); grupo = []; columnas = []; finGrupo = -1 }
  for (const p of orden) {
    if (grupo.length && p.desde >= finGrupo) cerrar()
    let col = columnas.findIndex(f => f <= p.desde)
    if (col < 0) { col = columnas.length; columnas.push(p.hasta) } else columnas[col] = p.hasta
    grupo.push({ ...p, col })
    finGrupo = Math.max(finGrupo, p.hasta)
  }
  cerrar()
  return salida
}

/** Redondea al paso más cercano. */
export const ajustar = (minuto: number, paso = PASO_ARRASTRE) => Math.round(minuto / paso) * paso

/**
 * Dónde cae un bloque al soltarlo: conserva su duración, se ajusta al paso y no sale del tramo visible por arriba ni empieza
 * después de su último paso. Devuelve null si no se movió.
 */
export function soltar(b: Bloque, diaDestino: string, minutoInicio: number, tramo: { desde: number; hasta: number } = TRAMO): { inicio: Date; fin: Date } | null {
  const dur = Math.max(PASO_ARRASTRE * 60_000, b.fin - b.inicio)
  const m = Math.min(Math.max(ajustar(minutoInicio), tramo.desde * 60), tramo.hasta * 60 - PASO_ARRASTRE)
  const inicio = instante(diaDestino, m)
  if (inicio.getTime() === b.inicio) return null
  return { inicio, fin: new Date(inicio.getTime() + dur) }
}

/** Nueva hora de término al estirar el borde de abajo: al menos un paso, nunca más allá del tramo. */
export function estirar(b: Bloque, dia: string, minutoFin: number, tramo: { desde: number; hasta: number } = TRAMO): Date | null {
  const inicioMin = b.inicio < medianoche(dia) ? 0 : minutoDelDia(b.inicio, dia)
  const m = Math.min(Math.max(ajustar(minutoFin), inicioMin + PASO_ARRASTRE), tramo.hasta * 60)
  const fin = instante(dia, m)
  return fin.getTime() === b.fin ? null : fin
}

/** La ranura que abre el editor con doble clic en un hueco: la media hora bajo el ratón. Desde el 10 oct 2026 (Daniel: «prefiero
 *  dar clic, arrastrar y yo seleccionar la duración») un clic suelto no crea nada; crear es arrastrar. */
export function ranura(dia: string, minuto: number, tramo: { desde: number; hasta: number } = TRAMO): { inicio: Date; fin: Date } {
  const m = Math.min(Math.max(Math.floor(minuto / PASO_CREAR) * PASO_CREAR, tramo.desde * 60), tramo.hasta * 60 - PASO_CREAR)
  return { inicio: instante(dia, m), fin: instante(dia, m + PASO_CREAR) }
}

/** Con el ratón, crear empieza al recorrer esto (px) con el botón apretado; menos es un clic y no crea nada. */
export const ARRASTRE_MINIMO = 6
/** ¿El puntero ya recorrió lo bastante para que el clic sostenido sea un arrastre (y dibuje el bloque nuevo)? */
export const esArrastre = (dx: number, dy: number, minimo = ARRASTRE_MINIMO) => Math.hypot(dx, dy) >= minimo

/**
 * Crear arrastrando (10 oct 2026): del minuto donde se tomó el hueco al minuto bajo el puntero, hacia abajo o hacia arriba,
 * ajustado a 15 min, al menos un paso y dentro del tramo. Devuelve minutos del día.
 */
export function rangoCrear(desde: number, hasta: number, tramo: { desde: number; hasta: number } = TRAMO): { desde: number; hasta: number } {
  const top = tramo.desde * 60, bottom = tramo.hasta * 60
  const a = Math.min(Math.max(Math.floor(Math.min(desde, hasta) / PASO_ARRASTRE) * PASO_ARRASTRE, top), bottom - PASO_ARRASTRE)
  const z = Math.min(Math.max(Math.ceil(Math.max(desde, hasta) / PASO_ARRASTRE) * PASO_ARRASTRE, a + PASO_ARRASTRE), bottom)
  return { desde: a, hasta: z }
}

/** Los días en el orden del teléfono: el de hoy primero cuando cae en la semana; si no, el lunes. Índice donde empieza. */
export function primerDiaVisible(dias: string[], hoy: string): number {
  const i = dias.indexOf(hoy)
  return i < 0 ? 0 : i
}

/** Un día civil `yyyy-MM-dd` más `n` días (con horario de verano no se cuentan horas: se cuentan fechas). */
export function sumarDia(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number), f = new Date(y, m - 1, d + n, 12)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}
/** El lunes de la semana ISO de un día. */
export function lunesDe(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  return sumarDia(dia, -((new Date(y, m - 1, d, 12).getDay() + 6) % 7))
}
/** `n` días seguidos desde `desde`. */
export const diasDesde = (desde: string, n: number) => Array.from({ length: n }, (_, i) => sumarDia(desde, i))

/**
 * La Semana como ventana deslizante (10 oct 2026, Daniel: «avanzar día por día, no semana entera»). Al llegar a una semana
 * (Hoy, el Mes, la URL): con siete a la vista, el lunes; con 3 o 4, hoy primero si hoy cae en esa semana; si no, el lunes.
 */
export function inicioDeVentana(ancla: string, hoy: string, n: number, finDeSemana = true): string {
  const lunes = lunesDe(ancla)
  if (n >= (finDeSemana ? 7 : 5)) return lunes
  const enSemana = hoy >= lunes && hoy < sumarDia(lunes, 7)
  return enSemana && (finDeSemana || !esFinDeSemana(hoy)) ? hoy : lunes
}

/**
 * La semana (su lunes) que manda en lo visible: la que tiene más días a la vista. Empate (4 días, 2 y 2): la primera.
 * El objetivo de la semana y su rótulo siguen esta regla; los chips de horas cuentan solo los días visibles.
 */
export function semanaDeMayoria(visibles: readonly string[]): string {
  const cuenta = new Map<string, number>()
  for (const d of visibles) { const l = lunesDe(d); cuenta.set(l, (cuenta.get(l) ?? 0) + 1) }
  let mejor = '', max = 0
  for (const [l, k] of [...cuenta].sort((a, b) => a[0].localeCompare(b[0]))) if (k > max) { mejor = l; max = k }
  return mejor
}

/** Sábado o domingo. */
export function esFinDeSemana(dia: string): boolean {
  const [y, m, d] = dia.split('-').map(Number), w = new Date(y, m - 1, d, 12).getDay()
  return w === 0 || w === 6
}
/** Sin fines de semana (10 oct 2026, el engrane): el primer día hábil desde `dia` hacia adelante (o hacia atrás con `-1`). */
export function habil(dia: string, sentido: 1 | -1 = 1): string {
  let d = dia
  while (esFinDeSemana(d)) d = sumarDia(d, sentido)
  return d
}
/** `n` días hábiles después (o antes, con `n` negativo) de un día hábil. */
export function sumarHabiles(dia: string, n: number): string {
  let d = habil(dia, n < 0 ? -1 : 1), k = Math.abs(n)
  const paso = n < 0 ? -1 : 1
  while (k > 0) { d = sumarDia(d, paso); if (!esFinDeSemana(d)) k-- }
  return d
}
/** Mover la ventana `n` días: corridos, o solo hábiles si los fines de semana no se ven. */
export const moverDias = (dia: string, n: number, finDeSemana = true) => finDeSemana ? sumarDia(dia, n) : sumarHabiles(dia, n)
/** Los días que se ven desde `inicio`: `n` corridos o `n` hábiles. */
export const diasVisibles = (inicio: string, n: number, finDeSemana = true) =>
  finDeSemana ? diasDesde(inicio, n) : Array.from({ length: n }, (_, i) => sumarHabiles(habil(inicio), i))
/** Cuántas columnas se ven: sin fines de semana, siete días son cinco. */
export const columnasDe = (n: number, finDeSemana = true) => finDeSemana ? n : Math.min(n, 5)

/** Los días que pinta el riel: la ventana y un colchón a cada lado para que el trackpad deslice sin esperar a nadie. */
export function diasDelRiel(base: string, n: number, colchon = Math.max(7, n * 2), finDeSemana = true): string[] {
  if (finDeSemana) return diasDesde(sumarDia(base, -colchon), n + colchon * 2)
  const desde = sumarHabiles(habil(base), -colchon)
  return Array.from({ length: n + colchon * 2 }, (_, i) => sumarHabiles(desde, i))
}

/**
 * Cuánto mide en pantalla un px del riel (10 oct 2026): `getBoundingClientRect` mide en pantalla y `scrollLeft` en px del propio
 * elemento; con el zoom de la interfaz o de la ventana difieren. Las posiciones de las columnas se dividen entre esto.
 */
export function escalaVisual(visual: number, propio: number): number {
  return visual > 0 && propio > 0 && Number.isFinite(visual / propio) ? visual / propio : 1
}

/** El ancho de un día en px enteros: lo útil (sin el canal de horas) entre los días a la vista, hacia abajo. Nunca menos de 1. */
export function columnaEntera(ancho: number, canal: number, porVista: number): number {
  return porVista > 0 && ancho > canal ? Math.max(1, Math.floor((ancho - canal) / porVista)) : 1
}

/** La columna en la que se asienta el riel: la más cercana al borde izquierdo visible. */
export function columnaCercana(bordes: readonly number[], scroll: number): number {
  let mejor = 0
  for (let i = 1; i < bordes.length; i++) if (Math.abs(bordes[i] - scroll) < Math.abs(bordes[mejor] - scroll)) mejor = i
  return mejor
}

/**
 * Cuántos días se ven a la vez (10 oct 2026, Daniel: «¿cómo luce con más días? tal vez 4, 7»; y en el engrane, 1 · 3 · 4 · 7).
 * Por defecto, en el panel o el teléfono, los que quepan con al menos 110 px por columna (3, 4 o 7); a tamaño completo, 7.
 */
export const DIAS_VISTA = [1, 3, 4, 7] as const
export type DiasVista = typeof DIAS_VISTA[number]
export const COLUMNA_MIN = 110
export function diasQueCaben(anchoUtil: number): DiasVista {
  return ([7, 4, 3] as const).find(n => anchoUtil / n >= COLUMNA_MIN) ?? 3
}
/**
 * «Auto», el default del engrane (10 oct 2026, Daniel: «giro el celular y veo los siete»). Cuántos días caben según el ancho útil
 * (sin el canal de horas), con la columna más angosta que todavía se lee a cada número: siete desde ~96 px por día (teléfono
 * horizontal, ventana ancha), cinco desde 104 (anchos intermedios: un panel ancho, una ventana a media pantalla), cuatro desde
 * 110 (el panel de ~520 px) y tres por debajo (teléfono vertical, panel angosto). Se recalcula al rotar o redimensionar.
 */
export type DiasAuto = 3 | 4 | 5 | 7
export const UMBRAL_AUTO: readonly (readonly [DiasAuto, number])[] = [[7, 96], [5, 104], [4, 110]]
export function diasAuto(anchoUtil: number): DiasAuto {
  return UMBRAL_AUTO.find(([n, min]) => anchoUtil / n >= min)?.[0] ?? 3
}

/**
 * Al cambiar cuántas columnas se ven (rotar el teléfono, el engrane), la ventana no se pierde: si hoy estaba a la vista sigue a la
 * vista; con la semana completa, desde su lunes (o su primer día hábil); con menos días, desde hoy o desde el primero que se veía.
 * `antes` y `nuevo` son columnas (sin fines de semana, siete días son cinco columnas).
 */
export function reencuadrar(inicio: string, antes: number, nuevo: number, hoy: string, finDeSemana = true): string {
  if (antes === nuevo) return inicio
  const vis = diasVisibles(inicio, antes, finDeSemana), foco = vis.includes(hoy) ? hoy : vis[0]
  if (nuevo >= (finDeSemana ? 7 : 5)) return finDeSemana ? lunesDe(foco) : habil(lunesDe(foco))
  return foco
}

/**
 * El alto de una hora de la rejilla (px), el mismo que pinta el CSS: el título de cada bloque se ajusta a lo que cabe de verdad.
 * Enfoque gana alto; la densidad compacta lo pierde; en angosto, un poco menos.
 */
export function altoHora({ angosto = false, amplia = false, compacta = false }: { angosto?: boolean; amplia?: boolean; compacta?: boolean }): number {
  if (compacta) return amplia ? 46 : angosto ? 32 : 34
  if (amplia) return angosto ? 54 : 58
  return angosto ? 42 : 44
}

/**
 * Cuántas líneas del título caben en un bloque (10 oct 2026, Daniel: «nada de 9 letras y puntos suspensivos»; como Google, el título
 * envuelve en varias líneas). `alto` es lo útil del bloque en px (sin relleno), `linea` el alto de una línea del título y `hora` el
 * de la línea de la hora. El título manda: la hora entra solo si el título completo (`necesarias` líneas) cabe junto a ella; si no,
 * todo el alto es del título. Cero líneas: el bloque es tan corto que solo se pinta el color.
 */
export function lineasDeTitulo(alto: number, linea: number, hora = 0, necesarias = 1): { lineas: number; conHora: boolean } {
  if (hora > 0 && alto - hora >= linea * Math.max(1, necesarias)) return { lineas: Math.max(1, Math.floor((alto - hora) / linea)), conHora: true }
  return { lineas: Math.max(0, Math.floor(alto / linea)), conHora: false }
}

/**
 * Cuántas líneas pide un título en un ancho dado (estimación sin DOM: ~0.56 em por letra en la sans de la casa, palabras enteras y
 * las que no caben partidas con guion). Sirve para decidir si la hora cabe sin cortarle el título.
 */
export function lineasNecesarias(texto: string, ancho: number, letra: number): number {
  const porLinea = Math.max(3, Math.floor(ancho / (letra * 0.56)))
  let lineas = 0, usado = porLinea
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (usado + 1 + palabra.length <= porLinea) { usado += 1 + palabra.length; continue }
    lineas += Math.ceil(palabra.length / porLinea)
    usado = palabra.length % porLinea || porLinea
  }
  return Math.max(1, lineas)
}

/** Por debajo de este ancho por columna (7 días en el teléfono) la Semana es compacta: tocar un bloque abre el día. */
export const COLUMNA_COMPACTA = 64

/** «09:30», «21:00». Redondea el minuto entero antes de partirlo: 18:59.6 es «19:00», nunca «18:60». */
export const hhmm = (minuto: number) => { const m = Math.round(minuto); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

/** Los datos de la actualización al mover o estirar un elemento en la rejilla: evento con hora (deja de ser de día completo) o tarea con hora y duración. */
export function datosDeMovimiento(item: PlanItem, inicio: Date, fin: Date): Record<string, unknown> {
  return item.kind === 'event'
    ? { ...eventData(item), start: inicio.toISOString(), end: fin.toISOString(), allDay: false }
    : { ...taskData(item), due: inicio.toISOString(), durationMinutes: Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 60_000)) }
}
