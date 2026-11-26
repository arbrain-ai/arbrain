import 'server-only'
/**
 * Lo tuyo en Contenido, en el Studio (17 nov 2026): guardados y la cola de «ver después». Es de PANTALLAS (ESQUEMA.md
 * §1): vive junto a las descargas, en `R/arbrain/server/store/cuartel/pantallas/mios.json`, no en el navegador; así
 * sobrevive a reinicios, se ve igual desde el teléfono y viaja igual a la copia del alumno.
 */
import path from 'node:path'
import { raiz } from './servidor'
import { VACIO, type CambioMios, type Mios } from './mios'
import { cambiarMiosEn, leerMiosEn } from './mios-archivo'

export const rutaMios = (R: string) => path.join(R, 'arbrain', 'server', 'store', 'cuartel', 'pantallas', 'mios.json')

export async function leerMios(): Promise<Mios> {
  const R = raiz()
  return R ? leerMiosEn(rutaMios(R)) : { ...VACIO, guardados: [], despues: [] }
}

export async function cambiarMios(cambio: CambioMios): Promise<Mios> {
  const R = raiz()
  if (!R) throw new Error('No encontré la carpeta del cerebro en esta máquina.')
  return cambiarMiosEn(rutaMios(R), cambio)
}
