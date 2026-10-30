import { permanentRedirect } from 'next/navigation'

// «El Sistema» (hábitos, racha y reflexión del 2 jul) se retiró el 5 oct 2026: los hábitos se marcan en el Calendario
// Día, con su racha y cuatro semanas de continuidad. Por eso va al Día y no al Taller ni a Configuración: es lo que
// mostraba. Código conservado en features/sistema/components (docs/builds/retiro-pantallas-viejas-2026-10-05.md).
export default function Page() { permanentRedirect('/calendar?mode=day') }
