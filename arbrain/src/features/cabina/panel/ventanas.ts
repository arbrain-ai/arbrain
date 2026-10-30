'use client'
/**
 * Ventanas del panel (1 oct 2026, pedido de Daniel: «como CapCut, el panel en la segunda pantalla»).
 *
 * 5 oct 2026, el modelo de Chrome (Daniel: «me gustaría poder mover las pestañas al segundo monitor, pero
 * poderlas ordenar como si fueran eso, pestañas… no una mini aplicación abierta»): una ventana aparte ya no
 * es UNA pestaña, es otra tira de pestañas igual a la del panel principal. Arrastrar una pestaña fuera de su
 * tira hace nacer una ventana Arbrain de tamaño completo; soltarla sobre otra ventana (o sobre el panel
 * principal) la inserta ahí, en el lugar donde cayó. Una ventana que se queda sin pestañas se cierra.
 *
 * Cada ventana carga `/panel?ventana=N` de la MISMA web: comparte sesión y datos en vivo. Qué pestaña vive
 * en qué ventana está en la tienda de pestañas (fijadas.ts, `enVentana`), que cualquier ventana cambia y
 * publica a las demás por el canal (BroadcastChannel y, en el escritorio, además los eventos de Tauri).
 * La ventana principal coordina la vida: sabe qué ventanas contestan, devuelve al panel las pestañas de una
 * ventana que se cerró y, al arrancar la app, vuelve a abrir las ventanas recordadas en su lugar.
 *
 * Escritorio: ventana nativa `vista-ventana-N`, con su lugar (posición, tamaño y monitor) recordado por la
 * app, o donde se soltó la pestaña. Navegador: ventana emergente; si el navegador la bloquea, avisa.
 */
import { create } from 'zustand'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { useLayoutStore } from '@/shared/stores/layout-store'
import type { Fijada } from './fijadas'
import { esquinaDeVentana, rectEnPantalla, type Blanco, type EstadoFantasma, type Punto, type Rect } from './arrastre-geom'
import type { Medida } from './destino-levy'
import { fijarFuenteGeometria, geometriaDeNativa, geometriaVentana, refrescarGeometria } from './geometria-ventana'
import {
  esVentana, etiquetaDeVentana, PRINCIPAL, pestanaActiva, rutaDeVentana, tiraDe, todasFuera as sinColumna, ventanaDe, ventanaNueva, ventanasCon, type EnVentana,
} from './pestanas-fuera'

const CANAL = 'arbrain-ventanas'
const CLAVE_PANEL = 'arbrain.panelDerecho'
const CLAVE_LUGAR = 'arbrain.ventanas.lugar'

export type Mensaje =
  | { tipo: 'viva'; ventana: string }
  | { tipo: 'cerrada'; ventana: string }
  | { tipo: 'quien' }
  | { tipo: 'cierrate'; etiqueta: string }
  | { tipo: 'fijadas'; fijadas: Fijada[]; activa?: string; orden?: string[]; taller?: boolean; ancladas?: string[]; enVentana?: EnVentana }
  /** «Llévame a esta pestaña» (desde una ventana aparte, a la principal). */
  | { tipo: 'ver'; pestana: string }
  /** La ventana donde vive esa pestaña la trae al frente. */
  | { tipo: 'activar'; pestana: string }
  /** Empezó un arrastre: cada ventana contesta dónde está y qué tira tiene (`blanco`). */
  | { tipo: 'blanco?'; id: string }
  | { tipo: 'blanco'; id: string; blanco: Blanco }
  /** Mientras se arrastra: la ventana que recibiría la pestaña le abre hueco en `indice` (ventana null = nadie). */
  | { tipo: 'sobre'; clave: string; ventana: string | null; indice: number; ancho: number }
  /** Lo que pinta la ventana fantasma mientras se arrastra una pestaña fuera de su ventana (fantasma.ts). */
  | { tipo: 'fantasma'; estado: EstadoFantasma }
  /** Los ajustes del panel (orden y ocultas del «+») cambiaron en una ventana: las demás los aplican igual (panel-ajustes.ts). */
  | { tipo: 'panel-ajustes'; ajustes: { rev: number; orden: string[]; ocultas: string[]; donde?: string } }
  /** Alguien pidió un segmento del Taller (p. ej. `mostrar servidores`): lo pone la ventana donde vive el Taller. */
  | { tipo: 'taller-segmento'; segmento: string }

type Sobre = Mensaje & { _id: string; _de: string }

// ── Canal entre ventanas ──
const yo = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())
const oyentes = new Set<(m: Mensaje) => void>()
const vistos: string[] = []
let bc: BroadcastChannel | null = null
let tauriListo = false

function entregar(s: Sobre) {
  if (s._de === yo || vistos.includes(s._id)) return
  vistos.push(s._id); if (vistos.length > 200) vistos.shift()
  oyentes.forEach(f => { try { f(s) } catch (e) { console.error('[ventanas]', e) } })
}

function abrirCanal() {
  if (typeof window === 'undefined') return
  if (!bc && 'BroadcastChannel' in window) {
    bc = new BroadcastChannel(CANAL)
    bc.onmessage = e => entregar(e.data as Sobre)
  }
  if (!tauriListo && isDesktopRuntime()) {
    tauriListo = true
    void import('@tauri-apps/api/event').then(({ listen }) => listen<Sobre>(CANAL, e => entregar(e.payload))).catch(() => { tauriListo = false })
  }
}

export function publicar(m: Mensaje) {
  if (typeof window === 'undefined') return
  abrirCanal()
  const s: Sobre = { ...m, _id: `${yo}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, _de: yo }
  try { bc?.postMessage(s) } catch { /* canal cerrado */ }
  if (isDesktopRuntime()) void import('@tauri-apps/api/event').then(({ emit }) => emit(CANAL, s)).catch(() => {})
}

export function escuchar(f: (m: Mensaje) => void) {
  abrirCanal()
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

// ── Puerto hacia la tienda de pestañas (fijadas.ts lo registra; evita la importación circular) ──
interface PuertoFijadas {
  lista: () => Fijada[]; claves: () => string[]; activa: () => string; activar: (clave: string) => void
  enVentana: () => EnVentana; mover: (clave: string, destino: string, indice?: number) => void; propia: () => string
  suscribir: (f: (ahora: EnVentana, antes: EnVentana) => void) => () => void
}
let puerto: PuertoFijadas = {
  lista: () => [], claves: () => [], activa: () => 'tareas', activar: () => {},
  enVentana: () => ({}), mover: () => {}, propia: () => PRINCIPAL, suscribir: () => () => {},
}
export function enlazarFijadas(p: PuertoFijadas) { puerto = p }
/** Las pestañas abiertas en orden de cabecera (Tareas, Taller y lo fijado pueden no estar: 3 oct 2026). */
const claves = () => puerto.claves()
const tira = (ventana: string) => tiraDe(claves(), puerto.enVentana(), ventana)

// ── Estado de las ventanas (lo que no es de las pestañas) ──
interface EstadoVentanas {
  /** Último aviso de vida de cada ventana aparte. */
  vistaEn: Record<string, number>
  error: string | null
  /** Escritorio: la app instalada ya trae las ventanas del panel (null mientras se pregunta).
   *  La web llega antes que la reinstalación; sin soporte, no se puede arrastrar fuera. */
  nativo: boolean | null
  /** Versión de `ventanas_pestanas` de la app instalada (0 = ninguna; 3 = trae el fantasma que cruza monitores). */
  protocolo: number
}

export const useVentanas = create<EstadoVentanas>(() => ({ vistaEn: {}, error: null, nativo: null, protocolo: 0 }))

function avisarError(error: string) {
  useVentanas.setState({ error })
  setTimeout(() => { if (useVentanas.getState().error === error) useVentanas.setState({ error: null }) }, 7000)
}

// ── Abrir, enfocar y cerrar ventanas ──
type Lugar = { x: number; y: number; ancho: number; alto: number }
function lugarWeb(etiqueta: string): Lugar | null {
  try { return (JSON.parse(localStorage.getItem(CLAVE_LUGAR) ?? '{}') as Record<string, Lugar>)[etiqueta] ?? null } catch { return null }
}
export function recordarLugarWeb(etiqueta: string, l: Lugar) {
  try {
    const todos = JSON.parse(localStorage.getItem(CLAVE_LUGAR) ?? '{}') as Record<string, Lugar>
    const v = todos[etiqueta]
    if (v && v.x === l.x && v.y === l.y && v.ancho === l.ancho && v.alto === l.alto) return
    localStorage.setItem(CLAVE_LUGAR, JSON.stringify({ ...todos, [etiqueta]: l }))
  } catch { /* sin almacenamiento */ }
}

/** Referencias a las emergentes que abrió esta pestaña del navegador (para enfocarlas o cerrarlas). */
const emergentes = new Map<string, Window>()

async function invocar<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** Tamaño de una ventana nueva: el de la ventana de donde salió la pestaña, como Chrome (nunca una ventanita). */
export function tamanoNuevo() {
  if (typeof window === 'undefined') return { ancho: 1200, alto: 860 }
  const disp = window.screen ? { ancho: window.screen.availWidth, alto: window.screen.availHeight } : { ancho: 1440, alto: 900 }
  return { ancho: Math.round(Math.min(disp.ancho, Math.max(960, window.innerWidth))), alto: Math.round(Math.min(disp.alto - 40, Math.max(720, window.innerHeight))) }
}

/** Abre (o trae al frente) una ventana del panel. `cursor` = punto de pantalla donde se soltó la pestaña:
 *  la ventana nace (o se mueve) con el cursor sobre su cabecera. Sin él, usa su lugar recordado. */
export async function abrirVentana(etiqueta: string, ruta: string, titulo: string, cursor?: Punto, sinFoco = false): Promise<boolean> {
  const { ancho: anchoNuevo, alto: altoNuevo } = tamanoNuevo()
  if (isDesktopRuntime()) {
    // `ancho`/`alto` solo los usa la app que ya los entiende (ventanas_pestanas ≥ 2); la anterior los ignora.
    try { await invocar('abrir_ventana', { etiqueta, ruta, titulo, x: cursor?.x, y: cursor?.y, ancho: anchoNuevo, alto: altoNuevo, ...(sinFoco ? { sinFoco: true } : {}) }); return true }
    catch (e) { console.error('[ventanas] la app no abrió la ventana', e); return false }
  }
  const l = lugarWeb(etiqueta)
  const ancho = l?.ancho ?? anchoNuevo, alto = l?.alto ?? altoNuevo
  const esquina = cursor ? esquinaDeVentana(cursor) : null
  const x = esquina?.x ?? l?.x ?? window.screenX + 48
  const y = esquina?.y ?? l?.y ?? window.screenY + 48
  const w = window.open(ruta, `arbrain-${etiqueta}`, `popup=yes,width=${Math.round(ancho)},height=${Math.round(alto)},left=${Math.round(x)},top=${Math.round(y)}`)
  if (!w) return false
  emergentes.set(etiqueta, w)
  try { w.focus() } catch { /* el navegador decide */ }
  return true
}

export async function enfocarVentana(etiqueta: string): Promise<boolean> {
  if (isDesktopRuntime()) return invocar<boolean>('enfocar_ventana', { etiqueta }).catch(() => false)
  const w = emergentes.get(etiqueta)
  if (!w || w.closed) return false
  try { w.focus(); return true } catch { return false }
}

/** La ventana aparte se cierra a sí misma (se quedó sin pestañas). */
export async function cerrarEstaVentana(etiqueta: string) {
  if (isDesktopRuntime()) { await invocar('cerrar_ventana', { etiqueta }).catch(() => {}); return }
  window.close()
  // Una pestaña que no abrió un script no se deja cerrar: vuelve al chat, donde sus pestañas ya están en el panel.
  setTimeout(() => { if (!window.closed) window.location.replace('/chat') }, 400)
}

/** Cierra las ventanas que se quedaron sin pestañas (cada una también se cierra sola al notarlo). */
export function cerrarVentanas(ids: string[]) {
  for (const id of ids) publicar({ tipo: 'cierrate', etiqueta: etiquetaDeVentana(id) })
}

/** ¿Se puede sacar una pestaña a otra ventana? En el navegador siempre; en el escritorio, si la app lo sabe hacer. */
export const puedeDesprender = (nativo: boolean | null) => !isDesktopRuntime() || nativo === true

export async function comprobarNativo() {
  if (!isDesktopRuntime() || useVentanas.getState().nativo != null) return
  // `ventanas_pestanas` solo existe en la app que ya sabe abrir ventanas del panel (1 oct 2026); dice su versión.
  const v = await invocar<number>('ventanas_pestanas', {}).then(n => Number(n) || 1, () => 0)
  useVentanas.setState({ nativo: v > 0, protocolo: v })
}

// ── Mover pestañas entre ventanas ──
const abriendo = new Set<string>()

/** Saca una pestaña a una ventana NUEVA (donde se soltó, si se sabe), de tamaño completo y con su propia tira. */
export async function sacarAVentanaNueva(clave: string, cursor?: Punto) {
  if (abriendo.has(clave)) return false
  abriendo.add(clave)
  try {
    await comprobarNativo()
    if (!puedeDesprender(useVentanas.getState().nativo)) return false
    const origen = ventanaDe(puerto.enVentana(), clave)
    const id = ventanaNueva(puerto.enVentana(), Object.keys(useVentanas.getState().vistaEn).filter(esVentana))
    // Primero el estado (la ventana nueva lo lee al nacer), luego la ventana; si no abre, la pestaña vuelve.
    puerto.mover(clave, id)
    marcarVida(id)
    const ok = await abrirVentana(etiquetaDeVentana(id), rutaDeVentana(id), 'Arbrain', cursor)
    if (!ok) {
      puerto.mover(clave, origen)
      avisarError(isDesktopRuntime() ? 'La app no pudo abrir la ventana. Vuelve a intentarlo.' : 'El navegador bloqueó la ventana nueva. Permite las ventanas emergentes de Arbrain y vuelve a intentarlo.')
      return false
    }
    return true
  } finally { abriendo.delete(clave) }
}

/** La única pestaña de una ventana arrastrada a un lugar vacío: se va la ventana entera, como en Chrome. */
export async function moverVentanaA(id: string, cursor: Punto) {
  if (isDesktopRuntime()) { await abrirVentana(etiquetaDeVentana(id), rutaDeVentana(id), 'Arbrain', cursor); return }
  const e = esquinaDeVentana(cursor)
  try { window.moveTo(e.x, e.y) } catch { /* el navegador decide */ }
}

/** Lleva una pestaña a una ventana existente (o al panel principal) y la deja a la vista ahí. */
export function llevarA(clave: string, destino: string, indice?: number) {
  puerto.mover(clave, destino, indice)
  if (destino !== PRINCIPAL) void enfocarVentana(etiquetaDeVentana(destino))
}

/** Todas las pestañas de una ventana aparte, de vuelta al panel principal (la ventana se cierra sola). */
export function devolverAlPanel(ventana: string) {
  for (const c of tira(ventana)) puerto.mover(c, PRINCIPAL)
}

function marcarVida(id: string) { useVentanas.setState(s => ({ vistaEn: { ...s.vistaEn, [id]: Date.now() } })) }

/** ⌘⌥B en la principal: saca la pestaña activa a una ventana nueva; si no queda ninguna en la columna, las devuelve todas. */
export function alternarDesprendido() {
  const quedan = tira(PRINCIPAL)
  if (!quedan.length) { ventanasCon(puerto.enVentana()).forEach(devolverAlPanel); return }
  const activa = pestanaActiva(puerto.activa(), quedan)
  if (activa) void sacarAVentanaNueva(activa)
}

/** Lleva a una pestaña: si vive en otra ventana, la trae al frente ahí; si no, la activa en la columna. */
function verPestana(clave: string) {
  const v = ventanaDe(puerto.enVentana(), clave)
  if (v !== puerto.propia()) {
    if (v === PRINCIPAL) { publicar({ tipo: 'ver', pestana: clave }); return }
    publicar({ tipo: 'activar', pestana: clave })
    void enfocarVentana(etiquetaDeVentana(v))
    return
  }
  puerto.activar(clave)
  if (v === PRINCIPAL) useLayoutStore.getState().setPanelDerecho(true)
}

/** «Ver el panel»: con una pestaña, esa; sin ella, la columna (o, si todo está fuera, las ventanas). */
export function mostrarPanel(clave?: string) {
  if (clave) { verPestana(clave); return }
  const en = puerto.enVentana()
  if (sinColumna(claves(), Object.keys(en))) ventanasCon(en).forEach(v => { void enfocarVentana(etiquetaDeVentana(v)) })
  else useLayoutStore.getState().setPanelDerecho(true)
}

/** Desde la columna: llevar a una pestaña (misma regla que mostrarPanel(clave), sin abrir la columna cerrada). */
export const verPestanaDelPanel = verPestana

// ── Blancos: dónde está cada ventana cuando empieza un arrastre ──
let ultimoFoco = 0
if (typeof window !== 'undefined') {
  const anotar = () => { ultimoFoco = Date.now() }
  if (document.hasFocus()) anotar()
  window.addEventListener('focus', anotar)
  window.addEventListener('pointerdown', anotar, true)
}

// En el escritorio, la geometría de la ventana la mide la app: `window.screenX/outerWidth…` no valen en WKWebView (geometria-ventana.ts).
async function medirConTauri() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const v = getCurrentWindow()
  const [pos, tam, escala] = await Promise.all([v.innerPosition(), v.innerSize(), v.scaleFactor()])
  return geometriaDeNativa({ x: pos.x, y: pos.y, ancho: tam.width, alto: tam.height, escala })
}
if (typeof window !== 'undefined' && isDesktopRuntime()) fijarFuenteGeometria(medirConTauri)

const aPantalla = (r: Rect) => rectEnPantalla(geometriaVentana(), r)

/** El blanco de ESTA ventana: toda la ventana recibe; su tira (`[data-tira]`) dice el lugar exacto. */
export function blancoPropia(): Blanco {
  const t = document.querySelector<HTMLElement>('[data-panel-derecho] [data-tira]')
  const r = t?.getBoundingClientRect()
  const pestanas = t ? Array.from(t.children).filter((h): h is HTMLElement => h instanceof HTMLElement && h.dataset.clave != null).map(h => {
    // Sin el corrimiento de un hueco abierto: la caja de layout (offsetLeft) vale aunque la pestaña esté apartada.
    const c = h.getBoundingClientRect(), t = getComputedStyle(h).transform, corrida = t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0
    const caja = aPantalla({ left: c.left - corrida, right: c.right - corrida, top: c.top, bottom: c.bottom })
    return { clave: h.dataset.clave!, centro: (caja.left + caja.right) / 2, izquierda: caja.left, ancho: caja.right - caja.left, ...(h.hasAttribute('data-anclada') ? { anclada: true } : {}) }
  }) : []
  return {
    ventana: puerto.propia(),
    area: aPantalla({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }),
    tira: r && r.width > 0 ? aPantalla({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }) : null,
    pestanas, foco: ultimoFoco,
  }
}

/** El blanco de esta ventana tras volver a medirla (puede haberse movido de monitor desde la última vez). */
export async function blancoPropioAhora(): Promise<Blanco> {
  await refrescarGeometria()
  return blancoPropia()
}

/** Pide el blanco a las demás ventanas: la lista se llena en cuanto contestan (milisegundos). */
export function pedirBlancos(): { blancos: Blanco[]; soltar: () => void } {
  const id = `${yo}:${Date.now()}`, blancos: Blanco[] = []
  const quitar = escuchar(m => { if (m.tipo === 'blanco' && m.id === id && m.blanco.ventana !== puerto.propia()) blancos.push(m.blanco) })
  publicar({ tipo: 'blanco?', id })
  return { blancos, soltar: quitar }
}

/**
 * Dónde está cada ventana de Arbrain AHORA, para «Dónde abre Levy» (destino-levy.ts): la propia (la principal, que atiende el bus) y
 * cada ventana aparte que tiene pestañas y contesta a tiempo. Una ventana que no contesta no cuenta: la elección cae en las que sí.
 */
export async function medirVentanas(esperaMs = 800): Promise<Medida[]> {
  const propia = puerto.propia()
  const mia = (await blancoPropioAhora()).area.left
  const otras = ventanasCon(puerto.enVentana()).filter(v => v !== propia)
  if (!otras.length) return [{ ventana: propia, izquierda: mia }]
  const { blancos, soltar } = pedirBlancos()
  const limite = Date.now() + esperaMs
  while (Date.now() < limite && !otras.every(v => blancos.some(d => d.ventana === v))) await new Promise(r => setTimeout(r, 25))
  soltar()
  return [{ ventana: propia, izquierda: mia }, ...otras.flatMap(v => { const d = blancos.find(x => x.ventana === v); return d ? [{ ventana: v, izquierda: d.area.left }] : [] })]
}

/** Hueco que abre esta ventana mientras otra le arrastra una pestaña encima (lo pinta PanelDerecho). */
export const useHueco = create<{ clave: string | null; indice: number; ancho: number }>(() => ({ clave: null, indice: 0, ancho: 0 }))

/** Cada ventana (principal o aparte) contesta por su blanco, abre hueco y trae al frente lo que le piden. */
export function atenderVentana() {
  if (typeof window === 'undefined') return () => {}
  return escuchar(m => {
    if (m.tipo === 'blanco?') void blancoPropioAhora().then(blanco => publicar({ tipo: 'blanco', id: m.id, blanco }))
    else if (m.tipo === 'sobre') {
      if (m.ventana === puerto.propia()) useHueco.setState({ clave: m.clave, indice: m.indice, ancho: m.ancho })
      else if (useHueco.getState().clave) useHueco.setState({ clave: null })
    } else if (m.tipo === 'activar' && ventanaDe(puerto.enVentana(), m.pestana) === puerto.propia()) puerto.activar(m.pestana)
  })
}

/** Lo que llega a esta ventana (soltado aquí desde otra) queda a la vista; a la principal, además, le abre la columna. */
export function seguirLlegadas() {
  return puerto.suscribir((ahora, antes) => {
    const propia = puerto.propia()
    const llegadas = claves().filter(c => ventanaDe(ahora, c) === propia && ventanaDe(antes, c) !== propia)
    if (!llegadas.length) return
    puerto.activar(llegadas[llegadas.length - 1])
    if (propia === PRINCIPAL) useLayoutStore.getState().setPanelDerecho(true)
    // La pestaña que aterrizó se asienta con un pulso corto (el fantasma acaba de desaparecer en su lugar).
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const c of llegadas) {
        const el = document.querySelector<HTMLElement>(`[data-panel-derecho] [data-tira] [data-clave="${CSS.escape(c)}"]`)
        if (!el) continue
        el.setAttribute('data-llego', '')
        setTimeout(() => el.removeAttribute('data-llego'), 520)
      }
    }))
  })
}

// ── Lo que hace una ventana aparte ──
/** Vida de una ventana aparte: avisa que vive, contesta, recuerda su lugar, se despide y se cierra si se queda sin pestañas. */
export function vidaDeVentana(id: string) {
  const etiqueta = etiquetaDeVentana(id)
  void comprobarNativo()
  const viva = () => publicar({ tipo: 'viva', ventana: id })
  viva()
  const quitar = escuchar(m => {
    if (m.tipo === 'quien') viva()
    else if (m.tipo === 'cierrate' && m.etiqueta === etiqueta) void cerrarEstaVentana(etiqueta)
  })
  // Sin pestañas (la última se fue a otra ventana, o nació huérfana): se cierra, como en Chrome.
  let tuvo = tira(id).length > 0
  const revisar = () => { const n = tira(id).length; if (n) tuvo = true; else if (tuvo) void cerrarEstaVentana(etiqueta) }
  const quitarSub = puerto.suscribir(revisar)
  const huerfana = setTimeout(() => { if (!tira(id).length) void cerrarEstaVentana(etiqueta) }, 4000)
  const latido = setInterval(viva, 4000)
  // En el escritorio la app recuerda posición, tamaño y monitor; en el navegador, aquí.
  const web = !isDesktopRuntime()
  const medir = () => { if (web) recordarLugarWeb(etiqueta, { x: window.screenX, y: window.screenY, ancho: window.innerWidth, alto: window.innerHeight }) }
  const vigia = web ? setInterval(medir, 1000) : null
  const adios = () => { medir(); publicar({ tipo: 'cerrada', ventana: id }) }
  window.addEventListener('resize', medir)
  window.addEventListener('pagehide', adios)
  return () => {
    quitar(); quitarSub(); clearTimeout(huerfana); clearInterval(latido); if (vigia) clearInterval(vigia)
    window.removeEventListener('resize', medir); window.removeEventListener('pagehide', adios)
  }
}

// ── Coordinación (la monta la ventana principal) ──
let coordinando = false

/** Las ventanas de antes del 5 oct eran una por pestaña (`pestana-tareas`, `vista-<huella>`): sus pestañas vuelven al panel. */
function retirarVentanasViejas() {
  try {
    const viejo = JSON.parse(localStorage.getItem(CLAVE_PANEL) ?? '{}') as Record<string, unknown>
    if ('fuera' in viejo || 'desprendido' in viejo) { const { fuera: _f, desprendido: _d, ...resto } = viejo; localStorage.setItem(CLAVE_PANEL, JSON.stringify(resto)) }
  } catch { /* sin almacenamiento */ }
  if (isDesktopRuntime()) void invocar<string[]>('ventanas_abiertas', {}).then(es => es.filter(e => !e.startsWith('vista-ventana-')).forEach(e => { void invocar('cerrar_ventana', { etiqueta: e }) })).catch(() => {})
}

/** La ventana principal escucha a las ventanas aparte: vida, cierre y pedidos de ver una pestaña. */
export function coordinarPrincipal() {
  if (coordinando || typeof window === 'undefined') return () => {}
  coordinando = true
  void comprobarNativo()
  retirarVentanasViejas()
  const esperas = new Map<string, ReturnType<typeof setTimeout>>()
  const st = useVentanas
  const vivas = () => ventanasCon(puerto.enVentana())
  vivas().forEach(marcarVida)

  const quitar = escuchar(m => {
    if (m.tipo === 'viva') {
      const espera = esperas.get(m.ventana)
      if (espera) { clearTimeout(espera); esperas.delete(m.ventana) }
      marcarVida(m.ventana)
    } else if (m.tipo === 'cerrada') {
      // Su número queda libre para la próxima ventana nueva (si solo se recargó, su «viva» lo vuelve a apartar).
      st.setState(s => { const { [m.ventana]: _fuera, ...vistaEn } = s.vistaEn; return { vistaEn } })
      if (!vivas().includes(m.ventana)) return
      // La app se está cerrando para actualizarse: las ventanas aparte se despiden con ella y deben volver tal cual.
      if ((window as { __arbrainCerrando?: boolean }).__arbrainCerrando) return
      // Un recargo de la ventana también avisa «cerrada»: se espera un momento a que vuelva. Si no, sus pestañas vuelven al panel.
      const antes = esperas.get(m.ventana); if (antes) clearTimeout(antes)
      const desde = Date.now()
      esperas.set(m.ventana, setTimeout(() => { esperas.delete(m.ventana); if ((st.getState().vistaEn[m.ventana] ?? 0) < desde) devolverAlPanel(m.ventana) }, 1500))
    } else if (m.tipo === 'ver') {
      verPestana(m.pestana)
    }
  })

  // Al arrancar con ventanas recordadas: si no contestan, en el escritorio se vuelven a abrir en su lugar;
  // en el navegador (que bloquea abrir sin un clic) sus pestañas vuelven a la columna.
  const revisar = async (ids: string[], alArrancar: boolean) => {
    if (!ids.length) return
    await comprobarNativo()
    const antes = Date.now()
    publicar({ tipo: 'quien' })
    await new Promise(r => setTimeout(r, 2500))
    for (const id of ids) {
      // Estrictamente posterior: la marca inicial se pone en el mismo milisegundo que `antes` y no cuenta como respuesta.
      if (!vivas().includes(id) || (st.getState().vistaEn[id] ?? 0) > antes) continue
      if (isDesktopRuntime() && alArrancar && puedeDesprender(st.getState().nativo) && await abrirVentana(etiquetaDeVentana(id), rutaDeVentana(id), 'Arbrain', undefined, true)) marcarVida(id)
      else devolverAlPanel(id)
    }
  }
  void revisar(vivas(), true)
  // Si una ventana murió sin despedirse, se nota a lo más en ~15 s.
  const latido = setInterval(() => {
    const muertas = vivas().filter(id => Date.now() - (st.getState().vistaEn[id] ?? 0) > 10_000)
    if (muertas.length) void revisar(muertas, false)
  }, 5000)
  return () => { quitar(); clearInterval(latido); esperas.forEach(clearTimeout); esperas.clear(); coordinando = false }
}
