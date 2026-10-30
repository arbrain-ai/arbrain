// Errores honestos de infraestructura (resiliencia, 12 oct 2026).
//
// Incidente del 11 oct: PostgREST murió y Arbrain contestó «Forbidden», «Sin conversaciones» y «Mensaje guardado»
// durante 8 horas. Regla: una dependencia caída responde 503 con una frase que dice QUÉ no responde y QUÉ hace Arbrain
// (o la persona); nunca 401/403/404, lista vacía ni «no existe». Los textos viven aquí para que todas las rutas digan lo
// mismo y la edición del alumno nunca mencione el Studio, ngrok ni túneles.
import { esEdicionCliente } from '@/lib/edicion'

export const MSJ_BASE_CAIDA = 'La base de Arbrain no responde ahora; Arbrain reintenta solo. Nada de lo tuyo se perdió.'

export function msjMotorCaido(cliente = esEdicionCliente()): string {
  return cliente
    ? 'El motor de Arbrain no responde; se está reiniciando solo. Tu mensaje queda guardado y sale en cuanto vuelva. Si pasa más de un minuto, cierra y abre Arbrain.'
    : 'No pude alcanzar el daemon (ClaudeClaw). Revisa que esté arriba en el Mac Studio y que el túnel siga vivo; tu mensaje queda guardado y se reintenta solo.'
}

/** ¿El error de `auth.getUser()` es de infraestructura (red, 5xx) y no «no hay sesión»? */
export function esFallaDeAuth(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: string; status?: number }
  return e.name === 'AuthRetryableFetchError' || (typeof e.status === 'number' && (e.status === 0 || e.status >= 500))
}

export function respuestaServicioCaido(mensaje = MSJ_BASE_CAIDA, code = 'SERVICIO_NO_DISPONIBLE'): Response {
  return Response.json({ error: mensaje, code, reintentable: true }, { status: 503, headers: { 'Retry-After': '5' } })
}
