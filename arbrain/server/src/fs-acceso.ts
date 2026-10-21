/**
 * Qué puede leer `/fs/*` del daemon (seguridad para clientes, 10 oct 2026; AUDITORIA I6).
 *
 * Instalación de Daniel: igual que siempre, cualquier ruta real dentro de $HOME.
 * Edición cliente: solo dentro del workspace de Arbrain y nunca secretos (.env, llaves, llaveros, bases), aunque
 * estén dentro del workspace. Así un token del daemon filtrado no se vuelve lectura de todo el disco.
 */
import { basename, sep } from 'node:path'

/** Rutas que nunca se sirven en la edición cliente (por segmento o por nombre de archivo). */
const CARPETAS_SECRETAS = new Set(['.ssh', '.gnupg', '.aws', '.kube', '.docker', '.azure', '.config/gcloud', 'Keychains', '.password-store', 'store'])
const ARCHIVO_SECRETO = /^(\.env(\..+)?|\.mcp\.json|\.netrc|\.npmrc|\.pypirc|credentials(\.json)?|id_(rsa|ed25519|ecdsa|dsa)(\.pub)?|.*\.(pem|p12|pfx|key|keychain-db|db|sqlite3?)(-wal|-shm)?)$/i

export function rutaSecreta(real: string): boolean {
  const nombre = basename(real)
  if (ARCHIVO_SECRETO.test(nombre) && !/\.example$/i.test(nombre)) return true
  // Windows y POSIX: los dos separadores (la guardia también recibe rutas escritas por el modelo).
  const partes = real.split(/[\\/]/)
  return partes.some((p, i) => CARPETAS_SECRETAS.has(p) || CARPETAS_SECRETAS.has(`${p}/${partes[i + 1] ?? ''}`))
}

/** `real` ya pasó por realpath. Devuelve el motivo del rechazo o null si se puede servir. */
export function motivoFsRechazo(real: string, op: { home: string; cliente: boolean; workspace: string }): string | null {
  const dentro = (raiz: string) => real === raiz || real.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)
  // Edición cliente: el límite es el workspace del alumno, esté o no bajo $HOME (en Windows puede vivir en otro disco).
  if (op.cliente) {
    if (!dentro(op.workspace)) return 'fuera del workspace de Arbrain'
  } else {
    if (!dentro(op.home)) return 'fuera de $HOME'
    return null
  }
  if (rutaSecreta(real)) return 'ruta con secretos'
  return null
}
