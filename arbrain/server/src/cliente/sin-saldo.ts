/**
 * «La cuenta no tiene crédito» (A/B del primer arranque, ronda 2 › EL gap). Una sola regla para la prueba de la llave
 * (`probar-llave.ts`) y para el chat de la web (`src/features/primer-arranque/lib/sin-saldo.ts` la reexporta): el
 * mismo error que da «Recargar» en el primer arranque lo da en el chat. Sin imports: la web la toma tal cual.
 *
 * Lo que devuelven los proveedores (y el SDK de Claude al envolverlos, «API Error: 402 {…}»):
 *  - OpenRouter: HTTP 402 «Insufficient credits. Add more using https://openrouter.ai/settings/credits», «This request
 *    requires more credits, or fewer max_tokens», saldo negativo (402 incluso en modelos `:free`).
 *  - Anthropic: 400 «Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to
 *    upgrade or purchase credits.»
 *  - Genéricos: «Payment Required», «billing».
 */
export const PATRON_SIN_SALDO = /\b402\b|payment.?required|insufficient.?(credit|balance|fund|quota)|credit.?balance|(more|out of|no) credits|purchase credits|negative.?balance|billing|\bcredits?\b.*\b(exhausted|depleted|too low)\b/i

export const CODIGO_SIN_SALDO = 'sin_saldo'

/** ¿El texto de un error dice que la cuenta no tiene crédito? */
export function esSinSaldo(texto: unknown): boolean {
  return typeof texto === 'string' && texto.length > 0 && PATRON_SIN_SALDO.test(texto.slice(0, 4000))
}

// ── Llave rechazada o sin crédito en el CHAT (humo de instaladores, 13 oct 2026, hallazgo 2) ─────────────────────────
// El CLI de Claude reintenta un 401 de OpenRouter durante ~3 minutos (178 s medidos) antes de cerrar el turno con
// «Failed to authenticate. API Error: 401 User not found.». En la edición cliente el daemon corta el turno en el PRIMER
// evento que lo delata (`system/api_retry` con 401/402/403, o el error del turno) y dice en español qué pasó y qué hacer.
// Mismas reglas para la web (`export *` en src/features/primer-arranque/lib/sin-saldo.ts): sin imports en este archivo.

/** 401/403 o el texto con que Anthropic, OpenRouter o el SDK dicen que la llave no sirve. */
export const PATRON_LLAVE_INVALIDA = /api error:? *40[13]\b|\b(status|code|http)[ :=]*40[13]\b|failed to authenticate|authentication.?(error|failed)|invalid.{0,20}(api.?key|x-api-key|bearer|credential|auth)|unauthori[sz]ed|user not found|no auth credentials|permission_error|oauth_org_not_allowed|account_on_hold|api key.{0,20}(revoked|disabled|expired)|not logged in|please run \/login/i

/** Errores del SDK (`SDKAssistantMessageError`) que significan llave o cuenta. */
const ERRORES_LLAVE = new Set(['authentication_failed', 'oauth_org_not_allowed', 'account_on_hold'])
const ERRORES_SALDO = new Set(['billing_error'])

export type FalloDeCuenta = 'llave_invalida' | 'sin_saldo'

/** ¿Este error de la API es de la llave o del saldo (no de red ni de saturación)? Primero el saldo: un 402 es saldo. */
export function clasificarFalloDeCuenta(f: { status?: unknown; error?: unknown; texto?: unknown }): FalloDeCuenta | null {
  const status = typeof f.status === 'number' ? f.status : null
  const error = typeof f.error === 'string' ? f.error : ''
  const texto = typeof f.texto === 'string' ? f.texto.slice(0, 4000) : ''
  if (status === 402 || ERRORES_SALDO.has(error) || esSinSaldo(texto)) return 'sin_saldo'
  if (status === 401 || status === 403 || ERRORES_LLAVE.has(error) || (texto && PATRON_LLAVE_INVALIDA.test(texto))) return 'llave_invalida'
  return null
}

/** Inicio fijo del aviso de «falta conectar un modelo» (cliente/llaves.ts › MENSAJE_FALTA_LLAVE): la web lo reconoce. */
export const INICIO_FALTA_LLAVE = 'Levy todavía no está conectado a un modelo.'

/** ¿El turno no salió porque no hay llave ni sesión? Solo mira el aviso del daemon (diagnóstico de un error). */
export function esFaltaLlave(msg: { error?: boolean; diagnostic?: string }): boolean {
  return !!msg.error && typeof msg.diagnostic === 'string' && msg.diagnostic.startsWith(INICIO_FALTA_LLAVE)
}

/** Inicio fijo del aviso de llave rechazada: la web lo reconoce por aquí (no por el detalle del proveedor). */
export const INICIO_LLAVE_RECHAZADA = 'Tu llave no funcionó:'

const nombreProveedor = (p: string | null | undefined) => (p === 'anthropic' ? 'Anthropic' : p === 'openrouter' ? 'OpenRouter' : 'tu proveedor')

/**
 * Texto del chat cuando el turno se corta por la cuenta. El detalle técnico va al final y en una línea propia: sirve
 * para soporte y conserva el «402»/«billing» que reconoce `esSinSaldo` (así el chat ofrece «Recargar»).
 */
export function mensajeFalloDeCuenta(tipo: FalloDeCuenta, proveedor: string | null | undefined, detalle: string): string {
  const donde = nombreProveedor(proveedor)
  const d = detalle.replace(/\s+/g, ' ').trim().slice(0, 300)
  const cola = d ? `\n\nDetalle técnico: ${d}` : ''
  // Motor «Mi Claude Code» (cliente/suscripcion.ts): no hay llave que recargar ni pegar; la sesión es la de su terminal.
  if (proveedor === 'suscripcion') {
    if (tipo === 'sin_saldo') return `Tu plan de Claude no dejó responder a Levy (límite de uso o plan inactivo). Espera a que se reinicie tu límite o revisa tu plan en claude.ai; también puedes conectar una llave en Ajustes › Llaves.${cola}`
    return `Tu Claude Code no tiene la sesión iniciada (o venció), por eso Levy no pudo responder. Abre Ajustes › Llaves, pulsa «Iniciar sesión con Claude», entra con tu cuenta en el navegador y pulsa «Reintentar».${cola}`
  }
  if (tipo === 'sin_saldo') {
    return `Tu cuenta de ${donde} se quedó sin crédito, por eso Levy no pudo responder. Recarga crédito en ${donde} y pulsa «Reintentar»; tu mensaje sigue aquí.${cola}`
  }
  return `${INICIO_LLAVE_RECHAZADA} ${donde} la rechazó (no es válida, venció o se revocó), por eso Levy no pudo responder. Abre Ajustes › Llaves y vuelve a «Conectar con OpenRouter» o pega una llave nueva; después pulsa «Reintentar».${cola}`
}

/** ¿El turno del chat falló porque la llave fue rechazada? Solo mira el aviso del daemon (diagnóstico de un error). */
export function esLlaveRechazada(msg: { error?: boolean; diagnostic?: string }): boolean {
  return !!msg.error && typeof msg.diagnostic === 'string' && msg.diagnostic.startsWith(INICIO_LLAVE_RECHAZADA)
}
