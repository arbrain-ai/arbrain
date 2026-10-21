/**
 * El carril de días (5 oct 2026, Daniel: «que pueda deslizarse de forma CONTINUA entre días: arrastra y el día siguiente
 * entra siguiendo el dedo, con inercia y snap al soltar»). Lógica pura, sin DOM (tests/planning/carril.test.ts).
 *
 * Convención: `desplazamiento` en px; negativo = la hoja se va a la izquierda y entra el día siguiente. `pasos` en días:
 * +1 = siguiente, -1 = anterior.
 */

/** Cuánto empuja la velocidad al soltar (ms de proyección): un gesto rápido corto cruza aunque no llegue a la mitad. */
export const EMPUJE_MS = 220

/** Cuánto hay que recorrer para cruzar: la mitad de la hoja, pero nunca más de esto (en pantalla completa la hoja mide 2000 px+). */
export const UMBRAL_MAX = 240

/** Al soltar: a qué hoja se asienta la pista. Nunca más de una hoja por suelta; la inercia larga ya cruzó al recentrar. */
export function destinoAlSoltar(desplazamiento: number, ancho: number, velocidad: number, empuje = EMPUJE_MS): -1 | 0 | 1 {
  if (!(ancho > 0)) return 0
  const proyectado = desplazamiento + velocidad * empuje, umbral = Math.min(ancho / 2, UMBRAL_MAX)
  if (proyectado <= -umbral) return 1
  if (proyectado >= umbral) return -1
  return 0
}

/** Cuando la pista recorre una hoja entera, el centro avanza y el desplazamiento se compensa: así se cruzan varios días seguidos. */
export function recentrar(desplazamiento: number, ancho: number): { pasos: number; desplazamiento: number } {
  if (!(ancho > 0)) return { pasos: 0, desplazamiento }
  let pasos = 0, d = desplazamiento
  while (d <= -ancho) { d += ancho; pasos++ }
  while (d >= ancho) { d -= ancho; pasos-- }
  return { pasos, desplazamiento: d }
}

/** Velocidad (px/ms) de las últimas muestras: solo cuenta lo de los últimos `ventana` ms, para que una pausa al final frene. */
export function velocidad(muestras: { t: number; d: number }[], ahora: number, ventana = 90): number {
  const recientes = muestras.filter(m => ahora - m.t <= ventana)
  if (recientes.length < 2) return 0
  const dt = Math.max(16, recientes[recientes.length - 1].t - recientes[0].t)
  return recientes.slice(1).reduce((s, m) => s + m.d, 0) / dt
}

/** La curva de la casa (--mov-curva, ease-out expo), para el asentado que se anima en JS y se puede interrumpir. */
export const curvaCasa = (t: number) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)

/** Un gesto de rueda es horizontal si domina claramente la X; se decide al empezar y se respeta hasta que el gesto termina.
 *  El vertical gana los empates y las diagonales (10 oct 2026, Daniel: «scroll vertical para ver el día»). */
export function ejeDeRueda(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return null
  return Math.abs(dx) > Math.abs(dy) * PROPORCION_X ? 'x' : 'y'
}

// ── El dedo en el teléfono (6 oct 2026, Daniel): «el día sigue al dedo, cambia pasado unos 60 px o con un deslizamiento
// rápido, y si no, regresa. Solo cuenta un gesto claramente horizontal.» Menos sensible desde el 10 oct 2026 (Daniel: «es muy
// sensible la forma en la que me paso los días de al lado»): el vertical gana las diagonales y cruzar pide más recorrido. ──

/** Con el dedo, cruzar pide recorrer esto (px), no media hoja: en un teléfono medio día es demasiado. */
export const UMBRAL_TOQUE = 90
/** Un deslizamiento rápido (px/ms) cruza aunque sea corto… */
export const VELOZ_TOQUE = 0.6
/** …si ya se movió esto (px): un roce no es un gesto. */
export const MINIMO_VELOZ = 28
/** El gesto se decide al pasar este recorrido (px) y desde ahí se respeta hasta soltar. */
export const DECIDE_TOQUE = 10
/** Horizontal «claro»: la X debe dominar a la Y por esta proporción (el doble: una diagonal es scroll vertical). */
export const PROPORCION_X = 2

/** El eje del gesto de un dedo: nada hasta `DECIDE_TOQUE`; luego `x` solo si es claramente horizontal, si no `y` (scroll). */
export function ejeDeToque(mx: number, my: number): 'x' | 'y' | null {
  if (Math.hypot(mx, my) <= DECIDE_TOQUE) return null
  return Math.abs(mx) > Math.abs(my) * PROPORCION_X ? 'x' : 'y'
}

/**
 * Al levantar el dedo: a qué hoja se asienta la pista. Cruza si recorrió `UMBRAL_TOQUE` px o si fue un deslizamiento
 * rápido (`VELOZ_TOQUE` px/ms tras `MINIMO_VELOZ` px) en el mismo sentido; un regreso rápido lo devuelve; si no, regresa.
 * Mismo signo que `destinoAlSoltar`: desplazamiento negativo = entra el día siguiente (+1).
 */
export function destinoAlSoltarToque(desplazamiento: number, ancho: number, velocidad: number): -1 | 0 | 1 {
  if (!(ancho > 0)) return 0
  const umbral = Math.min(UMBRAL_TOQUE, ancho / 2)
  const sentido = desplazamiento < 0 ? 1 : -1
  // Un gesto rápido en sentido contrario al recorrido es un arrepentimiento: la hoja vuelve.
  if (Math.abs(velocidad) >= VELOZ_TOQUE && Math.sign(velocidad) !== Math.sign(desplazamiento)) return 0
  if (Math.abs(desplazamiento) >= umbral) return sentido
  if (Math.abs(velocidad) >= VELOZ_TOQUE && Math.abs(desplazamiento) >= MINIMO_VELOZ) return sentido
  return 0
}

/** El riel de la Semana pesa más que el dedo: cada asiento de día pide pasar esta fracción de la columna. */
export const RESISTENCIA_RIEL = 0.55
/** Con el trackpad el riel avanza esta fracción de lo que empuja la rueda: la inercia del sistema no se lleva días de más. */
export const FRENO_RUEDA = 0.6

/**
 * Al soltar el riel de la Semana (10 oct 2026): cuántos días avanza. El primero pide `UMBRAL_TOQUE` px (o la columna si es más
 * angosta) y al menos `RESISTENCIA_RIEL` de la columna; cada día más, otra columna casi entera. Un deslizamiento rápido corto
 * cruza uno; un regreso rápido lo devuelve. Nunca más de `max` (una ventana). Signo como `destinoAlSoltar`: el desplazamiento
 * negativo (el dedo va a la izquierda) trae los días siguientes (+).
 */
export function diasAlSoltarRiel(desplazamiento: number, columna: number, velocidad: number, max: number): number {
  if (!(columna > 0) || !desplazamiento) return 0
  const a = Math.abs(desplazamiento), umbral = Math.max(columna * RESISTENCIA_RIEL, Math.min(UMBRAL_TOQUE, columna))
  if (Math.abs(velocidad) >= VELOZ_TOQUE && Math.sign(velocidad) !== Math.sign(desplazamiento)) return 0
  let n = a + 1e-6 >= umbral ? 1 + Math.floor((a - umbral) / columna + (1 - RESISTENCIA_RIEL) - 0.1) : Math.abs(velocidad) >= VELOZ_TOQUE && a >= MINIMO_VELOZ ? 1 : 0
  n = Math.max(0, Math.min(n, Math.max(1, max)))
  return desplazamiento < 0 ? n : -n
}
