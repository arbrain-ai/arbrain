// Ajustes del chat que se leen una vez por conversación (5 nov 2026). Daniel: «tuve que reiniciar la app». Con el
// Studio saturado, /api/chat/model y /efforts tardaron 13 s y dieron 503; sin reintento, el composer se quedaba en
// «Modelo · Esfuerzo» hasta remontar la vista. Un fallo pasajero se reintenta mientras la conversación siga abierta.
export const ESPERAS_REINTENTO_MS = [1_500, 4_000, 10_000, 30_000]

/** 5xx, 408 y 429 pasan solos; 401, 403 o 404 no se arreglan insistiendo. */
export const esFalloPasajero = (status: number) => status >= 500 || status === 408 || status === 429

const dormirCancelable = (ms: number, signal: AbortSignal) => new Promise<void>((listo) => {
  if (signal.aborted) return listo()
  const fin = () => { clearTimeout(t); signal.removeEventListener('abort', fin); listo() }
  const t = setTimeout(fin, ms)
  signal.addEventListener('abort', fin, { once: true })
})

/** El JSON de la primera respuesta buena; null si el fallo es definitivo o se canceló. */
export async function leerConReintento(
  pedir: () => Promise<Response>,
  signal: AbortSignal,
  dormir: (ms: number, signal: AbortSignal) => Promise<void> = dormirCancelable,
): Promise<unknown> {
  for (let intento = 0; !signal.aborted; intento++) {
    try {
      const respuesta = await pedir()
      if (respuesta.ok) return await respuesta.json()
      if (!esFalloPasajero(respuesta.status)) return null
    } catch { /* red o JSON cortado: pasajero, salvo que se haya cancelado (lo revisa el for) */ }
    if (signal.aborted) return null
    await dormir(ESPERAS_REINTENTO_MS[Math.min(intento, ESPERAS_REINTENTO_MS.length - 1)], signal)
  }
  return null
}
