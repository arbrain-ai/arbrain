/**
 * Navegador para las manos.
 *
 *   - `navegar`: abre una URL por comando (`open -g -na <navegador> --args --new-window`), en una
 *     ventana NUEVA y en segundo plano. No usa la barra de direcciones (el Enter por proceso no
 *     navega: falla real del 2 oct) ni toca las pestañas de Daniel. La ventana queda como propia
 *     de la sesión: es la única que las manos pueden cerrar al terminar.
 *   - `Vigia`: envuelve al adaptador. Si una acción en un navegador deja la página en un video
 *     (YouTube, Vimeo), lo silencia y lo pausa en el MISMO paso, antes de devolver el resultado
 *     (regla de Daniel: investigar video por transcript; un watch abierto se pausa y se silencia).
 */
import { esEdicionCliente } from '../edicion.js'
import { dominioProtegido } from './juicio-url.js'
import { execFile } from 'node:child_process'
import type { Adaptador, App, ContextoAccion, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoNavegar, PedidoObservar, ResultadoAccion, ResultadoMedios, ResultadoNavegar, ResultadoVerificar, Ventana } from './contrato.js'

export const NAVEGADORES: Record<string, { bundle: string; app: string; exe: string }> = {
  chrome: { bundle: 'com.google.Chrome', app: 'Google Chrome', exe: 'chrome' },
  brave: { bundle: 'com.brave.Browser', app: 'Brave Browser', exe: 'brave' },
  edge: { bundle: 'com.microsoft.edgemac', app: 'Microsoft Edge', exe: 'msedge' },
}
/** macOS (bundle id) y Windows (ejecutable). */
const BUNDLES_NAVEGADOR = new Set(Object.values(NAVEGADORES).flatMap(n => [n.bundle.toLowerCase(), n.exe]))

/** Páginas que reproducen video o audio solas al abrir. */
export const esVideo = (url?: string) => !!url && /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com\/(watch|shorts\/|live\/)|youtu\.be\/|vimeo\.com\/\d|music\.youtube\.com\/watch|twitch\.tv\/[^/?#]+|tiktok\.com\/@[^/]+\/video|instagram\.com\/(reel|reels)\/|(x|twitter)\.com\/[^/]+\/status\/|netflix\.com\/watch|open\.spotify\.com\/(track|episode))/i.test(url)

/** URLs que hacen algo con solo abrirlas (GET con efecto): pasan por el freno como cualquier acción. */
export const URL_CON_EFECTO = /\/(log-?out|sign-?out|salir|delete|remove|unsubscribe|cancel|checkout|pay|purchase|buy|intent\/(tweet|post)|share|sharer|compose|send)\b|[?&](action|do)=(delete|remove|logout|pay|send)/i

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

function abrirPorComando(app: string, url: string, nueva: boolean): Promise<void> {
  const args = nueva ? ['-g', '-n', '-a', app, '--args', '--new-window', url] : ['-g', '-a', app, url]
  return new Promise((ok, mal) => execFile('open', args, { timeout: 15_000 }, e => (e ? mal(e) : ok())))
}

export function validarUrl(u: string): string {
  let url: URL
  try { url = new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`) } catch { throw new Error(`URL inválida: «${u}»`) }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Solo http(s): «${u}»`)
  return url.toString()
}

/** Abre la URL y devuelve la ventana (propia) con la página ya cargada; si es un video, ya silenciado y pausado. */
export async function navegar(manos: Adaptador & { adoptar?: (id: number) => void }, p: PedidoNavegar): Promise<ResultadoNavegar> {
  if (manos.abrirUrl) return navegarConAdaptador(manos, p)
  const nav = NAVEGADORES[(p.navegador ?? 'chrome').toLowerCase()] ?? NAVEGADORES.chrome
  const url = validarUrl(p.url)
  const nueva = p.ventana_nueva !== false
  const corriendo = (await manos.apps()).find(a => a.bundle === nav.bundle)
  const antes = new Set(corriendo ? (await manos.ventanas({ pid: corriendo.pid })).map(w => w.id) : [])
  await abrirPorComando(nav.app, url, nueva)
  let pid = corriendo?.pid
  let ventana: number | undefined
  const fin = Date.now() + 12_000
  while (Date.now() < fin && ventana == null) {
    pid ??= (await manos.apps()).find(a => a.bundle === nav.bundle)?.pid
    if (pid) {
      const vs = (await manos.ventanas({ pid })).filter(w => w.en_pantalla && w.marco.h > 150)
      ventana = (nueva ? vs.find(w => !antes.has(w.id)) : vs.sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0])?.id
    }
    if (ventana == null) await dormir(100)
  }
  if (!pid || ventana == null) return { ok: false, pid: pid ?? 0, ventana: 0, detalle: `${nav.app} no mostró la ventana en 12 s` }
  if (nueva) manos.adoptar?.(ventana)
  // Esperar a que la página sea la pedida (el host coincide). Sin `pagina` (Cua) se devuelve sin esperar.
  const host = new URL(url).host.replace(/^www\./, '')
  let pag: { titulo?: string; url?: string } = {}
  if (manos.pagina) {
    const finPag = Date.now() + 10_000
    while (Date.now() < finPag) {
      try { pag = await manos.pagina({ pid, ventana }) } catch { /* la ventana aún arma su árbol */ }
      if (pag.url && new URL(pag.url).host.replace(/^www\./, '').endsWith(host)) break
      await dormir(150)
    }
  }
  let medios: ResultadoMedios | undefined
  if (esVideo(pag.url ?? url) && manos.medios) medios = await manos.medios({ pid, ventana })
  return { ok: true, pid, ventana, url: pag.url, titulo: pag.titulo, ...(medios ? { medios } : {}) }
}

/** Windows: el adaptador abre la ventana nueva sin activarla y dice cuál es; lo demás (adoptar, esperar la página, video) igual. */
async function navegarConAdaptador(manos: Adaptador & { adoptar?: (id: number) => void }, p: PedidoNavegar): Promise<ResultadoNavegar> {
  const url = validarUrl(p.url)
  let r: { pid: number; ventanas: Ventana[] }
  try { r = await manos.abrirUrl!({ ...p, url }) } catch (e) { return { ok: false, pid: 0, ventana: 0, detalle: (e as Error).message } }
  const ventana = r.ventanas.find(w => w.en_pantalla && w.marco.h > 150)?.id ?? r.ventanas[0]?.id
  if (ventana == null) return { ok: false, pid: r.pid, ventana: 0, detalle: 'el navegador no mostró la ventana' }
  manos.adoptar?.(ventana)
  const host = new URL(url).host.replace(/^www\./, '')
  let pag: { titulo?: string; url?: string } = {}
  if (manos.pagina) {
    const fin = Date.now() + 15_000
    while (Date.now() < fin) {
      try { pag = await manos.pagina({ pid: r.pid, ventana }) } catch { /* la ventana aún arma su árbol */ }
      // La barra de direcciones muestra la URL antes de cargar: se espera también un título de página real.
      const cargando = !pag.titulo || /^(loading|cargando|untitled|sin t[ií]tulo|new tab|nueva pesta[nñ]a)\b/i.test(pag.titulo)
      if (pag.url && new URL(pag.url).host.replace(/^www\./, '').endsWith(host) && !cargando) break
      // Edición cliente (red team 3 A-2): si redirigió a banca, pagos o impuestos no se espera más (el llamador la cierra).
      if (pag.url && esEdicionCliente() && dominioProtegido(pag.url)) break
      await dormir(200)
    }
  }
  let medios: ResultadoMedios | undefined
  if (esVideo(pag.url ?? url) && manos.medios) medios = await manos.medios({ pid: r.pid, ventana }).catch(() => undefined)
  return { ok: true, pid: r.pid, ventana, url: pag.url, titulo: pag.titulo, ...(medios ? { medios } : {}) }
}

/** Base que delega todo al adaptador interno. */
export class Envoltorio implements Adaptador {
  readonly nombre: string
  constructor(readonly interno: Adaptador) { this.nombre = interno.nombre }
  observar(p: PedidoObservar): Promise<Observacion> { return this.interno.observar(p) }
  actuar(p: PedidoActuar): Promise<ResultadoAccion> { return this.interno.actuar(p) }
  apps(): Promise<App[]> { return this.interno.apps() }
  abrir(app: string) { return this.interno.abrir(app) }
  ventanas(p?: { app?: string; pid?: number }): Promise<Ventana[]> { return this.interno.ventanas(p) }
  verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar> { return this.interno.verificar(p) }
  cursor() { return this.interno.cursor() }
  salud() { return this.interno.salud() }
  cerrar() { return this.interno.cerrar() }
  get contexto(): ((p: Objetivo & { ref?: string }) => Promise<ContextoAccion>) | undefined { return this.interno.contexto?.bind(this.interno) }
  get pagina(): ((p: Objetivo) => Promise<{ ventana: number; titulo?: string; url?: string }>) | undefined { return this.interno.pagina?.bind(this.interno) }
  get medios(): ((p: Objetivo & { tope_ms?: number }) => Promise<ResultadoMedios>) | undefined { return this.interno.medios?.bind(this.interno) }
  get soltar(): (() => Promise<void>) | undefined { return this.interno.soltar?.bind(this.interno) }
  get mostrar(): ((p: Objetivo) => Promise<void>) | undefined { return this.interno.mostrar?.bind(this.interno) }
  get inactividad(): (() => Promise<number | undefined>) | undefined { return this.interno.inactividad?.bind(this.interno) }
  get abrirUrl(): ((p: PedidoNavegar) => Promise<{ pid: number; ventanas: Ventana[] }>) | undefined { return this.interno.abrirUrl?.bind(this.interno) }
}

/** Silencia y pausa en el mismo paso cualquier video al que lleve una acción en el navegador. */
export class Vigia extends Envoltorio {
  private bundles = new Map<number, string>()

  private async esNavegador(p: Objetivo): Promise<number | null> {
    let pid = p.pid
    const apps = pid && this.bundles.has(pid) ? null : await this.interno.apps()
    if (!pid) pid = apps?.find(a => a.bundle === p.app || a.nombre === p.app)?.pid
    if (!pid) return null
    if (!this.bundles.has(pid)) this.bundles.set(pid, (apps ?? await this.interno.apps()).find(a => a.pid === pid)?.bundle?.toLowerCase() ?? '')
    return BUNDLES_NAVEGADOR.has(this.bundles.get(pid)!) ? pid : null
  }

  override async actuar(p: PedidoActuar): Promise<ResultadoAccion> {
    const pid = (p.accion === 'click' || p.accion === 'tecla') && this.interno.pagina && this.interno.medios ? await this.esNavegador(p) : null
    if (!pid) return this.interno.actuar(p)
    const antes = await this.interno.pagina!({ pid, ventana: p.ventana }).catch(() => null)
    const r = await this.interno.actuar(p)
    if (!r.ok) return r
    // La navegación de una SPA (YouTube) cambia la URL unos cientos de ms después del clic.
    const fin = Date.now() + 2500
    let ahora = antes
    while (Date.now() < fin) {
      ahora = await this.interno.pagina!({ pid, ventana: p.ventana }).catch(() => ahora)
      if (ahora?.url && ahora.url !== antes?.url) break
      await dormir(80)
    }
    if (!esVideo(ahora?.url)) return r
    let medios: ResultadoMedios
    try { medios = await this.interno.medios!({ pid, ventana: ahora?.ventana ?? p.ventana }) }
    catch (e) { return { ...r, detalle: `${r.detalle ?? ''} · ¡VIDEO SIN CONFIRMAR silenciado/pausado!: ${(e as Error).message.slice(0, 120)}`.trim() } }
    return { ...r, medios, detalle: `${r.detalle ?? ''} · video ${medios.silenciado ? 'silenciado' : 'SIN silenciar'} y ${medios.pausado ? 'pausado' : 'SIN pausar'} en el mismo paso`.trim() }
  }
}
