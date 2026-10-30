/**
 * Reintentos del supervisor (29 oct 2026, cohorte: «se fue el internet… cuando quise entrar, ya no me dejó entrar»).
 *
 * Antes: tras 5 caídas en 5 minutos el supervisor dejaba de relanzar el daemon o la web y pedía la terminal. Con el
 * supervisor vivo, la app de escritorio y launchd creían que todo estaba bien y la persona se quedaba fuera.
 * Ahora nunca se rinde: espera cada vez más entre intentos (2 s, 5 s, 15 s, 30 s y luego 60 s, sin límite) y, si el
 * proceso aguantó arriba un buen rato antes de caerse, vuelve a la espera corta. Puro: lo prueba tests/servidor.
 */

/** Esperas entre intentos seguidos; el último se repite para siempre. */
export const ESPERAS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

/** Si el proceso vivió al menos esto antes de caerse, la cuenta vuelve a empezar (espera corta). */
export const ESTABLE_MS = 2 * 60_000

/** Espera antes del intento número `caidas` (1 = primera caída seguida). Nunca devuelve «rendirse». */
export function esperaTras(caidas) {
  const n = Number.isFinite(caidas) && caidas >= 1 ? Math.floor(caidas) : 1
  return ESPERAS_MS[Math.min(n, ESPERAS_MS.length) - 1]
}

/**
 * Una caída más. `caidasPrevias`: caídas seguidas que llevaba; `vivioMs`: cuánto aguantó arriba esta vez.
 * Devuelve las caídas seguidas nuevas y cuánto esperar antes de relanzar.
 */
export function trasCaida(caidasPrevias, vivioMs) {
  const caidas = vivioMs >= ESTABLE_MS ? 1 : Math.max(0, caidasPrevias | 0) + 1
  return { caidas, esperaMs: esperaTras(caidas) }
}

const QUIEN = { daemon: 'El motor de Arbrain (daemon)', web: 'La pantalla de Arbrain (web)' }

/** Lo que dice el log (y lo que la web y la app leen) mientras espera para relanzar. Para alguien no técnico. */
export function avisoCaida(nombre, caidas, esperaMs) {
  const quien = QUIEN[nombre] ?? nombre
  const s = Math.round(esperaMs / 1000)
  const vez = caidas > 1 ? ` (${caidas} veces seguidas)` : ''
  return `${quien} se detuvo${vez}. Lo vuelvo a encender solo en ${s} s y sigo intentando; no tienes que hacer nada.`
}
