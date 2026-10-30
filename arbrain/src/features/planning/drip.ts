import { categoriaDe, esCompromiso, type Categoria } from './categorias'
import { tituloBase } from './rutinas'
import { aplicarCambioSemana, normalizarSemana, type SemanaPerfecta } from './semana-perfecta'

/**
 * DRIP (24 oct 2026, Daniel: «cada evento se clasifica SOLO por DRIP (Producir / Invertir / Reemplazar / Delegar; Levy lo infiere,
 * el usuario puede corregir con un toque) y se colorea; lo delegable aparece con su etiqueta»). Matriz de *Buy Back Your Time*
 * (Dan Martell, p. 50–58): eje vertical «te paga» (Makes You Money), eje horizontal «te enciende» (Lights You Up).
 *
 *               │ te drena           │ te enciende
 *   ────────────┼────────────────────┼──────────────────
 *   te paga     │ REEMPLAZAR         │ PRODUCIR  (donde quieres vivir)
 *   paga poco   │ DELEGAR            │ INVERTIR  (siempre algo aquí)
 *
 * Lógica pura, sin React ni DOM: la usan el calendario, la ruta /api/planning/drip, el CLI de Levy y las pruebas
 * (tests/planning/drip.test.ts recorre títulos reales del calendario de Daniel).
 *
 * De dónde sale el cuadrante de un evento, en este orden (la primera que contesta gana):
 *   1. La CORRECCIÓN de la persona o de su Levy (almacén DRIP, `DocDrip.correcciones`), por serie y luego por título.
 *   2. Una marca en la descripción del evento: `drip: producir` (Levy la puede escribir por `mc-event.py`).
 *   3. El emoji inicial que es inequívoco para DRIP (💳 pago → Delegar).
 *   4. Las REGLAS de palabras, en grupos y en orden (abajo): administrativo → Delegar; entregar y crear → Producir; operar
 *      ventas y difusión → Reemplazar; vida, aprender y planear → Invertir; luego lo general de cada uno.
 *   5. La categoría de siempre (categorias.ts) como red: Crear, Enseñar y Construir → Producir; Vender → Reemplazar; Vida → Invertir.
 * Nunca queda sin cuadrante: el último recurso es la categoría, que siempre contesta.
 */

export type Cuadrante = 'producir' | 'invertir' | 'reemplazar' | 'delegar'

export interface DefCuadrante {
  id: Cuadrante
  nombre: string
  /** Una letra, para la matriz y lo angosto. */
  letra: string
  /** Tono base (paleta de la casa): `estiloEvento` lo vuelve tinte legible en claro y oscuro. */
  color: string
  /** Los dos ejes de Martell. */
  paga: boolean
  enciende: boolean
  /** Lo que significa, en una línea (leyenda, hoja del evento, pantalla del domingo). */
  lema: string
}

/**
 * Los cuatro, en el orden de la leyenda. Producir es un bronce de riel, sin relleno (25 oct, Daniel: «no me gusta que todo el color se
 * hizo amarillo»; el ámbar sólido queda solo para el ahora); Invertir, el morado de la marca;
 * Reemplazar, un granate sobrio (25 oct, Daniel: «ponlo rojo, es algo que quiero quitar»; no el rojo alarma del semáforo);
 * Delegar, un gris pizarra que se lee como «esto no es tuyo».
 */
export const CUADRANTES: readonly DefCuadrante[] = [
  { id: 'producir', nombre: 'Producir', letra: 'P', color: '#a8733a', paga: true, enciende: true, lema: 'Te paga y te enciende: aquí quieres vivir' },
  { id: 'invertir', nombre: 'Invertir', letra: 'I', color: '#8c27f1', paga: false, enciende: true, lema: 'Te enciende y paga después: siempre algo aquí' },
  { id: 'reemplazar', nombre: 'Reemplazar', letra: 'R', color: '#b23a4a', paga: true, enciende: false, lema: 'Te paga pero te drena: que lo haga alguien con tu método' },
  { id: 'delegar', nombre: 'Delegar', letra: 'D', color: '#7c8594', paga: false, enciende: false, lema: 'Ni te paga ni te enciende: sácalo de tu agenda' },
]
export const DRIP: Record<Cuadrante, DefCuadrante> = Object.fromEntries(CUADRANTES.map(c => [c.id, c])) as Record<Cuadrante, DefCuadrante>
export const esCuadrante = (x: unknown): x is Cuadrante => typeof x === 'string' && x in DRIP
/** Lo que se puede sacar de tu agenda (lleva su etiqueta y el toque «Delegar a Levy»). */
export const esDelegable = (c: Cuadrante) => c === 'delegar' || c === 'reemplazar'

/** Lo que el motor necesita de un evento (PlanEvent lo cumple). */
export interface EventoDrip {
  id: string
  title: string
  description?: string
  start: string
  end: string
  allDay?: boolean
  recurringEventId?: string | null
  colorId?: string | null
  attendees?: { self: boolean }[]
  meetUrl?: string | null
  editable?: boolean
}

/* ── Las reglas ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Palabras completas también con acentos (`\b` de JS no los entiende), sin distinguir mayúsculas. */
function palabras(lista: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])(?:${lista})(?![\\p{L}\\d])`, 'iu')
}

/**
 * Las reglas, en orden: la primera que coincide gana. Cada grupo tiene su porqué en el libro; el orden resuelve los cruces de la
 * semana real de Daniel (tests/planning/drip.test.ts):
 *   «Foco: cobros + propuesta» → Delegar (cobranza, p. 51) antes que lo demás;
 *   «Prospección en Frío… · Nivel 7» es una clase → Producir antes que «prospección» → Reemplazar;
 *   «Publicar post de la grupal» → Reemplazar (difusión) antes que «grupal» → Producir;
 *   «Deep work: preparar la grupal (hoy sin gym)» → Producir antes que «gym» → Invertir;
 *   «Estudiar la chuleta de venta» → Invertir (formación, p. 55) antes que «venta».
 */
export const REGLAS_DRIP: readonly { id: string; re: RegExp; cuadrante: Cuadrante; porque: string }[] = [
  // Delegar fuerte: administración, cobranza, trámites, mantenimiento, logística (p. 51–52: «facturación y cobranza, organizar viajes»).
  { id: 'administrativo', cuadrante: 'delegar', porque: 'administración, cobranza o logística',
    re: palabras('cobros?|cobranza|factura\\w*|pagos?|pagar|tr[aá]mites?|impi|registro de marca|licencia|reiniciar|reservar|agendar|agenda de|transcript\\w*|revisi[oó]n t[eé]cnica|instalar|instalaci[oó]n|limpiar lo acumulado|organizar|migrar|bandeja de entrada|inbox|correos|escribir a|p[oó]sters?|imprimir|recoger|mandados?|comprar|cotizar') },
  // Producir fuerte: entregar a tus clientes (clases, uno a uno, fases del programa) y crear la pieza (grabar, guion, pitch, deep work).
  { id: 'entregar', cuadrante: 'producir', porque: 'entregar a tus clientes',
    re: palabras('nivel \\d+|videollamada de comunidad|kickoff|clase del|uno a uno|1 ?a ?1 con cliente|demo day|fase \\d+|classroom|mentor[ií]a (?:a|con) clientes?|sesi[oó]n con cliente|diagn[oó]stico con') },
  { id: 'crear', cuadrante: 'producir', porque: 'crear la pieza que vende',
    re: palabras('deep work|trabajo fuerte|grabar|grabaci[oó]n|vsl\\d*|guion|gui[oó]n|vlog|pitch|ensayo|presentador|firmar|firmas|estrategia|blueprint|arquitectura|producto|c[aá]mara') },
  // Reemplazar fuerte: operar ventas y difusión; vale dinero, pero con un método otra persona (o Levy) lo hace (p. 53: «ventas, marketing, onboarding»).
  { id: 'operar-ventas', cuadrante: 'reemplazar', porque: 'operar ventas o difusión con un método repetible',
    re: palabras('brief|briefing|setter|seguimientos?|aplicantes|prospecci[oó]n|prospectar|mensajes?|notas de voz|invitaci[oó]n(?:es)?|invitar|publicar|post|subir|responder|contestar|respuestas|anunciar|replay|calientes|avisar|trabajo light|llamada ·|llamada de venta|llamadas de venta|cierre de venta|onboarding de clientes?|soporte') },
  // Invertir: vida (ejercicio, pareja, familia, comer, dormir), aprender y planear (p. 55–56: «ejercicio, pasatiempos, familia; formación»).
  { id: 'vida', cuadrante: 'invertir', porque: 'tu energía y tu gente',
    re: palabras('gym|gimnasio|sauna|nataci[oó]n|correr|caminata|caminar|yoga|ejercicio|familia|hermanos?|pap[aá]|mam[aá]|pareja|hijos?|desayuno|comida|almuerzo|cena|ducha|siesta|descanso|dormir|despierto|despertar|rutina|vacaciones|premio|monterrey|viaje|vuelo|doctor|m[eé]dico|dentista|terapia|cumplea[nñ]os|boda|corte de pelo|starbucks|caf[eé]|cierre del d[ií]a') },
  { id: 'aprender', cuadrante: 'invertir', porque: 'aprender o planear tu siguiente paso',
    re: palabras('estudiar|leer|lectura|libro|curso|aprender|roleplays?|cheat sheet|chuleta|accelerator|mentor|mentor[ií]a|planeaci[oó]n|planeacion|planear|bajar a tierra|revisi[oó]n semanal|armar la semana|la semana con horas') },
  // Lo general de cada uno, después de lo fuerte.
  { id: 'ensenar', cuadrante: 'producir', porque: 'enseñar o entregar', re: palabras('clase|grupal|masterclass|taller|workshop|sesi[oó]n|entregar|m[oó]dulos?|lecciones|demo|deck') },
  { id: 'revisar', cuadrante: 'reemplazar', porque: 'revisar el trabajo de otros', re: palabras('revisar|supervisar|corregir|checar|qa|nutrici[oó]n|correo|newsletter|edici[oó]n|editar|miniaturas?') },
]

/** Emojis que DRIP lee sin dudar (los demás los decide la palabra o la categoría). */
export const EMOJIS_DRIP: Record<string, Cuadrante> = { '💳': 'delegar', '🧾': 'delegar', '🔁': 'delegar', '🔧': 'delegar', '💈': 'invertir', '🏆': 'invertir', '🏔': 'invertir' }

/** La categoría de siempre, como red de seguridad. */
export const POR_CATEGORIA: Record<Categoria, Cuadrante> = { crear: 'producir', ensenar: 'producir', construir: 'producir', vender: 'reemplazar', vida: 'invertir' }

export type OrigenDrip = 'corregido' | 'descripcion' | 'emoji' | 'regla' | 'categoria'

export interface Inferencia { cuadrante: Cuadrante; origen: OrigenDrip; porque: string }

const MARCA_DRIP = /(?:^|[\s[(])drip\s*:\s*(producir|invertir|reemplazar|delegar)\b/i
function emojiInicial(titulo: string): string | null {
  const m = /^\s*(?:✓\s*)?(\p{Extended_Pictographic})/u.exec(titulo)
  return m ? m[1] : null
}

/** Lo que Levy infiere de un evento, sin correcciones. Determinista: el mismo evento da siempre lo mismo. */
export function inferirDrip(e: EventoDrip, calendario?: string | null): Inferencia {
  const marca = MARCA_DRIP.exec(e.description ?? '')
  if (marca) return { cuadrante: marca[1].toLowerCase() as Cuadrante, origen: 'descripcion', porque: 'marcado en la descripción' }
  const emoji = emojiInicial(e.title ?? '')
  if (emoji && EMOJIS_DRIP[emoji]) return { cuadrante: EMOJIS_DRIP[emoji], origen: 'emoji', porque: 'su emoji' }
  const titulo = (e.title ?? '').replace(/^\s*✓\s*/, '')
  for (const r of REGLAS_DRIP) if (r.re.test(titulo)) return { cuadrante: r.cuadrante, origen: 'regla', porque: r.porque }
  const cat = categoriaDe({ title: e.title, description: e.description, colorId: e.colorId }, calendario)
  return { cuadrante: POR_CATEGORIA[cat.categoria], origen: 'categoria', porque: `por su categoría (${cat.categoria})` }
}

/* ── Las piedras del calendario (hitos neutros, viajes, chips) ──────────────────────────────────────────────────────────────── */

/**
 * Hitos del programa (25 oct 2026, Daniel: «no me gusta que todo el color se hizo amarillo»). Las fases, aperturas, demo days y
 * ventanas de uno a uno de día completo marcan el MAPA, no son trabajo: se pintan neutros (gris pizarra fino, sin relleno) en Semana,
 * Día y Mes y no cuentan horas DRIP (son de día completo; `bloquesDrip` solo suma bloques con hora). Las clases y grupales con hora
 * siguen en Producir; los viajes y premios (Monterrey) son Invertir, en morado.
 */
export const COLOR_HITO = '#64748b'
const RE_HITO = palabras('fase \\d+|abre|apertura|demo day|uno a uno|1 ?a ?1|ventana|kickoff|arranca|empieza|cierre de (?:la )?(?:etapa|fase|cohorte)|semana \\d+|S\\d+(?:\\s*[–-]\\s*\\d+)?')
const RE_VIAJE = palabras('premio|monterrey|viaje|vuelo|vacaciones|retiro')
const EMOJI_VIAJE = /^\s*(?:🏆|🏔|⛰|🏕|✈|🧳)/u
export const esViaje = (e: Pick<EventoDrip, 'title'>) => EMOJI_VIAJE.test(e.title ?? '') || RE_VIAJE.test(e.title ?? '')
/** Un hito del programa: de día completo, con forma de fase o marca, y que no sea un viaje. */
export function esHitoPrograma(e: Pick<EventoDrip, 'title' | 'allDay'>): boolean {
  return Boolean(e.allDay) && !esViaje(e) && RE_HITO.test((e.title ?? '').replace(/^\s*✓\s*/, ''))
}

/** Cómo se dibuja un evento en el Mes: cinta neutra (hito), marca de viaje, bloque de día completo o chip de una línea. */
export type Piedra = 'hito' | 'viaje' | 'dia' | 'chip'
export function piedraDe(e: Pick<EventoDrip, 'title' | 'allDay'>, cuadrante: Cuadrante): Piedra {
  if (!e.allDay) return 'chip'
  if (esHitoPrograma(e)) return 'hito'
  return esViaje(e) || cuadrante === 'invertir' ? 'viaje' : 'dia'
}
/**
 * Una fase del programa (25 oct 2026, Daniel: «no sé ni pa qué sirve, es molesto»): vive solo en el Mes. La Semana y el Día no
 * repiten «Fase 1 · Tu cerebro…» en cada columna; los demás hitos, viajes y reuniones de día completo siguen ahí.
 */
const RE_FASE = palabras('fase \\d+')
export const esFase = (e: Pick<EventoDrip, 'title' | 'allDay'>) => esHitoPrograma(e) && RE_FASE.test(e.title ?? '')

/** El nombre corto de una fase para la ceja de su semana: «🌟 Fase 2 · Supernova, tu oferta (S2–3)» → «Supernova». */
export function nombreDeFase(titulo: string): string {
  const resto = titulo.replace(/^[^·]*fase \d+\s*·\s*/iu, '').replace(/\s*\(S\d[^)]*\)\s*$/, '')
  return (resto.split(/[,:;]/)[0] ?? resto).trim() || titulo.trim()
}

/**
 * La mecánica del programa para los alumnos (25 oct 2026, Daniel: «veo repetido "Abre Primer cliente en el classroom"»):
 * «🔓 Abre Supernova en el classroom (día 14)» abre el módulo a la cohorte. Vive en Google para los alumnos, pero no pide nada a
 * Daniel: no se pinta en ninguna vista de su calendario (Día, Semana, Mes, Año ni la Cabina). Regla, no borrado.
 */
const RE_MECANICA = palabras('(?:abre|apertura de|se abre) .+ (?:en|del) (?:el )?classroom')
export function esMecanicaAlumno(e: Pick<EventoDrip, 'title' | 'allDay'>): boolean {
  const t = e.title ?? ''
  return Boolean(e.allDay) && (/^\s*🔓/u.test(t) || RE_MECANICA.test(t))
}

/**
 * Lo que pide a Daniel actuar (25 oct 2026, Daniel: «no hay colores que guíen la atención ni la vista»). En el Recorrido del Mes
 * solo esto lleva color: `accion` (uno a uno y llamadas clave con otra persona, en bronce) y `viaje` (Monterrey y lo que pasa
 * dentro, en morado). Las fases, el demo day, las clases y videollamadas que se repiten y lo demás quedan neutros (null).
 */
export type Atencion = 'accion' | 'viaje' | null
const RE_UNO_A_UNO = palabras('uno a uno|1 ?a ?1|1-1')
const RE_CLASE = palabras('clase|nivel \\d+|videollamada de comunidad|grupal|masterclass|taller|workshop')
export function atencionDe(e: Pick<EventoDrip, 'title' | 'allDay'> & { recurringEventId?: string | null; meetUrl?: string | null; attendees?: { self: boolean }[] }, piedra: Piedra): Atencion {
  if (piedra === 'viaje') return 'viaje'
  const t = e.title ?? ''
  if (RE_UNO_A_UNO.test(t) && !esFase(e)) return 'accion'
  if (!e.allDay && !e.recurringEventId && esCompromiso(e) && !RE_CLASE.test(t)) return 'accion'
  return null
}

/**
 * Lo que va DENTRO de un viaje en la cuadrícula del Mes (25 oct 2026, «Monterrey se ve UNA vez»): un evento de día completo más
 * corto que cae entero en un viaje (la reunión del 28 en Monterrey) no se apila como otra cinta; queda como marca en su día.
 * Devuelve id → día civil (YYYY-MM-DD) de la marca.
 */
export function marcasEnViajes(eventos: readonly Pick<EventoDrip, 'id' | 'title' | 'start' | 'end' | 'allDay'>[]): Map<string, string> {
  const dia = (iso: string) => iso.slice(0, 10)
  const viajes = eventos.filter(e => e.allDay && esViaje(e))
  const marcas = new Map<string, string>()
  for (const e of eventos) {
    if (!e.allDay || esHitoPrograma(e)) continue
    const a = dia(e.start), b = dia(e.end)
    if (viajes.some(v => v.id !== e.id && dia(v.start) <= a && b <= dia(v.end) && (dia(v.start) < a || b < dia(v.end)))) marcas.set(e.id, a)
  }
  return marcas
}

/** El color con que se pinta: los hitos, neutros; lo demás, su cuadrante. */
export const colorDePiedra = (e: Pick<EventoDrip, 'title' | 'allDay'>, cuadrante: Cuadrante) => esHitoPrograma(e) ? COLOR_HITO : DRIP[cuadrante].color

/**
 * La semana del programa (S0, S1… S11) de cada lunes, leída de las fases mismas: «Fase 2 · Supernova, tu oferta (S2–3)» que empieza
 * el lun 2 nov dice que esa semana es la S2. Sin fases con marca, null (el alumno sin programa no ve números inventados).
 */
export function semanasDelPrograma(eventos: readonly Pick<EventoDrip, 'title' | 'start' | 'allDay'>[]): { lunes0: number; ultima: number } | null {
  const votos = new Map<number, number>(); let ultima = -1
  for (const e of eventos) {
    if (!e.allDay) continue
    const m = /\(S(\d{1,2})(?:\s*[–-]\s*S?(\d{1,2}))?\)/.exec(e.title ?? '')
    if (!m) continue
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    const d = new Date(`${e.start.slice(0, 10)}T12:00:00`)
    const lunes = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)) - a * 7 * 864e5
    votos.set(lunes, (votos.get(lunes) ?? 0) + 1); ultima = Math.max(ultima, b)
  }
  if (!votos.size) return null
  const [lunes0] = [...votos.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]
  return { lunes0, ultima }
}
/** «S3» para el lunes dado (YYYY-MM-DD), o null fuera del programa. */
export function semanaDelPrograma(lunes: string, prog: { lunes0: number; ultima: number } | null): string | null {
  if (!prog) return null
  const [y, m, d] = lunes.slice(0, 10).split('-').map(Number)
  const n = Math.round((Date.UTC(y, m - 1, d) - prog.lunes0) / (7 * 864e5))
  return n >= 0 && n <= prog.ultima ? `S${n}` : null
}

/* ── El almacén (corrección, tarifa, foto del plan, mañanas aceptadas) ─────────────────────────────────────────────────── */

/**
 * Las claves con que se recuerda una corrección o una delegación: la serie (todas sus ocurrencias) y el título base (lo que se
 * repite sin serie, como «GYM» suelto). Una corrección sobre una serie se guarda en las dos.
 */
export function clavesDe(e: Pick<EventoDrip, 'title' | 'recurringEventId'>): { serie: string | null; titulo: string | null } {
  const t = tituloBase(e.title ?? '')
  return { serie: e.recurringEventId ? `serie:${e.recurringEventId}` : null, titulo: t ? `titulo:${t}` : null }
}

export interface Correccion { cuadrante: Cuadrante; titulo: string; en: string; por: string }
export interface Delegacion { a: string; titulo: string; desde: string; por: string }
export interface Tarifa { monto: number; moneda: string }

/** Un bloque con hora tal como estaba planeado (la foto del plan). */
export interface BloqueFoto { id: string; titulo: string; inicio: string; fin: string; cuadrante: Cuadrante }
export interface FotoSemana {
  /** Lunes de la semana (YYYY-MM-DD). */
  lunes: string
  /** Cuándo se tomó (ISO). Si se tomó después del lunes, la comparación es parcial y la pantalla lo dice. */
  tomada: string
  objetivo: string | null
  entregables: number
  bloques: BloqueFoto[]
}

/**
 * El documento DRIP de una instalación. Vive en un solo lugar y lo escriben la app, el Levy de la persona y su CLI:
 *   - instalación de Daniel: Supabase `app_config`, clave `planning:drip` (compartido entre sus Macs y el teléfono);
 *   - edición del alumno: `<su cerebro>/.claude/plan/drip.json`.
 * Ver `src/lib/planning/drip-store.ts` y `src/lib/planning/drip-cli.ts`.
 */
export interface DocDrip {
  version: 1
  actualizado: string
  correcciones: Record<string, Correccion>
  delegados: Record<string, Delegacion>
  /** Buyback Rate (p. 63): lo que te paga tu empresa al año ÷ 8,000. null = sin tarifa (la edición del alumno nace así). */
  tarifa: Tarifa | null
  fotos: Record<string, FotoSemana>
  /** Mañanas aceptadas con un toque: día → cuándo (ISO). */
  mananas: Record<string, string>
  /** La Semana Perfecta (cap. 8): la plantilla que se pinta en fantasma detrás de la semana real. null = sin diseñar. */
  semana: SemanaPerfecta | null
}

export const DOC_VACIO: DocDrip = { version: 1, actualizado: '1970-01-01T00:00:00.000Z', correcciones: {}, delegados: {}, tarifa: null, fotos: {}, mananas: {}, semana: null }
/** Cuántas fotos de semana y mañanas se guardan (lo viejo se poda solo). */
export const FOTOS_MAX = 12, MANANAS_MAX = 45

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const esIso = (s: unknown): s is string => typeof s === 'string' && s.length <= 40 && Number.isFinite(Date.parse(s))
const texto = (s: unknown, max = 200) => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const esClave = (s: unknown): s is string => typeof s === 'string' && /^(?:serie|titulo):.{1,300}$/.test(s)

/** Lee un documento sin confiar en él: lo inválido se descarta, nunca rompe la vista. */
export function normalizarDoc(crudo: unknown): DocDrip {
  const d = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? crudo as Record<string, unknown> : {}
  const obj = (x: unknown) => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {}
  const correcciones: Record<string, Correccion> = {}
  for (const [k, v] of Object.entries(obj(d.correcciones))) { const c = obj(v); if (esClave(k) && esCuadrante(c.cuadrante)) correcciones[k] = { cuadrante: c.cuadrante, titulo: texto(c.titulo), en: esIso(c.en) ? c.en : DOC_VACIO.actualizado, por: texto(c.por, 40) || 'persona' } }
  const delegados: Record<string, Delegacion> = {}
  for (const [k, v] of Object.entries(obj(d.delegados))) { const c = obj(v); if (esClave(k) && esIso(c.desde)) delegados[k] = { a: texto(c.a, 60) || 'Levy', titulo: texto(c.titulo), desde: c.desde, por: texto(c.por, 40) || 'persona' } }
  const t = obj(d.tarifa)
  const tarifa = typeof t.monto === 'number' && t.monto > 0 && t.monto < 1e6 ? { monto: Math.round(t.monto * 100) / 100, moneda: texto(t.moneda, 8) || 'USD' } : null
  const fotos: Record<string, FotoSemana> = {}
  for (const [k, v] of Object.entries(obj(d.fotos))) { const f = leerFoto(v); if (f && f.lunes === k) fotos[k] = f }
  const mananas: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj(d.mananas))) if (esFecha(k) && esIso(v)) mananas[k] = v
  return { version: 1, actualizado: esIso(d.actualizado) ? d.actualizado : DOC_VACIO.actualizado, correcciones, delegados, tarifa, fotos, mananas, semana: normalizarSemana(d.semana) }
}

function leerFoto(v: unknown): FotoSemana | null {
  const f = v && typeof v === 'object' ? v as Record<string, unknown> : null
  if (!f || !esFecha(f.lunes) || !esIso(f.tomada) || !Array.isArray(f.bloques)) return null
  const bloques = f.bloques.slice(0, 400).flatMap((b): BloqueFoto[] => {
    const x = b && typeof b === 'object' ? b as Record<string, unknown> : {}
    return typeof x.id === 'string' && esIso(x.inicio) && esIso(x.fin) && esCuadrante(x.cuadrante) ? [{ id: x.id.slice(0, 300), titulo: texto(x.titulo), inicio: x.inicio, fin: x.fin, cuadrante: x.cuadrante }] : []
  })
  return { lunes: f.lunes, tomada: f.tomada, objetivo: texto(f.objetivo) || null, entregables: typeof f.entregables === 'number' && f.entregables >= 0 ? Math.floor(f.entregables) : 0, bloques }
}

/** Un cambio al documento. Lo usan la ruta API y el CLI: misma validación en los dos lados. */
export type CambioDrip =
  | { accion: 'corregir'; claves: string[]; titulo: string; cuadrante: Cuadrante | null; por?: string }
  | { accion: 'delegar'; claves: string[]; titulo: string; a?: string; activo: boolean; por?: string }
  | { accion: 'tarifa'; monto: number | null; moneda?: string }
  | { accion: 'foto'; foto: FotoSemana }
  | { accion: 'manana'; dia: string; aceptada: boolean }
  /** La Semana Perfecta: `cambio` es un `CambioSemana` (semana-perfecta.ts): agregar, quitar, reemplazar o vaciar. */
  | { accion: 'semana'; cambio: unknown }

/** Aplica un cambio y devuelve el documento nuevo, o un texto con el error (400). Puro: `ahora` entra de fuera. */
export function aplicarCambioDrip(doc: DocDrip, cambio: unknown, ahora = new Date().toISOString()): DocDrip | string {
  const c = cambio && typeof cambio === 'object' ? cambio as Record<string, unknown> : {}
  const n: DocDrip = { ...doc, correcciones: { ...doc.correcciones }, delegados: { ...doc.delegados }, fotos: { ...doc.fotos }, mananas: { ...doc.mananas }, actualizado: ahora }
  const claves = Array.isArray(c.claves) ? c.claves.filter(esClave).slice(0, 4) : []
  const por = texto(c.por, 40) || 'persona'
  switch (c.accion) {
    case 'corregir': {
      if (!claves.length) return 'Falta la serie o el título del evento.'
      if (c.cuadrante !== null && !esCuadrante(c.cuadrante)) return 'Cuadrante inválido: producir, invertir, reemplazar o delegar.'
      for (const k of claves) { if (c.cuadrante === null) delete n.correcciones[k]; else n.correcciones[k] = { cuadrante: c.cuadrante, titulo: texto(c.titulo), en: ahora, por } }
      return n
    }
    case 'delegar': {
      if (!claves.length) return 'Falta la serie o el título del evento.'
      for (const k of claves) { if (c.activo === false) delete n.delegados[k]; else n.delegados[k] = { a: texto(c.a, 60) || 'Levy', titulo: texto(c.titulo), desde: ahora, por } }
      return n
    }
    case 'tarifa': {
      if (c.monto === null) { n.tarifa = null; return n }
      if (typeof c.monto !== 'number' || !(c.monto > 0) || c.monto >= 1e6) return 'La tarifa es un número mayor que cero (lo que te paga tu empresa al año ÷ 8,000).'
      n.tarifa = { monto: Math.round(c.monto * 100) / 100, moneda: texto(c.moneda, 8) || doc.tarifa?.moneda || 'USD' }
      return n
    }
    case 'foto': {
      const f = leerFoto(c.foto)
      if (!f) return 'Foto del plan inválida.'
      // La foto es del plan: la primera se queda. Una segunda lectura de la misma semana no la reemplaza.
      if (!n.fotos[f.lunes]) n.fotos[f.lunes] = f
      const viejas = Object.keys(n.fotos).sort().slice(0, -FOTOS_MAX)
      for (const k of viejas) delete n.fotos[k]
      return n
    }
    case 'manana': {
      if (!esFecha(c.dia)) return 'Día inválido.'
      if (c.aceptada === false) delete n.mananas[c.dia]; else n.mananas[c.dia] = ahora
      for (const k of Object.keys(n.mananas).sort().slice(0, -MANANAS_MAX)) delete n.mananas[k]
      return n
    }
    case 'semana': {
      const semana = aplicarCambioSemana(doc.semana, c.cambio, ahora)
      if (typeof semana === 'string') return semana
      n.semana = semana
      return n
    }
    default: return 'Acción inválida: corregir, delegar, tarifa, foto, manana o semana.'
  }
}

/* ── Leer un evento con el documento ─────────────────────────────────────────────────────────────────────────────────── */

export interface LecturaDrip extends Inferencia {
  /** Lo que Levy habría dicho sin la corrección (para «volver a lo de Levy»). */
  inferido: Cuadrante
  claves: string[]
  delegable: boolean
  /** A quién se delegó (almacén por serie/título, o marca `[delegado: …]` en la descripción). null = es tuyo. */
  delegadoA: string | null
  /** Bloque protegido: `[protegido]` en la descripción (lo escribe la pluma, con ⌘Z). */
  protegido: boolean
}

export const MARCA_PROTEGIDO = '[protegido]'
const RE_PROTEGIDO = /\[protegido\]/i
const RE_DELEGADO = /\[delegado(?::\s*([^\]]{1,60}))?\]/i
export const estaProtegido = (descripcion?: string | null) => RE_PROTEGIDO.test(descripcion ?? '')
/** La descripción con o sin la marca de protegido (sin tocar lo demás). */
export function conProtegido(descripcion: string, protegido: boolean): string {
  const sin = (descripcion ?? '').replace(/\n*\[protegido\]\n*/gi, '\n').replace(/^\n+|\n+$/g, '')
  return protegido ? (sin ? `${sin}\n\n${MARCA_PROTEGIDO}` : MARCA_PROTEGIDO) : sin
}
/** La descripción con o sin `[delegado: quien]`. */
export function conDelegado(descripcion: string, a: string | null): string {
  const sin = (descripcion ?? '').replace(/\n*\[delegado(?::[^\]]*)?\]\n*/gi, '\n').replace(/^\n+|\n+$/g, '')
  if (!a) return sin
  const marca = `[delegado: ${a}]`
  return sin ? `${sin}\n\n${marca}` : marca
}

export function leerDrip(e: EventoDrip, calendario: string | null | undefined, doc: DocDrip | null): LecturaDrip {
  const inf = inferirDrip(e, calendario)
  const { serie, titulo } = clavesDe(e)
  const claves = [serie, titulo].filter((k): k is string => !!k)
  const corr = doc ? claves.map(k => doc.correcciones[k]).find(Boolean) : undefined
  const base: Inferencia = corr ? { cuadrante: corr.cuadrante, origen: 'corregido', porque: corr.por === 'levy' ? 'corregido por Levy' : 'lo corregiste tú' } : inf
  const marca = RE_DELEGADO.exec(e.description ?? '')
  const deleg = doc ? claves.map(k => doc.delegados[k]).find(d => d && Date.parse(d.desde) <= Date.parse(e.end)) : undefined
  return { ...base, inferido: inf.cuadrante, claves, delegable: esDelegable(base.cuadrante),
    delegadoA: marca ? (marca[1]?.trim() || 'Levy') : deleg ? deleg.a : null, protegido: estaProtegido(e.description) }
}

/* ── Medir ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un bloque con hora, ya clasificado (lo que se mide). */
export interface BloqueDrip { id: string; titulo: string; inicio: number; fin: number; cuadrante: Cuadrante; delegadoA: string | null; protegido: boolean; editable: boolean; conOtros: boolean; serie: string | null }

/** Horas de la UNIÓN de los intervalos (dos bloques que se enciman no cuentan doble), recortados a [desde, hasta). */
export function horasUnion(bloques: readonly { inicio: number; fin: number }[], desde: number, hasta: number): number {
  const xs = bloques.map(b => [Math.max(b.inicio, desde), Math.min(b.fin, hasta)] as const).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])
  let total = 0, a = -Infinity, b = -Infinity
  for (const [x, y] of xs) { if (x > b) { if (b > a) total += b - a; a = x; b = y } else b = Math.max(b, y) }
  if (b > a) total += b - a
  return total / 3_600_000
}

export function horasPorCuadrante(bloques: readonly BloqueDrip[], desde: number, hasta: number): Record<Cuadrante, number> {
  return Object.fromEntries(CUADRANTES.map(c => [c.id, horasUnion(bloques.filter(b => b.cuadrante === c.id), desde, hasta)])) as Record<Cuadrante, number>
}

/**
 * HORA RECOMPRADA (definición honesta, 24 oct 2026): una hora de un bloque Delegar o Reemplazar de tu calendario que quedó marcado
 * como hecho por alguien más (Levy u otra persona): por el toque «Delegar a Levy» (almacén, por serie o título, desde ese momento)
 * o por la marca `[delegado: …]` en su descripción. Es tiempo que ya no gastas tú. Es autorreportado: Arbrain no comprueba que
 * Levy o la persona lo hicieron; mide lo que marcaste. Sin ninguna delegación registrada no hay medición: «—», nunca un cero.
 * El dinero es esas horas × tu tarifa de recompra (Buyback Rate, p. 63); sin tarifa, solo horas.
 */
export function horasRecompradas(bloques: readonly BloqueDrip[], desde: number, hasta: number, hayMedicion: boolean): number | null {
  if (!hayMedicion) return null
  return horasUnion(bloques.filter(b => b.delegadoA && esDelegable(b.cuadrante)), desde, hasta)
}

/** «12 h», «4,5 h», «45 min», «0 h»; null → «—» (sin medición, jamás un cero inventado). */
export function formatoHorasDrip(h: number | null): string {
  if (h === null || !Number.isFinite(h)) return '—'
  if (h <= 0) return '0 h'
  if (h < 1) return `${Math.round(h * 60)} min`
  const r = Math.round(h * 2) / 2
  return `${String(r).replace('.', ',')} h`
}
/** «$112» con la moneda de la tarifa (sin decimales). */
export function formatoDinero(monto: number, moneda: string): string {
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(monto) } catch { return `${Math.round(monto)} ${moneda}` }
}

/* ── El comparador del domingo ───────────────────────────────────────────────────────────────────────────────────────── */

export type IdAsesino = 'staller' | 'speed' | 'supervisor' | 'saver' | 'self'
export interface Asesino { id: IdAsesino; nombre: string; libro: string; que: string }
/** Los 5 Time Assassins (p. 77–85). La señal es INFERENCIA nuestra sobre el calendario, no un diagnóstico de la persona. */
export const ASESINOS: readonly Asesino[] = [
  { id: 'staller', nombre: 'El que pospone', libro: 'The Staller', que: 'Duda en las decisiones grandes y las patea a la semana siguiente.' },
  { id: 'speed', nombre: 'El acelerado', libro: 'The Speed Demon', que: 'Decide rápido y vuelve al mismo problema.' },
  { id: 'supervisor', nombre: 'El supervisor', libro: 'The Supervisor', que: 'Revisa y rehace lo que ya delegó.' },
  { id: 'saver', nombre: 'El ahorrador', libro: 'The Saver', que: 'Hace él mismo lo que podría pagar para recuperar horas.' },
  { id: 'self', nombre: 'El que se escapa', libro: 'The Self-Medicator', que: 'Tras un golpe o un logro, las mañanas se le van.' },
]

export interface Senal { id: IdAsesino; fuerza: number; texto: string }
export interface Comparacion {
  /** Desde dónde se compara contra el plan: el lunes, o el momento de la foto si se tomó tarde (lo de antes no se juzga). */
  desdePlan: number
  /** Horas por cuadrante en [desdePlan, corte): lo planeado (la foto) y lo que quedó en el calendario. */
  plan: Record<Cuadrante, number> | null
  real: Record<Cuadrante, number>
  /** Horas por cuadrante de toda la semana hasta el corte (sin foto también): lo que se vivió. */
  semana: Record<Cuadrante, number>
  /** Producir que se cayó o se pospuso, y lo que entró sin estar en el plan. */
  cayeron: BloqueFoto[]
  pospuestos: { antes: BloqueFoto; ahora: BloqueDrip }[]
  nuevos: BloqueDrip[]
  senales: Senal[]
  dominante: Senal | null
}

const diaDe = (t: number) => new Date(t).toDateString()
const RE_REHACER = palabras('rehacer|de nuevo|otra vez|cambiar de|migrar|redise[nñ]ar|volver a')
const RE_REVISAR = palabras('revisar|revisi[oó]n|supervisar|corregir|checar|feedback|qa')

/**
 * Plan (la foto) contra lo real (el calendario ahora) en [desde, hasta). `hasta` = el fin de la semana o ahora, lo que llegue antes:
 * lo que aún no pasa no se juzga. Las señales de los asesinos son observables en el calendario; sin foto, las que la necesitan callan.
 */
export function comparar(foto: FotoSemana | null, real: readonly BloqueDrip[], desde: number, hasta: number): Comparacion {
  // Una foto tomada a media semana solo es referencia de ahí en adelante: antes, plan y real coinciden por construcción.
  // Tomada en las primeras 12 h de la semana (el lunes temprano) vale como foto de la semana completa.
  const tomada = foto ? Date.parse(foto.tomada) : desde
  const desdePlan = foto && tomada > desde + 12 * 3_600_000 ? Math.min(hasta, tomada) : desde
  const semanaR = real.filter(b => b.fin > desde && b.inicio < hasta)
  const enRango = (i: number, f: number) => f > desdePlan && i < hasta
  const realR = real.filter(b => enRango(b.inicio, b.fin))
  const porId = new Map(real.map(b => [b.id, b]))
  const plan = foto ? horasPorCuadrante(foto.bloques.map(b => ({ id: b.id, titulo: b.titulo, inicio: Date.parse(b.inicio), fin: Date.parse(b.fin), cuadrante: b.cuadrante, delegadoA: null, protegido: false, editable: false, conOtros: false, serie: null })), desdePlan, hasta) : null
  const cayeron: BloqueFoto[] = [], pospuestos: { antes: BloqueFoto; ahora: BloqueDrip }[] = []
  const enFoto = new Set(foto?.bloques.map(b => b.id) ?? [])
  for (const b of foto?.bloques ?? []) {
    const ini = Date.parse(b.inicio), fin = Date.parse(b.fin)
    if (b.cuadrante !== 'producir' || ini < desdePlan || !enRango(ini, fin)) continue
    const ahora = porId.get(b.id)
    if (!ahora) cayeron.push(b)
    else if (diaDe(ahora.inicio) !== diaDe(ini) && ahora.inicio > ini) pospuestos.push({ antes: b, ahora })
  }
  const nuevos = foto ? realR.filter(b => !enFoto.has(b.id) && b.inicio >= desdePlan) : []
  const senales: Senal[] = []
  // The Staller: Producir que se pospone o se cae (p. 78: «posponer semana tras semana»).
  // Lo que toca a Producir pesa 1.5×: es lo que el sistema protege primero.
  const pateados = cayeron.length + pospuestos.length
  if (pateados >= 2) senales.push({ id: 'staller', fuerza: 1.5 * pateados / 2, texto: `${pateados} bloques de Producir se pospusieron o se cayeron.` })
  // The Speed Demon: entra lo que no estaba y vuelve el mismo tipo de problema (p. 81).
  const rehacer = semanaR.filter(b => RE_REHACER.test(b.titulo))
  if (nuevos.length >= 5 || rehacer.length >= 2) senales.push({ id: 'speed', fuerza: Math.max(nuevos.length / 5, rehacer.length / 2),
    texto: rehacer.length >= 2 ? `${rehacer.length} bloques de rehacer o cambiar algo que ya estaba.` : `${nuevos.length} bloques entraron sin estar en el plan.` })
  // The Supervisor: horas revisando o rehaciendo trabajo de otros.
  const hRevisar = horasUnion(semanaR.filter(b => RE_REVISAR.test(b.titulo) && b.cuadrante !== 'invertir'), desde, hasta)
  if (hRevisar >= 2) senales.push({ id: 'supervisor', fuerza: hRevisar / 2, texto: `${formatoHorasDrip(hRevisar)} revisando o corrigiendo trabajo.` })
  // The Saver: horas de Delegar que siguen siendo tuyas (p. 85).
  const hDelegarTuyas = horasUnion(semanaR.filter(b => b.cuadrante === 'delegar' && !b.delegadoA), desde, hasta)
  if (hDelegarTuyas >= 2) senales.push({ id: 'saver', fuerza: hDelegarTuyas / 2, texto: `${formatoHorasDrip(hDelegarTuyas)} de Delegar siguen en tu agenda.` })
  // The Self-Medicator: SOLO el patrón de agenda (sin juzgar la causa ni leer salud): mañanas cuyo primer bloque planeado se perdió o se recorrió.
  if (foto) {
    const mananas = new Map<string, BloqueFoto>()
    for (const b of foto.bloques) { const t = Date.parse(b.inicio); if (t < desdePlan || !enRango(t, Date.parse(b.fin)) || new Date(t).getHours() >= 10) continue
      const d = diaDe(t), x = mananas.get(d); if (!x || Date.parse(x.inicio) > t) mananas.set(d, b) }
    let perdidas = 0
    for (const b of mananas.values()) { const r = porId.get(b.id); if (!r || r.inicio > Date.parse(b.inicio) + 30 * 60_000) perdidas++ }
    if (perdidas >= 2) senales.push({ id: 'self', fuerza: perdidas / 2, texto: `${perdidas} mañanas tu primer bloque se perdió o se recorrió.` })
  }
  senales.sort((a, b) => b.fuerza - a.fuerza)
  return { desdePlan, plan, real: horasPorCuadrante(realR, desdePlan, hasta), semana: horasPorCuadrante(semanaR, desde, hasta), cayeron, pospuestos, nuevos, senales, dominante: senales[0] ?? null }
}

export type TipoPropuesta = 'proteger' | 'delegar'
export interface Propuesta { tipo: TipoPropuesta; bloque: BloqueDrip; texto: string; porque: string }

/**
 * UNA propuesta para la semana que viene, que se aprueba con un toque y se escribe por la pluma (con ⌘Z):
 *   - si apareció The Saver o The Supervisor: marcar delegado a Levy el bloque Delegar/Reemplazar más largo que aún es tuyo;
 *   - si no: proteger el bloque de Producir más largo aún sin proteger (el que más vale cuidar).
 * Solo bloques editables y sin invitados (los eventos con otras personas no se tocan). Sin candidato, null.
 */
export function proponer(siguiente: readonly BloqueDrip[], dominante: IdAsesino | null): Propuesta | null {
  const tocable = siguiente.filter(b => b.editable && !b.conOtros)
  const dur = (b: BloqueDrip) => b.fin - b.inicio
  const delegables = tocable.filter(b => esDelegable(b.cuadrante) && !b.delegadoA).sort((a, b) => dur(b) - dur(a) || a.inicio - b.inicio)
  const producir = tocable.filter(b => b.cuadrante === 'producir' && !b.protegido).sort((a, b) => dur(b) - dur(a) || a.inicio - b.inicio)
  if ((dominante === 'saver' || dominante === 'supervisor') && delegables[0]) {
    const b = delegables[0]
    return { tipo: 'delegar', bloque: b, texto: `Marca «${limpiar(b.titulo)}» como de Levy`, porque: 'Lo que te drena y paga poco no debería seguir en tu agenda.' }
  }
  if (producir[0]) {
    const b = producir[0]
    return { tipo: 'proteger', bloque: b, texto: `Protege «${limpiar(b.titulo)}»`, porque: dominante === 'staller' || dominante === 'self'
      ? 'Esta semana el Producir se movió; protegido, nada nuevo entra encima.' : 'Es tu bloque de Producir más largo: lo que te paga y te enciende va primero.' }
  }
  if (delegables[0]) {
    const b = delegables[0]
    return { tipo: 'delegar', bloque: b, texto: `Marca «${limpiar(b.titulo)}» como de Levy`, porque: 'No hay Producir por proteger; empieza por sacar lo que te drena.' }
  }
  return null
}
const limpiar = (s: string) => s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()

/** La foto del plan de una semana a partir de lo que hay en el calendario (al leerla por primera vez). */
export function fotoDe(lunes: string, bloques: readonly BloqueDrip[], desde: number, hasta: number, objetivo: string | null, entregables: number, tomada = new Date().toISOString()): FotoSemana {
  return { lunes, tomada, objetivo, entregables,
    bloques: bloques.filter(b => b.fin > desde && b.inicio < hasta).slice(0, 400)
      .map(b => ({ id: b.id, titulo: b.titulo.slice(0, 200), inicio: new Date(b.inicio).toISOString(), fin: new Date(b.fin).toISOString(), cuadrante: b.cuadrante })) }
}
