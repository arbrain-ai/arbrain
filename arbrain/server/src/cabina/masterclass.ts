/**
 * Vista «masterclass» (7 oct 2026): la fuente única de la masterclass del sáb 17 oct, leída del repo del Studio.
 * La edita Levy conversando con Daniel; la vista de Arbrain la relee cada pocos segundos y se repinta cuando cambia.
 * Aquí solo se lee y se entrega tal cual (con su mtime): el modelo vive en arbrain/src/features/masterclass/modelo.ts.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { REPO } from './documento.js'

export const RUTA_MASTERCLASS = 'docs/business-os/lanzamiento-ht-15-oct/masterclass/masterclass-17-oct.json'

export interface LecturaMasterclass { datos?: unknown; mtime?: string; ruta: string; leidoEn: string; error?: string }

/** Un archivo a medio escribir o con un JSON roto no tumba la vista: devuelve el error legible y la vista lo dice. */
export async function masterclass(repo = REPO): Promise<LecturaMasterclass> {
  const abs = path.join(repo, RUTA_MASTERCLASS), leidoEn = new Date().toISOString()
  try {
    const [texto, st] = await Promise.all([readFile(abs, 'utf8'), stat(abs)])
    try { return { datos: JSON.parse(texto), mtime: st.mtime.toISOString(), ruta: RUTA_MASTERCLASS, leidoEn } }
    catch (e) { return { ruta: RUTA_MASTERCLASS, mtime: st.mtime.toISOString(), leidoEn, error: `El archivo de la masterclass no es JSON válido (${e instanceof Error ? e.message : 'sin detalle'}).` } }
  } catch {
    return { ruta: RUTA_MASTERCLASS, leidoEn, error: `No encuentro ${RUTA_MASTERCLASS} en el Studio.` }
  }
}
