import { spawn } from 'node:child_process'
import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { ErrorDocumento, resolverEnDisco } from '@/lib/cabina/documento-server'
import { esDescargable } from '@/lib/cabina/descarga-documento'
import { comandoAbrir, pedidoLocal } from '@/features/cabina/explorador/abrir-carpeta'
import { rutaSensibleDirecto } from '@/lib/modo-directo/reglas'
import { directoPrendido, respuestaOculta } from '@/lib/modo-directo/servidor'
import { tr } from '@/shared/i18n'

// «Abrir en su app» del visor (14 nov 2026, encargo del visor de documentos: «descargar y abrir con la app del sistema siguen
// a la mano»). POST { ruta } abre el ORIGINAL con la app predeterminada del sistema (Excel o Numbers, Word o Pages, Vista
// Previa). Las mismas reglas que pintarlo (resolverEnDisco: raíces permitidas, sin «..», sin credenciales, enlaces que no
// salen), solo los tipos que el visor enseña, el modo directo, y solo desde esta computadora (como «Abrir carpeta»: abrir
// Excel en el Studio desde el teléfono no tiene sentido). `spawn` con la ruta como un argumento, sin shell.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const falla = (error: string, status: number) => Response.json({ error }, { status, headers: NO_CACHE })

function lanzar(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false, windowsHide: false })
    hijo.once('error', reject)
    hijo.once('spawn', () => { hijo.unref(); resolve() })
  })
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    if (!pedidoLocal(request.headers)) return falla(tr('«Abrir en su app» solo funciona en la computadora donde corre Arbrain.'), 403)
    const body = await request.json().catch(() => null) as { ruta?: unknown } | null
    if (typeof body?.ruta !== 'string' || !body.ruta.trim()) return falla(tr('Falta ruta.'), 400)
    const doc = await resolverEnDisco(body.ruta)
    if (!esDescargable(doc.tipo)) return falla(tr('Ese tipo de archivo no se abre desde el visor.'), 403)
    if ((rutaSensibleDirecto(body.ruta) || rutaSensibleDirecto(doc.real)) && await directoPrendido()) return respuestaOculta('Ese archivo')
    const comando = comandoAbrir(process.platform, doc.real, process.env)
    if ('error' in comando) return falla(comando.error, 501)
    // En Windows, `explorer.exe <archivo>` lo abre con su app; en Mac, `open`; en Linux, `xdg-open`.
    try { await lanzar(comando.cmd, comando.args) } catch { return falla(tr('No encontré cómo abrir archivos ({cmd}) en esta computadora.', { cmd: comando.cmd }), 501) }
    return Response.json({ ok: true }, { headers: NO_CACHE })
  } catch (error) {
    if (error instanceof ErrorDocumento) return Response.json({ error: error.message }, { status: error.status, headers: NO_CACHE })
    return planningError(error)
  }
}
