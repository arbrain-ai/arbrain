import { redirect } from 'next/navigation'

/** Los cobros fijos ya no tienen página aparte (8 oct 2026): viven en Finanzas, en un solo lugar. Este enlace sigue llegando ahí. */
export default async function CobrosRoute({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const { rango } = await searchParams
  redirect(`/finanzas?ver=cobros${rango ? `&rango=${encodeURIComponent(rango)}` : ''}`)
}
