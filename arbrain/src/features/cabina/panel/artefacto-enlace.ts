/**
 * El enlace propio de cada vista (14 oct 2026, «artefactos» como los de Anthropic): toda pieza que Levy muestra (un lienzo, un
 * documento, un video, una vista viva) tiene su URL. Lleva la INVOCACIÓN, no el contenido: al abrirla se lee de su fuente con la
 * sesión de Daniel, como cualquier pestaña. Nada queda público.
 *  · `/artefacto?v=…`  la pieza sola, a pantalla completa, sin tocar el panel.
 *  · `/telefono?abrir=…` el panel del teléfono con esa pieza como pestaña al frente (lo que manda el push de Levy).
 */
import type { MostrarInput, Vista } from '../model'
import { codificarVista, decodificarVista } from './compartido-puro'

export const VISTAS = ['calendario', 'objetivos', 'centro', 'lienzo', 'reporte', 'negocio', 'trabajos', 'finanzas', 'contenido', 'rutinas', 'servidores', 'memoria', 'equipo', 'documento', 'diario', 'salud', 'pizarron', 'masterclass', 'explorador', 'cohorte', 'casa', 'perro', 'historia'] as const satisfies readonly Vista[]

const limpia = (i: MostrarInput) => {
  const { fijar: _f, soltar: _s, guardar: _g, pestana: _p, ...resto } = i as MostrarInput & Record<string, unknown>
  return resto as Record<string, unknown>
}
export const enlaceArtefacto = (i: MostrarInput) => `/artefacto?v=${codificarVista(limpia(i))}`
export const enlaceTelefono = (i: MostrarInput) => `/telefono?abrir=${codificarVista(limpia(i))}`
export const leerVista = (v: string | null | undefined) => decodificarVista(v, VISTAS) as MostrarInput | null

/** Un id estable por vista: abrir el mismo enlace dos veces es la misma pestaña (fijadas.ts también la reconoce por su clave). */
export function idDeEnlace(v: string) {
  let h = 0
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0
  return `tel-${(h >>> 0).toString(36)}`
}
