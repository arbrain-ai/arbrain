/**
 * Business Intelligence (7 nov 2026) · el modelo: la gráfica fijada como especificación, lo que devuelve el servidor y
 * cómo se LEE (corredor de lo normal, la señal algedónica, la frase, la anotación de Levy y la única excepción).
 *
 * La gráfica no guarda números: guarda {pregunta, consulta, tipo, fuente, creada, por}. El panel la pinta y la recalcula al
 * abrir. Levy la escribe en `.claude/memory/project/mi-negocio/bi.json` (contrato: arbrain/docs/bi/README.md).
 *
 * Lo normal de cada número sale de SU historia: los 28 días anteriores a cada punto (mínimo 14 medidos; con menos, «aprendiendo»).
 * El corredor es su p10–p90. Salirse del corredor por menos de medio ancho es «rozar» (se marca, no suena). Salirse por medio
 * ancho o más es la señal: placer (oro) si va hacia donde es bueno, dolor (rojo) si va en contra (Beer: algos + hedos).
 * Lógica pura (sin React ni fs): la usan la vista, la API, la CLI y node:test.
 */
import { cifraDe, consultaEn, esDinero, esVentana, palabraDe, type Consulta, type Tipo, type Ventana } from './catalogo'

export const ESQUEMA_BI = 'arbrain.bi/v1'
/** La única ruta donde el panel busca sus gráficas, relativa a la raíz del cerebro. */
export const RUTA_BI = '.claude/memory/project/mi-negocio/bi.json'
export const HISTORIA = 28
export const MINIMO = 14

// ── La especificación ──

export type EstadoGrafica = 'fijada' | 'respuesta'
export interface Grafica {
  id: string
  /** La pregunta, en palabras del dueño: es el título de la gráfica. */
  pregunta: string
  /** La consulta permitida y su parámetro. */
  consulta: { id: string; ventana: Ventana }
  tipo: Tipo
  /** De dónde sale (el sello). Por defecto, la fuente de la consulta. */
  fuente: string
  /** ISO con zona. */
  creada: string
  /** Quién la creó: «Levy» o el dueño. */
  por: string
  /** `respuesta`: Levy acaba de contestar y espera «Fijar». `fijada`: vive en el tablero. */
  estado: EstadoGrafica
  /** Lo que Levy leyó al crearla (texto suyo, fechado por `creada`; los números vivos los pone el panel). */
  lectura?: string
  /** Lo que haría Levy. */
  propone?: string
}
export interface ArchivoBI { esquema: typeof ESQUEMA_BI; graficas: Grafica[] }

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const txt = (x: unknown, max = 400): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max
export const ID_GRAFICA = /^[a-z0-9][a-z0-9-]{2,59}$/

/**
 * Lo que exige el contrato contra el catálogo vigente (el del autor o el genérico: lo da servidor.ts), con errores en palabras
 * (Levy los lee para corregir). Las válidas se pintan aunque otras fallen.
 */
export function validarBI(x: unknown, catalogo: readonly Consulta[]): { graficas: Grafica[]; errores: string[] } {
  const errores: string[] = []
  if (!obj(x)) return { graficas: [], errores: ['El archivo no es un objeto JSON.'] }
  if (x.esquema !== ESQUEMA_BI) errores.push(`«esquema» debe ser «${ESQUEMA_BI}».`)
  if (!Array.isArray(x.graficas)) return { graficas: [], errores: [...errores, 'Falta «graficas» (una lista).'] }
  const graficas: Grafica[] = []
  const vistos = new Set<string>()
  x.graficas.forEach((g, i) => {
    const e = errorDeGrafica(g, `Gráfica ${i + 1}`, catalogo)
    if (e.length) { errores.push(...e); return }
    const gr = g as unknown as Grafica
    if (vistos.has(gr.id)) { errores.push(`Gráfica ${i + 1}: el id «${gr.id}» está repetido.`); return }
    vistos.add(gr.id)
    graficas.push(gr)
  })
  return { graficas, errores }
}

export function errorDeGrafica(g: unknown, n: string, catalogo: readonly Consulta[]): string[] {
  if (!obj(g)) return [`${n}: no es un objeto.`]
  const e: string[] = []
  if (typeof g.id !== 'string' || !ID_GRAFICA.test(g.id)) e.push(`${n}: «id» en minúsculas, números y guiones (3 a 60).`)
  if (!txt(g.pregunta, 200)) e.push(`${n}: falta «pregunta» (hasta 200 caracteres).`)
  const c = obj(g.consulta) ? g.consulta : null
  const consulta = c && typeof c.id === 'string' ? consultaEn(catalogo, c.id) : null
  if (!c || !consulta) e.push(`${n}: «consulta.id» debe ser del catálogo (${catalogo.map(k => k.id).join(', ')}).`)
  else if (!esVentana(c.ventana) || !consulta.ventanas.includes(c.ventana)) e.push(`${n}: «consulta.ventana» de ${consulta.id} es ${consulta.ventanas.join(' | ')}.`)
  if (consulta && !consulta.tipos.includes(g.tipo as Tipo)) e.push(`${n}: «tipo» de ${consulta.id} es ${consulta.tipos.join(' | ')}.`)
  if (!txt(g.fuente, 160)) e.push(`${n}: falta «fuente».`)
  if (typeof g.creada !== 'string' || Number.isNaN(Date.parse(g.creada))) e.push(`${n}: «creada» debe ser una fecha ISO.`)
  if (!txt(g.por, 40)) e.push(`${n}: falta «por».`)
  if (g.estado !== 'fijada' && g.estado !== 'respuesta') e.push(`${n}: «estado» es «fijada» o «respuesta».`)
  if (g.lectura !== undefined && !txt(g.lectura, 400)) e.push(`${n}: «lectura» es texto de hasta 400 caracteres.`)
  if (g.propone !== undefined && !txt(g.propone, 300)) e.push(`${n}: «propone» es texto de hasta 300 caracteres.`)
  return e
}

/** Un id legible a partir de la pregunta («que-video-trajo-mas-pagos»), único frente a los existentes. */
export function idDePregunta(pregunta: string, existentes: Iterable<string>): string {
  const base = pregunta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '') || 'grafica'
  const ya = new Set(existentes)
  let id = base.length >= 3 ? base : `grafica-${base}`, k = 2
  while (ya.has(id)) id = `${base}-${k++}`
  return id
}

/** El mensaje que recibe Levy: la pregunta tal cual y el contrato (dónde está el catálogo y cómo se escribe la respuesta). */
export function mensajeParaLevy(pregunta: string): string {
  return [
    `Pregunta para Business Intelligence: «${pregunta.trim()}»`,
    'Contéstala con una gráfica del panel: elige la consulta del catálogo (`npm --prefix arbrain run bi -- catalogo`) y escríbela con `npm --prefix arbrain run bi -- responder --pregunta "…" --consulta <id> [--ventana 7|30|90] [--tipo …] --lectura "lo que ves" --propone "lo que harías"`.',
    'Contrato: arbrain/docs/bi/README.md. Si la pregunta no cabe en el catálogo, dímelo aquí y propón la consulta que faltaría; si la consulta no tiene fuente todavía, dime qué la conectaría (`npm --prefix arbrain run bi -- fuentes`). Nada de SQL libre en el panel.',
  ].join('\n')
}

// ── Las acciones del panel sobre el archivo (puras: reciben y devuelven el archivo) ──

export type Accion = { accion: 'fijar' | 'soltar' | 'descartar'; id: string } | { accion: 'mover'; id: string; a: number }

export function aplicar(a: ArchivoBI, acc: Accion): { archivo: ArchivoBI } | { error: string } {
  const i = a.graficas.findIndex(g => g.id === acc.id)
  if (i < 0) return { error: `No existe la gráfica «${acc.id}».` }
  const g = a.graficas[i]
  const resto = a.graficas.filter((_, k) => k !== i)
  if (acc.accion === 'fijar') {
    if (g.estado === 'fijada') return { archivo: a }
    // La recién fijada entra al principio del tablero: es lo que el dueño acaba de preguntar.
    return { archivo: { ...a, graficas: [{ ...g, estado: 'fijada' }, ...resto] } }
  }
  if (acc.accion === 'soltar' || acc.accion === 'descartar') return { archivo: { ...a, graficas: resto } }
  const fijadas = resto.filter(x => x.estado === 'fijada'), otras = resto.filter(x => x.estado !== 'fijada')
  const pos = Math.max(0, Math.min(fijadas.length, Math.round(acc.accion === 'mover' ? acc.a : 0)))
  fijadas.splice(pos, 0, g)
  return { archivo: { ...a, graficas: [...fijadas, ...otras] } }
}

// ── Lo que devuelve el servidor ──

export interface Punto { fecha: string; valor: number | null }
export interface Barra { id: string; etiqueta: string; valor: number }
export type Datos =
  | { forma: 'serie'; puntos: Punto[] }
  | { forma: 'barras'; barras: Barra[]; resto?: Barra; total?: number }
  | { forma: 'embudo'; pasos: Barra[] }
export interface RespuestaConsulta {
  ok: true; consulta: string; ventana: Ventana; datos: Datos; leidoEn: string
  /** Hasta qué día llega el dato (el último día cerrado). */
  hasta?: string
  simulado?: boolean
  aviso?: string
}

// ── Fechas (civiles, AAAA-MM-DD, sin zona) ──

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const civil = (f: string) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
export const fechaCorta = (f: string) => { const d = civil(f); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` }
export const diaYMes = (f: string) => { const d = civil(f); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` }
export const mesLargo = (f: string) => MESES_LARGOS[civil(f).getUTCMonth()]
export function sumarDias(f: string, n: number): string {
  const d = civil(f); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── El corredor de lo normal ──

export interface Corredor { lo: number; hi: number; med: number; n: number }
export type Lado = 'arriba' | 'abajo'
export type Tono = 'dolor' | 'placer' | 'atencion'

function cuantil(ordenados: number[], q: number): number {
  const p = (ordenados.length - 1) * q, a = Math.floor(p), b = Math.ceil(p)
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (p - a)
}

/** El corredor del punto i: p10–p90 de los 28 días anteriores medidos. null = menos de 14 medidos («aprendiendo»). */
export function corredor(valores: (number | null)[], i: number): Corredor | null {
  const ventana = valores.slice(Math.max(0, i - HISTORIA), i).filter((v): v is number => v !== null && Number.isFinite(v))
  if (ventana.length < MINIMO) return null
  const o = [...ventana].sort((a, b) => a - b)
  return { lo: cuantil(o, 0.1), hi: cuantil(o, 0.9), med: cuantil(o, 0.5), n: ventana.length }
}

/** Cuánto se sale un valor de su corredor, en anchos de corredor. El ancho tiene piso: 1 unidad o el 15 % de la mediana. */
export function exceso(v: number, c: Corredor): { exceso: number; lado: Lado | null } {
  const ancho = Math.max(c.hi - c.lo, 1, Math.abs(c.med) * 0.15)
  if (v > c.hi) return { exceso: (v - c.hi) / ancho, lado: 'arriba' }
  if (v < c.lo) return { exceso: (c.lo - v) / ancho, lado: 'abajo' }
  return { exceso: 0, lado: null }
}
export const UMBRAL = 0.5

export const tonoDe = (lado: Lado, mejor: Consulta['mejor']): Tono => mejor === null ? 'atencion' : lado === mejor ? 'placer' : 'dolor'

// ── La lectura de una gráfica ──

export type Estado = 'calma' | 'roza' | 'fuera' | 'aprendiendo' | 'sin-datos'
export interface PuntoLeido { fecha: string; valor: number | null; corredor: Corredor | null; exceso: number; lado: Lado | null }
export interface Senal { tono: Tono; lado: Lado; exceso: number; fecha: string; valor: number; corredor: Corredor; veces: number | null; record: boolean; dias: number }
export interface Lectura {
  estado: Estado
  /** La respuesta en una frase, con números de la fuente (la que se lee en voz, en la excepción y en el chat). */
  frase: string
  /** Lo que la tarjeta dice debajo de la cifra: la misma lectura sin repetir el número protagonista. */
  detalle?: string
  /** El número protagonista, ya en texto. */
  cifra?: string
  sub?: string
  senal?: Senal
  /** La marca de Levy en la gráfica: índice dentro de lo que se pinta (punto visible, barra o paso). */
  anotacion?: { indice: number; texto: string }
  puntos?: PuntoLeido[]
  /** Acumulado: el mes en curso y el anterior, día por día. */
  meses?: { este: (number | null)[]; anterior: (number | null)[]; etiquetaEste: string; etiquetaAnterior: string; dia: number }
  aprendiendo?: { tiene: number; faltan: number }
  barras?: Barra[]
  resto?: Barra
  pasos?: { etiqueta: string; valor: number; paso: number | null }[]
}

/** Porcentaje legible: con un decimal debajo de 10 % (1.5 %, no «1 %»). */
const pct = (n: number) => { const p = n * 100; return `${p > 0 && p < 10 ? (Math.round(p * 10) / 10).toLocaleString('es-MX') : Math.round(p)} %` }
const may = (t: string) => (t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t)
/** La cifra con su palabra («9 ventas»); el dinero ya dice su moneda y no lleva palabra. */
const cuanto = (n: number, c: Consulta) => (esDinero(c) ? cifraDe(n, c) : `${cifraDe(n, c)} ${palabraDe(c, n)}`)

export function leer(c: Consulta, tipo: Tipo, ventana: Ventana, datos: Datos | undefined): Lectura {
  if (!datos) return { estado: 'sin-datos', frase: 'Sin datos todavía.' }
  if (datos.forma === 'serie') return tipo === 'acumulado' ? leerAcumulado(c, datos.puntos) : leerSerie(c, ventana, datos.puntos)
  if (datos.forma === 'embudo') return leerEmbudo(c, datos.pasos)
  return leerBarras(c, tipo, datos.barras, datos.resto)
}

function leerSerie(c: Consulta, ventana: Ventana, puntos: Punto[]): Lectura {
  const valores = puntos.map(p => p.valor)
  const desde = Math.max(0, puntos.length - ventana)
  const vis: PuntoLeido[] = puntos.slice(desde).map((p, k) => {
    const i = desde + k, cor = corredor(valores, i)
    const ex = p.valor !== null && cor ? exceso(p.valor, cor) : { exceso: 0, lado: null }
    return { fecha: p.fecha, valor: p.valor, corredor: cor, ...ex }
  })
  const medidos = vis.filter(p => p.valor !== null)
  if (!medidos.length) return { estado: 'sin-datos', frase: 'La fuente no trae días medidos en esta ventana.', puntos: vis }
  const ultimo = medidos[medidos.length - 1]
  const iUlt = vis.lastIndexOf(ultimo), gUlt = desde + iUlt
  const v = ultimo.valor as number
  const quien = `${fechaCorta(ultimo.fecha)}: ${cifraDe(v, c)}${esDinero(c) ? '' : ` ${palabraDe(c, v)}`}`
  const total = medidos.reduce((s, p) => s + (p.valor as number), 0)
  // Un promedio o un saldo no se suman: «En 30 días» solo va en lo que se acumula.
  const acumulable = c.unidad !== 'suscripciones' && c.id !== 'mrr' && c.id !== 'ticket-promedio'
  const sub = `${esDinero(c) ? '' : `${palabraDe(c, v)} · `}${fechaCorta(ultimo.fecha)}`
  const enVentana = acumulable ? ` En ${ventana} días: ${cifraDe(total, c)}.` : ''
  const base: Lectura = { estado: 'calma', frase: '', cifra: cifraDe(v, c), sub, puntos: vis }

  if (!ultimo.corredor) {
    const tiene = valores.slice(Math.max(0, gUlt - HISTORIA), gUlt).filter(x => x !== null).length
    return { ...base, estado: 'aprendiendo', aprendiendo: { tiene, faltan: Math.max(0, MINIMO - tiene) }, frase: `${may(quien)}. Todavía aprendo qué es normal aquí: ${tiene} de ${MINIMO} días medidos.`, detalle: `Todavía aprendo qué es normal aquí.${enVentana}`, anotacion: { indice: iUlt, texto: 'aprendiendo' } }
  }
  const cor = ultimo.corredor
  const rango = `entre ${cifraDe(cor.lo, c)} y ${cifraDe(cor.hi, c)}`
  if (ultimo.lado && ultimo.exceso >= UMBRAL) {
    const senal = senalDe(c, valores, gUlt, ultimo)
    const como = senal.record ? (ultimo.lado === 'arriba' ? `el día más alto en ${senal.dias} días` : `el día más bajo en ${senal.dias} días`) : (ultimo.lado === 'arriba' ? 'muy por encima de lo normal' : 'muy por debajo de lo normal')
    const veces = senal.veces !== null && senal.veces >= 1.5 ? ` (${senal.veces.toLocaleString('es-MX', { maximumFractionDigits: 1 })} veces lo normal)` : senal.veces !== null && senal.veces > 0 && senal.veces <= 0.67 ? ` (${pct(senal.veces)} de lo normal)` : ''
    return { ...base, estado: 'fuera', senal, frase: `${may(quien)}, ${como}${veces}. Lo normal para ti: ${rango}.`, detalle: `${may(como)}${veces}. Lo normal para ti: ${rango}.`, anotacion: { indice: iUlt, texto: senal.tono === 'placer' ? 'se salió hacia arriba' : senal.tono === 'dolor' ? 'se salió' : 'fuera de lo normal' } }
  }
  if (ultimo.lado) return { ...base, estado: 'roza', frase: `${may(quien)}, rozando el borde ${ultimo.lado === 'arriba' ? 'alto' : 'bajo'} de lo normal (${rango}).`, detalle: `Rozando el borde ${ultimo.lado === 'arriba' ? 'alto' : 'bajo'} de lo normal (${rango}).${enVentana}`, anotacion: { indice: iUlt, texto: 'rozando el borde' } }
  // En calma, la marca va al día más alto de la ventana: lo que el ojo busca primero.
  let iMax = 0
  vis.forEach((p, k) => { if (p.valor !== null && (vis[iMax].valor === null || (p.valor as number) > (vis[iMax].valor as number))) iMax = k })
  return { ...base, estado: 'calma', frase: `${may(quien)}. Dentro de lo normal (${rango}).`, detalle: `Dentro de lo normal: ${rango}.${enVentana}`, anotacion: vis[iMax].valor !== null && iMax !== iUlt ? { indice: iMax, texto: `el más alto · ${diaYMes(vis[iMax].fecha)}` } : undefined }
}

function senalDe(c: Consulta, valores: (number | null)[], i: number, p: PuntoLeido): Senal {
  const cor = p.corredor as Corredor, v = p.valor as number
  // ¿Récord? El valor más extremo de los días anteriores medidos (hasta 90).
  const atras = valores.slice(Math.max(0, i - 90), i).filter((x): x is number => x !== null)
  const record = p.lado === 'arriba' ? atras.every(x => v > x) : atras.every(x => v < x)
  return { tono: tonoDe(p.lado as Lado, c.mejor), lado: p.lado as Lado, exceso: p.exceso, fecha: p.fecha, valor: v, corredor: cor, veces: cor.med > 0 ? v / cor.med : null, record, dias: atras.length }
}

function leerAcumulado(c: Consulta, puntos: Punto[]): Lectura {
  const medidos = puntos.filter(p => p.valor !== null)
  if (!medidos.length) return { estado: 'sin-datos', frase: `${c.familia === 'polar' ? 'Polar' : 'La fuente'} no trae cobros en estos dos meses.` }
  const hoy = medidos[medidos.length - 1].fecha
  const mesEste = hoy.slice(0, 7)
  const ant = sumarDias(`${mesEste}-01`, -1).slice(0, 7)
  const acumula = (mes: string, hasta: number) => {
    const out: (number | null)[] = []
    let s = 0
    for (let d = 1; d <= hasta; d++) {
      const f = `${mes}-${String(d).padStart(2, '0')}`
      const p = puntos.find(x => x.fecha === f)
      if (!p) { out.push(d <= Number(hoy.slice(8)) || mes !== mesEste ? s : null); continue }
      s += p.valor ?? 0
      out.push(s)
    }
    return out
  }
  const dia = Number(hoy.slice(8))
  const diasAnt = Number(sumarDias(`${mesEste}-01`, -1).slice(8))
  const este = acumula(mesEste, dia)
  const anterior = acumula(ant, diasAnt)
  const lleva = este[este.length - 1] ?? 0
  const aEsta = anterior[Math.min(dia, diasAnt) - 1] ?? 0
  const delta = aEsta > 0 ? (lleva - aEsta) / aEsta : null
  const comp = delta === null ? 'el mes pasado no trae cobros para comparar' : `a estas alturas de ${mesLargo(`${ant}-01`)} llevabas ${cifraDe(aEsta, c)} (${delta >= 0 ? '+' : '−'}${pct(Math.abs(delta))})`
  return {
    estado: 'calma', cifra: cifraDe(lleva, c), sub: `cobrado en ${mesLargo(hoy)} al ${diaYMes(hoy)}`,
    frase: `Llevas ${cifraDe(lleva, c)} cobrados en ${mesLargo(hoy)}; ${comp}.`,
    detalle: delta === null ? `${may(comp)}.` : `A estas alturas de ${mesLargo(`${ant}-01`)} llevabas ${cifraDe(aEsta, c)}: vas ${pct(Math.abs(delta))} ${delta >= 0 ? 'arriba' : 'abajo'}.`,
    meses: { este, anterior, etiquetaEste: mesLargo(hoy), etiquetaAnterior: mesLargo(`${ant}-01`), dia },
    anotacion: { indice: dia - 1, texto: delta === null ? 'hoy' : `${delta >= 0 ? '+' : '−'}${pct(Math.abs(delta))} contra ${mesLargo(`${ant}-01`)}` },
  }
}

function leerBarras(c: Consulta, tipo: Tipo, barras: Barra[], resto?: Barra): Lectura {
  const orden = [...barras].sort((a, b) => b.valor - a.valor)
  const total = orden.reduce((s, b) => s + b.valor, 0) + (resto?.valor ?? 0)
  if (!orden.length || total === 0) return { estado: 'sin-datos', frase: resto?.valor ? `${cuanto(resto.valor, c)} en la ventana, ninguna con ${c.id === 'paises' ? 'país' : c.id === 'clics-por-video' ? 'video' : c.id === 'lo-mas-vendido' ? 'producto' : 'origen'} registrado: la fuente todavía no lo guarda. No es cero; es un sensor que falta.` : 'Sin registros en esta ventana.', barras: orden, resto }
  const top = orden[0]
  const parte = (x: Barra) => pct(x.valor / total)
  let frase: string, detalle: string
  if (c.id === 'ventas-por-video') {
    const atribuidos = total - (resto?.valor ?? 0)
    frase = `«${top.etiqueta}» trajo ${cuanto(top.valor, c)} de entrada.${resto?.valor ? ` De ${cifraDe(total, c)} pagos, ${cifraDe(resto.valor, c)} no traen video: la atribución es parcial.` : ` De ${cifraDe(atribuidos, c)} pagos atribuidos.`}`
    detalle = resto?.valor ? `De ${cifraDe(total, c)} pagos de entrada, ${cifraDe(resto.valor, c)} no traen video: la atribución es parcial, no cero.` : `De ${cifraDe(atribuidos, c)} pagos de entrada, todos con su video.`
  } else if (tipo === 'proporcion') {
    const otros = orden.slice(1).concat(resto?.valor ? [resto] : [])
    frase = `${may(top.etiqueta)}: ${parte(top)} de ${cuanto(total, c)}.${otros[0] ? ` ${otros.map(o => `${may(o.etiqueta)}, ${parte(o)}`).join('; ')}.` : ''}`
    detalle = otros.length ? `${otros.map(o => `${may(o.etiqueta)}: ${parte(o)}`).join(' · ')}. De ${cuanto(total, c)}.` : `De ${cuanto(total, c)}.`
    return { estado: 'calma', frase, detalle, cifra: parte(top), sub: top.etiqueta.toLocaleLowerCase('es'), barras: orden, resto, anotacion: { indice: 0, texto: parte(top) } }
  } else {
    frase = `${may(top.etiqueta)} va primero con ${cuanto(top.valor, c)} (${parte(top)} del total).`
    detalle = `${parte(top)} de ${cuanto(total, c)}.${orden[1] ? ` Le sigue ${orden[1].etiqueta} con ${parte(orden[1])}.` : ''}`
  }
  return { estado: 'calma', frase, detalle, cifra: cifraDe(top.valor, c), sub: top.etiqueta, barras: orden, resto, anotacion: { indice: 0, texto: `${parte(top)} del total` } }
}

function leerEmbudo(c: Consulta, pasos: Barra[]): Lectura {
  if (!pasos.length || !pasos[0].valor) return { estado: 'sin-datos', frase: 'Nadie entró al embudo en esta ventana.', pasos: pasos.map(p => ({ etiqueta: p.etiqueta, valor: p.valor, paso: null })) }
  const leidos = pasos.map((p, i) => ({ etiqueta: p.etiqueta, valor: p.valor, paso: i === 0 || !pasos[i - 1].valor ? null : p.valor / pasos[i - 1].valor }))
  // La caída que frena: el paso con menor tasa de paso (Goldratt: el más estrecho).
  let iPeor = 1
  for (let i = 2; i < leidos.length; i++) if ((leidos[i].paso ?? 1) < (leidos[iPeor].paso ?? 1)) iPeor = i
  const a = leidos[iPeor - 1], b = leidos[iPeor]
  const fin = leidos[leidos.length - 1]
  return {
    estado: 'calma', cifra: pct(fin.valor / leidos[0].valor), sub: `de ${cifraDe(leidos[0].valor, c)} llegó al final`, pasos: leidos,
    detalle: `El paso más estrecho: de «${a.etiqueta.toLocaleLowerCase('es')}» a «${b.etiqueta.toLocaleLowerCase('es')}», solo pasa el ${pct(b.paso ?? 0)}.`,
    // Con las fuentes del dueño, los pasos se nombran en pasado («Preguntaron», «Compraron»): la frase los dice tal cual.
    frase: `De ${cifraDe(leidos[0].valor, c)} que ${leidos[0].etiqueta.toLocaleLowerCase('es')}, ${cifraDe(fin.valor, c)} ${c.familia === 'datos' ? '' : 'llegaron a '}${fin.etiqueta.toLocaleLowerCase('es')}. El paso más estrecho: de «${a.etiqueta.toLocaleLowerCase('es')}» a «${b.etiqueta.toLocaleLowerCase('es')}», solo pasa el ${pct(b.paso ?? 0)}.`,
    anotacion: { indice: iPeor, texto: `aquí se cae · pasa ${pct(b.paso ?? 0)}` },
  }
}

// ── La excepción: UNA sube; las demás se cuentan ──

export interface Leida { grafica: Grafica; consulta: Consulta; lectura: Lectura }
export interface Excepcion { principal: Leida; otras: Leida[]; porque: string[]; propone: string }

/** El dolor pesa un poco más que el placer a igual exceso: primero lo que duele (Beer: la señal que no puede esperar). */
export function excepcion(leidas: Leida[]): Excepcion | null {
  const fuera = leidas.filter(l => l.grafica.estado === 'fijada' && l.consulta.alarma && l.lectura.estado === 'fuera' && l.lectura.senal)
  if (!fuera.length) return null
  const peso = (l: Leida) => l.lectura.senal!.exceso * (l.lectura.senal!.tono === 'dolor' ? 1.25 : 1)
  const orden = [...fuera].sort((a, b) => peso(b) - peso(a))
  const principal = orden[0], s = principal.lectura.senal!
  const porque: string[] = []
  const c = principal.consulta
  if (s.record) porque.push(`Es ${s.lado === 'arriba' ? 'el valor más alto' : 'el valor más bajo'} de los últimos ${s.dias} días medidos.`)
  // ¿De golpe o venía así? Los 7 días visibles anteriores.
  const pts = principal.lectura.puntos ?? []
  const i = pts.findIndex(p => p.fecha === s.fecha)
  const antes = pts.slice(Math.max(0, i - 7), i).filter(p => p.valor !== null && p.corredor)
  const delLado = antes.filter(p => (s.lado === 'abajo' ? (p.valor as number) < p.corredor!.med : (p.valor as number) > p.corredor!.med)).length
  if (antes.length >= 5 && antes.every(p => p.exceso < UMBRAL) && delLado < Math.ceil(antes.length * 0.7)) porque.push(`Los ${antes.length} días anteriores estuvieron dentro de lo normal: fue de golpe, no una tendencia.`)
  else if (antes.length >= 5 && delLado >= Math.ceil(antes.length * 0.7)) porque.push(`Ya venía ${s.lado === 'abajo' ? 'bajando' : 'subiendo'}: ${delLado} de los ${antes.length} días anteriores quedaron ${s.lado === 'abajo' ? 'debajo' : 'arriba'} de tu mediana.`)
  // El eco: qué más se salió ese mismo día (en la misma dirección o no). Ahí suele estar la causa.
  const mismoDia = leidas.filter(l => l !== principal && l.lectura.puntos?.some(p => p.fecha === s.fecha && p.lado && p.exceso >= UMBRAL))
  for (const l of mismoDia.slice(0, 2)) {
    const p = l.lectura.puntos!.find(x => x.fecha === s.fecha)!
    porque.push(`Ese mismo día también se salieron «${l.consulta.nombre.toLocaleLowerCase('es')}»: ${cifraDe(p.valor as number, l.consulta)} contra ${cifraDe(p.corredor!.lo, l.consulta)}–${cifraDe(p.corredor!.hi, l.consulta)} de lo normal.`)
  }
  if (!mismoDia.length) {
    porque.push('Ningún otro número fijado se salió ese día: parece algo de este número, no de todo el negocio.')
    // Una caída de golpe, sola y profunda en un número que viene de un rastreo se parece mucho a un rastreo roto.
    if (s.lado === 'abajo' && c.familia !== 'polar' && s.veces !== null && s.veces < 0.5) porque.push(c.familia === 'datos'
      ? 'Antes de buscar la causa en el mercado, confirma que la fuente traiga ese día completo: un archivo exportado a medias o una tabla que dejó de llenarse se ve igual.'
      : 'Antes de buscar la causa en el mercado, confirma que el rastreo siga vivo: un enlace roto o un evento que dejó de llegar se ve igual.')
  }
  const propone = principal.grafica.propone ?? (s.tono === 'atencion' ? 'Pregúntale a Levy qué cambió.' : c.propone?.[s.tono === 'dolor' ? 'dolor' : 'placer'] ?? 'Pregúntale a Levy qué cambió.')
  return { principal, otras: orden.slice(1), porque, propone }
}

/** El resumen que el negocio dice primero (y lo que lee «Escúchalo» al abrir). */
export function titularDe(leidas: Leida[], ex: Excepcion | null): { palabra: string; frase: string } {
  const fijadas = leidas.filter(l => l.grafica.estado === 'fijada')
  const conBanda = fijadas.filter(l => l.consulta.alarma && (l.lectura.estado === 'calma' || l.lectura.estado === 'roza' || l.lectura.estado === 'fuera'))
  const aprendiendo = fijadas.filter(l => l.lectura.estado === 'aprendiendo').length
  if (!fijadas.length) return { palabra: 'Pregúntale', frase: 'Todavía no hay gráficas fijadas. Pregunta algo y la respuesta se queda aquí.' }
  if (ex) {
    const s = ex.principal.lectura.senal!
    const otras = ex.otras.length ? ` Y ${ex.otras.length === 1 ? 'otra más' : `${ex.otras.length} más`} en silencio.` : ''
    const verbo = s.lado === 'abajo' ? (s.veces !== null && s.veces <= 0.5 ? 'se desplomaron' : 'cayeron') : (s.veces !== null && s.veces >= 2 ? 'se dispararon' : 'subieron')
    const nombre = ex.principal.consulta.nombre
    // «Visitas a la página de venta se desplomaron el vie 6 nov.» Concordancia simple: el nombre del catálogo va en plural o singular.
    const plural = /s$/.test(nombre.split(' ')[0])
    const v = plural ? verbo : verbo.replace(/aron$/, 'ó').replace(/ieron$/, 'ió')
    return {
      palabra: s.tono === 'dolor' ? 'Algo se salió' : s.tono === 'placer' ? 'Algo salió de más' : 'Algo cambió',
      frase: `${nombre} ${v} el ${fechaCorta(s.fecha)}: ${cifraDe(s.valor, ex.principal.consulta)} contra ${cifraDe(s.corredor.lo, ex.principal.consulta)}–${cifraDe(s.corredor.hi, ex.principal.consulta)} de lo normal.${otras || ' Lo demás está en calma.'}`,
    }
  }
  const rozan = conBanda.filter(l => l.lectura.estado === 'roza').length
  const dentro = conBanda.length - rozan
  const extra = [rozan ? `${rozan} ${rozan === 1 ? 'roza' : 'rozan'} el borde` : '', aprendiendo ? `${aprendiendo} ${aprendiendo === 1 ? 'todavía aprende' : 'todavía aprenden'} su normal` : ''].filter(Boolean).join(' y ')
  return { palabra: 'En calma', frase: conBanda.length ? `${dentro} de ${conBanda.length} ${conBanda.length === 1 ? 'número vigilado está' : 'números vigilados están'} dentro de lo normal${extra ? `; ${extra}` : ''}.` : 'Nada que vigilar todavía: los números con alarma necesitan 14 días de historia.' }
}
