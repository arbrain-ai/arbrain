// «Sin crédito» en la web: la MISMA regla del daemon (server/src/cliente/sin-saldo.ts), reexportada, no copiada.
// La usan el chat (burbuja de error → «Recargar», solo en la edición cliente) y las pruebas.
import { esSinSaldo } from '../../../../server/src/cliente/sin-saldo.ts'
export * from '../../../../server/src/cliente/sin-saldo.ts'

/**
 * ¿El turno falló porque la cuenta no tiene crédito? El diagnóstico (mensaje del daemon) manda; el texto del turno solo
 * cuenta si es corto (el SDK a veces deja el aviso del proveedor como texto, p. ej. «Credit balance is too low»), para
 * no confundir una respuesta larga que hable de facturación con un 402.
 */
export function turnoSinCredito(msg: { error?: boolean; diagnostic?: string; content?: string }): boolean {
  if (!msg.error) return false
  return esSinSaldo(msg.diagnostic) || ((msg.content ?? '').length < 400 && esSinSaldo(msg.content))
}
