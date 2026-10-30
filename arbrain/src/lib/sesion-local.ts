/**
 * ¿El navegador le pregunta al servidor si su sesión es la de la app (`/api/local-first/desktop-session`)?
 *
 * Puro (sin window ni React): lo usa `shared/contexts/auth-context.tsx` y lo prueba `tests/auth/sesion-local.test.ts`.
 *
 * - App de escritorio (Tauri): no; ya es la sesión de la app.
 * - Navegador en loopback (ensayo local, modo servidor en la misma máquina): sí, como siempre.
 * - Edición cliente en un navegador con otro Host (modo servidor por el teléfono, `*.ts.net` de Tailscale): sí.
 *   Antes no se preguntaba y se caía al cliente de Supabase, que en la edición cliente es inerte (sin sesión): el rol
 *   quedaba en 'member', el RouteGuard tapaba /chat (solo del dueño) y el chat salía sin mensajes ni campo para escribir
 *   (reporte de un fundador, 23 oct 2026, v0.2.9). El servidor es quien decide (cookie del secreto por instalación + Host del
 *   teléfono encendido, `isDesktopAuthBypassRequest`); fuera de eso responde 401/404 y sigue el camino de siempre.
 * - Instalación de Daniel fuera de loopback (Vercel, Funnel): no; manda Supabase.
 */
export function preguntarSesionLocal(r: { escritorio: boolean; loopback: boolean; edicionCliente: boolean }): boolean {
  if (r.escritorio) return false
  return r.loopback || r.edicionCliente
}

/**
 * Pantallas de entrada: ahí un 401 de /api es lo esperado (aún no hay sesión) y AuthExpiryGuard no debe mandar a
 * /login. En la edición cliente /login lleva a /sin-sesion; sin esta excepción, el primer 401 en /sin-sesion por el
 * teléfono (`*.ts.net`, fuera de loopback) recargaba /login → /sin-sesion → 401 → … sin fin.
 */
export function esPantallaDeEntrada(ruta: string): boolean {
  return ['/login', '/sin-sesion'].some((p) => ruta === p || ruta.startsWith(`${p}/`) || ruta.startsWith(`${p}?`))
}
