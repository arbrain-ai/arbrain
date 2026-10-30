import { readFileSync } from 'fs'
import { esEdicionCliente } from './edicion.js'
import { secreto } from './cliente/cofre.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// fileURLToPath SIEMPRE — nunca new URL().pathname (rompe con espacios en paths)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

/**
 * Lee el archivo .env sin contaminar process.env.
 * El subprocess del Agent SDK hereda process.env — nunca lo polucionar con secrets.
 */
export function readEnvFile(keys?: string[]): Record<string, string> {
  // Edición cliente (empaquetado, 11 oct 2026): no hay .env; la app pasa la configuración y las llaves del alumno por
  // entorno (CONTRATO-DAEMON.md §2). Se leen de process.env sin escribir nada.
  if (esEdicionCliente()) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string' && (keys === undefined || keys.includes(k))) out[k] = v
    // Contrato v2 (cliente/cofre.ts): los secretos y llaves no están en process.env. Solo quien los pide POR NOMBRE
    // los recibe del cofre (nunca un `readEnvFile()` sin lista, que alguien podría esparcir al entorno de un hijo).
    for (const k of keys ?? []) { const v = secreto(k); if (v !== undefined) out[k] = v }
    return out
  }
  try {
    const content = readFileSync(join(PROJECT_ROOT, '.env'), 'utf-8')
    const result: Record<string, string> = {}

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue

      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()

      // Manejar valores entre comillas: KEY="valor con espacios" o KEY='valor'
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (keys === undefined || keys.includes(key)) {
        result[key] = value
      }
    }

    return result
  } catch {
    return {}
  }
}
