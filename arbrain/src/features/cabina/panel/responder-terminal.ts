/**
 * Contestarle a un agente desde donde Daniel esté (8 nov 2026). Daniel, desde el teléfono: «doy clic y no hay forma de
 * responder»: la pregunta de un agente llevaba a una terminal cruda y en el iPhone no hay dónde teclear. Esta caja
 * escribe en la misma PTY que la terminal viva (POST /api/cabina/terminal/[id] con `{ datos }`), sin pasar por xterm.
 *
 * Una sola línea: el texto va primero y el Enter después, por separado. Si viajaran juntos, el TUI (Claude, Codex,
 * opencode) lo toma como un pegado y deja el Enter como salto de línea en vez de enviar.
 */

/** Lo que se escribe en la PTY: una línea, sin control ni saltos. Vacío = nada que mandar. */
export function lineaParaAgente(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
}

export type Escribir = (datos: string) => Promise<{ ok: boolean; error?: string }>

export const ENTER = '\r'
/** Pausa entre el texto y el Enter para que el TUI cierre el «pegado» (ms). */
export const PAUSA_ENTER_MS = 150

/** Manda la respuesta: texto, pausa, Enter. Devuelve el motivo si el motor no la aceptó. */
export async function enviarRespuesta(texto: string, escribir: Escribir, pausa: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<{ ok: true } | { ok: false; error: string }> {
  const linea = lineaParaAgente(texto)
  if (!linea) return { ok: false, error: 'Escribe la respuesta.' }
  const a = await escribir(linea)
  if (!a.ok) return { ok: false, error: a.error ?? 'El motor no aceptó la respuesta.' }
  await pausa(PAUSA_ENTER_MS)
  const b = await escribir(ENTER)
  return b.ok ? { ok: true } : { ok: false, error: b.error ?? 'El motor no aceptó el Enter.' }
}

/** Escritura real: el endpoint de la terminal viva. */
export const escribirEnTerminal = (id: number): Escribir => async datos => {
  try {
    const r = await fetch(`/api/cabina/terminal/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datos }) })
    if (r.ok) return { ok: true }
    const j = await r.json().catch(() => ({})) as { error?: string }
    return { ok: false, error: j.error }
  } catch { return { ok: false, error: 'Sin conexión con el Studio.' } }
}
