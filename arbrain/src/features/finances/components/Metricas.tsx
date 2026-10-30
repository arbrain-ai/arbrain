'use client'
/**
 * La fila de métricas principales (v3, 8 oct 2026): lo primero que ve Daniel. Cuatro números, todos del rango elegido:
 *  · MRR (Polar reconciliado, con su cambio contra el inicio del rango; incluye anuales prorrateados),
 *  · Cobrado (lo que entró por Polar, neto de comisión),
 *  · Gastado (de estados de cuenta, con su corte a la vista),
 *  · Patrimonio (la foto de saldos, con su fecha).
 * La advertencia acompaña al número que afecta (un chip rayado); no lo sustituye ni lo esconde.
 */
import type { ReactNode } from 'react'
import { Cifra, escalon, mov } from '@/shared/movimiento'
import { useFuente } from '@/features/cabina/datos'
import { sumarDias } from '@/features/cabina/model'
import { numeric, type Overview } from '@/features/clarity/types'
import { diasEntre } from '../lib/finanzas'
import { cortesPorFuente, fechaCorta, frescuraCierre, hace, hayCortePendiente, pesos } from '../lib/modelo'
import { InfoTip } from './InfoTip'
import type { FinanceSnapshot, FinanceSummary } from '../types/finances'
import h from './finanzas.module.css'

export const URL_CENTRO = '/api/clarity?section=overview'

const EDU_M = {
  mrr: 'Lo que Polar debería cobrar cada mes con las suscripciones activas de hoy. Incluye los planes anuales repartidos entre 12, por eso puede ser más que lo que realmente se cobra en un mes.',
  cobrado: 'Lo que entró por ventas y renovaciones de Polar en el rango, ya sin la comisión ni los reembolsos. Polar cobra en dólares: aquí se ve en pesos al tipo de cambio de hoy.',
  gastado: 'Todo lo que salió en el rango elegido (no es el mes calendario): cobros fijos, despensa, compras y efectivo que se registró. Los cobros fijos son una parte de este número, no todo. Un tramo sin su estado de cuenta todavía no cuenta.',
  patrimonio: 'Lo que tienes líquido (bancos, efectivo y crypto) el día de la última foto de saldos. No se actualiza solo: cada movimiento posterior no está en ella.',
}

function Fila({ i, etiqueta, edu, valor, sub, chip, tono, delta, sinDato }: {
  i: number; etiqueta: string; edu: string; valor: ReactNode; sub: ReactNode; chip?: string; tono?: 'gana' | 'pierde' | 'marca' | 'viejo'; delta?: ReactNode; sinDato?: boolean
}) {
  return <div className={`${h.metrica} ${mov.entra}`} style={escalon(i)} data-tono={tono} data-sin-dato={sinDato || undefined} role="group" aria-label={etiqueta}>
    <div className={h.metricaTexto}>
      <p className={h.metricaEtiqueta}><span>{etiqueta}</span><InfoTip text={edu} label={`Qué es ${etiqueta}`} />{chip && <em className={`${h.chip} ${mov.hueco}`}>{chip}</em>}</p>
      {delta && <p className={h.metricaDelta}>{delta}</p>}
      <p className={h.metricaSub}>{sub}</p>
    </div>
    <p className={h.metricaCifra}>{valor}</p>
  </div>
}

const usd = (c: number) => `US$${Math.round(c / 100).toLocaleString('es-MX')}`

/** El corte contra el que se compara el MRR: el de hace `days` días o, si no hay tan atrás, el más antiguo que existe. */
export function referenciaMrr(history: NonNullable<Overview['history']>, hoy: string, days: number) {
  const cortes = history.filter(r => r.mrr_cents != null).sort((a, b) => a.date.localeCompare(b.date))
  if (cortes.length < 2) return null
  const ultimo = cortes[cortes.length - 1], objetivo = sumarDias(hoy, -days)
  const exacto = cortes.filter(r => r.date <= objetivo).at(-1)
  const ref = exacto ?? cortes[0]
  return ref.date === ultimo.date ? null : { ref, exacto: !!exacto, ultimo }
}

export function Metricas({ summary, cierre, hoy, palabraRango }: { summary: FinanceSummary; cierre: FinanceSnapshot | null; hoy: string; palabraRango: string }) {
  const { data } = useFuente<Overview>(URL_CENTRO)
  const b = data?.billing
  const cortes = cortesPorFuente(summary.coverage)
  const piso = hayCortePendiente(summary.coverage, hoy)
  const polar = summary.income_by_source.find(c => c.category === 'Polar')?.total_mxn ?? 0
  const otros = Math.max(0, summary.income_range_mxn - polar) >= 50 ? summary.income_range_mxn - polar : 0
  const f = frescuraCierre(cierre, hoy)
  const comp = b && data?.history ? referenciaMrr(data.history, hoy, summary.days) : null
  const dMrr = comp && b?.mrr_cents != null && comp.ref.mrr_cents != null ? b.mrr_cents - comp.ref.mrr_cents : null
  const mrrViejo = b ? Date.now() - Date.parse(b.polar_reconciled_at) > 48 * 3600_000 : false
  const sinEstadosEnRango = summary.burn_range_mxn === 0

  return <div className={h.metricas}>
    <Fila i={0} etiqueta="MRR" edu={EDU_M.mrr} tono="marca" sinDato={b?.mrr_cents == null}
      valor={b?.mrr_cents == null ? 'Sin dato' : <Cifra valor={b.mrr_cents} clave="m-mrr" formato={usd} />}
      chip={mrrViejo ? 'corte viejo' : undefined}
      delta={dMrr != null && comp ? <span data-signo={dMrr === 0 ? '0' : dMrr > 0 ? '+' : '-'}>{dMrr > 0 ? '▲ +' : dMrr < 0 ? '▼ −' : '= '}{usd(Math.abs(dMrr))} vs {fechaCorta(comp.ref.date)}{comp.exacto ? '' : ' (el corte más antiguo)'}</span> : b ? <span>sin corte comparable</span> : undefined}
      sub={b ? `${numeric(b.active_subs)} suscripciones · Polar, corte del ${fechaCorta(b.date)}` : data ? 'Polar sin corte reconciliado' : 'Consultando Polar…'} />
    <Fila i={1} etiqueta="Cobrado" edu={EDU_M.cobrado} tono="gana" sinDato={polar === 0}
      valor={polar === 0 ? 'Sin ventas' : <Cifra valor={polar} clave={`m-cob-${summary.range}-${polar}`} formato={n => pesos(Math.round(n))} />}
      sub={<>Polar, neto de comisión, en {palabraRango}{summary.coverage?.polar_last_day ? `, hasta el ${fechaCorta(summary.coverage.polar_last_day)}` : ''}{otros > 0 ? `. Además ${pesos(otros)} de depósitos de clientes` : ''}</>} />
    <Fila i={2} etiqueta="Gastado" edu={EDU_M.gastado} tono="pierde" sinDato={sinEstadosEnRango}
      valor={sinEstadosEnRango ? 'Sin estados' : <Cifra valor={summary.burn_range_mxn} clave={`m-gas-${summary.range}-${summary.burn_range_mxn}`} formato={n => pesos(Math.round(n))} />}
      chip={!sinEstadosEnRango && piso ? 'al menos' : undefined}
      sub={cortes.length ? <span className={h.cortes}><b>Al {fechaCorta(hoy)}:</b>{cortes.map(c => <span key={c.cuenta}>{c.nombre} {fechaCorta(c.fecha)}</span>)}</span> : 'Sin estados de cuenta cargados'} />
    <Fila i={3} etiqueta="Patrimonio" edu={EDU_M.patrimonio} tono={f.frescura === 'viejo' ? 'viejo' : undefined} sinDato={cierre?.liquid_mxn == null}
      valor={cierre?.liquid_mxn == null ? 'Sin foto' : <Cifra valor={cierre.liquid_mxn} clave={`m-pat-${cierre.id}`} formato={n => pesos(Math.round(n))} />}
      chip={cierre && f.frescura === 'viejo' ? 'foto vieja' : undefined}
      sub={cierre ? `Líquido, foto del ${fechaCorta(cierre.snapshot_date)} · ${hace(f.dias ?? diasEntre(cierre.snapshot_date, hoy))}` : 'Dicta tus saldos a Levy'} />
  </div>
}
