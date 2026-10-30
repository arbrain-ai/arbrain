'use client'
/**
 * Cliente de «Deshacer desde aquí» (27 oct 2026). Por defecto habla con /api/chat/deshacer; el laboratorio inyecta una
 * versión de demostración con DeshacerApiContext (sin red, sin tocar archivos).
 */
import { createContext, useContext } from 'react'

export interface VistaDeshacer {
  ok: boolean
  archivos: string[]
  inserciones: number
  borrados: number
  respaldoId?: string
  error?: string
  motivo?: 'apagado' | 'sin_punto' | 'ocupada' | 'sdk'
}
export interface RehacerResultado { ok: boolean; archivos: string[]; error?: string }

export interface DeshacerApi {
  vista: (turnId: string) => Promise<VistaDeshacer>
  deshacer: (turnId: string) => Promise<VistaDeshacer>
  rehacer: (turnId: string, respaldoId: string) => Promise<RehacerResultado>
}

async function pedir<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/chat/deshacer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const data = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok && !(data as { error?: string }).error) return { ok: false, archivos: [], inserciones: 0, borrados: 0, error: `No se pudo (${r.status}).` } as T
  return data
}

export const apiReal: DeshacerApi = {
  vista: turnId => pedir({ turnId, accion: 'vista' }),
  deshacer: turnId => pedir({ turnId, accion: 'deshacer' }),
  rehacer: (turnId, respaldoId) => pedir({ turnId, accion: 'rehacer', respaldoId }),
}

export const DeshacerApiContext = createContext<DeshacerApi>(apiReal)
export const useDeshacerApi = () => useContext(DeshacerApiContext)
