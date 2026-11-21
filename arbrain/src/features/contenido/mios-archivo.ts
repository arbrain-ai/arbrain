/**
 * El archivo de lo tuyo en Contenido (17 nov 2026), sin Next: leer y cambiar `mios.json` en una ruta dada. Lo usa el
 * Studio (`mios-servidor.ts`) y las pruebas (con una carpeta temporal: guardar, «reiniciar» y volver a leer).
 * Una escritura a la vez y por archivo temporal + rename: un corte a medias nunca deja el archivo roto.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { aplicar, normalizar, VACIO, type CambioMios, type Mios } from './mios'

export async function leerMiosEn(ruta: string): Promise<Mios> {
  try { return normalizar(JSON.parse(await readFile(ruta, 'utf8'))) } catch { return { ...VACIO, guardados: [], despues: [] } }
}

let fila: Promise<unknown> = Promise.resolve()
/** Aplica un cambio sobre el archivo (en fila: dos toques seguidos no se pisan). */
export function cambiarMiosEn(ruta: string, cambio: CambioMios, ahora = new Date()): Promise<Mios> {
  const paso = fila.then(async () => {
    const nuevo = aplicar(await leerMiosEn(ruta), cambio, ahora)
    await mkdir(path.dirname(ruta), { recursive: true })
    const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(nuevo, null, 1))
    await rename(tmp, ruta)
    return nuevo
  })
  fila = paso.catch(() => undefined)
  return paso
}

