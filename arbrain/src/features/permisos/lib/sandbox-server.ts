/**
 * ¿Corre el Bash de los agentes dentro de sandbox en esta máquina? Solo servidor. Misma regla que el daemon
 * (`arbrain/server/src/cliente/sandbox.ts › sandboxDisponible`, contrato v3 §6.1): macOS con `sandbox-exec`, Linux
 * con `bwrap` y `socat` en el PATH; Windows nunca; `ARBRAIN_SANDBOX=0` lo apaga. Sin sandbox, el daemon pide
 * confirmación para TODO Bash y la web se lo dice a la persona antes de que la sorprenda.
 */
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { EstadoSandbox } from './confirmacion'

type Entorno = Record<string, string | undefined>
const enPath = (programa: string, env: Entorno, existe: (r: string) => boolean) =>
  (env.PATH ?? '').split(delimiter).filter(Boolean).some(d => existe(join(d, programa)))

export function estadoSandbox(env: Entorno = process.env, plataforma: NodeJS.Platform = process.platform, existe: (r: string) => boolean = existsSync): EstadoSandbox {
  const sistema: EstadoSandbox['sistema'] = plataforma === 'darwin' ? 'macos' : plataforma === 'win32' ? 'windows' : plataforma === 'linux' ? 'linux' : 'otro'
  if (env.ARBRAIN_SANDBOX === '0') return { disponible: false, sistema }
  if (sistema === 'macos') return { disponible: existe('/usr/bin/sandbox-exec'), sistema }
  if (sistema === 'linux') {
    const faltan = ['bwrap', 'socat'].filter(p => !enPath(p, env, existe))
    return faltan.length ? { disponible: false, sistema, faltan } : { disponible: true, sistema }
  }
  return { disponible: false, sistema }
}
