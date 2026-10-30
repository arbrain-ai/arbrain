/**
 * Datos de la vista viva «diario» (5 oct 2026, Daniel leyendo su reporte de las 09:00: «es el tipo de cosas que
 * podemos automatizar para que me muestres mejores animaciones… para las tareas o para el día»).
 *
 * El reporte de la mañana ya no llega como markdown: llega como una vista de la Cabina que, AL ABRIRSE, lee
 * el reporte de cada persona de la instalación (dueno.ts › PERSONAS) con el mismo script del cron en modo `--json`
 * (una sola lógica, las mismas reglas: «sin medir» es null, nunca cero). Agenda y tareas no pasan por aquí:
 * Arbrain las lee en vivo por /api/planning.
 *
 * Polar tarda ~15 s: cada lectura se guarda `VIDA_MS` y dos aperturas a la vez comparten la misma corrida.
 */
import { PERSONAS, PERSONA_DUENO } from '../dueno.js'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { PROJECT_ROOT } from '../config.js'

/** De quién es el reporte: una de las personas de la instalación original (dueno.ts › PERSONAS). */
export type Quien = string
export const VIDA_MS = 5 * 60_000
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export interface Pedido { quien: Quien; fecha?: string }

/** Valida lo que llega del cliente. null = pedido inválido. */
export function pedidoDe(raw: Record<string, unknown>): Pedido | null {
  const quien = raw.quien == null ? PERSONA_DUENO : typeof raw.quien === 'string' && PERSONAS.includes(raw.quien) ? raw.quien : null
  if (!quien) return null
  if (raw.fecha != null && (typeof raw.fecha !== 'string' || !FECHA.test(raw.fecha))) return null
  return { quien, fecha: raw.fecha as string | undefined }
}

type Correr = (p: Pedido) => Promise<unknown>

/** Caché con vida y corridas compartidas. `ahora` y `correr` se inyectan para probarlo sin red. */
export function crearLector(correr: Correr, ahora: () => number = Date.now) {
  const guardado = new Map<string, { en: number; datos: unknown }>()
  const enCurso = new Map<string, Promise<unknown>>()
  return async function leer(p: Pedido, fresco = false): Promise<unknown> {
    const clave = `${p.quien}|${p.fecha ?? 'hoy'}`
    const g = guardado.get(clave)
    if (!fresco && g && ahora() - g.en < VIDA_MS) return g.datos
    const ya = enCurso.get(clave)
    if (ya) return ya
    const trabajo = correr(p).then(datos => { guardado.set(clave, { en: ahora(), datos }); return datos }).finally(() => enCurso.delete(clave))
    enCurso.set(clave, trabajo)
    return trabajo
  }
}

function correrScript(p: Pedido): Promise<unknown> {
  const args = [join(PROJECT_ROOT, 'arbrain/server/scripts/analytics/reportes_matutinos.py'), p.quien, '--json', ...(p.fecha ? ['--fecha', p.fecha] : [])]
  return new Promise((resolve, reject) => {
    execFile(process.env.PLANNING_PYTHON ?? 'python3', args, { timeout: 120_000, maxBuffer: 4_000_000, cwd: PROJECT_ROOT }, (error, stdout) => {
      try { resolve(JSON.parse(stdout)) } catch { reject(new Error(error ? `El reporte no se pudo leer: ${error.message.slice(0, 160)}` : 'El reporte respondió algo ilegible.')) }
    })
  })
}

export const leerDiario = crearLector(correrScript)
