/**
 * Hábitos locales de la edición cliente (21 oct 2026; tarea de la cohorte para el viernes: «bajar a tierra su primer hábito»).
 *
 * En la instalación original, `/api/sistema` lee y escribe las tablas `sistema_habitos`, `sistema_checks` y
 * `sistema_reflexion` de Supabase (con la RPC `sistema_write_check_v1`). Aquí vive la misma pluma sobre un archivo del
 * cerebro del alumno, `<ARBRAIN_HOME>/.claude/plan/habitos.json`, con la MISMA forma de respuesta: la fila «Hábitos» y la
 * estrella del objetivo del día (Calendario › Día, `HabitosDia` + `useHabitRecords`) no saben de dónde vienen los datos.
 *
 * Reglas copiadas de la RPC: hábito desconocido → 404; mismo `requestId` con el mismo contenido → se repite el recibo; con
 * otro contenido → 409; revisión esperada distinta → 409 (el hábito cambió en otra pantalla); lo importado con evidencia
 * nunca pisa una marca explícita. Escritura atómica (tmp + rename), en fila, y verificación de que el archivo no cambió a
 * mano mientras se guardaba (Levy también lo edita).
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { civilToday, habitRange, isCivilDate, HABIT_TIMEZONE } from '@/features/sistema/calendar-days'

export const RUTA_HABITOS = '.claude/plan/habitos.json'
const SECCIONES = ['ancla', 'cuerpo', 'mente', 'nutricion'] as const
const FUENTES = ['manual', 'keyboard', 'conversation', 'diary', 'sfcal-import'] as const
const REFLEXION = ['prioridad_am', 'respuesta_am', 'respuesta_pm'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const INSTRUCTIVO = [
  'Tus hábitos en Arbrain. Los pinta Calendario › Día (fila «Hábitos», con racha y el tejido de 4 semanas).',
  'Levy los crea cuando le dices «agrega el hábito X» (o los editas aquí). «objetivo_dia» es la estrella del objetivo del día: no le cambies la clave.',
  'habitos[]: { clave (minúsculas y guiones bajos, única y para siempre), nombre, seccion (ancla | cuerpo | mente | nutricion), icono (opcional), orden (número), activo (true/false), creado }.',
  'Para dejar de ver un hábito ponle activo:false: su historial se conserva. No borres claves con historial.',
  'registro: { "AAAA-MM-DD": { "<clave>": { hecho (true cumplido | false no cumplido | null sin registro), revision, actualizado, fuente, evidencia, requestId } } }. Lo escribe la app al tocar; Levy puede marcar con fuente "conversation".',
  'reflexion: { "AAAA-MM-DD": { prioridad_am, respuesta_am, respuesta_pm } }.',
]

export interface HabitoLocal { clave: string; nombre: string; seccion?: string; icono?: string | null; orden?: number; activo?: boolean; creado?: string }
export interface MarcaLocal { hecho: boolean | null; revision: number; actualizado: string; fuente: string; evidencia: string | null; requestId: string }
export interface HabitosArchivo {
  _como_se_usa?: string[]; version: 1; habitos: HabitoLocal[]
  registro: Record<string, Record<string, MarcaLocal>>; reflexion?: Record<string, Partial<Record<typeof REFLEXION[number], string>>>
}

/** La semilla: solo «Objetivo del día», activo. El resto lo crea el alumno. */
export const habitosSemilla = (ahora = new Date().toISOString()): HabitosArchivo => ({
  _como_se_usa: INSTRUCTIVO, version: 1,
  habitos: [{ clave: 'objetivo_dia', nombre: 'Objetivo del día', seccion: 'ancla', icono: null, orden: 0, activo: true, creado: ahora }],
  registro: {}, reflexion: {},
})

const err = (m: string, s = 400) => new ChatAccessError(m, s)

function leerTexto(ruta: string): string | null {
  try { return readFileSync(ruta, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw err('No se pudieron leer tus hábitos. No significa que no tengas.', 503) }
}
function escribirAtomico(ruta: string, contenido: string) {
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = `${ruta}.${randomUUID()}.tmp`
  try { writeFileSync(tmp, contenido, { encoding: 'utf8', mode: 0o600 }); renameSync(tmp, ruta) }
  finally { if (existsSync(tmp)) try { unlinkSync(tmp) } catch { /* noop */ } }
}
export function decodificarHabitos(texto: string | null): HabitosArchivo {
  if (texto === null || !texto.trim()) return habitosSemilla()
  let d: HabitosArchivo
  try { d = JSON.parse(texto) } catch { throw err('habitos.json no es JSON válido. Corrígelo (o pídeselo a Levy); no se sobrescribió.', 409) }
  if (!d || typeof d !== 'object' || !Array.isArray(d.habitos)) throw err('habitos.json no tiene «habitos». No se sobrescribió.', 409)
  if (!d.registro || typeof d.registro !== 'object') d.registro = {}
  return d
}

let fila: Promise<unknown> = Promise.resolve()
function enFila<T>(f: () => T): Promise<T> { const p = fila.then(f); fila = p.catch(() => undefined); return p }

const definicion = (h: HabitoLocal, i: number) => ({
  id: `local:${h.clave}`, clave: h.clave, nombre: h.nombre || h.clave,
  seccion: (SECCIONES as readonly string[]).includes(String(h.seccion)) ? h.seccion! : 'ancla',
  icono: h.icono ?? null, orden: typeof h.orden === 'number' ? h.orden : i, activo: h.activo !== false, created_at: h.creado ?? '1970-01-01T00:00:00.000Z',
})
const fila_ = (fecha: string, clave: string, m: MarcaLocal) => ({
  fecha, habito_clave: clave, hecho: m.hecho, revision: m.revision, updated_at: m.actualizado, source: m.fuente, evidence: m.evidencia, request_id: m.requestId,
})

export class HabitosLocales {
  constructor(readonly raiz: string, readonly owner: string) {}
  get ruta() { return join(this.raiz, RUTA_HABITOS) }

  leer(params: URLSearchParams) {
    let rango: ReturnType<typeof habitRange>
    try { rango = habitRange(params) } catch { throw err('Fecha, zona horaria o rango inválido.', 400) }
    const d = decodificarHabitos(leerTexto(this.ruta))
    const catalog = d.habitos.filter(h => h && typeof h.clave === 'string').map(definicion).sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave))
    const records = Object.entries(d.registro).filter(([f]) => isCivilDate(f) && f >= rango.from && f <= rango.to).sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([f, porClave]) => Object.entries(porClave ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([c, m]) => fila_(f, c, m)))
    const checks = Object.entries(d.registro[rango.date] ?? {}).map(([c, m]) => fila_(rango.date, c, m))
    const porDia = new Map<string, number>()
    for (const r of records) if (r.hecho === true) porDia.set(r.fecha, (porDia.get(r.fecha) ?? 0) + 1)
    const r = d.reflexion?.[rango.date] ?? {}
    return {
      owner: this.owner, ...rango, habitos: catalog.filter(h => h.activo), catalog, checks, records,
      done: checks.filter(c => c.hecho === true).map(c => c.habito_clave),
      reflexion: { prioridad_am: r.prioridad_am ?? '', respuesta_am: r.respuesta_am ?? '', respuesta_pm: r.respuesta_pm ?? '' },
      history: Array.from(porDia, ([fecha, done]) => ({ fecha, done })),
    }
  }

  escribir(body: Record<string, unknown>): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
    return enFila(() => {
      let today: string
      try { today = civilToday(typeof body.timeZone === 'string' ? body.timeZone : HABIT_TIMEZONE) } catch { throw err('Zona horaria inválida.', 400) }
      const fecha = body.date ?? today
      if (!isCivilDate(fecha)) throw err('Fecha inválida.', 400)
      const original = leerTexto(this.ruta)
      const d = decodificarHabitos(original)
      const ahora = new Date().toISOString()
      if (body.tipo === 'reflexion') {
        const campo = body.campo as typeof REFLEXION[number]
        if (!REFLEXION.includes(campo) || typeof body.valor !== 'string' || body.valor.length > 8000) throw err('Campo o reflexión inválidos.', 400)
        d.reflexion ??= {}
        d.reflexion[fecha] = { ...(d.reflexion[fecha] ?? {}), [campo]: body.valor }
        this.guardar(original, d)
        return { status: 200, cuerpo: { ok: true } }
      }
      if (typeof body.clave !== 'string' || !body.clave || body.clave.length > 100 || (body.hecho !== true && body.hecho !== false && body.hecho !== null)) {
        throw err('Hábito/estado inválido: usa true, false o null.', 400)
      }
      const fuente = String(body.source ?? 'manual')
      if (!(FUENTES as readonly string[]).includes(fuente)) throw err('Procedencia inválida.', 400)
      const evidencia = body.evidence ?? null
      if (evidencia !== null && (typeof evidencia !== 'string' || evidencia.length > 2000)) throw err('Evidencia inválida.', 400)
      if (['diary', 'sfcal-import'].includes(fuente) && !(typeof evidencia === 'string' && evidencia.trim())) throw err('Falta la evidencia de origen.', 400)
      if (body.owner !== undefined && body.owner !== this.owner) throw err('El registro pertenece a otra identidad.', 409)
      const requestId = body.requestId ?? randomUUID()
      if (typeof requestId !== 'string' || !UUID.test(requestId)) throw err('Identificador inválido.', 400)
      const actual = d.registro[fecha]?.[body.clave]
      let esperada = body.expectedRevision
      if (esperada === undefined && body.requestId === undefined && fuente === 'manual') esperada = actual?.revision ?? 0
      if (!Number.isSafeInteger(esperada) || Number(esperada) < 0) throw err('Falta una revisión válida del registro.', 400)
      if (!d.habitos.some(h => h.clave === body.clave)) return { status: 404, cuerpo: { error: 'unknown_habit', status: 404 } }
      if (actual && actual.requestId === requestId) {
        if (actual.hecho !== body.hecho || actual.fuente !== fuente || actual.evidencia !== evidencia) return { status: 409, cuerpo: { error: 'request_reused', status: 409 } }
        return { status: 200, cuerpo: { ok: true, replayed: true, record: fila_(fecha, body.clave, actual) } }
      }
      if ((actual?.revision ?? 0) !== esperada) return { status: 409, cuerpo: { error: 'conflict', status: 409, ...(actual ? { record: fila_(fecha, body.clave, actual) } : {}) } }
      if (['diary', 'sfcal-import'].includes(fuente) && actual && ['manual', 'keyboard', 'conversation'].includes(actual.fuente)) {
        return { status: 409, cuerpo: { error: 'explicit_correction', status: 409, record: fila_(fecha, body.clave, actual) } }
      }
      const nueva: MarcaLocal = { hecho: body.hecho as boolean | null, revision: (actual?.revision ?? 0) + 1, actualizado: ahora, fuente, evidencia: evidencia as string | null, requestId }
      d.registro[fecha] = { ...(d.registro[fecha] ?? {}), [body.clave]: nueva }
      this.guardar(original, d)
      return { status: 200, cuerpo: { ok: true, record: fila_(fecha, body.clave, nueva) } }
    })
  }

  private guardar(original: string | null, d: HabitosArchivo) {
    if (leerTexto(this.ruta) !== original) throw err('Tus hábitos cambiaron mientras guardabas (¿Levy los estaba editando?). Recarga y vuelve a marcar.', 409)
    if (original === null) d._como_se_usa ??= INSTRUCTIVO
    escribirAtomico(this.ruta, JSON.stringify(d, null, 2) + '\n')
  }
}
