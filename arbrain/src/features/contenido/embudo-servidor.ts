import 'server-only'
/**
 * «Su embudo» · lado servidor (19 nov 2026). Lee `contenido/youtube/intel/embudos/embudos.json` y
 * `datos/estado-semanal.json` del cerebro (nunca desde el cliente), con caché por fecha de modificación, y devuelve el
 * resumen de un canal por su `channel_id`. Sin ficha = `null` (la tarjeta lo dice; no se inventa).
 */
import { stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { raiz } from './servidor'
import { competidorDe, resumirEmbudo, type Competidor, type EmbudoCanal, type EstadoSemanalJson, type FichaEmbudoJson } from './embudo'

const CARPETA = ['contenido', 'youtube', 'intel', 'embudos']
type Indice = { por: Map<string, FichaEmbudoJson>; corte: string; estado: EstadoSemanalJson | null; firma: string }
let cache: Indice | null = null

async function mtime(p: string): Promise<number> { try { return (await stat(p)).mtimeMs } catch { return 0 } }

async function indice(): Promise<Indice | null> {
  const R = raiz()
  if (!R) return null
  const base = path.join(R, ...CARPETA)
  const pEmb = path.join(base, 'embudos.json'), pEst = path.join(base, 'datos', 'estado-semanal.json')
  const firma = `${R}|${await mtime(pEmb)}|${await mtime(pEst)}`
  if (cache?.firma === firma) return cache
  try {
    const emb = JSON.parse(await readFile(pEmb, 'utf8')) as { corte?: string; fichas?: FichaEmbudoJson[] }
    let estado: EstadoSemanalJson | null = null
    try { estado = JSON.parse(await readFile(pEst, 'utf8')) as EstadoSemanalJson } catch { /* sin estudio aún */ }
    const por = new Map<string, FichaEmbudoJson>()
    for (const f of emb.fichas ?? []) if (f?.channel_id) por.set(f.channel_id, f)
    cache = { por, corte: emb.corte ?? '', estado, firma }
    return cache
  } catch { return null }
}

export async function leerEmbudoCanal(channelId: string): Promise<EmbudoCanal | null> {
  const i = await indice()
  const f = i?.por.get(channelId)
  return f && i ? resumirEmbudo(f, i.corte, i.estado) : null
}

/** La lista de «Competidores»: un renglón por ficha de embudo (competencia y referentes del universo). */
export async function leerCompetidores(): Promise<{ corte: string; competidores: Competidor[] } | null> {
  const i = await indice()
  return i ? { corte: i.corte, competidores: [...i.por.values()].map(f => competidorDe(f, i.corte)) } : null
}
