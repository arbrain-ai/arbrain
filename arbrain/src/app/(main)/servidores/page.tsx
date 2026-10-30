import { permanentRedirect } from 'next/navigation'

// Servidores vive en Taller › Máquina desde el 5 oct 2026 (Daniel, 18:11): /servidores abre el chat con esa pestaña.
export default function Page() {
  permanentRedirect('/chat?panel=taller&taller=maquina')
}
