import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { PROJECT_ROOT } from './config.js'

/** Called only after the existing daemon bearer authentication. */
export function handlePlanning(payload: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  if (JSON.stringify(payload).length > 100_000) return Promise.resolve({ status: 413, body: { error: 'Petición demasiado grande.' } })
  return new Promise(resolve => {
    const child = execFile(process.env.PLANNING_PYTHON ?? 'python3',
      [join(PROJECT_ROOT, 'arbrain/server/scripts/calendar/mc-event.py'), 'planning'],
      { timeout: 90_000, maxBuffer: 8_000_000 }, (error, stdout) => {
        if (error) return resolve({ status: 503, body: { error: 'La pluma de planificación no respondió.' } })
        try {
          const body = JSON.parse(stdout)
          resolve({ status: body.error ? body.status ?? 503 : 200, body })
        } catch { resolve({ status: 502, body: { error: 'Respuesta de planificación inválida.' } }) }
      })
    child.stdin?.end(JSON.stringify(payload))
  })
}
