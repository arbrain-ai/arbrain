'use client'
import { numeric, stamp, type Billing, type Overview } from '@/features/clarity/types'
import { useFuente } from '../datos'
import { Cifra, Chispa, escalon } from '../movimiento'
import s from '../cabina.module.css'
import l from '../luz.module.css'

export const URL_CENTRO = '/api/clarity?section=overview'
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const corta = (d?: string) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '') : ''

/** Cambio contra el corte de hace una semana, con su signo y SIN inventar: si no hay
 *  corte comparable lo dice. `bueno` = qué dirección es buena para esta cifra. */
function Delta({ b, p, k, bueno = 1 }: { b?: Billing | null; p?: Billing | null; k: 'mrr_cents' | 'active_subs' | 'cancel_at_period_end'; bueno?: 1 | -1 }) {
  const c = b?.[k], v = p?.[k]
  if (c == null || v == null) return <small>sin corte comparable</small>
  const d = c - v, signo = d === 0 ? '0' : d * bueno > 0 ? '+' : '-'
  return <span className={l.deltaFila}><span className={l.delta} data-signo={signo}>{d > 0 ? '▲' : d < 0 ? '▼' : '='} {d > 0 ? '+' : ''}{k === 'mrr_cents' ? usd(d) : numeric(d)}</span>vs {corta(p?.date)}</span>
}

/** Lo cobrado, de Polar reconciliado: las 3 cifras del antiguo Command Center. Hoy viven arriba de Finanzas («Lo que entra»);
 *  `ceja={false}` deja el encabezado a quien la aloja. */
export function VistaCentro({ grande, ceja = true }: { grande?: boolean; ceja?: boolean }) {
  const { data, error } = useFuente<Overview>(URL_CENTRO)
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Consultando Polar…'}</div>
  const b = data.billing, viejo = b && Date.now() - Date.parse(b.polar_reconciled_at) > 48 * 3600_000
  const serie = (data.history ?? []).map(h => h.mrr_cents).filter((v): v is number => v != null)
  return <div>
    {ceja && <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>El negocio hoy · <b>Polar reconciliado</b></p>}
    <div className={l.cifras} style={ceja ? { marginTop: 10 } : undefined}>
      <div className={`${l.cifra} ${l.entra}`} style={escalon(1)} data-foco>
        <span>MRR</span>
        <strong>{b?.mrr_cents == null ? 'Sin dato' : <Cifra valor={b.mrr_cents} clave="centro-mrr" formato={usd} />}</strong>
        <Delta b={b} p={data.previousBilling} k="mrr_cents" />
        {serie.length > 2 && <Chispa valores={serie} className={l.chispa} trazoClase={l.trazo} etiqueta={`MRR de los últimos ${serie.length} cortes`} />}
      </div>
      <div className={`${l.cifra} ${l.entra}`} style={escalon(2)}>
        <span>Suscripciones</span>
        <strong>{b?.active_subs == null ? 'Sin dato' : <Cifra valor={b.active_subs} clave="centro-subs" formato={n => Math.round(n).toLocaleString('es-MX')} />}</strong>
        <Delta b={b} p={data.previousBilling} k="active_subs" />
      </div>
      <div className={`${l.cifra} ${l.entra}`} style={escalon(3)}>
        <span>Cancelación prevista</span>
        <strong>{b?.cancel_at_period_end == null ? 'Sin dato' : <Cifra valor={b.cancel_at_period_end} clave="centro-cancel" formato={n => Math.round(n).toLocaleString('es-MX')} />}</strong>
        <Delta b={b} p={data.previousBilling} k="cancel_at_period_end" bueno={-1} />
      </div>
    </div>
    <p className={l.fuente} style={{ marginTop: 8 }}>{b ? `Polar · corte ${stamp(b.polar_reconciled_at)}` : 'Polar · sin corte reconciliado'}{serie.length > 2 ? ` · la línea son los últimos ${serie.length} cortes` : ''}</p>
    {viejo && <p className={l.aviso} style={{ marginTop: 8 }}>La reconciliación tiene más de 48 horas: describe ese corte, no el estado actual.</p>}
    {error && <p className={l.aviso}>{error} Se muestra la última lectura.</p>}
    {data.issues.slice(0, grande ? 6 : 2).map(v => <p key={v} className={l.aviso}>{v}</p>)}
  </div>
}

export function resumenCentro(o: Overview | undefined) {
  const c = o?.billing?.mrr_cents
  return c == null ? null : `MRR ${usd(c)} · ${numeric(o?.billing?.active_subs)} suscripciones`
}
