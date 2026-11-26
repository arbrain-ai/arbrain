import 'server-only'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { jsonDeSalida } from './cerebro-pedidos'
import { correrCerebro, ErrorCerebro, raiz } from './cerebro-servidor'
import type { PedidoIdeas } from './ideas-pedidos'

/**
 * Cuartel de YouTube · banco de ideas, lado servidor: corre `ideas.py` (el dueño del banco y de «Tu tipo de contenido»)
 * o, para generar una idea desde un video, `cerebro.py` (que primero lo lee). Los argumentos llegan ya validados
 * (ideas-pedidos.ts) y van sin shell. Aquí no hay llaves ni llamadas a modelos: eso vive dentro del script.
 */
export function correrIdeas<T = unknown>(pedido: PedidoIdeas): Promise<T> {
  if ('error' in pedido) return Promise.reject(new ErrorCerebro(pedido.error, 400))
  if (pedido.guion === 'cerebro') return correrCerebro<T>({ args: pedido.args, ms: pedido.ms })
  const R = raiz()
  const guion = R ? path.join(R, 'arbrain', 'server', 'scripts', 'cuartel', 'cerebro', 'ideas.py') : null
  if (!R || !guion || !existsSync(guion)) return Promise.reject(new ErrorCerebro('El banco de ideas no está instalado en esta máquina.', 404))
  const python = existsSync('/opt/homebrew/bin/python3') ? '/opt/homebrew/bin/python3' : 'python3'
  return new Promise((resolver, rechazar) => {
    execFile(python, [guion, ...pedido.args], { cwd: R, timeout: pedido.ms, maxBuffer: 8 << 20, env: { ...process.env, BUSINESS_OS_ROOT: R } }, (error, salida, errores) => {
      // Código 2 = el script entendió el pedido y lo rechazó (idea que no existe, falta la nota): su razón viene en JSON.
      if (error && (error as unknown as { code?: number | string }).code === 2) {
        try { return rechazar(new ErrorCerebro(String((jsonDeSalida(salida) as { error?: string }).error ?? 'Pedido rechazado.'), 400)) } catch { /* cae al error general */ }
      }
      if (error) {
        const detalle = (errores || error.message).trim().split('\n').pop()?.slice(-300) ?? ''
        return rechazar(new ErrorCerebro(error.killed ? 'El banco de ideas tardó demasiado. Intenta de nuevo.' : `El banco de ideas falló: ${detalle}`))
      }
      try { resolver(jsonDeSalida(salida) as T) } catch (e) { rechazar(new ErrorCerebro((e as Error).message)) }
    })
  })
}
