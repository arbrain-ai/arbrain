/**
 * ¿Hay pantalla virtual en el servidor donde corre esta web? (modo servidor, 1 nov 2026). Solo servidor: mira el
 * marcador que deja root con `nube.sh pantalla` (la web y el daemon corren en la misma máquina). La regla pura vive en
 * `disponibilidad.ts`; este archivo solo trae el dato del disco.
 */
import { existsSync } from 'node:fs'
import { rutaMarcadorPantalla } from './disponibilidad'

export function pantallaVirtualServidor(env: Record<string, string | undefined> = process.env, plataforma: string = env.ARBRAIN_PLATAFORMA_PRUEBA?.trim() || process.platform): boolean {
  return plataforma === 'linux' && existsSync(rutaMarcadorPantalla(env))
}
