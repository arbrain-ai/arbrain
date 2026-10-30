/**
 * Botón «Reintentar» del aviso de conexión del chat (29 oct 2026, cohorte: «se fue el internet… ya no me dejó entrar»).
 *
 * Si hay app o modo servidor (el supervisor atiende `daemon_estado` y `daemon_reiniciar`) y el motor NO responde, se
 * pide encenderlo otra vez y se espera a que vuelva; luego se recarga la página. Si el motor sí responde (la falla era
 * la red del dispositivo), solo se recarga: nunca se reinicia un motor sano, que cortaría lo que está trabajando.
 * Sin app ni modo servidor (el teléfono en el navegador), solo recarga. Puro: las acciones llegan por parámetro.
 */

export interface DepsReintento {
  hayApp: () => boolean
  daemonEstado: () => Promise<{ ready: boolean }>
  daemonReiniciar: () => Promise<unknown>
  esperarDaemon: (maxMs: number) => Promise<unknown>
  recargar: () => void
}

export type PasoReintento = 'solo-recargar' | 'motor-sano' | 'motor-reiniciado' | 'sin-control'

export async function reintentarConexion(d: DepsReintento): Promise<PasoReintento> {
  let paso: PasoReintento = 'solo-recargar'
  if (d.hayApp()) {
    try {
      const estado = await d.daemonEstado()
      if (estado.ready) paso = 'motor-sano'
      else {
        await d.daemonReiniciar()
        await d.esperarDaemon(30_000)
        paso = 'motor-reiniciado'
      }
    } catch {
      // El control no contestó (servidor encendiéndose o actualizándose): la recarga cae en la pantalla de espera.
      paso = 'sin-control'
    }
  }
  d.recargar()
  return paso
}
