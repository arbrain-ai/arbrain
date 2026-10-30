'use client'
/** Lo que gasta un agente, en la fila y en la ficha del Taller (2 oct 2026). Sin fuente real, no se pinta. */
import { consumoDe, contextoEnPalabras, tokensCortos, ventanaCorta } from './consumo'
import { nombreEsfuerzo } from '@/shared/lib/uso-modelo'
import type { Terminal } from '../trabajos-modelo'
import c from './consumo.module.css'

function Barra({ pct }: { pct: number }) {
  return <span className={c.barra} data-alto={pct >= 70 || undefined} aria-hidden><i style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} /></span>
}

/** «[Sonnet 5.5] 168 K tokens · ▬ 19 % de 1M» bajo el nombre del agente. */
export function LineaConsumo({ t }: { t: Terminal }) {
  const k = consumoDe(t)
  if (!k.modelo && k.tokens == null && k.ctxPct == null) return null
  // Mismo orden que el chat (formato único, 2 oct 2026): modelo · esfuerzo · tokens · contexto.
  const partes = [nombreEsfuerzo(k.esfuerzo), k.tokens != null ? `${tokensCortos(k.tokens)} tokens` : null].filter((p): p is string => !!p)
  return <span className={c.linea} data-consumo aria-label={[k.modelo, ...partes, contextoEnPalabras(k)].filter(Boolean).join(', ')}>
    {k.modelo && <span className={c.modelo}>{k.modelo}</span>}
    {partes.map(p => <span key={p}>{p}</span>)}
    {k.ctxPct != null && <>{partes.length > 0 && <span className={c.sep}>·</span>}<Barra pct={k.ctxPct} /><span>{contextoEnPalabras(k)}</span></>}
  </span>
}

/** Ficha: Modelo · Tokens · Contexto, cada uno solo si su fuente lo dice. */
export function FichaConsumo({ t }: { t: Terminal }) {
  const k = consumoDe(t)
  if (!k.modelo && k.tokens == null && k.ctxPct == null) return null
  return <dl className={c.ficha} data-consumo>
    {k.modelo && <div><dt>Modelo</dt><dd><span className={c.modelo}>{k.modelo}</span></dd></div>}
    {k.esfuerzo && <div><dt>Esfuerzo</dt><dd>{nombreEsfuerzo(k.esfuerzo)}</dd></div>}
    {k.tokens != null && <div><dt>Tokens consumidos</dt><dd>{k.tokens.toLocaleString('es-MX')}</dd></div>}
    {k.ctxPct != null && <div><dt>Contexto usado</dt><dd><Barra pct={k.ctxPct} />{k.ctxPct} %{k.ventana && <small>de {ventanaCorta(k.ventana)}</small>}</dd></div>}
  </dl>
}
