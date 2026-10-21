/**
 * Health Auto Export → muestras (5 oct 2026, salud multiusuario). Las mismas reglas que `personal/salud/tools/hae_adapter.py`
 * (la ruta de Daniel desde el 24 jul): tolera `data` envolvente o no, `qty`/`value`/`avg`, sueño en `totalSleep`/`asleep`/…
 * y horas, minutos o segundos. Cada muestra conserva su timestamp exacto: la base deduplica por (usuario, métrica, ts),
 * así que reenviar lo mismo no cuenta doble. Puro, sin red (tests/salud/salud.test.ts).
 */

export interface Muestra { metrica: string; ts: string; fecha: string; valor: number; extra?: { inicio: string; fin: string } }

/** Nombre en HAE → métrica de Arbrain (las 7 que se piden en «Conecta tu reloj»). */
const MAPA: Record<string, string> = {
  heart_rate_variability: 'hrv_ms', resting_heart_rate: 'resting_hr', step_count: 'pasos', vo2_max: 'vo2max',
  respiratory_rate: 'resp_rate', apple_sleeping_wrist_temperature: 'temp_muneca',
}
const TOTAL_SUENO = ['totalSleep', 'asleep', 'sleep', 'qty', 'value'] as const
const FASES: Record<string, string> = { deep: 'sueno_deep_h', rem: 'sueno_rem_h', core: 'sueno_core_h', awake: 'sueno_awake_h' }

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const fechaDe = (p: Record<string, unknown>) => {
  const raw = String(p.date ?? p.startDate ?? p.sleepEnd ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null
}
function horas(v: number | null, unidades: string): number | null {
  if (v == null) return null
  const u = unidades.toLowerCase()
  if (u.startsWith('min')) return v / 60
  if (u.startsWith('s') && u !== 'hr') return v / 3600
  return v
}

/** Las métricas del envío, venga o no envuelto en `data`. */
function metricasDe(doc: unknown): unknown[] {
  if (!doc || typeof doc !== 'object') return []
  const d = doc as Record<string, unknown>
  const raiz = d.data && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data as Record<string, unknown> : d
  return Array.isArray(raiz.metrics) ? raiz.metrics : []
}

/** Un envío de HAE → muestras. Dentro del mismo envío, la última muestra con el mismo (métrica, ts) gana. */
export function muestrasDeHae(doc: unknown): Muestra[] {
  const porLlave = new Map<string, Muestra>()
  const poner = (m: Muestra) => porLlave.set(`${m.metrica}|${m.ts}`, m)
  for (const metrica of metricasDe(doc)) {
    if (!metrica || typeof metrica !== 'object') continue
    const { name, units, data } = metrica as { name?: unknown; units?: unknown; data?: unknown }
    const nombre = String(name ?? '').trim().toLowerCase(), unidades = String(units ?? '')
    if (!Array.isArray(data)) continue
    for (const punto of data) {
      if (!punto || typeof punto !== 'object') continue
      const p = punto as Record<string, unknown>
      const fecha = fechaDe(p); if (!fecha) continue
      const ts = String(p.date ?? p.startDate ?? p.sleepEnd ?? '')
      if (nombre === 'sleep_analysis') {
        let total: number | null = null
        for (const k of TOTAL_SUENO) { total = num(p[k]); if (total != null && total > 0) break }
        // Algunas versiones no traen total (o lo traen en 0): se reconstruye de las fases.
        if (!total) { const f = ['deep', 'rem', 'core'].map(k => num(p[k])).filter((x): x is number => x != null); total = f.length ? f.reduce((a, b) => a + b, 0) : null }
        const h = horas(total, unidades)
        const inicio = String(p.sleepStart ?? p.inBedStart ?? ''), fin = String(p.sleepEnd ?? p.inBedEnd ?? '')
        if (h != null && h > 0) poner({ metrica: 'sueno_horas', ts, fecha, valor: h, ...(inicio.length >= 16 && fin.length >= 16 ? { extra: { inicio, fin } } : {}) })
        for (const [k, col] of Object.entries(FASES)) { const v = horas(num(p[k]), unidades); if (v != null) poner({ metrica: col, ts, fecha, valor: v }) }
        continue
      }
      const col = MAPA[nombre]; if (!col) continue
      const v = num(p.qty) ?? num(p.value) ?? num(p.Avg) ?? num(p.avg)
      if (v == null) continue
      poner({ metrica: col, ts, fecha, valor: v })
    }
  }
  return [...porLlave.values()]
}

/** Las métricas que agrega la base al día y cómo (igual que `salud_dias_v1` y `hae_adapter._agregar`). */
export const MODO: Record<string, 'suma' | 'maximo' | 'promedio'> = {
  pasos: 'suma', sueno_deep_h: 'suma', sueno_rem_h: 'suma', sueno_core_h: 'suma', sueno_awake_h: 'suma', sueno_horas: 'maximo',
  hrv_ms: 'promedio', resting_hr: 'promedio', vo2max: 'promedio', resp_rate: 'promedio', temp_muneca: 'promedio',
}

/** Agrega muestras a días en memoria (lo mismo que hace la base; sirve a las pruebas y a los envíos sin base). */
export function agregarDias(muestras: Muestra[]): Map<string, Record<string, number>> {
  const acc = new Map<string, Map<string, number[]>>()
  for (const m of muestras) {
    let d = acc.get(m.fecha); if (!d) acc.set(m.fecha, d = new Map())
    const l = d.get(m.metrica); if (l) l.push(m.valor); else d.set(m.metrica, [m.valor])
  }
  const out = new Map<string, Record<string, number>>()
  for (const [fecha, d] of acc) {
    const fila: Record<string, number> = {}
    for (const [metrica, vals] of d) {
      const modo = MODO[metrica] ?? 'promedio'
      fila[metrica] = modo === 'suma' ? vals.reduce((a, b) => a + b, 0) : modo === 'maximo' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length
    }
    out.set(fecha, fila)
  }
  return out
}
