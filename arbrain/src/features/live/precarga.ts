/**
 * Cuándo se precalienta Live sin que nadie lo pida (5 oct 2026). Los avatares 3D pesan 29-35 MB cada uno: solo
 * se bajan por adelantado cuando la red no cuesta, es decir, cuando la página la sirve esta misma máquina (la
 * app de escritorio contra 127.0.0.1) y nadie pidió ahorrar datos. Fuera, Live se prepara por intención.
 */
export function redGratis(lugar: { hostname: string; protocol: string }, saveData?: boolean): boolean {
  const local = lugar.hostname === '127.0.0.1' || lugar.hostname === 'localhost' || lugar.hostname === '[::1]' || lugar.protocol === 'tauri:'
  return local && saveData !== true
}
