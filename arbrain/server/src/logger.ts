import pino from 'pino'
// Marcador del repo (carril O): fija ARBRAIN_EDICION antes de leerla aquí, sin depender del orden de importación.
import './edicion.js'
import { redactar } from './cliente/bitacora.js'

// Edición cliente: sin el nombre de la máquina en cada línea (el alumno puede compartir su log para soporte).
const CLIENTE = (process.env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(CLIENTE ? { base: { pid: process.pid } } : {}),
  // Seguridad del alumno (12 oct 2026): en cliente ninguna línea del log guarda llaves; textos y campos de texto pasan
  // por la misma redacción que la bitácora (el alumno puede compartir su log para soporte). Daniel: igual que siempre.
  ...(CLIENTE ? { hooks: { logMethod(args: unknown[], metodo: (...a: unknown[]) => void) { metodo.apply(this, args.map(redactarArg)) } } } : {}),
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

/** Redacción superficial de un argumento del log (cadenas y campos de texto de primer nivel; los Error, su mensaje). */
function redactarArg(a: unknown): unknown {
  if (typeof a === 'string') return redactar(a)
  if (a instanceof Error) { const e = new Error(redactar(a.message)); e.name = a.name; e.stack = a.stack ? redactar(a.stack) : undefined; return e }
  if (!a || typeof a !== 'object' || Array.isArray(a)) return a
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(a as Record<string, unknown>)) o[k] = typeof v === 'string' ? redactar(v) : v instanceof Error ? redactarArg(v) : v
  return o
}
