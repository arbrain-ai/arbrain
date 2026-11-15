/**
 * El REGISTRO de bloques del mapa v16 (14 nov 2026): el `tipo` que escribe una receta → el componente nativo que lo pinta.
 * Cada familia vive en su archivo y se edita sin tocar las demás: base (encabezado, cita, texto, botones, lista), norte
 * (anillo NOVA y los principios), nervioso (órgano, error y meta, actividad, decisión, timonel), oferta y programa.
 */
import type { ComponenteBloque } from '../tipos'
import { BLOQUES_BASE } from './base'
import { BLOQUES_NORTE } from './norte'
import { BLOQUES_NERVIOSO } from './nervioso'
import { BLOQUES_OFERTA } from './oferta'
import { BLOQUES_PROGRAMA } from './programa'

export const BLOQUES: Readonly<Record<string, ComponenteBloque>> = {
  ...BLOQUES_BASE, ...BLOQUES_NORTE, ...BLOQUES_NERVIOSO, ...BLOQUES_OFERTA, ...BLOQUES_PROGRAMA,
}
export const TIPOS_BLOQUE: ReadonlySet<string> = new Set(Object.keys(BLOQUES))
