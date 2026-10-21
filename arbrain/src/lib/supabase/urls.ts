// De dónde habla cada lado con Mission Control (30 sep 2026, pedido de Daniel: «apúntala directo a local sin pasar
// por Tailscale»). El navegador (teléfono, laptop) necesita la URL pública del Funnel; el servidor de Next corre en el
// mismo Studio que la base, así que va directo a 127.0.0.1:8000 y no depende de que Tailscale esté arriba.
// Las cookies de sesión se llaman según la URL PÚBLICA (sb-<primer-label>-auth-token); al usar la interna, el
// servidor fija ese mismo nombre para seguir leyendo la sesión del navegador.
export const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SERVER_SUPABASE_URL = process.env.SUPABASE_URL_INTERNA || PUBLIC_SUPABASE_URL
export const AUTH_COOKIE_NAME = (() => {
  try {
    return `sb-${new URL(PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  } catch {
    return undefined
  }
})()
