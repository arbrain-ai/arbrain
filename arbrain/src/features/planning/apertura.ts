/**
 * Al abrir, hoy (10 oct 2026, Daniel desde su iPhone: el Día abrió en «Lun 31 ago» y la Semana en una fecha de antes). Regla firmada:
 * al abrir o reabrir la app, Día, Semana y Mes arrancan SIEMPRE en hoy; la fecha navegada solo vale dentro de la sesión viva.
 *
 * Por qué se quedaba anclada: la URL espeja `?date=&mode=` en cada movimiento (para recargar o expandir desde el panel) y la pestaña
 * del panel guarda su `fecha`; al montar, el calendario obedecía esa fecha sin importar cuánto tiempo había pasado. El iPhone reabre
 * la app con la última URL. Ahora una marca en `sessionStorage` con la hora de la última actividad decide: viva (menos de
 * `REAPERTURA_MS` sin usarla) = se respeta la fecha pedida; si no, es una apertura nueva y manda hoy. Volver a la app tras ese
 * tiempo en segundo plano (la página siguió viva) también la lleva a hoy.
 */
export const REAPERTURA_MS = 15 * 60_000
export const CLAVE_SESION = 'arbrain:planning:sesion'

/** ¿La marca (epoch ms en texto) dice que esta sesión sigue viva? Sin marca, o vieja, es una apertura nueva. */
export function sesionViva(marca: string | null, ahora: number): boolean {
  const t = Number(marca)
  return Boolean(marca) && Number.isFinite(t) && t <= ahora && ahora - t < REAPERTURA_MS
}

/** La fecha con la que arranca el calendario: la pedida (URL o pestaña del panel) solo dentro de la sesión viva; si no, hoy. */
export function fechaDeArranque(pedida: string | null | undefined, viva: boolean, hoy: string): string {
  return viva && pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy
}

/** Al volver a la app: ¿se reabre en hoy? Sí si estuvo fuera al menos `REAPERTURA_MS`. */
export function reabrirEnHoy(ocultoDesde: number | null, ahora: number): boolean {
  return ocultoDesde !== null && ahora - ocultoDesde >= REAPERTURA_MS
}

/** Lee y renueva la marca de sesión (sin almacenamiento, cada montaje es una apertura nueva). */
export function marcarSesion(ahora = Date.now()): boolean {
  try {
    const viva = sesionViva(sessionStorage.getItem(CLAVE_SESION), ahora)
    sessionStorage.setItem(CLAVE_SESION, String(ahora))
    return viva
  } catch { return false }
}
export function tocarSesion(ahora = Date.now()) { try { sessionStorage.setItem(CLAVE_SESION, String(ahora)) } catch { /* sin almacenamiento */ } }
