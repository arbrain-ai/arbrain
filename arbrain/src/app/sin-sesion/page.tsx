import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { esEdicionCliente } from '@/lib/edicion'
import { esModoServidor } from '@/lib/modo-servidor'

export const metadata: Metadata = { title: 'Arbrain' }
// El modo servidor se sabe en tiempo de ejecución (`ARBRAIN_MODO_SERVIDOR`): la página no se congela al compilar.
export const dynamic = 'force-dynamic'

const ERRORES: Record<string, string> = {
  contrasena: 'Esa contraseña no coincide. Revísala con «npm run servidor -- contrasena».',
  espera: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.',
  pase: 'Ese enlace de entrada ya se usó o venció. Entra con tu contraseña o corre «npm run servidor -- abrir».',
}

/**
 * Edición cliente (11 oct 2026): la web solo responde a la app de escritorio (secreto por instalación). Si alguien la
 * abre en un navegador, aquí se le explica en vez de un error. Modo servidor (21 oct 2026): aquí se entra con la
 * contraseña que genera `npm run servidor` (POST a /api/desktop/entrar).
 */
export default async function SinSesionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!esEdicionCliente()) notFound()
  if (esModoServidor()) {
    const e = (await searchParams).e
    const error = typeof e === 'string' ? ERRORES[e] : undefined
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background px-6 text-foreground">
        <form method="post" action="/api/desktop/entrar" className="glass-panel-strong w-full max-w-md space-y-4 p-8">
          <h1 className="text-xl font-semibold tracking-tight">Entra a tu Arbrain</h1>
          <p className="text-[14px] leading-relaxed text-muted">
            Escribe tu contraseña. Si no la tienes a mano, en la terminal donde corre Arbrain escribe{' '}
            <code className="rounded bg-surface px-1">npm run servidor -- contrasena</code>.
          </p>
          <label className="block text-[13px] font-medium" htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena" name="contrasena" type="password" required autoFocus autoComplete="current-password"
            className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 font-mono text-[14px]"
          />
          {error && <p role="alert" className="text-[13px] text-red-500">{error}</p>}
          <button type="submit" className="w-full rounded-xl bg-brand px-4 py-2 text-[14px] font-medium text-white">Entrar</button>
        </form>
      </main>
    )
  }
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-6 text-foreground">
      <div className="glass-panel-strong max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Abre Arbrain desde la app</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">Por seguridad, tu Arbrain solo responde a su app de escritorio. Esta página no puede abrirse desde un navegador.</p>
      </div>
    </main>
  )
}
