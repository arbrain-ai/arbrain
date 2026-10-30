/**
 * Canvas v4 — compilar una region.
 *
 * El compilador corre SERVER-SIDE porque ahi vive la medicion real (fontkit
 * sobre los .ttf variables). El cliente manda SEMANTICA y recibe GEOMETRIA.
 *
 * Esta es la ruta que reemplaza a los generadores de Python: donde antes un
 * script calculaba coordenadas a mano y posteaba 80 ops por lote, ahora se
 * manda un spec y se recibe el diagrama resuelto.
 */

import { NextResponse } from 'next/server'
import { compileDiagram, compileMejorDireccion, type DiagramSpec } from '@/features/canvas/compile'
import { serverMeasureContext, uncoveredGlyphs } from '@/features/canvas/text/metrics-server'
import { elementsFromCompiled } from '@/features/canvas/model/from-compiled'
import { judge } from '@/features/canvas/audit/judge'
import { THEMES, coloresParaJuez, type ThemeName } from '@/features/canvas/theme/tokens'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { spec: DiagramSpec; regionId?: string; theme?: ThemeName; targetAspect?: number }
    if (!body?.spec?.nodes?.length) {
      return NextResponse.json({ ok: false, error: 'falta spec.nodes' }, { status: 400 })
    }

    const themeName: ThemeName = body.theme ?? 'claro'
    const t = THEMES[themeName]
    const opciones = {
      coverageCheck: (text: string) => uncoveredGlyphs(text, 'montserrat', 700),
      targetAspect: body.targetAspect,
    }
    /*
     * La direccion se ELIGE MIDIENDO, no por proporcion.
     *
     * Medido el 20 ago 2026 con los tres sistemas del negocio: la eleccion por
     * proporcion mandaba a horizontal, y horizontal daba 5, 4 y 6 flechas
     * atravesando texto donde vertical daba CERO. Una flecha por encima de una
     * frase obliga a releer; una proporcion imperfecta solo deja aire.
     */
    const { diagrama: compiled, direccion, defectos } = await compileMejorDireccion(
      serverMeasureContext, body.spec, opciones,
      d => judge(d, { theme: coloresParaJuez(t) })
        .findings.filter(f => f.metric === 'cruce-texto').length,
    )
    const regionId = body.regionId ?? 'r1'
    const elements = elementsFromCompiled(compiled, regionId, Date.now())

    // El juicio viaja CON el resultado. Quien consume esto se entera de que
    // salio mal en la misma respuesta, no tiene que acordarse de preguntar.
    const report = judge(compiled, { theme: coloresParaJuez(t) })

    return NextResponse.json({
      ok: true,
      elements,
      bounds: compiled.bounds,
      // La direccion se DICE: sin esto, "por que salio vertical" no tiene
      // respuesta y parece capricho del compilador.
      layout: { direccion, crucesDeTexto: defectos },
      judge: { ok: report.ok, stats: report.stats, findings: report.findings },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Falla RUIDOSO. Un compilador que devuelve geometria vacia con 200 es
    // peor que uno que falla: el consumidor cree que compilo bien.
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
