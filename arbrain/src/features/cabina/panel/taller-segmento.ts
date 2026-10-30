'use client'
/**
 * Qué segmento del Taller está a la vista (Agentes, Rutinas, Memoria, Máquina), en una tienda y no en el
 * estado local del Taller (5 oct 2026). Así `mostrar {vista:"servidores"}`, la ruta /servidores y los avisos que aterrizan
 * con `?panel=taller&taller=servidores` cambian el segmento aunque el Taller ya esté abierto, y aunque viva en otra ventana
 * (el pedido viaja por el canal entre ventanas). Se recuerda en `arbrain.panelDerecho.taller`, el mismo lugar de antes.
 */
import { create } from 'zustand'
import { esEdicionCliente } from '@/lib/edicion'
import { escuchar, publicar } from './ventanas'

/**
 * Cuatro pestañas desde el 5 oct 2026 (Daniel, 18:11: «el Taller es tu cerebro por dentro»), cada una responde una pregunta:
 * Agentes (¿quién trabaja para mí?), Rutinas (¿qué corre solo y cómo le fue?), Memoria (¿qué sabe mi cerebro de mí?) y
 * Máquina (¿está todo prendido?). `registro` ya no es pestaña: vive detrás de un enlace discreto en Máquina y Rutinas.
 * Los ids viejos siguen llegando (avisos, rutas, Levy, lo guardado): `alias` los lleva a su pestaña nueva.
 */
export type SegmentoTaller = 'terminales' | 'historia' | 'rutinas' | 'memoria' | 'maquina' | 'registro'
const TODOS: { id: SegmentoTaller; etiqueta: string; pregunta: string }[] = [
  { id: 'terminales', etiqueta: 'Agentes', pregunta: '¿Quién está trabajando para mí ahora?' },
  // Historia (28 oct 2026, Daniel: «cómo podemos obtener lo mejor de ambos mundos con vistas en el taller… así como VS Code, con
  // ramas y todo»): dejó de ser pestaña suelta del panel; arriba lo del dueño, debajo el historial de git para aprenderlo.
  { id: 'historia', etiqueta: 'Historia', pregunta: '¿Qué cambió en mi cerebro y quién lo hizo?' },
  { id: 'rutinas', etiqueta: 'Rutinas', pregunta: '¿Qué corre solo y cómo le fue?' },
  { id: 'memoria', etiqueta: 'Memoria', pregunta: '¿Qué sabe mi cerebro de mí?' },
  { id: 'maquina', etiqueta: 'Computadora', pregunta: '¿Está todo prendido?' },
]
/**
 * Edición cliente: Agentes, Rutinas, Memoria y Computadora. Revisado el 22 oct 2026 (prueba de Windows de Daniel: «no veo
 * Rutinas ni Máquina»). Rutinas volvió el 29 oct 2026 (T8 del inventario de la cohorte): en cliente pinta `RutinasCliente`,
 * que lee `/api/rutinas` (el `/schedule` de SU daemon) y no `/api/planning/crons` (sigue excluida: Studio y Supabase). Si las
 * rutinas no correrían (suscripción sin llave de tope, falta de llave, pausa), la pestaña lo dice arriba.
 * Computadora volvió el 29 oct 2026 (T16: un alumno con 8 GB, otro pidió «RAM y forzar salida», una Mac Mini dormida):
 * en cliente pinta `ComputadoraCliente`, que lee `/api/computadora` (SU daemon: memoria, disco, procesador, reposo y las apps
 * que más ocupan, con cerrar). La Máquina de Daniel (`/api/cabina/servidores`: sus servidores, launchd y la Casa) sigue fuera.
 * El resto sigue fuera:
 *  · Registro vive detrás de Máquina y Rutinas.
 *  · Historia lee el repo del Studio con git (`/api/historia` responde 404 en cliente).
 */
const CLIENTE = esEdicionCliente()
export const SEGMENTOS_CLIENTE: readonly SegmentoTaller[] = ['terminales', 'rutinas', 'memoria', 'maquina']
/** En cliente, Computadora responde otra pregunta: la del alumno no es «¿está todo prendido?» sino si su máquina aguanta. */
const PREGUNTA_CLIENTE: Partial<Record<SegmentoTaller, string>> = { maquina: '¿Cómo va mi computadora?' }
export const SEGMENTOS_TALLER = CLIENTE
  ? TODOS.filter(t => SEGMENTOS_CLIENTE.includes(t.id)).map(t => ({ ...t, pregunta: PREGUNTA_CLIENTE[t.id] ?? t.pregunta }))
  : TODOS
const ALIAS: Record<string, SegmentoTaller> = { agentes: 'terminales', servidores: 'maquina', servicios: 'maquina', archivos: 'memoria' }
/** El segmento al que lleva un id (nuevo o viejo); null si no es del Taller. */
export function aSegmento(v: unknown): SegmentoTaller | null {
  if (typeof v !== 'string') return null
  const s = v === 'registro' || TODOS.some(t => t.id === v) ? v as SegmentoTaller : ALIAS[v] ?? null
  if (s && CLIENTE && !SEGMENTOS_TALLER.some(t => t.id === s)) return 'terminales'
  return s
}
export const esSegmentoTaller = (v: unknown): v is SegmentoTaller => aSegmento(v) != null

const CLAVE = 'arbrain.panelDerecho'
function leer(): SegmentoTaller {
  try { return aSegmento(JSON.parse(localStorage.getItem(CLAVE) ?? '{}')?.taller) ?? 'terminales' } catch { return 'terminales' }
}
function recordar(v: SegmentoTaller) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}'), taller: v })) } catch { /* sin almacenamiento */ }
}

export const useSegmentoTaller = create<{ segmento: SegmentoTaller; cargado: boolean; cargar: () => void; elegir: (v: SegmentoTaller, avisar?: boolean) => void }>((set, get) => ({
  segmento: 'terminales', cargado: false,
  cargar: () => {
    if (get().cargado || typeof window === 'undefined') return
    set({ segmento: leer(), cargado: true })
    escuchar(m => { const v = m.tipo === 'taller-segmento' ? aSegmento(m.segmento) : null; if (v) get().elegir(v, false) })
  },
  elegir: (v, avisar = false) => {
    recordar(v)
    set({ segmento: v })
    if (avisar) publicar({ tipo: 'taller-segmento', segmento: v })
  },
}))

/** Pone un segmento del Taller en esta ventana y en la que tenga el Taller. Un valor desconocido no hace nada. */
export function pedirSegmentoTaller(v: string) {
  const seg = aSegmento(v)
  if (!seg) return
  const st = useSegmentoTaller.getState()
  st.cargar(); st.elegir(seg, true)
}
