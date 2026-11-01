/**
 * Tour de bienvenida de Levy (1 nov 2026, Daniel: «un proceso de onboarding donde levy explica cada componente de la
 * app… obvio solo se mira una vez, en futuras actualizaciones si el usuario ya lo vio no se lo vuelve a mostrar»).
 * Módulo puro (sin disco ni React) para probarlo entero.
 *
 * El guion es Markdown editable (skill `tour-bienvenida` de la copia, `guion.md`): cada `## <id> · <título>` es un
 * capítulo; un `<!-- mostrar: <destino> -->` justo debajo dice qué panel abre al llegar. Lo que va antes del primer
 * capítulo es para quien lo edita y no se muestra. `{{manuales}}` y `{{rutinas}}` se llenan en vivo (índice de manuales
 * y `GET /schedule` del daemon).
 *
 * Una sola vez: el estado guarda los ids de capítulo vistos y la versión del guion. Si ya lo vio, no vuelve. Si una
 * versión trae capítulos con id nuevo, solo esos salen como «Novedades», una vez. Saltar cuenta como visto.
 *
 * Quien ya usaba Arbrain antes de que existiera el recorrido (integración, 1 nov 2026: «como alumno que actualiza, solo
 * Novedades») da por vistos los capítulos `conocidos:` del guion; los demás le llegan como Novedades (`tourDe`).
 */

export interface Capitulo { id: string; titulo: string; mostrar: string | null; texto: string }
export interface Guion {
  version: number
  capitulos: Capitulo[]
  /** Lo que quien ya usaba Arbrain antes del recorrido da por visto (front matter `conocidos:`). */
  conocidos: string[]
}

/** Lo que guarda `primer-arranque.json` en `tour`. `curso` es el recorrido abierto (en marcha o en pausa). */
export interface EstadoTour {
  version: number
  vistos: string[]
  fecha: string | null
  curso: { modo: ModoTour; pendientes: string[]; hechos: string[]; pausado: boolean } | null
}
export type ModoTour = 'completo' | 'novedades'

/** Lo que ve el chat: qué ofrecer o en qué capítulo va. `null` = nada que mostrar. */
export interface PlanTour {
  modo: ModoTour
  enCurso: boolean
  pausado: boolean
  total: number
  hechos: number
  siguiente: { id: string; titulo: string } | null
  /** Títulos de lo que falta (para ofrecer las novedades por su nombre). */
  pendientes: string[]
  /** El último capítulo entregado, para su botón «Muéstramelo». */
  ultimo: { id: string; titulo: string; mostrar: string | null } | null
}

const CAPITULO = /^##\s+([a-z0-9][a-z0-9-]*)\s+·\s+(.+?)\s*$/
const MOSTRAR = /^<!--\s*mostrar:\s*([a-z0-9:-]+)\s*-->\s*$/
const VERSION = /^version:\s*(\d+)\s*$/m
const CONOCIDOS = /^conocidos:\s*(.*)$/m

/** Markdown del guion a capítulos. Ids repetidos: gana el primero. Sin capítulos, `capitulos: []`. */
export function parsearGuion(md: string): Guion {
  const texto = md.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(texto)
  const version = Number(fm && VERSION.exec(fm[1])?.[1]) || 1
  const conocidos = (fm && CONOCIDOS.exec(fm[1])?.[1] || '').split(',').map(x => x.trim()).filter(x => /^[a-z0-9][a-z0-9-]*$/.test(x))
  const capitulos: Capitulo[] = []
  let actual: Capitulo | null = null
  let lineas: string[] = []
  const cerrar = () => {
    if (actual && !capitulos.some(c => c.id === actual!.id)) capitulos.push({ ...actual, texto: lineas.join('\n').trim() })
    actual = null; lineas = []
  }
  for (const l of (fm ? texto.slice(fm[0].length) : texto).split('\n')) {
    const m = CAPITULO.exec(l)
    if (m) { cerrar(); actual = { id: m[1], titulo: m[2], mostrar: null, texto: '' }; continue }
    if (!actual) continue
    const mo = MOSTRAR.exec(l.trim())
    if (mo && !lineas.some(x => x.trim())) { actual.mostrar = mo[1]; continue }
    lineas.push(l)
  }
  cerrar()
  return { version, conocidos, capitulos: capitulos.filter(c => c.texto).map(c => ({ ...c, texto: unirParrafos(c.texto) })) }
}

/**
 * El guion se escribe a ~120 columnas, pero el chat pinta cada salto de línea como salto: las líneas de un mismo párrafo
 * (o de una misma viñeta) se unen. Se respetan las líneas en blanco, las viñetas nuevas, las tablas y los títulos.
 */
export function unirParrafos(texto: string): string {
  const out: string[] = []
  for (const l of texto.split('\n')) {
    const previa = out[out.length - 1]
    const empiezaBloque = /^\s*([-*+]\s|\d+\.\s|#|\||>|```|\{\{)/.test(l)
    if (previa !== undefined && previa.trim() && l.trim() && !empiezaBloque && !/^\s*(\||```|\{\{)/.test(previa)) out[out.length - 1] = `${previa.trimEnd()} ${l.trim()}`
    else out.push(l)
  }
  return out.join('\n')
}

/** ¿Qué toca? Nunca visto: el recorrido completo. Ya visto: solo los capítulos con id nuevo. Nada nuevo: null. */
export function planTour(t: EstadoTour | null | undefined, g: Guion): PlanTour | null {
  const deId = new Map(g.capitulos.map(c => [c.id, c]))
  if (t?.curso) {
    const pendientes = t.curso.pendientes.filter(id => deId.has(id))
    // El guion cambió y ya no queda nada de lo pendiente: el próximo «siguiente» lo cierra; no hay nada que ofrecer.
    if (!pendientes.length) return null
    const u = t.curso.hechos.length ? deId.get(t.curso.hechos[t.curso.hechos.length - 1]) : undefined
    const sig = deId.get(pendientes[0])!
    return {
      modo: t.curso.modo, enCurso: true, pausado: t.curso.pausado,
      total: t.curso.hechos.length + pendientes.length, hechos: t.curso.hechos.length,
      siguiente: { id: sig.id, titulo: sig.titulo }, pendientes: pendientes.map(id => deId.get(id)!.titulo),
      ultimo: u ? { id: u.id, titulo: u.titulo, mostrar: u.mostrar } : null,
    }
  }
  const nuevos = t ? g.capitulos.filter(c => !t.vistos.includes(c.id)) : g.capitulos
  if (!nuevos.length) return null
  return {
    modo: t ? 'novedades' : 'completo', enCurso: false, pausado: false, total: nuevos.length, hechos: 0,
    siguiente: { id: nuevos[0].id, titulo: nuevos[0].titulo }, pendientes: nuevos.map(c => c.titulo), ultimo: null,
  }
}

const VACIO: EstadoTour = { version: 0, vistos: [], fecha: null, curso: null }
const unir = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])]

/**
 * Entrega el siguiente capítulo (y abre el recorrido si no estaba abierto). Al entregar el último, todo lo recorrido
 * queda visto con la versión del guion. Devuelve el capítulo entregado (null si no había nada) y el estado nuevo.
 */
export function siguienteCapitulo(t: EstadoTour | null | undefined, g: Guion, ahora: string): { capitulo: Capitulo | null; novedades: boolean; primero: boolean; ultimo: boolean; estado: EstadoTour } {
  const base = t ?? VACIO
  const plan = planTour(t, g)
  if (!plan?.siguiente) return { capitulo: null, novedades: false, primero: false, ultimo: false, estado: cerrarCurso(base, g, ahora) }
  const curso = base.curso
    ? { ...base.curso, pendientes: base.curso.pendientes.filter(id => g.capitulos.some(c => c.id === id)) }
    : { modo: plan.modo, pendientes: (t ? g.capitulos.filter(c => !t.vistos.includes(c.id)) : g.capitulos).map(c => c.id), hechos: [] as string[], pausado: false }
  const [id, ...resto] = curso.pendientes
  const capitulo = g.capitulos.find(c => c.id === id)!
  const hechos = [...curso.hechos, id]
  const primero = curso.hechos.length === 0
  if (!resto.length) {
    return { capitulo, novedades: curso.modo === 'novedades', primero, ultimo: true, estado: { version: g.version, vistos: unir(base.vistos, hechos), fecha: ahora, curso: null } }
  }
  return { capitulo, novedades: curso.modo === 'novedades', primero, ultimo: false, estado: { ...base, curso: { ...curso, pendientes: resto, hechos, pausado: false } } }
}

/** Pausar: el recorrido se queda donde iba; el chat ofrece «Retomar». Sin recorrido abierto, nada cambia. */
export function pausarTour(t: EstadoTour | null | undefined): EstadoTour {
  const base = t ?? VACIO
  return base.curso ? { ...base, curso: { ...base.curso, pausado: true } } : base
}

/** Saltar cuenta como visto: todo lo que ofrecía (o le faltaba) queda visto con la versión del guion. */
export function saltarTour(t: EstadoTour | null | undefined, g: Guion, ahora: string): EstadoTour {
  const base = t ?? VACIO
  return { version: g.version, vistos: unir(base.vistos, [...(base.curso?.hechos ?? []), ...g.capitulos.map(c => c.id)]), fecha: ahora, curso: null }
}

function cerrarCurso(t: EstadoTour, g: Guion, ahora: string): EstadoTour {
  return t.curso ? { version: g.version, vistos: unir(t.vistos, t.curso.hechos), fecha: ahora, curso: null } : t
}

/**
 * El estado del tour según `primer-arranque.json`. Sin campo `tour` y con la bienvenida terminada, es alguien que ya
 * usaba Arbrain antes del recorrido: da por vistos los `conocidos` del guion y ve solo lo demás, como Novedades. La
 * bienvenida de un alumno nuevo deja `tour: null` (recorrido completo).
 */
export function tourDe(e: { tour?: unknown; completado: string | null }, g: Guion): EstadoTour | null {
  if (e.tour === undefined && e.completado) return { version: 0, vistos: g.conocidos.filter(id => g.capitulos.some(c => c.id === id)), fecha: null, curso: null }
  return estadoTourDe(e.tour)
}

/** Normaliza lo leído del archivo (puede venir de otra versión o editado a mano). */
export function estadoTourDe(x: unknown): EstadoTour | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const lista = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  const c = o.curso && typeof o.curso === 'object' ? o.curso as Record<string, unknown> : null
  return {
    version: typeof o.version === 'number' ? o.version : 0,
    vistos: lista(o.vistos),
    fecha: typeof o.fecha === 'string' ? o.fecha : null,
    curso: c ? { modo: c.modo === 'novedades' ? 'novedades' : 'completo', pendientes: lista(c.pendientes), hechos: lista(c.hechos), pausado: c.pausado === true } : null,
  }
}

// ── Datos vivos ──

export interface Manual { archivo: string; titulo: string; para: string }

/** Un nombre de archivo a algo legible, solo si el índice no trae título: `modo-monje.md` → «Modo monje». */
const tituloDeArchivo = (archivo: string) => { const t = archivo.replace(/\.md$/, '').replace(/[-_]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1) }

/**
 * El índice de manuales (`manuales/README.md`) a una lista: cada fila de tabla que enlaza un `.md` local da su archivo,
 * su título (el texto del enlace, 1 nov 2026: al dueño se le nombra por su título en español, nunca por el archivo) y la
 * primera celda («Quiere…») como para qué sirve. Sin tablas, cualquier enlace en una viñeta. Sin repetir archivos.
 */
export function manualesDelIndice(md: string): Manual[] {
  const out: Manual[] = []
  const visto = new Set<string>()
  for (const l of md.replace(/\r\n?/g, '\n').split('\n')) {
    const fila = /^\s*\|(.+)\|\s*$/.exec(l)
    const vineta = /^\s*[-*]\s+(.+)$/.exec(l)
    if (!fila && !vineta) continue
    for (const [, texto, archivo] of l.matchAll(/\[([^\]]+)\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^https?:|\//.test(archivo) || archivo === 'README.md' || visto.has(archivo)) continue
      visto.add(archivo)
      const primera = fila ? fila[1].split('|')[0].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim() : ''
      const para = (primera && !primera.includes(archivo) ? primera : texto.replace(/\.md$/, '')).replace(/\*\*/g, '')
      const titulo = /\.md$/i.test(texto.trim()) ? (primera && !primera.includes(archivo) ? para : tituloDeArchivo(archivo)) : texto.replace(/\*\*/g, '').trim()
      out.push({ archivo, titulo, para })
    }
  }
  return out
}

/** Lista de manuales para el chat: solo sus títulos. Sin índice, lo dice sin rutas. */
export function textoManuales(m: Manual[] | null): string {
  if (!m) return '_Ahora no encontré tus manuales. Pídeme «muéstrame los manuales» y los busco._'
  if (!m.length) return '_Todavía no tienes manuales._'
  return m.map(x => `- ${x.titulo}`).join('\n')
}

/** Una rutina para el capítulo: su nombre (el de Arbrain o la primera línea de la tuya), cuándo y si está activa. */
export interface RutinaResumen { titulo: string; cuando: string; activa: boolean }

/** Las rutinas de `GET /schedule` en palabras: qué, cuándo y si espera tu «Activar». */
export function textoRutinas(r: RutinaResumen[] | null): string {
  if (!r) return '_Ahora no pude leer tus rutinas; las ves en Taller › Rutinas._'
  if (!r.length) return '_Aún no tienes rutinas. Pídemelas así: «cada mañana a las 7 resúmeme mi día»._'
  const corto = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > 70 ? `${t.slice(0, 67).trimEnd()}…` : t }
  return r.map(x => `- **${corto(x.titulo)}** · ${x.cuando} · ${x.activa ? 'activa' : 'en pausa'}`).join('\n')
}

/** El texto final de un capítulo: datos vivos dentro y, en novedades, el encabezado la primera vez. */
export function textoCapitulo(c: Capitulo, datos: { manuales?: string; rutinas?: string; nombre?: string | null }, extra: { novedades?: boolean; primero?: boolean; ultimo?: boolean } = {}): string {
  const nombre = datos.nombre?.trim().split(/\s+/)[0] ?? ''
  let t = c.texto
    .replace(/\{\{manuales\}\}/g, datos.manuales ?? textoManuales(null))
    .replace(/\{\{rutinas\}\}/g, datos.rutinas ?? textoRutinas(null))
    .replace(/\{\{nombre\}\}/g, nombre)
    .replace(/ ,/g, ',')
  t = `**${c.titulo}**\n\n${t}`
  if (extra.novedades && extra.primero) t = `**Novedades de esta versión de tu Arbrain.** Ya conoces lo demás; esto es lo nuevo.\n\n${t}`
  if (extra.novedades && extra.ultimo) t += '\n\nEso es todo lo nuevo.'
  return t
}

/** Marca de los mensajes del tour en `chat_messages.metadata.source`. */
export const FUENTE_TOUR = 'tour-bienvenida'

/** Destinos de `mostrar` que entiende el chat (lib/tour-mostrar.ts). Un destino desconocido no abre nada. */
export const DESTINOS_MOSTRAR = ['calendario', 'calendario:semana', 'calendario:mes', 'tareas', 'taller', 'taller:terminales', 'taller:rutinas', 'taller:memoria', 'taller:maquina', 'ajustes', 'ajustes:llaves', 'ajustes:voz', 'ajustes:seguridad', 'ajustes:privacidad', 'ajustes:telefono'] as const
export const destinoValido = (d: string | null | undefined): boolean => !!d && (DESTINOS_MOSTRAR as readonly string[]).includes(d)
