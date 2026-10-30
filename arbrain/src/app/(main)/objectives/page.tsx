import { permanentRedirect } from 'next/navigation'
// Objetivos es el Calendario unificado en escala Mes (retiro del 5 oct 2026; docs/builds/retiro-pantallas-viejas-2026-10-05.md).
export default function Page() { permanentRedirect('/calendar?mode=month') }
