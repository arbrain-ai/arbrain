/**
 * Botones del tablero de agentes (27 oct 2026): Detener y Responder desde el Taller, por la MISMA vía que usa Levy
 * (`detener` y `retomar` de la Cabina). Solo subagentes del registro (los lanzó Levy con `delegar`) y abiertos; el
 * servidor re-verifica en el momento, la UI no decide nada.
 *
 *  · detener  = corta el paso en curso sin perder la sesión (sin-pantalla.ts › detenerSubagente). Reversible: un
 *               mensaje lo reanuda.
 *  · responder = un mensaje al agente (cuerpo.ts › retomar): si trabaja entra a su turno en curso o a su cola; si ya
 *               terminó, abre un turno nuevo sobre la misma sesión. Lleva una marca de que lo escribió el dueño.
 *               Con `esfuerzo` (29 oct 2026, «Reintentar con más esfuerzo»), ese turno corre en ese nivel.
 *  · comentarios = (29 oct 2026, idea 3 del reporte de Warp, sala limpia) lo que el dueño anotó sobre el entregable
 *               (archivo y línea de un diff, o un párrafo de un documento) viaja JUNTO en un solo mensaje por la misma
 *               vía que responder: el agente atiende el lote en un turno.
 *  · correr-plan / descartar-plan = el plan versionado (plan.ts): correrlo lo aprueba (commit) y lanza el subagente;
 *               descartarlo lo marca en el archivo, nunca lo borra.
 */
import { DUENO_M } from '../dueno.js'
import { ESFUERZOS } from './harness/tipos.js'

export interface ComentarioEntregable {
  /** Archivo (ruta relativa o absoluta) del entregable. */
  ruta: string
  /** Línea del archivo (diff o documento), si se sabe. */
  linea?: number
  /** Lo comentado, tal cual (la línea del diff o el párrafo). */
  cita?: string
  /** Lo que el dueño pide. */
  texto: string
}
export type PedidoTablero = { accion: 'detener'; agente: number } | { accion: 'responder'; agente: number; texto: string; esfuerzo?: string }
  | { accion: 'comentarios'; agente: number; comentarios: ComentarioEntregable[] }
  | { accion: 'correr-plan'; ruta: string } | { accion: 'descartar-plan'; ruta: string }

/** Topes del lote: el mensaje entero cabe en lo que viaja a un turno (4,000 caracteres, como responder). */
export const MAX_COMENTARIOS = 30
export const MAX_MENSAJE = 4000
const una = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)

/** Valida un comentario del navegador; null si no sirve. */
function comentario(v: unknown): ComentarioEntregable | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const ruta = typeof o.ruta === 'string' ? una(o.ruta, 300) : ''
  const texto = typeof o.texto === 'string' ? o.texto.trim().slice(0, 1200) : ''
  if (!ruta || !texto) return null
  const linea = Number(o.linea)
  return { ruta, texto, ...(Number.isInteger(linea) && linea > 0 ? { linea } : {}), ...(typeof o.cita === 'string' && o.cita.trim() ? { cita: o.cita.trim() } : {}) }
}

/**
 * El lote como UN mensaje: cada comentario con su archivo, su línea y lo citado (recortado para que el lote quepa), en el
 * orden del archivo. El agente lo atiende en un turno y dice qué cambió en cada uno.
 */
export function mensajeComentarios(cs: ComentarioEntregable[]): string {
  const orden = [...cs].sort((a, b) => a.ruta.localeCompare(b.ruta) || (a.linea ?? 0) - (b.linea ?? 0))
  const cabeza = `[${orden.length} ${orden.length === 1 ? 'comentario' : 'comentarios'} de ${DUENO_M} desde el Taller sobre tu entregable] Atiéndelos todos en este turno, en un solo pase, y al final di qué cambiaste en cada uno (por número). Si alguno no aplica, dilo con la razón.`
  for (const tope of [400, 200, 100, 0]) {
    const cuerpo = orden.map((c, i) => {
      const donde = c.linea ? `${c.ruta}, línea ${c.linea}` : c.ruta
      const cita = c.cita && tope ? `\n   > ${una(c.cita, tope)}${c.cita.length > tope ? '…' : ''}` : ''
      return `${i + 1}. ${donde}${cita}\n   ${c.texto.replace(/\n+/g, '\n   ')}`
    }).join('\n\n')
    const m = `${cabeza}\n\n${cuerpo}`
    if (m.length <= MAX_MENSAJE) return m
  }
  throw new Error(`Los comentarios no caben en un mensaje (máximo ${MAX_MENSAJE.toLocaleString('es-MX')} caracteres): mándalos en dos tandas.`)
}

/** Valida lo que llega del navegador. Devuelve el pedido limpio o el error en palabras. */
export function pedidoTablero(p: Record<string, unknown>): PedidoTablero | { error: string } {
  if (p.que === 'correr-plan' || p.que === 'descartar-plan') {
    const ruta = typeof p.ruta === 'string' ? p.ruta.trim() : ''
    if (!/^docs\/planes\/[^/]+\.md$/.test(ruta)) return { error: 'Falta la ruta del plan (docs/planes/<archivo>.md).' }
    return { accion: p.que, ruta }
  }
  const agente = Number(p.agente)
  if (!Number.isInteger(agente) || agente <= 0) return { error: 'Falta el agente.' }
  if (p.que === 'detener') return { accion: 'detener', agente }
  if (p.que === 'responder') {
    const texto = typeof p.texto === 'string' ? p.texto.trim() : ''
    if (!texto) return { error: 'Escribe el mensaje para el agente.' }
    if (texto.length > 4000) return { error: 'El mensaje es demasiado largo (máximo 4,000 caracteres).' }
    if (p.esfuerzo != null && !(ESFUERZOS as readonly unknown[]).includes(p.esfuerzo)) return { error: `Esfuerzo desconocido (hay: ${ESFUERZOS.join(', ')}).` }
    return { accion: 'responder', agente, texto, ...(typeof p.esfuerzo === 'string' ? { esfuerzo: p.esfuerzo } : {}) }
  }
  if (p.que === 'comentarios') {
    const lista = Array.isArray(p.comentarios) ? p.comentarios : []
    if (lista.length > MAX_COMENTARIOS) return { error: `Son ${lista.length} comentarios; el máximo por envío es ${MAX_COMENTARIOS}.` }
    const comentarios = lista.map(comentario).filter((c): c is ComentarioEntregable => !!c)
    if (!lista.length) return { error: 'No hay comentarios que mandar.' }
    if (comentarios.length !== lista.length) return { error: 'Algún comentario viene sin archivo o sin texto.' }
    try { mensajeComentarios(comentarios) } catch (e) { return { error: e instanceof Error ? e.message : 'No caben.' } }
    return { accion: 'comentarios', agente, comentarios }
  }
  return { error: 'Acción desconocida.' }
}

/** El mensaje que le llega al agente: dice de quién viene para que no lo confunda con Levy. */
export const mensajeDelDueno = (texto: string) => `[Mensaje de ${DUENO_M} desde el Taller] ${texto}`

export interface PuertoTablero {
  detener(id: number): Promise<{ estaba: boolean }>
  retomar(id: number, texto: string, cambio?: { esfuerzo?: string }): Promise<{ encolado: boolean; confirmado: boolean; enVivo?: boolean }>
  correrPlan?(ruta: string): Promise<{ id: number; commit: string | null; aviso?: string }>
  descartarPlan?(ruta: string): Promise<{ commit: string | null }>
}

export async function accionTablero(p: PedidoTablero, puerto?: PuertoTablero): Promise<{ ok: true; texto: string } | { ok: false; status: number; error: string }> {
  const real = puerto ?? {
    detener: async (id: number) => (await import('./sin-pantalla.js')).detenerSubagente(id),
    retomar: async (id: number, texto: string, cambio?: { esfuerzo?: string }) => (await import('./cuerpo.js')).retomar(id, texto, cambio),
    correrPlan: async (ruta: string) => { const { sub, plan } = await (await import('./plan.js')).correrPlan(ruta); return { id: sub.id, commit: plan.commit, ...(plan.aviso ? { aviso: plan.aviso } : {}) } },
    descartarPlan: async (ruta: string) => (await import('./plan.js')).descartarPlan(ruta),
  }
  try {
    if (p.accion === 'correr-plan') {
      const r = await real.correrPlan!(p.ruta)
      return { ok: true, texto: `Corriendo (agente ${r.id}). ${r.commit ? 'Esta versión del plan quedó aprobada en git: el juez la usa al terminar.' : `Sin commit: ${r.aviso ?? 'git no respondió'}.`}` }
    }
    if (p.accion === 'descartar-plan') {
      await real.descartarPlan!(p.ruta)
      return { ok: true, texto: 'Plan descartado. Queda en el archivo y en git con su fecha.' }
    }
    if (p.accion === 'comentarios') {
      const r = await real.retomar(p.agente, mensajeComentarios(p.comentarios))
      const n = p.comentarios.length, cuantos = `${n} ${n === 1 ? 'comentario' : 'comentarios'}`
      const texto = r.enVivo ? `Le llegaron tus ${cuantos} a su turno en curso.` : r.encolado ? `Tus ${cuantos} quedaron en su cola: los toma al terminar el paso.` : r.confirmado ? `Le llegaron tus ${cuantos}: empezó un turno para atenderlos.` : 'Se enviaron, pero no pude confirmar que le llegaran.'
      return { ok: true, texto }
    }
    if (p.accion === 'detener') {
      const r = await real.detener(p.agente)
      return { ok: true, texto: r.estaba ? 'Detenido. Su sesión sigue: un mensaje lo reanuda.' : 'No estaba trabajando: no había nada que detener.' }
    }
    const r = p.esfuerzo ? await real.retomar(p.agente, mensajeDelDueno(p.texto), { esfuerzo: p.esfuerzo }) : await real.retomar(p.agente, mensajeDelDueno(p.texto))
    const texto = r.enVivo ? 'Le llegó a su turno en curso: lo toma al terminar el paso que está haciendo.'
      : r.encolado ? 'Quedó en su cola: lo toma en cuanto termine el paso.'
      : r.confirmado ? `Le llegó: empezó un turno nuevo con tu mensaje${p.esfuerzo ? `, con esfuerzo ${p.esfuerzo}` : ''}.` : 'Se envió, pero no pude confirmar que le llegara.'
    return { ok: true, texto }
  } catch (e) {
    return { ok: false, status: 409, error: e instanceof Error ? e.message : 'No se pudo.' }
  }
}
