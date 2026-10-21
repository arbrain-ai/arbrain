import { instalacion, NOMBRE_SEGUNDA } from '@/config'

/** La segunda persona de la instalación, como aparece en títulos de calendario (en minúsculas, lista para regex). */
const PERSONA = NOMBRE_SEGUNDA().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/**
 * Colores por tipo de trabajo (10 oct 2026, Daniel: «mucho de todo esto es gris, quizás segmentar por colores. Mi forma de
 * trabajo»). Cada evento se pinta por su CATEGORÍA, no por su calendario: casi todo vive en «Trabajo Duro» (gris), así que el
 * color del calendario no decía nada. Lógica pura, sin DOM. La usan la Semana, el Día, el Mes y la vista del chat.
 *
 * De dónde sale la categoría, en este orden:
 *   0. Un calendario del grupo Vida (GRUPOS_CALENDARIO) es Vida siempre: su gris cálido, sin colores propios de Google.
 *   1. El `colorId` del evento en Google (lo escribe `mc-event.py --categoria` o Daniel a mano en Google Calendar).
 *   2. El emoji con que empieza el título (🎥 crear, 💬 vender…): Levy titula así sus bloques.
 *   3. Palabras del título y luego de la descripción (REGLAS, en orden; la primera que coincide gana).
 *   4. El calendario de origen (POR_CALENDARIO) y, si nada coincide, Construir (o Vida en el calendario personal).
 *
 * Para cambiar cómo se clasifica algo, editar SOLO este archivo: EMOJIS, REGLAS o POR_CALENDARIO.
 * El mapa categoría → colorId lo repite `arbrain/server/scripts/calendar/mc-event.py` (CATEGORIAS); una prueba los compara.
 */

export type Categoria = 'crear' | 'vender' | 'ensenar' | 'construir' | 'vida'

export interface DefCategoria {
  id: Categoria
  nombre: string
  /** En la leyenda angosta (panel, teléfono). */
  corto: string
  /** Tono base; `estiloEvento` lo vuelve tinte legible en claro y oscuro (contraste medido). */
  color: string
  /** El colorId de Google que se escribe para esta categoría. */
  colorId: string
}

/** Las cinco, en el orden de la leyenda. Ámbar = el oro de la marca; morado = el morado de la marca (nucleo.md). */
export const CATEGORIAS: readonly DefCategoria[] = [
  { id: 'crear', nombre: 'Crear', corto: 'Crear', color: '#e5484d', colorId: '11' },
  { id: 'vender', nombre: 'Vender', corto: 'Vender', color: '#1f9d63', colorId: '10' },
  { id: 'ensenar', nombre: 'Enseñar y comunidad', corto: 'Enseñar', color: '#8c27f1', colorId: '3' },
  { id: 'construir', nombre: 'Construir', corto: 'Construir', color: '#e8c03a', colorId: '5' },
  { id: 'vida', nombre: 'Vida', corto: 'Vida', color: '#9a8f80', colorId: '8' },
]
export const DEF: Record<Categoria, DefCategoria> = Object.fromEntries(CATEGORIAS.map(c => [c.id, c])) as Record<Categoria, DefCategoria>
export const esCategoria = (x: unknown): x is Categoria => typeof x === 'string' && x in DEF

/**
 * Los 11 colorId de Google → categoría. Los que escribe Arbrain (6, 10, 3, 9, 8) y sus vecinos de tono:
 *   11 Tomate → Crear (rojo, desde el 11 oct; 6 Mandarina, el ámbar de antes, sigue siendo Crear) · 2 Salvia, 10 Albahaca → Vender (verde)
 *   1 Lavanda, 3 Uva → Enseñar (morado) · 5 Plátano → Construir (amarillo, desde el 11 oct; 7 y 9, el azul de antes, siguen siendo Construir) · 4 Flamenco, 8 Grafito → Vida
 */
export const POR_COLOR_ID: Record<string, Categoria> = {
  '1': 'ensenar', '2': 'vender', '3': 'ensenar', '4': 'vida', '5': 'construir', '6': 'crear',
  '7': 'construir', '8': 'vida', '9': 'construir', '10': 'vender', '11': 'crear',
}

/** El emoji del inicio del título (sin el selector de variación). Los ambiguos (🧠, 🎯, 📞, ✍️ que es escribir o firmar en frío) no están: deciden las palabras. */
export const EMOJIS: Record<string, Categoria> = {
  '🎥': 'crear', '🎬': 'crear', '🎙': 'crear', '📝': 'crear', '🖼': 'crear', '📸': 'crear', '🎨': 'crear', '📹': 'crear',
  '💬': 'vender', '📣': 'vender', '💰': 'vender', '🤝': 'vender', '💸': 'vender', '📩': 'vender', '📧': 'vender',
  '🎓': 'ensenar', '🏛': 'ensenar', '👥': 'ensenar', '🧑‍🏫': 'ensenar',
  '🛠': 'construir', '🧭': 'construir', '🗓': 'construir', '📅': 'construir', '⚙': 'construir', '💻': 'construir', '🤖': 'construir', '📊': 'construir',
  '🏋': 'vida', '🏊': 'vida', '🍳': 'vida', '☕': 'vida', '🌅': 'vida', '🌙': 'vida', '⭐': 'vida', '🚿': 'vida', '🫶': 'vida',
  '👨‍👩‍👧': 'vida', '❤': 'vida', '🍽': 'vida', '✈': 'vida', '😴': 'vida', '🧘': 'vida', '🏃': 'vida', '💳': 'vida',
}

/** Palabras completas (también con acentos: `\b` de JS no los entiende), sin distinguir mayúsculas. */
function palabras(lista: string, ...literales: string[]): RegExp {
  const extra = literales.map(l => '|' + l.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('')
  return new RegExp(`(?<![\\p{L}\\d])(?:${lista})(?![\\p{L}\\d])${extra}`, 'iu')
}
/**
 * Palabras, en orden: la primera regla que coincide gana. El orden resuelve los cruces de la semana real de Daniel:
 * «Videollamada de comunidad · Producto…» es Enseñar antes que Construir; «Arbrain para la comunidad» es Construir antes
 * que Enseñar; «Prospección en Frío… · Nivel 7» es una clase (Enseñar) antes que Vender.
 */
export const REGLAS: readonly [RegExp, Categoria][] = [
  [palabras(`gym|gimnasio|sauna|nataci[oó]n|correr|caminata|yoga|${PERSONA}|familia|hermano|pap[aá]|mam[aá]|desayuno|comida|almuerzo|cena|ducha|siesta|descanso|dormir|vacaciones|viaje|vuelo|aeropuerto|doctor|m[eé]dico|dentista|terapia|cumplea[nñ]os|boda|rutina de despertar|cierre del d[ií]a`), 'vida'],
  [palabras('nivel \\d+|videollamada de comunidad|clase|masterclass en vivo|taller|workshop|mentor[ií]a|q ?& ?a|sesi[oó]n grupal|accelerator'), 'ensenar'],
  [palabras('arbrain|levy|c[oó]digo|agentes?|empaquetar|deploy|bug|refactor|sistema|servidor|api|ui ?/ ?ux|automatiza\\w*|cron|infra\\w*'), 'construir'],
  [palabras('prospecci[oó]n|prospectar|invitaci[oó]n(es)?|invitar|mensajes?|ventas?|vender|polar|aplicaciones|cierre de venta|llamada de venta|seguimiento|oferta|precio|lanzamiento|cold|outbound|leads?', "/aplicar"), 'vender'],
  [palabras('comunidad|skool|alumnos?|miembros?|nutrir|nutrici[oó]n de la comunidad|masterclass'), 'ensenar'],
  [palabras('grabar|grabaci[oó]n|vlog|guion|gui[oó]n|escribir|editar|edici[oó]n|video|miniaturas?|thumbnail|post|publicar|pieza|short|reel|contenido|youtube|c[aá]mara|marketing'), 'crear'],
  [palabras('estrategia|planeaci[oó]n|plan|blueprint|estudiar|decisiones?|firmar|firmas?|revisar|deep work|producto|arquitectura'), 'construir'],
]

/** El calendario de origen, cuando el título no dice nada. Por nombre (o el correo, para los principales). */
export const POR_CALENDARIO: readonly [RegExp, Categoria][] = [
  [new RegExp(`${PERSONA}|familia|salud|gym|personal|vida|cumplea`, 'i'), 'vida'],
  [/comunidad|skool|saasfactory\.so|clases?/i, 'ensenar'],
  [/ventas?|prospec|clientes?|polar/i, 'vender'],
  [/contenido|youtube|grabaci|marketing/i, 'crear'],
  [/trabajo|arbrain|sistema|c[oó]digo/i, 'construir'],
  [/@gmail\.com$/i, 'vida'],
]

/**
 * Los calendarios de Google en dos grupos (10 oct 2026, Daniel: «los calendarios de trabajo… encendidos por defecto»). El menú
 * «Calendarios» los muestra en bloques con una casilla por grupo, y todo lo de Vida se pinta con el gris de Vida: los cuatro
 * colores vivos quedan para el trabajo. Por el inicio del título (algunos llevan emoji al final), sin distinguir mayúsculas.
 */
export type GrupoCalendario = 'trabajo' | 'vida'
export const GRUPOS_CALENDARIO: readonly { id: GrupoCalendario; nombre: string; titulos: readonly string[] }[] = [
  { id: 'trabajo', nombre: 'Trabajo', titulos: ['trabajo duro', 'trabajo compartido', ...[instalacion().correoNegocio, instalacion().correoDueno].filter(Boolean)] },
  { id: 'vida', nombre: 'Vida', titulos: ['comidas', `tiempo con ${PERSONA}`, 'ejercicio', 'transporte'] },
]
export function grupoDeCalendario(titulo: string | null | undefined): GrupoCalendario | null {
  const t = (titulo ?? '').trim().toLowerCase()
  return t ? GRUPOS_CALENDARIO.find(g => g.titulos.some(x => t === x || t.startsWith(x + ' ')))?.id ?? null : null
}

/** Trabajo, Vida y, si queda alguno sin grupo, «Otros» (el menú «Calendarios»). Lo de Vida lleva el gris de Vida, no su color de Google. */
export function bloquesDeCalendarios<C extends { titulo: string; color: string | null }>(calendarios: readonly C[]): { id: GrupoCalendario | 'otros'; nombre: string; calendarios: C[] }[] {
  const bloques = GRUPOS_CALENDARIO.map(g => ({ id: g.id as GrupoCalendario | 'otros', nombre: g.nombre,
    calendarios: calendarios.filter(c => grupoDeCalendario(c.titulo) === g.id).map(c => g.id === 'vida' ? { ...c, color: DEF.vida.color } : c) }))
  const otros = calendarios.filter(c => !grupoDeCalendario(c.titulo))
  return [...bloques, { id: 'otros' as const, nombre: 'Otros', calendarios: otros }].filter(b => b.calendarios.length > 0)
}

export type Origen = 'color' | 'emoji' | 'titulo' | 'descripcion' | 'calendario' | 'defecto'

/** Las letras del primer «grafema» del título que importan para el emoji (quita el selector de variación U+FE0F). */
function emojiInicial(titulo: string): string | null {
  const limpio = titulo.replace(/^\s*✓\s*/, '').trimStart()
  const m = /^(\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*)/u.exec(limpio)
  return m ? m[1].replace(/️/g, '') : null
}

/** Quita lo que no es contenido: la etiqueta de origen de los bloques de agente. */
const sinEtiquetas = (s: string) => s.replace(/\[habit-system\]/gi, ' ')

const primera = (texto: string): Categoria | null => {
  for (const [re, c] of REGLAS) if (re.test(texto)) return c
  return null
}

/** La categoría de un evento y de dónde salió (la leyenda y las pruebas lo usan para explicar). */
export function categoriaDe(e: { title: string; description?: string; colorId?: string | null }, calendario?: string | null): { categoria: Categoria; origen: Origen } {
  if (grupoDeCalendario(calendario) === 'vida') return { categoria: 'vida', origen: 'calendario' }
  if (e.colorId && POR_COLOR_ID[e.colorId]) return { categoria: POR_COLOR_ID[e.colorId], origen: 'color' }
  const emoji = emojiInicial(e.title ?? '')
  if (emoji && EMOJIS[emoji]) return { categoria: EMOJIS[emoji], origen: 'emoji' }
  const porTitulo = primera(e.title ?? '')
  if (porTitulo) return { categoria: porTitulo, origen: 'titulo' }
  const porDescripcion = e.description ? primera(sinEtiquetas(e.description)) : null
  if (porDescripcion) return { categoria: porDescripcion, origen: 'descripcion' }
  for (const [re, c] of POR_CALENDARIO) if (calendario && re.test(calendario)) return { categoria: c, origen: 'calendario' }
  return { categoria: 'construir', origen: 'defecto' }
}

/** Compromiso con otra persona: invitados que no son Daniel o enlace de videollamada. Lleva borde sólido más grueso. */
export function esCompromiso(e: { meetUrl?: string | null; attendees?: { self: boolean }[] }): boolean {
  return Boolean(e.meetUrl) || (e.attendees ?? []).some(a => !a.self)
}

/**
 * Horas planeadas por categoría en un periodo [desde, hasta) (epoch ms): solo eventos con hora, recortados al periodo.
 * Los solapes cuentan dos veces a propósito: es lo planeado, no lo vivido.
 */
export function horasPorCategoria(eventos: { inicio: number; fin: number; categoria: Categoria }[], desde: number, hasta: number): Record<Categoria, number> {
  const horas = Object.fromEntries(CATEGORIAS.map(c => [c.id, 0])) as Record<Categoria, number>
  for (const e of eventos) {
    const ms = Math.min(e.fin, hasta) - Math.max(e.inicio, desde)
    if (ms > 0) horas[e.categoria] += ms / 3_600_000
  }
  return horas
}

/** «6 h», «1,5 h», «45 min», «—». */
export function formatoHoras(h: number): string {
  if (h <= 0) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  const r = Math.round(h * 2) / 2
  return `${String(r).replace('.', ',')} h`
}

/** Preferencia de la leyenda: qué categorías están ocultas (localStorage, igual en la sección, el panel y el chat). */
export const CLAVE_OCULTAS = 'arbrain:planning:categorias-ocultas'
export function leerOcultas(): Set<Categoria> {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_OCULTAS) ?? '[]'); return new Set(Array.isArray(v) ? v.filter(esCategoria) : []) } catch { return new Set() }
}
export function guardarOcultas(s: Set<Categoria>) {
  try { localStorage.setItem(CLAVE_OCULTAS, JSON.stringify([...s])) } catch { /* sin almacenamiento: vale para esta sesión */ }
}
