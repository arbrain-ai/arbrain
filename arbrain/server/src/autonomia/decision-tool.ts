/**
 * `cli.ts decidir` (autonomía v2): Levy sube a la bandeja de la persona lo que no es suyo decidir (contactar a alguien,
 * pagar, borrar, publicar fuera de la cohorte, promesas, precios), con su recomendación. Nace en la cola, suena una vez en
 * el teléfono y la respuesta (Sí · No · Otro) vuelve a ESTA conversación como un mensaje. Así a la persona le llega una
 * decisión con su recomendación, no una pregunta abierta en el chat.
 */
import { DUENO } from '../dueno.js'

/** Lo que Levy lee (CLAUDE.md lo apunta; `cli.ts decidir --ayuda`). */
export const DECISION_DESCRIPTION = `Sube una decisión a la bandeja de ${DUENO} (app y teléfono): lo irreversible que no decides tú (contactar personas, pagar, borrar lo que no es de prueba, publicar fuera de la cohorte, términos legales) y lo que siempre es suyo (promesas, precios, reembolsos, cobranza, mensajes delicados). titulo = la decisión en una línea («Mandarle a Juan: …»); recomienda si|no; recomendacion = por qué, como él lo diría; detalle = el texto EXACTO que saldría (el mensaje completo). categoria enviar|pagar|borrar|publicar|otra. expira = cuándo deja de aplicar si está atada a una hora («13:00» de hoy o «2026-11-04T13:00»): a esa hora vence sola, sale de su franja con «ya no aplica» y nunca se ejecuta; úsalo siempre que la decisión hable de una hora («hoy a la 1 pm»). Contactar y pagar nunca van en «Sí a todas». NO esperes: termina tu turno y sigue con lo demás; su Sí, No u Otro te llega a esta conversación. Con su Sí, pasa decision=<id> a encargar. Lo reversible (configurar, su agenda, borrar lo de prueba) no se sube: hazlo y queda en «Lo que hice solo». accion pedir (por defecto) | ver {id}. La conversación se deduce de tu sesión de Claude.`

export async function ejecutarDecision(o: Record<string, unknown>, scope: { owner: string; account: string; conversationId: string } | null, fetcher: typeof fetch = fetch): Promise<{ text: string; error?: boolean }> {
  const { readEnvFile } = await import('../env.js')
  const env = readEnvFile(['MC_SERVER_PORT', 'OPENCLAW_GATEWAY_TOKEN'])
  const puerto = process.env.MC_SERVER_PORT || env.MC_SERVER_PORT || '3099', token = process.env.OPENCLAW_GATEWAY_TOKEN || env.OPENCLAW_GATEWAY_TOKEN
  if (!token) return { text: 'No hay token del servidor para subir la decisión.', error: true }
  const llamar = async (ruta: string, cuerpo?: unknown) => {
    const r = await fetcher(`http://127.0.0.1:${puerto}${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }), signal: AbortSignal.timeout(10_000) })
    return { status: r.status, j: await r.json().catch(() => ({})) as Record<string, unknown> }
  }
  if (o.accion === 'ver') {
    if (typeof o.id !== 'string') return { text: 'ver necesita id.', error: true }
    const { status, j } = await llamar(`/decisiones/${o.id}`)
    return status === 200 ? { text: `${o.id}: ${j.estado}${j.respuesta ? ` (${j.respuesta})` : ''}${j.comentario ? ` · «${j.comentario}»` : ''}` } : { text: String(j.error ?? `HTTP ${status}`), error: true }
  }
  const { status, j } = await llamar('/decisiones/pedir', { titulo: o.titulo, recomendacion: o.recomendacion, recomienda: o.recomienda, detalle: o.detalle, categoria: o.categoria, ...(o.expira ? { expira: o.expira } : {}), ...(scope ? { conversacion: scope } : {}), ...(process.env.CLAUDE_CODE_SESSION_ID ? { sesion: process.env.CLAUDE_CODE_SESSION_ID } : {}) })
  if (status !== 200) return { text: `No se subió: ${String(j.error ?? `HTTP ${status}`)}`, error: true }
  const vence = typeof j.vence === 'number' ? ` Vence sola a las ${new Date(j.vence).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })} si no contesta.` : ''
  return { text: `Decisión ${j.id} en la bandeja de ${DUENO}, con push a su teléfono. Sin su toque no sale nada.${vence} ${j.conversacion ? 'Su respuesta te llega a esta conversación: termina tu turno y sigue con lo demás.' : 'Esta sesión no tiene conversación de la app: consulta su respuesta con accion ver.'}` }
}
