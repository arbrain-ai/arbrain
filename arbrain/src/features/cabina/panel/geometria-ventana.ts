/**
 * Dónde está esta ventana en la pantalla (7 oct 2026). Daniel: arrastraba una pestaña de la principal y la soltaba sobre la
 * tira de la «Ventana 1» (otro monitor) y, en vez de estamparse ahí, nacía una ventana nueva.
 *
 * Causa: los blancos (ventanas.ts, `blancoPropia`) se calculaban con `window.screenX/screenY/outerWidth/outerHeight`, y en el
 * WKWebView de la app esos cuatro NO son reales (medido con un WKWebView suelto en dos monitores: 0, la altura del monitor
 * principal, 0 y 0, aunque se mueva la ventana). Los `screenX/screenY` de los EVENTOS de puntero sí lo son. El blanco de cada
 * ventana caía en un rectángulo imaginario, el punto de soltar no la tocaba y el arrastre acababa en «ventana nueva». En
 * Chrome (la prueba e2e y el navegador) esos valores sí valen, por eso nunca se vio allí.
 *
 * En el escritorio la geometría sale de la propia app (la API de ventana de Tauri: posición y tamaño del contenido y escala),
 * que es la verdad del sistema; se normaliza al formato de `GeomVentana` (exterior = interior, sin marco) para que
 * `rectEnPantalla` siga siendo la única cuenta. Fuera del escritorio vale `window.*`.
 *
 * Sin dependencias (ni React ni Tauri): la fuente nativa la registra ventanas.ts, y las pruebas ponen la suya.
 */
import type { GeomVentana } from './arrastre-geom'

/** Lo que mide la app para esta ventana, en píxeles FÍSICOS (la API de Tauri) y la escala del monitor donde está. */
export interface MedidaNativa { x: number; y: number; ancho: number; alto: number; escala: number }

/** La fuente devuelve la medida (o null si no la tiene). Asíncrona: la API de ventana lo es. */
export type FuenteGeometria = () => Promise<GeomVentana | null>

/** Medida física de la app → la geometría de ventana que usa el arrastre (puntos lógicos, contenido sin marco). */
export function geometriaDeNativa(m: MedidaNativa): GeomVentana | null {
  const { x, y, ancho, alto, escala } = m
  if (![x, y, ancho, alto, escala].every(Number.isFinite) || escala <= 0 || ancho <= 0 || alto <= 0) return null
  return { screenX: x / escala, screenY: y / escala, outerWidth: ancho / escala, outerHeight: alto / escala, innerWidth: ancho / escala, innerHeight: alto / escala }
}

let fuente: FuenteGeometria | null = null
let ultima: GeomVentana | null = null

/** Quien sabe medir la ventana de verdad (la app de escritorio, o la prueba) se registra aquí. */
export function fijarFuenteGeometria(f: FuenteGeometria | null) { fuente = f; ultima = null }

/** Lo que dice el navegador de esta ventana. Fiable en Chrome; en WKWebView no (ver arriba). */
export const geometriaWeb = (): GeomVentana => ({
  screenX: window.screenX, screenY: window.screenY, outerWidth: window.outerWidth, outerHeight: window.outerHeight, innerWidth: window.innerWidth, innerHeight: window.innerHeight,
})

/** Vuelve a medir la ventana (una ventana se mueve sin avisar a la página). Se llama al empezar un arrastre y al contestar un blanco. */
export async function refrescarGeometria(): Promise<void> {
  if (!fuente) return
  try { const g = await fuente(); if (g) ultima = g } catch { /* se queda la última medida, o window.* */ }
}

/** La geometría a usar ahora: la última medida por la app si la hay; si no, la del navegador. */
export const geometriaVentana = (): GeomVentana => ultima ?? geometriaWeb()
