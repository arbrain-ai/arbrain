import { FinancesPage } from '@/features/finances'
import { esRango } from '@/features/finances/lib/finanzas'

export const metadata = { title: 'Finanzas · Arbrain' }

export default async function FinanzasRoute({ searchParams }: { searchParams: Promise<{ rango?: string; ver?: string }> }) {
  const { rango, ver } = await searchParams
  return <FinancesPage rango={esRango(rango) ? rango : undefined} ver={ver === 'cobros' ? 'cobros' : undefined} />
}
