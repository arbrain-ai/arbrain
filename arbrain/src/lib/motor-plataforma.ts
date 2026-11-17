/**
 * La terminal de Arbrain por sistema (16 nov 2026). Las terminales viven en el motor (sockets Unix, paso de fds y grupos de
 * procesos), que en Windows no existe (src-tauri/src/motor.rs). Antes la terminal inferior de Windows enseñaba
 * «El motor no responde: connect ENOENT …»; ahora dice en una frase qué pasa y qué sí puede hacer la persona. Puro.
 */
import { tr } from '@/shared/i18n'

/** null = este sistema tiene motor de terminales; si no, la frase para la persona. */
export function avisoSinMotor(plataforma: string): string | null {
  if (plataforma !== 'win32') return null
  return tr('La terminal de Arbrain todavía no funciona en Windows. Pídele a Levy en el chat que corra el comando por ti, o abre tu carpeta en el Explorador de Windows (botón de abrir carpeta en Archivos) y ahí PowerShell.')
}
