'use client'
/**
 * Panel compartido entre aparatos (14 oct 2026, Daniel: «lo que tengo en el escritorio poderlo ver en el teléfono, sobre todo
 * la pantalla derecha»). Las pestañas dejan de ser de cada aparato: el Studio guarda una copia y el latido del bus (bus.ts, cada
 * ~3 s y al cambiar algo) manda lo que cambió aquí y trae lo que cambió en otro lado. La lógica pura y sus pruebas viven en
 * compartido-puro.ts; aquí, el enlace con el store de pestañas.
 *
 * Qué viaja: las pestañas, su orden, el Taller, las ancladas y la pestaña a la vista. Qué NO: en qué ventana vive cada pestaña
 * (las ventanas son de este escritorio) ni la división. La pestaña a la vista que elige otro aparato solo se sigue en el
 * teléfono (es un espejo); el escritorio no cambia de pestaña porque Daniel toque el teléfono.
 */
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import { usePanelFijadas, type Fijada } from './fijadas'
import { alRecibir, basePrimerContacto, firmaEstado, type EstadoPanel, type PedidoCompartido, type RespuestaCompartido } from './compartido-puro'
import { todasLasClaves } from './pestanas-fuera'

type Estado = EstadoPanel<Fijada & { input: Fijada['input'] & Record<string, unknown> }>

let base: Estado | null = null
let rev = 0
let activaRev = 0
/** La pestaña a la vista de ESTE aparato la última vez que se miró: solo se manda cuando cambia aquí (si se mandara cada vez que
 *  difiere de la del Studio, el escritorio y el teléfono se la arrebatarían en cada latido). */
let activaLocal: string | null = null
/** La última que llegó del Studio. */
let activaSabida: string | null = null
/** Un cambio que el Studio no quiso guardar (demasiado grande): no se reintenta hasta que cambie algo más. */
let rechazadoPorError: string | null = null

const local = (): Estado => {
  const st = usePanelFijadas.getState()
  return { fijadas: st.fijadas as Estado['fijadas'], orden: st.orden, taller: st.taller, ancladas: st.ancladas }
}

/** Lo que este latido le manda al Studio. */
export function pedidoCompartido(): PedidoCompartido {
  const st = usePanelFijadas.getState()
  const p: PedidoCompartido = { rev, activaRev }
  if (!base || !st.cargado) return p
  const aqui = local(), f = firmaEstado(aqui)
  if (f !== firmaEstado(base) && f !== rechazadoPorError) p.cambio = { base: rev, ...aqui }
  if (st.activa && st.activa !== activaLocal) { p.activa = st.activa; activaSabida = st.activa; activaLocal = st.activa }
  return p
}

/** Lo que el Studio contestó en el latido. */
export function recibirCompartido(r: RespuestaCompartido | undefined) {
  if (!r || typeof r.rev !== 'number') return
  const st = usePanelFijadas.getState()
  st.cargar()
  if (r.error) rechazadoPorError = firmaEstado(local())
  // Primer contacto: la pestaña a la vista de ahora es la de partida (abrir la app no es elegir una pestaña).
  if (activaLocal === null) activaLocal = st.activa
  if (r.estado) {
    const remoto = r.estado as Estado, aqui = local()
    const desde = base ?? basePrimerContacto(aqui, r.rev, isDesktopRuntime())
    const queda = alRecibir(remoto, desde, aqui)
    base = remoto
    rev = r.rev
    if (firmaEstado(queda) !== firmaEstado(aqui)) usePanelFijadas.getState().aplicarRemoto(queda)
  } else if (!base) {
    // El Studio está vacío (o ya tenemos su versión): desde aquí se siembra con lo que hay.
    base = r.rev === 0 ? basePrimerContacto(local(), 0, false) : local()
    rev = r.rev
  }
  if (typeof r.activa === 'string') {
    activaRev = r.activaRev
    // La primera que llega solo se anota: al abrir la app (o un enlace de «ábrelo en mi teléfono») manda lo que se abrió aquí.
    const yaLaSabia = activaSabida === null || r.activa === activaSabida
    activaSabida = r.activa
    // El teléfono es espejo: sigue la pestaña que Daniel eligió en el escritorio (si existe aquí).
    const ahora = usePanelFijadas.getState()
    if (!yaLaSabia && esTelefonoAhora() && r.activa !== ahora.activa && todasLasClaves(ahora.orden, ahora.taller).includes(r.activa)) {
      ahora.activar(r.activa)
      activaLocal = r.activa
    }
  } else activaRev = r.activaRev
}

/** Solo para pruebas: olvida lo acordado (como una app recién abierta). */
export function reiniciarCompartido() { base = null; rev = 0; activaRev = 0; activaLocal = null; activaSabida = null; rechazadoPorError = null }
