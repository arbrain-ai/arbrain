/**
 * Recetas web (4 nov 2026): tareas repetidas en una página que corren en segundos, sin modelo, con los mismos verbos que
 * usa cualquier agente (`ejecutarWeb`), así que cada paso pasa por el freno web. Reconocen sus elementos por nombre y
 * rol (nunca por índice ni por coordenadas, que cambian) y terminan con su propia verificación.
 *
 * Por qué existe: el 4 nov dejar un borrador en la comunidad del Accelerator tardó 147 s y falló por encargo, y unos
 * 3.5 min más a mano (docs/builds/manos-agilizar-2026-11-04/REPORTE.md). El patrón de Skool (compositor sin rol, menú
 * sin roles) ya lo cubre la extensión (`[n] clicable`, texto visible); esto es la tarea entera de una vez.
 *
 *   skool_borrador_post  abre la comunidad, abre el compositor, escribe título y cuerpo, elige la categoría y se
 *                        detiene ANTES de publicar: el borrador queda a la vista en la pestaña propia.
 */
import { INTENCION_MOSTRAR, ejecutarWeb, type SesionWeb } from './herramientas-web.js'
import type { NodoWeb } from './arbol.js'
import type { SinkBitacora } from '../herramientas.js'

export interface ParametroRecetaWeb { nombre: string; descripcion: string }
export interface ResultadoRecetaWeb {
  estado: 'hecho' | 'fallo'
  detalle: string
  /** Cómo se comprobó (lo leído en la página). */
  evidencia?: string
  /** La pestaña con el resultado: se queda abierta (el borrador vive ahí). */
  pestana?: number
  pasos: string[]
  ms: number
}
export interface OpcionesRecetaWeb { bitacora?: SinkBitacora; quien?: string; pedido?: string; senal?: AbortSignal }

export interface RecetaWeb {
  nombre: string
  descripcion: string
  parametros: ParametroRecetaWeb[]
  correr(p: Record<string, string>, s: SesionWeb, op: OpcionesRecetaWeb): Promise<Omit<ResultadoRecetaWeb, 'ms'>>
}

const sin = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Los nodos de la última lectura de la pestaña con su índice. */
function nodos(s: SesionWeb, tab: number): [number, NodoWeb][] { return s.indice(tab).nodos() }

/** El primer nodo que cumple, releyendo la página hasta `topeMs` (los modales y menús se pintan tras el clic). */
async function buscar(s: SesionWeb, tab: number, cumple: (n: NodoWeb) => boolean, topeMs = 3000): Promise<[number, NodoWeb] | null> {
  const fin = Date.now() + topeMs
  for (let i = 0; ; i++) {
    const hallado = nodos(s, tab).find(([, n]) => cumple(n))
    if (hallado || Date.now() > fin) return hallado ?? null
    await esperar(i ? 250 : 120)
    await ejecutarWeb('web_observar', { pestana: tab, completo: true }, s)
  }
}

/** ¿La pestaña ya está en esa comunidad (mismo sitio y primer tramo de la ruta)? */
function mismaComunidad(actual: string | undefined, url: string): boolean {
  try {
    const a = new URL(actual ?? ''), b = new URL(url)
    return a.host === b.host && a.pathname.split('/')[1] === b.pathname.split('/')[1]
  } catch { return false }
}

const COMPOSITOR = /^(escribe algo|write something|start a post|crea una publicacion|create a post)/
const TITULO = /^(titulo|title)\b/
const SELECTOR = /^(selecciona una categoria|select a category|elige una categoria|choose a category|categoria|category)\b/

/** Un paso con el freno de siempre: si algo lo detiene, la receta falla con su motivo (nunca busca otra vía). */
async function paso(s: SesionWeb, tab: number, args: Record<string, unknown>, op: OpcionesRecetaWeb, informe: string[], meta: string): Promise<void> {
  if (op.senal?.aborted) throw new Error(`detenido: ${String(op.senal.reason ?? 'por la persona')}`)
  const r = await ejecutarWeb('web_actuar', { pestana: tab, ...args }, s, op.bitacora, op.quien ?? 'receta-web')
  informe.push(`${meta}: ${r.error ? 'falló' : 'ok'}`)
  if (r.error) throw new Error(`${meta}: ${r.text.split('\n').filter(l => /FRENO|falló|necesita|no hay|bloqueado|paso \d/.test(l)).join(' · ').slice(0, 300) || r.text.slice(0, 300)}`)
}

const skoolBorrador: RecetaWeb = {
  nombre: 'skool_borrador_post',
  descripcion: 'Borrador de post en una comunidad de Skool (categoría, título, cuerpo), sin publicar: queda a la vista en la pestaña propia.',
  parametros: [
    { nombre: 'url', descripcion: 'URL de la comunidad (https://www.skool.com/<comunidad>)' },
    { nombre: 'categoria', descripcion: 'Nombre exacto de la categoría (p. ej. «Wins»)' },
    { nombre: 'titulo', descripcion: 'Título del post' },
    { nombre: 'cuerpo', descripcion: 'Cuerpo del post; los saltos de línea abren párrafo' },
  ],
  async correr(p, s, op) {
    const informe: string[] = []
    const cuerpo = String(p.cuerpo ?? '').replace(/\s+$/, '') // un salto al final sería un Enter en el compositor
    const pedido = op.pedido ?? 'receta: borrador de post en Skool sin publicar'
    // 1. La comunidad: la pestaña propia que ya la tiene, o una nueva.
    let tab = s.ultimaPestana
    const actual = tab != null ? s.indice(tab).ultima?.url : undefined
    if (tab == null || !mismaComunidad(actual, p.url)) {
      const r = await ejecutarWeb('web_abrir', { url: p.url, pedido, max: 400 }, s, op.bitacora, op.quien ?? 'receta-web')
      if (r.error) return { estado: 'fallo', detalle: `no abrió la comunidad: ${r.text.slice(0, 200)}`, pasos: informe }
      tab = s.ultimaPestana!
      informe.push('abrir la comunidad: ok')
    } else await ejecutarWeb('web_observar', { pestana: tab, completo: true, pedido }, s)
    try {
      // 2. El compositor: el cuadro «Escribe algo» (un div sin rol: sale como clicable).
      const yaAbierto = nodos(s, tab).some(([, n]) => n.rol === 'textbox' && TITULO.test(sin(n.nombre)))
      if (!yaAbierto) {
        const c = await buscar(s, tab, n => COMPOSITOR.test(sin(n.nombre)) && n.rol !== 'textbox', 2500)
        await paso(s, tab, c ? { accion: 'click', indice: c[0] } : { accion: 'click', texto_visible: 'Escribe algo' }, op, informe, 'abrir el compositor')
      }
      // 3. Título y cuerpo, en un solo web_actuar.
      const titulo = await buscar(s, tab, n => n.rol === 'textbox' && TITULO.test(sin(n.nombre)))
      if (!titulo) throw new Error('el compositor no mostró el campo del título')
      const cuerpoN = await buscar(s, tab, n => n.rol === 'textbox' && n.b !== titulo[1].b && /editable|multilinea/.test(n.f ?? ''))
      if (!cuerpoN) throw new Error('el compositor no mostró el campo del cuerpo')
      await paso(s, tab, { pasos: [{ accion: 'escribir', indice: titulo[0], texto: p.titulo }, { accion: 'escribir', indice: cuerpoN[0], texto: cuerpo }] }, op, informe, 'escribir título y cuerpo')
      // 4. La categoría: abrir el selector y elegir la opción por su nombre (sin rol: clicable o texto visible).
      const selector = await buscar(s, tab, n => n.rol !== 'textbox' && SELECTOR.test(sin(n.nombre)), 1500)
      if (!selector) throw new Error('no encontré el selector de categoría')
      const bSelector = selector[1].b
      await paso(s, tab, { accion: 'click', indice: selector[0] }, op, informe, 'abrir las categorías')
      const opcion = await buscar(s, tab, n => sin(n.nombre) === sin(p.categoria) && n.b !== bSelector && n.rol !== 'textbox' && n.rol !== 'texto', 1500)
      await paso(s, tab, opcion ? { accion: 'click', indice: opcion[0] } : { accion: 'click', texto_visible: p.categoria }, op, informe, `elegir «${p.categoria}»`)
      // 5. Verificación: lo que dice la página, no lo que se escribió.
      await ejecutarWeb('web_observar', { pestana: tab, completo: true }, s)
      const vista = nodos(s, tab)
      const t = vista.find(([, n]) => n.b === titulo[1].b)?.[1]
      const c = vista.find(([, n]) => n.b === cuerpoN[1].b)?.[1]
      const sel = vista.find(([, n]) => n.b === bSelector)?.[1]
      const okTitulo = !!t && sin(p.titulo).startsWith(sin(t.valor ?? '').replace(/…$/, ''))
      const primera = sin(cuerpo.split('\n')[0]).slice(0, 60)
      const okCuerpo = !!c && sin(c.valor ?? '').startsWith(primera.slice(0, Math.min(primera.length, sin(c.valor ?? '').length || 1)))
      const okCategoria = !!sel && sin(sel.nombre) === sin(p.categoria)
      const evidencia = `título «${t?.valor ?? '—'}» · cuerpo «${(c?.valor ?? '—').slice(0, 60)}» · categoría «${sel?.nombre ?? '—'}» · sin publicar`
      if (!okTitulo || !okCuerpo || !okCategoria) return { estado: 'fallo', detalle: `el borrador no quedó como se pidió (${[!okTitulo && 'título', !okCuerpo && 'cuerpo', !okCategoria && 'categoría'].filter(Boolean).join(', ')}): ${evidencia}`, evidencia, pestana: tab, pasos: informe }
      // «Quiero verte / muéstrame»: la pestaña propia al frente con el borrador.
      if (INTENCION_MOSTRAR.test(pedido)) { const m = await ejecutarWeb('web_mostrar', { pestana: tab, pedido }, s, op.bitacora, op.quien ?? 'receta-web'); informe.push(`mostrar: ${m.error ? 'no' : 'ok'}`) }
      return { estado: 'hecho', detalle: `Borrador listo en Skool, sin publicar: ${evidencia}. La pestaña queda abierta con el borrador.`, evidencia, pestana: tab, pasos: informe }
    } catch (e) {
      return { estado: 'fallo', detalle: (e as Error).message, pestana: tab, pasos: informe }
    }
  },
}

export const RECETAS_WEB: readonly RecetaWeb[] = [skoolBorrador]

export const esRecetaWeb = (nombre: unknown) => RECETAS_WEB.some(r => r.nombre === nombre)

export function listarRecetasWeb() {
  return RECETAS_WEB.map(r => ({ nombre: r.nombre, descripcion: r.descripcion, tipo: 'web', parametros: r.parametros.map(p => `${p.nombre}: ${p.descripcion}`) }))
}

export async function correrRecetaWeb(nombre: string, parametros: Record<string, string>, s: SesionWeb, op: OpcionesRecetaWeb = {}): Promise<ResultadoRecetaWeb> {
  const t0 = performance.now()
  const r = RECETAS_WEB.find(x => x.nombre === nombre)
  if (!r) return { estado: 'fallo', detalle: `no hay receta web «${nombre}»`, pasos: [], ms: 0 }
  const falta = r.parametros.filter(p => !String(parametros?.[p.nombre] ?? '').trim()).map(p => p.nombre)
  if (falta.length) return { estado: 'fallo', detalle: `faltan parámetros: ${falta.join(', ')}`, pasos: [], ms: 0 }
  const res = await r.correr(parametros, s, op)
  return { ...res, ms: Math.round(performance.now() - t0) }
}

/** Un campo «etiqueta «valor»» del pedido. */
const campo = (texto: string, etiquetas: string) => texto.match(new RegExp(`\\b(?:${etiquetas})\\s*[:=]?\\s*«([^»]+)»`, 'i'))

/**
 * ¿El pedido es un borrador de Skool con sus tres datos? Así lo reconoce el cerebro antes de abrir un modelo. Pide la
 * URL de la comunidad y `categoría «…» · título «…» · cuerpo «…»` (el cuerpo al final: puede llevar comillas). Si el
 * pedido pide PUBLICAR, no aplica: eso no es un borrador y pasa por el freno con su tarjeta.
 */
export function recetaWebDelPedido(pedido: string): { nombre: string; parametros: Record<string, string> } | null {
  const url = pedido.match(/https?:\/\/(?:www\.)?skool\.com\/[\w.-]+/i)?.[0]
  if (!url || !/\b(borrador|draft|sin publicar|sin enviar)\b/i.test(pedido)) return null
  if (/(?<!\b(sin|no|nunca)\s)\bpubl[ií](ca|calo|cala|car)\b(?!\s+(nada|todav[ií]a))/i.test(pedido.replace(/\bsin publicar\b/gi, ''))) return null
  const cat = campo(pedido, 'categor[ií]a|category')
  const tit = campo(pedido, 't[ií]tulo|title')
  let resto = pedido
  for (const m of [cat, tit]) if (m) resto = resto.replace(m[0], '')
  const cuerpo = resto.match(/\b(?:cuerpo|body|texto)\s*[:=]?\s*«([\s\S]+)»/i)
  if (!cat || !tit || !cuerpo) return null
  return { nombre: 'skool_borrador_post', parametros: { url, categoria: cat[1].trim(), titulo: tit[1].trim(), cuerpo: cuerpo[1].trim() } }
}
