import type { Metadata } from 'next'

// El panel en el teléfono (14 oct 2026) se instala como su propio ícono: «Panel», que abre aquí y no en el chat.
export const metadata: Metadata = {
  title: 'Panel · Arbrain',
  manifest: '/manifest-panel.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Panel' },
}

export default function TelefonoLayout({ children }: { children: React.ReactNode }) {
  return children
}
