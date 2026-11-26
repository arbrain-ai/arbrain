import 'server-only'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { instalacion } from '@/config'
import { jsonDeSalida, type Pedido } from './cerebro-pedidos'

/**
 * Cuartel de YouTube · CEREBRO, lado servidor: lee lo que el algoritmo dejó en `store/cuartel/cerebro/` y corre
 * `cerebro.py` para lo que escribe o pregunta (voto, pregúntale al video, ideas). El modelo va por la suscripción dentro
 * del script (claude -p); aquí no hay llaves ni llamadas a modelos. Contrato: docs/builds/contenido-cuartel/CEREBRO.md.
 */

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' }

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
export const raiz = (): string | null => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

const dirCerebro = (R: string) => path.join(R, 'arbrain', 'server', 'store', 'cuartel', 'cerebro')
const guion = (R: string) => path.join(R, 'arbrain', 'server', 'scripts', 'cuartel', 'cerebro', 'cerebro.py')

/** Un JSON de CEREBRO (`dosis`, `ideas`, `ranking`, `lazo`); null si aún no existe. */
export async function leerCerebro<T = unknown>(nombre: 'dosis' | 'ideas' | 'ranking' | 'lazo'): Promise<T | null> {
  const R = raiz()
  if (!R) return null
  try { return JSON.parse(await readFile(path.join(dirCerebro(R), `${nombre}.json`), 'utf8')) as T } catch { return null }
}

export class ErrorCerebro extends Error {
  constructor(mensaje: string, readonly estado = 500) { super(mensaje) }
}

/** Corre `cerebro.py <args>` y devuelve su JSON. Los argumentos llegan ya validados (cerebro-pedidos.ts) y van sin shell. */
export function correrCerebro<T = unknown>(pedido: Pedido): Promise<T> {
  if ('error' in pedido) return Promise.reject(new ErrorCerebro(pedido.error, 400))
  const R = raiz()
  if (!R || !existsSync(guion(R))) return Promise.reject(new ErrorCerebro('El cerebro del cuartel no está instalado en esta máquina.', 404))
  const python = existsSync('/opt/homebrew/bin/python3') ? '/opt/homebrew/bin/python3' : 'python3'
  return new Promise((resolver, rechazar) => {
    execFile(python, [guion(R), ...pedido.args], { cwd: R, timeout: pedido.ms, maxBuffer: 8 << 20, env: { ...process.env, BUSINESS_OS_ROOT: R } }, (error, salida, errores) => {
      if (error) {
        const detalle = (errores || error.message).trim().split('\n').pop()?.slice(-300) ?? ''
        return rechazar(new ErrorCerebro(error.killed ? 'El cerebro del cuartel tardó demasiado. Intenta de nuevo.' : `El cerebro del cuartel falló: ${detalle}`))
      }
      try { resolver(jsonDeSalida(salida) as T) } catch (e) { rechazar(new ErrorCerebro((e as Error).message)) }
    })
  })
}

export const respuestaError = (error: unknown) =>
  error instanceof ErrorCerebro ? Response.json({ error: error.message }, { status: error.estado, headers: SIN_CACHE }) : null
