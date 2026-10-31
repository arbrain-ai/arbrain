import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { STORE_DIR } from './config.js'

/**
 * EL LECTOR ESTÁ SONANDO (31 oct 2026). Daniel: «que no pare hasta que sea así» (lector sin saltos). El 31 oct a las
 * 08:31:22 el auto-deploy reinició este daemon en el mismo segundo en que el iPhone pedía un tramo: 500, y la lectura
 * cayó a la voz del navegador, que pierde frases. Cada pedido del lector deja aquí su hora; `scripts/lector-reposo.sh`
 * (lo usa auto-deploy.sh) no reinicia el daemon si el último fue hace menos de 2 minutos: lo deja para el reposo, como
 * `desktop:install` con la app.
 *
 * Una escritura cada 5 s como mucho (un tramo cada ~2 s a 2x): el archivo solo dice «hace poco».
 */
export const ARCHIVO_ACTIVIDAD_LECTOR = join(STORE_DIR, '.lector-tts')
const CADA_MS = 5_000
let ultima = 0

/** Deja la hora del pedido del lector. `ahora` y `escribir` inyectables para el test. Nunca falla la petición. */
export function marcarLectorActivo(ahora = Date.now(), escribir: (f: string, s: string) => Promise<void> = writeFile): boolean {
  if (ahora - ultima < CADA_MS) return false
  ultima = ahora
  escribir(ARCHIVO_ACTIVIDAD_LECTOR, String(Math.floor(ahora / 1000))).catch(() => {})
  return true
}

/** Solo para las pruebas. */
export function reiniciarActividadLector() { ultima = 0 }
