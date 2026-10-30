'use client'
/**
 * «Ver y deshacer» (27 oct 2026; ronda 2 tras el crítico ciego). Cada turno que cambió archivos CIERRA con una sola
 * fila: «Levy cambió 2 memorias y 1 skill · Ver cambios». Abierta: un renglón por archivo, nombrado por su función, con
 * el diff solo de lo de ESTE turno; al pie, «Deshacer desde aquí» y «Ver en la historia» (Taller › Historia). Deshacer abre una
 * vista previa y una sola confirmación ámbar, igual a la de «Volver» de la vista historia; después, «Rehacer». El motor
 * es el checkpoint de archivos del SDK (server/src/chat-runtime/deshacer.ts); nada se toca sin la confirmación.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { mostrarPanel } from '@/features/cabina/panel/ventanas'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'
import { ChevronRight, FilePen, Undo2, Redo2, Loader2, X, Check, History } from 'lucide-react'
import type { ChatMessage } from '../hooks/useChat'
import { archivosTocados, edicionesDelTurno, fraseDeshacer, lugarDeRuta, porArchivo, resumenDeshecho, resumenTurno, type Edicion } from '../lib/diff-edicion'
import { useDeshacerApi, type VistaDeshacer } from '../lib/deshacer-api'
import { DiffEdicion, Ubicacion } from './DiffEdicion'
import s from './diff-edicion.module.css'
import { esEdicionCliente } from '@/lib/edicion'

// La vista Historia todavía no está en la edición cliente (su ruta responde 404): ahí no se ofrece el atajo.
const CON_HISTORIA = !esEdicionCliente()

type Estado =
  | { fase: 'quieto' }
  | { fase: 'cargando' }
  | { fase: 'confirmar'; vista: VistaDeshacer }
  | { fase: 'deshaciendo'; vista: VistaDeshacer }
  | { fase: 'deshecho'; archivos: number; rutas: string[]; respaldoId?: string }
  | { fase: 'rehaciendo'; archivos: number; rutas: string[]; respaldoId: string }
  | { fase: 'rehecho' }
  | { fase: 'error'; texto: string }

const hora = (d: Date) => d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
const archivosDe = (n: number) => `${n} ${n === 1 ? 'archivo' : 'archivos'}`

function Dialogo({ vista, ediciones, cuando, ocupado, onConfirmar, onCancelar }: {
  vista: VistaDeshacer; ediciones: Edicion[]; cuando?: Date; ocupado: boolean; onConfirmar: () => void; onCancelar: () => void
}) {
  const titulo = useId()
  // Ronda 4: al abrir, el foco va al diálogo mismo (sin anillo), no a «Cancelar»: así el único color al abrir es el
  // ámbar de la acción principal. Con teclado, Tab llega a los botones y ahí sí se ve el foco (:focus-visible).
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCancelar)
  cerrar.current = onCancelar
  useEffect(() => { caja.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !ocupado) cerrar.current() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ocupado])
  const n = vista.archivos.length
  return createPortal(
    <div className={s.velo} onMouseDown={ev => { if (ev.target === ev.currentTarget && !ocupado) onCancelar() }} data-deshacer-dialogo>
      <div ref={caja} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titulo} className={s.dialogo}>
        <header className={s.dialogoCab}>
          <div>
            <p className={s.ceja}>Deshacer desde aquí</p>
            <h2 id={titulo} className={s.titulo}>{!n ? 'No hay nada que deshacer' : n === 1 ? '¿Volver este archivo a como estaba?' : `¿Volver estos ${n} archivos a como estaban?`}</h2>
          </div>
          <button type="button" className={s.cerrar} onClick={onCancelar} disabled={ocupado} aria-label="Cerrar"><X size={15} /></button>
        </header>
        <div className={s.dialogoCuerpo}>
          {!n
            ? <p className={s.explica}>Tus archivos ya están como antes de este mensaje.</p>
            : <>
                <p className={s.explica}>{fraseDeshacer(vista, ediciones, cuando ? hora(cuando) : undefined)}</p>
                <ul className={s.archivos}>
                  {vista.archivos.map(r => <li key={r}><span className={s.archivoLugar}>{lugarDeRuta(r, ediciones)}</span></li>)}
                </ul>
                <Ubicacion rutas={vista.archivos} texto={n === 1 ? 'Ver ubicación' : 'Ver ubicación de los archivos'} />
                <p className={s.nota}>Si Levy {n === 1 ? 'lo' : 'los'} volvió a cambiar en turnos posteriores, eso también se deshace. Lo que se cambió con comandos no se deshace. Después puedes rehacer.</p>
              </>}
        </div>
        <footer className={s.dialogoPie}>
          <button type="button" className={s.secundario} onClick={onCancelar} disabled={ocupado}>{n ? 'Cancelar' : 'Cerrar'}</button>
          {n > 0 && <button type="button" className={s.primario} onClick={onConfirmar} disabled={ocupado} data-deshacer-confirmar>
            {ocupado ? <Loader2 size={13} className={s.gira} aria-hidden /> : <Undo2 size={13} aria-hidden />}
            {ocupado ? 'Volviendo…' : n === 1 ? 'Volver este archivo' : `Volver estos ${n}`}
          </button>}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

export function CambiosTurno({ msg }: { msg: ChatMessage }) {
  const ediciones = useMemo(() => edicionesDelTurno(msg), [msg])
  const archivos = useMemo(() => porArchivo(ediciones), [ediciones])
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })
  const api = useDeshacerApi()
  const id = useId()
  if (!ediciones.length) return null
  const turnId = msg.metadata?.turnId
  const puedeDeshacer = !msg.streaming && !!turnId && archivosTocados(ediciones).length > 0

  const pedirVista = async () => {
    if (!turnId) return
    setEstado({ fase: 'cargando' })
    try {
      const vista = await api.vista(turnId)
      setEstado(vista.ok ? { fase: 'confirmar', vista } : { fase: 'error', texto: vista.error ?? 'No se pudo preparar el deshacer.' })
    } catch { setEstado({ fase: 'error', texto: 'No pude hablar con el servidor de Levy. No se tocó nada.' }) }
  }
  const confirmar = async (vista: VistaDeshacer) => {
    if (!turnId) return
    setEstado({ fase: 'deshaciendo', vista })
    try {
      const r = await api.deshacer(turnId)
      setEstado(r.ok ? { fase: 'deshecho', archivos: r.archivos.length || vista.archivos.length, rutas: r.archivos.length ? r.archivos : vista.archivos, respaldoId: r.respaldoId } : { fase: 'error', texto: r.error ?? 'No se pudo deshacer.' })
    } catch { setEstado({ fase: 'error', texto: 'Se perdió la conexión mientras deshacía. Revisa tus archivos antes de reintentar.' }) }
  }
  const rehacer = async (archivos: number, rutas: string[], respaldoId: string) => {
    if (!turnId) return
    setEstado({ fase: 'rehaciendo', archivos, rutas, respaldoId })
    try {
      const r = await api.rehacer(turnId, respaldoId)
      setEstado(r.ok ? { fase: 'rehecho' } : { fase: 'error', texto: r.error ?? 'No se pudo rehacer.' })
    } catch { setEstado({ fase: 'error', texto: 'No pude hablar con el servidor de Levy.' }) }
  }
  // Las rutas que el servidor dice que volvieron; si ninguna coincide con las del turno (otra forma de escribirlas),
  // se marcan todas las que se aplicaron: el deshacer siempre es del turno entero.
  const rutasDeshechas = estado.fase === 'deshecho' || estado.fase === 'rehaciendo'
    ? (archivos.some(e => estado.rutas.includes(e.ruta)) ? new Set(estado.rutas) : new Set(archivosTocados(ediciones)))
    : null
  const quieto = estado.fase === 'quieto' || estado.fase === 'cargando' || estado.fase === 'confirmar' || estado.fase === 'deshaciendo' || estado.fase === 'rehecho'

  return (
    <div className={s.cambios} data-cambios data-tts-exclude>
      <button type="button" className={s.fila} aria-expanded={abierto} {...(rutasDeshechas ? { 'data-deshecho': '' } : {})} aria-controls={id} onClick={() => setAbierto(a => !a)}>
        <FilePen className={s.icono} aria-hidden />
        <span className={s.texto}>{rutasDeshechas ? resumenDeshecho(ediciones) : resumenTurno(ediciones)}</span>
        <span className={s.verCambios} aria-hidden>·</span>
        <span className={s.verCambios}>{abierto ? 'Ocultar cambios' : 'Ver cambios'}</span>
        <ChevronRight className={s.flecha} aria-hidden />
      </button>
      {abierto && <div id={id} role="region" aria-label="Lo que Levy cambió en este turno" className={s.cuerpo}>
        <ul className={s.lista}>{archivos.map(e => <DiffEdicion key={e.ruta || e.toolId} e={e}
          deshecho={!!rutasDeshechas && !e.fallo && rutasDeshechas.has(e.ruta)} />)}</ul>
        <div className={s.pie} data-pie-turno>
          {puedeDeshacer && quieto && <button type="button" className={s.secundario} onClick={pedirVista} disabled={estado.fase === 'cargando'} data-deshacer-abrir>
            {estado.fase === 'cargando' ? <Loader2 size={13} className={s.gira} aria-hidden /> : <Undo2 size={13} aria-hidden />}
            Deshacer desde aquí
          </button>}
          {puedeDeshacer && estado.fase === 'rehecho' && <span className={s.ayuda} role="status">Rehecho: tus archivos quedaron como antes de deshacer.</span>}
          {(estado.fase === 'deshecho' || estado.fase === 'rehaciendo') && <>
            <span className={s.estado} role="status"><Check size={14} aria-hidden /> Listo: {archivosDe(estado.archivos)} {estado.archivos === 1 ? 'volvió a como estaba' : 'volvieron a como estaban'}.{estado.respaldoId ? ' Rehacer pone de nuevo todo lo de este turno.' : ''}</span>
            {estado.respaldoId && <button type="button" className={s.secundario} disabled={estado.fase === 'rehaciendo'} onClick={() => rehacer(estado.archivos, estado.rutas, estado.respaldoId!)} data-rehacer>
              {estado.fase === 'rehaciendo' ? <Loader2 size={13} className={s.gira} aria-hidden /> : <Redo2 size={13} aria-hidden />}Rehacer
            </button>}
          </>}
          {estado.fase === 'error' && <>
            <span className={s.error} role="alert">{estado.texto}</span>
            <button type="button" className={s.secundario} onClick={() => setEstado({ fase: 'quieto' })}>Entendido</button>
          </>}
          {CON_HISTORIA && <button type="button" className={s.historia} data-ver-historia onClick={() => { pedirSegmentoTaller('historia'); mostrarPanel('taller') }}><History size={13} aria-hidden />Ver en la historia</button>}
        </div>
      </div>}
      {(estado.fase === 'confirmar' || estado.fase === 'deshaciendo') && <Dialogo vista={estado.vista} ediciones={ediciones} cuando={msg.metadata?.startedAt ? new Date(msg.metadata.startedAt) : msg.timestamp}
        ocupado={estado.fase === 'deshaciendo'} onConfirmar={() => confirmar(estado.vista)} onCancelar={() => setEstado({ fase: 'quieto' })} />}
    </div>
  )
}
