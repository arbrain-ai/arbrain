import type { TurnoActivo } from './turnos-activos'

// Turno vivo que esta pantalla todavía no sigue (5 nov 2026). Daniel: «tarda en cargar el tiempo pensando, a veces no
// lo veo». El journal ya sabe que Levy trabaja (por eso el punto del sidebar está amarillo) mientras /api/chat/live
// tarda: con la máquina saturada son segundos en los que el hilo se veía como si nadie hubiera recibido el mensaje.
// Con el último mensaje ya respondido no se pinta: el poll del journal va atrasado unos segundos al terminar un turno.
export function turnoSinEnganchar({ estado, siguiendo, ultimo }: {
  estado: TurnoActivo | undefined
  /** Esta pantalla ya sigue el turno o lo está despachando. */
  siguiendo: boolean
  ultimo: { role: string; streaming?: boolean } | undefined
}): boolean {
  if (estado !== 'working' || siguiendo) return false
  return !ultimo || ultimo.role === 'user' || !!ultimo.streaming
}
