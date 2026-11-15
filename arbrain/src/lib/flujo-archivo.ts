/**
 * Enviar un archivo del disco por partes (12 nov 2026: lo compartían copiado la ruta `crudo` del visor y la de archivos del
 * chat; ahora también la descarga del visor). Nunca se carga entero: un video de 700 MB sale en trozos de 64 KB.
 */
import { createReadStream } from 'node:fs'

/** Un archivo como flujo web que tolera que el navegador cancele a medias (un video que salta de un punto a otro cancela
 *  la petición anterior cada vez): con `Readable.toWeb` eso lanzaba «Controller is already closed» como excepción sin atrapar. */
export function flujoArchivo(ruta: string, rango?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const rs = createReadStream(ruta, rango)
  return new ReadableStream<Uint8Array>({
    start(c) {
      rs.on('data', chunk => { try { c.enqueue(chunk as Buffer); if ((c.desiredSize ?? 1) <= 0) rs.pause() } catch { rs.destroy() } })
      rs.on('end', () => { try { c.close() } catch { /* ya cancelado */ } })
      rs.on('error', e => { try { c.error(e) } catch { /* ya cancelado */ } })
    },
    pull() { rs.resume() },
    cancel() { rs.destroy() },
  })
}

/**
 * La cabecera `Range` (un solo tramo, `bytes=ini-fin`, `bytes=ini-` o `bytes=-sufijo`) contra el tamaño del archivo.
 * null = no pidió tramo (va entero); 'fuera' = tramo imposible (416); si no, los bytes inclusivos a mandar.
 */
export function rangoPedido(cabecera: string | null, bytes: number): { start: number; end: number } | 'fuera' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((cabecera ?? '').trim())
  if (!m || (!m[1] && !m[2])) return null
  const start = m[1] ? Number(m[1]) : Math.max(0, bytes - Number(m[2]))
  const end = m[1] && m[2] ? Math.min(Number(m[2]), bytes - 1) : bytes - 1
  if (start >= bytes || start > end) return 'fuera'
  return { start, end }
}
