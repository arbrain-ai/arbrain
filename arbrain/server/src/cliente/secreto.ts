/**
 * Secreto de confirmación humana (I8; contrato §6). Llega de la app por stdin (contrato v2, cliente/cofre.ts) o, en v1,
 * por `ARBRAIN_TOKEN_CONFIRMAR`; vive solo en la memoria del daemon y nunca en `process.env`, así ningún agente ni
 * subproceso (Bash del modelo, hooks, MCP) lo hereda. Sin secreto nadie puede aprobar nada: lo irreversible queda negado.
 */
import { timingSafeEqual } from 'node:crypto'
import { fijarSecreto, secreto as delCofre } from './cofre.js'

const NOMBRE = 'ARBRAIN_TOKEN_CONFIRMAR'

/** Compatibilidad v1: toma el secreto del entorno (si aún no está en el cofre) y lo quita de ahí. Idempotente. */
export function capturarSecretoConfirmar(env: NodeJS.ProcessEnv = process.env): void {
  const v = (env[NOMBRE] ?? '').trim()
  if (v && !delCofre(NOMBRE)) fijarSecreto(NOMBRE, v)
  delete env[NOMBRE]
}

const secreto = () => delCofre(NOMBRE) ?? ''

export const haySecretoConfirmar = () => secreto().length > 0

/** ¿La cabecera trae el secreto de la app? Comparación en tiempo constante. */
export function secretoConfirmarValido(dado: unknown): boolean {
  const s = secreto()
  if (!s || typeof dado !== 'string' || dado.length !== s.length) return false
  return timingSafeEqual(Buffer.from(dado), Buffer.from(s))
}

/** Solo pruebas. */
export function fijarSecretoConfirmarParaPruebas(v: string): void { fijarSecreto(NOMBRE, v) }
