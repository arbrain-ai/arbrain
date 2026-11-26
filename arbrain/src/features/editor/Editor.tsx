'use client'
/**
 * El editor de video de Arbrain (19 nov 2026, pedido del dueño: «traer todo esto a Arbrain… tener control de todo desde esta
 * interfaz»). Vive a pantalla completa en su segundo monitor; el chat se queda en la otra (sin Levy flotante).
 *
 * El motor (Scarlet de Forward Future, sin ventana) guarda todo: proyecto, versiones, cambios del agente. Aquí se mira y se decide:
 * el video suena YA CORTADO sobre la toma (salta lo rojo), las llamadas «Para ti» se revisan en su tarjeta, y las
 * herramientas a mano de la sala vieja (S, A, D, Q, E, Supr, M, C, flechas, ⌘Z) mandan versiones nuevas al motor.
 * Lecciones de revisión de cortes: Scarlet (MIT), `labs/scarlet/src/AGENTS.md`, adaptadas a las teclas del dueño.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HelpCircle, LayoutGrid, Maximize2, Pause, Play } from 'lucide-react'
import { motor, urlMedio } from './cliente'
import { enviarAlChat } from './al-chat'
import { alternarPantallaCompleta } from './ventana'
import { Ayuda } from './Ayuda'
import { InicioEditor } from './InicioEditor'
import { proyectoDeVideo } from './AtiendeEditor'
import { Lado, type PestanaLado } from './Lado'
import { LineaTiempo, type FilaLinea, type LlamadaEnLinea } from './LineaTiempo'
import {
  aCorte, aToma, bloque, borrarPiezas, cierreDeCambio, clasePista, cortes as calcularCortes, duracionCorte, formato, llamadas as calcularLlamadas,
  marcador, mensajeComentario, moverClip, NOMBRE_CLASE, ORDEN_CLASE, otraVelocidad, partir, pasoCuadro, piezaDeToma, piezas as calcularPiezas,
  pistaCamara, recortar, seleccionarLado, TIPO_CORTE, tramoCorte, tramosEnToma, type Edicion, type Llamada, type Pieza,
  moverBorde, devolverCorte, palabraCortada, recortarClip, quitarPieza, edicionesAplicadas, numerar, type EdicionAplicada,
} from './modelo'
import { useCompuesto } from './compuesto'
import { aEspanol } from './textos'
import type { Cambio, Medio, Proyecto, Segmento, Timeline, TramoT, VersionResumen } from './tipos'
import { ZoomController } from '@/shared/components/ZoomController'
import s from './editor.module.css'

interface Datos { proyecto: Proyecto; timeline: Timeline | null; cambios: Cambio[]; versiones: VersionResumen[] }

export function EditorPantalla() {
  const params = useSearchParams()
  const router = useRouter()
  const inicial = params.get('proyecto') ?? (params.get('editor') && params.get('editor') !== 'galeria' ? params.get('editor') : null)
  const [id, setId] = useState<string | null>(inicial)
  const [galeria, setGaleria] = useState(!inicial)
  const abrir = useCallback((nuevo: string) => {
    setId(nuevo); setGaleria(false)
    const u = new URL(window.location.href)
    if (u.pathname.startsWith('/panel')) u.searchParams.set('editor', nuevo); else u.searchParams.set('proyecto', nuevo)
    router.replace(`${u.pathname}${u.search}`)
  }, [router])
  // ⌘⌥G alterna la galería (se compara e.code: en macOS ⌥G escribe «©»).
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyG') { e.preventDefault(); if (id) setGaleria(g => !g) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [id])
  useEffect(() => { document.title = 'Editor · Arbrain' }, [])
  // «Abrir en el editor» desde la galería de otra ventana (canal `arbrain:editor` de editor-galeria): un proyecto del motor se abre aquí.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('arbrain:editor')
    bc.onmessage = e => { const m = e.data as { tipo?: string; id?: string }; const p = m?.tipo === 'abrir' && m.id ? proyectoDeVideo(m.id) : null; if (p) abrir(p) }
    return () => bc.close()
  }, [abrir])
  // ⌘+ ⌘− ⌘0: zoom propio de la ventana del editor, recordado (la rueda es de la línea de tiempo).
  const zoom = <ZoomController clave="arbrain.editor.zoom" />
  if (!id || galeria) return <div className={`${s.editor} dark`} data-testid="editor">{zoom}
    <div className={s.barra}><h1>Editor</h1><span className={s.hueco} />{id && <button className={s.boton} onClick={() => setGaleria(false)}>Volver al proyecto (⌘⌥G)</button>}</div>
    <InicioEditor onAbrir={abrir} />
  </div>
  return <>{zoom}<EditorProyecto key={id} id={id} alGaleria={() => setGaleria(true)} /></>
}

function EditorProyecto({ id, alGaleria }: { id: string; alGaleria: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conectado, setConectado] = useState(false)
  const [segmentos, setSegmentos] = useState<Segmento[] | null>(null)
  const [picos, setPicos] = useState<number[] | null>(null)
  const [piezasDe, setPiezasDe] = useState<Record<string, Pieza[]>>({})
  const [toma, setToma] = useState(0)
  const [sonando, setSonando] = useState(false)
  const [velocidad, setVelocidad] = useState(1)
  const [elegidas, setElegidas] = useState<number[]>([])
  const [clipElegido, setClipElegido] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [antes, setAntes] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const [pop, setPop] = useState<null | { tipo: 'marca' | 'comentario'; toma: number; corte: number }>(null)
  const [ayuda, setAyuda] = useState(false)
  const [pestana, setPestana] = useState<PestanaLado>('para-ti')
  const [aviso, setAviso] = useState<{ texto: string; mal?: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [decididas, setDecididas] = useState<Record<string, Record<number, 'cut' | 'keep'>>>({})
  // Vista compuesta (lo que saldrá en el export) o la toma cruda (para revisar cortes y escuchar lo quitado). V alterna.
  const [modo, setModo] = useState<'compuesta' | 'toma'>(() => { try { return localStorage.getItem('arbrain.editor.vista') === 'toma' ? 'toma' : 'compuesta' } catch { return 'compuesta' } })
  const [tomaForzada, setTomaForzada] = useState(false)
  const [revisandoLocal, setRevisandoLocal] = useState<Set<string>>(new Set())
  const [mantenidas, setMantenidas] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(`arbrain.editor.mantenidas:${id}`) ?? '[]')) } catch { return new Set() } })
  const video = useRef<HTMLVideoElement>(null)
  const pila = useRef<{ v: string[]; i: number }>({ v: [], i: -1 })
  const avisar = useCallback((texto: string, mal = false) => { setAviso({ texto, mal }); window.setTimeout(() => setAviso(a => (a?.texto === texto ? null : a)), mal ? 5000 : 2600) }, [])

  // ── Datos del motor ──
  const recargar = useCallback(async () => {
    try {
      const [esp, cambios, versiones] = await Promise.all([motor.espacio(id), motor.cambios(id), motor.versiones(id)])
      setDatos({ proyecto: esp.project, timeline: esp.timeline, cambios, versiones })
      setError(null)
      setRevisandoLocal(new Set())
      const h = esp.project.head
      if (h && pila.current.v[pila.current.i] !== h) { pila.current = { v: [h], i: 0 } }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { void recargar() }, [recargar])

  // Eventos en vivo: el motor avisa y se vuelve a leer (con calma: un pase manda muchos).
  useEffect(() => {
    let t: number | undefined
    const es = new EventSource(`/api/editor/eventos?proyecto=${encodeURIComponent(id)}`)
    es.addEventListener('listo', () => setConectado(true))
    es.addEventListener('motor', () => { window.clearTimeout(t); t = window.setTimeout(() => { void recargar() }, 400) })
    es.addEventListener('cerrado', () => setConectado(false))
    es.onerror = () => setConectado(false)
    return () => { window.clearTimeout(t); es.close() }
  }, [id, recargar])

  const medios = useMemo(() => new Map((datos?.proyecto.media ?? []).map(m => [m.id, m] as [string, Medio])), [datos?.proyecto.media])
  const camara = useMemo(() => pistaCamara(datos?.timeline, datos?.proyecto.media ?? []), [datos?.timeline, datos?.proyecto.media])
  const ps = useMemo(() => calcularPiezas(camara), [camara])
  const medioCam = ps[0] ? medios.get(ps[0].mediaId) : undefined
  const durToma = medioCam?.duration ?? ps.reduce((m, p) => Math.max(m, p.fuente.end), 0)
  const cortes = useMemo(() => calcularCortes(ps, durToma), [ps, durToma])
  const fps = datos?.proyecto.settings.fps || 30
  const corteAhora = aCorte(ps, toma).t
  const durCorte = duracionCorte(ps)
  const cabeza = datos?.proyecto.head ?? null

  // Transcript y onda de la toma (una vez por medio).
  useEffect(() => {
    if (!medioCam) return
    let vivo = true
    motor.transcript(medioCam.id).then(t => { if (vivo) setSegmentos(t.segments) }, () => { if (vivo) setSegmentos(null) })
    motor.onda(medioCam.id, Math.min(20000, Math.max(2000, Math.round((medioCam.duration ?? 600) * 40)))).then(o => { if (vivo) setPicos(o.peaks) }, () => {})
    return () => { vivo = false }
  }, [medioCam?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Las llamadas se marcan sobre la toma con las piezas de la versión de donde salió cada pase.
  const pendientes = useMemo(() => (datos?.cambios ?? []).filter(c => ['ready', 'proposed', 'rendering', 'revising'].includes(c.state) && c.cutReasons?.length), [datos?.cambios])
  // Los pases ya aplicados también: sus razones nombran cada corte en rojo (pestaña Hechas).
  const aplicados = useMemo(() => (datos?.cambios ?? []).filter(c => c.state === 'approved' && c.cutReasons?.length).slice(0, 20), [datos?.cambios])
  useEffect(() => {
    for (const c of [...pendientes, ...aplicados]) {
      if (piezasDe[c.fromVersion]) continue
      motor.timeline(id, c.fromVersion).then(t => setPiezasDe(prev => ({ ...prev, [c.fromVersion]: calcularPiezas(pistaCamara(t, datos?.proyecto.media ?? [])) })), () => {})
    }
  }, [pendientes, aplicados, id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Números estables (Scarlet): un número no se reasigna mientras el pase espera; se recuerdan por proyecto.
  const numeros = useRef<Record<string, number>>((() => { try { return JSON.parse(localStorage.getItem(`arbrain.editor.numeros:${id}`) ?? '{}') } catch { return {} } })())
  const lista: Llamada[] = useMemo(() => {
    const base = calcularLlamadas(pendientes).map(l => ({ ...l, eleccion: decididas[l.cambioId]?.[l.indice] ?? l.eleccion, revisando: l.revisando || revisandoLocal.has(`${l.cambioId}:${l.indice}`) }))
    const r = numerar(numeros.current, base)
    numeros.current = r.numeros
    return r.llamadas
  }, [pendientes, decididas, revisandoLocal])
  useEffect(() => { try { localStorage.setItem(`arbrain.editor.numeros:${id}`, JSON.stringify(numeros.current)) } catch { /* sin almacenamiento */ } }, [lista, id])
  const tomaDeLlamada = useCallback((l: Llamada): TramoT => {
    const c = pendientes.find(x => x.id === l.cambioId)
    const base = (c && piezasDe[c.fromVersion]) || ps
    const r = tramosEnToma(base, l.tramo)
    return r.length ? { start: r[0].start, end: r[r.length - 1].end } : l.tramo
  }, [pendientes, piezasDe, ps])
  const llamadaAbierta = abierta != null ? lista.find(l => l.numero === abierta) ?? null : null
  useEffect(() => { if (lista.length && pestana === 'para-ti') return; if (!lista.length && pestana === 'para-ti' && datos) setPestana('transcript') }, [lista.length, datos]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reproducción: suena el corte sobre la toma ──
  const estado = useRef({ ps, pieza: 0, audicion: null as TramoT | null, saltar: [] as TramoT[], hasta: null as number | null })
  estado.current.ps = ps
  estado.current.saltar = llamadaAbierta && !antes && llamadaAbierta.eleccion !== 'keep' ? [tomaDeLlamada(llamadaAbierta)] : []
  const buscarToma = useCallback((t: number, o: { audicion?: TramoT | null; hasta?: number | null } = {}) => {
    const v = video.current
    estado.current.audicion = o.audicion ?? null
    estado.current.hasta = o.hasta ?? null
    estado.current.pieza = Math.max(0, piezaDeToma(estado.current.ps, t))
    if (v) v.currentTime = Math.max(0, t)
    setToma(t)
  }, [])
  const reproducirToma = useCallback((si?: boolean) => {
    const v = video.current
    if (!v) return
    const tocar = si ?? v.paused
    if (tocar) {
      // Si el playhead está en lo cortado, arranca en la pieza siguiente.
      const st = estado.current
      if (!st.audicion) { const i = piezaDeToma(st.ps, v.currentTime); if (i >= 0 && v.currentTime < st.ps[i].fuente.start) v.currentTime = st.ps[i].fuente.start; st.pieza = Math.max(0, i) }
      void v.play().catch(() => {})
    } else v.pause()
  }, [])
  useEffect(() => {
    const v = video.current
    if (!v) return
    let raf = 0
    const tick = () => {
      const st = estado.current, t = v.currentTime
      if (st.audicion) {
        if (t >= st.audicion.end - 0.01) { v.pause(); st.audicion = null }
      } else if (st.ps.length) {
        const extra = st.saltar.find(r => t >= r.start - 0.01 && t < r.end - 0.01)
        if (extra) v.currentTime = extra.end
        else {
          let p = st.ps[st.pieza]
          if (!p || t < p.fuente.start - 0.3 || t > p.fuente.end + 0.3) { st.pieza = Math.max(0, piezaDeToma(st.ps, t)); p = st.ps[st.pieza] }
          if (!p) v.pause()
          else if (t >= p.fuente.end - 0.012) {
            if (st.pieza + 1 < st.ps.length) { st.pieza += 1; v.currentTime = st.ps[st.pieza].fuente.start } else v.pause()
          } else if (t < p.fuente.start - 0.012) v.currentTime = p.fuente.start
        }
      }
      if (st.hasta != null && t >= st.hasta) { v.pause(); st.hasta = null }
      setToma(v.currentTime)
      if (!v.paused) raf = requestAnimationFrame(tick)
    }
    const alTocar = () => { setSonando(true); raf = requestAnimationFrame(tick) }
    const alParar = () => { setSonando(false); cancelAnimationFrame(raf); setToma(v.currentTime) }
    v.addEventListener('play', alTocar); v.addEventListener('pause', alParar); v.addEventListener('ended', alParar)
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', alTocar); v.removeEventListener('pause', alParar); v.removeEventListener('ended', alParar) }
  }, [medioCam?.id])
  // ── La vista compuesta: el motor mezcla todas las pistas por tramos (lo mismo que el export) ──
  const enCompuesta = modo === 'compuesta' && !tomaForzada && !llamadaAbierta
  const psRef = useRef(ps); psRef.current = ps
  const comp = useCompuesto({ proyecto: id, version: cabeza, duracion: durCorte, activo: enCompuesta, alTiempo: t => setToma(aToma(psRef.current, t).toma), alError: m => avisar(m, true) })
  /** Ir a un instante de la toma: en la compuesta, el motor compone ese tramo; en la toma, el video crudo salta ahí. */
  const buscar = useCallback((t: number, o: { audicion?: TramoT | null; hasta?: number | null } = {}) => {
    if (enCompuesta && !o.audicion && o.hasta == null) { setToma(t); void comp.buscar(aCorte(psRef.current, t).t) }
    else buscarToma(t, o)
  }, [enCompuesta, comp, buscarToma])
  const reproducir = useCallback((si?: boolean) => { if (enCompuesta) comp.tocar(si); else reproducirToma(si) }, [enCompuesta, comp, reproducirToma])
  const pausarTodo = useCallback(() => { video.current?.pause(); comp.tocar(false) }, [comp])
  const suena = enCompuesta ? comp.sonando : sonando
  useEffect(() => { if (video.current) video.current.playbackRate = velocidad; comp.velocidad(velocidad) }, [velocidad, comp])
  // Al pasar a la compuesta (o al cambiar la versión), el motor compone el tramo del playhead.
  useEffect(() => { if (enCompuesta && cabeza && ps.length) { video.current?.pause(); void comp.buscar(aCorte(ps, toma).t, false) } }, [enCompuesta, cabeza, ps.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!enCompuesta) comp.tocar(false) }, [enCompuesta]) // eslint-disable-line react-hooks/exhaustive-deps
  // Al cargar: el playhead al inicio del corte.
  useEffect(() => { if (ps.length && toma === 0 && ps[0].fuente.start > 0) buscarToma(ps[0].fuente.start) }, [ps.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ediciones: cada una es una versión del motor ──
  const aplicar = useCallback(async (ed: Edicion | null, siNo?: string) => {
    if (!ed) { if (siNo) avisar(siNo); return }
    if (!cabeza || ocupado) return
    setOcupado(true)
    try {
      const r = await motor.editar(id, cabeza, ed.ops, ed.descripcion)
      const p = pila.current
      p.v = [...p.v.slice(0, p.i + 1), r.change.toVersion]; p.i = p.v.length - 1
      setElegidas([])
      avisar(`${ed.descripcion} · versión ${r.change.toVersion.slice(0, 8)} guardada`)
      await recargar()
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), true) } finally { setOcupado(false) }
  }, [cabeza, ocupado, id, avisar, recargar])

  const irAVersion = useCallback(async (v: string, como: string) => {
    if (ocupado || v === cabeza) return
    setOcupado(true)
    try { await motor.irA(id, v); avisar(`${como}: versión ${v.slice(0, 8)}`); await recargar() } catch (e) { avisar(e instanceof Error ? e.message : String(e), true) } finally { setOcupado(false) }
  }, [ocupado, cabeza, id, avisar, recargar])
  const deshacer = useCallback((dir: -1 | 1) => {
    const p = pila.current, j = p.i + dir
    if (j < 0 || j >= p.v.length) { avisar(dir < 0 ? 'Nada que deshacer en esta sesión (las versiones viejas están en Versiones)' : 'Nada que rehacer'); return }
    const destino = p.v[j]
    p.i = j
    void irAVersion(destino, dir < 0 ? 'Deshecho' : 'Rehecho').then(() => { pila.current = { v: p.v, i: j } })
  }, [irAVersion, avisar])
  const revertir = useCallback(async (v: string) => {
    if (!cabeza || ocupado) return
    setOcupado(true)
    try { await motor.revertir(id, v, cabeza, datos?.proyecto.branch ?? 'main'); avisar(`Edición ${v.slice(0, 8)} rechazada: lo demás se queda`); await recargar() }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), true) } finally { setOcupado(false) }
  }, [cabeza, ocupado, id, datos?.proyecto.branch, avisar, recargar])

  // ── Llamadas ──
  const abrirLlamada = useCallback((n: number | null) => {
    setAbierta(n); setAntes(false); setRevisando(false)
    const l = n != null ? lista.find(x => x.numero === n) : null
    // La tarjeta revisa sobre la toma cruda (el corte aún no está aplicado): antes/después salen de ahí.
    if (l) { const r = tomaDeLlamada(l); comp.tocar(false); buscarToma(Math.max(0, r.start - 2), { hasta: r.end + 2.5 }); reproducirToma(true); setPestana('para-ti') }
  }, [lista, tomaDeLlamada, buscarToma, reproducirToma, comp])
  const decidir = useCallback(async (l: Llamada, eleccion: 'cut' | 'keep') => {
    const c = pendientes.find(x => x.id === l.cambioId)
    if (!c) return
    const propias = { ...(decididas[c.id] ?? Object.fromEntries((c.cutChoices ?? []).map(e => [e.index, e.choice]))), [l.indice]: eleccion }
    setDecididas(d => ({ ...d, [c.id]: propias }))
    const siguiente = lista.find(x => x.numero > l.numero && !(x.cambioId === c.id ? propias[x.indice] : x.eleccion)) ?? lista.find(x => !(x.cambioId === c.id ? propias[x.indice] : x.eleccion) && x.numero !== l.numero)
    try {
      await motor.elegir(c.id, c.fromVersion, c.toVersion, Object.entries(propias).map(([i, ch]) => ({ index: Number(i), choice: ch })))
      const cierre = cierreDeCambio(c, new Map(Object.entries(propias).map(([i, ch]) => [Number(i), ch])))
      if (cierre.listo) {
        const r = await motor.aprobar(c.id, cierre.restoredCuts)
        const total = c.cutReasons?.length ?? 0
        avisar(`Pase aplicado: ${total - cierre.restoredCuts.length} corte${total - cierre.restoredCuts.length === 1 ? '' : 's'}, ${cierre.restoredCuts.length} mantenido${cierre.restoredCuts.length === 1 ? '' : 's'} · versión ${r.change.toVersion?.slice(0, 8) ?? ''} guardada`)
        await recargar()
      } else avisar(`Llamada ${l.numero}: ${eleccion === 'cut' ? 'aprobada' : 'mantenida'}`)
    } catch (e) { avisar(e instanceof Error ? e.message : String(e), true) }
    abrirLlamada(siguiente ? siguiente.numero : null)
  }, [pendientes, decididas, lista, avisar, recargar, abrirLlamada])
  const mandarRevision = useCallback(async (texto: string) => {
    const l = llamadaAbierta
    if (!l || !texto.trim()) return
    try { await motor.revisar(l.cambioId, texto.trim(), l.indice, l.tramo.start); setRevisandoLocal(x => new Set(x).add(`${l.cambioId}:${l.indice}`)); avisar(`Llamada ${l.numero}: el agente la está revisando`) }
    catch (e) { avisar(e instanceof Error ? e.message : String(e), true) }
    setRevisando(false)
  }, [llamadaAbierta, avisar])

  // ── Teclado (la sala vieja; la tarjeta abierta manda en sus teclas) ──
  const teclado = useRef<(e: KeyboardEvent) => void>(() => {})
  teclado.current = (e: KeyboardEvent) => {
    const ae = document.activeElement as HTMLElement | null
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
    if (pop) return
    // Un botón con foco (tras un clic) no se queda con Espacio: reproducir es del editor.
    if (ae?.tagName === 'BUTTON' && e.key === ' ') { e.preventDefault(); ae.blur() }
    const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey
    const t = corteAhora
    if (mod && k === 'z') { e.preventDefault(); deshacer(e.shiftKey ? 1 : -1); return }
    if (e.altKey && !mod && (k === 'arrowleft' || k === 'arrowright')) {
      e.preventDefault()
      const c = datos?.timeline?.tracks.flatMap(p => p.clips).find(x => x.id === clipElegido)
      if (!c || camara?.clips.some(x => x.id === c.id)) { avisar('Elige un clip de otra pista (gráfico, subtítulo…) para moverlo; la cámara se recorta con A y D'); return }
      void aplicar(moverClip(c, (k === 'arrowright' ? 1 : -1) * (e.shiftKey ? 10 : 1), fps)); return
    }
    if (mod || e.altKey) return
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); setAyuda(a => !a); return }
    if (ayuda && k === 'escape') { setAyuda(false); return }
    // Tarjeta abierta: A aprueba, K mantiene, S salta, R revisa, \ antes/después, ↑↓ entre llamadas, Esc cierra.
    if (llamadaAbierta) {
      if (llamadaAbierta.revisando && (k === 'a' || k === 'k')) { e.preventDefault(); avisar('Esta llamada se está revisando: decide cuando llegue la versión nueva'); return }
      if (k === 'a') { e.preventDefault(); void decidir(llamadaAbierta, 'cut'); return }
      if (k === 'k') { e.preventDefault(); void decidir(llamadaAbierta, 'keep'); return }
      if (k === 's') { e.preventDefault(); const sig = lista.find(x => x.numero > llamadaAbierta.numero) ?? lista[0]; abrirLlamada(sig && sig.numero !== llamadaAbierta.numero ? sig.numero : null); return }
      if (k === 'r') { e.preventDefault(); setRevisando(true); return }
      if (k === '\\') { e.preventDefault(); const r = tomaDeLlamada(llamadaAbierta); setAntes(a => !a); buscarToma(Math.max(0, r.start - 2), { hasta: r.end + 2.5 }); reproducirToma(true); return }
      if (k === 'arrowup' || k === 'arrowdown') {
        e.preventDefault()
        const i = lista.findIndex(x => x.numero === llamadaAbierta.numero), j = i + (k === 'arrowdown' ? 1 : -1)
        if (lista[j]) abrirLlamada(lista[j].numero); return
      }
      if (k === 'escape') { abrirLlamada(null); return }
      if (k === 'd' || k === 'q' || k === 'e') { avisar('La tarjeta está abierta: Esc la cierra y S, A y D vuelven a ser herramientas'); return }
    }
    switch (k) {
      case ' ': e.preventDefault(); reproducir(); break
      case 's': void aplicar(partir(ps, t, fps), 'Aquí no se puede partir (borde de pieza o fuera del corte)'); break
      case 'a': case 'd': {
        // Con un clip de otra pista elegido, A/D recortan ese clip; si no, la pieza de la cámara.
        const lado = k === 'a' ? 'izquierda' : 'derecha'
        const c = clipElegido ? datos?.timeline?.tracks.flatMap(p => p.clips).find(x => x.id === clipElegido) : undefined
        if (c && !camara?.clips.some(x => x.id === c.id)) void aplicar(recortarClip(c, t, lado, fps), 'El playhead no está dentro de ese clip')
        else void aplicar(recortar(ps, t, lado, fps), `Nada que recortar a la ${lado}`)
        break
      }
      case 'v': { const sig = enCompuesta ? 'toma' : 'compuesta'; setTomaForzada(false); setModo(sig); try { localStorage.setItem('arbrain.editor.vista', sig) } catch { /* sin almacenamiento */ } avisar(sig === 'compuesta' ? 'Vista compuesta: todas las pistas, como en el export' : 'Vista de la toma: lo cortado en rojo se puede escuchar'); break }
      case 'q': { const sel = seleccionarLado(ps, t, -1); setElegidas(sel); avisar(`${sel.length} pieza${sel.length === 1 ? '' : 's'} a la izquierda · Supr las quita`); break }
      case 'e': { const sel = seleccionarLado(ps, t, 1); setElegidas(sel); avisar(`${sel.length} pieza${sel.length === 1 ? '' : 's'} a la derecha · Supr las quita`); break }
      case 'backspace': case 'delete': if (elegidas.length) { e.preventDefault(); void aplicar(borrarPiezas(ps, elegidas), 'No se puede quitar todo el corte') } break
      case 'm': e.preventDefault(); pausarTodo(); setPop({ tipo: 'marca', toma, corte: t }); break
      case 'c': e.preventDefault(); pausarTodo(); setPop({ tipo: 'comentario', toma, corte: t }); break
      case 'f': void alternarPantallaCompleta(); break
      case ',': case '<': setVelocidad(v => otraVelocidad(v, -1)); break
      case '.': case '>': setVelocidad(v => otraVelocidad(v, 1)); break
      case 'arrowup': e.preventDefault(); buscar(aToma(ps, bloque(ps, t, 1)).toma); break
      case 'arrowdown': e.preventDefault(); buscar(aToma(ps, bloque(ps, t, -1)).toma); break
      case 'arrowleft': e.preventDefault(); buscar(aToma(ps, pasoCuadro(ps, t, e.shiftKey ? -10 : -1, fps)).toma); break
      case 'arrowright': e.preventDefault(); buscar(aToma(ps, pasoCuadro(ps, t, e.shiftKey ? 10 : 1, fps)).toma); break
      case 'escape': setElegidas([]); setClipElegido(null); break
      default: break
    }
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => teclado.current(e)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  // ── Pistas a la vista ──
  const filas: FilaLinea[] = useMemo(() => {
    const t = datos?.timeline
    if (!t) return []
    const porClase = new Map<string, FilaLinea>()
    for (const p of t.tracks) {
      const clase = clasePista(p, camara, medios)
      const fila: FilaLinea = { id: p.id, clase, nombre: clase === 'otra' ? p.name : NOMBRE_CLASE[clase], clips: [] }
      if (clase !== 'camara') fila.clips = p.clips.map(c => ({ id: c.id, etiqueta: c.kind === 'caption' ? c.text : c.label ?? (c.kind === 'media' ? medios.get(c.mediaId)?.name ?? 'Clip' : 'Color'), tramos: tramosEnToma(ps, tramoCorte(c)) }))
      // Dos pistas de la misma clase quedan en dos filas.
      porClase.set(porClase.has(clase) ? `${clase}:${p.id}` : clase, fila)
    }
    // Las seis filas de siempre, aunque estén vacías: «pistas separadas para entender todos los cambios».
    for (const c of ['subtitulos', 'graficos', 'pantalla', 'sfx', 'musica'] as const) if (![...porClase.values()].some(f => f.clase === c)) porClase.set(c, { id: `vacia-${c}`, clase: c, nombre: NOMBRE_CLASE[c], clips: [] })
    return [...porClase.values()].sort((a, b) => ORDEN_CLASE.indexOf(a.clase) - ORDEN_CLASE.indexOf(b.clase))
  }, [datos?.timeline, camara, medios, ps])
  const palabras = useMemo(() => (segmentos ?? []).flatMap(sg => sg.words ?? []), [segmentos])
  // Lo ya aplicado, para Mantener o Rechazar por edición: cada corte en rojo (con la razón de su pase) y cada pieza colocada.
  const hechas: EdicionAplicada[] = useMemo(() => {
    const razones = aplicados.flatMap(c => {
      const base = piezasDe[c.fromVersion]
      if (!base) return []
      return (c.cutReasons ?? []).flatMap((r, i) => {
        const tt = tramosEnToma(base, r)
        return tt.length ? [{ cambioId: c.id, hilo: c.threadId, indice: i, nota: aEspanol(r.summary ?? r.reason), toma: { start: tt[0].start, end: tt[tt.length - 1].end } }] : []
      })
    })
    const otras = (datos?.timeline?.tracks ?? []).flatMap(p => {
      const clase = clasePista(p, camara, medios)
      // La pantalla va pegada a la cámara (se corta con ella): no es una pieza aparte.
      if (clase === 'camara' || clase === 'pantalla') return []
      return p.clips.map(c => ({ clip: c, toma: tramosEnToma(ps, tramoCorte(c)), clase: NOMBRE_CLASE[clase] }))
    })
    return edicionesAplicadas(cortes, razones, otras)
  }, [aplicados, piezasDe, datos?.timeline, camara, medios, ps, cortes])
  const mantener = useCallback(async (e: EdicionAplicada) => {
    try {
      if (e.cambioId && e.hilo && e.spot != null) await motor.mantener(id, e.hilo, [{ changeId: e.cambioId, spot: e.spot, label: e.nota.slice(0, 170) }])
      setMantenidas(m => { const n = new Set(m).add(e.clave); try { localStorage.setItem(`arbrain.editor.mantenidas:${id}`, JSON.stringify([...n])) } catch { /* sin almacenamiento */ } return n })
      avisar(`Mantenida: ${e.nota}`)
    } catch (err) { avisar(err instanceof Error ? err.message : String(err), true) }
  }, [id, avisar])
  const rechazar = useCallback((e: EdicionAplicada) => {
    const t = datos?.timeline
    if (!t) return
    if (e.tipo === 'corte') { void aplicar(devolverCorte(t, ps, e.tramo, fps), 'Ese corte no se puede devolver solo') ; return }
    const c = t.tracks.flatMap(p => p.clips).find(x => x.id === e.clipId)
    void aplicar(c ? quitarPieza(c) : null, 'Esa pieza ya no está')
  }, [datos?.timeline, ps, fps, aplicar])
  const enLinea: LlamadaEnLinea[] = useMemo(() => lista.map(l => ({ numero: l.numero, tramo: tomaDeLlamada(l), decidida: l.eleccion })), [lista, tomaDeLlamada])
  const marcadores = useMemo(() => (datos?.timeline?.markers ?? []).map(m => ({ id: m.id, toma: aToma(ps, m.time).toma, texto: m.text })), [datos?.timeline?.markers, ps])
  const subtitulo = useMemo(() => {
    for (const p of datos?.timeline?.tracks ?? []) for (const c of p.clips) if (c.kind === 'caption' && corteAhora >= c.timelineIn && corteAhora < c.timelineOut) return c.text
    return null
  }, [datos?.timeline, corteAhora])

  const aspecto = datos ? `${datos.proyecto.settings.width} / ${datos.proyecto.settings.height}` : '16 / 9'
  const enCortado = cortes.some(c => toma >= c.start && toma < c.end)
  const enAudicion = !!estado.current.audicion

  return <div className={`${s.editor} dark`} data-testid="editor">
    <div className={s.barra}>
      <button className={s.icono} onClick={alGaleria} title="Galería (⌘⌥G)" aria-label="Galería"><LayoutGrid size={15} /></button>
      <h1>{datos?.proyecto.name ?? 'Cargando…'}</h1>
      {cabeza && <span className={s.ver} title="Versión del motor a la vista">versión {cabeza.slice(0, 8)}</span>}
      <span className={s.hueco} />
      <span className={s.estado} data-mal={conectado ? undefined : ''}>{conectado ? 'Motor en vivo' : error ? 'Motor sin respuesta' : 'Conectando…'}</span>
      <button className={s.icono} onClick={() => void alternarPantallaCompleta()} title="Pantalla completa (F)" aria-label="Pantalla completa"><Maximize2 size={15} /></button>
      <button className={s.icono} onClick={() => setAyuda(a => !a)} title="Atajos (?)" aria-label="Atajos"><HelpCircle size={15} /></button>
    </div>

    <div className={s.principal}>
      <div className={s.escenario}>
        {error && !datos ? <p className={s.vacioCuadro}>{error}</p>
          : medioCam ? <div className={s.cuadro} style={{ ['--aspecto' as string]: aspecto }}>
            <video ref={video} src={urlMedio(medioCam.id)} preload="auto" playsInline onClick={() => reproducir()} data-testid="video" muted={enCompuesta} style={{ display: enCompuesta ? 'none' : 'block' }} />
            {comp.elementos}
            {subtitulo && !enCompuesta && <div className={s.subtitulo}>{subtitulo}</div>}
            {enCompuesta && <span className={s.sello} data-tipo="compuesta" data-testid="sello-compuesta" data-latencia={comp.latencia ?? ''}>{comp.cargando ? 'Componiendo el tramo…' : `Compuesta${comp.latencia != null ? ` · imagen en ${(comp.latencia / 1000).toFixed(1)} s` : ''}`}</span>}
            {!enCompuesta && enAudicion && <span className={s.sello} data-tipo="audicion">Lo que se quitó</span>}
            {!enCompuesta && !enAudicion && llamadaAbierta && <span className={s.sello} data-tipo={antes ? 'antes' : undefined}>{antes ? 'Antes · con lo cortado' : 'Después · ya cortado'}</span>}
            {!enCompuesta && !enAudicion && !llamadaAbierta && <span className={s.sello} data-tipo={enCortado && !sonando ? 'antes' : undefined}>{enCortado && !sonando ? 'Toma · aquí está cortado' : 'Toma cruda · V: vista compuesta'}</span>}
          </div>
          : <p className={s.vacioCuadro}>{datos ? 'Este proyecto todavía no tiene la toma en la línea de tiempo.' : 'Cargando el proyecto del motor…'}</p>}
        {aviso && <div className={s.toast} data-mal={aviso.mal ? '' : undefined} role="status">{aviso.texto}</div>}
        {pop && <PopNota tipo={pop.tipo} instante={pop.corte} alCerrar={() => setPop(null)} alEnviar={nota => {
          const p = pop
          setPop(null)
          if (p.tipo === 'marca') void aplicar(marcador(p.corte, nota, `mk_${Date.now().toString(36)}`))
          else if (datos && cabeza) void enviarAlChat(mensajeComentario({ proyecto: datos.proyecto.name, proyectoId: id, version: cabeza.slice(0, 8), tiempo: p.corte, toma: p.toma, nota }))
            .then(via => avisar(via === 'chat' ? 'Comentario enviado a Levy en el chat' : 'Abriendo el chat con tu comentario'))
        }} />}
        {ayuda && <Ayuda alCerrar={() => setAyuda(false)} />}
      </div>

      <div className={s.transporte}>
        <button className={s.icono} onClick={() => reproducir()} aria-label={suena ? 'Pausar' : 'Reproducir'} title="Espacio">{suena ? <Pause size={16} /> : <Play size={16} />}</button>
        <span className={s.tiempo}>{formato(corteAhora, fps)} <span>/ {formato(durCorte)} · toma {formato(toma)}</span></span>
        <button className={s.boton} onClick={() => setVelocidad(v => otraVelocidad(v, 1))} title=", y . cambian la velocidad">{velocidad}×</button>
        <button className={s.boton} data-activo={enCompuesta ? '' : undefined} data-testid="vista" onClick={() => teclado.current(new KeyboardEvent('keydown', { key: 'v' }))}
          title="V: la compuesta (todas las pistas, como el export) o la toma cruda (para revisar cortes)"><span className={s.kbd}>V</span>{enCompuesta ? 'Compuesta' : 'Toma'}</button>
        <div className={s.herr}>
          {([['S', 'Partir'], ['A', 'Recortar ←'], ['D', 'Recortar →'], ['Q', 'Sel. ←'], ['E', 'Sel. →'], ['M', 'Marcador'], ['C', 'A Levy']] as const).map(([tecla, nombre]) =>
            <button key={tecla} className={s.boton} disabled={ocupado || (!!llamadaAbierta && 'SADQE'.includes(tecla))}
              onClick={() => teclado.current(new KeyboardEvent('keydown', { key: tecla.toLowerCase() }))}><span className={s.kbd}>{tecla}</span>{nombre}</button>)}
        </div>
      </div>

      {llamadaAbierta && <>
        <p className={s.aviso}>Tarjeta abierta: A aprueba, K mantiene, S salta, R revisa, \ antes/después, ↑↓ entre llamadas · Esc la cierra y S/A/D vuelven a ser herramientas</p>
        <div className={s.tarjeta} data-testid="tarjeta">
          <span className={s.num}>Llamada {llamadaAbierta.numero}<small style={{ color: 'var(--tenue)', fontWeight: 400 }}> de {lista.length}</small></span>
          <div className={s.nota}>
            <span className={s.pildora}>{TIPO_CORTE[llamadaAbierta.tipo ?? ''] ?? 'Corte'}</span>
            {llamadaAbierta.revisar && <span className={s.pildora} data-ambar="">Escucha: {llamadaAbierta.revisar}</span>}
            {llamadaAbierta.revisando && <span className={s.pildora} data-ambar="">Revisando…</span>}
            {aEspanol(llamadaAbierta.nota)}
            <small>{formato(tomaDeLlamada(llamadaAbierta).start)}–{formato(tomaDeLlamada(llamadaAbierta).end)} de la toma{llamadaAbierta.eleccion ? ` · ya ${llamadaAbierta.eleccion === 'cut' ? 'aprobada' : 'mantenida'}` : ''}</small>
          </div>
          <div className={s.decisiones}>
            <button className={s.boton} data-activo={antes ? '' : undefined} onClick={() => teclado.current(new KeyboardEvent('keydown', { key: '\\' }))} title="Antes / después (\)"><span className={s.kbd}>\</span>{antes ? 'Antes' : 'Después'}</button>
            <button className={s.boton} onClick={() => setRevisando(true)}><span className={s.kbd}>R</span>Revisar</button>
            <button className={s.boton} disabled={!!llamadaAbierta.revisando} onClick={() => void decidir(llamadaAbierta, 'keep')}><span className={s.kbd}>K</span>Mantener</button>
            <button className={s.boton} data-principal="" disabled={!!llamadaAbierta.revisando} onClick={() => void decidir(llamadaAbierta, 'cut')}><span className={s.kbd}>A</span>Aprobar</button>
            <button className={s.boton} onClick={() => teclado.current(new KeyboardEvent('keydown', { key: 's' }))} title="Saltar (S)"><span className={s.kbd}>S</span>Saltar</button>
          </div>
        </div>
        {revisando && <form className={s.revisar} onSubmit={e => { e.preventDefault(); void mandarRevision(new FormData(e.currentTarget).get('texto') as string) }}>
          <input name="texto" autoFocus placeholder="¿Qué cambia el agente en este corte? (Enter envía · Esc cancela)" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setRevisando(false) } }} />
          <button className={s.boton} type="submit">Enviar</button>
        </form>}
      </>}

      {medioCam && <LineaTiempo duracion={durToma} toma={toma} piezas={ps} cortes={cortes} filas={filas} picos={picos} llamadas={enLinea} abierta={abierta}
        marcadores={marcadores} elegidas={elegidas} clipElegido={clipElegido}
        alBuscar={t => { buscar(t) }}
        alCorte={c => { setTomaForzada(true); comp.tocar(false); buscarToma(c.start, { audicion: c }); reproducirToma(true); avisar(`Escuchando lo que se quitó: ${formato(c.start)}–${formato(c.end)} · V vuelve a la vista compuesta`) }}
        alBorde={(r, borde, n) => {
          const ed = datos?.timeline ? moverBorde(datos.timeline, ps, r, borde, n, fps) : null
          const w = palabraCortada(palabras, n)
          void aplicar(ed, 'Ese borde no se puede mover ahí').then(() => { if (ed && w) avisar(`Ojo: el borde cae dentro de «${w}»: se va a oír cortada`, true) })
        }}
        alPieza={(i, sumar) => setElegidas(prev => sumar ? (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]) : [i])}
        alLlamada={n => abrirLlamada(n)} alClip={c => setClipElegido(c)} />}
    </div>

    <Lado pestana={pestana} setPestana={setPestana} llamadas={lista} abierta={abierta} alAbrir={n => abrirLlamada(n)}
      segmentos={segmentos} cortes={cortes} toma={toma} alBuscar={t => buscar(t)}
      versiones={datos?.versiones ?? []} cabeza={cabeza} alIr={v => void irAVersion(v, 'Ahora en')} alRevertir={v => void revertir(v)} ocupado={ocupado}
      hechas={hechas} mantenidas={mantenidas} alMantener={e => void mantener(e)} alRechazar={rechazar} />
  </div>
}

function PopNota({ tipo, instante, alEnviar, alCerrar }: { tipo: 'marca' | 'comentario'; instante: number; alEnviar: (nota: string) => void; alCerrar: () => void }) {
  const [nota, setNota] = useState('')
  return <div className={s.pop} role="dialog" aria-label={tipo === 'marca' ? 'Marcador' : 'Comentario para Levy'}>
    <header><b>{tipo === 'marca' ? 'Marcador' : 'Comentario para Levy'}</b> en {formato(instante)} {tipo === 'comentario' && '· llega al chat con el instante'}</header>
    <form onSubmit={e => { e.preventDefault(); alEnviar(nota) }}>
      <input autoFocus value={nota} onChange={e => setNota(e.target.value)} placeholder={tipo === 'marca' ? 'Nota del marcador' : '¿Qué hacemos aquí? (Enter envía a Levy)'}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') alCerrar() }} />
      <button className={s.boton} type="submit">{tipo === 'marca' ? 'Guardar' : 'Enviar a Levy'}</button>
    </form>
  </div>
}
