import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { homedir } from 'os'
import { esEdicionCliente } from '@/lib/edicion'

const SERVER_ENV_KEYS = [
  'SF_SUPABASE_URL',
  'SF_SUPABASE_KEY',
  'SF_SUPABASE_SECRET_KEY',
  'SF_SUPABASE_PAT',
  'SUPABASE_ACCESS_TOKEN',
] as const

function candidateEnvPaths() {
  const paths = new Set<string>()
  let cursor = process.cwd()

  for (let i = 0; i < 8; i += 1) {
    paths.add(join(cursor, '.env.local'))
    paths.add(join(cursor, '.env'))
    paths.add(join(cursor, 'arbrain', 'server', '.env'))
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  paths.add(join(homedir(), 'Developer', 'business-os', '.env.local'))
  paths.add(join(homedir(), 'Developer', 'business-os', 'arbrain', 'server', '.env'))
  paths.add(resolve(process.cwd(), '..', '.env.local'))

  return [...paths]
}

function loadRootServerEnv() {
  // En Vercel (y en cualquier entorno con las vars ya seteadas) NO hay que
  // escanear el filesystem: antes esto hacía ~30 existsSync/readFileSync
  // síncronos POR REQUEST aunque process.env ya tuviera todo. Solo se omite
  // el escaneo si TODAS las llaves relevantes están presentes (URL + KEY + PAT),
  // para no romper el caso local donde el PAT vive en arbrain/server/.env.
  if (
    process.env.SF_SUPABASE_URL &&
    (process.env.SF_SUPABASE_KEY || process.env.SF_SUPABASE_SECRET_KEY) &&
    (process.env.SF_SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN)
  ) {
    return
  }
  for (const envPath of candidateEnvPaths()) {
    if (!existsSync(envPath)) continue

    const env = readFileSync(envPath, 'utf8')
    for (const line of env.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const equalIndex = trimmed.indexOf('=')
      if (equalIndex === -1) continue

      const key = trimmed.slice(0, equalIndex)
      if (!SERVER_ENV_KEYS.includes(key as (typeof SERVER_ENV_KEYS)[number])) continue
      const rawValue = trimmed.slice(equalIndex + 1).trim()
      const value = rawValue.replace(/^['"]|['"]$/g, '')

      if (!process.env[key]) process.env[key] = value
      if (key === 'SUPABASE_ACCESS_TOKEN' && !process.env.SF_SUPABASE_PAT) {
        process.env.SF_SUPABASE_PAT = value
      }
    }
  }
}

/**
 * Creates a Supabase client for the SaaS Factory project.
 * Uses SF_SUPABASE_URL + SF_SUPABASE_KEY (service role).
 * Server-side only — never expose to the browser.
 */
export function createSFClient() {
  // Edición cliente: la base de SaaS Factory es del negocio de Daniel; nunca se busca ni se lee su `.env`.
  if (esEdicionCliente()) throw new Error('No disponible en esta edición.')
  loadRootServerEnv()

  const url = process.env.SF_SUPABASE_URL
  const key = process.env.SF_SUPABASE_KEY ?? process.env.SF_SUPABASE_SECRET_KEY

  if (!url || !key) {
    throw new Error('Missing SF_SUPABASE_URL or SF_SUPABASE_KEY')
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
