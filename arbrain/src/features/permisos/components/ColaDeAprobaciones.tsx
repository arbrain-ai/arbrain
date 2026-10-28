'use client'
/**
 * Cola de aprobaciones que vuelve sola (harness-noche 27 oct 2026, ronda 2). Referente: Claude Duet, «If you can't
 * approve immediately, Claude Duet completes remaining tasks and requests approval later»; y su crítica: «it did not
 * bring me back to resolve it» (ChatPRD, 26 oct). Aquí la cola sí te regresa.
 *
 * Si la persona no contesta una tarjeta a tiempo, no vence ni se dice que no sola: queda en su cola y Levy sigue con lo
 * que no depende de ella. La cola se ve en dos lugares:
 *   - `ColaDelHilo`: encima del cuadro de escribir de la conversación que la pidió, con las tarjetas completas.
 *   - `ContadorCola`: un contador en toda la app; al volver (abrir la app o regresar a la pestaña) el panel se abre solo
 *     una vez por cada decisión nueva, salvo que ya la tengas delante en su hilo.
 * Al decidir, el daemon se lo dice a Levy en esa conversación y Levy retoma esa parte (server/src/cliente/cola.ts).
 */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronDown, CircleAlert, Hand, Inbox, Loader2, Play, ShieldAlert, Terminal, X } from 'lucide-react'
import { TarjetaComando, useDecision } from '@/features/chat/components/TarjetaComando'
import { desdeCuando, enLaCola, resumenCorrida, type Confirmacion } from '../lib/confirmacion'
import { registrarColaVisible, seVeEnUnHilo, usePendientes } from '../lib/pendientes'
import s from './cola.module.css'

const VISTAS = 'arbrain.cola.vistas'
const cuantas = (n: number) => n === 1 ? 'una decisión' : `${n} decisiones`
const esperan = (n: number) => `Te ${n === 1 ? 'espera' : 'esperan'} ${cuantas(n)}`
/** Ancho desde el que el panel es una columna propia junto al chat (lo empuja); abajo, una pantalla propia. */
const COLUMNA_DESDE = 1024

/** La cola y los «Córrelo tú» de la cola que acaban de terminar (quedan en «Listo» hasta «Entendido»). */
function useCola(conversacion?: string | null) {
  const { pendientes, terminadas } = usePendientes()
  return useMemo(() => {
    const listos = terminadas.filter(c => !!c.enColaDesde && (conversacion === undefined || c.conversacion === conversacion))
    return [...enLaCola(pendientes, conversacion), ...listos]
  }, [pendientes, terminadas, conversacion])
}

/**
 * Ficha compacta de una decisión (ronda 3, Duet): una línea humana y la acción principal; al tocarla se abre la tarjeta
 * completa (literal, «Permitir siempre», razón escrita). Lo rutinario se aprueba desde la ficha; el freno y lo que
 * necesita tus manos solo se abren («Revisar»): nunca un sí de un toque para borrar, enviar o tu contraseña.
 */
export function FichaCola({ c, abierta: abiertaInicial = false }: { c: Confirmacion; abierta?: boolean }) {
  const [abierta, setAbierta] = useState(abiertaInicial || c.estado === 'corriendo')
  const { armado, ocupado, alClic } = useDecision(c)
  const manos = c.tipo === 'manos'
  const peligro = c.categoria !== 'otra'
  const listo = c.estado === 'corrida'
  const corriendo = c.estado === 'corriendo'
  const fin = listo ? resumenCorrida(c) : null
  const Icono = listo ? (fin?.ok === false ? CircleAlert : Check) : corriendo ? Loader2 : manos ? Hand : peligro ? ShieldAlert : Terminal
  const cuando = c.enColaDesde ? desdeCuando(c.enColaDesde) : null
  const linea = listo ? fin!.titulo : corriendo ? 'Corriendo en tu terminal' : (c.frase || c.resumen)
  const sub = listo ? (c.frase || c.resumen) : corriendo ? 'Escribe en el recuadro negro de abajo' : `${manos ? 'Necesita tus manos' : peligro ? 'Siempre pide tu clic' : 'Un comando'}${cuando ? ` · ${cuando}` : ''}`
  const rapida = !manos && !peligro && !listo && !corriendo
  return (
    <article className={s.ficha} data-abierta={abierta ? 'si' : undefined} data-peligro={peligro ? 'si' : undefined} data-fin={listo ? (fin?.ok === false ? 'error' : 'ok') : undefined}>
      <div className={s.fila}>
        <button type="button" className={s.toque} onClick={() => setAbierta(v => !v)} aria-expanded={abierta} aria-label={`${linea}. ${abierta ? 'Cerrar' : 'Ver el detalle'}`}>
          <span className={s.fichaIcono} aria-hidden><Icono size={15} className={corriendo ? 'animate-spin' : undefined} /></span>
          <span className={s.titulos}>
            <span className={s.fichaLinea}>{linea}</span>
            <span className={s.fichaSub}>{sub}</span>
          </span>
          <ChevronDown size={16} className={s.flecha} data-abierta={abierta ? 'si' : undefined} aria-hidden />
        </button>
        {!abierta && (rapida ? (
          <button type="button" className={s.accion} disabled={!armado || !!ocupado} onClick={alClic('una')} title="Solo con un clic: el teclado no aprueba acciones">
            {ocupado === 'una' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} Una vez
          </button>
        ) : !listo && !corriendo && (
          <button type="button" className={s.revisar} onClick={() => setAbierta(true)}>Revisar</button>
        ))}
      </div>
      {abierta && <div className={s.detalle}><TarjetaComando c={c} incrustada /></div>}
    </article>
  )
}

/** El contenedor con desplazamiento del hilo que queda encima de la cola (el primero hacia arriba que se desplaza). */
function hiloDeArriba(el: HTMLElement): HTMLElement | null {
  const sedesplaza = (n: Element) => { const o = getComputedStyle(n).overflowY; return (o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight }
  for (let n = el.previousElementSibling; n; n = n.previousElementSibling) {
    if (sedesplaza(n)) return n as HTMLElement
    const dentro = [...n.querySelectorAll('*')].find(sedesplaza)
    if (dentro) return dentro as HTMLElement
  }
  return null
}

/**
 * Ronda 4 (nada se encima, también a 520): cuando la cola crece (aparece o se abre una ficha), el hilo de arriba se
 * desplaza lo mismo que creció, así lo último que se leía (el mensaje de Levy) sigue a la vista en vez de quedar
 * cortado detrás de la cola.
 */
function useAnclarHilo() {
  // Ref de función: la sección aparece y desaparece con la cola, y el observador la sigue.
  const [el, ref] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    let antes = 0
    const ro = new ResizeObserver(() => {
      const alto = el.getBoundingClientRect().height
      const crecio = alto - antes
      antes = alto
      if (crecio <= 0) return
      const hilo = hiloDeArriba(el)
      if (hilo) hilo.scrollTop += crecio
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return ref
}

/** La cola de esta conversación, encima del cuadro de escribir: una ficha por decisión. */
export function ColaDelHilo({ conversationId }: { conversationId?: string | null }) {
  const cola = useCola(conversationId ?? null)
  const [abierta, setAbierta] = useState(true)
  const ancla = useAnclarHilo()
  const ids = cola.map(c => c.id).join(',')
  useEffect(() => ids ? registrarColaVisible(ids.split(',')) : undefined, [ids])
  if (!conversationId || !cola.length) return null
  const vivas = cola.filter(c => c.estado !== 'corrida').length
  return (
    <section ref={ancla} className={s.hilo} aria-label="Tu cola de aprobaciones en esta conversación">
      <button type="button" className={s.cabeza} onClick={() => setAbierta(v => !v)} aria-expanded={abierta}>
        <span className={s.icono} aria-hidden><Inbox size={15} /></span>
        <span className={s.titulos}>
          <span className={s.titulo}>{vivas ? esperan(vivas) : 'Tu cola está al día'}</span>
          <span className={s.sub}>{vivas ? 'Levy siguió con lo demás. Cuando decidas, retoma esa parte.' : 'Levy ya tiene lo que decidiste.'}</span>
        </span>
        <ChevronDown size={16} className={s.flecha} data-abierta={abierta ? 'si' : undefined} aria-hidden />
      </button>
      {abierta && <div className={s.lista}>{cola.map(c => <FichaCola key={c.id} c={c} />)}</div>}
    </section>
  )
}

function leerVistas(): Set<string> {
  try { return new Set(JSON.parse(window.sessionStorage.getItem(VISTAS) ?? '[]') as string[]) } catch { return new Set() }
}
function guardarVistas(v: Set<string>) {
  try { window.sessionStorage.setItem(VISTAS, JSON.stringify([...v].slice(-200))) } catch { /* sin almacenamiento */ }
}

/**
 * Lugares propios (ronda 3: nada se encima). La app tiene `<main data-shell-main>` dentro de una fila flex:
 *   - la franja del contador entra como primer hijo de ese `main` y empuja la página hacia abajo;
 *   - el panel entra como hermano de `main` en la fila (columna propia: el chat se angosta, no se tapa).
 * Sin ese `main` (otras superficies), caen fijos al cuerpo de la página.
 */
function useLugar(donde: 'franja' | 'columna', activo: boolean): HTMLElement | null {
  const [lugar, setLugar] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!activo) { setLugar(null); return }
    const main = document.querySelector<HTMLElement>('[data-shell-main]')
    const padre = donde === 'franja' ? main : main?.parentElement
    if (!padre) { setLugar(document.body); return }
    const el = document.createElement('div')
    el.dataset.colaLugar = donde
    el.style.cssText = donde === 'franja' ? 'flex: none;' : 'display: flex; flex: none; min-height: 0;'
    if (donde === 'franja') padre.prepend(el); else padre.appendChild(el)
    setLugar(el)
    return () => { el.remove() }
  }, [donde, activo])
  return lugar
}

function useAncho(): number {
  const [w, setW] = useState(0)
  useEffect(() => { const f = () => setW(window.innerWidth); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return w
}

/** Contador de la cola en toda la app y su panel, que vuelve solo cuando la persona regresa. */
export function ContadorCola() {
  const cola = useCola()
  const vivas = cola.filter(c => c.estado !== 'corrida')
  const [abierto, setAbierto] = useState(false)
  const ancho = useAncho()
  // Lo que ya se ve en la cola del hilo abierto no se repite arriba (ronda 3: la pastilla se encimaba al encabezado).
  const todoEnElHilo = cola.every(c => seVeEnUnHilo(c.id))

  // Vuelve sola: al abrir la app o regresar a la pestaña, si hay algo nuevo en la cola que no se ve en un hilo abierto.
  const ids = vivas.map(c => c.id).join(',')
  useEffect(() => {
    if (!ids) { setAbierto(false); return }
    const revisar = () => {
      if (document.visibilityState !== 'visible') return
      const vistas = leerVistas()
      const nuevas = ids.split(',').filter(id => !vistas.has(id) && !seVeEnUnHilo(id))
      if (!nuevas.length) return
      for (const id of nuevas) vistas.add(id)
      guardarVistas(vistas)
      setAbierto(true)
    }
    const t = window.setTimeout(revisar, 400)
    document.addEventListener('visibilitychange', revisar)
    return () => { window.clearTimeout(t); document.removeEventListener('visibilitychange', revisar) }
  }, [ids])

  const hay = cola.length > 0 && ancho > 0
  const panel = hay && abierto
  const franja = hay && !abierto && vivas.length > 0 && !todoEnElHilo
  const columna = ancho >= COLUMNA_DESDE
  const lugarFranja = useLugar('franja', franja)
  const lugarPanel = useLugar('columna', panel && columna)
  if (!hay) return null
  if (panel) {
    const destino = columna ? lugarPanel : (typeof document !== 'undefined' ? document.body : null)
    if (!destino) return null
    const enColumna = columna && destino !== document.body
    return createPortal(<PanelCola cola={cola} vivas={vivas.length} modo={enColumna ? 'columna' : columna ? 'flotante' : 'pantalla'} cerrar={() => setAbierto(false)} />, destino)
  }
  if (!franja || !lugarFranja) return null
  const fija = lugarFranja === document.body
  return createPortal(
    <div className={s.franja} data-fija={fija ? 'si' : undefined}>
      <button type="button" className={s.franjaBoton} onClick={() => setAbierto(true)} aria-label={`Tu cola: ${esperan(vivas.length)}`}>
        <span className={s.cuenta} aria-hidden>{vivas.length}</span>
        <span className={s.franjaTexto}>{esperan(vivas.length)} de Levy</span>
        <span className={s.franjaVer}>Ver</span>
      </button>
    </div>, lugarFranja)
}

function PanelCola({ cola, vivas, modo, cerrar }: { cola: Confirmacion[]; vivas: number; modo: 'columna' | 'flotante' | 'pantalla'; cerrar: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [cerrar])
  const pantalla = modo === 'pantalla'
  return (
    <aside className={s.panel} data-modo={modo} role={pantalla ? 'dialog' : 'complementary'} aria-modal={pantalla ? true : undefined} aria-labelledby="cola-titulo">
      <header className={s.panelCabeza}>
        {pantalla
          ? <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Volver (la cola sigue aquí)"><ArrowLeft size={18} /></button>
          : <span className={s.icono} aria-hidden><Inbox size={16} /></span>}
        <div className={s.titulos}>
          <h2 id="cola-titulo" className={s.panelTitulo}>Mientras no estabas</h2>
          <p className={s.sub}>{vivas ? `${esperan(vivas)}. Levy siguió con lo demás; nada de esto se hizo sin ti.` : 'Al día: Levy ya tiene lo que decidiste.'}</p>
        </div>
        {!pantalla && <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Cerrar la cola (sigue aquí)" title="Luego: la cola sigue aquí"><X size={16} /></button>}
      </header>
      <div className={s.panelLista}>{cola.map(c => <FichaCola key={c.id} c={c} />)}</div>
      <footer className={s.panelPie}>
        <button type="button" className={s.luego} onClick={cerrar}>Luego</button>
        <span>Nada se hace solo: lo que no decidas te espera aquí hasta una semana.</span>
      </footer>
    </aside>
  )
}
