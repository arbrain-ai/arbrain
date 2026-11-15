import 'server-only'
/**
 * Lado servidor de «Ver resultados» (11 nov 2026). La regla de qué es evidencia vive en
 * `features/cabina/evidencia-modelo.ts` (pura, con pruebas); aquí solo se comprueba en disco con las MISMAS guardas de
 * la vista «documento» (`resolverEnDisco`: raíces permitidas, sin credenciales, enlaces seguidos) y se firma la URL
 * con la que el visor pide cada archivo (`urlCruda`). Nunca escribe ni borra nada.
 */
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { listarCarpeta, resolverEnDisco, urlCruda } from './documento-server'
import { candidatas, carpetasEvidencia, claseMedio, ordenarEvidencia, rutasMencionadas, type PiezaEvidencia } from '@/features/cabina/evidencia-modelo'

const MAX_POR_CARPETA = 60

/** Una ruta que nombró → la pieza comprobada, o null si no existe, no es medio o cae fuera de lo permitido. */
async function pieza(pedida: string, de: PiezaEvidencia['de']): Promise<PiezaEvidencia | null> {
  try {
    const doc = await resolverEnDisco(pedida)
    if (doc.tipo === 'carpeta') return null
    const clase = claseMedio(doc.real)
    if (!clase) return null
    const info = await stat(doc.real)
    return { ruta: doc.real, nombre: path.basename(doc.real), clase, url: urlCruda(doc.real, path.dirname(doc.real)), bytes: info.size, mtime: info.mtime.toISOString(), de }
  } catch { return null }
}

/** La primera candidata que exista (en el orden de `candidatas`). */
async function primera(lista: string[], de: PiezaEvidencia['de']) {
  for (const c of lista) { const p = await pieza(c, de); if (p) return p }
  return null
}

/** Los medios de `final/` y `evidencia/` de su carpeta, hasta 3 niveles, lo más nuevo primero dentro de cada carpeta. */
async function deCarpetas(cwd: string): Promise<PiezaEvidencia[]> {
  const out: PiezaEvidencia[] = []
  for (const dir of carpetasEvidencia(cwd)) {
    let real: string
    try { const d = await resolverEnDisco(dir); if (d.tipo !== 'carpeta') continue; real = d.real } catch { continue }
    const { items } = await listarCarpeta(real).catch(() => ({ items: [] }))
    const medios = items.flatMap(it => { const clase = claseMedio(it.ruta); return clase ? [{ ruta: it.ruta, nombre: it.relativa, clase, url: urlCruda(it.ruta, real), bytes: it.bytes, mtime: it.mtime, de: 'carpeta' as const }] : [] })
    out.push(...medios.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, MAX_POR_CARPETA))
  }
  return out
}

/** La galería: lo que nombró, lo de sus carpetas de evidencia y los medios que escribió, comprobados y sin repetir. */
export async function reunirEvidencia(p: { texto: string | null; cwd: string; escritos: string[] }): Promise<PiezaEvidencia[]> {
  const cwd = p.cwd.trim()
  const mencion = (await Promise.all(rutasMencionadas(p.texto).slice(0, 40).map(r => primera(candidatas(r, cwd), 'mencion')))).filter((x): x is PiezaEvidencia => !!x)
  const carpeta = cwd ? await deCarpetas(cwd) : []
  const escrito = (await Promise.all(p.escritos.filter(r => claseMedio(r)).slice(0, 40).map(r => primera(candidatas(r, cwd), 'escrito')))).filter((x): x is PiezaEvidencia => !!x)
  return ordenarEvidencia({ mencion, carpeta, escrito })
}
