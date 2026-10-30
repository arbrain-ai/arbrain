/**
 * Subida de imágenes del chat (2 oct 2026). Sin dependencias del navegador para poder probarse en Node:
 * `fetch`, la espera y el reloj entran por parámetro.
 *
 * Contrato: ninguna falla dice «no se pudo» a secas. Cada una nombra la imagen, la causa y lo que Daniel
 * puede hacer, y las que son del camino (red, servidor reiniciando) se reintentan una vez solas.
 */

/** Lado mayor al que se reduce una captura antes de subirla (dos monitores pueden pasar de 8960 px). */
export const MAX_LADO_IMAGEN = 4096
/** Límite del servidor (`/api/storage/upload`). */
export const LIMITE_SUBIDA_BYTES = 10 * 1024 * 1024
/** A cuánto se comprime: deja margen bajo el límite del servidor para el sobre multipart. */
export const PRESUPUESTO_BYTES = 8 * 1024 * 1024
/** Una imagen que ya cabe en lado y peso y pesa menos que esto se sube tal cual, sin recomprimir. */
export const UMBRAL_SIN_TOCAR_BYTES = 1_500_000
/** Lo máximo que se acepta leer del disco (se decodifica en memoria, en RGBA pesa ~4 bytes por píxel). */
export const MAX_ENTRADA_BYTES = 120 * 1024 * 1024
export const TIPOS_SUBIBLES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export type CodigoErrorImagen = 'ilegible' | 'formato' | 'demasiado-grande' | 'compresion'

/** Error de preparación con mensaje listo para mostrar. */
export class ErrorImagen extends Error {
  codigo: CodigoErrorImagen
  constructor(codigo: CodigoErrorImagen, message: string) { super(message); this.name = 'ErrorImagen'; this.codigo = codigo }
}

export function formatoBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '? MB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** Reduce proporcionalmente para que el lado mayor no pase de `max`; nunca agranda. */
export function dimensionesDestino(ancho: number, alto: number, max: number = MAX_LADO_IMAGEN, escala = 1) {
  const lado = Math.max(ancho, alto)
  const factor = Math.min(1, max / lado) * escala
  return { ancho: Math.max(1, Math.round(ancho * factor)), alto: Math.max(1, Math.round(alto * factor)), reducida: factor < 1 }
}

/**
 * Perfil de subida (11 oct 2026, Daniel: «hablando contigo desde el teléfono consume muchos datos»). En el escritorio
 * todo sigue igual. En el teléfono una captura (1290×2796, ~1 MB en PNG) subía tal cual; la API de Claude la reduce a
 * ~1568 px de lado mayor antes de que Levy la vea, así que 2560 px en JPEG conserva todo lo legible (y sigue nítida
 * en la pantalla del teléfono) con una fracción de los bytes. Los GIF no se tocan: recomprimirlos los congela.
 */
export type PerfilImagen = { maxLado: number; umbralSinTocar: number; calidades: number[] }
export const PERFIL_NORMAL: PerfilImagen = { maxLado: MAX_LADO_IMAGEN, umbralSinTocar: UMBRAL_SIN_TOCAR_BYTES, calidades: [0.92, 0.84, 0.74] }
export const PERFIL_DATOS_MOVILES: PerfilImagen = { maxLado: 2560, umbralSinTocar: 350_000, calidades: [0.82, 0.74, 0.66] }

/** ¿Hay que recomprimir, o la original ya cumple? */
export function necesitaRecompresion(i: { tipo: string; bytes: number; ancho: number; alto: number }, perfil: PerfilImagen = PERFIL_NORMAL): boolean {
  if (!(TIPOS_SUBIBLES as readonly string[]).includes(i.tipo)) return true
  if (Math.max(i.ancho, i.alto) > perfil.maxLado) return true
  if (i.bytes > PRESUPUESTO_BYTES) return true
  if (i.tipo === 'image/gif') return i.bytes > UMBRAL_SIN_TOCAR_BYTES
  return i.bytes > perfil.umbralSinTocar
}

/** Tipo real por los primeros bytes: pegar desde algunas fuentes deja `type` vacío o mentiroso. */
export function tipoPorBytes(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const marca = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(marca)) return 'image/heic'
  }
  return null
}

export const EXTENSION_DE_TIPO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }

/** El nombre conserva su base y toma la extensión del formato en que realmente va. */
export function nombreConTipo(nombre: string, tipo: string): string {
  const ext = EXTENSION_DE_TIPO[tipo]
  const base = (nombre || 'imagen').replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'imagen'
  return ext ? `${base}.${ext}` : nombre || 'imagen'
}

// ── Subida con diagnóstico y un reintento ────────────────────────────────────────────────────────────────

export type FalloSubida = {
  nombre: string
  bytes: number
  /** Causa + qué hacer, en una frase lista para mostrar. */
  motivo: string
  reintentable: boolean
  estado?: number
  codigo?: string
}

export type ResultadoSubida = { ok: true; url: string; intentos: number } | { ok: false; fallo: FalloSubida; intentos: number }

type OpcionesSubida = {
  fetchFn?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  /** Intentos totales: 2 = el primero y un reintento automático. */
  intentos?: number
  esperaReintentoMs?: number
  timeoutMs?: number
  endpoint?: string
}

const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Traduce lo que respondió (o no respondió) el camino a una causa que Daniel pueda actuar. */
export function describirFalloSubida(i: { nombre: string; bytes: number; estado?: number; codigo?: string; mensajeServidor?: string; red?: 'sin-conexion' | 'timeout' }): FalloSubida {
  const base = { nombre: i.nombre, bytes: i.bytes, estado: i.estado, codigo: i.codigo }
  if (i.red === 'timeout') return { ...base, reintentable: true, motivo: 'la subida tardó más de lo permitido con la conexión actual. Espera a tener mejor señal y vuelve a enviar.' }
  if (i.red === 'sin-conexion') return { ...base, reintentable: true, motivo: 'no hubo conexión con el servidor (red caída o el servidor no responde). Revisa tu conexión y vuelve a enviar.' }
  const e = i.estado ?? 0
  if (e === 401 || e === 403) return { ...base, reintentable: false, motivo: 'tu sesión expiró. Recarga la app (Cmd+R en escritorio), inicia sesión de nuevo y vuelve a enviar.' }
  if (e === 413 || i.codigo === 'demasiado_grande') return { ...base, reintentable: false, motivo: `pesa más de lo que acepta el servidor (hasta ${formatoBytes(LIMITE_SUBIDA_BYTES)}). Quítalo y adjunta una versión más ligera (una captura de menos área, o solo las páginas que necesitas).` }
  if (i.codigo === 'tipo_invalido') return { ...base, reintentable: false, motivo: 'el servidor no admite ese formato; acepta imágenes (PNG, JPG, WebP, GIF) y documentos (PDF, Word, Excel, PowerPoint, CSV, texto). Conviértelo y vuelve a adjuntarlo.' }
  // Un 400 sin `code` no lo dio nuestra ruta (siempre lo manda): es el servidor HTTP rechazando un envío que se cortó a medias.
  if (i.codigo === 'cuerpo_incompleto' || (e === 400 && !i.codigo)) return { ...base, reintentable: true, motivo: 'se cortó en el camino al servidor (se interrumpió la conexión o el archivo dejó de estar disponible). Vuelve a pegar o adjuntar el archivo.' }
  if (e === 502 || e === 503 || e === 504) return { ...base, reintentable: true, motivo: `el servidor no respondió (código ${e}); suele ser un reinicio o un deploy de unos segundos. Espera un minuto y vuelve a enviar.` }
  if (e >= 500) return { ...base, reintentable: true, motivo: `el servidor falló al guardarlo (código ${e}${i.mensajeServidor ? `: ${i.mensajeServidor}` : ''}). Vuelve a enviar; si se repite, avísale a Levy con este mensaje.` }
  return { ...base, reintentable: false, motivo: `el servidor la rechazó (código ${e || '?'}${i.mensajeServidor ? `: ${i.mensajeServidor}` : ''}). Quítalo y vuelve a adjuntarlo.` }
}

async function leerRespuesta(res: Response): Promise<{ url?: string; error?: string; code?: string }> {
  const texto = await res.text().catch(() => '')
  try { return JSON.parse(texto) } catch { return { error: texto.slice(0, 160) } }
}

/** Sube una imagen. Reintenta solo las fallas del camino (red, 5xx, cuerpo cortado), no las que el reintento no arregla. */
export async function subirImagen(file: File, opciones: OpcionesSubida = {}): Promise<ResultadoSubida> {
  const { fetchFn = fetch, esperar = dormir, intentos = 2, esperaReintentoMs = 800, timeoutMs = 120_000, endpoint = '/api/storage/upload' } = opciones
  let ultimo: FalloSubida | null = null
  for (let n = 1; n <= intentos; n++) {
    const control = new AbortController()
    const timer = setTimeout(() => control.abort(), timeoutMs)
    try {
      const form = new FormData()
      form.append('file', file, file.name)
      const res = await fetchFn(endpoint, { method: 'POST', body: form, signal: control.signal })
      const cuerpo = await leerRespuesta(res)
      if (res.ok && typeof cuerpo.url === 'string' && cuerpo.url) return { ok: true, url: cuerpo.url, intentos: n }
      ultimo = describirFalloSubida({ nombre: file.name, bytes: file.size, estado: res.ok ? 502 : res.status, codigo: cuerpo.code, mensajeServidor: res.ok ? 'respuesta sin URL' : cuerpo.error })
    } catch (e) {
      const abortada = control.signal.aborted || (e instanceof Error && e.name === 'AbortError')
      ultimo = describirFalloSubida({ nombre: file.name, bytes: file.size, red: abortada ? 'timeout' : 'sin-conexion' })
    } finally { clearTimeout(timer) }
    if (!ultimo.reintentable || n === intentos) return { ok: false, fallo: ultimo, intentos: n }
    await esperar(esperaReintentoMs)
  }
  return { ok: false, fallo: ultimo!, intentos }
}

/** Mensaje único para el aviso del chat cuando alguna imagen no subió. */
export function mensajeFallosSubida(fallos: FalloSubida[], total: number, subidas: number): string {
  const nombre = (f: FalloSubida) => `«${f.nombre}» (${formatoBytes(f.bytes)})`
  if (fallos.length === 1 && total === 1) return `No se pudo subir ${nombre(fallos[0])}: ${fallos[0].motivo} Tu mensaje volvió a la caja.`
  const cabeza = subidas === 0 ? `No se subió ninguno de los ${total} archivos` : `Subieron ${subidas} de ${total} archivos y no se mandó nada para no dejarte un mensaje incompleto`
  const motivos = new Set(fallos.map(f => f.motivo))
  if (motivos.size === 1) return `${cabeza}: ${fallos.map(nombre).join(', ')}. Causa: ${fallos[0].motivo} Tu mensaje volvió a la caja.`
  return `${cabeza}. ${fallos.map(f => `${nombre(f)}: ${f.motivo}`).join(' ')} Tu mensaje volvió a la caja.`
}
