import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { esEdicionCliente } from '@/lib/edicion'
import { proxyCliente } from '@/lib/proxy-cliente'

// Unificado 2 jul 2026: existian src/middleware.ts y proxy.ts (root) haciendo lo mismo
// con matchers divergentes. Next 16 + src/: el canonico es src/proxy.ts. Matcher = el
// completo (excluye sw.js/manifest para no romper el service worker de la PWA).
export async function proxy(request: NextRequest) {
  // Edición cliente (empaquetado, 11 oct 2026): sin Supabase; sesión = secreto por instalación de la app.
  if (esEdicionCliente()) return proxyCliente(request)
  return await updateSession(request)
}

export const config = {
  matcher: [
    // tts-lab.html: banco de pruebas del lector por voz (diagnóstico puro, sin datos
    // ni acceso a nada). Va fuera de la auth para poder abrirlo en el iPhone sin
    // depender de la cookie de sesión de Safari.
    // api/version: solo el id del build (sin datos); la app de escritorio lo consulta para recargar tras un deploy.
    '/((?!api/version|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw.js|tts-lab.html|manifest.json|manifest-panel.json|manifest-habitos.json|manifest.webmanifest|manifesto|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2)$).*)',
    // Adjuntos del chat (v0.2.6): terminan en .png/.jpg y la regla de arriba los dejaría fuera del proxy (Host, lista
    // blanca y sesión). La ruta vuelve a pedir sesión, pero no se depende de una sola capa.
    '/api/storage/adjunto/:path*',
    // Archivos del chat (T6): el nombre al final (`propuesta.png`) también lo sacaría del proxy y de su regla de Host.
    '/api/chat/archivo/:path*',
  ],
}
