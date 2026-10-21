/**
 * «Ábrelo en mi teléfono» (14 oct 2026, Daniel). `mostrar {…, telefono:true}` fija la vista en el panel (que desde hoy es UNO
 * para todos sus aparatos: panel-compartido.ts) y le manda un push a sus iPhone. Al tocarlo, la app abre
 * `/telefono?abrir=<vista>`: el panel a pantalla completa con esa pestaña al frente, aunque el escritorio esté dormido.
 *
 * El enlace lleva la INVOCACIÓN (vista + parámetros, como el archivero), nunca el contenido: se lee de su fuente con la sesión
 * de Daniel. Nada queda público.
 */
import { DUENO, instalacionOriginal } from '../dueno.js'
import { limpiarVista, type VistaGuardada } from './archivero.js'

/** La invocación en base64url (la decodifica arbrain/src/features/cabina/panel/artefacto-enlace.ts). */
export function codificarVista(v: VistaGuardada): string {
  return Buffer.from(JSON.stringify(v), 'utf8').toString('base64url')
}

/** La ruta relativa que abre esa vista en el teléfono (el service worker la resuelve contra el origen de la app). */
export function rutaTelefono(raw: Record<string, unknown>): string {
  const { fijar: _f, guardar: _g, ...v } = limpiarVista(raw) as VistaGuardada & { fijar?: unknown; guardar?: unknown }
  return `/telefono?abrir=${codificarVista(v as VistaGuardada)}`
}

const NOMBRE: Record<string, string> = { calendario: 'Calendario', objetivos: 'Objetivos', lienzo: 'Lienzo', documento: 'Documento', negocio: 'Tu negocio', finanzas: 'Finanzas', centro: 'Finanzas', salud: 'Salud', masterclass: 'Masterclass', cohorte: 'Cohorte', reporte: 'Lo que llegó', diario: 'Reporte del día', contenido: 'Contenido', pizarron: 'Pizarrón', equipo: 'Equipo', trabajos: 'Taller', explorador: 'Archivos' }

/** El nombre que ve Daniel en el aviso: el título que puso Levy o el de la vista (un documento, su archivo). */
export function nombreVista(raw: Record<string, unknown>): string {
  if (typeof raw.titulo === 'string' && raw.titulo.trim()) return raw.titulo.trim().slice(0, 90)
  if (raw.vista === 'documento' && typeof raw.ruta === 'string') return raw.ruta.split('/').filter(Boolean).pop() ?? 'Documento'
  return NOMBRE[String(raw.vista)] ?? String(raw.vista)
}

type Enviar = (url: string, init: RequestInit) => Promise<Response>

/** Manda el push a los iPhone suscritos de Daniel por la ruta única de avisos de Arbrain. Nunca lanza. */
export async function avisarAlTelefono(raw: Record<string, unknown>, enviar: Enviar = fetch): Promise<{ ok: boolean; texto: string; url: string }> {
  const url = rutaTelefono(raw)
  try {
    const { readEnvFile } = await import('../env.js')
    const env = readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_URL'])
    const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? env.OPENCLAW_GATEWAY_TOKEN, mc = process.env.MC_URL ?? env.MC_URL ?? 'http://127.0.0.1:3300'
    if (!token) return { ok: false, url, texto: 'no mandé el push: falta OPENCLAW_GATEWAY_TOKEN en este servidor' }
    const usuario = instalacionOriginal().perfil_id
    const nombre = nombreVista(raw)
    const enfoque = typeof raw.enfoque === 'string' && raw.enfoque.trim() ? raw.enfoque.trim() : 'Toca para verlo en tu panel.'
    const r = await enviar(`${mc}/api/notifications/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ title: `📱 ${nombre}`.slice(0, 120), body: enfoque.slice(0, 300), url, tag: `telefono-${Date.now().toString(36)}`, source: 'cabina:telefono', kind: 'agente', ...(usuario ? { userId: usuario } : {}) }),
    })
    const body = await r.json().catch(() => ({})) as { sent?: number; error?: string; reason?: string }
    if (!r.ok || body.error) return { ok: false, url, texto: `el push no salió (${body.error ?? r.status})` }
    if (!body.sent) return { ok: false, url, texto: `el aviso quedó en la campana pero ningún iPhone de ${DUENO} está suscrito (${body.reason ?? 'sin suscripciones'})` }
    return { ok: true, url, texto: `push enviado a ${body.sent} dispositivo(s) de ${DUENO}` }
  } catch (e) {
    return { ok: false, url, texto: `el push no salió (${e instanceof Error ? e.message : 'error'})` }
  }
}
