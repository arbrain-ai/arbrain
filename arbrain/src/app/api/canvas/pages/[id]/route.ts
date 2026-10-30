/**
 * Canvas v4 — leer, guardar y borrar UNA pagina.
 *
 * ⚠️ AQUI ESTA EL ARREGLO QUE HACE POSIBLE EL MULTI-DISPOSITIVO.
 *
 * En el v3, el guardado HUMANO (`PUT /state`) escribia `page_elements` y NO
 * tocaba `agent_version`. El canal de tiempo real, del otro lado, descartaba
 * todo evento cuya version entrante no fuera ESTRICTAMENTE MAYOR que la
 * conocida. Consecuencia exacta, verificable en su codigo: los cambios de un
 * humano en la laptop llegaban al iPad como evento y el iPad los TIRABA. El
 * unico escritor que se propagaba de verdad era el agente.
 *
 * O sea: "los mismos diagramas en laptop, iPad, telefono y Mac mini" nunca
 * funciono para lo que Daniel dibujaba con la mano. Aqui TODA escritura sube la
 * version, venga de quien venga, y por eso el espejo funciona.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { SCHEMA_V4 } from '@/features/canvas/model/schema'
import { migrarDesdeV3 } from '@/features/canvas/model/migrar-v3'
import { conArchivado, conFijado, GRUPO_GENERAL } from '@/features/canvas/state/organizacion'

export const runtime = 'nodejs'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db.from('draw')
    .select('page_id, name, folder_id, page_elements, agent_version, updated_at')
    .eq('page_id', id).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })

  const doc = data.page_elements as {
    schemaVersion?: number; elements?: unknown[]; camera?: unknown; theme?: string
  } | null
  const esV4 = doc?.schemaVersion === SCHEMA_V4

  if (esV4) {
    return NextResponse.json({ ok: true, pagina: {
      id: data.page_id, nombre: data.name, folderId: data.folder_id,
      version: data.agent_version ?? 0, actualizado: data.updated_at,
      esV4: true, elements: doc?.elements ?? [], camera: doc?.camera ?? null,
    } })
  }

  /**
   * PAGINA DEL CANVAS ANTERIOR: se convierte AL LEER, y no se escribe.
   *
   * La conversion vive en el servidor y produce elementos del v4 en memoria.
   * La fila NO se toca. Daniel abre la pagina, VE su contenido, y decide; solo
   * el gesto explicito de convertir la escribe.
   *
   * Reescribir 2,326 elementos suyos por el simple hecho de abrir una pagina
   * seria imperdonable — y el autoguardado lo haria en 700 ms si nadie lo
   * frena. Por eso el cliente recibe `esV4: false` y bloquea el guardado.
   */
  const { elements, informe } = migrarDesdeV3(doc?.elements ?? [])
  const cam = doc?.camera as { x?: number; y?: number; scale?: number; zoom?: number } | null
  return NextResponse.json({ ok: true, pagina: {
    id: data.page_id, nombre: data.name, folderId: data.folder_id,
    version: data.agent_version ?? 0, actualizado: data.updated_at,
    esV4: false, convertida: true, informe,
    /**
     * EL TEMA CON EL QUE SE DIBUJO.
     *
     * Sus paginas del v3 se hicieron en oscuro: los textos guardan colores
     * CLAROS horneados. Abrirlas en tema claro las deja practicamente en
     * blanco sobre blanco — se vio al abrir "El Sistema" y parecia que la
     * conversion habia perdido el texto, cuando el texto estaba entero.
     *
     * Es el mismo hecho que ya obligo a que la tinta del v4 NO hornee su
     * color, visto desde el otro lado: los literales del v3 ya estan
     * horneados y lo unico honesto es enseñarlos sobre el fondo para el que
     * se eligieron.
     */
    tema: doc?.theme === 'light' ? 'claro' : 'oscuro',
    elements,
    // El v3 llamaba `scale` a lo que el v4 llama `zoom`.
    camera: cam ? { x: cam.x ?? 0, y: cam.y ?? 0, zoom: cam.scale ?? cam.zoom ?? 1 } : null,
  } })
}

export async function PUT(request: Request, { params }: Ctx) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  // El tamaño se anota: un documento de 13 MB fue el amplificador del «error al guardar» del 5 oct.
  const bytes = Number(request.headers.get('content-length') ?? 0)
  const body = await request.json().catch(() => null) as
    { elements?: unknown[]; camera?: unknown; nombre?: string; folderId?: string | null; version?: number; baseVersion?: number } | null
  if (!body || !Array.isArray(body.elements)) {
    return NextResponse.json({ ok: false, error: 'falta elements' }, { status: 400 })
  }
  const db = createServiceClient()

  // Se lee la version ACTUAL del servidor, no se confia en la del cliente.
  // Y se lee TAMBIEN el documento, por la capa semantica — ver abajo.
  const { data: actual } = await db.from('draw')
    .select('agent_version, page_elements').eq('page_id', id).maybeSingle()
  if (!actual) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })

  /**
   * LA CARRERA DE ESCRITORES (3 oct 2026).
   *
   * sfmap guarda con guarda optimista (`agent_version=eq.v`); la web no, y un
   * guardado suyo que viajaba mientras sfmap escribia PISABA lo de sfmap y
   * saltaba la version por encima (la web ya no volvia a traerlo). Quien manda
   * `baseVersion` dice "escribo encima de ESTA version": si el servidor ya va
   * en otra, 409 con la actual y el cliente fusiona antes de reintentar.
   *
   * Sin `baseVersion` (el compilador, Levy, rutas viejas) se conserva el
   * comportamiento anterior: ultimo en escribir gana.
   */
  const base = typeof body.baseVersion === 'number' ? body.baseVersion : null
  const enServidor = actual.agent_version ?? 0
  if (base !== null && base !== enServidor) {
    console.warn('[canvas/PUT] choque', { pagina: id, base, enServidor, bytes })
    return NextResponse.json({ ok: false, conflicto: true, version: enServidor, error: 'la página cambió en otro lado' }, { status: 409 })
  }

  /**
   * ⚠️ LAS REGIONES SOBREVIVEN AL GUARDADO DE LA MANO.
   *
   * Esta ruta guarda la capa GEOMETRICA, que es lo unico que el navegador
   * conoce. La capa SEMANTICA —los specs de las regiones gobernadas— la
   * escribe el compilador; el cliente ni la manda ni la necesita.
   *
   * La primera version escribia `page_elements` ENTERO y por lo tanto borraba
   * `regions` en cada autoguardado. Medido: dos pasadas del compilador y la
   * region seguia en la version 1, porque un PUT intermedio la habia vaciado.
   * Consecuencia real: bastaba con que Daniel moviera UNA tarjeta para que el
   * diagrama olvidara su propio spec, y desde ahi el agente ya no podia
   * actualizarlo — solo rehacerlo desde cero, tirando todo lo fijado.
   *
   * Un guardado parcial que pisa lo que no conoce es la forma mas silenciosa
   * de perder datos: nada falla, solo desaparece una capa.
   */
  const previo = actual.page_elements as { regions?: unknown } | null

  const siguiente = (actual.agent_version ?? 0) + 1
  const parche: Record<string, unknown> = {
    page_elements: {
      schemaVersion: SCHEMA_V4,
      elements: body.elements,
      camera: body.camera ?? null,
      ...(previo?.regions ? { regions: previo.regions } : {}),
    },
    agent_version: siguiente,
    updated_at: new Date().toISOString(),
  }
  if (typeof body.nombre === 'string') parche.name = body.nombre
  if (body.folderId !== undefined) parche.folder_id = body.folderId

  // Con base, la guarda es ATOMICA como en sfmap: entre la lectura de arriba y
  // esta escritura otro pudo guardar; entonces el UPDATE no casa ninguna fila.
  let consulta = db.from('draw').update(parche).eq('page_id', id)
  if (base !== null) consulta = consulta.eq('agent_version', base)
  const { data, error } = await consulta.select('page_id')
  if (error) {
    console.error('[canvas/PUT] error al escribir', { pagina: id, bytes, error: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (base !== null && (!data || data.length === 0)) {
    console.warn('[canvas/PUT] choque atómico', { pagina: id, base, bytes })
    const { data: ahora } = await db.from('draw').select('agent_version').eq('page_id', id).maybeSingle()
    if (ahora) {
      return NextResponse.json({ ok: false, conflicto: true, version: ahora.agent_version ?? 0, error: 'la página cambió en otro lado' }, { status: 409 })
    }
  }
  // CERO FILAS ES UN ERROR. Nunca un exito silencioso — hecho de plataforma #26.
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'no se escribio ninguna fila' }, { status: 404 })
  }
  // AVISAR a los otros dispositivos. Ver la nota de `avisar` sobre por que el
  // aviso viaja por un canal publico y el documento no.
  void avisar(id, siguiente)
  return NextResponse.json({ ok: true, version: siguiente })
}

/**
 * Le dice a los demas dispositivos que esta pagina cambio.
 *
 * ⚠️ POR QUE NO ES `postgres_changes`. Esa fue la primera version y NO
 * FUNCIONABA, aunque el canal reportara `SUBSCRIBED`: `postgres_changes`
 * respeta RLS, y medido el 19 ago el rol anonimo consulta `draw` sin error y
 * recibe CERO filas. Un canal vivo que jamas entrega nada — otra vez el
 * actuador sin sensor, ahora en la infraestructura.
 *
 * La salida NO es abrir `draw` al rol publico: eso pondria los lienzos de
 * Daniel detras de una llave que viaja en el navegador. Se separa en dos:
 *
 *   · por el canal PUBLICO viaja solo "la pagina X va por la version N"
 *   · el DOCUMENTO se pide por la ruta autenticada, como todo lo demas
 *
 * Quien adivinara el nombre del canal aprenderia que algo cambio. Nada mas.
 */
async function avisar(paginaId: string, version: number): Promise<void> {
  const url = process.env.SUPABASE_URL_INTERNA || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: `canvas-v4:${paginaId}`, event: 'cambio', payload: { version } }] }),
    })
  } catch {
    // Que el aviso falle no puede tumbar el guardado: el dato YA esta en la
    // base. El otro dispositivo se enterara al abrir, no antes.
  }
}

/**
 * Fijar y archivar (5 oct 2026): solo `settings`. No toca el documento, no sube la version y no mueve `updated_at`
 * (fijar un lienzo no es editarlo: la lista por fecha no se reacomoda). Nada se borra: archivar es una marca.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json().catch(() => null) as { fijar?: boolean; grupo?: string; orden?: number; archivar?: boolean } | null
  if (!body || (typeof body.fijar !== 'boolean' && typeof body.archivar !== 'boolean')) {
    return NextResponse.json({ ok: false, error: 'falta fijar o archivar' }, { status: 400 })
  }
  const db = createServiceClient()
  const { data: fila, error: errL } = await db.from('draw').select('settings').eq('page_id', id).eq('is_deleted', false).maybeSingle()
  if (errL) return NextResponse.json({ ok: false, error: errL.message }, { status: 500 })
  if (!fila) return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
  let settings: Record<string, unknown> = (fila.settings && typeof fila.settings === 'object' ? fila.settings : {}) as Record<string, unknown>
  if (typeof body.fijar === 'boolean') settings = conFijado(settings, body.fijar, body.grupo?.trim() || GRUPO_GENERAL, Number.isFinite(body.orden) ? body.orden : 0)
  if (typeof body.archivar === 'boolean') settings = conArchivado(settings, body.archivar)
  const { data, error } = await db.from('draw').update({ settings }).eq('page_id', id).select('page_id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ ok: false, error: 'no se escribio ninguna fila' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: Ctx) {
  if (!await authenticateDraw3(request)) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const { id } = await params
  const db = createServiceClient()
  // Borrado BLANDO. Un lienzo tiene semanas de trabajo dentro y la papelera es
  // la diferencia entre un susto y una perdida.
  const { data, error } = await db.from('draw')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('page_id', id).select('page_id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
