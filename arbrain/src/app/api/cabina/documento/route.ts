import path from 'node:path'
import { existsSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { ErrorDocumento, guardarTexto, hermanasImagen, leerEntrega, leerTexto, listarCarpeta, raices, resolverEnDisco, sondear, urlCruda, versionHead } from '@/lib/cabina/documento-server'
import { editable, resolverRuta, rutaPermitida } from '@/features/cabina/documento/ruta'
import { partirFrontmatter } from '@/features/cabina/documento/frontmatter'
import { registrarArchivo } from '@/lib/imagenes/optimizar'

// Vista «documento» del panel (3 oct 2026): lee un archivo permitido para pintarlo, lo guarda
// (solo .md/.txt, sin pisar cambios ajenos) y da la versión contra la que marcar cambios.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
// Imágenes rápidas (5 oct 2026): la ficha (hash, tamaño, color, placeholder) viaja con el documento y el panel pide
// la variante a su ancho. Si sharp no puede, la imagen se pinta tal cual por su URL cruda.
const ficha = (real: string) => registrarArchivo(real).catch(() => null)

function fallo(error: unknown) {
  if (error instanceof ErrorDocumento) return Response.json({ error: error.message }, { status: error.status, headers: NO_CACHE })
  return planningError(error)
}

/** `imagen:` del frontmatter: relativa al documento, si no al repo, o ~/ y absoluta. */
async function portada(imagen: string | undefined, real: string) {
  if (!imagen) return null
  const r = raices()
  const candidatas = imagen.startsWith('/') || imagen.startsWith('~/') ? [imagen] : [path.join(path.dirname(real), imagen), imagen]
  for (const c of candidatas) {
    const res = resolverRuta(c, r)
    if ('error' in res || !existsSync(res.abs)) continue
    const fin = await realpath(res.abs)
    if (!rutaPermitida(fin, r)) return { url: urlCruda(fin, path.dirname(fin)), imagen: await ficha(fin) }
  }
  return null
}

/** Un video con lo que el visor necesita antes de cargarlo: fps (pasos de fotograma exactos), proporción y duración. */
async function medio(real: string, pedida: string) {
  const [info, sonda] = await Promise.all([stat(real), sondear(real)])
  return { ruta: real, pedida, archivo: path.basename(real), url: urlCruda(real), sonda, hash: `${info.size}-${info.mtimeMs}`, mtime: info.mtime.toISOString() }
}

/** Una carpeta como entrega: lo que ella misma dice (entrega.json) o, si no, lo que se deduce por nombre. */
async function entrega(real: string) {
  const [{ items, recortado }, manifiesto] = await Promise.all([listarCarpeta(real), leerEntrega(real)])
  const conFicha = await Promise.all(items.map(async (it, n) => it.clase === 'imagen' && n < 80 ? { ...it, imagen: await ficha(it.ruta), url: urlCruda(it.ruta, real) } : it.clase === 'imagen' ? { ...it, url: urlCruda(it.ruta, real) } : it))
  return { items: conFicha, recortado, manifiesto }
}

export async function GET(request: Request) {
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const pedida = q.get('ruta')
    if (!pedida) throw new ErrorDocumento('Falta ruta.')
    const doc = await resolverEnDisco(pedida)
    const base = { ruta: pedida, archivo: path.basename(doc.real), tipo: doc.tipo, editable: editable(doc.tipo) }
    // Código y texto sin extensión conocida (8 oct 2026): solo con `codigo=1`, lo que pide el explorador de archivos, y solo
    // si es texto (sin bytes nulos) de hasta 1 MB. Se lee, nunca se edita: `editable` sigue en false.
    if (doc.tipo === 'codigo' || doc.tipo === 'otro') {
      if (q.get('codigo') !== '1') return Response.json(base, { headers: NO_CACHE })
      const leido = await leerTexto(doc.real)
      if (leido.texto.slice(0, 8000).includes('\0')) return Response.json({ ...base, binario: true }, { headers: NO_CACHE })
      return Response.json({ ...base, ...leido }, { headers: NO_CACHE })
    }
    if (doc.tipo === 'carpeta') return Response.json({ ...base, archivo: path.basename(doc.real), ...await entrega(doc.real) }, { headers: NO_CACHE })
    if (doc.tipo === 'video') {
      const otras = [q.get('comparar'), ...q.getAll('version')].filter((x): x is string => !!x)
      const quiero = [doc.real]
      const versiones: Array<Awaited<ReturnType<typeof medio>> | { ruta: string; archivo: string; error: string }> = [await medio(doc.real, pedida)]
      for (const o of otras) {
        try {
          const v = await resolverEnDisco(o)
          if (v.tipo !== 'video') throw new ErrorDocumento('Solo se comparan videos con videos.')
          if (!quiero.includes(v.real)) { quiero.push(v.real); versiones.push(await medio(v.real, o)) }
        } catch (e) { versiones.push({ ruta: o, archivo: path.basename(o), error: e instanceof Error ? e.message : 'No se pudo abrir esta versión.' }) }
      }
      const info = await stat(doc.real)
      return Response.json({ ...base, url: urlCruda(doc.real), mtime: info.mtime.toISOString(), hash: `${info.size}-${info.mtimeMs}`, versiones }, { headers: NO_CACHE })
    }
    if (doc.tipo === 'imagen' || doc.tipo === 'audio' || doc.tipo === 'pdf' || doc.tipo === 'html') {
      const info = await stat(doc.real)
      const imagen = doc.tipo === 'imagen' ? await ficha(doc.real) : undefined
      const extra: Record<string, unknown> = {}
      if (doc.tipo === 'imagen') {
        const hermanas = await hermanasImagen(doc.real)
        const i = Math.max(0, hermanas.findIndex(h => h.ruta === doc.real))
        const ventana = hermanas.slice(Math.max(0, i - 12), i + 13)
        extra.hermanas = await Promise.all(ventana.map(async h => ({ nombre: h.nombre, ruta: h.ruta, url: urlCruda(h.ruta, path.dirname(h.ruta)), imagen: await ficha(h.ruta) })))
        extra.totalHermanas = hermanas.length
        const otra = q.get('comparar')
        if (otra) {
          try { const v = await resolverEnDisco(otra); if (v.tipo !== 'imagen') throw new ErrorDocumento('Solo se comparan imágenes con imágenes.'); extra.comparada = { ruta: v.real, archivo: path.basename(v.real), url: urlCruda(v.real), imagen: await ficha(v.real) } }
          catch (e) { extra.comparada = { error: e instanceof Error ? e.message : 'No se pudo abrir la otra imagen.' } }
        }
      }
      if (doc.tipo === 'audio') extra.sonda = await sondear(doc.real)
      return Response.json({ ...base, url: urlCruda(doc.real), imagen, bytes: info.size, mtime: info.mtime.toISOString(), hash: `${info.size}-${info.mtimeMs}`, ...extra }, { headers: NO_CACHE })
    }
    const leido = await leerTexto(doc.real)
    const { datos } = doc.tipo === 'md' ? partirFrontmatter(leido.texto) : { datos: {} as Record<string, string> }
    const comparar = q.get('comparar')
    let comparado: { texto: string; etiqueta: string } | { error: string } | undefined
    if (comparar === 'HEAD') {
      const texto = await versionHead(doc.real)
      comparado = texto == null ? { error: 'Ese archivo no tiene versión en git (HEAD) para comparar.' } : { texto, etiqueta: 'el último commit' }
    } else if (comparar) {
      try { const otra = await resolverEnDisco(comparar); comparado = editable(otra.tipo) ? { texto: (await leerTexto(otra.real)).texto, etiqueta: path.basename(otra.real) } : { error: 'Solo se comparan .md y .txt.' } }
      catch (e) { comparado = { error: e instanceof Error ? e.message : 'No se pudo leer la otra versión.' } }
    }
    const tapa = await portada(datos.imagen, doc.real)
    return Response.json({ ...base, ...leido, frontmatter: datos, portada: tapa?.url ?? null, portadaImagen: tapa?.imagen ?? null, comparado }, { headers: NO_CACHE })
  } catch (error) { return fallo(error) }
}

export async function PUT(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as { ruta?: unknown; texto?: unknown; base?: unknown } | null
    if (!body || typeof body.ruta !== 'string' || typeof body.texto !== 'string' || typeof body.base !== 'string') throw new ErrorDocumento('Se espera { ruta, texto, base }.')
    const doc = await resolverEnDisco(body.ruta)
    if (!editable(doc.tipo)) throw new ErrorDocumento('Desde el panel solo se editan .md y .txt.', 403)
    const r = await guardarTexto(doc.real, body.texto, body.base)
    if (r.conflicto) return Response.json({ error: 'El archivo cambió mientras editabas.', conflicto: true }, { status: 409, headers: NO_CACHE })
    return Response.json({ ok: true, hash: r.hash, mtime: r.mtime }, { headers: NO_CACHE })
  } catch (error) { return fallo(error) }
}
