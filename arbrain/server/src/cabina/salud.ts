/**
 * Datos de la vista viva «salud» para Daniel (5 oct 2026, «una UI para las automatizaciones de mi salud que ya llegan
 * desde el reloj»).
 *
 * Daniel tiene su ruta propia desde el 24 jul: Health Auto Export → receptor del Studio (Tailscale) → `daily-log.csv`.
 * Esta lectura NO la toca: lee el CSV tal cual, saca la hora de dormir y despertar de los JSON recientes que el receptor
 * guarda en `incoming/` (el CSV no las tiene) y el pacto con el mismo script del briefing (`--json`). Los demás usuarios
 * van por la base (`/api/salud/ingest`); la propuesta para pasar a Daniel a esa ruta está en
 * docs/builds/vista-salud-2026-10-05.md.
 *
 * «Sin medir» es null, nunca cero: una celda vacía es null y `en_cama_h` (HAE siempre lo manda en 0) no viaja.
 */
import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { PROJECT_ROOT } from '../config.js'

export const COLUMNAS = ['sueno_horas', 'sueno_deep_h', 'sueno_rem_h', 'sueno_core_h', 'sueno_awake_h', 'hrv_ms', 'resting_hr', 'pasos', 'vo2max', 'resp_rate', 'temp_muneca'] as const
export type Columna = typeof COLUMNAS[number]
export type Dia = { fecha: string } & Partial<Record<Columna, number | null>>
export interface Noche { fecha: string; inicio: string; fin: string }
export interface DatosSaludStudio { fuente: 'studio'; dias: Dia[]; noches: Noche[]; ultimoEnvio: string | null; pacto: unknown[] | null; leidoEn: string; errores: string[] }

const CARPETA = () => process.env.SALUD_DIR || join(PROJECT_ROOT, 'casa', 'personal', 'salud', 'data')
const VIDA_MS = 60_000
/** Cuántos días lee: 30 de tendencia + 60 de línea base. */
export const DIAS_LECTURA = 100
/** Cuántos envíos recientes se abren para las horas de la noche (cada uno trae 1–2 noches). */
const ENVIOS_NOCHE = 24

const num = (v: string | undefined) => { const t = (v ?? '').trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }

/** El CSV del ingest → días desde `desde` (incluido). Columnas desconocidas se ignoran. */
export function diasDeCsv(texto: string, desde: string): Dia[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  if (!lineas.length) return []
  const cab = lineas[0].split(',').map(c => c.trim())
  const i = (c: string) => cab.indexOf(c)
  const iFecha = i('fecha')
  if (iFecha < 0) return []
  const dias: Dia[] = []
  for (const linea of lineas.slice(1)) {
    // Las notas pueden traer comas entre comillas; las columnas numéricas no. Basta con no romperse.
    const celdas = linea.split(',')
    const fecha = (celdas[iFecha] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < desde) continue
    const dia: Dia = { fecha }
    let alguno = false
    for (const c of COLUMNAS) { const k = i(c); const v = k < 0 ? null : num(celdas[k]); dia[c] = v; if (v != null) alguno = true }
    if (alguno) dias.push(dia)
  }
  return dias.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Las noches de un envío de HAE: `sleep_analysis` trae sleepStart/sleepEnd por noche. */
export function nochesDeEnvio(doc: unknown): Noche[] {
  const raiz = (doc as { data?: unknown })?.data ?? doc
  const metricas = (raiz as { metrics?: unknown })?.metrics
  if (!Array.isArray(metricas)) return []
  const out: Noche[] = []
  for (const m of metricas) {
    if ((m as { name?: string })?.name !== 'sleep_analysis') continue
    for (const p of ((m as { data?: unknown[] }).data ?? []) as Record<string, unknown>[]) {
      const fecha = String(p.date ?? '').slice(0, 10), inicio = String(p.sleepStart ?? p.inBedStart ?? ''), fin = String(p.sleepEnd ?? p.inBedEnd ?? '')
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && inicio.length >= 16 && fin.length >= 16) out.push({ fecha, inicio, fin })
    }
  }
  return out
}

function pactoJson(): Promise<unknown[] | null> {
  const script = join(PROJECT_ROOT, 'arbrain', 'server', 'scripts', 'analytics', 'variables_vitales_cuerpo.py')
  return new Promise(resolve => {
    execFile(process.env.PLANNING_PYTHON ?? 'python3', [script, '--json'], { timeout: 20_000, cwd: PROJECT_ROOT, env: { ...process.env, SALUD_CSV: join(CARPETA(), 'daily-log.csv') } }, (err, stdout) => {
      if (err) { resolve(null); return }
      try { const j = JSON.parse(stdout) as { pacto?: unknown[] }; resolve(Array.isArray(j.pacto) ? j.pacto : null) } catch { resolve(null) }
    })
  })
}

const hoyCivil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const restar = (dia: string, n: number) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

export async function leerSalud(): Promise<DatosSaludStudio> {
  const carpeta = CARPETA(), errores: string[] = []
  const desde = restar(hoyCivil(), DIAS_LECTURA)
  let dias: Dia[] = []
  try { dias = diasDeCsv(await readFile(join(carpeta, 'daily-log.csv'), 'utf8'), desde) } catch { errores.push('No se pudo leer daily-log.csv en el Studio.') }

  const noches = new Map<string, Noche>()
  let ultimoEnvio: string | null = null
  try {
    const dir = join(carpeta, 'incoming')
    const envios = (await readdir(dir)).filter(n => /^hae-.*\.json$/.test(n)).sort().reverse()
    if (envios[0]) ultimoEnvio = (await stat(join(dir, envios[0]))).mtime.toISOString()
    for (const n of envios.slice(0, ENVIOS_NOCHE)) {
      try {
        if ((await stat(join(dir, n))).size > 8_000_000) continue
        for (const noche of nochesDeEnvio(JSON.parse(await readFile(join(dir, n), 'utf8')))) if (!noches.has(noche.fecha)) noches.set(noche.fecha, noche)
      } catch { /* un envío ilegible no tumba la lectura */ }
    }
  } catch { errores.push('No se pudo leer la carpeta de envíos del reloj.') }

  const pacto = await pactoJson()
  if (!pacto) errores.push('No se pudo leer el pacto del cuerpo.')
  return { fuente: 'studio', dias, noches: [...noches.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)), ultimoEnvio, pacto, leidoEn: new Date().toISOString(), errores }
}

let guardado: { en: number; datos: DatosSaludStudio } | null = null
let enCurso: Promise<DatosSaludStudio> | null = null
/** Caché de 1 min y lecturas compartidas: dos pestañas abiertas leen una vez. */
export async function salud(fresco = false): Promise<DatosSaludStudio> {
  if (!fresco && guardado && Date.now() - guardado.en < VIDA_MS) return guardado.datos
  if (enCurso) return enCurso
  enCurso = leerSalud().then(d => { guardado = { en: Date.now(), datos: d }; return d }).finally(() => { enCurso = null })
  return enCurso
}
