/** Lo que responde `GET /api/extensiones` (lo arma el daemon: server/src/extensiones/tienda.ts › estado). */
import type { Manifiesto } from '../modelo'
import { tr, trMarcas } from '@/shared/i18n'

export interface Requisito { tipo: 'arbrain' | 'skill' | 'programa' | 'extension'; nombre: string; ok: boolean | null; ayuda?: string }
export interface LlaveVista { clave: string; para: string; como_conseguirla?: string; opcional: boolean; guardada: boolean }
export interface TareaVista { id: string; cada: string; alta: boolean; estado: string | null; proxima: number | null; ultima: number | null; resultado: string | null }
export interface ExtensionVista {
  id: string
  nombre: string
  descripcion: string
  acerca: string | null
  categoria: string | null
  etiquetas: string[]
  enCatalogo: boolean
  version: string | null
  valida: boolean
  instalada: { version: string | null; desde: string | null; ambito: string } | null
  actualizable: boolean
  manifiesto: Manifiesto | null
  requisitos: Requisito[]
  llaves: LlaveVista[]
  tareas: TareaVista[]
}
export interface EstadoTienda {
  catalogo: { fuente: string | null; tipo: 'carpeta' | 'remoto' | null; conectado: boolean; disponible: boolean; version: string | null; error?: string }
  arbrain: { version: string | null }
  extensiones: ExtensionVista[]
}

const DIAS = trMarcas(['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'] as const)

/** «0 20 * * 0» → «los domingos a las 20:00». Lo que no es un patrón simple se muestra tal cual. */
export function cadaEnPalabras(cron: string): string {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(cron.trim())
  if (!m) return tr('con el horario «{cron}»', { cron })
  const hora = `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`
  if (m[3] === '*') return tr('todos los días a las {hora}', { hora })
  return tr('los {dia} a las {hora}', { dia: tr(DIAS[Number(m[3])]), hora })
}
