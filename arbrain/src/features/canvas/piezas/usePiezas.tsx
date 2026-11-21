'use client'
/**
 * Lienzo v17 · las PIEZAS LIBRES dentro de la Pizarra (15 nov 2026). Contrato: `docs/builds/lienzo-v17/MOTOR.md`.
 *
 * Daniel: «que crees que le hace falta al panel para darte mucha mas libertad creativa y no estar anclado a solo las
 * herramientas actuales?». Una pieza es código visual propio (`pieza.html`) que corre DENTRO del lienzo, en UN host
 * compartido por página (`public/piezas/host.js`, un solo iframe `sandbox="allow-scripts"` con CSP sin red), nunca en el
 * documento de la app.
 *
 *   1. Lee cada embed con `pieza: "doc:…/pieza.html"` y relee los archivos cada 500 ms en UN pedido (edición en vivo, < 2 s).
 *   2. Vida (como las islas, `islas/vida.ts`): cámara en movimiento → el host se oculta y TODAS duermen; el lienzo pinta su
 *      póster. Cámara quieta → despiertan las que ocupan la vista (máx. 4): el host las coloca en su caja de pantalla y,
 *      cuando confirma (`colocado`), se muestra. Nada sigue a la cámara por cuadro: no hay desfase entre lienzo y pieza.
 *   3. Pósters: el host fotografía cada pieza (también dormida, sin mostrarla) en cuanto monta o cambia el tema. En memoria
 *      y en el aparato (`islas/posters.ts`), así al abrir la página están desde el primer cuadro.
 *   4. Puntero: el iframe no recibe nada salvo sobre una pieza viva; al salir de ella el host avisa (`fuera`).
 *   5. Botones: `data-ir`/`pieza.ir` → la misma lista blanca de las islas (`islas/destinos.ts`).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CanvasElement, EmbedElement } from '../model/element'
import type { CamaraViva } from '../ui/CamaraViva'
import { ASENTAR_MS } from '../ui/CamaraViva'
import { puntoLocal, worldToScreen, type Viewport } from '../render/viewport'
import { decidirVida } from '../islas/vida'
import { cargarPoster, guardarPoster, posterDe, alCambiarPosters } from '../islas/posters'
import type { Modo, MensajeIsla } from '../islas/protocolo'
import { leerMensaje } from '../islas/protocolo'
import { anotarIsla } from '../render/sonda'
import { documentoHost } from './host-doc'
import { aHost, colocacion, crearConfirmadas, deHost, escalaDelHost, siguientePresupuesto, zoomDeInterfaz, type Medida } from './confirmadas'
import { acotarCss, huellaPieza, leerPieza, ligaPieza, type FichaPieza, type PiezaLeida } from './formato'

export const MAX_VIVAS_PIEZAS = 4
/** Debajo de esto (fps del host con piezas vivas animando), el presupuesto de vivas baja una (meta: 60 fps). */
export const RITMO_MIN = 56

/** Lo que el motor pinta por una pieza: su póster (o nada, si está viva y es transparente). */
export type PinturaPieza = { tipo: 'poster'; poster: ImageBitmap | null; titulo: string; sinMarco?: boolean } | { tipo: 'nada' }

interface Archivo { hash: string; leida: PiezaLeida | null; errores: string[]; leidaEn: number }
interface PiezaEl { elId: string; ruta: string; caja: { x: number; y: number; width: number; height: number } }

// ── el documento del host: runtime, kit y letras, traídos UNA vez por sesión ──
interface Activos { srcdoc: string; fuentes: Array<{ familia: string; estilo: string; peso: string; buffer: ArrayBuffer; data: string }> }
let activos: Promise<Activos> | null = null
const FUENTES = [
  { familia: 'Inter', estilo: 'normal', peso: '100 900', archivo: 'inter.woff2' },
  { familia: 'Cormorant Garamond', estilo: 'normal', peso: '300 700', archivo: 'cormorant.woff2' },
  { familia: 'Cormorant Garamond', estilo: 'italic', peso: '300 700', archivo: 'cormorant-italica.woff2' },
]
const aBase64 = (b: ArrayBuffer) => {
  const u = new Uint8Array(b)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
function traerActivos(): Promise<Activos> {
  if (!activos) {
    activos = (async () => {
      const [runtime, kit] = await Promise.all(['/piezas/host.js', '/piezas/marca.css'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text() })))
      const fuentes = (await Promise.all(FUENTES.map(async f => {
        const buffer = await fetch(`/piezas/fuentes/${f.archivo}`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
        return buffer ? { familia: f.familia, estilo: f.estilo, peso: f.peso, buffer, data: `data:font/woff2;base64,${aBase64(buffer)}` } : null
      }))).filter((x): x is NonNullable<typeof x> => !!x)
      return { srcdoc: documentoHost(runtime, kit), fuentes }
    })()
    activos.catch(() => { activos = null })
  }
  return activos
}

/** Las imágenes de marca, una vez por ruta (Blob: viaja al host sin red). */
const imagenesCache = new Map<string, Promise<Blob | null>>()
function traerImagen(ruta: string): Promise<Blob | null> {
  let p = imagenesCache.get(ruta)
  if (!p) {
    p = fetch(`/api/canvas/imagen?ruta=${encodeURIComponent(ruta)}`).then(r => (r.ok ? r.blob() : null)).catch(() => null)
    imagenesCache.set(ruta, p)
    void p.then(b => { if (!b) imagenesCache.delete(ruta) })
  }
  return p
}

/** La caja de pantalla de una pieza viva (vive en confirmadas.ts, puro). */
export { colocacion }

export interface Piezas {
  esPieza: (id: string) => boolean
  pintura: (el: EmbedElement) => PinturaPieza | null
  /** Las piezas de la página: id del elemento, su caja y sus pasos (para el recorrido). */
  lista: () => Array<{ elId: string; caja: PiezaEl['caja']; pasos: number }>
  pasoDe: (elId: string) => number
  fijarPaso: (elId: string, paso: number) => void
  hay: boolean
  /** Para el componente del host. */
  host: {
    srcdoc: string | null
    registrar: (f: HTMLIFrameElement | null) => void
  }
}

export function usePiezas(p: {
  elements: CanvasElement[]
  camViva: CamaraViva
  viewport: Viewport
  modo: Modo
  recorrido: boolean
  /** Lo que el recorrido aún no revela: ni se despierta. */
  ocultos?: ReadonlySet<string> | null
  ir: (destino: string) => void
  rueda: (m: Extract<MensajeIsla, { tipo: 'rueda' }>, frame: HTMLIFrameElement) => void
  gesto: (m: Extract<MensajeIsla, { tipo: 'gesto' }>, frame: HTMLIFrameElement) => void
  tecla: (m: { key: string; code: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }) => void
  alPintar: () => void
}): Piezas {
  const pRef = useRef(p); pRef.current = p
  const frame = useRef<HTMLIFrameElement | null>(null)
  const listo = useRef(false)
  const [srcdoc, setSrcdoc] = useState<string | null>(null)
  const fuentesRef = useRef<Activos['fuentes']>([])

  // ── 1. ¿Qué elementos son piezas? ──
  const piezasEls = useMemo(() => {
    const out: PiezaEl[] = []
    for (const e of p.elements) {
      if (e.type !== 'embed') continue
      const ruta = ligaPieza((e as EmbedElement & { pieza?: unknown }).pieza)
      if (ruta) out.push({ elId: e.id, ruta, caja: { x: e.x, y: e.y, width: e.width, height: e.height } })
    }
    return out
  }, [p.elements])
  const piezasRef = useRef(piezasEls); piezasRef.current = piezasEls
  const ids = useMemo(() => new Set(piezasEls.map(x => x.elId)), [piezasEls])
  const hay = piezasEls.length > 0
  const rutas = useMemo(() => [...new Set(piezasEls.map(x => x.ruta))].sort().join('\n'), [piezasEls])

  useEffect(() => { if (hay && !srcdoc) void traerActivos().then(a => { fuentesRef.current = a.fuentes; setSrcdoc(a.srcdoc) }).catch(e => anotarIsla('pieza-host-error', { error: String(e) })) }, [hay, srcdoc])

  // ── 2. Los archivos: releídos cada segundo (edición en vivo) ──
  const [archivos, setArchivos] = useState<ReadonlyMap<string, Archivo>>(() => new Map())
  const archivosRef = useRef(archivos); archivosRef.current = archivos
  useEffect(() => {
    const lista = rutas ? rutas.split('\n') : []
    if (!lista.length) return
    let vivo = true, corriendo = 0
    const hashes = new Map<string, string>()
    const vuelta = async () => {
      if (document.visibilityState === 'hidden') return
      if (corriendo) { if (performance.now() - corriendo > 4000) anotarIsla('pieza-sondeo-atorado', { ms: Math.round(performance.now() - corriendo) }); return }
      corriendo = performance.now()
      try {
        // Un solo pedido por segundo para TODAS las piezas de la página (un `stat` por archivo; el texto, solo si cambió).
        const qs = lista.map(ruta => `l=${encodeURIComponent(`doc:${ruta}|${hashes.get(ruta) ?? ''}`)}`).join('&')
        const t0 = performance.now()
        // Un pedido que no contesta no detiene la edición en vivo: a los 3 s se suelta y el siguiente lo intenta.
        const corte = new AbortController()
        const reloj = setTimeout(() => corte.abort(), 3000)
        const resp = await fetch(`/api/canvas/pieza?${qs}`, { cache: 'no-store', signal: corte.signal }).then(x => x.json()).catch(() => null).finally(() => clearTimeout(reloj)) as
          { ok?: boolean; piezas?: Record<string, { ok?: boolean; sinCambio?: boolean; hash?: string; texto?: string; error?: string; mtime?: number }> } | null
        const ms = performance.now() - t0
        if (ms > 250) anotarIsla('pieza-sondeo-lento', { ms: Math.round(ms), en: Date.now() })
        const nuevos = lista.map(ruta => {
          const r = resp?.piezas?.[`doc:${ruta}`]
          if (!r || r.sinCambio) return null
          if (!r.ok || typeof r.texto !== 'string') {
            if (hashes.get(ruta) === 'error') return null
            hashes.set(ruta, 'error')
            return [ruta, { hash: '', leida: null, errores: [r.error ?? 'No se pudo leer la pieza.'], leidaEn: Date.now() } as Archivo] as const
          }
          hashes.set(ruta, r.hash ?? '')
          const l = leerPieza(r.texto)
          anotarIsla('pieza-leida', { ruta, hash: r.hash, en: Date.now(), mtime: r.mtime ?? null })
          const arch: Archivo = l.ok ? { hash: r.hash ?? '', leida: l.pieza, errores: l.pieza.errores, leidaEn: Date.now() } : { hash: r.hash ?? '', leida: null, errores: l.errores, leidaEn: Date.now() }
          return [ruta, arch] as const
        })
        if (!vivo) return
        const cambios = nuevos.filter((x): x is NonNullable<typeof x> => !!x)
        if (cambios.length) setArchivos(prev => { const m = new Map(prev); for (const [k, v] of cambios) m.set(k, v); return m })
      } finally { corriendo = 0 }
    }
    void vuelta()
    // Cada 500 ms: un solo pedido de `stat` para toda la página. Edición en vivo medida en 0.6–1.3 s (meta < 2 s).
    const t = setInterval(() => void vuelta(), 500)
    return () => { vivo = false; clearInterval(t) }
  }, [rutas])

  // ── el canal con el host ──
  const mandar = useCallback((m: unknown, transferir: Transferable[] = []) => {
    const w = frame.current?.contentWindow
    if (w) w.postMessage(m, '*', transferir)
  }, [])
  const enviadas = useRef(new Map<string, string>())   // elId → versión montada en el host
  const fichas = useRef(new Map<string, FichaPieza>())
  const pasos = useRef(new Map<string, number>())
  const imagenesEnviadas = useRef(new Set<string>())
  const pedido = useRef(0)
  const fotosPedidas = useRef(new Map<number, { elId: string; ruta: string; huella: string; modo: Modo; p0: boolean }>())

  /** Las fotos que faltan o están viejas para el tema de ahora (y la del paso 0 si la pieza tiene recorrido). */
  const pedirFotos = useCallback((elId: string) => {
    const pe = piezasRef.current.find(x => x.elId === elId)
    const a = pe ? archivosRef.current.get(pe.ruta) : undefined
    if (!pe || !a?.leida || !listo.current || enviadas.current.get(elId) !== a.hash) return
    const modo = pRef.current.modo
    const variantes: Array<{ p0: boolean }> = [{ p0: false }, ...(a.leida.ficha.pasos > 0 ? [{ p0: true }] : [])]
    for (const v of variantes) {
      const clave = v.p0 ? `${pe.ruta}#p0` : pe.ruta
      const huella = huellaPieza(a.hash, modo, v.p0 ? 0 : 'fin')
      if (posterDe(clave, modo)?.huella === huella) continue
      if ([...fotosPedidas.current.values()].some(f => f.ruta === clave && f.huella === huella)) continue
      const n = ++pedido.current
      fotosPedidas.current.set(n, { elId, ruta: clave, huella, modo, p0: v.p0 })
      mandar({ tipo: 'foto', id: elId, pedido: n, escala: 1, ...(v.p0 ? { paso: 0 } : {}) })
    }
  }, [mandar])

  const enviarPiezas = useCallback(async () => {
    if (!listo.current) return
    for (const pe of piezasRef.current) {
      const a = archivosRef.current.get(pe.ruta)
      if (!a?.leida || enviadas.current.get(pe.elId) === a.hash) continue
      const l = a.leida
      enviadas.current.set(pe.elId, a.hash)
      fichas.current.set(pe.elId, l.ficha)
      // Una viva que se vuelve a montar pierde su confirmación: su póster vuelve hasta que el host la confirme otra vez.
      conf.current.olvidar(pe.elId)
      // Las imágenes primero (el host las tiene antes de correr el script de la pieza).
      await Promise.all(l.ficha.imagenes.filter(r => !imagenesEnviadas.current.has(r)).map(async ruta => {
        const blob = await traerImagen(ruta)
        if (blob) { imagenesEnviadas.current.add(ruta); mandar({ tipo: 'imagen', ruta, blob }) }
        else anotarIsla('pieza-imagen-falta', { ruta })
      }))
      mandar({ tipo: 'pieza', id: pe.elId, version: a.hash, ficha: l.ficha, css: acotarCss(l.cssCrudo, pe.elId), html: l.html, js: l.js, errores: l.errores })
    }
    // Lo que ya no está en la página sale del host.
    for (const id of [...enviadas.current.keys()]) if (!piezasRef.current.some(x => x.elId === id)) { mandar({ tipo: 'quitar', id }); enviadas.current.delete(id); fichas.current.delete(id) }
  }, [mandar])

  // Las fotos guardadas en el aparato, desde el primer cuadro.
  useEffect(() => {
    for (const r of rutas ? rutas.split('\n') : []) { void cargarPoster(r, p.modo); void cargarPoster(`${r}#p0`, p.modo) }
  }, [rutas, p.modo])
  useEffect(() => alCambiarPosters(() => pRef.current.alPintar()), [])

  // ── el compás: un `tic` por cuadro al host mientras se ve con piezas vivas (WebKit limita a 30 fps el rAF de un iframe
  //    de otro origen sin interacción; el lienzo no está limitado). Se apaga solo al ocultarse. ──
  const compasRaf = useRef(0)
  const compas = useCallback(() => {
    if (compasRaf.current) return
    const tic = () => {
      const f = frame.current
      if (!f || f.style.visibility !== 'visible' || !vivas.current.length) { compasRaf.current = 0; return }
      f.contentWindow?.postMessage({ tipo: 'tic' }, '*')
      compasRaf.current = requestAnimationFrame(tic)
    }
    compasRaf.current = requestAnimationFrame(tic)
  }, [])
  useEffect(() => () => { if (compasRaf.current) cancelAnimationFrame(compasRaf.current) }, [])

  // ── 3. Vida ──
  const vivas = useRef<string[]>([])
  /**
   * El PRESUPUESTO de vivas (lazo de control): empieza en MAX_VIVAS_PIEZAS y, si el host reporta menos de RITMO_MIN fps
   * con varias vivas, baja a una menos (la más chica se duerme: queda su póster). Solo baja; vuelve a empezar al cambiar
   * de página o de ventana. Así 60 fps no depende de lo pesado que Levy escriba una pieza ni de la máquina.
   */
  const presupuesto = useRef(MAX_VIVAS_PIEZAS)
  const moviendo = useRef(false)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoColocar = useRef(0)
  /** Lo que el host CONFIRMÓ con la cámara y la vista de ahora (piezas/confirmadas.ts): sin eso, póster. */
  const conf = useRef(crearConfirmadas())
  /** El ancho de la ventana del host en SUS px (lo dice él): con el zoom de interfaz no es el del lienzo. */
  const anchoHost = useRef<number | null>(null)
  const kEnviada = useRef(1)
  const escalaHost = () => {
    // Medida exacta: (px de cliente por px del lienzo, del contenedor) × (px del host por px de cliente, del iframe). Los
    // anchos de layout son enteros y a zoom 1.5 eso ya pasa de 1 px en una pantalla de 2048 (medido: 2.46 px).
    const f = frame.current, w = f?.parentElement, ah = anchoHost.current, vw = pRef.current.viewport.width
    if (f && w && ah) {
      const fr = f.getBoundingClientRect().width, wr = w.getBoundingClientRect().width
      if (fr > 0 && wr > 0 && vw > 0) { const k = (vw / wr) * (fr / ah); return Math.abs(k - 1) < 1e-4 ? 1 : k }
    }
    return escalaDelHost(vw, ah, zoomDeInterfaz())
  }
  const ocultar = useCallback(() => {
    const f = frame.current
    if (f) { f.style.visibility = 'hidden'; f.style.pointerEvents = 'none' }
  }, [])
  const decidir = useCallback(() => {
    if (!listo.current || moviendo.current) return
    const cam = pRef.current.camViva.ref.current, vp = pRef.current.viewport
    const cajas = piezasRef.current.filter(x => fichas.current.has(x.elId) && !pRef.current.ocultos?.has(x.elId)).map(x => ({ id: x.elId, caja: x.caja }))
    const d = decidirVida([], cajas, cam, vp, false, presupuesto.current)
    const antes = vivas.current
    vivas.current = d.despiertas
    const lista = d.despiertas.map(id => ({ id, ...colocacion(cajas.find(c => c.id === id)!.caja, fichas.current.get(id)!, cam, vp) }))
    // La misma colocación ya pedida con esta cámara: no se vuelve a mandar (ni se reinicia el ritmo ni parpadea nada).
    const pide = conf.current.pedir(lista, pedido.current + 1)
    if (pide) {
      pedido.current = pide.pedido
      ultimoColocar.current = pide.pedido
      const k = escalaHost()
      kEnviada.current = k
      mandar({ tipo: 'colocar', pedido: pide.pedido, vivas: lista.map(c => aHost(c, k)) })
    }
    if (!lista.length) ocultar()
    if (antes.join() !== d.despiertas.join()) { anotarIsla('piezas-vivas', { vivas: d.despiertas, en: Date.now() }); pRef.current.alPintar() }
  }, [mandar, ocultar])
  useEffect(() => {
    const cam = p.camViva
    let ultima = cam.ref.current
    const alMover = () => {
      const c = cam.ref.current
      if (c.x === ultima.x && c.y === ultima.y && c.zoom === ultima.zoom) return
      ultima = c
      if (!moviendo.current) {
        moviendo.current = true
        conf.current.invalidar()
        ocultar()
        if (vivas.current.length) { vivas.current = []; mandar({ tipo: 'dormir' }); pRef.current.alPintar() }
      }
      if (reloj.current) clearTimeout(reloj.current)
      reloj.current = setTimeout(() => { reloj.current = null; moviendo.current = false; decidir() }, ASENTAR_MS)
    }
    const baja = cam.suscribir(alMover)
    return () => { baja(); if (reloj.current) clearTimeout(reloj.current) }
  }, [p.camViva, decidir, mandar, ocultar])
  // Otra vista (plegar la barra, mover el borde del panel): las cajas de pantalla cambian aunque la cámara no. Se oculta
  // ANTES de pintar y se vuelve a pedir; hasta su confirmación se ven los pósters.
  useLayoutEffect(() => { if (conf.current.invalidar()) ocultar() }, [p.viewport.width, p.viewport.height, ocultar])
  useEffect(() => { decidir() }, [piezasEls, p.viewport, p.ocultos, decidir])
  // El presupuesto vuelve a empezar solo con otra página: dentro de una, solo baja (no oscila con la cámara quieta).
  useEffect(() => { presupuesto.current = MAX_VIVAS_PIEZAS }, [rutas])
  useEffect(() => { void enviarPiezas().then(() => decidir()) }, [archivos, piezasEls, enviarPiezas, decidir])

  // ── el tema y el recorrido ──
  useEffect(() => {
    mandar({ tipo: 'tema', modo: p.modo })
    for (const pe of piezasRef.current) pedirFotos(pe.elId)
  }, [p.modo, mandar, pedirFotos])
  useEffect(() => {
    mandar({ tipo: 'recorrido', activo: p.recorrido })
    if (!p.recorrido) pasos.current.clear()
    pRef.current.alPintar()
  }, [p.recorrido, mandar])

  // ── 4. Los mensajes del host ──
  useEffect(() => {
    const oir = (e: MessageEvent) => {
      const f = frame.current
      if (!f || e.source !== f.contentWindow) return
      const d = e.data as Record<string, unknown> | null
      if (!d || typeof d !== 'object') return
      switch (d.tipo) {
        case 'vista': {
          const antes = escalaHost()
          anchoHost.current = Number(d.ancho) || null
          if (Math.abs(escalaHost() - antes) > 1e-6) { if (conf.current.invalidar()) ocultar(); decidir() }
          return
        }
        case 'hola':
          anchoHost.current = Number(d.ancho) || null
          listo.current = true
          enviadas.current.clear()
          if (conf.current.invalidar()) ocultar()
          mandar({ tipo: 'fuentes', lista: fuentesRef.current.map(x => ({ familia: x.familia, estilo: x.estilo, peso: x.peso, buffer: x.buffer.slice(0), data: x.data })) })
          mandar({ tipo: 'tema', modo: pRef.current.modo })
          mandar({ tipo: 'recorrido', activo: pRef.current.recorrido })
          imagenesEnviadas.current.clear()
          void enviarPiezas().then(() => decidir())
          anotarIsla('pieza-host', { en: Date.now() })
          return
        case 'montada': {
          const elId = String(d.id)
          anotarIsla('pieza-montada', { isla: elId, version: d.version, ms: d.ms, en: Date.now() })
          pedirFotos(elId)
          // Una pieza que se rehace viva se vuelve a pedir y a confirmar (olvidada al enviarla).
          decidir()
          return
        }
        case 'error':
          anotarIsla('pieza-error', { isla: d.id, mensaje: d.mensaje })
          return
        case 'colocado': {
          // El host dice su ancho al confirmar: si la escala cambió desde el pedido (la vista se movió), se vuelve a pedir.
          if (Number(d.ancho) > 0) anchoHost.current = Number(d.ancho)
          const k = escalaHost()
          if (d.pedido === ultimoColocar.current && Math.abs(k - kEnviada.current) > 1e-6) { if (conf.current.invalidar()) ocultar(); decidir(); return }
          const medidas = Array.isArray(d.medidas) ? (d.medidas as Medida[]).map(m => deHost(m, k)) : undefined
          const r = conf.current.confirmar(Number(d.pedido), medidas, id => fichas.current.get(id)?.ancho)
          if (r.malas.length) { ocultar(); anotarIsla('piezas-colocacion-falsa', { pedido: d.pedido, malas: r.malas, en: Date.now() }); pRef.current.alPintar(); return }
          if (r.mostrar && d.pedido === ultimoColocar.current && !moviendo.current && vivas.current.length && frame.current) {
            frame.current.style.visibility = 'visible'
            compas()
            anotarIsla('piezas-colocadas', { vivas: vivas.current, en: Date.now() })
            pRef.current.alPintar()
          }
          return
        }
        case 'foto': {
          const ped = fotosPedidas.current.get(Number(d.pedido))
          fotosPedidas.current.delete(Number(d.pedido))
          const bmp = d.bitmap as ImageBitmap | null
          if (!ped || !bmp) { if (d.error) anotarIsla('pieza-foto-error', { isla: d.id, error: d.error }); return }
          const a = archivosRef.current.get(ped.ruta.replace(/#p0$/, ''))
          if (!a || huellaPieza(a.hash, ped.modo, ped.p0 ? 0 : 'fin') !== ped.huella) { bmp.close?.(); return }
          guardarPoster(ped.ruta, ped.modo, bmp, ped.huella, [])
          anotarIsla('pieza-foto', { isla: ped.elId, p0: ped.p0, ms: d.ms, en: Date.now() })
          return
        }
        case 'accion':
          anotarIsla('pieza-accion', { isla: d.id, destino: d.destino })
          if (typeof d.destino === 'string') pRef.current.ir(d.destino)
          return
        case 'fuera':
          if (frame.current) frame.current.style.pointerEvents = 'none'
          return
        case 'tecla':
          pRef.current.tecla({ key: String(d.key), code: String(d.code), shiftKey: !!d.shiftKey, metaKey: !!d.metaKey, ctrlKey: !!d.ctrlKey, altKey: !!d.altKey })
          return
        case 'ritmo': {
          const fps = Number(d.fps)
          const ahora = siguientePresupuesto(presupuesto.current, { fps, vivas: vivas.current.length, minimo: RITMO_MIN, confirmado: conf.current.visible() && !moviendo.current })
          if (ahora !== presupuesto.current) {
            presupuesto.current = ahora
            anotarIsla('piezas-presupuesto', { fps, vivas: vivas.current.length, ahora: presupuesto.current })
            decidir()
          }
          return
        }
        case 'medida':
          anotarIsla('piezas-medida', { ...d })
          return
        default: {
          const m = leerMensaje(d)
          // El punto llega en px del host: a px de CLIENTE desde el borde del iframe (vale con o sin zoom de interfaz).
          const fr = f.getBoundingClientRect(), c = anchoHost.current ? fr.width / anchoHost.current : 1
          if (m?.tipo === 'rueda') pRef.current.rueda({ ...m, x: m.x * c, y: m.y * c }, f)
          else if (m?.tipo === 'gesto') pRef.current.gesto({ ...m, x: m.x * c, y: m.y * c }, f)
        }
      }
    }
    window.addEventListener('message', oir)
    return () => window.removeEventListener('message', oir)
  }, [mandar, enviarPiezas, decidir, pedirFotos, ocultar])

  // ── 5. El puntero: sobre una pieza viva, el iframe lo toma ──
  useEffect(() => {
    if (!hay) return
    const mover = (e: PointerEvent) => {
      const f = frame.current
      if (!f || f.style.visibility !== 'visible' || !vivas.current.length) return
      const r = f.getBoundingClientRect()
      const cam = pRef.current.camViva.ref.current, vp = pRef.current.viewport
      // Del cliente (con el zoom de interfaz) a px de layout del lienzo, como `puntoLocal`.
      const { x, y } = puntoLocal(e.clientX, e.clientY, r, vp.width, vp.height)
      const dentro = vivas.current.some(id => {
        const pe = piezasRef.current.find(z => z.elId === id)
        if (!pe) return false
        const tl = worldToScreen({ x: pe.caja.x, y: pe.caja.y }, cam, vp)
        return x >= tl.x && y >= tl.y && x <= tl.x + pe.caja.width * cam.zoom && y <= tl.y + pe.caja.height * cam.zoom
      })
      f.style.pointerEvents = dentro ? 'auto' : 'none'
    }
    window.addEventListener('pointermove', mover, true)
    return () => window.removeEventListener('pointermove', mover, true)
  }, [hay])

  // La sonda: medir los cuadros del host desde una prueba (`scripts/qa/medir-piezas.mjs`).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __lienzoPerf?: Record<string, unknown> }
    if (!w.__lienzoPerf) return
    w.__lienzoPerf.medirPiezas = (ms = 3000) => { const n = ++pedido.current; mandar({ tipo: 'medir', pedido: n, ms }); return n }
    w.__lienzoPerf.piezasVivas = () => [...vivas.current]
  }, [mandar, hay])

  const registrar = useCallback((f: HTMLIFrameElement | null) => {
    if (frame.current !== f) { listo.current = false; enviadas.current.clear(); conf.current.invalidar() }
    frame.current = f
  }, [])

  return {
    esPieza: id => ids.has(id),
    hay,
    lista: () => piezasRef.current.map(x => ({ elId: x.elId, caja: x.caja, pasos: fichas.current.get(x.elId)?.pasos ?? 0 })),
    pasoDe: elId => pasos.current.get(elId) ?? 0,
    fijarPaso: (elId, paso) => {
      const max = fichas.current.get(elId)?.pasos ?? 0
      const n = Math.max(0, Math.min(max, paso))
      pasos.current.set(elId, n)
      mandar({ tipo: 'paso', id: elId, paso: n })
      pRef.current.alPintar()
    },
    pintura: el => {
      const pe = piezasRef.current.find(x => x.elId === el.id)
      if (!pe) return null
      const a = archivos.get(pe.ruta)
      const ficha = a?.leida?.ficha ?? fichas.current.get(el.id)
      const titulo = a && !a.leida ? (a.errores[0] ?? 'Pieza') : (ficha?.titulo ?? 'Leyendo la pieza…')
      // Viva y transparente: el host la pinta encima; el póster debajo se vería doble.
      // Solo CONFIRMADA (el host la colocó con la cámara de ahora): antes de eso el marco nunca queda vacío.
      if (ficha?.fondo === 'transparente' && conf.current.confirmada(el.id) && frame.current?.style.visibility === 'visible') return { tipo: 'nada' }
      const enInicio = p.recorrido && (ficha?.pasos ?? 0) > 0 && (pasos.current.get(el.id) ?? 0) === 0
      const poster = (enInicio ? posterDe(`${pe.ruta}#p0`, p.modo) : null) ?? posterDe(pe.ruta, p.modo)
      // Lienzo v18: una pieza transparente vive DENTRO de una tarjeta nativa (Kennedy, la escalera, Supernova): su póster va
      // sin el marco de ventana, para que de lejos pieza y lienzo sean un solo dibujo. Sin póster todavía, sí lleva su tarjeta.
      return { tipo: 'poster', poster: poster?.bitmap ?? null, titulo, sinMarco: ficha?.fondo === 'transparente' && !!poster }
    },
    host: { srcdoc, registrar },
  }
}

/**
 * El HOST de la página: un solo iframe aislado sobre el lienzo, del tamaño de la vista. Oculto y sin puntero salvo cuando
 * hay piezas vivas colocadas (la vida la decide `usePiezas`, por estilo directo: sin pasar por React en cada movimiento).
 */
export function HostPiezas({ piezas, viewport }: { piezas: Piezas; viewport: Viewport }) {
  if (!piezas.hay || !piezas.host.srcdoc) return null
  return (
    <iframe ref={piezas.host.registrar} title="Piezas del lienzo" sandbox="allow-scripts" srcDoc={piezas.host.srcdoc}
      data-piezas-host=""
      style={{
        // El ZOOM DE INTERFAZ (⌘+, `zoom` en <html>, ZoomController) se NEUTRALIZA en el host, como `.calendarGeometry`:
        // WKWebView no reacomoda el contenido de un iframe cuando cambia el zoom de su raíz (medido en un WKWebView real:
        // la caja interna se queda en su sitio de antes; Daniel la vio 1.21× y corrida a zoom ~1.2). Con zoom efectivo 1 y
        // el tamaño × --ui-zoom, el host cubre lo mismo en pantalla y sus px son px de pantalla; `usePiezas` calibra la
        // escala con el ancho que el host mide de sí mismo (confirmadas.ts › escalaDelHost).
        zoom: 'calc(1 / var(--ui-zoom, 1))',
        position: 'absolute', left: 0, top: 0, width: `calc(${viewport.width}px * var(--ui-zoom, 1))`, height: `calc(${viewport.height}px * var(--ui-zoom, 1))`, border: 'none',
        background: 'transparent', colorScheme: 'normal', visibility: 'hidden', pointerEvents: 'none', zIndex: 1,
      }} />
  )
}
