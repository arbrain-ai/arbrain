/**
 * Rutinas del líder solo con llave de API con tope (DISENO §1.2 y §1.4). OpenRouter dice el tope de la propia llave:
 * `GET https://openrouter.ai/api/v1/key` → `{ data: { limit, usage, limit_remaining, … } }` (`limit: null` = sin tope).
 * Una llave de Anthropic (Console) no expone su tope por API: no se puede verificar y la rutina no corre.
 * La llave entra por parámetro (en el CLI, por stdin) y nunca se escribe ni se imprime.
 */
export const URL_OPENROUTER = 'https://openrouter.ai/api/v1/key'

export async function verificarTope(llave, { env = process.env, fetchFn = globalThis.fetch, plazoMs = 15_000 } = {}) {
  const k = String(llave ?? '').trim()
  if (!k) return { ok: false, codigo: 'sin_llave', motivo: 'Las rutinas de tu cerebro que manda necesitan una llave de OpenRouter con tope de gasto, y esta máquina no tiene ninguna. Conéctala en Ajustes › Llaves; la rutina no corrió.' }
  if (k.startsWith('sk-ant-')) return { ok: false, codigo: 'no_verificable', motivo: 'Tu llave es de Anthropic y su tope no se puede comprobar desde aquí. Para que las rutinas corran solas usa una llave de OpenRouter con «Credit limit»; la rutina no corrió.' }
  if (!k.startsWith('sk-or-')) return { ok: false, codigo: 'no_verificable', motivo: 'No reconozco esta llave como de OpenRouter, así que no puedo comprobar su tope; la rutina no corrió.' }
  const url = env.ARBRAIN_ESPEJO_OPENROUTER_URL?.trim() || URL_OPENROUTER
  let res
  try {
    res = await fetchFn(url, { headers: { Authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(plazoMs) })
  } catch (e) {
    return { ok: false, codigo: 'no_verificado', motivo: `No pude consultar a OpenRouter el tope de tu llave (${e?.name === 'TimeoutError' ? 'no respondió' : 'sin conexión'}); la rutina no corrió y se intenta en la siguiente ventana.` }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, codigo: 'llave_rechazada', motivo: 'OpenRouter rechazó tu llave (¿la borraste o caducó?). Conecta otra en Ajustes › Llaves; la rutina no corrió.' }
  if (!res.ok) return { ok: false, codigo: 'no_verificado', motivo: `OpenRouter respondió ${res.status} al consultar el tope; la rutina no corrió.` }
  let j
  try { j = await res.json() } catch { return { ok: false, codigo: 'no_verificado', motivo: 'OpenRouter respondió algo que no entiendo al consultar el tope; la rutina no corrió.' } }
  const d = j?.data ?? j ?? {}
  const limite = typeof d.limit === 'number' && Number.isFinite(d.limit) ? d.limit : null
  if (limite == null) return { ok: false, codigo: 'sin_tope', motivo: 'Tu llave de OpenRouter no tiene tope de gasto. Ponle un «Credit limit» (por ejemplo US$10) en openrouter.ai › Settings › Keys; mientras no lo tenga, las rutinas automáticas no corren.' }
  const usado = typeof d.usage === 'number' ? d.usage : null
  const restante = typeof d.limit_remaining === 'number' ? d.limit_remaining : usado != null ? limite - usado : null
  if (restante != null && restante <= 0) return { ok: false, codigo: 'tope_agotado', limite, restante, motivo: `Tu llave llegó a su tope (US$${limite}). La rutina no corrió; súbele el tope en OpenRouter si quieres que sigan.` }
  return { ok: true, codigo: 'con_tope', limite, restante, motivo: `Llave con tope de US$${limite}${restante != null ? ` (quedan US$${Math.round(restante * 100) / 100})` : ''}.` }
}
