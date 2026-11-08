import 'server-only'
/**
 * Marketing por canal · las lecturas del servidor (8 nov 2026). Dos fuentes, solo lectura y sin SQL libre:
 * - el archivo del sensor (`store/marketing-canales.json`, lo escribe `scripts/analytics/marketing_canales.py` en el Studio);
 * - los clics a la comunidad: `link_clicks` con sus enlaces `tracked_links` en el Supabase de SaaS Factory (createSFClient
 *   carga las llaves del servidor; al cliente solo llegan sumas).
 * Lo usan /api/negocio/marketing y Business Intelligence (vistas del canal, clics por video).
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createSFClient } from '@/lib/supabase/sf-client'
import { canalPulso, clicsPorCanal, leerMarketing, masDias, principalDe, RUTA_MARKETING, type ArchivoMarketing, type Enlace, type RespuestaMarketing } from './marketing'

const ZONA = 'America/Mexico_City'
const diaCivil = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
/** El último día cerrado en CDMX. */
export const ayerCDMX = () => masDias(diaCivil(new Date()), -1)

const cache = new Map<string, { en: number; valor: Promise<unknown> }>()
function memo<T>(clave: string, ms: number, f: () => Promise<T>): Promise<T> {
  const e = cache.get(clave)
  if (e && Date.now() - e.en < ms) return e.valor as Promise<T>
  const valor = f().catch(err => { cache.delete(clave); throw err })
  cache.set(clave, { en: Date.now(), valor })
  return valor
}

/** El archivo del sensor. null = no existe en esta máquina (vive en el Studio). */
export async function archivoMarketing(raiz: string | null): Promise<{ archivo: ArchivoMarketing | null; errores: string[] } | null> {
  const ruta = raiz ? path.join(raiz, ...RUTA_MARKETING) : null
  if (!ruta || !existsSync(ruta)) return null
  return memo(`marketing:${ruta}`, 60_000, async () => {
    try { return leerMarketing(JSON.parse(await readFile(ruta, 'utf8'))) } catch { return { archivo: null, errores: ['El archivo del sensor no es JSON válido.'] } }
  })
}

export interface Clic { link_id: string; dia: string }
/** Los enlaces rastreados y sus clics desde `desde` (día civil de CDMX), paginados. */
export async function enlacesYClics(desde: string): Promise<{ enlaces: Enlace[]; clics: Clic[] }> {
  return memo(`clics:${desde}`, 5 * 60_000, async () => {
    const sb = createSFClient()
    const { data: enlaces, error } = await sb.from('tracked_links').select('id,slug,source,campaign,metadata').limit(2000)
    if (error) throw new Error(`Los enlaces rastreados no respondieron: ${error.message}`)
    const clics: Clic[] = []
    // Medianoche de CDMX en UTC (UTC−6 todo el año desde 2022).
    const inicio = `${desde}T06:00:00Z`
    for (let pagina = 0; pagina < 60; pagina++) {
      const { data, error: e } = await sb.from('link_clicks').select('link_id,clicked_at').gte('clicked_at', inicio)
        .order('clicked_at', { ascending: true }).range(pagina * 1000, pagina * 1000 + 999)
      if (e) throw new Error(`Los clics de los enlaces no respondieron: ${e.message}`)
      for (const c of (data ?? []) as { link_id: string; clicked_at: string }[]) clics.push({ link_id: c.link_id, dia: diaCivil(new Date(c.clicked_at)) })
      if (!data || data.length < 1000) break
    }
    return { enlaces: (enlaces ?? []) as Enlace[], clics }
  })
}

const FUENTE_CLICS = 'Enlaces rastreados · clics a la comunidad'

/** La tarjeta Marketing por canal: el sensor más los clics en vivo. */
export async function marketing(raiz: string | null): Promise<Extract<RespuestaMarketing, { activo: true }>> {
  const leido = await archivoMarketing(raiz)
  if (!leido) return { activo: true, generado: null, canales: [], falta: 'El sensor de marketing todavía no corre en esta máquina (scripts/analytics/marketing_canales.py, en el Studio).' }
  if (!leido.archivo) return { activo: true, generado: null, canales: [], errores: leido.errores }
  const hasta = ayerCDMX()
  let porCanal: Map<string, Record<string, number>> | null = null, errorClics: string | undefined
  try {
    const { enlaces, clics } = await enlacesYClics(masDias(hasta, -13))
    porCanal = clicsPorCanal(enlaces, clics, hasta, principalDe(leido.archivo))
  } catch (e) { errorClics = e instanceof Error ? e.message : 'Los enlaces rastreados no respondieron.' }
  const canales = leido.archivo.canales.map(c => canalPulso(c, errorClics
    ? { porDia: null, hasta, fuente: FUENTE_CLICS, error: errorClics }
    : { porDia: porCanal?.get(c.id) ?? null, hasta, fuente: FUENTE_CLICS }))
  return { activo: true, generado: leido.archivo.generado, canales, ...(leido.errores.length ? { errores: leido.errores } : {}) }
}
