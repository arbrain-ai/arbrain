/**
 * I8 en las manos (empaquetado, 11 oct 2026; contrato §6). El servidor MCP de manos corre en otro proceso que el daemon:
 * cuando el freno deja pasar algo irreversible con la cita real de la persona, en la edición cliente además hace falta su
 * clic en la app. Se pide al daemon por HTTP (`/confirmaciones/*`, Bearer del entorno) y se espera la decisión.
 * El modelo puede crear la pendiente; aprobarla exige el secreto de la app, que este proceso no tiene.
 * Contrato v3 (red team C2): se manda la acción estructurada (`herramienta` + `partes`); el daemon calcula el literal que
 * ve la persona y la huella. El `resumen` de aquí solo viaja como motivo declarado.
 * Instalación de Daniel: no aplica (devuelve ok sin preguntar).
 */
import { esEdicionCliente } from '../edicion.js'
import type { CategoriaConfirmacion } from '../cliente/confirmaciones.js'

/** Categoría del freno (enviar, boton_sin_texto, compra, borrar…) → categoría del contrato. */
export function categoriaDe(categoriaFreno: string | undefined, motivo = ''): CategoriaConfirmacion {
  const t = `${categoriaFreno ?? ''} ${motivo}`.toLowerCase()
  if (/pag|compr|tarjeta|cobr|checkout|transfer/.test(t)) return 'pagar'
  if (/borr|elimin|delete|papelera|vaciar/.test(t)) return 'borrar'
  if (/public|post|tuit|tweet|compart/.test(t)) return 'publicar'
  if (/envi|send|chat|correo|mensaje|enter|pegar/.test(t)) return 'enviar'
  return 'otra'
}

export interface OpcionesConfirmacion { esperaMs?: number; cadaMs?: number; fetcher?: typeof fetch; cliente?: boolean }

export async function confirmacionHumana(p: { categoria: CategoriaConfirmacion; resumen: string; herramienta: string; partes: unknown[] }, op: OpcionesConfirmacion = {}): Promise<{ ok: true } | { ok: false; detalle: string }> {
  if (!(op.cliente ?? esEdicionCliente())) return { ok: true }
  // Contrato v2: el proceso de manos (hijo del CLI) solo tiene el pase de agente, que basta para pedir y consultar.
  const puerto = process.env.MC_SERVER_PORT, token = process.env.ARBRAIN_PASE_AGENTE || process.env.OPENCLAW_GATEWAY_TOKEN
  if (!puerto || !token) return { ok: false, detalle: 'CONFIRMACIÓN HUMANA: no hay conexión con Arbrain para pedir el permiso de la persona. No se ejecutó nada.' }
  const f = op.fetcher ?? fetch
  const base = `http://127.0.0.1:${puerto}`
  const llamar = async (ruta: string, cuerpo?: unknown) => {
    const r = await f(`${base}${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }), signal: AbortSignal.timeout(10_000) })
    return r.json() as Promise<Record<string, unknown>>
  }
  try {
    const accion = { herramienta: p.herramienta, partes: p.partes }
    if ((await llamar('/confirmaciones/consumir', accion)).ok === true) return { ok: true }
    const c = await llamar('/confirmaciones/pedir', { ...accion, categoria: p.categoria, motivo: p.resumen })
    const id = String(c.id ?? '')
    if (!/^cf_[0-9a-f]{12}$/.test(id)) return { ok: false, detalle: 'CONFIRMACIÓN HUMANA: Arbrain no pudo registrar la confirmación. No se ejecutó nada.' }
    const fin = Date.now() + (op.esperaMs ?? (Number(process.env.ARBRAIN_CONFIRMAR_ESPERA_S) || 90) * 1000)
    let estado = String(c.estado ?? 'pendiente')
    while (estado === 'pendiente' && Date.now() < fin) {
      await new Promise(r => setTimeout(r, op.cadaMs ?? 500))
      estado = String((await llamar(`/confirmaciones/${id}`)).estado ?? 'vencida')
    }
    if (estado === 'permitida' && (await llamar('/confirmaciones/consumir', accion)).ok === true) return { ok: true }
    if (estado === 'rechazada') return { ok: false, detalle: `CONFIRMACIÓN HUMANA: la persona RECHAZÓ «${p.resumen}» en Arbrain. No se ejecutó nada; no lo repitas ni busques otra vía.` }
    // A3 (0.2.15): nadie contestó a tiempo. La pendiente pasa a la cola (no vence); si la ruta no existe (daemon viejo), sigue pendiente.
    if (estado === 'pendiente') { try { await llamar('/confirmaciones/encolar', { id }) } catch { /* sin cola: queda pendiente */ } }
    // A3 (0.2.15): sin respuesta a tiempo no vence: queda en la cola de la persona («Mientras no estabas»); su clic de
    // después vale para repetir exactamente la misma acción (misma app, elemento, texto y teclas).
    if (estado === 'pendiente') return { ok: false, detalle: `CONFIRMACIÓN HUMANA: «${p.resumen}» espera el clic de la persona en Arbrain (quedó en su cola, ${id}). No se ejecutó nada. Sigue con lo que no dependa de esto y dile en una línea que la espera; cuando la apruebe, repite exactamente la misma acción (mismo elemento, texto y teclas), aunque hayas vuelto a observar.` }
    return { ok: false, detalle: `CONFIRMACIÓN HUMANA: la confirmación de «${p.resumen}» venció. No se ejecutó nada.` }
  } catch {
    return { ok: false, detalle: 'CONFIRMACIÓN HUMANA: no se pudo hablar con Arbrain para pedir el permiso de la persona. No se ejecutó nada.' }
  }
}
