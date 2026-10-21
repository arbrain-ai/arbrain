import { permanentRedirect } from 'next/navigation'

// Memoria vive en el Taller desde el 5 oct 2026, fundida con los archivos del cerebro (Daniel, 18:11):
// /memoria abre el chat con el Taller del panel en su pestaña Memoria.
export default function Page() {
  permanentRedirect('/chat?panel=taller&taller=memoria')
}
