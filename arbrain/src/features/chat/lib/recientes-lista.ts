import type { ChatSession } from '../hooks/useChatHistory'
import { esProtegida } from './atajos-conversacion'
import { esHiloRutina } from '@/shared/constants/rutinas-hilos'
import { hayNoVisto } from './session-status'

/** Instante de una conversación en «Recientes»: su último mensaje; sin mensajes, su última edición. */
export const momento = (s: ChatSession) => Date.parse(s.last_message_at ?? s.updated_at) || 0

/**
 * Por su último mensaje, lo más nuevo primero. El hilo de reportes vigente (el fijado, historial de los crons
 * sin hilo propio) sí entra: la barra lo saca de Fijadas y lo pone dentro de la carpeta «Rutinas» (4 oct 2026);
 * los «Automatizaciones» viejos de migraciones sin fijar siguen fuera (en la base y en Buscar). Los hilos de
 * Rutinas tampoco: viven en su carpeta, no en Recientes.
 */
export function ordenarRecientes(sesiones: ChatSession[], max = Infinity): ChatSession[] {
  return sesiones
    .filter((s) => (s.title !== 'Automatizaciones' || !!s.is_favorite) && !esHiloRutina(s))
    .slice()
    .sort((a, b) => momento(b) - momento(a))
    .slice(0, max)
}

/** ¿Es una conversación de Arbrain? Las de la base sí; las solo-SDK solo si el journal tiene turnos suyos. */
export const esDeArbrain = (s: ChatSession) => !s.isSDKOnly || !!s.conTurnosArbrain

/**
 * Une lo que la barra pidió a la API con lo que publica ChatPanel (1 oct 2026). La publicada es
 * en vivo (títulos, semáforo, fijada, conversación nueva) y gana si no es más vieja que la traída;
 * sin duplicar por id. Entran todas las cuentas (sin filtro: Daniel lo pidió así el 1 oct). Las
 * sesiones de Claude Code sin fila en la base (`isSDKOnly`) quedan fuera salvo que el journal del
 * daemon tenga turnos de Arbrain en ellas (`conTurnosArbrain`): el resto son de Claude Desktop o
 * transcritos de crons, no conversaciones de Arbrain.
 */
export function unirListas(traidas: ChatSession[], publicadas: ChatSession[]): ChatSession[] {
  const porId = new Map<string, ChatSession>()
  for (const s of traidas) if (esDeArbrain(s)) porId.set(s.id, s)
  for (const s of publicadas) {
    if (!esDeArbrain(s)) continue
    const previa = porId.get(s.id)
    if (!previa || momento(s) >= momento(previa)) porId.set(s.id, s)
  }
  return ordenarRecientes([...porId.values()])
}

/** Las fijadas van arriba, en su propia sección y sin límite de días; no se repiten en los días. */
export function separarFijadas(lista: ChatSession[]): { fijadas: ChatSession[]; resto: ChatSession[] } {
  return { fijadas: lista.filter((s) => s.is_favorite), resto: lista.filter((s) => !s.is_favorite) }
}

// ─── Agrupar por día ──────────────────────────────────────────────────────────
// Hora local del navegador (la app corre en America/Mexico_City).

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const DIA_MS = 86_400_000

// Medianoche local como día calendario (UTC de la fecha local): la resta no sufre cambios de horario.
const diaCalendario = (ms: number) => {
  const d = new Date(ms)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Días calendario entre `ms` y `ahora` (0 = hoy). Un instante futuro cuenta como hoy. */
export function diasAtras(ms: number, ahora: number): number {
  return Math.max(0, Math.round((diaCalendario(ahora) - diaCalendario(ms)) / DIA_MS))
}

/** «Hoy», «Ayer», «Hace 2 días» y luego la fecha corta («lun 28 sept»; con año si no es el actual). */
export function etiquetaDia(ms: number, ahora: number): string {
  const dias = diasAtras(ms, ahora)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias === 2) return 'Hace 2 días'
  const d = new Date(ms)
  const anio = d.getFullYear() !== new Date(ahora).getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}${anio}`
}

/** Recientes muestra solo los últimos tres días (Hoy, Ayer, Hace 2 días). Antes todos abiertos (1 oct 2026); desde el 2 oct 2026 arrancan plegados (`recientes-plegado.ts`). */
export const DIAS_RECIENTES = 3

export interface GrupoDia {
  /** Fecha local `AAAA-MM-DD`: llave estable del grupo aunque cambie su etiqueta con los días. */
  clave: string
  etiqueta: string
  dias: number
  sesiones: ChatSession[]
}

export interface LimitesDias {
  /** Días calendario que se muestran contando hoy (7 = hoy y los 6 anteriores). */
  maxDias?: number
  maxSesiones?: number
  /** Lo más reciente que se muestra aunque sea más viejo que `maxDias`. Por defecto 0: Daniel quiere
   *  solo los últimos tres días; lo demás sigue en «Ver todas». */
  minimo?: number
}

/** Agrupa por día (lo más nuevo primero) con tope de días y de conversaciones; lo demás sigue en «Ver todas». */
export function agruparPorDia(
  sesiones: ChatSession[],
  ahora: number,
  { maxDias = DIAS_RECIENTES, maxSesiones = 40, minimo = 0 }: LimitesDias = {},
): GrupoDia[] {
  const grupos: GrupoDia[] = []
  let total = 0
  for (const s of ordenarRecientes(sesiones)) {
    const ms = momento(s)
    if (total >= maxSesiones) break
    if (ms === 0) continue // fecha ilegible: no hay día al que asignarla
    const dias = diasAtras(ms, ahora)
    if (dias >= maxDias && total >= minimo) break // vienen en orden: todo lo que sigue es más viejo
    // Un mensaje «del futuro» (reloj desfasado) cae en el grupo de hoy, no en uno propio.
    const d = new Date(Math.min(ms, ahora))
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let grupo = grupos[grupos.length - 1]
    if (!grupo || grupo.clave !== clave) {
      grupo = { clave, etiqueta: etiquetaDia(ms, ahora), dias, sesiones: [] }
      grupos.push(grupo)
    }
    grupo.sesiones.push(s)
    total++
  }
  return grupos
}

// ─── Arrastrar entre Fijadas y los días (3 oct 2026) ──────────────────────────
// Daniel: «arrastrar la conversación a las fijadas o viceversa, en lugar de los tres puntitos».

/** Tipo MIME propio del arrastre: un archivo o texto soltado en la barra no fija nada. */
export const MIME_CONVERSACION = 'application/x-arbrain-conversacion'

export type ZonaRecientes = 'fijadas' | 'dias'

/** ¿Soltar esta conversación en esta zona cambia algo? Solo cruza: una fijada a los días, una suelta a Fijadas. */
export function sueltaCambia(s: Pick<ChatSession, 'is_favorite'> | null, zona: ZonaRecientes): boolean {
  if (!s) return false
  return zona === 'fijadas' ? !s.is_favorite : !!s.is_favorite
}

// ─── Reacomodar las fijadas (4 oct 2026) ──────────────────────────────────────
// Daniel: «arrastrar las conversaciones y reposicionarlas». Fijadas lleva orden manual (`pinned_position`,
// guardado en la base); los días siguen por fecha.

/**
 * Orden de la sección Fijadas: primero las que aún no tienen posición (recién fijadas desde el menú o
 * de antes de existir el orden), por su último mensaje; luego las acomodadas a mano, por su posición.
 */
export function ordenarFijadas(fijadas: ChatSession[]): ChatSession[] {
  return fijadas.slice().sort((a, b) => {
    // «Reportes» (el hilo de los crons) siempre primero: es fijo y no se arrastra.
    const ra = esProtegida(a), rb = esProtegida(b)
    if (ra !== rb) return ra ? -1 : 1
    const pa = a.pinned_position ?? null
    const pb = b.pinned_position ?? null
    if (pa === null && pb === null) return momento(b) - momento(a)
    if (pa === null) return -1
    if (pb === null) return 1
    return pa - pb || momento(b) - momento(a)
  })
}

/**
 * Hueco donde caería lo arrastrado: 0 = antes de la primera fila, `mitades.length` = después de la última.
 * `mitades` = la altura (Y) de la mitad de cada fila, de arriba abajo.
 */
export function huecoEn(mitades: number[], y: number): number {
  const i = mitades.findIndex((m) => y < m)
  return i === -1 ? mitades.length : i
}

/**
 * Nuevo orden de ids al soltar `id` en el hueco `hueco` (contado sobre `ids` tal como se ven, con `id`
 * dentro si ya era fijada). Devuelve null si soltarla ahí no la mueve.
 */
export function reacomodar(ids: string[], id: string, hueco: number): string[] | null {
  const desde = ids.indexOf(id)
  if (desde !== -1 && (hueco === desde || hueco === desde + 1)) return null
  const sin = ids.filter((x) => x !== id)
  const destino = desde !== -1 && desde < hueco ? hueco - 1 : hueco
  sin.splice(Math.max(0, Math.min(destino, sin.length)), 0, id)
  return sin
}

// ─── Carpeta «Rutinas» (4 oct 2026) ───────────────────────────────────────────

/**
 * Fijadas sin el hilo de reportes (que pasa a la carpeta «Rutinas») y ese hilo aparte. La carpeta sustituye
 * al «Reportes» fijado: desaparece de Fijadas sin desfijarse en la base (el webhook lo busca por fijado).
 */
export function sacarReportes(fijadas: ChatSession[]): { fijadas: ChatSession[]; reportes: ChatSession | null } {
  return {
    fijadas: fijadas.filter((s) => !esProtegida(s)),
    reportes: fijadas.find((s) => esProtegida(s)) ?? null,
  }
}

/** Hora del último resultado en la fila de un hilo: «14:05» si es de hoy; si no, el día corto («ayer», «lun 28 sept»). */
export function horaDelUltimo(ms: number, ahora: number): string {
  if (!ms) return ''
  if (diasAtras(ms, ahora) === 0) return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  return etiquetaDia(ms, ahora).toLowerCase()
}

/**
 * ¿El hilo de Rutinas pide algo a Daniel? (morado). El cron declaró la decisión (`ends_question`, ver el webhook)
 * y Daniel aún no la ve: abrir el hilo (markRead) o contestarlo (el último mensaje deja de ser del reporte) lo
 * pasa a gris. Lo que no se declara es gris.
 */
export const pideDecision = (s: ChatSession): boolean => !!s.ends_question && hayNoVisto(s)

/** Texto de la cabecera de la carpeta: «2 te necesitan» o «al día» si todo está gris. */
export function resumenRutinas(morados: number): { texto: string; alDia: boolean } {
  return morados > 0
    ? { texto: morados === 1 ? '1 te necesita' : `${morados} te necesitan`, alDia: false }
    : { texto: 'al día', alDia: true }
}
