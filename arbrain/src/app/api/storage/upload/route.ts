import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { TIPOS_DOCUMENTO, extensionDe, nombreSeguro, urlPublicaDeStorage } from '@/features/chat/lib/adjuntos'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
// El cuerpo trae el archivo más el sobre multipart: se corta antes de leerlo, con un mensaje claro.
const MAX_BODY_SIZE = MAX_FILE_SIZE + 512 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }
const BUCKET = 'generated-images'

// Toda respuesta de error lleva `code` (estable, para que el cliente explique la causa) y `error` (legible).
const fallo = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status })

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return fallo(401, 'no_autorizado', 'Unauthorized')
    }

    const declarado = Number(req.headers.get('content-length') ?? 0)
    if (declarado > MAX_BODY_SIZE) {
      return fallo(413, 'demasiado_grande', `La imagen pesa ${(declarado / 1048576).toFixed(1)} MB y el máximo es 10 MB`)
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      // El cuerpo llegó cortado o ilegible (conexión interrumpida, archivo que el sistema borró a mitad del
      // envío). Antes salía como 500 «Upload failed»; es un problema del envío, no del servidor.
      console.warn('[storage/upload] Cuerpo incompleto o ilegible', { contentLength: declarado, contentType: req.headers.get('content-type')?.split(';')[0] })
      return fallo(400, 'cuerpo_incompleto', 'La imagen llegó incompleta al servidor')
    }
    const file = formData.get('file') as File | null

    if (!file) {
      return fallo(400, 'sin_archivo', 'No file provided')
    }

    // Documentos (PDF, Word, Excel, texto…): se reconocen por extensión y se guardan con el MIME de nuestra lista,
    // nunca el que declara el navegador. Conservan su nombre original para que el chat y el modelo lo vean.
    const extDocumento = extensionDe(file.name)
    const esDocumento = extDocumento in TIPOS_DOCUMENTO
    if (!esDocumento && !ALLOWED_TYPES.includes(file.type)) {
      return fallo(400, 'tipo_invalido', 'Invalid file type')
    }

    if (file.size > MAX_FILE_SIZE) {
      return fallo(413, 'demasiado_grande', `${esDocumento ? 'El archivo' : 'La imagen'} pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es 10 MB`)
    }

    const sello = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const fileName = esDocumento ? `${sello}-${nombreSeguro(file.name)}` : `${sello}.${EXTENSION[file.type] ?? 'png'}`
    const contentType = esDocumento ? TIPOS_DOCUMENTO[extDocumento] : file.type

    const supabase = createServiceClient()
    const buffer = Buffer.from(await file.arrayBuffer())

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType, upsert: false })

    if (error) {
      console.error('[storage/upload] Upload failed:', error.message)
      return fallo(500, 'almacenamiento', error.message)
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)

    return NextResponse.json({ url: urlPublicaDeStorage(urlData.publicUrl) })
  } catch (err) {
    console.error('[storage/upload] Unexpected error:', err)
    return fallo(500, 'inesperado', 'Upload failed')
  }
}
