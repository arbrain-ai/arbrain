/**
 * Leer TODAS las filas de una consulta de PostgREST (5 nov 2026). PostgREST corta cada respuesta en `max-rows` (1000 en
 * Supabase): un `select` de movimientos sin paginar devolvía los primeros 1000 y la historia se acababa sin avisar.
 *
 * La primera página pide el conteo exacto; con él, las demás salen EN PARALELO (el GET tarda una vuelta más, no una por
 * página). Si el servidor corta antes de lo pedido, ese corte es el tamaño real de la página. Sin conteo, sigue en serie
 * hasta una página corta. Lógica pura: la consulta llega como función, así se prueba sin Supabase.
 */

export const TAM_PAGINA = 1000

export interface PaginaPostgrest<T> {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

/** `desde`/`hasta` inclusivos, como `.range()` de supabase-js. `contar` solo va en la primera. */
export type PedirPagina<T> = (desde: number, hasta: number, contar: boolean) => PromiseLike<PaginaPostgrest<T>>

export async function leerTodas<T>(
  pedir: PedirPagina<T>,
  { tam = TAM_PAGINA, clave }: { tam?: number; clave?: (fila: T) => string } = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  const primera = await pedir(0, tam - 1, true)
  if (primera.error) return { data: [], error: primera.error }
  const filas = [...(primera.data ?? [])]
  const total = primera.count ?? null

  if (total != null) {
    // El servidor puede cortar antes de `tam` (su max-rows): esa es la página real.
    const paso = filas.length > 0 && filas.length < tam && total > filas.length ? filas.length : tam
    const pedidos: PromiseLike<PaginaPostgrest<T>>[] = []
    for (let desde = filas.length; filas.length > 0 && desde < total; desde += paso) pedidos.push(pedir(desde, Math.min(total, desde + paso) - 1, false))
    const resto = await Promise.all(pedidos)
    for (const p of resto) {
      if (p.error) return { data: [], error: p.error }
      filas.push(...(p.data ?? []))
    }
  } else {
    let ultima = primera.data?.length ?? 0
    const paso = ultima
    while (paso > 0 && ultima === paso) {
      const p = await pedir(filas.length, filas.length + paso - 1, false)
      if (p.error) return { data: [], error: p.error }
      ultima = p.data?.length ?? 0
      filas.push(...(p.data ?? []))
    }
  }

  if (!clave) return { data: filas, error: null }
  // Una fila insertada entre páginas recorre el desplazamiento y repite una: se queda la primera vez que aparece.
  const vistas = new Set<string>()
  return { data: filas.filter(f => { const k = clave(f); if (vistas.has(k)) return false; vistas.add(k); return true }), error: null }
}
