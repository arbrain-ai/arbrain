/**
 * El motor del editor de video (Scarlet, MIT, sin ventana): servicio `com.levy.editor-motor` en loopback.
 * Contrato: docs/builds/editor-arbrain-2026-11-19/CONTRATO-MOTOR.md. El token vive en un archivo 600 de su biblioteca
 * y solo lo lee este proceso; nunca viaja en la config del MCP ni llega al navegador.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const MOTOR_DIR = () => process.env.EDITOR_MOTOR_DIR || path.join(homedir(), 'Developer/software/arbrain-editor-motor')
export const MOTOR_URL = () => (process.env.EDITOR_MOTOR_URL || 'http://127.0.0.1:47420').replace(/\/$/, '')
export const TOKEN_FILE = () => process.env.EDITOR_MOTOR_TOKEN_FILE || path.join(homedir(), 'Library/Application Support/arbrain-editor/data/access-token')

export type LlamarMotor = <T = Record<string, unknown>>(method: string, ruta: string, body?: unknown) => Promise<T>

export class ErrorMotor extends Error {
  constructor(public status: number, mensaje: string) { super(mensaje) }
}

/** Una llamada a `/api` del motor. `f` se inyecta en pruebas. */
export function clienteMotor(f: typeof fetch = fetch): LlamarMotor {
  return async <T>(method: string, ruta: string, body?: unknown): Promise<T> => {
    let token: string
    try { token = readFileSync(TOKEN_FILE(), 'utf8').trim() } catch { throw new ErrorMotor(0, `No encuentro el token del motor (${TOKEN_FILE()}): ¿está instalado com.levy.editor-motor?`) }
    let r: Response
    try {
      r = await f(`${MOTOR_URL()}/api${ruta}`, {
        method, signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (e) {
      throw new ErrorMotor(0, `El motor del editor no responde en ${MOTOR_URL()} (${e instanceof Error ? e.message : String(e)}). Revisa com.levy.editor-motor en el Taller.`)
    }
    const texto = await r.text()
    if (!r.ok) {
      let msg = texto.slice(0, 300)
      try { msg = (JSON.parse(texto) as { error?: { message?: string } }).error?.message ?? msg } catch { /* texto plano */ }
      throw new ErrorMotor(r.status, `Motor ${method} ${ruta} → ${r.status}: ${msg}`)
    }
    return (texto ? JSON.parse(texto) : {}) as T
  }
}
