/**
 * Rutinas del alumno (T8, 29 oct 2026; inventario de la cohorte: «todavía no tengo rutinas andando… no entendí bien cómo
 * aplicarlo»). Lógica pura que comparten la pestaña Taller › Rutinas de la edición cliente y su ruta `/api/rutinas`:
 * el formulario simple (qué + cuándo) a cron, el cron a una frase y cada rutina del daemon a lo que ve el dueño.
 * El daemon valida otra vez (server/src/cliente/rutinas.ts): esto es para responder rápido y en palabras simples.
 */
import { cuando, hace, resumen } from '@/features/rutinas/model'

/** Una rutina tal como la entrega `GET /schedule` del daemon. */
export interface RutinaDaemon {
  id: string; prompt: string; schedule: string; status: 'active' | 'paused'
  next_run: number | null; last_run: number | null; last_result: string | null; created_at?: number
}
export interface ListaRutinas { tasks: RutinaDaemon[]; tz?: string; aviso?: string | null }

export type TipoCuando = 'diario' | 'entre-semana' | 'semanal' | 'cada-hora' | 'avanzado'
export interface Formulario { que: string; tipo: TipoCuando; hora?: string; dia?: number; cron?: string }

export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
export const TIPOS_CUANDO: { id: TipoCuando; etiqueta: string }[] = [
  { id: 'diario', etiqueta: 'Cada día a una hora' },
  { id: 'entre-semana', etiqueta: 'De lunes a viernes' },
  { id: 'semanal', etiqueta: 'Una vez por semana' },
  { id: 'cada-hora', etiqueta: 'Cada hora' },
  { id: 'avanzado', etiqueta: 'Avanzado (cron)' },
]
export const PROMPT_MAX = 2000

const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/
const CRON = /^[0-9*/,\- ]+$/

/** El formulario simple a una expresión cron de 5 campos, o el error en palabras del dueño. Pura. */
export function cronDeFormulario(f: Pick<Formulario, 'tipo' | 'hora' | 'dia' | 'cron'>): { ok: true; schedule: string } | { ok: false; error: string } {
  if (f.tipo === 'cada-hora') return { ok: true, schedule: '0 * * * *' }
  if (f.tipo === 'avanzado') {
    const c = (f.cron ?? '').trim().replace(/\s+/g, ' ')
    if (c.split(' ').length !== 5 || !CRON.test(c)) return { ok: false, error: 'Escribe cinco campos de cron, por ejemplo «30 7 * * 1-5».' }
    return { ok: true, schedule: c }
  }
  const m = HORA.exec((f.hora ?? '').trim())
  if (!m) return { ok: false, error: 'Elige la hora (por ejemplo 07:00).' }
  const [h, min] = [Number(m[1]), Number(m[2])]
  if (f.tipo === 'diario') return { ok: true, schedule: `${min} ${h} * * *` }
  if (f.tipo === 'entre-semana') return { ok: true, schedule: `${min} ${h} * * 1-5` }
  if (f.tipo === 'semanal') {
    if (!Number.isInteger(f.dia) || f.dia! < 0 || f.dia! > 6) return { ok: false, error: 'Elige el día de la semana.' }
    return { ok: true, schedule: `${min} ${h} * * ${f.dia}` }
  }
  return { ok: false, error: 'Elige cuándo debe correr.' }
}

/** Todo el formulario: qué quieres que haga + cuándo. Pura. */
export function validarFormulario(f: Formulario): { ok: true; prompt: string; schedule: string } | { ok: false; error: string } {
  const prompt = (f.que ?? '').trim()
  if (prompt.length < 3) return { ok: false, error: 'Escribe qué quieres que haga.' }
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Es demasiado largo: máximo ${PROMPT_MAX} caracteres.` }
  const c = cronDeFormulario(f)
  return c.ok ? { ok: true, prompt, schedule: c.schedule } : c
}

const dosDigitos = (m: string) => m.padStart(2, '0')

/** Un cron a una frase: «Cada día a las 7:00», «Cada lunes a las 9:30», «Cada hora, en punto». Pura. */
export function cuandoRutina(schedule: string): string {
  const partes = schedule.trim().split(/\s+/)
  if (partes.length !== 5) return `Horario avanzado: ${schedule}`
  const [min, hora, dom, mes, dow] = partes
  const simple = dom === '*' && mes === '*'
  if (simple && hora === '*' && dow === '*' && /^\d+$/.test(min)) return Number(min) === 0 ? 'Cada hora, en punto' : `Cada hora, al minuto ${Number(min)}`
  if (simple && /^\d+$/.test(min) && /^\d+$/.test(hora)) {
    const a = `a las ${Number(hora)}:${dosDigitos(min)}`
    if (dow === '*') return `Cada día ${a}`
    if (dow === '1-5') return `De lunes a viernes ${a}`
    if (dow === '0,6' || dow === '6,0') return `Sábados y domingos ${a}`
    if (/^[0-7]$/.test(dow)) return `Cada ${DIAS_SEMANA[Number(dow) % 7]} ${a}`
  }
  const frase = cuando(schedule)
  return frase === schedule ? `Horario avanzado: ${schedule}` : frase
}

/** Cuándo vuelve a correr: «hoy 7:00», «mañana 7:00», «lun 3 nov · 7:00». Pura. */
export function proximaEn(seg: number | null, ahora: number, tz = 'America/Mexico_City'): string {
  if (!seg) return 'sin fecha'
  const ms = seg * 1000
  const dia = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: tz })
  const partes = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(new Date(ms))
  const h = `${Number(partes.find(p => p.type === 'hour')?.value ?? 0)}:${partes.find(p => p.type === 'minute')?.value ?? '00'}`
  if (dia(ms) === dia(ahora)) return `hoy ${h}`
  if (dia(ms) === dia(ahora + 86_400_000)) return `mañana ${h}`
  return `${new Date(ms).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })} · ${h}`
}

export interface VistaRutina {
  id: string; titulo: string; texto: string; cuando: string; activa: boolean; deLevy: boolean
  proxima: string; ultima: string | null; resultado: string | null; fallo: boolean
}

/** Una rutina del daemon a lo que ve el dueño. Pura. */
export function vistaRutina(t: RutinaDaemon, ahora: number, tz?: string): VistaRutina {
  const activa = t.status === 'active'
  const crudo = t.last_result?.trim() || null
  const fallo = !!crudo && /^error:/i.test(crudo)
  const primera = t.prompt.trim().split('\n')[0] ?? ''
  return {
    id: t.id,
    titulo: primera.length > 90 ? `${primera.slice(0, 89).trimEnd()}…` : primera,
    texto: t.prompt,
    cuando: cuandoRutina(t.schedule),
    activa,
    deLevy: t.id.startsWith('levy-'),
    proxima: activa ? proximaEn(t.next_run, ahora, tz) : 'en pausa',
    ultima: t.last_run ? hace(t.last_run * 1000, ahora, tz) : null,
    resultado: crudo ? resumen(crudo.replace(/^(?:error:\s*)+/i, ''), 400) : null,
    fallo,
  }
}

// ── Adaptador de la ruta web → daemon ──

export type AccionRutina = 'pausar' | 'reanudar' | 'probar'
const ACCIONES: Record<AccionRutina, string> = { pausar: 'pause', reanudar: 'resume', probar: 'run' }
const ID = /^[A-Za-z0-9_-]{1,160}$/

/** La ruta del daemon para una acción sobre una rutina; null si el id o la acción no valen. Pura. */
export function rutaDaemon(id: unknown, accion: unknown): string | null {
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (accion === 'borrar') return `/schedule/${id}`
  if (typeof accion !== 'string' || !(accion in ACCIONES)) return null
  return `/schedule/${id}/${ACCIONES[accion as AccionRutina]}`
}

/** El cuerpo que llega del navegador para crear: solo `prompt` y `schedule`, ya revisados. Pura. */
export function cuerpoCrear(j: unknown): { prompt: string; schedule: string } | { error: string } {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>
  if (typeof o.prompt !== 'string' || typeof o.schedule !== 'string') return { error: 'Falta qué quieres que haga o cuándo.' }
  const prompt = o.prompt.trim(), schedule = o.schedule.trim().replace(/\s+/g, ' ')
  if (prompt.length < 3 || prompt.length > PROMPT_MAX) return { error: 'Escribe qué quieres que haga (hasta 2000 caracteres).' }
  if (schedule.split(' ').length !== 5 || !CRON.test(schedule)) return { error: 'El horario no es válido.' }
  return { prompt, schedule }
}
