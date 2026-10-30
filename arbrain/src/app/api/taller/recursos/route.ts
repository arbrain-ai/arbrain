import { open, stat } from 'node:fs/promises'
import { cpus, homedir, totalmem } from 'node:os'
import { join } from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { jornada, leerLineas, type FotoRecursos, type LineaVigia } from '@/features/cabina/panel/recursos-modelo'

// «El taller hoy» (15 oct 2026): la jornada de la máquina para Taller › Máquina. Lee el registro del vigía de recursos
// (`arbrain/server/scripts/vigia-recursos.py`, launchd com.levy.vigia-recursos, una línea por minuto, rota a 10 MB en
// `.jsonl.1`). Esta web corre en el Studio, la misma máquina que mide el vigía: se lee el archivo directo, solo su cola
// (24 h ≈ 1 MB), sin pasar por el agent-server. Sin registro (edición cliente, otra máquina) responde `disponible: false`.

export const runtime = 'nodejs'
const LOG = () => process.env.VIGIA_RECURSOS_LOG || join(homedir(), '.claudeclaw', 'logs', 'vigia-recursos.jsonl')
const COLA = 1_600_000

async function cola(ruta: string, bytes = COLA): Promise<string> {
  try {
    const { size } = await stat(ruta)
    const fh = await open(ruta, 'r')
    try {
      const n = Math.min(size, bytes), buf = Buffer.alloc(n)
      await fh.read(buf, 0, n, size - n)
      return buf.toString('utf8')
    } finally { await fh.close() }
  } catch { return '' }
}

export async function GET(request: Request) {
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const horas = Math.min(24, Math.max(1, Number(q.get('horas')) || 24))
    const ahora = Date.now()
    let lineas: LineaVigia[] = leerLineas(await cola(LOG()))
    // Recién rotado: lo que falta de la ventana está en el archivo anterior.
    if (!lineas.length || Date.parse(lineas[0].ts) > ahora - horas * 3600_000) lineas = [...leerLineas(await cola(`${LOG()}.1`)), ...lineas]
    const ramMb = Math.round(totalmem() / 1048576), nucleos = cpus().length || 1
    const pasoMin = horas > 6 ? 5 : 2
    const foto: FotoRecursos = {
      disponible: lineas.length > 0, ramMb, nucleos, ahora: lineas.at(-1) ?? null, pasoMin,
      serie: jornada(lineas, { ramMb, nucleos, ahora, horas, pasoMin }),
      desde: lineas.length ? Date.parse(lineas[0].ts) : null,
    }
    return Response.json(foto, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
