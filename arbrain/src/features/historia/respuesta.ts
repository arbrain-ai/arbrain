import { planningError } from '@/lib/planning/server'
import { ErrorHistoria } from './servidor'

/** Errores de la historia con su estado; lo demás (sesión, permisos) como el resto de la app. */
export function respuestaError(error: unknown) {
  if (error instanceof ErrorHistoria) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  return planningError(error)
}
