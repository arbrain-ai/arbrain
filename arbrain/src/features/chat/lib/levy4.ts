// Bandera de «Levy v4» en Live (noche de Levy v4, 8 nov 2026, labs/god-animation/practicas/2026-11-08-levy-noche).
// APAGADA por defecto: sin ella Live monta el Levy3D de siempre (B de producción, GLB n34) y pide la voz igual que antes.
// Encendida, el 3D de Levy en Live es el v4 vigente (candidato c06 de la noche): su GLB, su identidad, la vida y el
// parpadeo de p4 y la boca por fonema desde la alineación de ElevenLabs (componente Levy3DV4). Trinity y Sensei no cambian.
//
// Encender en un navegador: abrir cualquier página con `?levy4=1` (queda guardado en localStorage); `?levy4=0` la apaga.
// O a mano: localStorage.setItem('arbrain-levy4', '1').
import { levyVivoActivo } from './levy-vivo.ts'

export const LEVY4_CLAVE = 'arbrain-levy4'
/** GLB de c06 (harness/variantes/c06/levy-v4.glb de la noche, sha256 b39dfe8a…): n34 → identidad r5 → boca. */
export const LEVY4_URL = '/levy-3d/levy-v4-c06.glb'

export function levy4Activo(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('levy4')
    if (q === '1' || q === '0') window.localStorage.setItem(LEVY4_CLAVE, q)
    return window.localStorage.getItem(LEVY4_CLAVE) === '1'
  } catch { return false }
}

/** La voz de Live pide la alineación por carácter con «Levy vivo» (2D) o con Levy v4 (3D). Sin ninguna, como siempre. */
export function pedirAlineacion(): boolean {
  return levyVivoActivo() || levy4Activo()
}

/** Qué 3D monta Live: el v4 solo para Levy y solo con la bandera; todo lo demás, el Levy3D de siempre. */
export function usarLevy4(bandera: boolean, agente: string): boolean {
  return bandera && agente === 'levy'
}
