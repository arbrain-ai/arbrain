import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createServiceClient } from '@/lib/supabase/service'
import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { instalacion } from '@/config'
import { aplicarCambio, claveAtomicos, conPropuesta, type Atomicos } from '@/lib/sistema/atomicos'

/** Identidad, señal y versión de 2 minutos de la fila «Hábitos de hoy» (reglas en `lib/sistema/atomicos.ts`). */
const headers = { 'Cache-Control': 'no-store' }
const RUTA_LOCAL = '.claude/plan/habitos-atomicos.json'

async function leer(owner: string): Promise<Partial<Atomicos> | null> {
  if (esEdicionCliente()) {
    const ruta = join(raizWorkspace(), RUTA_LOCAL)
    if (!existsSync(ruta)) return null
    try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null }
  }
  const { data, error } = await createServiceClient().from('app_config').select('value').eq('key', claveAtomicos(owner)).maybeSingle()
  if (error) throw new Error('No se pudieron leer tus principios de hábitos.')
  try { return data?.value ? JSON.parse(data.value) : null } catch { return null }
}

async function guardar(owner: string, doc: Atomicos) {
  if (esEdicionCliente()) {
    const ruta = join(raizWorkspace(), RUTA_LOCAL)
    mkdirSync(dirname(ruta), { recursive: true })
    writeFileSync(`${ruta}.tmp`, JSON.stringify(doc, null, 2), 'utf8'); renameSync(`${ruta}.tmp`, ruta)
    return
  }
  const { error } = await createServiceClient().from('app_config')
    .upsert({ key: claveAtomicos(owner), value: JSON.stringify(doc), updated_at: doc.actualizado }, { onConflict: 'key' })
  if (error) throw new Error('No se pudo guardar. Reintenta.')
}

export async function GET() {
  try {
    const owner = await planningOwner()
    return Response.json(conPropuesta(await leer(owner), instalacion().habitosAtomicos), { headers })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    const owner = await planningOwner()
    checkMutationOrigin(request)
    const raw = await request.text()
    if (raw.length > 4096) throw new ChatAccessError('Demasiado largo.', 413)
    let body: Record<string, unknown>
    try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error() }
    catch { throw new ChatAccessError('JSON inválido.', 400) }
    const actual = conPropuesta(await leer(owner), instalacion().habitosAtomicos)
    const siguiente = aplicarCambio(actual, body)
    if (typeof siguiente === 'string') throw new ChatAccessError(siguiente, 400)
    await guardar(owner, siguiente)
    return Response.json(siguiente, { headers })
  } catch (error) { return planningError(error) }
}
