'use client'
/**
 * Mapa v16 · las islas dentro de la Pizarra (14 nov 2026): el pegamento entre el lienzo y `puente.ts`, `vida.ts` y
 * `posters.ts`.
 *
 *   1. Resuelve cada embed `doc:…html`: si trae `isla.json` (lo dice `/api/canvas/doc`), es una isla.
 *   2. Vida: escucha la cámara VIVA (fuera de React). Al primer cuadro de movimiento todas duermen (se ve su foto); tras
 *      ASENTAR_MS quieta, `decidirVida` despierta las que ocupan la vista (máx. 4 montadas, LRU).
 *   3. Fotos: las guardadas en el aparato se cargan al abrir (sin montar un iframe). Si una isla no tiene foto o su huella
 *      cambió (otro dato, otro tema, otro archivo), se REVELA en reposo: se monta oculta, pinta, manda su foto y se desmonta.
 *   4. Datos: el puente relee lo suscrito cada minuto y al volver a la ventana.
 *
 * El estado de vida es un almacén externo (como la cámara viva): cada `IslaEmbed` se suscribe al suyo y React solo vuelve
 * a pintar esa isla cuando cambia, nunca la Pizarra entera por cuadro.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CanvasElement, EmbedElement } from '../model/element'
import { esHTML, leerLigaDoc } from '../model/doc'
import type { CamaraViva } from '../ui/CamaraViva'
import { ASENTAR_MS } from '../ui/CamaraViva'
import type { Viewport } from '../render/viewport'
import { resolverDoc } from '../ui/DocEmbed'
import { fuenteFresca } from '@/features/cabina/datos'
import { useModoDirecto } from '@/shared/stores/modo-directo-store'
import { CLAVE_DIRECTO } from '@/lib/modo-directo/cubrir'
import { esEdicionCliente } from '@/lib/edicion'
import { PuenteIslas } from './puente'
import { decidirVida } from './vida'
import { leerFuente } from './fuentes'
import { urlsApp } from './urls-app'
import { cargarPoster, guardarPoster, posterDe, alCambiarPosters } from './posters'
import { AlmacenFuentes } from './almacen'
import {
  DURACION_IMPULSO, detectar, fotoAgentes, fotoCohorte, fotoMovimientos, fotoRutinas, fotoVideos, impulsosDe, islaDeOrgano,
  type EventoVivo, type Foto, type Impulso,
} from './eventos'
import { prepararIsla, type IslaLista } from './modelo'
import { leerDestino, type DestinoIsla } from './destinos'
import type { FichaIsla, MensajeIsla, Modo } from './protocolo'
import { anotarIsla, exponerEventos } from '../render/sonda'

export interface InfoIsla { id: string; ruta: string; hash: string; url: string; ficha: FichaIsla }
/** Lo que el motor necesita para pintar una isla: la foto de una HTML, o la receta lista de una nativa. */
export type PinturaIsla =
  | { tipo: 'poster'; poster: ImageBitmap | null; titulo: string; sinMarco?: boolean }
  | { tipo: 'receta'; isla: IslaLista; leer: AlmacenFuentes['get']; modo: Modo; version: number }
  | { tipo: 'rota'; titulo: string; errores: string[] }
  /** Lienzo v17: una pieza libre viva y transparente (la pinta su host encima; el lienzo no pinta nada debajo). */
  | { tipo: 'nada' }
/** Una isla nativa: su receta lista o por qué no se pudo leer. `liga` si vive en un archivo. */
export interface Nativa { lista: IslaLista | null; errores: string[]; liga?: string }
export type EstadoIsla = 'fuera' | 'dormida' | 'despierta' | 'revelando'

const EDAD_MS = 60_000
const directoRecordado = () => { try { return typeof window !== 'undefined' && window.localStorage.getItem(CLAVE_DIRECTO) === '1' } catch { return false } }

/** El almacén de vida: quién está montada, despierta o revelándose. */
class Vida {
  lru: string[] = []
  despiertas = new Set<string>()
  revelando: string | null = null
  moviendo = false
  private subs = new Set<() => void>()
  private fotos = new Map<string, EstadoIsla>()
  suscribir = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn) } }
  estadoDe = (id: string): EstadoIsla => this.fotos.get(id) ?? 'fuera'
  publicar() {
    const nuevo = new Map<string, EstadoIsla>()
    for (const id of this.lru) nuevo.set(id, this.despiertas.has(id) ? 'despierta' : 'dormida')
    if (this.revelando && !nuevo.has(this.revelando)) nuevo.set(this.revelando, 'revelando')
    let cambio = nuevo.size !== this.fotos.size
    if (!cambio) for (const [k, v] of nuevo) if (this.fotos.get(k) !== v) { cambio = true; break }
    if (!cambio) return
    this.fotos = nuevo
    for (const fn of this.subs) fn()
  }
}

export interface Islas {
  /** La isla de este embed (null: no es isla o aún no se sabe). */
  infoDe: (el: EmbedElement) => InfoIsla | null
  esIsla: (id: string) => boolean
  vida: Vida
  /** El iframe de una isla montada (o null al desmontarse). */
  registrarFrame: (id: string, frame: HTMLIFrameElement | null) => void
  /** Para el motor: cómo se pinta la isla de este embed, o null si no es isla. */
  pintura: (el: EmbedElement) => PinturaIsla | null
  /** Las islas NATIVAS de la página (receta lista o su error), por id de elemento. */
  nativaDe: (id: string) => Nativa | null
  almacen: AlmacenFuentes
  /** Un botón de una isla nativa: lista blanca y freno anti doble disparo, como el puente de las HTML. */
  ir: (destino: string) => void
  /** Los impulsos vivos ahora (eventos reales viajando por los hilos) y si queda alguno (el motor pide cuadros solo entonces). */
  impulsos: (ahora: number) => Array<Impulso & { u: number }>
  /** El halo de las islas que acaban de recibir un evento (0..1, se apaga solo). */
  halos: (ahora: number) => Array<{ elId: string; fuerza: number; dolor: boolean }>
  modo: Modo
  /** El puente: cada IslaEmbed registra en él la ventana de su iframe. */
  puente: PuenteIslas
}

export function useIslas(p: {
  elements: CanvasElement[]
  camViva: CamaraViva
  viewport: Viewport
  modo: Modo
  abrir: (d: DestinoIsla) => void
  esPropia: (u: URL) => boolean
  rueda: (m: Extract<MensajeIsla, { tipo: 'rueda' }>, frame: HTMLIFrameElement) => void
  gesto: (m: Extract<MensajeIsla, { tipo: 'gesto' }>, frame: HTMLIFrameElement) => void
  alPintar: () => void
  /** Pide un cuadro al motor sin pasar por React (los impulsos se animan así). */
  pedirCuadro: () => void
}): Islas {
  const [infos, setInfos] = useState<ReadonlyMap<string, InfoIsla>>(() => new Map())
  const infosRef = useRef(infos); infosRef.current = infos
  const frames = useRef(new Map<string, HTMLIFrameElement>())
  const vida = useMemo(() => new Vida(), [])
  const pRef = useRef(p); pRef.current = p
  const modoRef = useRef(p.modo); modoRef.current = p.modo
  const pendientes = useRef(new Set<string>())
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const relojRevelado = useRef<ReturnType<typeof setTimeout> | null>(null)

  const directo = useModoDirecto(s => s.prendido)
  const confirmado = useModoDirecto(s => s.confirmado)
  const ctxRef = useRef({ directo: false, cliente: esEdicionCliente() })
  ctxRef.current = { directo: directo || (!confirmado && directoRecordado()), cliente: esEdicionCliente() }

  const almacen = useMemo(() => new AlmacenFuentes(f => leerFuente(f, urlsApp(), ctxRef.current, async url => {
    const data = await fuenteFresca<unknown>(url, EDAD_MS)
    return data === undefined ? { error: 'La fuente no respondió.' } : { data }
  })), [])
  const puente = useMemo(() => new PuenteIslas({
    leerFuente: f => almacen.leer(f),
    abrir: d => pRef.current.abrir(d),
    esPropia: u => pRef.current.esPropia(u),
    rueda: (id, m) => { const f = frames.current.get(id); if (f) pRef.current.rueda(m, f) },
    gesto: (id, m) => { const f = frames.current.get(id); if (f) pRef.current.gesto(m, f) },
    quiereFoto: (id, huella) => {
      const i = infosRef.current.get(id)
      if (!i) return false
      const actual = posterDe(i.ruta, modoRef.current)
      return !actual || actual.huella !== huella
    },
    puedeFotografiar: () => !vida.moviendo,
    alFoto: (id, bitmap, huella, ms) => {
      const i = infosRef.current.get(id)
      if (!i) { bitmap.close?.(); return }
      guardarPoster(i.ruta, modoRef.current, bitmap, huella, puente.fuentesDe(id))
      anotarIsla('foto', { isla: id, ficha: i.ficha.id, ms: ms ?? null })
      pendientes.current.delete(id)
      if (vida.revelando === id) { vida.revelando = null; vida.publicar() }
      programarRevelado()
    },
    medir: (evento, datos) => anotarIsla(evento, datos),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [vida])

  // ── 1. ¿Qué embeds son islas? ──
  const rutas = useMemo(() => p.elements.filter((e): e is EmbedElement => e.type === 'embed' && !!leerLigaDoc(e.url) && esHTML(leerLigaDoc(e.url)!.ruta))
    .map(e => `${e.id}\u0000${e.url}`).join('\n'), [p.elements])
  useEffect(() => {
    let vivo = true
    const pares = rutas ? rutas.split('\n').map(s => s.split('\u0000') as [string, string]) : []
    void Promise.all(pares.map(async ([id, url]) => {
      const r = await resolverDoc(url)
      return r.ok && r.isla && r.url ? [id, { id, ruta: leerLigaDoc(url)!.ruta, hash: r.hash ?? '', url: r.url, ficha: r.isla } as InfoIsla] as const : null
    })).then(lista => {
      if (!vivo) return
      const m = new Map<string, InfoIsla>()
      for (const x of lista) if (x) m.set(x[0], x[1])
      setInfos(prev => (prev.size === m.size && [...m].every(([k, v]) => prev.get(k)?.hash === v.hash && prev.get(k)?.url === v.url) ? prev : m))
    })
    return () => { vivo = false }
  }, [rutas])

  // ── 1b. Islas NATIVAS: la receta en el elemento o en un archivo releído cada segundo (edición en vivo) ──
  const [archivos, setArchivos] = useState<ReadonlyMap<string, { hash: string; crudo: unknown; error?: string }>>(() => new Map())
  const ligasArchivo = useMemo(() => [...new Set(p.elements.flatMap(e => e.type === 'embed' && typeof e.isla === 'string' && /^doc:.+\.json$/i.test(e.isla) ? [e.isla] : []))].sort().join('\n'), [p.elements])
  useEffect(() => {
    const ligas = ligasArchivo ? ligasArchivo.split('\n') : []
    if (!ligas.length) return
    let vivo = true, corriendo = false
    const hashes = new Map<string, string>()
    const vuelta = async () => {
      if (corriendo || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return
      corriendo = true
      try {
        const nuevos = await Promise.all(ligas.map(async liga => {
          const h = hashes.get(liga)
          const r = await fetch(`/api/canvas/receta?liga=${encodeURIComponent(liga)}${h ? `&hash=${encodeURIComponent(h)}` : ''}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null) as { ok?: boolean; sinCambio?: boolean; hash?: string; receta?: unknown; error?: string } | null
          if (!r || r.sinCambio) return null
          if (!r.ok) return [liga, { hash: '', crudo: null, error: r.error ?? 'No se pudo leer la receta.' }] as const
          hashes.set(liga, r.hash ?? '')
          anotarIsla('receta-leida', { liga, hash: r.hash })
          return [liga, { hash: r.hash ?? '', crudo: r.receta ?? null, ...(r.error ? { error: r.error } : {}) }] as const
        }))
        if (!vivo) return
        const cambios = nuevos.filter((x): x is NonNullable<typeof x> => !!x)
        if (cambios.length) setArchivos(prev => { const m = new Map(prev); for (const [k, v] of cambios) m.set(k, v); return m })
      } finally { corriendo = false }
    }
    void vuelta()
    const t = setInterval(() => void vuelta(), 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [ligasArchivo])

  const nativas = useMemo(() => {
    const m = new Map<string, Nativa>()
    for (const e of p.elements) {
      if (e.type !== 'embed' || e.isla === undefined || e.isla === null) continue
      const liga = typeof e.isla === 'string' ? e.isla : undefined
      const arch = liga ? archivos.get(liga) : undefined
      if (liga && !arch) { m.set(e.id, { lista: null, errores: [], liga }); continue }
      if (arch?.error && arch.crudo === null) { m.set(e.id, { lista: null, errores: [arch.error], liga }); continue }
      const r = prepararIsla(liga ? arch!.crudo : e.isla, pRef.current.esPropia)
      m.set(e.id, r.ok ? { lista: r.isla, errores: r.isla.errores, ...(liga ? { liga } : {}) } : { lista: null, errores: r.errores, ...(liga ? { liga } : {}) })
    }
    return m
  }, [p.elements, archivos])
  const nativasRef = useRef(nativas); nativasRef.current = nativas
  // Las fuentes de todas las islas nativas: se piden ya (los números se ven vivos también de lejos) y el canvas repinta al llegar.
  const fuentesNativas = useMemo(() => [...new Set([...nativas.values()].flatMap(n => n.lista?.fuentes ?? []))].sort().join('|'), [nativas])
  useEffect(() => { if (fuentesNativas) almacen.asegurar(fuentesNativas.split('|')) }, [fuentesNativas, almacen])
  useEffect(() => almacen.alCambiar(() => pRef.current.alPintar()), [almacen])

  // ── 2. Vida ──
  const cajas = useMemo(() => {
    const out: Array<{ id: string; caja: { x: number; y: number; width: number; height: number } }> = []
    for (const e of p.elements) if (e.type === 'embed' && (infos.has(e.id) || nativas.get(e.id)?.lista)) out.push({ id: e.id, caja: { x: e.x, y: e.y, width: e.width, height: e.height } })
    return out
  }, [p.elements, infos, nativas])
  const cajasRef = useRef(cajas); cajasRef.current = cajas
  const vpRef = useRef(p.viewport); vpRef.current = p.viewport

  const decidir = useCallback(() => {
    const lruAntes = vida.lru
    const d = decidirVida(vida.lru, cajasRef.current, p.camViva.ref.current, vpRef.current, vida.moviendo)
    const antes = vida.despiertas
    vida.lru = d.lru
    vida.despiertas = new Set(d.despiertas)
    for (const id of antes) if (!vida.despiertas.has(id)) puente.vida(id, false)
    if (vida.revelando && vida.lru.includes(vida.revelando)) vida.revelando = null
    vida.publicar()
    for (const id of vida.despiertas) {
      if (!antes.has(id)) anotarIsla('decide-despertar', { isla: id, ficha: infosRef.current.get(id)?.ficha.id ?? null, montada: lruAntes.includes(id) })
      puente.vida(id, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vida, puente, p.camViva])

  useEffect(() => {
    let ultima = p.camViva.ref.current
    const alMover = () => {
      const c = p.camViva.ref.current
      if (c.x === ultima.x && c.y === ultima.y && c.zoom === ultima.zoom) return   // el aviso de «asentado» no es movimiento
      ultima = c
      if (!vida.moviendo) {
        vida.moviendo = true
        if (vida.despiertas.size) { for (const id of vida.despiertas) puente.vida(id, false); vida.despiertas = new Set(); vida.publicar() }
      }
      if (reloj.current) clearTimeout(reloj.current)
      reloj.current = setTimeout(() => {
        reloj.current = null
        vida.moviendo = false
        decidir()
        puente.fotografiarPendientes()
        programarRevelado()
      }, ASENTAR_MS)
    }
    const baja = p.camViva.suscribir(alMover)
    return () => { baja(); if (reloj.current) clearTimeout(reloj.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.camViva, vida, puente, decidir])
  // Nuevas islas, otra página u otro tamaño de ventana: se decide de nuevo (si la cámara está quieta).
  useEffect(() => { if (!vida.moviendo) decidir() }, [cajas, p.viewport, decidir, vida])

  // ── 3. Fotos: las del aparato al abrir; revelar en reposo las que faltan o están viejas ──
  const programarRevelado = useCallback(() => {
    if (relojRevelado.current) return
    relojRevelado.current = setTimeout(() => {
      relojRevelado.current = null
      if (vida.moviendo || vida.revelando) return
      const siguiente = [...pendientes.current].find(id => infosRef.current.has(id) && !vida.lru.includes(id))
      // Las montadas se fotografían solas al avisar `listo`; aquí solo las que no tienen iframe.
      for (const id of pendientes.current) if (vida.lru.includes(id)) puente.quizaFoto(id)
      if (!siguiente) return
      vida.revelando = siguiente
      vida.publicar()
      const t0 = performance.now()
      setTimeout(() => {   // una isla que nunca contesta no bloquea a las demás
        if (vida.revelando !== siguiente) return
        anotarIsla('revelado-vencido', { isla: infosRef.current.get(siguiente)?.ficha.id ?? siguiente, ms: performance.now() - t0 })
        pendientes.current.delete(siguiente)
        vida.revelando = null
        vida.publicar()
        programarRevelado()
      }, 8000)
    }, 250)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vida, puente])

  const revisarFotos = useCallback(async () => {
    const modo = modoRef.current
    await Promise.all([...infosRef.current.values()].map(async i => {
      const guardada = await cargarPoster(i.ruta, modo)
      const fuentes = guardada?.fuentes ?? i.ficha.fuentes
      await puente.precargar(fuentes)
      const esperada = puente.huellaEsperada(i.hash, fuentes)
      if (!guardada || (esperada && guardada.huella !== esperada)) pendientes.current.add(i.id)
      else pendientes.current.delete(i.id)
    }))
    programarRevelado()
  }, [puente, programarRevelado])

  useEffect(() => { puente.ponerTema(p.modo) }, [p.modo, puente])
  useEffect(() => { void revisarFotos() }, [infos, p.modo, revisarFotos])
  useEffect(() => alCambiarPosters(() => pRef.current.alPintar()), [])

  // ── 4. Datos: cada minuto y al volver ──
  useEffect(() => {
    const tic = () => {
      if (document.visibilityState !== 'visible') return
      void almacen.refrescar(new Set([...nativasRef.current.values()].flatMap(n => n.lista?.fuentes ?? [])))
      void puente.refrescar().then(() => revisarFotos())
    }
    const t = setInterval(tic, EDAD_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') tic() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [puente, revisarFotos, almacen])

  // ── 5. Eventos reales → impulsos por los hilos (islas/eventos.ts). Sondeo de 20 s de las mismas lecturas de la app; la
  //    primera es línea base. Solo con islas en la página y la ventana visible. ──
  const impulsosRef = useRef<Impulso[]>([])
  const halosRef = useRef(new Map<string, { t0: number; dolor: boolean }>())
  const elementsRef = useRef(p.elements); elementsRef.current = p.elements
  const disparar = useCallback((ev: EventoVivo) => {
    const islasMapa: Array<{ elId: string; organo?: string; id?: string }> = []
    for (const [elId, n] of nativasRef.current) if (n.lista) islasMapa.push({ elId, organo: n.lista.receta.organo, id: n.lista.receta.id })
    for (const [elId, i] of infosRef.current) islasMapa.push({ elId, id: i.ficha.id })
    const isla = islaDeOrgano(ev.organo, islasMapa)
    anotarIsla('evento', { tipo: ev.tipo, organo: ev.organo, fuente: ev.fuente, texto: ev.texto, isla })
    if (!isla) return
    const t0 = performance.now()
    const conectores = elementsRef.current.flatMap(e => (e.type === 'connector' ? [{ id: e.id, fromId: e.fromId, toId: e.toId }] : []))
    impulsosRef.current = [...impulsosRef.current, ...impulsosDe(ev, isla, conectores, t0)].slice(-60)
    halosRef.current.set(isla, { t0, dolor: !!ev.dolor })
    pRef.current.pedirCuadro()
  }, [])
  useEffect(() => exponerEventos(disparar), [disparar])
  const hayIslas = cajas.length > 0
  useEffect(() => {
    if (!hayIslas) return
    let foto: Foto = {}, vivo = true
    const leer = async <T,>(url: string | null, f: (x: unknown) => T) => (url ? f(await fuenteFresca<unknown>(url, 20_000)) : undefined)
    const tic = async () => {
      if (!vivo || document.visibilityState !== 'visible') return
      const c = ctxRef.current, u = urlsApp()
      const [rutinas, agentes, cohorte, videos, movimientos] = await Promise.all([
        leer(c.cliente ? null : u.rutinas, fotoRutinas), leer(c.cliente ? null : u.trabajos, fotoAgentes),
        leer(c.directo || c.cliente ? null : u.cohorte, fotoCohorte), leer(c.cliente ? null : u.marcador, fotoVideos),
        leer(c.directo || c.cliente ? null : u.finanzas, fotoMovimientos),
      ].map(x => x.catch(() => undefined)))
      if (!vivo) return
      const nueva: Foto = { rutinas: rutinas as Foto['rutinas'], agentes: agentes as Foto['agentes'], cohorte: cohorte as Foto['cohorte'], videos: videos as Foto['videos'], movimientos: movimientos as Foto['movimientos'] }
      // Lo que no se pudo leer conserva su foto anterior (una falla de red no es «todo cambió»).
      for (const k of Object.keys(nueva) as Array<keyof Foto>) if (nueva[k] === undefined) (nueva as Record<string, unknown>)[k] = foto[k]
      for (const ev of detectar(foto, nueva, Date.now())) disparar(ev)
      foto = nueva
    }
    void tic()
    const t = setInterval(() => void tic(), 20_000)
    return () => { vivo = false; clearInterval(t) }
  }, [hayIslas, disparar])

  // ── mensajes: un solo oyente para todas las islas ──
  useEffect(() => {
    const oir = (e: MessageEvent) => { puente.recibir(e.source, e.data) }
    window.addEventListener('message', oir)
    return () => window.removeEventListener('message', oir)
  }, [puente])

  const registrarFrame = useCallback((id: string, frame: HTMLIFrameElement | null) => {
    if (!frame) { frames.current.delete(id); return }
    frames.current.set(id, frame)
  }, [])

  const leerDato = useCallback((f: string) => almacen.get(f), [almacen])
  const ultimaIda = useRef(-Infinity)
  const ir = useCallback((destino: string) => {
    const t = performance.now()
    if (t - ultimaIda.current < 350) return
    const d = leerDestino(destino, pRef.current.esPropia)
    if (!d) { anotarIsla('accion-rechazada', { destino }); return }
    ultimaIda.current = t
    pRef.current.abrir(d)
  }, [])
  return {
    infoDe: el => infos.get(el.id) ?? null,
    esIsla: id => infos.has(id) || nativas.has(id),
    nativaDe: id => nativas.get(id) ?? null,
    almacen,
    ir,
    impulsos: ahora => {
      const vivos = impulsosRef.current.filter(i => ahora - i.t0 < DURACION_IMPULSO)
      if (vivos.length !== impulsosRef.current.length) impulsosRef.current = vivos
      return vivos.map(i => ({ ...i, u: (ahora - i.t0) / DURACION_IMPULSO }))
    },
    halos: ahora => {
      const out: Array<{ elId: string; fuerza: number; dolor: boolean }> = []
      for (const [elId, h] of halosRef.current) {
        const t = (ahora - h.t0) / (DURACION_IMPULSO + 600)
        if (t >= 1) { halosRef.current.delete(elId); continue }
        out.push({ elId, fuerza: Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t), dolor: h.dolor })
      }
      return out
    },
    vida,
    registrarFrame,
    pintura: el => {
      const n = nativas.get(el.id)
      if (n) return n.lista ? { tipo: 'receta', isla: n.lista, leer: leerDato, modo: p.modo, version: almacen.versionActual }
        : { tipo: 'rota', titulo: n.liga ? `Leyendo ${n.liga.split('/').slice(-2).join('/')}…` : 'Isla', errores: n.errores }
      const i = infos.get(el.id)
      if (!i) return null
      return { tipo: 'poster', poster: posterDe(i.ruta, p.modo)?.bitmap ?? null, titulo: i.ficha.titulo }
    },
    modo: p.modo,
    puente,
  }
}

/** El estado de vida de UNA isla, para su componente. */
export function useEstadoIsla(vida: Vida, id: string): EstadoIsla {
  return useSyncExternalStore(vida.suscribir, () => vida.estadoDe(id), () => 'fuera')
}
