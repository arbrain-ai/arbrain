/**
 * ¿Corre lo que se pidió? (29 oct 2026, brecha 1 del benchmark de orquestación). Daniel: «no deberíamos tener esos bugs».
 * El registro guarda lo PEDIDO (modelo y esfuerzo al delegar o retomar); la bitácora, lo que el CLI REPORTA que corre
 * (`Turno.efectivo`). Aquí se comparan, sin inventar: si el CLI no reporta un valor, ese valor queda «pedido, sin medir»
 * y nunca se pinta como medido. Claude no reporta el esfuerzo en stream-json (2.1.285); codex app-server sí.
 */

export interface ValorCoherencia {
  pedido: string | null
  /** Lo que reportó el CLI; null = no lo reportó (sin medir). */
  efectivo: string | null
  estado: 'coincide' | 'distinto' | 'sin-medir' | 'default'
}
export interface Coherencia {
  modelo: ValorCoherencia
  esfuerzo: ValorCoherencia
  /** «pediste max · corre medium» (o «pediste el modelo X · corre Y»); null si todo lo medido coincide. */
  desajuste: string | null
}

const base = (m: string) => m.toLowerCase().replace(/\[[^\]]*\]$/, '')
/** «opus» pide la familia: coincide con el id completo de su familia. Un id completo debe coincidir completo (sin el calificador [1m]). */
export function mismoModelo(pedido: string, efectivo: string): boolean {
  const p = base(pedido), e = base(efectivo)
  if (p === e) return true
  return /^[a-z]+$/.test(p) && new RegExp(`(^|-)${p}(-|$)`).test(e)
}

function valor(pedido: string | null, efectivo: string | null, igual: (p: string, e: string) => boolean): ValorCoherencia {
  if (!pedido) return { pedido: null, efectivo, estado: 'default' }
  if (!efectivo) return { pedido, efectivo: null, estado: 'sin-medir' }
  return { pedido, efectivo, estado: igual(pedido, efectivo) ? 'coincide' : 'distinto' }
}

export function coherencia(pedido: { modelo: string | null; esfuerzo: string | null }, efectivo: { modelo?: string; esfuerzo?: string } | undefined): Coherencia {
  const modelo = valor(pedido.modelo, efectivo?.modelo ?? null, mismoModelo)
  const esfuerzo = valor(pedido.esfuerzo, efectivo?.esfuerzo ?? null, (p, e) => p === e)
  const partes = [
    modelo.estado === 'distinto' ? `pediste el modelo ${modelo.pedido} · corre ${modelo.efectivo}` : null,
    esfuerzo.estado === 'distinto' ? `pediste ${esfuerzo.pedido} · corre ${esfuerzo.efectivo}` : null,
  ].filter(Boolean)
  return { modelo, esfuerzo, desajuste: partes.length ? partes.join(' · ') : null }
}
