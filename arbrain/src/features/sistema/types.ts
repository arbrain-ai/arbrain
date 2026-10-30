export type Seccion = 'ancla' | 'cuerpo' | 'mente' | 'nutricion'

export interface Habito {
  id: string
  clave: string
  nombre: string
  seccion: Seccion
  icono: string | null
  orden: number
}

export interface Reflexion {
  prioridad_am: string
  respuesta_am: string
  respuesta_pm: string
}

export interface CronRun {
  id: string
  run_id: string
  jobId: string
  response: string | null
  error: string | null
  status: string
  created_at: string
}

export const SECCION_LABEL: Record<Seccion, string> = {
  ancla: 'Ancla',
  cuerpo: 'Cuerpo',
  mente: 'Mente',
  nutricion: 'Nutrición',
}

export const SECCION_ORDER: Seccion[] = ['ancla', 'cuerpo', 'mente', 'nutricion']

/** Fecha local YYYY-MM-DD (no UTC: el "día" es el de Daniel donde esté). */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
