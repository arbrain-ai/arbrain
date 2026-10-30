/**
 * Adjuntos del chat en la edición cliente (v0.2.6, 22 oct 2026; un fundador de la cohorte: al adjuntar una imagen salía
 * «el servidor la rechazó (código 404: No disponible en esta edición)»).
 *
 * En la instalación original el chat sube a Supabase Storage (`/api/storage/upload`) y el daemon descarga la URL
 * pública. La edición del alumno no tiene Supabase: aquí el archivo se guarda en la carpeta de datos de la web
 * (`<ARBRAIN_DATA_DIR>/adjuntos`, `<datos>/web/adjuntos`, 0700) y la URL que viaja en el mensaje es la de esta misma
 * app (`/api/storage/adjunto/<nombre>`), que solo responde con sesión. El daemon no la descarga por red: reconoce la
 * forma y copia el archivo desde esta carpeta a sus uploads (server/src/media.ts › `copiarAdjuntoLocal`), y desde ahí
 * el modelo lo recibe como hoy («Analyze this image: …» o «Read and analyze this file: …»). Leerlo marca la sesión
 * como contenido de afuera (guardia de inyección, `fuenteDeArchivo` en cliente/politica-agentes.ts).
 *
 * Defensas: tope por archivo (10 MB) y por carpeta (1 GB); solo imágenes (PNG, JPG, GIF, WebP), PDF, texto (TXT, MD,
 * CSV, JSON) y los documentos de Office que ya aceptaba el chat, comprobados por sus primeros bytes y no por lo que
 * declara el navegador; nombre saneado y generado por el servidor; lectura solo por nombre exacto (sin barras ni `..`),
 * con realpath dentro de la carpeta y sin enlaces simbólicos; escritura exclusiva (`wx`, 0600).
 */
import { randomBytes } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { join, sep } from 'node:path'
import { TIPOS_DOCUMENTO, extensionDe, nombreSeguro } from '@/features/chat/lib/adjuntos'
import { tipoPorBytes, EXTENSION_DE_TIPO } from '@/features/chat/lib/image-upload'
import { dirDatosWeb } from './rutas-instalacion'

export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024
export const MAX_CARPETA_ADJUNTOS_BYTES = 1024 * 1024 * 1024
export const RUTA_API_ADJUNTO = '/api/storage/adjunto/'

/**
 * Nombre que genera el servidor: `chat-<ms>-<6 hex>.<ext>` (imagen) o `chat-<ms>-<6 hex>-<nombre saneado>.<ext>`
 * (documento). Espejo exacto en server/src/media.ts (`NOMBRE_ADJUNTO_LOCAL`): si cambia aquí, cambia allá.
 */
export const NOMBRE_ADJUNTO_LOCAL = /^chat-\d{10,16}-[0-9a-f]{6}(?:-[A-Za-z0-9_-][A-Za-z0-9._-]{0,89})?\.[a-z0-9]{1,5}$/

const IMAGENES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const TEXTO = new Set(['txt', 'md', 'csv', 'json'])

export class AdjuntoRechazado extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'AdjuntoRechazado' }
}

export const carpetaAdjuntos = (env: Record<string, string | undefined> = process.env) => join(dirDatosWeb(env), 'adjuntos')

export function nombreAdjuntoValido(nombre: string): boolean {
  return NOMBRE_ADJUNTO_LOCAL.test(nombre) && !nombre.includes('..')
}

/** MIME con que se sirve un nombre ya validado (de nuestra lista, nunca el del navegador). */
export function tipoDeAdjunto(nombre: string): string | null {
  const ext = extensionDe(nombre)
  return IMAGENES[ext] ?? TIPOS_DOCUMENTO[ext] ?? null
}

/** ¿Los bytes son de verdad lo que dice la extensión? */
function contenidoCoincide(ext: string, b: Uint8Array): boolean {
  if (ext === 'pdf') return b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === '%PDF-'
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
  if (ext === 'xls') return b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
  if (TEXTO.has(ext)) {
    if (b.includes(0)) return false
    try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true } catch { return false }
  }
  return false
}

function bytesEnCarpeta(dir: string): number {
  let total = 0
  for (const f of readdirSync(dir)) { try { total += statSync(join(dir, f)).size } catch { /* se borró */ } }
  return total
}

function carpetaLista(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { chmodSync(dir, 0o700) } catch { /* Windows */ }
}

/**
 * Valida y guarda un adjunto. Devuelve el nombre con que quedó. Imágenes: por sus primeros bytes (la extensión la
 * pone el servidor). Documentos: por extensión de la lista y bytes que la confirman.
 */
export function guardarAdjuntoLocal(archivo: { nombre: string; bytes: Uint8Array }, dir = carpetaAdjuntos()): string {
  const { nombre, bytes } = archivo
  if (bytes.byteLength === 0) throw new AdjuntoRechazado(400, 'sin_archivo', 'El archivo llegó vacío')
  if (bytes.byteLength > MAX_ADJUNTO_BYTES) throw new AdjuntoRechazado(413, 'demasiado_grande', `El archivo pesa ${(bytes.byteLength / 1048576).toFixed(1)} MB y el máximo es 10 MB`)
  const tipoImagen = tipoPorBytes(bytes)
  const extImagen = tipoImagen ? EXTENSION_DE_TIPO[tipoImagen] : undefined
  const extDoc = extensionDe(nombre)
  let sufijo: string
  if (extImagen && IMAGENES[extImagen]) sufijo = `.${extImagen}`
  else if (extDoc in TIPOS_DOCUMENTO && contenidoCoincide(extDoc, bytes)) sufijo = `-${nombreSeguro(nombre)}`
  else throw new AdjuntoRechazado(400, 'tipo_invalido', 'Invalid file type')
  carpetaLista(dir)
  if (bytesEnCarpeta(dir) + bytes.byteLength > MAX_CARPETA_ADJUNTOS_BYTES) {
    throw new AdjuntoRechazado(507, 'carpeta_llena', 'La carpeta de adjuntos llegó a 1 GB. Borra adjuntos viejos de la carpeta de datos de Arbrain y vuelve a enviar')
  }
  const final = `chat-${Date.now()}-${randomBytes(3).toString('hex')}${sufijo}`
  if (!nombreAdjuntoValido(final)) throw new AdjuntoRechazado(400, 'tipo_invalido', 'Invalid file type')
  writeFileSync(join(dir, final), bytes, { flag: 'wx', mode: 0o600 })
  return final
}

/** Lee un adjunto por su nombre exacto. null = no existe o no es nuestro. */
export function leerAdjuntoLocal(nombre: string, dir = carpetaAdjuntos()): { bytes: Buffer; tipo: string } | null {
  if (!nombreAdjuntoValido(nombre)) return null
  const tipo = tipoDeAdjunto(nombre)
  if (!tipo) return null
  let raiz: string, real: string
  try {
    raiz = realpathSync.native(dir)
    const ruta = join(raiz, nombre)
    if (lstatSync(ruta).isSymbolicLink()) return null
    real = realpathSync.native(ruta)
  } catch { return null }
  if (!real.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)) return null
  const st = statSync(real)
  // Un enlace duro dentro de la carpeta podría apuntar a un archivo de fuera: solo se sirve lo que tiene un solo nombre.
  if (!st.isFile() || st.nlink > 1 || st.size > MAX_ADJUNTO_BYTES) return null
  return { bytes: readFileSync(real), tipo }
}
