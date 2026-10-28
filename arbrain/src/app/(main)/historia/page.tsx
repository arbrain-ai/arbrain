import { permanentRedirect } from 'next/navigation'

// La historia de tu cerebro vive en Taller › Historia desde el 28 oct 2026 (Daniel: «cómo podemos obtener lo mejor de ambos
// mundos con vistas en el taller»): /historia abre el chat con esa pestaña, como /servidores.
export default function Page() {
  permanentRedirect('/chat?panel=taller&taller=historia')
}
