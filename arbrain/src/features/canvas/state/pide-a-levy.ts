/**
 * Lo que la caja «Pídele a Levy» del lienzo le manda al chat (7 nov 2026, Daniel: «si quiero hacer una clase la experiencia
 * manual de usuario no es tan buena»). El pedido va tal cual y debajo el lienzo con su id completo: Levy lo abre y escribe
 * en ESA página (skill sfmap) sin preguntar cuál. Pura (tests/canvas/pide-a-levy.test.ts).
 */
export function mensajeLienzo(p: { texto: string; paginaId: string; nombre: string }): string | null {
  const texto = p.texto.trim()
  if (!texto) return null
  return `${texto}\n\n(Lienzo «${p.nombre.trim() || 'Sin título'}» · id ${p.paginaId})`
}
