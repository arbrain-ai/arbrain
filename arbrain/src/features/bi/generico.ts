/**
 * Business Intelligence · el catálogo genérico (8 nov 2026). Daniel: «este mismo sistema les compartiré a mis alumnos». El
 * alumno (consultor de negocios con IA) lo instala a su primer cliente: el motor viaja vacío y el dueño lo conecta a SUS
 * datos, un archivo exportado (CSV o Excel) o su base (Postgres o Supabase), desde `bi-fuentes.json` en su cerebro.
 *
 * El catálogo sigue cerrado: doce preguntas que tiene cualquier negocio (ventas, lo que entró, ticket, clientes, interesados,
 * entregas, gastos, bajas, lo más vendido, de dónde llegan, el embudo). Cada una sabe qué forma tiene (contar, sumar,
 * promediar, acumular el mes, agrupar, pasos) y qué columnas necesita; el archivo de fuentes solo dice DÓNDE están. Nada de
 * SQL libre: los adaptadores (fuentes/) leen columnas con nombre y la cuenta la hace calculo.ts.
 *
 * Una consulta sin fuente no se esconde: sale con `conectada: false` y `falta` dice qué la conectaría («conecta tu fuente»).
 * Contrato: arbrain/docs/bi/README.md. Lógica pura (sin React ni fs): la usan la API, la vista, la CLI y node:test.
 */
import { VENTANAS, type Consulta, type Mejor, type Tipo, type Unidad, type Ventana } from './catalogo'

export const ESQUEMA_FUENTES = 'arbrain.bi-fuentes/v1'
/** Dónde el dueño declara sus fuentes, junto a `bi.json` y `embudo.json` (la misma carpeta «Mi negocio»). */
export const RUTA_FUENTES = '.claude/memory/project/mi-negocio/bi-fuentes.json'
/**
 * Las llaves de las bases (URL con contraseña, api key) NUNCA van en la memoria: van en el entorno o en este archivo, que git
 * ignora (`*.env`). El archivo de fuentes solo nombra la llave (`BI_…`).
 */
export const RUTA_LLAVES = '.claude/bi.env'
export const LLAVE = /^BI_[A-Z0-9_]{1,60}$/
export const MONEDA_POR_DEFECTO = 'MXN'
export const ZONA_POR_DEFECTO = 'America/Mexico_City'

// ── Las formas: lo único que el motor sabe calcular ──

/**
 * `conteo`: filas por día. `suma`: la columna `valor` sumada por día. `promedio`: suma ÷ filas por día (sin filas no hay
 * promedio: sin dato, no cero). `mes`: la suma por día del mes en curso y el anterior. `por`: total por la columna `por` en
 * la ventana. `pasos`: cuántas filas llegan a cada paso del embudo en la ventana.
 */
export type Forma = 'conteo' | 'suma' | 'promedio' | 'mes' | 'por' | 'pasos'
export type Organo = 'marketing' | 'venta' | 'comprador' | 'entrega' | 'finanzas' | 'sistemas'

interface Plantilla {
  id: string; nombre: string; que: string; forma: Forma
  tipo: Tipo; tipos: readonly Tipo[]; unidad: Unidad; mejor: Mejor; alarma: boolean; ventanas: readonly Ventana[]
  palabras?: readonly [string, string]; nota?: string; propone?: { dolor: string; placer: string }; ejemplos: string[]
  /** Qué tiene que decir el archivo de fuentes para conectarla. */
  necesita: ('valor' | 'por')[]
  /** Qué la conectaría, dicho al dueño. */
  falta: string
}

const DIARIA = { tipo: 'linea', tipos: ['linea'], alarma: true, ventanas: VENTANAS } as const

export const PLANTILLAS: readonly Plantilla[] = [
  {
    id: 'ventas', nombre: 'Ventas', que: 'Cuántas ventas hubo cada día: cada fila de la fuente es una venta.', forma: 'conteo', ...DIARIA,
    unidad: 'ventas', mejor: 'arriba', necesita: [],
    falta: 'Una fuente con una fila por venta y su fecha: el reporte de tu punto de venta o de tu tienda (CSV o Excel), o la tabla de pedidos de tu base.',
    propone: {
      dolor: 'Se vendió menos de lo normal: antes de bajar precios, mira si llegó menos gente (arriba del embudo) o si se cayó el cierre (abajo).',
      placer: 'Se vendió más de lo normal: averigua qué lo empujó (una promoción, un canal, la temporada) y repítelo esta semana.',
    },
    ejemplos: ['¿Cuántas ventas tuve esta semana?', '¿Estoy vendiendo más que antes?'],
  },
  {
    id: 'ingresos', nombre: 'Lo que entró por día', que: 'El dinero de las ventas, sumado por día.', forma: 'suma', ...DIARIA,
    unidad: 'dinero', mejor: 'arriba', necesita: ['valor'], nota: 'Es lo que dice tu fuente que se cobró, no la utilidad: los gastos van aparte.',
    falta: 'Tu fuente de ventas con la columna del importe (total, monto o precio).',
    propone: {
      dolor: 'Entró menos dinero de lo normal: cruza con las ventas del mismo día; si se vendió igual, bajó el ticket.',
      placer: 'Entró más dinero de lo normal: mira si fue por más ventas o por ventas más grandes, y cuál de las dos puedes repetir.',
    },
    ejemplos: ['¿Cuánto dinero entró ayer?', '¿Cuánto vendo al día?'],
  },
  {
    id: 'lo-que-entro', nombre: 'Lo que entró este mes', que: 'El dinero acumulado del mes contra el mes pasado a la misma altura.', forma: 'mes',
    tipo: 'acumulado', tipos: ['acumulado', 'linea'], unidad: 'dinero', mejor: 'arriba', alarma: false, ventanas: [30], necesita: ['valor'],
    nota: 'Es lo cobrado según tu fuente, no la utilidad.',
    falta: 'Tu fuente de ventas con la columna del importe (total, monto o precio).',
    ejemplos: ['¿Cuánto dinero entró este mes?', '¿Voy mejor que el mes pasado?'],
  },
  {
    id: 'ticket-promedio', nombre: 'Ticket promedio', que: 'Cuánto deja en promedio cada venta, día por día.', forma: 'promedio', ...DIARIA,
    unidad: 'dinero', mejor: 'arriba', necesita: ['valor'], nota: 'Un día sin ventas no tiene ticket: queda sin dato, no en cero.',
    falta: 'Tu fuente de ventas con la columna del importe (total, monto o precio).',
    propone: {
      dolor: 'Cada venta dejó menos de lo normal: revisa descuentos del día y si se dejó de ofrecer el complemento.',
      placer: 'Cada venta dejó más de lo normal: mira qué se vendió junto y conviértelo en paquete.',
    },
    ejemplos: ['¿Cuánto gasta cada cliente?', '¿Cuál es mi ticket promedio?'],
  },
  {
    id: 'clientes-nuevos', nombre: 'Clientes nuevos', que: 'Clientes que se dieron de alta cada día.', forma: 'conteo', ...DIARIA,
    unidad: 'clientes', mejor: 'arriba', necesita: [],
    falta: 'Una fuente con una fila por cliente y su fecha de alta: tu lista de clientes o la tabla de clientes de tu base.',
    propone: {
      dolor: 'Entraron menos clientes de lo normal: mira si bajaron los interesados o si se atoró la conversión.',
      placer: 'Entraron más clientes de lo normal: dales la bienvenida hoy y pregúntales cómo te encontraron.',
    },
    ejemplos: ['¿Cuántos clientes nuevos tengo?', '¿Estoy ganando clientes?'],
  },
  {
    id: 'interesados', nombre: 'Interesados nuevos', que: 'Personas que preguntaron, agendaron o dejaron sus datos cada día.', forma: 'conteo', ...DIARIA,
    unidad: 'personas', mejor: 'arriba', necesita: [],
    falta: 'Una fuente con una fila por interesado y su fecha: el formulario, el CRM, la agenda o la hoja donde anotas a quien pregunta.',
    propone: {
      dolor: 'Llegaron menos interesados de lo normal: revisa qué canal dejó de traer gente (un anuncio apagado, una publicación que no salió).',
      placer: 'Llegaron más interesados de lo normal: averigua de dónde vinieron y contéstales hoy, mientras están calientes.',
    },
    ejemplos: ['¿Cuánta gente me busca?', '¿Cuántos interesados llegaron esta semana?'],
  },
  {
    id: 'entregas', nombre: 'Entregas', que: 'Pedidos, servicios o sesiones que se entregaron cada día.', forma: 'conteo', ...DIARIA,
    unidad: 'registros', palabras: ['entrega', 'entregas'], mejor: 'arriba', necesita: [],
    falta: 'Una fuente con una fila por entrega y su fecha: la bitácora de pedidos entregados, las citas atendidas o los servicios cerrados.',
    propone: {
      dolor: 'Se entregó menos de lo normal: busca dónde se está atorando el trabajo antes de vender más.',
      placer: 'Se entregó más de lo normal: confirma que la calidad aguantó y anota qué hizo fluir el día.',
    },
    ejemplos: ['¿Estoy cumpliendo lo que vendo?', '¿Cuántas entregas hicimos?'],
  },
  {
    id: 'gastos', nombre: 'Gastos por día', que: 'Lo que salió, sumado por día.', forma: 'suma', ...DIARIA,
    unidad: 'dinero', mejor: 'abajo', necesita: ['valor'],
    falta: 'Una fuente con una fila por gasto, su fecha y su importe: el estado de cuenta o la hoja de gastos.',
    propone: {
      dolor: 'Salió más dinero de lo normal: revisa el gasto más grande del día y si estaba planeado.',
      placer: 'Salió menos dinero de lo normal: confirma que no se quedó un pago pendiente.',
    },
    ejemplos: ['¿Cuánto estoy gastando?', '¿En qué día gasté más?'],
  },
  {
    id: 'bajas', nombre: 'Bajas', que: 'Clientes que cancelaron o se dieron de baja cada día.', forma: 'conteo', ...DIARIA,
    unidad: 'bajas', mejor: 'abajo', necesita: [],
    falta: 'Una fuente con una fila por cancelación y su fecha.',
    propone: {
      dolor: 'Se fueron más de lo normal: llama a quien se fue esta semana y pregúntale por qué, antes de cambiar nada.',
      placer: 'Casi nadie se fue: lo que estés haciendo está reteniendo; anótalo para repetirlo.',
    },
    ejemplos: ['¿Cuántos clientes se van?', '¿Cuánto churn tengo?'],
  },
  {
    id: 'lo-mas-vendido', nombre: 'Lo que más se vende', que: 'Qué producto o servicio deja más, en la ventana.', forma: 'por',
    tipo: 'barras', tipos: ['barras', 'proporcion'], unidad: 'ventas', mejor: null, alarma: false, ventanas: VENTANAS, necesita: ['por'],
    nota: 'Lo que no trae producto en la fuente se cuenta aparte, nunca como cero.',
    falta: 'La fuente de ventas con la columna del producto o servicio (y el importe, si quieres verlo en dinero).',
    ejemplos: ['¿Qué es lo que más vendo?', '¿Qué producto deja más dinero?'],
  },
  {
    id: 'de-donde-llegan', nombre: 'De dónde llegan', que: 'Por qué canal llegó la gente (anuncio, recomendación, redes…), en la ventana.', forma: 'por',
    tipo: 'proporcion', tipos: ['proporcion', 'barras'], unidad: 'personas', mejor: null, alarma: false, ventanas: VENTANAS, necesita: ['por'],
    nota: 'Depende de que cada registro diga su canal; el que no lo dice se cuenta aparte, nunca como cero.',
    falta: 'La fuente de interesados (o de ventas) con la columna del canal u origen.',
    ejemplos: ['¿De dónde llegan mis clientes?', '¿Qué canal me trae más gente?'],
  },
  {
    id: 'embudo', nombre: 'Del interesado al cliente', que: 'Cuántos pasan por cada paso, del primer contacto a la compra.', forma: 'pasos',
    tipo: 'embudo', tipos: ['embudo'], unidad: 'personas', mejor: 'arriba', alarma: false, ventanas: VENTANAS, necesita: [],
    nota: 'Cada paso cuenta registros de su fuente en la ventana; si un paso sale de otra fuente, los nombres no se cruzan.',
    falta: 'Dos o más pasos, cada uno con su fuente (y un filtro si el paso es un estado de la misma tabla): interesados → agendaron → compraron.',
    ejemplos: ['¿Dónde se cae la gente antes de comprar?', '¿Cómo va mi embudo?'],
  },
]

export const plantillaDe = (id: string) => PLANTILLAS.find(p => p.id === id) ?? null

/** Cada órgano de «Tu negocio › El pulso» con la consulta que le da su número (comprador y sistemas tienen su propia fuente). */
export const CONSULTA_DEL_ORGANO: Partial<Record<Organo, string>> = { marketing: 'interesados', venta: 'ventas', entrega: 'entregas', finanzas: 'ingresos' }

// ── El archivo de fuentes del dueño ──

export type TipoFuente = 'csv' | 'excel' | 'postgres' | 'supabase'
export const TIPOS_FUENTE: readonly TipoFuente[] = ['csv', 'excel', 'postgres', 'supabase']
export type FormatoFecha = 'auto' | 'dd/mm/aaaa' | 'mm/dd/aaaa' | 'aaaa-mm-dd'
export const EXTENSIONES: Record<'csv' | 'excel', readonly string[]> = { csv: ['.csv', '.tsv', '.txt'], excel: ['.xlsx'] }

export interface Fuente {
  id: string
  tipo: TipoFuente
  /** Cómo se lee en el sello de la gráfica («Ventas del punto de venta»). */
  nombre?: string
  /** La columna con la fecha de cada fila. */
  fecha: string
  // Archivos
  /** Relativa a la raíz del cerebro (recomendado: `mi-negocio/datos/…`) o absoluta. */
  ruta?: string
  hoja?: string
  separador?: ',' | ';' | '\t'
  decimal?: '.' | ','
  formato_fecha?: FormatoFecha
  // Bases
  /** postgres: la llave con la URL de conexión (`BI_POSTGRES_URL`). */
  conexion?: string
  /** supabase: las llaves con la URL del proyecto y su api key. */
  url?: string
  llave?: string
  /** «tabla» o «esquema.tabla» (una vista también sirve). */
  tabla?: string
}

export interface Filtro { columna: string; es: (string | number)[] }
export interface Paso { etiqueta: string; fuente: string; donde?: Filtro }
export interface Mapeo {
  fuente?: string
  valor?: string
  por?: string
  /**
   * La columna que identifica una venta cuando ocupa varias filas (el folio o el ticket de un reporte por producto): las
   * ventas se cuentan una vez por valor distinto en el día y el ticket promedio se divide entre ellas.
   */
  unico?: string
  donde?: Filtro
  pasos?: Paso[]
  /** Cómo la llama el dueño, si no le dice como el catálogo («Citas nuevas» en vez de «Interesados nuevos»). */
  nombre?: string
  que?: string
  palabras?: [string, string]
}

export interface ArchivoFuentes {
  esquema: typeof ESQUEMA_FUENTES
  negocio?: string
  moneda?: string
  zona?: string
  fuentes: Fuente[]
  consultas: Record<string, Mapeo>
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const txt = (x: unknown, max = 160): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max
/** Nombre de columna o tabla que se puede citar en una base sin escapar nada raro. */
export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
export const TABLA = /^(?:[A-Za-z_][A-Za-z0-9_]{0,62}\.)?[A-Za-z_][A-Za-z0-9_]{0,62}$/
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const esBase = (t: TipoFuente) => t === 'postgres' || t === 'supabase'

function erroresFuente(f: unknown, n: string): string[] {
  if (!obj(f)) return [`${n}: no es un objeto.`]
  const e: string[] = []
  if (typeof f.id !== 'string' || !ID.test(f.id)) e.push(`${n}: «id» en minúsculas, números y guiones (hasta 40).`)
  if (!TIPOS_FUENTE.includes(f.tipo as TipoFuente)) { e.push(`${n}: «tipo» es ${TIPOS_FUENTE.join(', ')}.`); return e }
  const tipo = f.tipo as TipoFuente
  if (f.nombre !== undefined && !txt(f.nombre, 80)) e.push(`${n}: «nombre» es texto de hasta 80 caracteres.`)
  if (!txt(f.fecha, 120)) e.push(`${n}: falta «fecha» (la columna con la fecha de cada fila).`)
  else if (esBase(tipo) && !IDENT.test(f.fecha)) e.push(`${n}: en una base, «fecha» es el nombre exacto de la columna (letras, números y _).`)
  if (tipo === 'csv' || tipo === 'excel') {
    const ext = EXTENSIONES[tipo]
    if (!txt(f.ruta, 400) || f.ruta.includes('\0')) e.push(`${n}: falta «ruta» del archivo (${ext.join(', ')}).`)
    else if (!ext.some(x => f.ruta!.toString().toLowerCase().endsWith(x))) e.push(`${n}: un ${tipo === 'csv' ? 'CSV' : 'Excel'} termina en ${ext.join(', ')}.`)
    if (f.hoja !== undefined && (tipo !== 'excel' || !txt(f.hoja, 120))) e.push(`${n}: «hoja» solo va en un Excel.`)
    if (f.separador !== undefined && ![',', ';', '\t'].includes(f.separador as string)) e.push(`${n}: «separador» es «,», «;» o un tabulador.`)
    if (f.decimal !== undefined && f.decimal !== '.' && f.decimal !== ',') e.push(`${n}: «decimal» es «.» o «,».`)
    if (f.formato_fecha !== undefined && !['auto', 'dd/mm/aaaa', 'mm/dd/aaaa', 'aaaa-mm-dd'].includes(f.formato_fecha as string)) e.push(`${n}: «formato_fecha» es auto, dd/mm/aaaa, mm/dd/aaaa o aaaa-mm-dd.`)
    for (const k of ['conexion', 'url', 'llave', 'tabla']) if (f[k] !== undefined) e.push(`${n}: «${k}» es de una base, no de un archivo.`)
  } else {
    if (typeof f.tabla !== 'string' || !TABLA.test(f.tabla)) e.push(`${n}: «tabla» es «tabla» o «esquema.tabla» (letras, números y _).`)
    const llaves = tipo === 'postgres' ? ['conexion'] : ['url', 'llave']
    for (const k of llaves) if (typeof f[k] !== 'string' || !LLAVE.test(f[k] as string)) e.push(`${n}: «${k}» es el NOMBRE de una llave que empieza con BI_ (el valor va en ${RUTA_LLAVES}, nunca aquí).`)
    if (typeof f.conexion === 'string' && /:\/\//.test(f.conexion)) e.push(`${n}: «conexion» trae una URL: va en ${RUTA_LLAVES} y aquí solo su nombre.`)
    for (const k of ['ruta', 'hoja', 'separador', 'decimal', 'formato_fecha']) if (f[k] !== undefined) e.push(`${n}: «${k}» es de un archivo, no de una base.`)
  }
  return e
}

function erroresFiltro(d: unknown, n: string, columna: (c: unknown) => boolean): string[] {
  if (!obj(d) || !columna(d.columna) || !Array.isArray(d.es) || !d.es.length || d.es.some(v => !(typeof v === 'string' || typeof v === 'number')))
    return [`${n}: «donde» lleva «columna» y «es» (la lista de valores que cuentan).`]
  return []
}

/**
 * Lo que exige el contrato, con errores en palabras (Levy los lee para corregir). Las fuentes y consultas válidas se usan
 * aunque otras fallen: una mala no apaga a las demás.
 */
export function validarFuentes(x: unknown): { archivo: ArchivoFuentes | null; errores: string[] } {
  if (!obj(x)) return { archivo: null, errores: ['El archivo de fuentes no es un objeto JSON.'] }
  const errores: string[] = []
  if (x.esquema !== ESQUEMA_FUENTES) errores.push(`«esquema» debe ser «${ESQUEMA_FUENTES}».`)
  if (x.moneda !== undefined && !(typeof x.moneda === 'string' && /^[A-Z]{3}$/.test(x.moneda))) errores.push('«moneda» es el código de tres letras (MXN, USD, COP…).')
  if (x.zona !== undefined && !(typeof x.zona === 'string' && zonaValida(x.zona))) errores.push('«zona» es una zona horaria como America/Mexico_City.')
  if (x.negocio !== undefined && !txt(x.negocio, 120)) errores.push('«negocio» es texto de hasta 120 caracteres.')
  const fuentes: Fuente[] = []
  const ids = new Set<string>()
  for (const [i, f] of (Array.isArray(x.fuentes) ? x.fuentes : []).entries()) {
    const n = `Fuente ${i + 1}${obj(f) && typeof f.id === 'string' ? ` (${f.id})` : ''}`
    const e = erroresFuente(f, n)
    if (!e.length && ids.has((f as Fuente).id)) e.push(`${n}: «id» repetido.`)
    if (e.length) { errores.push(...e); continue }
    ids.add((f as Fuente).id)
    fuentes.push(f as Fuente)
  }
  if (!Array.isArray(x.fuentes)) errores.push('Falta «fuentes» (una lista; puede ir vacía).')
  const consultas: Record<string, Mapeo> = {}
  if (x.consultas !== undefined && !obj(x.consultas)) errores.push('«consultas» es un objeto: id de la consulta → de dónde sale.')
  const deFuente = (id: unknown) => typeof id === 'string' && ids.has(id)
  for (const [id, m] of Object.entries(obj(x.consultas) ? x.consultas : {})) {
    const p = plantillaDe(id)
    const n = `Consulta «${id}»`
    if (!p) { errores.push(`${n}: no está en el catálogo (${PLANTILLAS.map(k => k.id).join(', ')}).`); continue }
    if (!obj(m)) { errores.push(`${n}: no es un objeto.`); continue }
    const e: string[] = []
    const base = (fid: unknown) => fuentes.find(f => f.id === fid)
    const columna = (fid: unknown) => (c: unknown) => txt(c, 120) && (!base(fid) || !esBase(base(fid)!.tipo) || IDENT.test(c))
    if (p.forma === 'pasos') {
      if (!Array.isArray(m.pasos) || m.pasos.length < 2 || m.pasos.length > 8) e.push(`${n}: «pasos» es una lista de 2 a 8 pasos.`)
      else for (const [k, s] of m.pasos.entries()) {
        if (!obj(s) || !txt(s.etiqueta, 60) || !deFuente(s.fuente)) { e.push(`${n}, paso ${k + 1}: lleva «etiqueta» y una «fuente» declarada.`); continue }
        if (s.donde !== undefined) e.push(...erroresFiltro(s.donde, `${n}, paso ${k + 1}`, columna(s.fuente)))
      }
    } else {
      if (!deFuente(m.fuente)) e.push(`${n}: «fuente» debe ser el id de una fuente declarada${fuentes.length ? ` (${fuentes.map(f => f.id).join(', ')})` : ''}.`)
      for (const k of p.necesita) if (!columna(m.fuente)(m[k])) e.push(`${n}: falta «${k}» (${k === 'valor' ? 'la columna del importe' : 'la columna por la que se agrupa'}).`)
      for (const k of ['valor', 'por', 'unico'] as const) if (m[k] !== undefined && !columna(m.fuente)(m[k])) e.push(`${n}: «${k}» es el nombre de una columna.`)
      if (m.donde !== undefined) e.push(...erroresFiltro(m.donde, n, columna(m.fuente)))
    }
    if (m.nombre !== undefined && !txt(m.nombre, 60)) e.push(`${n}: «nombre» es texto de hasta 60 caracteres.`)
    if (m.que !== undefined && !txt(m.que, 200)) e.push(`${n}: «que» es texto de hasta 200 caracteres.`)
    if (m.palabras !== undefined && !(Array.isArray(m.palabras) && m.palabras.length === 2 && m.palabras.every(w => txt(w, 30)))) e.push(`${n}: «palabras» es [singular, plural] («cita», «citas»).`)
    if (e.length) { errores.push(...e); continue }
    consultas[id] = m as Mapeo
  }
  const archivo: ArchivoFuentes = {
    esquema: ESQUEMA_FUENTES, fuentes, consultas,
    ...(typeof x.negocio === 'string' && txt(x.negocio, 120) ? { negocio: x.negocio } : {}),
    ...(typeof x.moneda === 'string' && /^[A-Z]{3}$/.test(x.moneda) ? { moneda: x.moneda } : {}),
    ...(typeof x.zona === 'string' && zonaValida(x.zona) ? { zona: x.zona } : {}),
  }
  return { archivo, errores }
}

export function zonaValida(z: string): boolean {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: z }); return true } catch { return false }
}

const ETIQUETA_TIPO: Record<TipoFuente, string> = { csv: 'CSV', excel: 'Excel', postgres: 'Postgres', supabase: 'Supabase' }
/** El sello de una fuente («Ventas del punto de venta · CSV»). */
export const selloDe = (f: Fuente) => `${f.nombre ?? f.id} · ${ETIQUETA_TIPO[f.tipo]}`

/** Las fuentes que usa una consulta conectada (una, o la de cada paso). */
export function fuentesDe(a: ArchivoFuentes, id: string): Fuente[] {
  const m = a.consultas[id]
  if (!m) return []
  const ids = m.pasos ? [...new Set(m.pasos.map(p => p.fuente))] : m.fuente ? [m.fuente] : []
  return ids.map(i => a.fuentes.find(f => f.id === i)).filter((f): f is Fuente => !!f)
}

/**
 * El catálogo genérico de ESTE dueño: las doce consultas con lo que diga su archivo (nombre, palabras, moneda, sello) y,
 * para cada una, si ya tiene fuente. Sin archivo, todas salen «sin fuente» con lo que las conectaría.
 */
export function catalogoGenerico(a: ArchivoFuentes | null): Consulta[] {
  const moneda = a?.moneda ?? MONEDA_POR_DEFECTO
  return PLANTILLAS.map(p => {
    const m = a?.consultas[p.id]
    const fuentes = a && m ? fuentesDe(a, p.id) : []
    const conectada = !!m && fuentes.length > 0
    // «Lo que más se vende» sin importe se cuenta en ventas; con importe, en dinero.
    const unidad: Unidad = p.id === 'lo-mas-vendido' && m?.valor ? 'dinero' : p.unidad
    const c: Consulta = {
      id: p.id, nombre: m?.nombre ?? p.nombre, que: m?.que ?? p.que, familia: 'datos',
      fuente: conectada ? fuentes.map(selloDe).join(' + ') : 'Sin fuente todavía',
      tipo: p.tipo, tipos: p.tipos, unidad, mejor: p.mejor, alarma: p.alarma, ventanas: p.ventanas, ejemplos: p.ejemplos,
      conectada, ...(unidad === 'dinero' ? { moneda } : {}),
    }
    const palabras = m?.palabras ?? p.palabras
    if (palabras) c.palabras = palabras
    if (p.nota) c.nota = p.nota
    if (p.propone) c.propone = p.propone
    if (!conectada) c.falta = p.falta
    return c
  })
}

/** Lo que el panel y Levy necesitan de la forma de una consulta genérica. */
export const formaDe = (id: string): Forma | null => plantillaDe(id)?.forma ?? null

/** Un archivo de fuentes vacío y válido (lo siembra la CLI cuando el dueño conecta la primera fuente). */
export const fuentesVacias = (): ArchivoFuentes => ({ esquema: ESQUEMA_FUENTES, moneda: MONEDA_POR_DEFECTO, zona: ZONA_POR_DEFECTO, fuentes: [], consultas: {} })
