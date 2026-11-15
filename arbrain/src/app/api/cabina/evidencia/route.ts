import { planningOwner, planningError } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { reunirEvidencia } from '@/lib/cabina/evidencia-server'
import { archivosTocados, claseMedio, comandosDe, commitsDe, respuestaFinal, resumenHumano } from '@/features/cabina/evidencia-modelo'
import type { Lectura, Paso } from '@/features/cabina/panel/actividad-modelo'
import { rutaSensibleDirecto } from '@/lib/modo-directo/reglas'
import { directoPrendido } from '@/lib/modo-directo/servidor'

// «Ver resultados» del Taller (11 nov 2026): la evidencia visual de un agente para el dueño y lo técnico para Levy.
// Lee su bitácora con la vista «actividad» del daemon (la que ya pinta su terminal) y comprueba los archivos en el disco
// del Studio con las guardas de la vista «documento». Solo lectura: no escribe, no borra, no toca al agente.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

/** Los pasos de su bitácora (la cola, como la abre su terminal). Sin daemon o sin bitácora: vacío, y manda el texto que trajo la app. */
async function pasosDe(agente: number): Promise<Paso[]> {
  try {
    const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ que: 'actividad', agente }), signal: AbortSignal.timeout(20_000), cache: 'no-store',
    })
    if (!res.ok) return []
    return ((await res.json()) as Partial<Lectura>).pasos ?? []
  } catch { return [] }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    const body = await request.json().catch(() => null) as { agente?: unknown; cwd?: unknown; texto?: unknown } | null
    const agente = Number(body?.agente)
    const cwd = typeof body?.cwd === 'string' ? body.cwd.slice(0, 1000) : ''
    if (!cwd && !(Number.isInteger(agente) && agente > 0)) return Response.json({ error: 'Falta el agente o su carpeta.' }, { status: 400, headers: NO_CACHE })
    const pasos = Number.isInteger(agente) && agente > 0 ? await pasosDe(agente) : []
    const texto = respuestaFinal(pasos) ?? (typeof body?.texto === 'string' ? body.texto.slice(0, 20_000) : null)
    const tocados = archivosTocados(pasos)
    let piezas = await reunirEvidencia({ texto, cwd, escritos: tocados })
    // Modo directo (7 nov 2026): con la transmisión prendida no sale nada de una ruta sensible.
    if (piezas.some(p => rutaSensibleDirecto(p.ruta)) && await directoPrendido()) piezas = piezas.filter(p => !rutaSensibleDirecto(p.ruta))
    return Response.json({
      resumen: resumenHumano(texto),
      piezas,
      tecnico: {
        respuesta: texto,
        commits: commitsDe(texto),
        comandos: comandosDe(pasos),
        archivos: tocados.filter(r => !claseMedio(r)).slice(-20),
        bitacora: pasos.length > 0,
      },
    }, { headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}
