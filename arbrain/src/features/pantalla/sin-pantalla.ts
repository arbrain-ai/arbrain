/**
 * Qué dice /pantalla cuando no hay pantalla virtual (16 nov 2026). La pantalla virtual es solo de un Arbrain en un servidor
 * Linux (permisos/lib/pantalla-server.ts). En Windows o Mac la página pedía correr `bash …/nube.sh pantalla`, un comando que
 * ahí no existe ni hace falta. Ahora: en Linux, cómo se instala; en otro sistema, que Levy usa la pantalla de verdad. Puro.
 */
import { tr } from '@/shared/i18n'

export function textoSinPantalla(userAgent: string): string {
  const linux = /Linux/i.test(userAgent) && !/Android/i.test(userAgent)
  if (linux) return tr('Este Arbrain no tiene pantalla virtual. En tu servidor se instala con: {comando}', { comando: 'bash arbrain/scripts/instalar/nube.sh pantalla' })
  return tr('Esta vista es para un Arbrain en un servidor Linux en la nube. En esta computadora Levy trabaja sobre tu propia pantalla: no hay nada que instalar aquí.')
}
