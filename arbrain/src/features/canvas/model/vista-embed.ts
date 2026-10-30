/**
 * Canvas v4 — interactuar con un embed es estado de VISTA (3 oct 2026).
 *
 * El doble clic que deja tocar el HTML de adentro escribia `interactive: true`
 * EN EL DOCUMENTO: activar un pergamino para leerlo subia la version de la
 * pagina y le avisaba a sfmap de un "cambio" que no era. En sfmap
 * (EmbedHTML.swift, `interactivo`) es de la vista, de esta ventana, y aqui
 * tambien: vive en un Set local y solo se proyecta para PINTAR.
 *
 * El campo `interactive` que ya este guardado en paginas viejas se ignora al
 * pintar y se conserva intacto (no se reescribe por abrir).
 */
import type { CanvasElement } from './element'

/**
 * Los elementos tal como se PINTAN: cada embed lleva `interactive` segun la
 * vista. Si nada difiere devuelve EL MISMO arreglo. Nunca muta, y lo que
 * devuelve no se guarda: el documento sigue siendo `elements`.
 */
export function conInteraccion(elements: CanvasElement[], activos: ReadonlySet<string>): CanvasElement[] {
  let cambio = false
  const out = elements.map(e => {
    if (e.type !== 'embed') return e
    const quiere = activos.has(e.id)
    if (!!e.interactive === quiere) return e
    cambio = true
    return { ...e, interactive: quiere }
  })
  return cambio ? out : elements
}

/** ¿Este embed se puede tocar ahora? (solo la vista decide) */
export const embedActivo = (activos: ReadonlySet<string>, id: string) => activos.has(id)
