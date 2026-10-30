/**
 * Rutinas del alumno por HTTP (29 oct 2026, inventario de la cohorte T8: «todavía no tengo rutinas andando… no entendí bien
 * cómo aplicarlo»; «los Cron Jobs… ¿eso iba a estar en la interfaz?»). La pestaña Rutinas del Taller (edición cliente) las
 * lee, crea, pausa, reanuda y borra aquí; Levy, con su pase, puede proponer una (nace en pausa y el dueño la activa).
 *
 *   GET    /schedule                 lista + zona + aviso (por qué no correrían ahora mismo, si aplica)
 *   POST   /schedule                 {prompt, schedule} crea. Con el Bearer de la app nace activa; con el pase de
 *                                    agente nace EN PAUSA (`levy-…`): una rutina que corre sola sin que el dueño la vea
 *                                    sería persistencia para una instrucción inyectada.
 *   POST   /schedule/:id/pause       pausa
 *   POST   /schedule/:id/resume      reanuda (solo mueve `next_run`; no toca la última corrida)
 *   DELETE /schedule/:id             borra
 * `POST /schedule/:id/run` sigue en server.ts (corre por `executeCronJob`, el mismo camino que las programadas).
 * Con el pase solo pasan GET y POST /schedule (cofre.ts › RUTAS_DEL_PASE); lo demás es de la app.
 *
 * La lógica de crear es la de `schedule-cli.ts` (horario validado con `computeNextRun`, id con slug del prompt), más
 * lo que hace falta cuando la pide una pantalla o un agente: largo del texto, horario de 5 campos, una frecuencia mínima
 * (cada 15 min) y un tope de rutinas. Solo edición cliente: la instalación original sigue con sus rutas de siempre.
 */
import { createRequire } from 'node:module'
import { createTask, deleteTask, getDb, getTask, listTasks, updateTaskStatus, type ScheduledTask } from '../db.js'
import { computeNextRun, CRON_TZ } from '../scheduler.js'
import { ALLOWED_CHAT_ID } from '../config.js'
import { faltaLlaveClaude, MENSAJE_FALTA_LLAVE } from './llaves.js'
import { motorSuscripcion, MENSAJE_RUTINAS } from './suscripcion.js'
import { rutinasConLlaveTope } from './rutinas-llave.js'
import { MENSAJE_PAUSA, pausado } from './pausa.js'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { parseExpression } = _require('cron-parser') as any

export const PROMPT_MIN = 3
export const PROMPT_MAX = 2000
export const MAX_RUTINAS = 30
/** Nada corre más seguido que esto: cada corrida es un turno del modelo que se paga. */
export const INTERVALO_MINIMO_S = 15 * 60

/** El slug de `schedule-cli.ts` (primeras 4 palabras, solo a-z0-9). Aquí antes se quitan los acentos: «resúmeme» → «resumeme». */
export function slugRutina(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
}

export function idRutina(prompt: string, origen: 'app' | 'levy', ahora = Date.now()): string {
  const slug = slugRutina(prompt.normalize('NFD').replace(/[̀-ͯ]/g, '')) || 'rutina'
  return `${origen === 'levy' ? 'levy' : 'rutina'}-${slug}-${ahora.toString(36)}`
}

/** Horario de 5 campos, solo con lo que entiende cron. Devuelve la próxima corrida o el error en palabras del dueño. */
export function validarHorario(schedule: unknown): { ok: true; schedule: string; nextRun: number } | { ok: false; error: string } {
  if (typeof schedule !== 'string') return { ok: false, error: 'Falta cuándo debe correr.' }
  const s = schedule.trim().replace(/\s+/g, ' ')
  if (!s || s.split(' ').length !== 5 || !/^[0-9*/,\- ]+$/.test(s)) return { ok: false, error: 'El horario no es válido: usa cinco campos de cron (minuto hora día mes día-de-la-semana).' }
  let nextRun: number
  try { nextRun = computeNextRun(s) } catch { return { ok: false, error: 'El horario no es válido: revisa los números (minuto 0-59, hora 0-23).' } }
  // Frecuencia: la distancia más corta entre las próximas corridas.
  try {
    const it = parseExpression(s, { tz: CRON_TZ })
    let previa = it.next().getTime()
    for (let i = 0; i < 8; i++) {
      const sig = it.next().getTime()
      if ((sig - previa) / 1000 < INTERVALO_MINIMO_S) return { ok: false, error: 'Eso correría demasiado seguido. Lo más frecuente es cada 15 minutos.' }
      previa = sig
    }
  } catch { /* sin siguientes: corre pocas veces, vale */ }
  return { ok: true, schedule: s, nextRun }
}

export function validarPrompt(prompt: unknown): { ok: true; prompt: string } | { ok: false; error: string } {
  if (typeof prompt !== 'string') return { ok: false, error: 'Falta qué quieres que haga.' }
  const p = prompt.trim()
  if (p.length < PROMPT_MIN) return { ok: false, error: 'Escribe qué quieres que haga (al menos unas palabras).' }
  if (p.length > PROMPT_MAX) return { ok: false, error: `Es demasiado largo: máximo ${PROMPT_MAX} caracteres.` }
  return { ok: true, prompt: p }
}

/** Por qué las rutinas no correrían ahora mismo, en una frase; null si nada lo impide. */
export function avisoRutinas(): string | null {
  if (faltaLlaveClaude()) return MENSAJE_FALTA_LLAVE
  if (motorSuscripcion() && !rutinasConLlaveTope()) return MENSAJE_RUTINAS
  if (pausado()) return MENSAJE_PAUSA
  return null
}

const visibles = (): ScheduledTask[] => listTasks().filter(t => !t.id.endsWith('-migrated'))
const ID = /^[A-Za-z0-9_-]{1,160}$/

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }

/**
 * Atiende las rutas de rutinas de la edición cliente; null si la ruta no es suya (sigue el router de server.ts).
 * `conPase`: la llamada llegó con el pase de agente y no con el Bearer de la app.
 */
export function atenderRutinas(metodo: string | undefined, ruta: string, cuerpo: Record<string, unknown>, opciones: { conPase: boolean; aviso?: () => string | null }): Respuesta | null {
  const aviso = opciones.aviso ?? avisoRutinas
  if (ruta === '/schedule') {
    if (metodo === 'GET') return { status: 200, cuerpo: { tasks: visibles(), tz: CRON_TZ, aviso: aviso() } }
    if (metodo !== 'POST') return null
    const p = validarPrompt(cuerpo.prompt)
    if (!p.ok) return { status: 400, cuerpo: { error: p.error } }
    const h = validarHorario(cuerpo.schedule)
    if (!h.ok) return { status: 400, cuerpo: { error: h.error } }
    if (visibles().length >= MAX_RUTINAS) return { status: 409, cuerpo: { error: `Ya tienes ${MAX_RUTINAS} rutinas. Borra alguna antes de crear otra.` } }
    const origen = opciones.conPase ? 'levy' : 'app'
    const id = idRutina(p.prompt, origen)
    const status = origen === 'levy' ? 'paused' : 'active'
    createTask({ id, chat_id: ALLOWED_CHAT_ID || 'local', thread_id: null, prompt: p.prompt, schedule: h.schedule, next_run: h.nextRun, status, created_at: Math.floor(Date.now() / 1000) })
    return {
      status: 201,
      cuerpo: {
        ok: true, tarea: getTask(id), aviso: aviso(),
        mensaje: origen === 'levy'
          ? 'Rutina creada en pausa. El dueño la activa en el Taller › Rutinas (botón «Activar»); hasta entonces no corre.'
          : 'Rutina creada y activa.',
      },
    }
  }
  const m = ruta.match(/^\/schedule\/([^/]+)(?:\/(pause|resume))?$/)
  if (!m || !ID.test(m[1])) return null
  const [, id, accion] = m
  if (!accion && metodo !== 'DELETE') return null
  if (accion && metodo !== 'POST') return null
  const tarea = getTask(id)
  if (!tarea) return { status: 404, cuerpo: { error: 'Esa rutina ya no existe.' } }
  if (!accion) { deleteTask(id); return { status: 200, cuerpo: { ok: true } } }
  if (accion === 'pause') { updateTaskStatus(id, 'paused'); return { status: 200, cuerpo: { ok: true } } }
  let nextRun: number
  try { nextRun = computeNextRun(tarea.schedule) } catch { return { status: 400, cuerpo: { error: 'Su horario ya no es válido: bórrala y créala de nuevo.' } } }
  getDb().prepare('UPDATE scheduled_tasks SET status = ?, next_run = ? WHERE id = ?').run('active', nextRun, id)
  return { status: 200, cuerpo: { ok: true, nextRun } }
}
