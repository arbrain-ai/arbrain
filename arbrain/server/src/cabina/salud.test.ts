import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diasDeCsv, nochesDeEnvio, leerSalud } from './salud.js'

const CSV = `fecha,energia_am,sueno_horas,hrv_ms,resting_hr,fuerza,notas,pasos,sueno_deep_h,sueno_rem_h,sueno_core_h,sueno_awake_h,en_cama_h,peso_kg,grasa_pct,vo2max,resp_rate,temp_muneca
2026-06-10,,6.72,38.5,62,,baseline snapshot Apple Health (synthesis.md),,,,,,,,,,,
2026-10-01,,,42.88,62,,,9676,,,,,,,,,17.13,35.51
2026-10-05,,8.37,57.48,64,,,4356,0.99,2.57,4.81,0.47,0.0,,,,16.44,
`

describe('salud: lectura del Studio', () => {
  it('celda vacía es null, no cero; en_cama_h no viaja; filtra por fecha', () => {
    const dias = diasDeCsv(CSV, '2026-09-01')
    expect(dias.map(d => d.fecha)).toEqual(['2026-10-01', '2026-10-05'])
    expect(dias[0].sueno_horas).toBeNull()
    expect(dias[0].hrv_ms).toBe(42.88)
    expect(dias[1].temp_muneca).toBeNull()
    expect(dias[1].sueno_awake_h).toBe(0.47)
    expect('en_cama_h' in dias[1]).toBe(false)
  })

  it('saca la hora de dormir y despertar de un envío de HAE', () => {
    const doc = { data: { metrics: [{ name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-10-05 00:00:00 -0600', sleepStart: '2026-10-04 21:32:31 -0600', sleepEnd: '2026-10-05 06:23:04 -0600', totalSleep: 8.37 }] }, { name: 'step_count', data: [{ date: '2026-10-05 15:19:00 -0600', qty: 22 }] }] } }
    expect(nochesDeEnvio(doc)).toEqual([{ fecha: '2026-10-05', inicio: '2026-10-04 21:32:31 -0600', fin: '2026-10-05 06:23:04 -0600' }])
    expect(nochesDeEnvio({ nada: true })).toEqual([])
  })

  it('una carpeta sin CSV dice el error y no inventa días', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'salud-'))
    mkdirSync(join(dir, 'incoming'))
    writeFileSync(join(dir, 'incoming', 'hae-20261005-161456.json'), JSON.stringify({ data: { metrics: [{ name: 'sleep_analysis', data: [{ date: '2026-10-05 00:00:00 -0600', sleepStart: '2026-10-04 21:32:31 -0600', sleepEnd: '2026-10-05 06:23:04 -0600' }] }] } }))
    process.env.SALUD_DIR = dir
    try {
      const d = await leerSalud()
      expect(d.dias).toEqual([])
      expect(d.noches).toHaveLength(1)
      expect(d.ultimoEnvio).not.toBeNull()
      expect(d.errores.some(e => e.includes('daily-log.csv'))).toBe(true)
    } finally { delete process.env.SALUD_DIR }
  })
})
