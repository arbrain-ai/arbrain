/**
 * Avisos de Levy en el teléfono del alumno (v0.2.18, 31 oct 2026; un fundador con iPhone: «necesito poder recibir en el
 * iPhone los avisos de Levy»). Informe: docs/builds/avisos-telefono-alumno-2026-10-31/REPORTE.md.
 *
 * El daemon decide QUÉ avisa y con qué palabras; la web de la persona lo entrega (`/api/notifications/send` de SU web,
 * con el token del daemon, a las suscripciones de SU base local). Tres eventos, uno por aviso:
 *   1. Levy espera una decisión (algo entró a la cola de aprobaciones) → abre esa conversación.
 *   2. Una rutina terminó (sola, no la que la persona probó con «Probar») → abre Taller › Rutinas.
 *   3. Una respuesta larga terminó con la app cerrada → lo decide la web en `/api/chat/complete` (sabe si alguien la
 *      está viendo); su texto vive en `src/features/notifications/lib/avisosAlumno.ts`.
 *
 * Sin spam: cada evento suena una vez (su `tag` es su identidad y la web también lo deduplica), una misma rutina suena a
 * lo más una vez por hora, y si falla igual una y otra vez, una vez cada 12 h. Con «Pausar todo» no suena nada de rutinas.
 * Ningún texto lleva literales de comandos ni direcciones: la notificación se ve en la pantalla bloqueada.
 */
import type { Confirmacion } from './confirmaciones.js'

export interface AvisoTelefono { title: string; body: string; url: string; tag: string; kind: 'cola' | 'rutina' }
export type ResultadoAviso = 'enviado' | 'repetido' | 'sin_configurar' | 'fallo'

/** Una línea legible: sin saltos, sin direcciones (`https[:]//`), recortada con «…». */
export function linea(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, ' ').trim()
    .replace(/\b([a-z][a-z0-9+.-]{1,15}):\/\//gi, '$1[:]//').replace(/\bwww\./gi, 'www[.]')
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Conversación de la app en una URL de la propia web (el id solo con caracteres seguros). */
export function urlConversacion(id: string | null | undefined): string {
  return id && /^[A-Za-z0-9:_-]{1,128}$/.test(id) ? `/chat?session=${encodeURIComponent(id)}` : '/chat'
}

export const URL_RUTINAS = '/chat?panel=taller&taller=rutinas'

/** 1. Algo entró a la cola: Levy siguió con lo demás y espera tu decisión. */
export function avisoCola(c: Pick<Confirmacion, 'id' | 'frase' | 'resumen' | 'conversacion'>): AvisoTelefono {
  const que = linea(c.frase || c.resumen || 'Una acción', 140).replace(/\.+$/, '')
  return {
    title: 'Levy espera tu decisión',
    body: `${que}${/[…!?]$/.test(que) ? '' : '.'} Siguió con lo demás; cuando decidas, lo retoma.`,
    url: urlConversacion(c.conversacion),
    tag: `cola-${c.id}`,
    kind: 'cola',
  }
}

/** El nombre de una rutina para una persona: su primera línea, sin el prefijo del agente. */
export function nombreRutina(prompt: string): string {
  const primera = prompt.replace(/^\s*🤖\s*\[[^\]]*\]\s*/u, '').split(/\r?\n/).find((l) => l.trim()) ?? ''
  return linea(primera, 60) || 'Tu rutina'
}

export interface FinRutina { id: string; prompt: string; ok: boolean; texto?: string; error?: string; corrida?: number }

/** 2. Una rutina terminó: bien (con el principio de lo que dejó) o con un problema. */
export function avisoRutina(r: FinRutina): AvisoTelefono {
  const nombre = nombreRutina(r.prompt)
  const base = { url: URL_RUTINAS, tag: `rutina-${r.id}-${r.corrida ?? 0}`, kind: 'rutina' as const }
  if (!r.ok) {
    const error = linea(r.error || 'Algo falló', 120).replace(/^Error:\s*/i, '').replace(/\.+$/, '')
    return { ...base, title: `Tu rutina no terminó: ${nombre}`, body: `${error}${/[…!?]$/.test(error) ? '' : '.'} Ábrela en Taller › Rutinas para ver qué pasó.` }
  }
  const resumen = linea(r.texto ?? '', 140)
  return { ...base, title: `Tu rutina terminó: ${nombre}`, body: resumen || 'Terminó sin dejar texto. Ábrela en Taller › Rutinas.' }
}

// ── Entrega (a la web de la persona) ─────────────────────────────────────────────────────────────────────────────

/** Un mismo `tag` suena una sola vez (la cola no suena dos veces por la misma confirmación). */
const yaAvisados = new Set<string>()
/** Última vez que sonó cada clave de frecuencia (una rutina por hora; un mismo fallo cada 12 h). */
const ultimo = new Map<string, number>()
export const CADA_RUTINA_MS = 60 * 60_000
export const CADA_FALLO_MS = 12 * 60 * 60_000

/** ¿Toca avisar? Pura respecto del reloj (`ahora`); registra la vez si sí. */
export function tocaAvisar(clave: string, ventanaMs: number, ahora = Date.now()): boolean {
  const previo = ultimo.get(clave)
  if (previo !== undefined && ahora - previo < ventanaMs) return false
  ultimo.set(clave, ahora)
  if (ultimo.size > 500) for (const [k, t] of ultimo) if (ahora - t > CADA_FALLO_MS) ultimo.delete(k)
  return true
}

export interface DestinoAvisos { url?: string; token?: string; fetch?: typeof fetch }

/** Manda un aviso a la web local; nunca lanza. Sin web o sin token: `sin_configurar` (la app lo muestra igual). */
export async function mandarAviso(a: AvisoTelefono, op: DestinoAvisos): Promise<ResultadoAviso> {
  if (yaAvisados.has(a.tag)) return 'repetido'
  if (yaAvisados.size > 1000) yaAvisados.clear()
  yaAvisados.add(a.tag)
  if (!op.token || !op.url) return 'sin_configurar'
  try {
    const r = await (op.fetch ?? fetch)(`${op.url.replace(/\/$/, '')}/api/notifications/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${op.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(a),
    })
    await r.body?.cancel().catch(() => undefined)
    return r.ok ? 'enviado' : 'fallo'
  } catch { return 'fallo' }
}

/** Destino que fija server.ts en la edición cliente (su web y su token). Sin él, las rutinas no avisan. */
let destino: DestinoAvisos | null = null
let pausadoAhora: () => boolean = () => false
export function registrarDestinoAvisos(d: DestinoAvisos | null, opts: { pausado?: () => boolean } = {}): void {
  destino = d
  if (opts.pausado) pausadoAhora = opts.pausado
}

/**
 * Lo llama el scheduler al terminar una rutina del alumno. No avisa: corridas manuales («Probar», la persona está
 * mirando), con «Pausar todo» puesto, ni más de una vez por hora por rutina (un mismo fallo, una vez cada 12 h).
 */
export async function avisarFinRutina(r: FinRutina & { manual?: boolean }, ahora = Date.now()): Promise<ResultadoAviso | 'omitido'> {
  if (!destino || r.manual || pausadoAhora()) return 'omitido'
  const clave = r.ok ? `rutina:${r.id}` : `fallo:${r.id}:${linea(r.error ?? '', 80)}`
  if (!tocaAvisar(clave, r.ok ? CADA_RUTINA_MS : CADA_FALLO_MS, ahora)) return 'omitido'
  return mandarAviso(avisoRutina({ ...r, corrida: r.corrida ?? ahora }), destino)
}

export function _reiniciarParaPruebas(): void { yaAvisados.clear(); ultimo.clear(); destino = null; pausadoAhora = () => false }
