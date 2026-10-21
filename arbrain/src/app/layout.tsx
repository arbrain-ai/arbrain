import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Roboto_Slab, Montserrat } from 'next/font/google'
import './globals.css'
import '@/shared/movimiento/movimiento.css'
import { PWARegister } from '@/components/PWARegister'
import { aperturaEnChatScript } from '@/shared/lib/apertura-en-chat'
import { AuthExpiryGuard } from '@/components/AuthExpiryGuard'
import { DesktopReloadShortcut } from '@/components/DesktopReloadShortcut'
import { ReposoVentana } from '@/shared/movimiento/Reposo'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { AuthProvider } from '@/shared/contexts/auth-context'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const robotoSlab = Roboto_Slab({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-roboto-slab',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
})

const themeInitScript = `
(() => {
  try {
    // Misma regla que temaGuardadoVigente (shared/lib/tema-por-hora.ts): claro/oscuro a mano caduca en el siguiente
    // cambio de tramo; lo guardado sin fecha (antes del 4 oct 2026) ya no fija el tema para siempre.
    const stored = window.localStorage.getItem('mission-control-theme');
    const hasta = Number(window.localStorage.getItem('mission-control-theme-hasta'));
    const theme = (stored === 'light' || stored === 'dark') && Number.isFinite(hasta) && hasta > Date.now() ? stored : 'auto';
    // Misma regla que shared/lib/tema-por-hora.ts: claro 06-19 (hora de México), oscuro el resto.
    const forced = window.localStorage.getItem('arbrain-hora-forzada');
    const h = forced !== null && forced !== '' && Number.isInteger(+forced) && +forced >= 0 && +forced <= 23
      ? +forced
      : Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) % 24;
    const resolved = theme === 'auto' ? (h >= 6 && h < 19 ? 'light' : 'dark') : theme;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    // Barra de estado de la PWA y de Safari: el tema resuelto, no el esquema del sistema (COLOR_BARRA en theme-context).
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', resolved === 'dark' ? '#09090b' : '#fafafa'); });
  } catch {
    document.documentElement.classList.add('dark');
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`

export const metadata: Metadata = {
  title: 'Arbrain',
  description: 'AI-powered business dashboard',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Arbrain',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  // NOTE: NO interactiveWidget here. The 26-may (known-good) config did not set
  // it. Adding interactiveWidget:'resizes-content' (jun-6) is what introduced
  // the app-wide bottom black band in the iOS standalone PWA — it left the
  // layout viewport / shell short of the physical screen. Default behaviour
  // (resizes-visual) + the JS --app-h keyboard handling is the working setup.
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable} ${robotoSlab.variable} ${montserrat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: aperturaEnChatScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Preconexión al Supabase de esta instalación, si tiene uno (la edición cliente no). */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />}
        {/* Montserrat literal para canvas2d (ctx.font) — self-hosted en public/fonts/montserrat/
            via @font-face en globals.css. Antes: stylesheet render-blocking a Google Fonts en
            cada arranque (malo para la desktop). */}
        <link
          rel="preload"
          href="/fonts/montserrat/montserrat-latin-600.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <PWARegister />
            <AuthExpiryGuard />
            <DesktopReloadShortcut />
            <ReposoVentana />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
