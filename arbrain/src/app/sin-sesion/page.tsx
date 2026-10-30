import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'
import { esEdicionCliente } from '@/lib/edicion'
import { esModoServidor } from '@/lib/modo-servidor'

export const metadata: Metadata = { title: 'Arbrain' }
// El modo servidor se sabe en tiempo de ejecución (`ARBRAIN_MODO_SERVIDOR`): la página no se congela al compilar.
export const dynamic = 'force-dynamic'

const ERRORES: Record<string, string> = {
  contrasena: 'Esa contraseña no coincide. Revísala con «npm run servidor -- contrasena».',
  espera: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.',
  pase: 'Ese enlace de entrada ya se usó o venció. Entra con tu contraseña o corre «npm run servidor -- abrir».',
  codigo: 'Ese código no sirve (ya se usó o pasaron 10 minutos). Pide uno nuevo en tu computadora.',
}
// En su servidor (unidad de nube.sh, 30 oct 2026) no hay computadora que dé el código: lo da su Claude Code o `nube.sh codigo`.
const CODIGO_SERVIDOR = 'Ese código no sirve (ya se usó o pasaron 10 minutos). Pide otro: «dame un código para entrar» en tu Claude Code, o nube.sh codigo en tu servidor.'

/**
 * Edición cliente (11 oct 2026): la web solo responde a la app de escritorio (secreto por instalación). Si alguien la
 * abre en un navegador, aquí se le explica en vez de un error. Modo servidor (21 oct 2026): aquí se entra con la
 * contraseña que genera `npm run servidor` (POST a /api/desktop/entrar).
 */
export default async function SinSesionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!esEdicionCliente()) notFound()
  if (esModoServidor()) {
    const e = (await searchParams).e
    const enServidor = process.env.ARBRAIN_SERVIDOR_NUBE === '1'
    const error = e === 'codigo' && enServidor ? CODIGO_SERVIDOR : typeof e === 'string' ? ERRORES[e] : undefined
    const h = await headers()
    // Teléfono (23 oct 2026): desde el celular no hay terminal; el código sale de Ajustes en la computadora, o en su
    // servidor de su Claude Code (`nube.sh codigo`) o de un dispositivo donde ya entró.
    const telefono = llegaPorTelefono(h.get('host'), h.get('x-forwarded-proto'))
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background px-6 text-foreground">
        <form method="post" action="/api/desktop/entrar" className="glass-panel-strong w-full max-w-md space-y-4 p-8">
          <h1 className="text-xl font-semibold tracking-tight">Entra a tu Arbrain</h1>
          {telefono && enServidor ? (
            <p className="text-[14px] leading-relaxed text-muted" data-telefono="1" data-servidor="1">
              Es tu Arbrain, servido por tu servidor. Pídele a tu Claude Code «dame un código para entrar» (o corre{' '}
              <code className="rounded bg-surface px-1">nube.sh codigo</code> en tu servidor), o sácalo de un dispositivo
              donde ya entraste: Ajustes › Tu cerebro en el teléfono › «Código para entrar». Escríbelo aquí.
            </p>
          ) : telefono ? (
            <p className="text-[14px] leading-relaxed text-muted" data-telefono="1">
              Es tu Arbrain, servido por tu computadora. En ella abre Ajustes › Tu cerebro en el teléfono, pulsa
              «Código para entrar» y escríbelo aquí. También sirve tu contraseña.
            </p>
          ) : (
            <p className="text-[14px] leading-relaxed text-muted">
              Escribe tu contraseña. Si no la tienes a mano, en la terminal donde corre Arbrain escribe{' '}
              <code className="rounded bg-surface px-1">npm run servidor -- contrasena</code>.
            </p>
          )}
          <label className="block text-[13px] font-medium" htmlFor="contrasena">{telefono ? 'Código o contraseña' : 'Contraseña'}</label>
          <input
            id="contrasena" name="contrasena" type={telefono ? 'text' : 'password'} required autoFocus
            autoComplete={telefono ? 'one-time-code' : 'current-password'} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder={telefono ? 'abcd-efgh' : undefined}
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
