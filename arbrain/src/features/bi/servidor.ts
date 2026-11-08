import 'server-only'
/**
 * Business Intelligence · los ejecutores del catálogo (7 nov 2026). Cada consulta del catálogo tiene aquí UNA lectura fija,
 * solo de lectura, con sus parámetros validados: nada de SQL libre. Las llaves viven en el servidor (createSFClient carga
 * `arbrain/server/.env`); el cliente solo recibe números agregados.
 *
 * - metricas: `daily_business_metrics` (una fila por día de CDMX). Las columnas de cobro (active_subs, churned, mrr_cents)
 *   solo valen en filas conciliadas con Polar (`polar_reconciled_at` y mrr > 0): sin conciliar es «sin medir», nunca 0.
 * - polar: el libro de órdenes que concilia `sales_reconcile.py` (Polar es la fuente del dinero y de la atribución por video).
 *   Si el libro tiene más de 6 h, se pide al daemon que lo refresque en segundo plano y se responde con lo que hay, fechado.
 * - eventos: `funnel_events` (`about_page_view`), personas distintas por día (ip_hash) agrupadas por país.
 * - youtube (8 nov): el archivo del sensor de marketing (`store/marketing-canales.json`), vistas por día del canal principal.
 * - enlaces (8 nov): `link_clicks` con sus `tracked_links`; el video sale de `youtube_videos.link_slug` o de la campaña.
 * - netas (8 nov): altas del libro de Polar (órdenes de entrada) menos bajas de las métricas conciliadas, por día.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createSFClient } from '@/lib/supabase/sf-client'
import { instalacion } from '@/config'
import { CLAUDECLAW_TOKEN, getSchedulerUrl } from '@/lib/claudeclaw'
import { archivoMarketing, enlacesYClics } from '@/features/negocio/marketing-servidor'
import { canalDeEnlace, principalDe } from '@/features/negocio/marketing'
import { consultaDe, type Ventana } from './catalogo'
import { HISTORIA, sumarDias, type Barra, type Datos, type Punto, type RespuestaConsulta } from './modelo'

const ZONA = 'America/Mexico_City'
export const diaCivil = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
/** El último día cerrado en CDMX (ayer). */
export const ayer = (ahora = new Date()) => sumarDias(diaCivil(ahora), -1)

// ── metricas ──

const COLUMNAS = ['date', 'about_page_views', 'cta_clicks', 'checkout_views', 'plans_selected', 'signups', 'onboarding_completed',
  'youtube_visits', 'direct_visits', 'desktop_visits', 'mobile_visits', 'tablet_visits', 'active_members', 'daily_lessons_completed',
  'active_subs', 'churned', 'mrr_cents', 'polar_reconciled_at'] as const
type Fila = Partial<Record<(typeof COLUMNAS)[number], number | string | null>> & { date: string }

const cache = new Map<string, { en: number; valor: Promise<unknown> }>()
function memo<T>(clave: string, ms: number, f: () => Promise<T>): Promise<T> {
  const e = cache.get(clave)
  if (e && Date.now() - e.en < ms) return e.valor as Promise<T>
  const valor = f().catch(err => { cache.delete(clave); throw err })
  cache.set(clave, { en: Date.now(), valor })
  return valor
}

async function filas(desde: string): Promise<Fila[]> {
  return memo(`metricas:${desde}`, 5 * 60_000, async () => {
    const { data, error } = await createSFClient().from('daily_business_metrics').select(COLUMNAS.join(',')).gte('date', desde).order('date', { ascending: true }).limit(400)
    if (error) throw new Error(`Las métricas diarias no respondieron: ${error.message}`)
    return (data ?? []) as unknown as Fila[]
  })
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : null)
const conciliada = (f: Fila) => !!f.polar_reconciled_at && (num(f.mrr_cents) ?? 0) > 0

/** Una serie diaria continua de `desde` a `hasta`: el día que falta o no se midió va en null. */
function serieDe(rows: Fila[], desde: string, hasta: string, valor: (f: Fila) => number | null): Punto[] {
  const por = new Map(rows.map(f => [f.date.slice(0, 10), f]))
  const out: Punto[] = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) { const f = por.get(d); out.push({ fecha: d, valor: f ? valor(f) : null }) }
  return out
}
const suma = (rows: Fila[], col: (typeof COLUMNAS)[number]) => rows.reduce((s, f) => s + (num(f[col]) ?? 0), 0)

async function metricas(id: string, ventana: Ventana): Promise<{ datos: Datos; hasta: string }> {
  const hoyMenos1 = ayer()
  const desde = sumarDias(hoyMenos1, -(ventana + HISTORIA - 1))
  const rows = (await filas(desde)).filter(f => f.date.slice(0, 10) <= hoyMenos1)
  const hasta = rows.length ? rows[rows.length - 1].date.slice(0, 10) : hoyMenos1
  const enVentana = rows.filter(f => f.date.slice(0, 10) > sumarDias(hasta, -ventana))
  const s = (col: (typeof COLUMNAS)[number]) => serieDe(rows, desde, hasta, f => num(f[col]))
  const cobro = (col: 'active_subs' | 'churned') => serieDe(rows, desde, hasta, f => (conciliada(f) ? num(f[col]) : null))
  switch (id) {
    case 'visitas': return { datos: { forma: 'serie', puntos: s('about_page_views') }, hasta }
    case 'clics': return { datos: { forma: 'serie', puntos: s('cta_clicks') }, hasta }
    case 'comunidad': return { datos: { forma: 'serie', puntos: s('active_members') }, hasta }
    case 'lecciones': return { datos: { forma: 'serie', puntos: s('daily_lessons_completed') }, hasta }
    case 'suscriptores': return { datos: { forma: 'serie', puntos: cobro('active_subs') }, hasta }
    case 'bajas': return { datos: { forma: 'serie', puntos: cobro('churned') }, hasta }
    case 'mrr': return { datos: { forma: 'serie', puntos: serieDe(rows, desde, hasta, f => (conciliada(f) ? (num(f.mrr_cents) as number) / 100 : null)) }, hasta }
    case 'dispositivo': return { datos: { forma: 'barras', barras: [
      { id: 'mobile', etiqueta: 'Teléfono', valor: suma(enVentana, 'mobile_visits') },
      { id: 'desktop', etiqueta: 'Computadora', valor: suma(enVentana, 'desktop_visits') },
      { id: 'tablet', etiqueta: 'Tableta', valor: suma(enVentana, 'tablet_visits') },
    ] }, hasta }
    case 'origen': return { datos: { forma: 'barras', barras: [
      { id: 'youtube', etiqueta: 'YouTube', valor: suma(enVentana, 'youtube_visits') },
      { id: 'directo', etiqueta: 'Directo (sin origen)', valor: suma(enVentana, 'direct_visits') },
    ] }, hasta }
    case 'embudo-web': return { datos: { forma: 'embudo', pasos: [
      { id: 'about', etiqueta: 'Vieron la página', valor: suma(enVentana, 'about_page_views') },
      { id: 'cta', etiqueta: 'Tocaron comprar', valor: suma(enVentana, 'cta_clicks') },
      { id: 'checkout', etiqueta: 'Abrieron el pago', valor: suma(enVentana, 'checkout_views') },
      { id: 'plan', etiqueta: 'Eligieron plan', valor: suma(enVentana, 'plans_selected') },
      { id: 'signup', etiqueta: 'Se registraron', valor: suma(enVentana, 'signups') },
      { id: 'onboarding', etiqueta: 'Terminaron el onboarding', valor: suma(enVentana, 'onboarding_completed') },
    ] }, hasta }
  }
  throw new Error(`La consulta «${id}» no es de las métricas diarias.`)
}

// ── polar (el libro de órdenes conciliado) ──

interface Orden { createdAt: string; kind: string; currency: string; retainedCents: number; videoId: string | null }
interface Libro { asOf: string; refreshedAt?: string; catalog: { video_id: string; title: string }[]; orders: Orden[] }

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
/** La raíz del cerebro: la primera que tiene `.claude/memory/MEMORY.md` (igual que /api/negocio). */
export const raizCerebro = () => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

const RUTA_LIBRO = ['arbrain', 'server', 'store', 'sales-reconciliation', 'ledger.json']
let refrescando: Promise<unknown> | null = null
/** Pide al daemon el refresco del libro (sales_reconcile.py consulta Polar si tiene más de 15 min). No se espera. */
function refrescarLibro() {
  if (refrescando) return
  refrescando = (async () => {
    const url = await getSchedulerUrl()
    await fetch(`${url}/analytics/sales?days=7`, { headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(600_000) })
  })().catch(() => null).finally(() => { setTimeout(() => { refrescando = null }, 10 * 60_000) })
}

async function libro(raiz: string | null): Promise<Libro> {
  const ruta = raiz ? path.join(raiz, ...RUTA_LIBRO) : null
  if (!ruta || !existsSync(ruta)) throw new Error('El libro de ventas de Polar no está en esta máquina (vive en el Studio).')
  return memo(`libro:${ruta}`, 60_000, async () => {
    const l = JSON.parse(await readFile(ruta, 'utf8')) as Libro
    if (!Array.isArray(l.orders) || typeof l.asOf !== 'string') throw new Error('El libro de ventas no tiene la forma esperada.')
    const edad = Date.now() - Date.parse(l.refreshedAt ?? l.asOf)
    if (!(edad < 6 * 3600_000)) refrescarLibro()
    return l
  })
}

async function polar(id: string, ventana: Ventana, raiz: string | null): Promise<{ datos: Datos; hasta: string; aviso?: string }> {
  const l = await libro(raiz)
  const corte = new Date(l.asOf)
  // El último día que el libro cubre completo: el anterior al día del corte.
  const hasta = sumarDias(diaCivil(corte), -1)
  const dia = (o: Orden) => diaCivil(new Date(o.createdAt))
  const usd = l.orders.filter(o => o.currency === 'USD' && dia(o) <= hasta)
  const viejo = Date.now() - Date.parse(l.asOf) > 36 * 3600_000
  const aviso = viejo ? `Polar conciliado al ${diaCivil(corte)}; se está actualizando.` : undefined
  // Hoy todo cobra en USD; si un día entra otra moneda, se dice en vez de sumarla mal.
  const otra = l.orders.some(o => o.currency !== 'USD') ? 'Hay cobros en otra moneda que esta gráfica no suma.' : undefined
  return { datos: polarUSD(id, ventana, usd, hasta, l), hasta, aviso: [aviso, otra].filter(Boolean).join(' ') || undefined }
}

function polarUSD(id: string, ventana: Ventana, ordenes: Orden[], hasta: string, l: Libro): Datos {
  const dia = (o: Orden) => diaCivil(new Date(o.createdAt))
  if (id === 'altas' || id === 'cobrado') {
    const desde = id === 'cobrado' ? `${sumarDias(`${hasta.slice(0, 7)}-01`, -1).slice(0, 7)}-01` : sumarDias(hasta, -(ventana + HISTORIA - 1))
    const por = new Map<string, number>()
    for (const o of ordenes) {
      const d = dia(o)
      if (d < desde) continue
      if (id === 'altas' && o.kind !== 'new') continue
      if (id === 'cobrado' && o.kind === 'zero') continue
      por.set(d, (por.get(d) ?? 0) + (id === 'altas' ? 1 : o.retainedCents / 100))
    }
    const puntos: Punto[] = []
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) puntos.push({ fecha: d, valor: Math.round((por.get(d) ?? 0) * 100) / 100 })
    return { forma: 'serie', puntos }
  }
  if (id === 'ventas-por-video') {
    const desde = sumarDias(hasta, -(ventana - 1))
    const titulo = new Map(l.catalog.map(v => [v.video_id, v.title]))
    const por = new Map<string, number>()
    let sinVideo = 0
    for (const o of ordenes) {
      if (o.kind !== 'new' || dia(o) < desde) continue
      if (!o.videoId) { sinVideo++; continue }
      por.set(o.videoId, (por.get(o.videoId) ?? 0) + 1)
    }
    const barras: Barra[] = [...por].map(([v, n]) => ({ id: v, etiqueta: titulo.get(v) ?? v, valor: n })).sort((a, b) => b.valor - a.valor).slice(0, 8)
    return { forma: 'barras', barras, resto: { id: 'sin-video', etiqueta: 'Sin video (sin enlace rastreado)', valor: sinVideo } }
  }
  throw new Error(`La consulta «${id}» no es de Polar.`)
}

// ── eventos ──

async function paises(ventana: Ventana): Promise<{ datos: Datos; hasta: string }> {
  const hasta = ayer()
  const desde = sumarDias(hasta, -(ventana - 1))
  const conteo = await memo(`paises:${desde}`, 10 * 60_000, async () => {
    const sb = createSFClient()
    const vistos = new Set<string>()
    const por = new Map<string, number>()
    // Medianoche de CDMX en UTC (UTC−6 todo el año desde 2022).
    const inicio = `${desde}T06:00:00Z`, fin = `${sumarDias(hasta, 1)}T06:00:00Z`
    for (let pagina = 0; pagina < 60; pagina++) {
      const { data, error } = await sb.from('funnel_events').select('country,ip_hash,created_at').eq('event_name', 'about_page_view')
        .gte('created_at', inicio).lt('created_at', fin).order('created_at', { ascending: true }).range(pagina * 1000, pagina * 1000 + 999)
      if (error) throw new Error(`Los eventos del embudo no respondieron: ${error.message}`)
      for (const e of (data ?? []) as { country: string | null; ip_hash: string | null; created_at: string }[]) {
        const clave = `${diaCivil(new Date(e.created_at))}:${e.ip_hash ?? e.created_at}`
        if (vistos.has(clave)) continue
        vistos.add(clave)
        const pais = e.country?.trim() || 'Sin país'
        por.set(pais, (por.get(pais) ?? 0) + 1)
      }
      if (!data || data.length < 1000) break
    }
    return [...por]
  })
  const nombres = new Intl.DisplayNames(['es-MX'], { type: 'region' })
  const nombre = (p: string) => { try { return /^[A-Z]{2}$/.test(p) ? nombres.of(p) ?? p : p } catch { return p } }
  // Sin país no es un país: va aparte, como lo que la fuente no registró.
  const sinPais = conteo.find(([p]) => p === 'Sin país')?.[1] ?? 0
  const barras = conteo.filter(([p]) => p !== 'Sin país').map(([p, n]) => ({ id: p, etiqueta: nombre(p), valor: n })).sort((a, b) => b.valor - a.valor)
  const top = barras.slice(0, 8), otros = barras.slice(8).reduce((s, b) => s + b.valor, 0)
  const resto = otros || sinPais ? { id: 'otros', etiqueta: sinPais && !otros ? 'Sin país registrado' : 'Otros países o sin país', valor: otros + sinPais } : undefined
  return { datos: { forma: 'barras', barras: top, ...(resto ? { resto } : {}) }, hasta }
}

// ── youtube (el sensor de marketing) ──

async function vistasCanal(ventana: Ventana, raiz: string | null): Promise<{ datos: Datos; hasta: string; aviso?: string }> {
  const leido = await archivoMarketing(raiz)
  if (!leido) throw new Error('El sensor de marketing no está en esta máquina (vive en el Studio).')
  const canal = leido.archivo?.canales.find(c => c.clave === 'principal')
  const a = canal?.analytics
  if (!a || !a.hasta) throw new Error(canal?.error ? `El sensor no pudo leer el canal: ${canal.error}` : 'El sensor todavía no trae vistas del canal.')
  const desde = sumarDias(a.hasta, -(ventana + HISTORIA - 1))
  const por = new Map(a.dias.map(d => [d.fecha, d.vistas]))
  const puntos: Punto[] = []
  for (let d = desde; d <= a.hasta; d = sumarDias(d, 1)) puntos.push({ fecha: d, valor: por.get(d) ?? null })
  const atraso = sumarDias(ayer(), -3) > a.hasta ? `El sensor llega al ${a.hasta}; YouTube no ha dado días más nuevos.` : undefined
  return { datos: { forma: 'serie', puntos }, hasta: a.hasta, ...(atraso ? { aviso: atraso } : {}) }
}

// ── enlaces (clics a la comunidad) ──

async function clicsPorVideo(ventana: Ventana, raiz: string | null): Promise<{ datos: Datos; hasta: string }> {
  const hasta = ayer()
  const principal = principalDe((await archivoMarketing(raiz))?.archivo)
  const desde = sumarDias(hasta, -(ventana - 1))
  const [{ enlaces, clics }, videos] = await Promise.all([enlacesYClics(desde), memo('videos', 30 * 60_000, async () => {
    const { data, error } = await createSFClient().from('youtube_videos').select('video_id,title,link_slug').limit(2000)
    if (error) throw new Error(`Los videos no respondieron: ${error.message}`)
    return (data ?? []) as { video_id: string; title: string; link_slug: string | null }[]
  })])
  const porSlug = new Map(videos.filter(v => v.link_slug).map(v => [v.link_slug!, v]))
  const porId = new Map(videos.map(v => [v.video_id, v]))
  // El video de cada enlace: el que lo declara en su link_slug, o el de su campaña si es un id de video conocido.
  const videoDe = new Map(enlaces.filter(e => canalDeEnlace(e, principal)).map(e => [e.id, porSlug.get(e.slug) ?? (e.campaign ? porId.get(e.campaign) : undefined) ?? null]))
  const por = new Map<string, number>()
  let sinVideo = 0
  for (const c of clics) {
    if (c.dia < desde || c.dia > hasta || !videoDe.has(c.link_id)) continue
    const v = videoDe.get(c.link_id)
    if (!v) { sinVideo++; continue }
    por.set(v.video_id, (por.get(v.video_id) ?? 0) + 1)
  }
  const barras: Barra[] = [...por].map(([id, n]) => ({ id, etiqueta: porId.get(id)?.title ?? id, valor: n })).sort((a, b) => b.valor - a.valor).slice(0, 8)
  return { datos: { forma: 'barras', barras, ...(sinVideo ? { resto: { id: 'sin-video', etiqueta: 'Enlaces sin video identificado', valor: sinVideo } } : {}) }, hasta }
}

// ── netas (altas de Polar menos bajas conciliadas) ──

async function altasNetas(ventana: Ventana, raiz: string | null): Promise<{ datos: Datos; hasta: string; aviso?: string }> {
  const [l, m] = await Promise.all([libro(raiz), metricas('bajas', ventana)])
  // El último día que cubren las dos fuentes: el libro (día anterior a su corte) y las métricas conciliadas.
  const hastaLibro = sumarDias(diaCivil(new Date(l.asOf)), -1)
  const hasta = hastaLibro < m.hasta ? hastaLibro : m.hasta
  const altas = new Map<string, number>()
  for (const o of l.orders) if (o.kind === 'new') { const d = diaCivil(new Date(o.createdAt)); altas.set(d, (altas.get(d) ?? 0) + 1) }
  if (m.datos.forma !== 'serie') throw new Error('Las bajas no llegaron como serie.')
  const puntos: Punto[] = m.datos.puntos.filter(p => p.fecha <= hasta).map(p => ({ fecha: p.fecha, valor: p.valor === null ? null : (altas.get(p.fecha) ?? 0) - p.valor }))
  const viejo = Date.now() - Date.parse(l.asOf) > 36 * 3600_000
  return { datos: { forma: 'serie', puntos }, hasta, ...(viejo ? { aviso: `Polar conciliado al ${diaCivil(new Date(l.asOf))}; se está actualizando.` } : {}) }
}

/** Corre UNA consulta del catálogo con su ventana. Lo que no está en el catálogo no se corre. */
export async function ejecutar(id: string, ventana: Ventana, raiz: string | null): Promise<RespuestaConsulta> {
  const c = consultaDe(id)
  if (!c) throw new Error(`«${id}» no está en el catálogo.`)
  if (!c.ventanas.includes(ventana)) throw new Error(`«${id}» se consulta en ${c.ventanas.join(', ')} días.`)
  const r: { datos: Datos; hasta: string; aviso?: string } =
    c.familia === 'metricas' ? await metricas(id, ventana)
    : c.familia === 'polar' ? await polar(id, ventana, raiz)
    : c.familia === 'youtube' ? await vistasCanal(ventana, raiz)
    : c.familia === 'enlaces' ? await clicsPorVideo(ventana, raiz)
    : c.familia === 'netas' ? await altasNetas(ventana, raiz)
    : await paises(ventana)
  return { ok: true, consulta: id, ventana, datos: r.datos, hasta: r.hasta, leidoEn: new Date().toISOString(), ...(r.aviso ? { aviso: r.aviso } : {}) }
}
