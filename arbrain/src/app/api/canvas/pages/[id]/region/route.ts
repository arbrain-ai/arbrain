/**
 * Canvas v4 — la puerta AI-FIRST.
 *
 * Daniel: *"recuerda ai first que tú puedas generar los sistemas con total
 * precisión"*.
 *
 * UN verbo: `compileRegion`. El agente manda SEMANTICA —nodos, relaciones,
 * roles— y esta ruta hace todo lo demas: mide el texto de verdad con fontkit,
 * compone, distribuye, rutea, audita, reconcilia contra lo que ya hay, guarda
 * y avisa a los otros dispositivos.
 *
 * Lo que reemplaza: los generadores de Python del v3, que calculaban
 * coordenadas a mano ("corredor derecho x~5470") y posteaban 80 operaciones por
 * lote. Cada iteracion era un borra-todo-y-vuelve-a-poner, y por eso tiraba
 * cualquier ajuste que Daniel hubiera hecho con la mano.
 *
 * ⚠️ EL SPEC SE GUARDA CON LA PAGINA. Sin eso, un agente puede generar un
 * diagrama una vez y jamas volver a tocarlo: la semantica se evapora al
 * terminar la peticion y lo unico que queda son cajas con coordenadas. Con el
 * spec guardado, la segunda pasada es un DIFF — actualiza lo que cambio,
 * agrega lo nuevo, borra lo que se fue, y NO TOCA lo que la mano fijo.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { compileMejorDireccion, type DiagramSpec } from '@/features/canvas/compile'
import { serverMeasureContext, uncoveredGlyphs } from '@/features/canvas/text/metrics-server'
import { elementsFromCompiled, reconcile, origenDeRegion, trasladar } from '@/features/canvas/model/from-compiled'
import { judge } from '@/features/canvas/audit/judge'
import { THEMES, coloresParaJuez, type ThemeName } from '@/features/canvas/theme/tokens'
import type { CanvasElement } from '@/features/canvas/model/element'
import { SCHEMA_V4 } from '@/features/canvas/model/schema'

export const runtime = 'nodejs'
interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json().catch(() => null) as
    { spec?: DiagramSpec; regionId?: string; theme?: ThemeName; targetAspect?: number } | null
  if (!body?.spec?.nodes?.length) {
    return NextResponse.json({ ok: false, error: 'falta spec.nodes' }, { status: 400 })
  }
  const regionId = body.regionId ?? 'principal'

  const db = createServiceClient()
  const { data: fila } = await db.from('draw')
    .select('page_elements, agent_version').eq('page_id', id).maybeSingle()
  if (!fila) return NextResponse.json({ ok: false, error: 'no existe la pagina' }, { status: 404 })

  const doc = fila.page_elements as {
    schemaVersion?: number; elements?: CanvasElement[]; camera?: unknown
    regions?: Array<{ id: string; spec: unknown; version: number }>
  } | null
  // Una pagina de otro esquema NO se convierte a la fuerza: se dice que no.
  // Interpretar geometria del v3 como si fuera del v4 llenaria el lienzo de
  // basura y nadie sabria de donde salio.
  if (doc && doc.schemaVersion !== undefined && doc.schemaVersion !== SCHEMA_V4) {
    return NextResponse.json({ ok: false, error: `la pagina es del esquema ${doc.schemaVersion}, no del 4` }, { status: 409 })
  }
  const existentes = doc?.elements ?? []

  const theme = THEMES[body.theme ?? 'claro']
  // La direccion se ELIGE MIDIENDO — la misma regla que en /compile, y por eso
  // vive en `compileMejorDireccion` y no escrita dos veces. Dos copias de este
  // criterio divergirian, y entonces el mismo spec saldria distinto segun la
  // puerta por la que entrara.
  const { diagrama: compilado, direccion, defectos } = await compileMejorDireccion(
    serverMeasureContext, body.spec,
    { coverageCheck: (text: string) => uncoveredGlyphs(text, 'montserrat', 700),
      targetAspect: body.targetAspect },
    d => judge(d, { theme: coloresParaJuez(theme) })
      .findings.filter(f => f.metric === 'cruce-texto').length,
  )
  const entrantes = elementsFromCompiled(compilado, regionId, Date.now())
  // DONDE va la region: deducido de lo que ya se materializo, o a la derecha de
  // todo lo demas si es la primera vez. Sin esto el diagrama se pinta sobre lo
  // que la mano tenia en (0,0).
  const origen = origenDeRegion(existentes, entrantes, regionId)
  const r = reconcile(existentes, trasladar(entrantes, origen), regionId)

  const regiones = [
    ...(doc?.regions ?? []).filter(x => x.id !== regionId),
    { id: regionId, spec: body.spec as unknown, version: (doc?.regions?.find(x => x.id === regionId)?.version ?? 0) + 1 },
  ]
  const siguiente = (fila.agent_version ?? 0) + 1
  const { data: escrito, error } = await db.from('draw').update({
    page_elements: { schemaVersion: SCHEMA_V4, elements: r.elements, camera: doc?.camera ?? null, regions: regiones },
    agent_version: siguiente,
    updated_at: new Date().toISOString(),
  }).eq('page_id', id).select('page_id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!escrito?.length) return NextResponse.json({ ok: false, error: 'no se escribio ninguna fila' }, { status: 404 })

  const url = process.env.SUPABASE_URL_INTERNA || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: `canvas-v4:${id}`, event: 'cambio', payload: { version: siguiente } }] }),
    }).catch(() => {})
  }

  // El DIFF se devuelve entero: quien llamo tiene que poder ver que cambio sin
  // comparar dos documentos. Y `fijados` no es un detalle — es la respuesta a
  // "¿por que esta tarjeta no se movio?".
  return NextResponse.json({
    ok: true, version: siguiente,
    // La direccion se DICE. Sin esto, "¿por que salio vertical?" no tiene
    // respuesta y parece capricho.
    layout: { direccion, crucesDeTexto: defectos },
    diff: { agregados: r.added, actualizados: r.updated, quitados: r.removed,
            fijados: r.keptPinned, bloqueados: r.bloqueados.length },
    // Pins cuyo nodo ya no existe en el spec: se conservan porque la mano los
    // toco, pero NO se pueden volver a actualizar. Se declaran en vez de
    // acumularse en silencio.
    pinsHuerfanos: r.orphanedPins,
    // Con candado: el compilador NO los toco. Quien llame tiene que poder
    // avisar antes de dar el diagrama por actualizado.
    bloqueados: r.bloqueados,
    judge: judge(compilado, { theme: coloresParaJuez(theme) }),
  })
}
