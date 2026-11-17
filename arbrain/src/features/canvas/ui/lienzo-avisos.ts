/**
 * Lo que dice la sección Lienzo cuando algo falla (16 nov 2026, un fundador en Windows: «los lienzos todavía no los puedo
 * usar mucho»). Antes, si la lista de lienzos no llegaba, la sección decía «Aún no hay lienzos» (mentira: sí los había) y
 * «Lienzo nuevo» fallaba sin decir nada. Ahora dice qué pasó en una frase y qué puede hacer la persona. Puro: se prueba solo.
 */
import { tr } from '@/shared/i18n'

/** Qué hacer, igual en Mac, Windows y Linux. */
const QUE_HACER = () => tr('Cierra y vuelve a abrir Arbrain. Si sigue igual, escríbele a Levy en el chat: «revisa por qué no abren mis lienzos».')

/** Detalle técnico corto, solo si dice algo (nunca un código suelto como única explicación). */
function detalle(error: unknown): string {
  const m = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const limpio = m.trim().slice(0, 140)
  return limpio ? ` (${limpio})` : ''
}

export function avisoNoLeiLienzos(error: unknown): { titulo: string; que: string } {
  return { titulo: tr('No pude leer tus lienzos{detalle}.', { detalle: detalle(error) }), que: QUE_HACER() }
}

export function avisoNoCreeLienzo(error: unknown): { titulo: string; que: string } {
  return { titulo: tr('No pude crear el lienzo{detalle}.', { detalle: detalle(error) }), que: QUE_HACER() }
}
