import 'server-only'
/**
 * Stats Royale · lado servidor (19 nov 2026). Lee `store/cuartel/vistas/juego.json`, que `juego.py` rehace cada día a
 * las 06:45 (contrato `cuartel.juego/1`). Solo lectura: la pantalla no calcula. Si falta, se dice por qué.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DUENO } from '@/config'
import { raiz } from './servidor'
import { marcarTuyo, type Juego, type LecturaJuego } from './juego'

export async function leerJuego(): Promise<LecturaJuego> {
  const leido = new Date().toISOString()
  const R = raiz()
  if (!R) return { juego: null, leido, falta: 'No encontré la carpeta del cerebro en esta máquina.' }
  const ruta = path.join(R, 'arbrain', 'server', 'store', 'cuartel', 'vistas', 'juego.json')
  let juego: Juego
  try { juego = JSON.parse(await readFile(ruta, 'utf8')) as Juego } catch {
    return { juego: null, leido, falta: 'El juego aún no se calcula en esta máquina (falta vistas/juego.json; lo escribe el cron cuartel-juego a las 06:45).' }
  }
  if (!juego?.esquema?.startsWith('cuartel.juego/') || !juego.perfil) return { juego: null, leido, falta: `El archivo del juego no trae el contrato esperado (${juego?.esquema ?? 'sin esquema'}).` }
  return { juego: marcarTuyo(juego, DUENO()), leido }
}
