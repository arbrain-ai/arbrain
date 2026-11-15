/**
 * Guardar el idioma de la instalación (13 nov 2026). Solo servidor. Escribe `<carpeta de configuración>/idioma.json`,
 * que leen la web (`shared/i18n/idioma.ts`), el daemon (`server/src/idioma.ts`, el agente contesta en ese idioma) y la
 * voz. Escritura atómica, como el resto de la configuración compartida.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'
import { ARCHIVO_IDIOMA, leerIdiomaDisco, type Idioma } from '@/shared/i18n/idioma'
import { olvidarIdiomaServidor } from '@/shared/i18n/tr'

export function rutaIdioma(): string {
  return join(dirConfigArbrain(), ARCHIVO_IDIOMA)
}

export function leerIdioma(): Idioma {
  return leerIdiomaDisco()
}

export function guardarIdioma(idioma: Idioma): Idioma {
  const dir = dirConfigArbrain()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const destino = join(dir, ARCHIVO_IDIOMA)
  const tmp = `${destino}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ idioma, fecha: new Date().toISOString() }, null, 1)}\n`, { mode: 0o644 })
  renameSync(tmp, destino)
  olvidarIdiomaServidor()
  return idioma
}
