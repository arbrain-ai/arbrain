'use client'
/**
 * Una sola lectura de las confirmaciones vivas para toda la app (botón Play, 27 oct 2026). La comparten la tarjeta del
 * hilo (`TarjetaComando`) y el diálogo de respaldo (`ConfirmacionesHumanas`): un sondeo, no dos.
 *
 * Reparto: lo que pidió Levy en la conversación va en el hilo mientras haya un turno vivo pintado (`hilosVivos`); lo
 * demás (rutinas, computer use, o un pedido de Levy sin hilo a la vista) sigue en el diálogo global.
 *
 * Modo de demostración (`activarDemo`): la página de capturas inyecta confirmaciones de ejemplo y nada se sondea.
 */
import { useSyncExternalStore } from 'react'
import { vivasParaLaPersona, type Confirmacion, type EstadoSandbox } from './confirmacion'

const SONDEO_MS = 1500

/** `terminadas` (ronda 3): «Córrelo tú» que acaba de terminar, para que su tarjeta quede en «Listo» en vez de esfumarse. */
interface Estado { pendientes: Confirmacion[]; terminadas: Confirmacion[]; sandbox: EstadoSandbox | null; hilosVivos: number; demo: boolean }
let estado: Estado = { pendientes: [], terminadas: [], sandbox: null, hilosVivos: 0, demo: false }
const oyentes = new Set<() => void>()
let timer: number | null = null

const emitir = (cambio: Partial<Estado>) => { estado = { ...estado, ...cambio }; for (const o of oyentes) o() }

export async function leerPendientes(): Promise<void> {
  if (estado.demo) return
  try {
    const r = await fetch('/api/confirmaciones', { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json() as { pendientes?: Confirmacion[]; terminadas?: Confirmacion[]; sandbox?: EstadoSandbox }
    const terminadas = (Array.isArray(j.terminadas) ? j.terminadas : []).filter(c => c.estado === 'corrida' && !descartadas().has(c.id))
    emitir({ pendientes: vivasParaLaPersona(Array.isArray(j.pendientes) ? j.pendientes : []), terminadas, ...(j.sandbox && typeof j.sandbox.disponible === 'boolean' ? { sandbox: j.sandbox } : {}) })
  } catch { /* el daemon se está reiniciando: se reintenta en el siguiente ciclo */ }
}

const alVolver = () => { if (document.visibilityState === 'visible') void leerPendientes() }
function arrancar() {
  if (timer !== null || typeof window === 'undefined') return
  void leerPendientes()
  timer = window.setInterval(alVolver, SONDEO_MS)
  document.addEventListener('visibilitychange', alVolver)
}
function parar() {
  if (timer === null) return
  window.clearInterval(timer); timer = null
  document.removeEventListener('visibilitychange', alVolver)
}

function suscribir(o: () => void) {
  oyentes.add(o)
  arrancar()
  return () => { oyentes.delete(o); if (!oyentes.size) parar() }
}

const SERVIDOR: Estado = { pendientes: [], terminadas: [], sandbox: null, hilosVivos: 0, demo: false }
export const usePendientes = (): Estado => useSyncExternalStore(suscribir, () => estado, () => SERVIDOR)

/** Quita una ya resuelta (respuesta inmediata en la UI) y vuelve a leer. */
export function olvidar(id: string, reemplazo?: Confirmacion) {
  emitir({ pendientes: reemplazo && (reemplazo.estado === 'corriendo') ? estado.pendientes.map(c => c.id === id ? reemplazo : c) : estado.pendientes.filter(c => c.id !== id) })
  void leerPendientes()
}

/** Un turno vivo del hilo está en pantalla: las de Levy se pintan ahí. Devuelve cómo soltarlo. */
export function registrarHilo(): () => void {
  emitir({ hilosVivos: estado.hilosVivos + 1 })
  let suelto = false
  return () => { if (suelto) return; suelto = true; emitir({ hilosVivos: Math.max(0, estado.hilosVivos - 1) }) }
}

/** Solo la página de demostración (capturas): confirmaciones de ejemplo, sin red. */
export function activarDemo(pendientes: Confirmacion[], sandbox: EstadoSandbox | null = null, terminadas: Confirmacion[] = []) {
  parar()
  emitir({ demo: true, pendientes, terminadas, sandbox })
}

/** «Entendido» sobre un «Listo»: no vuelve a pintarse en esta sesión de la app. */
const DESCARTADAS = 'arbrain.correlo.descartadas'
function descartadas(): Set<string> {
  try { return new Set(JSON.parse(window.sessionStorage.getItem(DESCARTADAS) ?? '[]') as string[]) } catch { return new Set() }
}
export function descartarTerminada(id: string) {
  const d = descartadas(); d.add(id)
  try { window.sessionStorage.setItem(DESCARTADAS, JSON.stringify([...d].slice(-100))) } catch { /* sin almacenamiento */ }
  emitir({ terminadas: estado.terminadas.filter(c => c.id !== id) })
}

/**
 * Cola de aprobaciones (ronda 2): ids que ya se ven en la cola de un hilo abierto. El contador global no abre su panel
 * solo por estas (la persona ya las tiene delante).
 */
const enHiloVisible = new Map<string, number>()
export function registrarColaVisible(ids: string[]): () => void {
  for (const id of ids) enHiloVisible.set(id, (enHiloVisible.get(id) ?? 0) + 1)
  emitir({}) // el contador global se esconde si todo ya se ve en el hilo (ronda 3: nada duplicado ni encimado)
  return () => { for (const id of ids) { const n = (enHiloVisible.get(id) ?? 1) - 1; if (n > 0) enHiloVisible.set(id, n); else enHiloVisible.delete(id) } emitir({}) }
}
export const seVeEnUnHilo = (id: string) => enHiloVisible.has(id)
