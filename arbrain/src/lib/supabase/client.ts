import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { esEdicionCliente } from '@/lib/edicion'
import { almacenInerte, clienteLocal } from '@/lib/base-local/consulta'

// Hardcoded to work around Next.js 16 Turbopack env var inlining bug.
// Publishable keys are designed to be public (RLS-protected); safe to embed.
// Mission Control vive en el Studio desde el 27 sep 2026: la URL y la llave vienen del entorno.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function createClient() {
  // Edición cliente (empaquetado, 11 oct 2026): el navegador no habla con ninguna base. Cliente inerte (sin red, sin
  // realtime, lecturas vacías, escrituras con error legible); los datos pasan por las rutas del servidor local.
  if (esEdicionCliente()) return clienteLocal(almacenInerte) as unknown as ReturnType<typeof createBrowserClient> & SupabaseClient
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  )
}
