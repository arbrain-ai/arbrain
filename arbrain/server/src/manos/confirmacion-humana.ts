/**
 * I8 en las manos (empaquetado, 11 oct 2026; contrato §6). El servidor MCP de manos corre en otro proceso que el daemon:
 * cuando el freno deja pasar algo irreversible con la cita real de la persona, en la edición cliente además hace falta su
 * clic en la app. Se pide al daemon por HTTP (`/confirmaciones/*`, Bearer del entorno) y se espera la decisión.
 * El modelo puede crear la pendiente; aprobarla exige el secreto de la app, que este proceso no tiene.
 * Contrato v3 (red team C2): se manda la acción estructurada (`herramienta` + `partes`); el daemon calcula el literal que
 * ve la persona y la huella. El `resumen` de aquí solo viaja como motivo declarado.
 * Instalación de Daniel: el clic de I8 no aplica (devuelve ok sin preguntar), pero desde la autonomía v2 (3 nov 2026) lo
 * irreversible que el freno detiene sin cita pide su TOQUE en la bandeja de decisiones (`pedirToque`): el Sí reemplaza
 * a la frase exacta. La misma vía, con `cliente: true`, el token del daemon de su `.env` y la sesión de Claude para que
 * su respuesta vuelva a la conversación.
 */
import { esEdicionCliente } from '../edicion.js'
import type { CategoriaConfirmacion } from '../cliente/confirmaciones.js'
import { claseDeCategoria } from '../autonomia/clase.js'
import { modoDe } from '../autonomia/politica.js'

/** Categoría del freno (enviar, boton_sin_texto, compra, borrar…) → categoría del contrato. */
export function categoriaDe(categoriaFreno: string | undefined, motivo = ''): CategoriaConfirmacion {
  const t = `${categoriaFreno ?? ''} ${motivo}`.toLowerCase()
  if (/pag|compr|tarjeta|cobr|checkout|transfer/.test(t)) return 'pagar'
  // Escribir un dato (correo, teléfono, contraseña) en un campo no es enviar: la tarjeta decía «Levy quiere enviar» al
  // llenar el correo de un formulario y empujaba a rechazar lo que la persona sí pidió (QA del modo servidor, 1 nov 2026).
  // El resumen de la tarjeta ya dice qué dato y dónde; el envío del formulario es otra acción con su propia tarjeta.
  if (categoriaFreno === 'transmitir_datos') return 'otra'
  if (/borr|elimin|delete|papelera|vaciar/.test(t)) return 'borrar'
  if (/public|post|tuit|tweet|compart/.test(t)) return 'publicar'
  if (/envi|send|chat|correo|mensaje|enter|pegar/.test(t)) return 'enviar'
  return 'otra'
}

export interface OpcionesConfirmacion { esperaMs?: number; cadaMs?: number; fetcher?: typeof fetch; cliente?: boolean }

/** Daemon al que se le piden las tarjetas: el del entorno; en la instalación original, el de su `.env` si no hay. */
async function daemon(): Promise<{ puerto?: string; token?: string }> {
  let puerto = process.env.MC_SERVER_PORT, token = process.env.ARBRAIN_PASE_AGENTE || process.env.OPENCLAW_GATEWAY_TOKEN
  if ((!puerto || !token) && !esEdicionCliente() && process.env.ARBRAIN_TOQUE_SIN_ENV !== '1') {
    try { const { readEnvFile } = await import('../env.js'); const e = readEnvFile(['MC_SERVER_PORT', 'OPENCLAW_GATEWAY_TOKEN']); puerto ||= e.MC_SERVER_PORT || '3099'; token ||= e.OPENCLAW_GATEWAY_TOKEN } catch { /* sin .env */ }
  }
  return { puerto, token }
}

export async function confirmacionHumana(p: { categoria: CategoriaConfirmacion; resumen: string; herramienta: string; partes: unknown[]; titulo?: string; recomendacion?: string }, op: OpcionesConfirmacion = {}): Promise<{ ok: true } | { ok: false; detalle: string }> {
  if (!(op.cliente ?? esEdicionCliente())) return { ok: true }
  // Contrato v2: el proceso de manos (hijo del CLI) solo tiene el pase de agente, que basta para pedir y consultar.
  const { puerto, token } = await daemon()
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
    // Bandeja (instalación original): título y recomendación del freno, y la sesión de Claude para volver a su conversación.
    const extra = esEdicionCliente() ? {} : { ...(p.titulo ? { titulo: p.titulo } : {}), ...(p.recomendacion ? { recomendacion: p.recomendacion } : {}), ...(process.env.CLAUDE_CODE_SESSION_ID ? { sesion: process.env.CLAUDE_CODE_SESSION_ID } : {}) }
    const c = await llamar('/confirmaciones/pedir', { ...accion, categoria: p.categoria, motivo: p.resumen, ...extra })
    const id = String(c.id ?? '')
    if (!/^cf_[0-9a-f]{12}$/.test(id)) return { ok: false, detalle: 'CONFIRMACIÓN HUMANA: Arbrain no pudo registrar la confirmación. No se ejecutó nada.' }
    const fin = Date.now() + (op.esperaMs ?? (Number(process.env.ARBRAIN_CONFIRMAR_ESPERA_S) || 90) * 1000)
    let estado = String(c.estado ?? 'pendiente')
    while (estado === 'pendiente' && Date.now() < fin) {
      await new Promise(r => setTimeout(r, op.cadaMs ?? 500))
      estado = String((await llamar(`/confirmaciones/${id}`)).estado ?? 'vencida')
    }
    if (estado === 'permitida' && (await llamar('/confirmaciones/consumir', accion)).ok === true) return { ok: true }
    if (estado === 'rechazada') {
      const r = await llamar(`/decisiones/${id}`).catch(() => ({} as Record<string, unknown>))
      if (r.respuesta === 'otro' && typeof r.comentario === 'string') return { ok: false, detalle: `CONFIRMACIÓN HUMANA: en la bandeja la persona eligió OTRO en lugar de «${p.resumen}»: «${r.comentario}». No se ejecutó; haz lo que pidió.` }
      return { ok: false, detalle: `CONFIRMACIÓN HUMANA: la persona RECHAZÓ «${p.resumen}» en Arbrain. No se ejecutó nada; no lo repitas ni busques otra vía.` }
    }
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

// ---------- Autonomía v2: el toque en vez de la cita (instalación original) ----------

/** Categorías del freno que pasan a una tarjeta en vez de pedir la frase exacta. Las demás (ventanas y pestañas de la
 *  persona, su ratón, observar primero, iframes, contraseñas, avisos de seguridad) siguen como estaban. */
const TARJETEABLES = new Set(['enviar', 'boton_sin_texto', 'confirmar_peligro', 'borrar', 'pagar', 'publicar', 'transmitir_datos', 'salir', 'descartar', 'url_con_efecto'])
export const pideToque = (categoria: string | undefined): boolean => !esEdicionCliente() && !!categoria && TARJETEABLES.has(categoria)

/**
 * Contexto del encargo en curso (un proceso de manos sirve a una sola sesión de Claude): las palabras de la persona
 * para la recomendación de la tarjeta y las decisiones de la bandeja que ella ya aprobó para este encargo.
 */
let contexto: { pedido?: string; decisiones: string[] } = { decisiones: [] }
export function fijarContextoToque(c: { pedido?: string; decisiones?: string[] } | null): void {
  contexto = c ? { pedido: c.pedido?.replace(/\s+/g, ' ').trim().slice(0, 200), decisiones: (c.decisiones ?? []).filter(d => /^cf_[0-9a-f]{12}$/.test(d)).slice(0, 5) } : { decisiones: [] }
}
export const pedidoEnCurso = () => contexto.pedido

/** `confirmacion: "bandeja:cf_…"`: el Sí de la persona a una decisión de la bandeja, en lugar de su cita. */
export const decisionDeConfirmacion = (c: unknown): string | null => typeof c === 'string' && /^bandeja:cf_[0-9a-f]{12}$/.test(c.trim()) ? c.trim().slice(8) : null

/** `sinBandeja`: el daemon no tiene la bandeja (versión anterior o caído): quien llama pide la cita como antes. */
export type Toque = { ok: true; como: 'decision' | 'tarjeta'; id?: string } | { ok: false; detalle: string; sinBandeja?: boolean }

/**
 * Lo irreversible sin cita, en la instalación original: primero, ¿ya hay un Sí de la bandeja que lo cubra (la decisión
 * que Levy subió y la persona aprobó)? Si no, una tarjeta nueva con la recomendación; se espera el toque un rato y, si
 * no llega, queda en la bandeja. Sin toque no sale nada. La política puede decir «nunca» para una clase: entonces ni
 * tarjeta.
 */
export async function pedirToque(p: { categoriaFreno: string; motivo: string; herramienta: string; partes: unknown[]; titulo: string; confirmacion?: string; recomendacion?: string }, op: OpcionesConfirmacion = {}): Promise<Toque> {
  const clase = claseDeCategoria(p.categoriaFreno)
  if (clase && modoDe(clase) === 'nunca') return { ok: false, detalle: `FRENO (${p.categoriaFreno}): tu política de autonomía dice que esto (${clase}) no lo hago; lo haces tú. No se ejecutó nada.` }
  const categoria = categoriaDe(p.categoriaFreno, p.motivo)
  const ids = [decisionDeConfirmacion(p.confirmacion), ...contexto.decisiones].filter((x): x is string => !!x)
  if (ids.length) {
    const { puerto, token } = await daemon()
    for (const id of ids) {
      try {
        const r = await (op.fetcher ?? fetch)(`http://127.0.0.1:${puerto}/decisiones/usar`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, categoria }), signal: AbortSignal.timeout(5_000) })
        if ((await r.json() as { ok?: boolean }).ok === true) return { ok: true, como: 'decision', id }
      } catch { /* sigue con la tarjeta */ }
    }
  }
  const recomendacion = p.recomendacion?.trim() || (contexto.pedido ? `Sí: es parte de lo que pediste («${contexto.pedido}»).` : undefined)
  const h = await confirmacionHumana({ categoria, resumen: p.motivo.slice(0, 280), herramienta: p.herramienta, partes: p.partes, titulo: p.titulo.slice(0, 160), ...(recomendacion ? { recomendacion } : {}) }, { ...op, cliente: true })
  if (h.ok) return { ok: true, como: 'tarjeta' }
  return /no pudo registrar|no hay conexión|no se pudo hablar/.test(h.detalle) ? { ...h, sinBandeja: true } : h
}
