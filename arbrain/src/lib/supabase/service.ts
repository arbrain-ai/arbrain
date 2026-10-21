import { createClient } from '@supabase/supabase-js'
import { SERVER_SUPABASE_URL } from './urls'
import { esEdicionCliente } from '@/lib/edicion'
import { clienteLocalServicio } from '@/lib/base-local/servidor'

/**
 * Creates a Supabase client with the service_role key.
 * Bypasses RLS — use ONLY in server-side API routes that authenticate
 * via bearer token (OPENCLAW_GATEWAY_TOKEN), never in user-facing code.
 */
export function createServiceClient() {
  // Edición cliente (empaquetado, 11 oct 2026): la base local de la instalación, nunca el Supabase de Daniel.
  if (esEdicionCliente()) return clienteLocalServicio()
  const url = SERVER_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
