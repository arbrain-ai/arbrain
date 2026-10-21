import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { esEdicionCliente } from '@/lib/edicion'
import { msjMotorCaido } from '@/lib/infra-errores'

// SSOT de la URL del daemon ClaudeClaw.
//
// El daemon vive en el Mac Studio (127.0.0.1:3099 en ESE equipo; servidor único desde
// el 24 sep 2026) y se expone por un túnel rápido de Cloudflare (ngrok de respaldo)
// cuya URL cambia en cada reinicio. `tunnel-sync` (LaunchAgent cada 600s) mantiene
// fresca esa URL en `app_config.claudeclaw_tunnel_url` y en el env de Vercel;
// `primary-url-sync` escribe `claudeclaw_primary_url` y el Mini, en rol chat,
// `claudeclaw_fallback_url`.
//
// ─── ORDEN DE RESOLUCION (INVERTIDO el 2 sep 2026 — leer el incidente) ────────
//  1. Supabase `app_config.claudeclaw_tunnel_url`  ← LA VERDAD VIVA
//  2. `process.env.CLAUDECLAW_URL` si es remota    ← fallback horneado
//  3. localhost:3099                                ← dev / daemon en la misma maquina
//
// ⚠️ INCIDENTE 2 SEP 2026 — por que el env YA NO gana.
// Hasta hoy el orden era al reves: `if (isRemoteEnv(env)) return env` cortaba
// antes de mirar Supabase, "porque en Vercel el env apunta al tunel". El problema
// es que en Vercel un env NUEVO solo entra en vigor con un REDEPLOY, y el 30 ago
// se instalo el Ignored Build Step (`git diff HEAD^ HEAD -- :/arbrain`) para dejar
// de pagar builds inutiles. El redeploy que dispara tunnel-sync es un commit VACIO:
// no toca `arbrain/` ⇒ el ignore step lo SALTA (deployment CANCELED) ⇒ produccion
// se quedo sirviendo el build del 27 ago con la URL VIEJA horneada, apuntando a un
// tunel MUERTO. Sintoma medido en el PWA: "Error desconocido" al enviar y
// "No se pudieron cargar los modelos" (ngrok devuelve HTML 404, `res.json()` truena).
//
// Dos arreglos que se contradecian en silencio. La leccion es la de siempre en esta
// casa: **un valor que rota no se hornea, se resuelve.** Leyendo Supabase primero,
// la app se auto-cura sola en <=60s cada vez que ngrok cambie de URL, SIN depender
// de que un build ocurra. El env queda de red de seguridad, no de fuente.
//
// Memoria: `.claude/memory/project/tunnel-url-se-resuelve-no-se-hornea-2026-09-02.md`

// Mission Control vive en el Studio desde el 27 sep 2026: la URL y la llave vienen del entorno.
const SUPABASE_URL = process.env.SUPABASE_URL_INTERNA || process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const CLAUDECLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? ''

const TTL_MS = 60_000
// Timeout corto: si Supabase tarda, NO se cuelga el primer token del chat —
// se cae al env y seguimos. Un fallback lento es peor que un fallback.
const LOOKUP_TIMEOUT_MS = 3_000

let cache: { url: string; at: number } | null = null

function isRemoteEnv(v: string | undefined): v is string {
  return !!v && !v.includes('localhost') && !v.includes('127.0.0.1')
}

function remoteFallbackUrl(): string | null {
  const env = process.env.CLAUDECLAW_URL
  return isRemoteEnv(env) ? env : null
}

/** Fallback horneado: el env de Vercel/`.env.local`, o localhost en dev. */
function fallbackUrl(): string {
  const env = process.env.CLAUDECLAW_URL
  if (isRemoteEnv(env)) return env
  return env || 'http://localhost:3099'
}

// ─── 24 sep 2026: el Studio es el servidor (chat + crons) y escribe primary_url y
// tunnel_url; el Mini corre rol 'chat' y escribe `claudeclaw_fallback_url`. Lo de abajo
// es la historia del reparto anterior; el orden de sondeo sigue valiendo.
// ─── MacBook primero, Mini de respaldo (22 sep 2026) ─────────────────────────
// Daniel: «el servidor al que apuntamos en Arbrain sea esta laptop; solo si estuviera
// apagado debería caer al Mac Mini». La laptop corre el daemon en rol 'chat' (sin
// crons); el Mini sigue siendo el único dueño del scheduler.
//   Chat  → getClaudeclawUrl():  localhost (desktop en la laptop) → MacBook Funnel
//           (`app_config.claudeclaw_primary_url`) → Mini (`claudeclaw_tunnel_url`) → env.
//   Crons → getSchedulerUrl():   siempre el Mini. La DB de la laptop tiene los jobs
//           copiados pero NO los corre: leerla ahí sería un sensor ciego.
// Cada candidato primario se sondea con GET /health (token, 1.5 s). El Mini no se
// sondea: es el último recurso y, si también cae, el error llega legible río arriba.
const PROBE_TIMEOUT_MS = 1_500
const PROBE_TTL_MS = 20_000
let chatCache: { url: string; at: number } | null = null

async function readConfigRows(): Promise<Record<string, string>> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) }) },
  })
  const { data } = await sb
    .from('app_config')
    .select('key,value')
    .in('key', ['claudeclaw_tunnel_url', 'claudeclaw_primary_url', 'claudeclaw_fallback_url'])
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as Array<{ key: string; value: string | null }>) {
    const v = r.value?.trim()
    if (v) out[r.key] = v
  }
  return out
}

async function isAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) return false
    const body = await res.json().catch(() => null) as { ok?: boolean } | null
    return body?.ok === true
  } catch {
    return false
  }
}

// Stale-while-revalidate (26 sep 2026, pase de latencia). Antes, cada 20 s (y en
// cada lambda fría) el PRIMER request pagaba en serie: lectura de app_config en
// Supabase + GET /health por el túnel (~0.3-1.5 s) ANTES de hacer su trabajo. Ahora
// la URL conocida se devuelve al instante y el sondeo corre en segundo plano; solo
// el arranque en frío (sin URL alguna) espera, y ahí los candidatos se sondean en
// paralelo. Una URL de más de STALE_MAX_MS ya no se sirve sin re-sondear.
const STALE_MAX_MS = 10 * 60_000
let chatRefresh: Promise<string> | null = null

async function resolveChatUrl(): Promise<string> {
  const now = Date.now()
  // En Vercel no hay daemon local: sondear localhost es un hop inútil.
  const probeLocal = !process.env.VERCEL
  const [rows, localAlive] = await Promise.all([
    readConfigRows().catch(() => ({} as Record<string, string>)),
    probeLocal ? isAlive('http://localhost:3099') : Promise.resolve(false),
  ])

  // 1. El desktop instalado habla con su daemon local; desde la propia máquina el
  //    Funnel se cuelga (DNS público de tailscaled de brew).
  if (localAlive) {
    chatCache = { url: 'http://localhost:3099', at: now }
    return 'http://localhost:3099'
  }

  // 2. Servidor (Studio) por túnel y 3. Mini en rol chat: sondeo en paralelo,
  //    gana el primero en orden de prioridad que responda vivo.
  const candidates = [rows['claudeclaw_primary_url'], rows['claudeclaw_fallback_url']].filter(Boolean) as string[]
  const alive = await Promise.all(candidates.map(isAlive))
  const winner = candidates.find((_, i) => alive[i])
  if (winner) {
    chatCache = { url: winner, at: now }
    return winner
  }

  // 4. Último recurso: la fila del servidor que tunnel-sync verifica cada 10 min; si
  //    también cae, el error llega legible río arriba.
  const server = rows['claudeclaw_tunnel_url'] ?? remoteFallbackUrl()
  if (server) {
    chatCache = { url: server, at: now }
    return server
  }
  return fallbackUrl()
}

// Plazo duro de la promesa COMPARTIDA (7 oct 2026). Incidente: un refresco en segundo plano quedó pendiente para
// siempre (el fetch parcheado de Next, atado al request que lo lanzó, puede no resolver nunca si ese request se
// cierra) y, pasados los 10 min de STALE_MAX_MS, TODA ruta que pedía la URL esperaba esa misma promesa: cero
// llamadas de red, cero respuestas, las 6 conexiones de WebKit ocupadas y la app de escritorio «Sin conexión con el
// Studio» con el mensaje de Daniel atorado en su cola. Los timeouts de cada fetch no bastan; el singleton necesita
// su propio plazo: al vencer se sirve lo último conocido (o el fallback) y el singleton se libera.
const REFRESH_DEADLINE_MS = 5_000

function withDeadline(work: Promise<string>, fallback: () => string): Promise<string> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback()), REFRESH_DEADLINE_MS)
    work.then(
      url => { clearTimeout(timer); resolve(url) },
      () => { clearTimeout(timer); resolve(fallback()) },
    )
  })
}

function refreshChatUrl(): Promise<string> {
  if (!chatRefresh) {
    chatRefresh = withDeadline(resolveChatUrl(), () => chatCache?.url ?? fallbackUrl())
      .finally(() => { chatRefresh = null })
  }
  return chatRefresh
}

/**
 * Edición cliente (empaquetado, 11 oct 2026; CONTRATO-DAEMON.md §2): un solo daemon, el de la app, en loopback. La URL
 * la pasa la app (`CLAUDECLAW_URL`); nunca se lee `app_config` de Supabase ni se sigue un túnel. Si la URL no es de
 * loopback se ignora (el token jamás sale de la máquina).
 */
export function urlDaemonCliente(env: Record<string, string | undefined> = process.env): string {
  const propia = (env.CLAUDECLAW_URL ?? env.ARBRAIN_DAEMON_URL ?? '').trim().replace(/\/+$/, '')
  try {
    if (propia) {
      const u = new URL(propia)
      if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return propia
    }
  } catch { /* valor inválido: respaldo */ }
  return 'http://127.0.0.1:3099'
}

/** URL del daemon que atiende el CHAT: el Studio si está vivo, si no el Mini (respaldo de chat). */
export async function getClaudeclawUrl(): Promise<string> {
  if (esEdicionCliente()) return urlDaemonCliente()
  // Instancia aislada (canary/ensayo): un daemon fijo en esta máquina que NO
  // debe resolverse por el túnel de producción. Vacío en producción y en el
  // desktop instalado; solo lo fija quien arranca ese ensayo.
  const pinned = process.env.CLAUDECLAW_URL_PINNED
  if (pinned) return pinned
  const age = chatCache ? Date.now() - chatCache.at : Infinity
  if (chatCache && age < PROBE_TTL_MS) return chatCache.url
  if (chatCache && age < STALE_MAX_MS) {
    void refreshChatUrl().catch(() => {})
    return chatCache.url
  }
  return refreshChatUrl()
}

/** URL del daemon dueño del SCHEDULER (crons, planning, ventas): el servidor (Studio desde el 24 sep). */
export async function getSchedulerUrl(): Promise<string> {
  if (esEdicionCliente()) return urlDaemonCliente()
  const pinned = process.env.CLAUDECLAW_URL_PINNED
  if (pinned) return pinned
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.url
  // Mismo stale-while-revalidate que el chat: con URL conocida no se espera a Supabase.
  if (cache && now - cache.at < STALE_MAX_MS) {
    void refreshSchedulerUrl().catch(() => {})
    return cache.url
  }
  return refreshSchedulerUrl()
}

let schedulerRefresh: Promise<string> | null = null
function refreshSchedulerUrl(): Promise<string> {
  if (!schedulerRefresh) {
    schedulerRefresh = (async () => {
      try {
        const url = (await readConfigRows())['claudeclaw_tunnel_url']
        if (url) {
          cache = { url, at: Date.now() }
          return url
        }
      } catch {
        // Supabase inalcanzable o lento: seguimos al fallback, no se cuelga la vista.
      }
      return cache?.url ?? fallbackUrl()
    })()
    schedulerRefresh = withDeadline(schedulerRefresh, () => cache?.url ?? fallbackUrl())
      .finally(() => { schedulerRefresh = null })
  }
  return schedulerRefresh
}

// ─── Errores legibles rio arriba ──────────────────────────────────────────────
// Antes los route handlers hacian `return new Response(await upstream.text(), ...)`
// tal cual. Cuando el tunel esta muerto, ngrok NO contesta JSON: contesta una
// pagina HTML de error. El cliente hace `res.json()`, truena, y cae en su
// `.catch(() => ({ error: 'Error desconocido' }))` — el mensaje inutil de la
// captura del 2 sep. Un error que no dice QUE fallo cuesta una sesion de debug.
//
// Esta funcion garantiza JSON SIEMPRE, y traduce el HTML de ngrok a la causa real.
export async function upstreamError(upstream: Response, what: string): Promise<Response> {
  if (upstream.status === 401) {
    return Response.json({
      error: 'Arbrain no pudo autenticarse con el servidor del chat. Revisa la credencial del puente; no es el inicio de sesión de tu cuenta de IA.',
      code: 'DAEMON_AUTH_FAILED',
    }, { status: 502 })
  }
  const text = await upstream.text().catch(() => '')
  const looksHtml = /^\s*</.test(text)

  // ngrok sirve HTML cuando la URL ya no existe (ERR_NGROK_3200 / 404 de tunel).
  if ((looksHtml || /ERR_NGROK/.test(text)) && esEdicionCliente()) {
    // El alumno no tiene túnel: un HTML aquí es su motor local respondiendo mal o reiniciándose.
    return Response.json({ error: msjMotorCaido(true), code: 'DAEMON_UNREACHABLE', reintentable: true }, { status: 503 })
  }
  if (looksHtml || /ERR_NGROK/.test(text)) {
    return Response.json(
      {
        error: `El tunel al daemon esta muerto o cambio de URL (${what}). ` +
          `Corre el LaunchAgent com.claudeclaw.tunnel-sync o revisa que ngrok siga arriba en el Mac Studio.`,
        code: 'TUNNEL_DEAD',
      },
      { status: 502 },
    )
  }

  // Ya venia JSON del daemon: pasarlo tal cual (conserva su mensaje).
  try {
    return Response.json(JSON.parse(text), { status: upstream.status })
  } catch {
    return Response.json(
      { error: text.slice(0, 400) || `${what} fallo con HTTP ${upstream.status}`, code: 'UPSTREAM_ERROR' },
      { status: upstream.status },
    )
  }
}
