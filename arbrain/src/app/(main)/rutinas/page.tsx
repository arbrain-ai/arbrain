import { permanentRedirect } from 'next/navigation'

// Rutinas vive en el Taller desde el 5 oct 2026 (Daniel, 18:11: «el Taller es tu cerebro por dentro»):
// /rutinas abre el chat con el Taller del panel en su pestaña Rutinas (dashboard-shell consume el parámetro).
export default function Page() {
  permanentRedirect('/chat?panel=taller&taller=rutinas')
}
