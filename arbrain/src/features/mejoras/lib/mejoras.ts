/**
 * Ajustes › Mejoras en la web: los interruptores de las mejoras opcionales. La fuente de verdad es el daemon
 * (`/api/cabina/mejoras` → mejoras.json, igual que los ajustes del panel); este dispositivo guarda una copia en
 * localStorage para leerla al instante, también fuera de React (atajos, el chat, la voz).
 * Cada mejora pregunta `mejoraActiva(id)` y, apagada, se comporta exactamente como sin ella.
 */
import { MEJORAS, MEJORAS_DE_FABRICA, normalizarMejoras, type EstadoMejoras, type Mejora } from '../../../../server/src/cliente/mejoras-lista'
import { trMarca } from '@/shared/i18n/tr'

export { MEJORAS, MEJORAS_DE_FABRICA, normalizarMejoras, type EstadoMejoras, type Mejora }

export const CLAVE_MEJORAS = 'arbrain:mejoras'
export const EVENTO_MEJORAS = 'arbrain:mejoras'

type Almacen = Pick<Storage, 'getItem' | 'setItem'>
const almacen = (): Almacen | null => { try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null } }

/** Lo guardado en este dispositivo sobre lo de fábrica. */
export function leerMejorasLocal(s: Almacen | null = almacen()): EstadoMejoras {
  try { return normalizarMejoras(JSON.parse(s?.getItem(CLAVE_MEJORAS) ?? 'null')) } catch { return normalizarMejoras(null) }
}

export function guardarMejorasLocal(m: EstadoMejoras, s: Almacen | null = almacen()): void {
  try { s?.setItem(CLAVE_MEJORAS, JSON.stringify(m)) } catch { /* sin almacenamiento */ }
  if (typeof window !== 'undefined') { try { window.dispatchEvent(new CustomEvent(EVENTO_MEJORAS)) } catch { /* sin ventana */ } }
}

/** ¿La mejora está prendida? Lectura sincrónica, sirve en cualquier parte. */
export function mejoraActiva(id: Mejora, s: Almacen | null = almacen()): boolean {
  return leerMejorasLocal(s)[id]
}

/** Lo que se ve en Ajustes › Mejoras, en el orden de la lista. */
export const DEF_MEJORAS: ReadonlyArray<{ id: Mejora; nombre: string; detalle: string }> = [
  { id: 'panel-plegable', nombre: trMarca('Panel derecho que se pliega'), detalle: trMarca('Un asa en el borde del panel para esconderlo y mostrarlo, y el atajo ] (además de ⌘B).') },
  { id: 'mic-con-turno', nombre: trMarca('Micrófono y «+» mientras trabaja'), detalle: trMarca('Dicta o adjunta sin esperar a que termine la respuesta: entra a la fila, como el texto.') },
  { id: 'nota-borrador', nombre: trMarca('Nota de voz como borrador'), detalle: trMarca('Al detener la grabación, lo dictado queda en tu mensaje para revisarlo y enviarlo cuando quieras.') },
  { id: 'voz-lemonfox', nombre: trMarca('Elegir la voz de LemonFox'), detalle: trMarca('En Ajustes › Voz, con tu llave de LemonFox: elegir entre sus voces en español y probarlas.') },
]
