/**
 * Barrendero de huérfanos (6 oct 2026, Daniel al ver «10 huérfanos encendidos»: «no debería ocurrir»).
 *
 * Los agentes levantan Chromes invisibles, `http.server` y servidores de prueba y no siempre los cierran. El Taller
 * ya sabe cuáles son huérfanos verificables (`procesos.ts`) y tenía «Apagar» a mano; esto lo hace solo:
 *
 *  · Un proceso se apaga si sigue huérfano (misma firma pid:arranque) durante su gracia, contada desde que el
 *    barrendero lo vio huérfano por primera vez:
 *      - su agente, sesión o worktree ya cerró → GRACIA_DUENO (30 min): el dueño comprobable se fue.
 *      - nadie lo reclama (ppid 1, sin launchd)  → GRACIA_NADIE (3 h): pudo levantarlo Daniel a mano.
 *  · Apagar pasa por `apagarHuerfano`, que re-verifica en el momento; si dejó de ser huérfano no se toca.
 *  · Telemetría al log del servidor y a ~/.config/arbrain/barrendero.jsonl, nunca a la campana.
 *  · ARBRAIN_BARRENDERO=0 lo apaga sin deploy.
 */
import { DIR_ARBRAIN } from '../edicion.js'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Proceso } from './procesos.js'

export const GRACIA_DUENO_MS = Number(process.env.ARBRAIN_BARRENDERO_GRACIA_DUENO_MIN ?? 30) * 60_000
export const GRACIA_NADIE_MS = Number(process.env.ARBRAIN_BARRENDERO_GRACIA_NADIE_MIN ?? 180) * 60_000

export const graciaDe = (p: Proceso) => p.dueno?.tipo === 'nadie' || !p.dueno ? GRACIA_NADIE_MS : GRACIA_DUENO_MS

/** La regla, pura: actualiza `vistos` (firma → primera vez huérfano) y devuelve los que ya cumplieron su gracia. */
export function vencidos(lista: Proceso[], vistos: Map<string, number>, ahora: number): Proceso[] {
  const huerfanos = lista.filter(p => p.clase === 'huerfano')
  const actuales = new Set(huerfanos.map(p => p.firma))
  for (const f of vistos.keys()) if (!actuales.has(f)) vistos.delete(f)
  const out: Proceso[] = []
  for (const p of huerfanos) {
    const desde = vistos.get(p.firma) ?? ahora
    vistos.set(p.firma, desde)
    if (ahora - desde >= graciaDe(p)) out.push(p)
  }
  return out
}

const LOG = () => join(DIR_ARBRAIN(), 'barrendero.jsonl')

const vistos = new Map<string, number>()
/** Una pasada: lee procesos, apaga los vencidos. Devuelve cuántos apagó. */
export async function barrer(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<number> {
  const { trabajos, apagarHuerfano } = await import('./cuerpo.js')
  const lista = (await trabajos(1)).procesos
  if (!lista) return 0 // sin foto no se decide nada
  let n = 0
  for (const p of vencidos(lista, vistos, Date.now())) {
    const r = await apagarHuerfano(p.firma)
    const fila = { en: new Date().toISOString(), pid: p.pid, puertos: p.puertos, nombre: p.nombre, dueno: p.dueno?.nombre, razon: p.razon, ok: r.ok, ...(r.ok ? {} : { error: r.error }) }
    await mkdir(join(LOG(), '..'), { recursive: true }).then(() => appendFile(LOG(), JSON.stringify(fila) + '\n')).catch(() => {})
    if (r.ok) { n++; vistos.delete(p.firma); log.info(fila, 'barrendero: huérfano apagado') } else log.warn(fila, 'barrendero: no apagó')
  }
  return n
}
