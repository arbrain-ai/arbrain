/**
 * Lo que dice Taller › Agentes cuando no hay nadie trabajando (29 oct 2026, edición cliente). En la instalación de Daniel,
 * «Nadie trabaja ahora». En la del alumno, si nunca delegó nada, se lo dice tal cual y le explica cómo: su Levy delega
 * con la herramienta Agent (bajo su misma guardia) y aquí aparece. Puro, con pruebas (tests/edicion/taller-cliente.test.ts).
 */
import type { Trabajos } from '../trabajos-modelo'

export function textoTallerVacio(cliente: boolean, data: Pick<Trabajos, 'internas' | 'terminales'> | undefined): { titulo: string; cuerpo: string } {
  const algunaVez = (data?.internas?.length ?? 0) > 0 || (data?.terminales?.length ?? 0) > 0
  if (cliente && !algunaVez) return { titulo: 'Aún no has delegado nada.', cuerpo: 'Pídele a Levy que delegue un trabajo largo («ponle un agente a…») y lo verás aquí con su avance. Trabaja bajo tu misma guardia: lo que pida tu clic te llega en su tarjeta.' }
  return { titulo: 'Nadie trabaja ahora.', cuerpo: 'Cuando Levy lance un agente, lo verás aquí con su avance.' }
}
