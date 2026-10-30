import { permanentRedirect } from 'next/navigation'
// Los crons viven en Rutinas (retiro de Ops, 5 oct 2026).
export default function Page() { permanentRedirect('/rutinas') }
