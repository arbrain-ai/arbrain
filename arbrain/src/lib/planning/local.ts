/**
 * Calendario local de la edición cliente (21 oct 2026, cohorte fundadora: «El calendario… también debería estar actualizado»).
 *
 * En la instalación original, `/api/planning` llama a la pluma `mc-event.py` (el Google, el Todoist y el Supabase del autor). Ese
 * script no viaja en el paquete del alumno. Aquí vive la misma pluma, en TypeScript y sobre archivos de SU cerebro:
 *
 *   - `<ARBRAIN_HOME>/.claude/plan/calendario.json`: eventos, bloques y tareas con fecha. Levy lo edita directo cuando
 *     el alumno pide «agéndame…» (el archivo trae su propio instructivo en `_como_se_usa`); la app escribe por aquí.
 *   - `<ARBRAIN_HOME>/.claude/plan/objetivos.md`: objetivos del mes, la semana y el día. El MISMO formato y registro
 *     (`arbrain-objectives-v1`) que `server/scripts/calendar/objectives_store.py`: un archivo, dos plumas compatibles.
 *
 * Contrato: idéntico al de `callPlanning` (snapshot, create/update/delete/complete/move/reopen, objectives-read/write),
 * así la vista del calendario no sabe de dónde vienen los datos. Google Calendar entra después como otra fuente
 * (fase 2, con el OAuth propio del alumno): por eso cada evento conserva `account`/`calendarId` de su fuente.
 *
 * Seguridad: nunca lee rutas de la instalación original (`raizWorkspace` exige ARBRAIN_HOME en cliente) ni credenciales.
 * Escrituras atómicas (tmp + rename), una a la vez dentro del proceso, recibo por `requestId` (un reintento no duplica)
 * y verificación de que el archivo no cambió a mano mientras se guardaba.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ChatAccessError } from '@/lib/chat-access-policy'

// ── Archivos ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const RUTA_CALENDARIO = '.claude/plan/calendario.json'
export const RUTA_OBJETIVOS = '.claude/plan/objetivos.md'

export const FUENTE_LOCAL = { id: 'local:mi-calendario', calendarId: 'local', account: 'local' } as const
const COLOR_LOCAL = '#7C8CFF'

const INSTRUCTIVO = [
  'Tu calendario local de Arbrain. Lo pinta la sección Calendario del panel (Día, Semana y Mes).',
  'Levy lo edita cuando le pides «agéndame…», «bloquea…» o «ponme una tarea para…». También lo puedes editar a mano.',
  'eventos[]: { id (texto único), titulo, inicio y fin (ISO con zona, p. ej. 2026-10-22T09:00:00-06:00; todo el día: 2026-10-22 y fin = día siguiente),',
  '  todoElDia (true/false), descripcion, lugar, repetir (opcional, una regla RRULE: FREQ=DAILY | FREQ=WEEKLY;BYDAY=MO,WE,FR | FREQ=MONTHLY; admite INTERVAL, COUNT y UNTIL=AAAAMMDD),',
  '  omitir (fechas AAAA-MM-DD sin esa repetición), zona (opcional, p. ej. America/Mexico_City) }.',
  'tareas[]: { id, titulo, descripcion, fecha (AAAA-MM-DD o ISO con hora; null = sin fecha), duracionMin, prioridad (1 urgente … 4 normal), hecha, hechaEn, etiquetas[] }.',
  'Los objetivos del mes, la semana y el día viven en objetivos.md (misma carpeta). No edites «recibos»: los usa la app para no duplicar.',
]

export interface EventoLocal {
  id: string; titulo: string; inicio: string; fin: string; todoElDia?: boolean; descripcion?: string; lugar?: string
  repetir?: string | null; omitir?: string[]; zona?: string; actualizado?: string
}
export interface TareaLocal {
  id: string; titulo: string; descripcion?: string; fecha?: string | null; duracionMin?: number | null; prioridad?: number
  hecha?: boolean; hechaEn?: string | null; etiquetas?: string[]; actualizado?: string; creada?: string
}
export interface CalendarioLocal {
  _como_se_usa?: string[]; version: 1; zona?: string; eventos: EventoLocal[]; tareas: TareaLocal[]
  recibos?: Record<string, { huella: string; resultado: unknown; en: string }>
}

export const calendarioVacio = (zona?: string): CalendarioLocal => ({ _como_se_usa: INSTRUCTIVO, version: 1, ...(zona ? { zona } : {}), eventos: [], tareas: [], recibos: {} })

function zonaDelSistema() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

function leerTexto(ruta: string): string | null {
  try { return readFileSync(ruta, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new ChatAccessError('No se pudo leer tu calendario local. No significa que esté vacío.', 503) }
}

function escribirAtomico(ruta: string, contenido: string) {
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = `${ruta}.${randomUUID()}.tmp`
  try { writeFileSync(tmp, contenido, { encoding: 'utf8', mode: 0o600 }); renameSync(tmp, ruta) }
  finally { if (existsSync(tmp)) try { unlinkSync(tmp) } catch { /* noop */ } }
}

export function decodificarCalendario(texto: string | null): CalendarioLocal {
  if (texto === null || !texto.trim()) return calendarioVacio()
  let d: CalendarioLocal
  try { d = JSON.parse(texto) } catch { throw new ChatAccessError('calendario.json no es JSON válido. Corrígelo (o pídeselo a Levy); no se sobrescribió.', 409) }
  if (!d || typeof d !== 'object' || !Array.isArray(d.eventos) || !Array.isArray(d.tareas)) throw new ChatAccessError('calendario.json no tiene «eventos» y «tareas». No se sobrescribió.', 409)
  return d
}

// Una escritura a la vez dentro del proceso de Next (la app es la única que escribe por aquí; Levy escribe a mano y la
// comprobación de contenido detecta ese choque).
let fila: Promise<unknown> = Promise.resolve()
function enFila<T>(f: () => T | Promise<T>): Promise<T> {
  const paso = fila.then(f)
  fila = paso.catch(() => undefined)
  return paso
}

// ── Zonas horarias sin dependencias ──────────────────────────────────────────────────────────────────────────────────

function zonaValida(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/** Fecha y hora de pared de un instante en una zona: { dia: 'AAAA-MM-DD', hora: 'HH:MM:SS' }. */
export function paredEn(instante: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(instante).map(x => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` }
}

/** El instante de una hora de pared en una zona (resuelve el horario de verano con dos pasadas). */
export function instanteDePared(dia: string, hora: string, tz: string): Date {
  const comoUtc = Date.parse(`${dia}T${hora}Z`)
  let t = comoUtc
  for (let i = 0; i < 2; i++) {
    const w = paredEn(new Date(t), tz)
    t += comoUtc - Date.parse(`${w.dia}T${w.hora}Z`)
  }
  return new Date(t)
}

const sumarDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const esDia = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))

// ── Repeticiones (RRULE mínima: DAILY, WEEKLY con BYDAY, MONTHLY por día del mes) ─────────────────────────────────────

const DIAS_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function reglaValida(r: unknown): r is string {
  if (typeof r !== 'string') return false
  const s = r.replace(/^RRULE:/, '')
  if (!/^[A-Z0-9=;,]+$/.test(s)) return false
  const f = Object.fromEntries(s.split(';').map(x => x.split('=')))
  return ['DAILY', 'WEEKLY', 'MONTHLY'].includes(f.FREQ)
}

/** Días (AAAA-MM-DD, en la zona del evento) en que ocurre una serie, dentro de [desdeDia, hastaDia). */
export function diasDeSerie(regla: string, primerDia: string, desdeDia: string, hastaDia: string): string[] {
  const f = Object.fromEntries(regla.replace(/^RRULE:/, '').split(';').map(x => x.split('=')))
  const intervalo = Math.max(1, Number(f.INTERVAL) || 1)
  const conteo = f.COUNT ? Math.max(0, Number(f.COUNT) || 0) : Infinity
  const hasta = f.UNTIL ? `${f.UNTIL.slice(0, 4)}-${f.UNTIL.slice(4, 6)}-${f.UNTIL.slice(6, 8)}` : null
  const porDia: number[] = f.BYDAY ? String(f.BYDAY).split(',').map((d: string) => DIAS_RRULE.indexOf(d.slice(-2))).filter((n: number) => n >= 0) : []
  const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()
  const out: string[] = []
  let n = 0
  const tope = hasta && hasta < hastaDia ? sumarDia(hasta, 1) : hastaDia
  for (let d = primerDia, guard = 0; d < tope && n < conteo && guard < 20_000; d = sumarDia(d, 1), guard++) {
    const dias = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${primerDia}T12:00:00Z`)) / 86_400_000)
    let toca = false
    if (f.FREQ === 'DAILY') toca = dias % intervalo === 0
    else if (f.FREQ === 'WEEKLY') {
      const semanas = Math.floor((dias + ((dow(primerDia) + 6) % 7)) / 7)
      toca = semanas % intervalo === 0 && (porDia.length ? porDia.includes(dow(d)) : dow(d) === dow(primerDia))
    } else if (f.FREQ === 'MONTHLY') {
      const meses = (Number(d.slice(0, 4)) - Number(primerDia.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(primerDia.slice(5, 7))
      toca = d.slice(8) === primerDia.slice(8) && meses % intervalo === 0
    }
    if (!toca) continue
    n++
    if (d >= desdeDia) out.push(d)
  }
  return out
}

// ── Registro → forma del calendario ──────────────────────────────────────────────────────────────────────────────────

/** JSON con llaves ordenadas en todos los niveles: la huella de una operación no depende del orden de sus campos. */
const canonico = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null'
const etiquetaDe = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const etagEvento = (e: EventoLocal) => etiquetaDe(JSON.stringify([e.titulo, e.inicio, e.fin, e.todoElDia, e.descripcion, e.lugar, e.repetir, e.omitir, e.actualizado]))

function eventoPlano(e: EventoLocal, zona: string, extra: { externalId?: string; inicio?: string; fin?: string; serie?: string } = {}) {
  const externalId = extra.externalId ?? e.id
  return {
    id: `local:${externalId}`, externalId, kind: 'event' as const, sourceId: FUENTE_LOCAL.id, account: FUENTE_LOCAL.account, calendarId: FUENTE_LOCAL.calendarId,
    title: e.titulo || 'Sin título', description: e.descripcion ?? '', location: e.lugar ?? '',
    start: extra.inicio ?? e.inicio, end: extra.fin ?? e.fin, allDay: e.todoElDia === true, timeZone: e.zona && zonaValida(e.zona) ? e.zona : zona,
    etag: etagEvento(e), recurringEventId: extra.serie ?? null, recurrence: !extra.serie && e.repetir ? [e.repetir.startsWith('RRULE:') ? e.repetir : `RRULE:${e.repetir}`] : [],
    editable: true, colorId: null, meetUrl: null, attendees: [],
  }
}

/** Expande un evento (y su serie) a las ocurrencias que tocan [desde, hasta). */
export function ocurrencias(e: EventoLocal, zonaBase: string, desde: string, hasta: string) {
  const zona = e.zona && zonaValida(e.zona) ? e.zona : zonaBase
  const ini = e.todoElDia ? Date.parse(`${e.inicio}T00:00:00Z`) : Date.parse(e.inicio)
  const fin = e.todoElDia ? Date.parse(`${e.fin}T00:00:00Z`) : Date.parse(e.fin)
  if (Number.isNaN(ini) || Number.isNaN(fin) || fin <= ini) return []
  const tDesde = Date.parse(desde), tHasta = Date.parse(hasta)
  if (!e.repetir || !reglaValida(e.repetir)) return ini < tHasta && fin > tDesde ? [eventoPlano(e, zona)] : []
  const duracion = fin - ini
  const primerDia = e.todoElDia ? e.inicio.slice(0, 10) : paredEn(new Date(ini), zona).dia
  const hora = e.todoElDia ? '00:00:00' : paredEn(new Date(ini), zona).hora
  const desdeDia = sumarDia(paredEn(new Date(tDesde - duracion), zona).dia, -1), hastaDia = sumarDia(paredEn(new Date(tHasta), zona).dia, 1)
  const omitir = new Set(e.omitir ?? [])
  return diasDeSerie(e.repetir, primerDia, desdeDia, hastaDia).filter(d => !omitir.has(d)).flatMap(d => {
    const a = e.todoElDia ? Date.parse(`${d}T00:00:00Z`) : instanteDePared(d, hora, zona).getTime()
    const b = a + duracion
    if (!(a < tHasta && b > tDesde)) return []
    const inicio = e.todoElDia ? d : new Date(a).toISOString(), finO = e.todoElDia ? new Date(b).toISOString().slice(0, 10) : new Date(b).toISOString()
    return [eventoPlano(e, zona, { externalId: `${e.id}_${d.replaceAll('-', '')}`, inicio, fin: finO, serie: e.id })]
  })
}

function tareaPlana(t: TareaLocal, zona: string) {
  return {
    id: `local:${t.id}`, externalId: t.id, kind: 'task' as const, title: t.titulo || 'Sin título', description: t.descripcion ?? '',
    projectId: 'local', sectionId: null, parentId: null, priority: [1, 2, 3, 4].includes(Number(t.prioridad)) ? Number(t.prioridad) : 4,
    due: t.fecha ?? null, timeZone: zona, recurring: false, recurrenceText: null,
    durationMinutes: typeof t.duracionMin === 'number' ? t.duracionMin : null, durationOrigin: typeof t.duracionMin === 'number' ? 'arbrain' as const : null,
    completed: t.hecha === true, completedAt: t.hechaEn ?? null, updatedAt: t.actualizado ?? t.creada ?? null, labels: t.etiquetas ?? [],
  }
}

// ── La pluma local ───────────────────────────────────────────────────────────────────────────────────────────────────

const err = (m: string, s = 400) => new ChatAccessError(m, s)
const texto = (v: unknown, campo: string, max: number, requerido = false) => {
  if (v === undefined || v === null) { if (requerido) throw err(`Falta ${campo}.`); return '' }
  if (typeof v !== 'string' || v.length > max) throw err(`Campo inválido: ${campo}`)
  if (requerido && !v.trim()) throw err(`Falta ${campo}.`)
  return v
}
function instante(v: unknown, campo: string) {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw err(`Fecha inválida: ${campo}`)
  return v
}

export class PlumaLocal {
  constructor(readonly raiz: string) {}
  get rutaCalendario() { return join(this.raiz, RUTA_CALENDARIO) }
  get rutaObjetivos() { return join(this.raiz, RUTA_OBJETIVOS) }

  leer() { return decodificarCalendario(leerTexto(this.rutaCalendario)) }

  snapshot(p: Record<string, unknown>) {
    const desde = instante(p.from, 'from'), hasta = instante(p.to, 'to')
    if (Date.parse(hasta) <= Date.parse(desde)) throw err('Rango inválido.')
    if (Date.parse(hasta) - Date.parse(desde) > 65 * 86_400_000) throw err('La ventana de lectura no puede superar 65 días.')
    const d = this.leer(), zona = zonaValida(d.zona) ? d.zona : zonaDelSistema(), stamp = new Date().toISOString()
    const events = d.eventos.flatMap(e => { try { return ocurrencias(e, zona, desde, hasta) } catch { return [] } })
    const pendientes = d.tareas.filter(t => !t.hecha).map(t => tareaPlana(t, zona))
    const hechas = p.includeCompleted ? d.tareas.filter(t => t.hecha && t.hechaEn && Date.parse(t.hechaEn) >= Date.parse(desde) && Date.parse(t.hechaEn) < Date.parse(hasta)).map(t => tareaPlana(t, zona)) : []
    const ok = (id: string) => ({ id, state: 'fresh' as const, checkedAt: stamp })
    return {
      sources: [{ ...FUENTE_LOCAL, title: 'Mi calendario', color: COLOR_LOCAL, timeZone: zona, editable: true, selected: true, objective: false }],
      events, tasks: pendientes, completedTasks: hechas,
      projects: [{ id: 'local', title: 'Mi plan', color: null }], sections: [],
      // `todoist` es la llave de «tareas» que usa la vista (mergeSnapshot, avisos): aquí son las tareas locales.
      health: [ok('local'), ok(FUENTE_LOCAL.id), ok('todoist'), ok('projects'), ok('sections'), ...(p.includeCompleted ? [ok('completed')] : [])],
      loadedAt: stamp, range: { from: desde, to: hasta },
    }
  }

  mutar(p: Record<string, unknown>) {
    return enFila(() => {
      const rid = texto(p.requestId, 'requestId', 36, true)
      if (!/^[0-9a-f-]{36}$/i.test(rid)) throw err('Identificador de operación inválido.')
      const huella = etiquetaDe(canonico(p))
      const original = leerTexto(this.rutaCalendario)
      const d = decodificarCalendario(original)
      if (!original) Object.assign(d, calendarioVacio(zonaDelSistema()))
      const recibos = d.recibos ??= {}
      const previo = recibos[rid]
      if (previo) { if (previo.huella !== huella) throw err('El reintento cambió el contenido de la operación.', 409); return previo.resultado as Record<string, unknown> }
      const zona = zonaValida(d.zona) ? d.zona : zonaDelSistema()
      const resultado = p.kind === 'event' ? this.mutarEvento(d, p, zona) : p.kind === 'task' ? this.mutarTarea(d, p, zona) : (() => { throw err('Tipo de elemento inválido.') })()
      recibos[rid] = { huella, resultado, en: new Date().toISOString() }
      // Solo los últimos 300 recibos: suficiente para cualquier reintento real.
      const claves = Object.keys(recibos); if (claves.length > 300) for (const k of claves.slice(0, claves.length - 300)) delete recibos[k]
      if (leerTexto(this.rutaCalendario) !== original) throw err('Tu calendario cambió mientras guardabas (¿Levy lo estaba editando?). Recarga; tu borrador se conserva.', 409)
      escribirAtomico(this.rutaCalendario, JSON.stringify(d, null, 2) + '\n')
      return resultado
    })
  }

  private mutarEvento(d: CalendarioLocal, p: Record<string, unknown>, zona: string) {
    if (p.calendarId !== undefined && p.calendarId !== FUENTE_LOCAL.calendarId) throw err('Este calendario no permite editar desde aquí.', 403)
    const accion = p.action, data = (p.data ?? {}) as Record<string, unknown>
    if (!['create', 'update', 'delete'].includes(String(accion)) || typeof data !== 'object') throw err('Acción de calendario inválida.')
    const ahora = new Date().toISOString()
    const campos = () => {
      const allDay = data.allDay === true
      const inicio = allDay ? data.start : instante(data.start, 'start'), fin = allDay ? data.end : instante(data.end, 'end')
      if (allDay && (!esDia(inicio) || !esDia(fin) || fin <= inicio)) throw err('Fechas de día completo inválidas.')
      if (!allDay && Date.parse(fin as string) <= Date.parse(inicio as string)) throw err('El final debe ser después del inicio.')
      const z = data.timeZone === undefined || data.timeZone === null ? undefined : data.timeZone
      if (z !== undefined && !zonaValida(z)) throw err('Zona horaria inválida.')
      return { titulo: texto(data.title, 'title', 1000, true), inicio: inicio as string, fin: fin as string, todoElDia: allDay,
        ...(data.description !== undefined ? { descripcion: texto(data.description, 'description', 20_000) } : {}),
        ...(data.location !== undefined ? { lugar: texto(data.location, 'location', 2_000) } : {}),
        ...(z && z !== zona ? { zona: z as string } : {}) }
    }
    if (accion === 'create') {
      const rec = data.recurrence
      if (rec !== undefined && (!Array.isArray(rec) || rec.length > 1 || rec.some(r => !reglaValida(r)))) throw err('Regla de repetición inválida.')
      const e: EventoLocal = { id: 'ev' + String(p.requestId).replaceAll('-', '').slice(0, 20), ...campos(), ...(Array.isArray(rec) && rec[0] ? { repetir: String(rec[0]) } : {}), actualizado: ahora }
      d.eventos.push(e)
      return { ok: true, event: ocurrencias(e, zona, '1970-01-01T00:00:00Z', '2200-01-01T00:00:00Z')[0] ?? eventoPlano(e, zona) }
    }
    const externalId = texto(p.externalId, 'externalId', 300, true)
    const ocurr = /^(.+)_(\d{8})$/.exec(externalId)
    const idx = d.eventos.findIndex(e => e.id === externalId)
    const serie = ocurr && idx < 0 ? d.eventos.find(e => e.id === ocurr[1] && e.repetir) : undefined
    if (!serie && idx < 0) { if (accion === 'delete') return { ok: true, deletedId: externalId }; throw err('Ese evento ya no existe. Recarga.', 404) }
    const actual = serie ?? d.eventos[idx]
    if (typeof p.etag === 'string' && p.etag !== etagEvento(actual)) throw err('El evento cambió en otra pantalla. Recarga antes de editar.', 412)
    if (serie && ocurr) {
      // Una ocurrencia de una serie: se aparta de la serie (omitir ese día) y, si se edita, queda como evento propio.
      const dia = `${ocurr[2].slice(0, 4)}-${ocurr[2].slice(4, 6)}-${ocurr[2].slice(6)}`
      serie.omitir = [...new Set([...(serie.omitir ?? []), dia])]; serie.actualizado = ahora
      if (accion === 'delete') return { ok: true, deletedId: externalId }
      const e: EventoLocal = { id: externalId, ...campos(), actualizado: ahora }
      d.eventos = d.eventos.filter(x => x.id !== externalId); d.eventos.push(e)
      return { ok: true, event: eventoPlano(e, zona) }
    }
    if (accion === 'delete') { d.eventos.splice(idx, 1); return { ok: true, deletedId: externalId } }
    const e: EventoLocal = { ...actual, ...campos(), actualizado: ahora }
    d.eventos[idx] = e
    return { ok: true, event: ocurrencias(e, zona, '1970-01-01T00:00:00Z', '2200-01-01T00:00:00Z')[0] ?? eventoPlano(e, zona) }
  }

  private mutarTarea(d: CalendarioLocal, p: Record<string, unknown>, zona: string) {
    const accion = String(p.action), data = (p.data ?? {}) as Record<string, unknown>, ahora = new Date().toISOString()
    const aplicar = (t: TareaLocal) => {
      if (data.title !== undefined) t.titulo = texto(data.title, 'title', 1000, true)
      if (data.description !== undefined) t.descripcion = texto(data.description, 'description', 20_000)
      if (data.priority !== undefined) { const n = Number(data.priority); if (![1, 2, 3, 4].includes(n)) throw err('Prioridad inválida.'); t.prioridad = n }
      if (data.due !== undefined) { if (data.due !== null && !esDia(data.due) && Number.isNaN(Date.parse(String(data.due)))) throw err('Fecha inválida.'); t.fecha = (data.due as string | null) }
      if (data.durationMinutes !== undefined) { const m = data.durationMinutes; if (m !== null && (typeof m !== 'number' || m < 1 || m > 1440)) throw err('Duración inválida.'); t.duracionMin = m as number | null }
      if (data.labels !== undefined) { if (!Array.isArray(data.labels) || data.labels.some(l => typeof l !== 'string')) throw err('Etiquetas inválidas.'); t.etiquetas = data.labels as string[] }
      t.actualizado = ahora
      return t
    }
    if (accion === 'create') {
      const t = aplicar({ id: 'ta' + String(p.requestId).replaceAll('-', '').slice(0, 20), titulo: '', prioridad: 4, hecha: false, creada: ahora })
      d.tareas.push(t)
      return { ok: true, task: tareaPlana(t, zona) }
    }
    const externalId = texto(p.externalId, 'externalId', 300, true)
    const t = d.tareas.find(x => x.id === externalId)
    if (!t) throw err('Esa tarea ya no existe. Recarga.', 404)
    if (typeof p.updatedAt === 'string' && t.actualizado && p.updatedAt !== t.actualizado && accion === 'update') throw err('La tarea cambió en otra pantalla. Recarga antes de editar.', 412)
    if (accion === 'complete') { t.hecha = true; t.hechaEn = ahora; t.actualizado = ahora; return { ok: true, completedId: externalId, recurring: false } }
    if (accion === 'reopen') { t.hecha = false; t.hechaEn = null; t.actualizado = ahora; return { ok: true, task: tareaPlana(t, zona) } }
    if (accion === 'delete') { d.tareas = d.tareas.filter(x => x !== t); return { ok: true, deletedId: externalId } }
    if (accion === 'move') { t.actualizado = ahora; return { ok: true, task: tareaPlana(t, zona) } }
    if (accion === 'update') return { ok: true, task: tareaPlana(aplicar(t), zona) }
    throw err('Acción inválida.')
  }

  // ── Objetivos (mismo formato que objectives_store.py) ──

  leerObjetivos() {
    const contenido = leerTexto(this.rutaObjetivos) ?? ''
    return vistaObjetivos(contenido)
  }

  escribirObjetivo(p: Record<string, unknown>) {
    return enFila(() => {
      const rid = p.requestId
      if (typeof rid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rid)) throw err('Solicitud sin identidad válida.')
      const huella = createHash('sha256').update(canonico(p)).digest('hex')
      const contenido = leerTexto(this.rutaObjetivos) ?? ''
      const data = decodificarObjetivos(contenido), recibos = data.receipts
      if (recibos[rid]) { if (recibos[rid] !== huella) throw err('No reutilices una solicitud con otro contenido.', 409); return vistaObjetivos(contenido) }
      if (p.revision !== sha(contenido)) throw err('El plan cambió en otra conversación. Recarga; tu borrador se conserva.', 409)
      const goal = validarObjetivo(p.goal, data.goals)
      data.goals = [...data.goals.filter(g => g.id !== goal.id), goal]
      recibos[rid] = huella
      const registro = '<!-- arbrain-objectives-v1\n' + JSON.stringify(data, null, 2).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e') + '\n-->'
      const salida = MARCA.test(contenido) ? contenido.replace(MARCA, () => registro) : (contenido.trimEnd() ? contenido.trimEnd() + '\n\n' : '# Objetivos\n\n') + registro + '\n'
      if ((leerTexto(this.rutaObjetivos) ?? '') !== contenido) throw err('El documento cambió mientras guardabas. Recarga.', 409)
      escribirAtomico(this.rutaObjetivos, salida)
      return vistaObjetivos(salida)
    })
  }

  async handle(p: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (p.action === 'objectives-read') return this.leerObjetivos()
    if (p.action === 'objectives-write') return this.escribirObjetivo(p)
    if (p.action === 'snapshot') return this.snapshot(p)
    return this.mutar(p)
  }
}

// ── Objetivos: puerto fiel de objectives_store.py ────────────────────────────────────────────────────────────────────

const MARCA = /<!-- arbrain-objectives-v1\s*\n([\s\S]*?)\n-->/
const MARCA_G = /<!-- arbrain-objectives-v1\s*\n([\s\S]*?)\n-->/g
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
type Objetivo = { id: string; scope: 'day' | 'week' | 'month'; start: string; end: string; parentId: string | null; [k: string]: unknown }

export function periodo(scope: unknown, ancla: unknown): [string, string] {
  if (!esDia(ancla)) throw err('Fecha inválida.')
  if (scope === 'day') return [ancla, sumarDia(ancla, 1)]
  if (scope === 'week') { const dow = (new Date(`${ancla}T12:00:00Z`).getUTCDay() + 6) % 7, a = sumarDia(ancla, -dow); return [a, sumarDia(a, 7)] }
  if (scope === 'month') { const a = ancla.slice(0, 8) + '01', n = new Date(`${a}T12:00:00Z`); n.setUTCMonth(n.getUTCMonth() + 1); return [a, n.toISOString().slice(0, 10)] }
  throw err('Período inválido.')
}

function decodificarObjetivos(contenido: string): { version: 1; goals: Objetivo[]; receipts: Record<string, string> } {
  const todas = [...contenido.matchAll(MARCA_G)]
  if (todas.length > 1) throw err('Hay dos registros de objetivos. Revisa el documento antes de editar.', 409)
  if (!todas.length) return { version: 1, goals: [], receipts: {} }
  try {
    const data = JSON.parse(todas[0][1])
    if (data.version !== 1 || !Array.isArray(data.goals) || (data.receipts !== undefined && (typeof data.receipts !== 'object' || Array.isArray(data.receipts)))) throw new Error()
    const ids = data.goals.map((g: Objetivo) => g.id)
    if (ids.some((x: unknown) => typeof x !== 'string') || new Set(ids).size !== ids.length) throw new Error()
    return { version: 1, goals: data.goals, receipts: data.receipts ?? {} }
  } catch { throw err('El registro de objetivos no se puede leer. No se sobrescribió.', 409) }
}

export function contextoHeredado(contenido: string) {
  const limpio = contenido.replace(MARCA_G, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<details\b[\s\S]*?<\/details>/gi, '')
  const out: { scope: string; start: string; text: string }[] = []
  let mes: string | null = null, semana: string | null = null, dia: string | null = null
  for (const linea of limpio.split(/\r?\n/)) {
    if (linea.startsWith('## ')) {
      mes = semana = dia = null
      const m = /^##\s+(\S+)\s+(\d{4})$/.exec(linea.trim())
      if (m && MESES.includes(m[1].toLowerCase())) mes = `${m[2]}-${String(MESES.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-01`
    } else if (linea.startsWith('### ')) {
      semana = dia = null
      const m = /^###\s+Semana\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/.exec(linea)
      if (mes && m) try { semana = periodo('week', mes.slice(0, 8) + m[1].padStart(2, '0'))[0] } catch { /* día inexistente */ }
    } else if (linea.startsWith('#### ')) {
      dia = null
      const m = /^####\s+\S+\s+(\d{1,2})\b/.exec(linea)
      if (mes && m) { const c = mes.slice(0, 8) + m[1].padStart(2, '0'); if (esDia(c) && new Date(`${c}T12:00:00Z`).toISOString().slice(0, 10) === c) dia = c }
    }
    if (mes && linea.startsWith('**Mes:**')) out.push({ scope: 'month', start: mes, text: linea.split('**Mes:**')[1].trim() })
    else if (semana && linea.startsWith('**Foco:**')) out.push({ scope: 'week', start: semana, text: linea.split('**Foco:**')[1].trim() })
    else if (dia && /^- \[[ xX]\]/.test(linea)) out.push({ scope: 'day', start: dia, text: linea.replace(/^- \[[ xX]\]\s*/, '') })
  }
  return out
}

export function vistaObjetivos(contenido: string) {
  const data = decodificarObjetivos(contenido)
  return { goals: data.goals, revision: sha(contenido), context: contextoHeredado(contenido), source: 'objetivos.md', loadedAt: new Date().toISOString() }
}

function validarObjetivo(raw: unknown, goals: Objetivo[]): Objetivo {
  if (!raw || typeof raw !== 'object') throw err('Objetivo inválido.')
  const r = raw as Record<string, unknown>
  const campo = (k: string, max: number, req = false) => { const v = r[k] ?? ''; if (typeof v !== 'string' || v.length > max || (req && !v.trim())) throw err('Campo inválido: ' + k); return v.trim() }
  const id = campo('id', 80, true)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw err('Identidad de objetivo inválida.')
  const scope = r.scope as Objetivo['scope'], [a, b] = periodo(scope, r.start)
  if (a !== r.start || b !== r.end) throw err('El objetivo debe abarcar su día, semana o mes completo.')
  const status = r.status
  if (!['draft', 'agreed', 'completed'].includes(String(status))) throw err('Estado inválido.')
  const title = campo('title', 500, true), success = campo('success', 4000)
  if (status !== 'draft' && !success) throw err('Define cómo comprobarás el resultado antes de acordarlo.')
  const parent = (r.parentId as string) || null
  if (parent) {
    const pa = goals.find(g => g.id === parent), esperado = ({ day: 'week', week: 'month' } as Record<string, string>)[scope]
    if (!pa || pa.scope !== esperado || !(pa.start < b && a < pa.end)) throw err('El objetivo superior debe ser del período correspondiente.')
  }
  if (scope === 'month' && parent) throw err('Un mes no tiene objetivo superior.')
  const res: Objetivo = { id, scope, start: a, end: b, title, success, notes: campo('notes', 8000), status, parentId: parent, updatedAt: new Date().toISOString() }
  // Vínculos: en cliente las tareas y eventos son locales (`local:`); se aceptan también los de Google/Todoist para la fase 2.
  for (const [k, prefijos] of [['taskIds', ['local:', 'todoist:']], ['eventIds', ['local:', 'google:']]] as const) {
    const ids = r[k] ?? []
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(i => typeof i !== 'string' || !prefijos.some(p => i.startsWith(p)) || i.length > 1000)) throw err('Vínculos inválidos.')
    res[k] = [...new Set(ids as string[])]
  }
  const viejo = goals.find(g => g.id === id)
  if (viejo && (['scope', 'start', 'end'] as const).some(k => viejo[k] !== res[k])) throw err('Conserva el período del objetivo; crea otro para el nuevo período.', 409)
  res.completionNote = campo('completionNote', 4000)
  if (status === 'completed' && !res.completionNote) throw err('Escribe qué evidencia confirma el cumplimiento.')
  return res
}
