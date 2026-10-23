import type { Metadata } from 'next'

// «Hábitos de hoy» en la pantalla de inicio del teléfono (22 oct 2026): su propio ícono, que abre directo a las casillas.
export const metadata: Metadata = {
  title: 'Hábitos · Arbrain',
  manifest: '/manifest-habitos.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Hábitos' },
}

export default function HabitosTelefonoLayout({ children }: { children: React.ReactNode }) {
  return children
}
