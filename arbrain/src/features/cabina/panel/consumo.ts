/**
 * Modelo, tokens y contexto de un agente, a simple vista (2 oct 2026, pedido de Daniel: en el Taller,
 * en la lista y en la ficha). Todo sale del lector del motor (la conversación real del CLI) o del
 * registro de subagentes de Levy. Sin fuente, el dato no se pinta: nada inventado.
 *
 * Lógica pura para probarla sola: tests/cabina/consumo.test.ts.
 */
import type { Terminal } from '../trabajos-modelo'
import { contextoEnPalabras as contextoUso, lineaUso, nombreModelo, tokensCortos, ventanaCorta } from '../../../shared/lib/uso-modelo'

// El formato vive en un solo lugar (motor estándar, 2 oct 2026): el chat y el panel pintan igual.
export { nombreModelo, tokensCortos, ventanaCorta }

/** `modelo` ya legible; `crudo` es el id que reportó la fuente (para la línea común). `esfuerzo`, solo si el transcript lo dice. */
export interface Consumo { modelo: string | null; crudo: string | null; esfuerzo: string | null; tokens: number | null; ctxPct: number | null; ventana: number | null }

/**
 * Tokens que contradicen al contexto no se pintan. Lo gastado en una sesión (entrada + caché creada +
 * salida, sumado sobre todos sus mensajes) no puede ser menos que lo que hoy ocupa su contexto, salvo
 * lo que leyó de una caché creada por OTRA sesión (prompt de sistema y herramientas: decenas de miles).
 * Si falta más que eso, la suma salió de un pedazo del transcript (el lector viejo sumaba solo la cola
 * de 768 KB: 7,830 tokens con el contexto al 54 %). Mejor «sin medir» que una cifra falsa.
 */
const CACHE_AJENA = 60_000
export function tokensCreibles(tokens: number | null, ctxPct: number | null, modelo: string | null | undefined, ventana: number | null): number | null {
  if (tokens == null || tokens <= 0) return null
  const v = ventana ?? (modelo && /^claude-/i.test(modelo) ? (/haiku-4/i.test(modelo) ? 200_000 : 1_000_000) : null)
  if (ctxPct == null || !v) return tokens
  return tokens + CACHE_AJENA < (ctxPct / 100) * v ? null : tokens
}

/** La conversación que lee el motor manda (es lo que el CLI ve ahora); el registro de Levy cubre lo demás. */
export function consumoDe(t: Pick<Terminal, 'conversacion' | 'subagente'>): Consumo {
  const c = t.conversacion, s = t.subagente
  const ctxPct = c?.ctxPct ?? null
  const crudo = c?.modelo ?? s?.modelo
  const ventanaFuente = ctxPct != null && typeof c?.ctxVentana === 'number' && c.ctxVentana > 0 ? c.ctxVentana : null
  const tokens = tokensCreibles(c?.tokens ?? s?.tokens ?? null, ctxPct, crudo, ventanaFuente)
  return {
    modelo: nombreModelo(crudo),
    crudo: crudo ?? null,
    esfuerzo: c?.esfuerzo ?? null,
    tokens,
    ctxPct: typeof ctxPct === 'number' ? Math.round(ctxPct) : null,
    ventana: ventanaFuente,
  }
}

const contextoDe = (k: Consumo) => k.ctxPct == null ? null : { pct: k.ctxPct, ventana: k.ventana }

/** «19 % de 1M» o, si la fuente no dice la ventana, «19 % de contexto». */
export const contextoEnPalabras = (k: Consumo) => contextoUso(contextoDe(k))

/** La línea compacta de la fila, la misma del chat: «Sonnet 5.5 · alto · 168 K tokens · 19 % de 1M». */
export const lineaConsumo = (k: Consumo) => lineaUso({ modelo: k.crudo, esfuerzo: k.esfuerzo, tokens: k.tokens, contexto: contextoDe(k) })
