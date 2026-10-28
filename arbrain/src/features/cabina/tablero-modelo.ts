/**
 * El tablero de agentes por estado (27 oct 2026, BRECHA §2 y 1:3:1 #2 opción B; ronda 2 con el crítico ciego). Puro,
 * sin React ni red.
 *
 * Un renglón por subagente que Levy lanzó con `delegar`, en cinco estados: te espera, trabajando, listo para revisar,
 * falló y murió. El estado lo decide el agent-server con hechos medidos (`tablero`: proceso vivo y última escritura de
 * su bitácora). Los subagentes viejos de pantalla no traen `tablero`: se leen con la regla de siempre.
 *
 * Ronda 2: cada renglón dice en español qué está haciendo (su último paso, sin llamar a un modelo), cuánto lleva y,
 * al terminar, qué entregó y qué dijo el juez. «Ahora» junta lo que trabaja o necesita algo; «Hecho», lo terminado.
 *
 * Ronda 3 (crítico ciego: «el de X se contradice en sus números»): UNA sola fuente de conteo. El tablero junta todo lo
 * que es un agente (encargos de Levy, tareas internas de sus turnos y sesiones abiertas por ti) y `cuentas()` es lo único
 * que leen el encabezado del Taller, la pestaña «Agentes», «Ahora», «Hecho», sus grupos y la píldora del chat.
 * Regla de tiempo (`VENTANA_MS`, 24 h): «Ahora» muestra lo abierto con proceso vivo (te espera, trabajando) y lo que
 * dio señal en las últimas 24 h; lo terminado reciente va a «Hecho»; lo terminado hace más de 24 h y lo abierto sin
 * proceso ni señal en 24 h (28 oct), al pliegue «Anteriores», que no suma a ninguna pestaña. Los comandos en segundo plano no son agentes: van en sus pliegues («En segundo plano» y «Comandos
 * terminados») con su propia cuenta (el viejo «Terminados hoy 82» eran 82 comandos, no agentes).
 *
 * Ronda 4 (crítico ciego: «agrupa por estado de forma más limpia, y aquí hay demasiadas categorías técnicas»): tres
 * grupos visibles, en palabras de quien no programa. «Te espera» junta lo que necesita una decisión tuya (una pregunta,
 * algo que no pudo terminar, algo que se detuvo); «Trabajando»; «Listo», con el veredicto del juez. Lo demás (comandos en
 * segundo plano, tareas rápidas de Levy, comandos terminados y lo de hace más de 24 h) va plegado en «Más actividad».
 * Las cinco columnas del spec siguen en el modelo (y «murió» se sigue detectando); solo cambia cómo se nombran. El
 * detalle técnico (código de salida, modelo, latido) vive tras «Ver detalles».
 */
import { esAgente, esProceso, preguntaAlgo, esperaALevy, ultimaRespuesta, type Columna, type EstadoTablero, type Juicio, type TareaInterna, type Terminal, type Trabajos, type Veredicto } from './trabajos-modelo'
import { agenteTerminado, resumenInterna, resumenTerminal, unaLinea } from './terminados'
import { actividadLegible, tituloLegible } from './internas-lectura'

export type { Columna }
export const ORDEN_COLUMNAS: Columna[] = ['te-espera', 'trabajando', 'listo', 'falló', 'murió']
/** Cómo se nombra cada estado del modelo. «Falló» y «murió» existen en el modelo; en pantalla se dicen como lo que te toca. */
export const COLUMNA: Record<Columna, { titulo: string; singular: string; plural: string }> = {
  'te-espera': { titulo: 'Te pregunta algo', singular: 'te pregunta algo', plural: 'te preguntan algo' },
  trabajando: { titulo: 'Trabajando', singular: 'trabajando', plural: 'trabajando' },
  listo: { titulo: 'Listo', singular: 'listo', plural: 'listos' },
  'falló': { titulo: 'No pudo terminar', singular: 'no pudo terminar', plural: 'no pudieron terminar' },
  'murió': { titulo: 'Se detuvo sin terminar', singular: 'se detuvo', plural: 'se detuvieron' },
}

/** Los tres grupos visibles (ronda 4). «Te espera» = todo lo que necesita una decisión tuya. */
export type Grupo = 'te-espera' | 'trabajando' | 'listo'
export const ORDEN_GRUPOS: Grupo[] = ['te-espera', 'trabajando', 'listo']
export const GRUPO: Record<Grupo, string> = { 'te-espera': 'Te espera', trabajando: 'Trabajando', listo: 'Listo' }
export const GRUPO_DE: Record<Columna, Grupo> = { 'te-espera': 'te-espera', 'falló': 'te-espera', 'murió': 'te-espera', trabajando: 'trabajando', listo: 'listo' }
/** Los renglones de un grupo, en orden de urgencia: primero las preguntas, luego lo que no pudo terminar, luego lo detenido. */
export function filasDeGrupo(t: Tablero, g: Grupo): FilaTablero[] {
  return ORDEN_COLUMNAS.filter(c => GRUPO_DE[c] === g).flatMap(c => t[c])
}

/** El veredicto del juez en palabras de dueño: qué pasó y, si hace falta, qué te toca. Sin siglas. */
export const VEREDICTO: Record<Veredicto, string> = { cumple: 'Cumple lo pedido', 'no-cumple': 'Le faltó algo · revísalo', 'no-verificable': 'No se pudo comprobar · revísalo tú', 'sin-dod': 'Revísalo tú' }
/** Por qué el juez dijo lo que dijo, para el título del veredicto (sin «DoD» ni «criterio»). */
export const VEREDICTO_POR_QUE: Record<Veredicto, string> = {
  cumple: 'Otro agente, que no vio el trabajo, revisó la entrega contra lo pedido.',
  'no-cumple': 'Otro agente, que no vio el trabajo, revisó la entrega y le faltó algo de lo pedido.',
  'no-verificable': 'Otro agente no pudo comprobar la entrega con lo que dejó.',
  'sin-dod': 'El encargo no decía cuándo estaba terminado: nadie lo pudo comprobar por ti.',
}
/** Lo que se lee mientras el juez no revisa el turno. */
export const SIN_REVISAR = 'Por revisar'

/** Por qué no pudo terminar, en palabras de dueño. El texto técnico se queda en «Ver detalles». */
const RAZONES: [RegExp, string][] = [
  [/encargo nunca le llegó/i, 'el encargo no le llegó'],
  [/\b(vitest|jest|pytest|tests?|pruebas?)\b/i, 'falló al probar'],
  [/\b(typecheck|tsc|compila\w*)\b/i, 'el código no compila'],
  [/\b(build|construi\w*)\b/i, 'falló al armar la app'],
  [/ENOSPC|espacio en disco|no space|disk full/i, 'se quedó sin espacio en disco'],
  [/llave|api key|\btoken\b|\b40[13]\b|unauthori[sz]ed|venci[óo]/i, 'una llave de acceso venció o no sirve'],
  [/ECONN|ETIMEDOUT|network|sin conexión|timeout/i, 'no pudo conectarse'],
]
export function razonHumana(texto: string | null | undefined): string {
  const s = texto ?? ''
  for (const [re, r] of RAZONES) if (re.test(s)) return r
  return 'algo salió mal'
}

/** Ventana de «reciente»: lo terminado hace más de esto sale de los grupos y va a «Anteriores» (dentro de «Más actividad»). */
export const VENTANA_MS = 24 * 3_600_000

/** La columna de una terminal de Levy: la del servidor si la trae; si no, la regla de siempre (pantalla del motor). */
export function columnaDe(t: Terminal): Columna {
  if (t.tablero) return t.tablero.columna
  if (preguntaAlgo(t)) return 'te-espera'
  if (t.estado === 'trabajando') return 'trabajando'
  if (t.conversacion?.error) return 'falló'
  return 'listo'
}

/** Lo que entregó un encargo terminado: un enlace, un archivo o un commit que nombró al cerrar. */
export interface Entregable { tipo: 'enlace' | 'archivo' | 'commit'; valor: string; etiqueta: string }

/** De dónde sale el renglón: un encargo de Levy (`delegar`), una tarea dentro de un turno suyo, una sesión tuya o un comando. */
export type TipoFila = 'encargo' | 'interna' | 'tuya' | 'proceso'
export interface FilaTablero {
  /** Número de la terminal (encargos y sesiones) o id de la tarea interna. */
  id: number | string; tipo: TipoFila; nombre: string; columna: Columna; motivo: string; harness: string; modelo: string | null
  creado: string; origen: string | null; cwd: string
  /** Qué está haciendo o qué hizo, en una frase en español. Nunca la salida cruda. */
  paso: string
  /** Lo último que dijo, en una línea (para el detalle). */
  linea: string | null
  latido: EstadoTablero['latido'] | null
  /** ms epoch en que empezó su turno actual (o cuando nació). */
  desde: number
  /** ms epoch de su último hecho medido (última escritura, fin de la tarea o nacimiento): decide «reciente» o «anterior». */
  fin: number
  juicio: Juicio | null
  entregables: Entregable[]
  /** La pregunta es de Levy (no subió a Daniel): «te espera» la atiende Levy primero. */
  conLevy: boolean
  /** Corta un paso en curso: solo si su proceso trabaja. */
  puedeDetener: boolean
}

const MAYUS = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
/** Respaldo para el servidor viejo: su `ultimaAccion` viene en pasado («corrió un comando», «editó src/a.ts»). */
const PASADO: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^corrió un comando$/, () => 'Corriendo un comando'],
  [/^editó\s*(.*)$/, m => m[1] ? `Editando ${m[1].split('/').at(-1)}` : 'Editando un archivo'],
  [/^escribió\s*(.*)$/, m => m[1] ? `Escribiendo ${m[1].split('/').at(-1)}` : 'Escribiendo un archivo'],
  [/^leyó una página$/, () => 'Leyendo una página web'],
  [/^leyó\s*(.*)$/, m => m[1] ? `Leyendo ${m[1].split('/').at(-1)}` : 'Leyendo un archivo'],
  [/^buscó en la web$/, () => 'Buscando en la web'],
  [/^buscó( archivos)?$/, () => 'Buscando en el código'],
  [/^lanzó un agente$/, () => 'Pidiendo ayuda a otro agente'],
  [/^anotó pendientes$/, () => 'Ordenando sus pendientes'],
  // inglés del motor de pantalla: Bash(...), Read(...)
  [/^Bash\b/, () => 'Corriendo un comando'], [/^(Edit|Write|MultiEdit)\b/, () => 'Editando un archivo'], [/^Read\b/, () => 'Leyendo un archivo'], [/^(Grep|Glob)\b/, () => 'Buscando en el código'],
]
export function pasoDesdeAccion(accion: string | null | undefined): string | null {
  const a = (accion ?? '').trim()
  if (!a) return null
  for (const [re, f] of PASADO) { const m = re.exec(a); if (m) return f(m) }
  // una herramienta de MCP sin traducción («web abrir»): se dice que la usa, sin inventar qué hizo
  return /^[a-z][a-z ]{2,40}$/.test(a) ? `Usando ${a}` : null
}

/** Qué hace o qué hizo, en español y en una frase, según su estado. */
export function pasoDe(t: Terminal, columna: Columna, conLevy: boolean): string {
  const dijo = unaLinea(ultimaRespuesta(t)?.texto) ?? unaLinea(t.ultimas.at(-1))
  if (columna === 'trabajando') return t.tablero?.paso ?? pasoDesdeAccion(t.ultimaAccion) ?? (t.tablero?.latido.ultimaEscritura == null ? 'Arrancando' : 'Pensando')
  if (columna === 'te-espera') return conLevy ? `Levy lo está atendiendo${dijo ? `: ${dijo}` : ''}` : dijo ?? 'Te hizo una pregunta'
  if (columna === 'falló') return `No pudo terminar: ${razonHumana([t.conversacion?.error, t.tablero?.motivo, dijo].filter(Boolean).join(' '))}`
  if (columna === 'murió') {
    const m = t.tablero?.motivo ?? ''
    if (/nunca arrancó/i.test(m)) return 'No llegó a arrancar'
    const callado = /no escribe nada hace (.+)$/i.exec(m)
    return callado ? `Dejó de dar señales hace ${callado[1]}` : 'Se detuvo sin terminar'
  }
  return dijo ?? 'Terminó sin dejar un mensaje'
}

const URL_RE = /https?:\/\/[^\s)>\]`'"«»]+/g
const COMMIT_RE = /\bcommits?\s+`?([0-9a-f]{7,40})\b/gi
const RUTA_RE = /(?:~\/|\/(?:Users|tmp|private)\/|\b(?:docs|src|arbrain|server|tests|scripts|capturas|\.claude)\/)[\w.@+\-/]*\.[A-Za-z0-9]{1,6}\b/g
/** Enlaces, commits y rutas que nombró al cerrar, sin repetir y en el orden en que aparecen (máximo 3). */
export function entregablesDe(texto: string | null | undefined, max = 3): Entregable[] {
  const s = texto ?? ''
  const vistos = new Set<string>(), out: { i: number; e: Entregable }[] = []
  const meter = (i: number, e: Entregable) => { if (!vistos.has(e.valor)) { vistos.add(e.valor); out.push({ i, e }) } }
  for (const m of s.matchAll(URL_RE)) { const v = m[0].replace(/[.,;:]+$/, ''); meter(m.index ?? 0, { tipo: 'enlace', valor: v, etiqueta: recortarMedio(v.replace(/^https?:\/\//, '').replace(/\/$/, ''), 24) }) }
  const sinUrls = s.replace(URL_RE, u => ' '.repeat(u.length))
  for (const m of sinUrls.matchAll(COMMIT_RE)) meter(m.index ?? 0, { tipo: 'commit', valor: m[1], etiqueta: 'Cambios guardados' })
  for (const m of sinUrls.matchAll(RUTA_RE)) { const v = m[0].replace(/[.,;:]+$/, ''); meter(m.index ?? 0, { tipo: 'archivo', valor: v, etiqueta: recortarMedio(v.split('/').at(-1) ?? v) }) }
  return out.sort((a, b) => a.i - b.i).slice(0, max).map(x => x.e)
}

export function filaDe(t: Terminal): FilaTablero {
  if (!t.subagente) return filaDeSesion(t)
  const columna = columnaDe(t)
  const s = t.subagente
  const conLevy = esperaALevy(t)
  const textoFinal = [ultimaRespuesta(t)?.texto, ...t.ultimas].filter(Boolean).join('\n')
  const desde = t.tablero?.desde ?? (Date.parse(s.creado) || Date.now())
  return {
    id: t.id, tipo: 'encargo', nombre: s.nombre, columna, motivo: t.tablero?.motivo ?? (columna === 'trabajando' ? 'Trabajando' : columna === 'te-espera' ? 'Te pregunta algo' : columna === 'falló' ? t.conversacion?.error ?? 'Falló' : 'Terminó su turno'),
    harness: s.harness, modelo: s.modelo ?? t.conversacion?.modelo ?? null, creado: s.creado, origen: s.origen ?? null, cwd: t.cwd,
    paso: pasoDe(t, columna, conLevy),
    linea: unaLinea(ultimaRespuesta(t)?.texto) ?? unaLinea(t.ultimas.at(-1)) ?? null,
    latido: t.tablero?.latido ?? null, desde, fin: t.tablero?.latido.ultimaEscritura ?? desde, juicio: s.juicio ?? null,
    entregables: columna === 'listo' ? entregablesDe(textoFinal) : [], conLevy,
    puedeDetener: t.origen === 'sin-pantalla' && (t.estado === 'trabajando' || !!t.tablero?.latido.procesoVivo) && columna !== 'listo' && columna !== 'falló',
  }
}

/** Una sesión de agente que abriste tú (no la lanzó Levy): misma forma de renglón, sin juez ni acciones. */
export function filaDeSesion(t: Terminal): FilaTablero {
  const columna: Columna = preguntaAlgo(t) ? 'te-espera' : t.estado === 'trabajando' ? 'trabajando' : t.conversacion?.error ? 'falló' : 'listo'
  const desde = t.tablero?.desde ?? Date.now()
  return {
    id: t.id, tipo: 'tuya', nombre: t.conversacion?.titulo || t.titulo, columna, motivo: columna === 'trabajando' ? 'Trabajando' : 'Sesión abierta por ti',
    harness: t.proc, modelo: t.conversacion?.modelo ?? null, creado: new Date(desde).toISOString(), origen: null, cwd: t.cwd,
    paso: columna === 'trabajando' ? pasoDesdeAccion(t.ultimaAccion) ?? 'Trabajando' : columna === 'te-espera' ? unaLinea(ultimaRespuesta(t)?.texto) ?? 'Te hizo una pregunta' : resumenTerminal(t),
    linea: unaLinea(ultimaRespuesta(t)?.texto) ?? null, latido: t.tablero?.latido ?? null, desde, fin: t.tablero?.latido.ultimaEscritura ?? desde,
    juicio: null, entregables: [], conLevy: false, puedeDetener: false,
  }
}

/** Una tarea dentro de un turno de Levy (o un comando en segundo plano). Sin juez: Levy la recibe en su turno. */
export function filaDeInterna(x: TareaInterna): FilaTablero {
  const columna: Columna = x.estado === 'trabajando' ? 'trabajando' : x.estado === 'falló' ? 'falló' : x.estado === 'detenida' ? 'murió' : 'listo'
  const desde = Date.parse(x.desde) || Date.now()
  const act = actividadLegible(x)
  const nombre = tituloLegible(x)
  // La segunda línea no repite el título (muchos comandos solo traen su descripción): entonces dice cómo terminó.
  const dijo = resumenInterna(x)
  const cerro = dijo && dijo !== unaLinea(nombre) && dijo !== nombre ? dijo : columna === 'listo' ? 'Terminó' : columna === 'falló' ? 'No pudo terminar' : 'Se detuvo antes de terminar'
  return {
    id: x.id, tipo: esProceso(x) ? 'proceso' : 'interna', nombre, columna,
    motivo: columna === 'trabajando' ? 'Trabajando' : columna === 'listo' ? 'Terminó' : columna === 'falló' ? 'No pudo terminar' : 'Se detuvo',
    harness: 'claude', modelo: x.modelo ?? null, creado: new Date(desde).toISOString(), origen: x.conversacion || null, cwd: '',
    paso: columna === 'trabajando' ? (act ? MAYUS(act) : 'Trabajando') : cerro,
    linea: null, latido: null, desde, fin: Date.parse(x.fin ?? x.actualizado) || desde,
    juicio: null, entregables: [], conLevy: false, puedeDetener: false,
  }
}

export interface Tablero extends Record<Columna, FilaTablero[]> {
  /** Tareas internas de Levy y sesiones tuyas que terminaron en las últimas 24 h (en «Hecho», plegadas). */
  cortas: FilaTablero[]
  /** Comandos en segundo plano que siguen corriendo (en «Ahora», plegados; no son agentes). */
  procesos: FilaTablero[]
  /** Comandos que terminaron en las últimas 24 h (en «Hecho», plegados; no suman: no son agentes). */
  comandosHechos: FilaTablero[]
  /** Encargos que terminaron, fallaron o murieron hace más de 24 h (pliegue «Anteriores»; no suman a ninguna pestaña). */
  anteriores: FilaTablero[]
}
const abierta = (c: Columna) => c === 'te-espera' || c === 'trabajando'
/**
 * Abierta Y con vida: su proceso sigue (latido del servidor) o es de pantalla sin latido medido. Lo abierto sin proceso
 * y sin señal en 24 h no es «te espera»: es historia (28 oct 2026, Daniel: «Pizarrón… con 21 d» en Te espera; el
 * servidor lo dejaba en `te-espera` 21 días después de que su proceso terminó). Va a «Anteriores», en «Más actividad».
 */
const sigueViva = (f: FilaTablero) => abierta(f.columna) && (f.latido == null || f.latido.procesoVivo)
const vacio = (): Tablero => ({ 'te-espera': [], trabajando: [], listo: [], 'falló': [], 'murió': [], cortas: [], procesos: [], comandosHechos: [], anteriores: [] })

/**
 * Todo lo que es un agente, por columna; lo más reciente primero. `conversacion` filtra por origen (la píldora del chat):
 * `undefined` = todos (el Taller); `null` o vacío = ninguna conversación abierta (no cuenta nada). Las sesiones tuyas no
 * tienen conversación de Levy: solo entran en el Taller.
 */
export function armarTablero(d: Trabajos | undefined, conversacion?: string | null, ahora = Date.now()): Tablero {
  const t = vacio()
  const id = (x: string | null | undefined) => (x ?? '').replace(/^sdk:/, '')
  if (conversacion !== undefined && !conversacion) return t
  const deAqui = (origen: string | null | undefined) => conversacion === undefined || id(origen) === id(conversacion)
  const reciente = (f: FilaTablero) => ahora - f.fin < VENTANA_MS
  for (const term of d?.terminales ?? []) {
    if (term.subagente) {
      if (!deAqui(term.subagente.origen)) continue
      const f = filaDe(term)
      if (reciente(f) || sigueViva(f)) t[f.columna].push(f); else t.anteriores.push(f)
    } else if (conversacion === undefined && esAgente(term)) {
      const f = filaDeSesion(term)
      if (!agenteTerminado(term)) t[f.columna].push(f); else if (reciente(f)) t.cortas.push(f)
    }
  }
  for (const x of d?.internas ?? []) {
    if (!deAqui(x.conversacion)) continue
    const f = filaDeInterna(x)
    if (f.tipo === 'proceso') { if (x.estado === 'trabajando') t.procesos.push(f); else if (reciente(f)) t.comandosHechos.push(f); continue }
    if (x.estado === 'trabajando') t.trabajando.push(f)
    else if (reciente(f)) t.cortas.push(f)
  }
  const nuevo = (a: FilaTablero, b: FilaTablero) => b.desde - a.desde
  for (const c of ORDEN_COLUMNAS) t[c].sort(nuevo)
  t.procesos.sort(nuevo)
  for (const l of [t.cortas, t.comandosHechos, t.anteriores]) l.sort((a, b) => b.fin - a.fin)
  return t
}

/**
 * La única fuente de conteo (ronda 3; grupos de la ronda 4). Encabezado, pestaña «Agentes», cada grupo y la píldora leen
 * de aquí. `trabajando` = renglones de «Trabajando»; `espera` = renglones de «Te espera» (preguntas + no pudo terminar +
 * se detuvo); `listos` = «Listo»; `mas` = lo plegado en «Más actividad» (procesos, tareas rápidas, comandos terminados y
 * anteriores), que no suma a los grupos.
 */
export interface Cuentas {
  trabajando: number; teEspera: number; preguntan: number; fallo: number; murio: number; listos: number; cortas: number
  procesos: number; comandosHechos: number; anteriores: number; espera: number; mas: number
}
export function cuentas(t: Tablero): Cuentas {
  const n = (c: Columna) => t[c].length
  return {
    trabajando: n('trabajando'), teEspera: n('te-espera'), preguntan: t['te-espera'].filter(f => !f.conLevy).length,
    fallo: n('falló'), murio: n('murió'), listos: n('listo'), cortas: t.cortas.length, procesos: t.procesos.length, comandosHechos: t.comandosHechos.length, anteriores: t.anteriores.length,
    espera: n('te-espera') + n('falló') + n('murió'), mas: t.procesos.length + t.cortas.length + t.comandosHechos.length + t.anteriores.length,
  }
}
export const totalTablero = (t: Tablero) => { const c = cuentas(t); return c.espera + c.trabajando + c.listos + c.mas }

/** Recorta un nombre largo por el centro y conserva la extensión: «taller-clar…80.png», nunca «taller-claro-1280.pn». */
export function recortarMedio(texto: string, max = 20): string {
  if (texto.length <= max) return texto
  const resto = max - 1, frente = Math.ceil(resto * 0.55)
  return `${texto.slice(0, frente)}…${texto.slice(texto.length - (resto - frente))}`
}

/** El resumen de la píldora: «2 trabajando · 1 sin terminar · 1 listo», en el orden de lectura y solo lo que hay.
 *  Lo que no pudo terminar y lo detenido se dicen juntos («sin terminar»): los dos piden lo mismo de ti. */
export type PartePildora = 'trabajando' | 'pregunta' | 'sin-terminar' | 'listo'
export function resumenPildora(t: Tablero): { parte: PartePildora; n: number; texto: string }[] {
  const sin = t['falló'].length + t['murió'].length
  const partes: { parte: PartePildora; n: number; texto: (n: number) => string }[] = [
    { parte: 'trabajando', n: t.trabajando.length, texto: n => `${n} trabajando` },
    { parte: 'pregunta', n: t['te-espera'].length, texto: n => `${n} ${n === 1 ? 'te pregunta algo' : 'te preguntan algo'}` },
    { parte: 'sin-terminar', n: sin, texto: n => `${n} sin terminar` },
    { parte: 'listo', n: t.listo.length, texto: n => `${n} ${n === 1 ? 'listo' : 'listos'}` },
  ]
  return partes.filter(p => p.n).map(p => ({ parte: p.parte, n: p.n, texto: p.texto(p.n) }))
}

export const duracion = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 86_400_000)} d`

/** Señal reciente: escribió en su bitácora hace menos de 2 min. Solo entonces late el punto. */
export const LATIDO_FRESCO_MS = 2 * 60_000
export function laten(f: Pick<FilaTablero, 'latido' | 'columna'>, ahora = Date.now()): boolean {
  if (f.columna !== 'trabajando') return false
  const u = f.latido?.ultimaEscritura
  return u == null ? !f.latido : ahora - u < LATIDO_FRESCO_MS
}

/** El latido en palabras: «latido hace 40 s» o «sin latido hace 25 min · proceso vivo». null sin medición. */
export function latidoEnPalabras(f: Pick<FilaTablero, 'latido' | 'columna'>, ahora = Date.now()): string | null {
  const l = f.latido
  if (!l) return null
  if (l.ultimaEscritura == null) return l.procesoVivo ? 'proceso vivo, sin bitácora aún' : 'sin proceso ni bitácora'
  const edad = Math.max(0, ahora - l.ultimaEscritura)
  if (f.columna === 'trabajando' || f.columna === 'te-espera') return `${edad > l.umbralMs ? 'sin latido' : 'latido'} hace ${duracion(edad)}${l.procesoVivo ? '' : ' · proceso terminado'}`
  return `última escritura hace ${duracion(edad)}${l.procesoVivo ? ' · proceso vivo' : ' · proceso terminado'}`
}

/** La señal de vida en humano para el renglón: «hace 40 s» si es reciente, «sin señales hace 8 min» si no. */
export function senal(f: Pick<FilaTablero, 'latido' | 'columna'>, ahora = Date.now()): string | null {
  const u = f.latido?.ultimaEscritura
  if (f.columna !== 'trabajando' || u == null) return null
  const edad = Math.max(0, ahora - u)
  return edad < LATIDO_FRESCO_MS ? null : `sin señales hace ${duracion(edad)}`
}

/** El tiempo del renglón: trabajando = cuánto lleva; lo demás = hace cuánto pasó. */
export function tiempoDe(f: Pick<FilaTablero, 'columna' | 'desde' | 'fin'>, ahora = Date.now()): { texto: string; titulo: string } {
  if (f.columna === 'trabajando') return { texto: duracion(Math.max(0, ahora - f.desde)), titulo: `Lleva ${duracion(Math.max(0, ahora - f.desde))} en este turno` }
  const t = duracion(Math.max(0, ahora - f.fin))
  return { texto: t, titulo: `Hace ${t}` }
}

/** Datos de ejemplo SOLO para el modo de demostración explícito (`?demo-tablero=1`, capturas). Nunca se mezclan con datos reales. */
export function demoTablero(ahora = Date.now()): Trabajos {
  const hace = (min: number) => new Date(ahora - min * 60_000).toISOString()
  const lat = (minEscritura: number | null, vivo: boolean) => ({ ultimaEscritura: minEscritura == null ? null : ahora - minEscritura * 60_000, procesoVivo: vivo, edadMs: minEscritura == null ? null : minEscritura * 60_000, umbralMs: 20 * 60_000 })
  const t = (id: number, nombre: string, estado: Terminal['estado'], tablero: EstadoTablero, extra: Partial<NonNullable<Terminal['subagente']>> = {}, dijo = '', creadoMin = id % 100): Terminal => ({
    id, titulo: nombre, cwd: `~/Developer/wt-${id}`, proc: 'claude', estado, actividad: null, ultimaAccion: null, ultimas: [], origen: 'sin-pantalla', soloLectura: true, tablero,
    conversacion: { harness: 'claude', modelo: 'claude-opus-5-5', ctxPct: null, turno: estado === 'trabajando' ? 'trabajando' : 'terminado', pregunta: false, tokens: null, titulo: null, mensajes: dijo ? [{ rol: 'assistant', texto: dijo, herramientas: [] }] : [] },
    subagente: { id, nombre, harness: 'claude', encargo: 'Ejemplo', cwd: `~/Developer/wt-${id}`, creado: hace(creadoMin), modelo: 'claude-opus-5-5', origen: 'demo', ...extra },
  })
  const interna = (id: string, descripcion: string, estado: TareaInterna['estado'], minDesde: number, minFin: number | null, extra: Partial<TareaInterna> = {}): TareaInterna => ({
    id, tipo: 'subagente', descripcion, estado, desde: hace(minDesde), actualizado: hace(minFin ?? 0), ...(minFin != null ? { fin: hace(minFin) } : {}), conversacion: 'demo', turno: 'demo', ...extra,
  })
  const trabajando = (id: number, nombre: string, paso: string, minEscritura: number, minDesde: number) =>
    t(id, nombre, 'trabajando', { columna: 'trabajando', motivo: 'Trabajando', latido: lat(minEscritura, true), paso, desde: ahora - minDesde * 60_000 }, {}, '', minDesde)
  return {
    fuente: 'motor', sfterm: false, servidores: [], servicios: [], leidoEn: new Date(ahora).toISOString(),
    internas: [
      interna('demo-i1', 'revisar los avisos del Studio', 'trabajando', 3, null, { ultimaHerramienta: 'Read' }),
      interna('demo-p1', 'probar el servidor', 'trabajando', 2, null, { tipo: 'comando' }),
      interna('demo-p2', 'subir los cambios', 'completada', 30, 29, { tipo: 'comando', resumen: 'Cambios arriba.' }),
      interna('demo-i2', 'leer la nota del diario', 'completada', 50, 46, { resumen: 'La nota ya estaba procesada; no hubo cambios.' }),
      interna('demo-i3', 'buscar la grabación de ayer', 'falló', 90, 88, { nota: 'No encontró el archivo en Movies.' }),
      // De hace dos días: no cuenta en «Hecho» (ventana de 24 h) y no se lista.
      interna('demo-i4', 'tarea de anteayer', 'completada', 2900, 2890, { resumen: 'Listo.' }),
    ],
    terminales: [
      t(900063, 'borrador del correo de bienvenida', 'esperando', { columna: 'te-espera', motivo: 'Terminó con una pregunta', latido: lat(6, false) }, { escalado: hace(2) }, '¿Lo firmo con tu nombre o como el equipo de Arbrain?', 14),
      trabajando(900041, 'revisar el calendario de la cohorte', 'Leyendo plan-semana-1.md', 0.4, 9),
      trabajando(900052, 'migrar las memorias viejas', 'Editando MEMORY-indice.md', 1, 23),
      trabajando(900053, 'probar el servidor', 'Corriendo las pruebas', 0.2, 4),
      trabajando(900054, 'capturas del tablero', 'Tomando capturas', 1.2, 17),
      trabajando(900055, 'ficha de cada fundador', 'Buscando en el código', 9, 41),
      t(900107, 'armar la app de escritorio', 'esperando', { columna: 'falló', motivo: 'npm test salió con código 1', latido: lat(18, false) }, {}, '3 pruebas fallan en tests/escritorio.', 30),
      t(900118, 'casa 3D', 'esperando', { columna: 'murió', motivo: 'Se detuvo sin terminar su turno (se cerró o se cayó)', latido: lat(95, false) }, {}, '', 120),
      t(900074, 'dejar las pruebas del servidor pasando', 'esperando', { columna: 'listo', motivo: 'Terminó su turno', latido: lat(12, false) }, { juicio: { veredicto: 'cumple', razon: 'Muestra npm test con 0 fallos y el commit.', en: hace(11), modelo: 'claude-sonnet-5-5' } }, 'Listo: 1,214 pruebas pasan. Quedó en el commit 3f2a1c9.', 40),
      t(900085, 'capturas del panel', 'esperando', { columna: 'listo', motivo: 'Terminó su turno', latido: lat(25, false) }, { juicio: { veredicto: 'no-cumple', razon: 'Faltan las capturas a 520 px que pide la definición de terminado.', en: hace(24), modelo: 'claude-sonnet-5-5' } }, 'Tomé las capturas a 1280 en claro y oscuro: docs/builds/capturas/taller-claro-1280.png', 55),
      t(900096, 'investigar precios de la competencia', 'esperando', { columna: 'listo', motivo: 'Terminó su turno', latido: lat(40, false) }, { juicio: { veredicto: 'sin-dod', razon: 'El encargo no dice cuándo está terminado.', en: hace(39) } }, 'Encontré tres referentes; el resumen está en docs/competencia/precios.md', 70),
      // Falló hace tres días: no se queda en «Ahora»; va a «Anteriores».
      t(900129, 'importar el CSV de Polar', 'esperando', { columna: 'falló', motivo: 'la llave de la API venció', latido: lat(4320, false) }, {}, '', 4330),
      t(900097, 'página de la masterclass', 'esperando', { columna: 'listo', motivo: 'Terminó su turno', latido: lat(3, false) }, {}, 'Dejé la vista previa en https://vista-previa.example/masterclass', 20),
    ],
  }
}
