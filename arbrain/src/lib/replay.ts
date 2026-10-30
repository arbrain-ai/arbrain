/**
 * Replay corto para la terminal viva (5 oct 2026, Daniel desde la MacBook: «se queda en Conectando con el motor…»).
 *
 * El motor guarda hasta 4 MB de salida cruda por terminal. Un agente Opus de horas llena el ring: la ruta lo
 * mandaba completo (5.6 MB en base64 para 100091) y la vista solo deja de decir «Conectando…» cuando llega
 * el tamaño, DESPUÉS de todo el replay. En el Studio son 260 ms; por el relé del Funnel, minutos.
 *
 * El TUI se repinta solo al cambiar de tamaño (la vista ajusta la PTY al abrir), así que basta la cola: se
 * corta en el último borrado de pantalla dentro de la ventana (arranque limpio) o, si no hay, en un salto de
 * línea, y se antepone un reinicio de atributos para no heredar colores a medias.
 */
export const REPLAY_MAX = 384 * 1024

const BORRADOS = ['\x1b[2J', '\x1bc', '\x1b[?1049h'].map(s => Buffer.from(s, 'latin1'))
const REINICIO = Buffer.from('\x1b[0m', 'latin1')

export function recortarReplay(bytes: Buffer, max = REPLAY_MAX): Buffer {
  if (bytes.length <= max) return bytes
  const cola = bytes.subarray(bytes.length - max)
  const borrado = Math.max(...BORRADOS.map(b => cola.lastIndexOf(b)))
  // un borrado demasiado al final dejaría casi nada que ver: solo vale si deja al menos un cuarto de la ventana
  if (borrado >= 0 && cola.length - borrado >= max / 4) return Buffer.concat([REINICIO, cola.subarray(borrado)])
  const salto = cola.indexOf(0x0a)
  return Buffer.concat([REINICIO, salto >= 0 ? cola.subarray(salto + 1) : cola])
}
