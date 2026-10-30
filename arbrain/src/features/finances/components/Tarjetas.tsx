'use client'
/**
 * Las tarjetas de Finanzas v2 (8 oct 2026), todas sobre `finanzas.module.css` y el lenguaje de movimiento común.
 * Cada una dice de dónde sale su número y de qué fecha es; lo viejo o estimado se pinta rayado, no más chico.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { Cifra, escalon, mov } from '@/shared/movimiento'
import { etiquetaDia } from '@/features/cabina/model'
import { accountColor, categoryColor, incomeColor } from '../lib/financeColors'
import { diasEntre, formatoRunway, mxn, proximosCobros, aMxn } from '../lib/finanzas'
import { clasificar, MESES_CORTO, nombreMes } from '../lib/granularidad'
import {
  agruparMovimientos, CIERRE_VIEJO, corteGastos, despuesDeLaFoto, diaDelCobro, fechaCorta, frescuraCierre, hace, mesAnterior,
  montoDe, nombreCategoria, nombreCuenta, nombreFuente, pesos, sinClasificar,
} from '../lib/modelo'
import { InfoTip } from './InfoTip'
import { Segmentado } from './Segmentado'
import type { FinanceAccount, FinanceMovement, FinanceRecurring, FinanceSnapshot, FinanceSummary, PostCloseEvent, SnapshotBalance } from '../types/finances'
import h from './finanzas.module.css'

export const EDU = {
  foto: 'La foto es la suma de los saldos de tus cuentas el día que se hizo el cierre. No se actualiza sola: cada movimiento posterior no está en ella.',
  liquido: 'Lo que tienes disponible ya: bancos, efectivo y crypto. No cuenta lo que te deben.',
  aguantas: 'Cuántos meses aguantarías con ese dinero si sigues gastando lo mismo cada mes. Es una estimación: junta el dinero de la foto con el gasto de los estados de cuenta.',
  sinClasificar: 'Gastos de los estados de cuenta que todavía no tienen una categoría clara. Entre más se clasifica, más claro ves en qué se va el dinero.',
  fijos: 'Suscripciones y pagos que se repiten (renta, nómina, software). Es tu gasto base: pasa cada mes, lo captures o no. Los anuales se reparten entre 12.',
  porCobrar: 'Dinero que te deben. Es tuyo, pero no lo puedes gastar hasta que te paguen.',
  completo: 'Cada casilla es un mes con el estado de cuenta (o las ventas de Polar) ya cargado. Las rayadas faltan: lo que salió o entró en ese mes es más de lo que se ve.',
} as const

const ESPERA = 'Cargando…'
export { ESPERA }

export function Tarjeta({ ceja, extra, i, children, className, id }: { ceja: ReactNode; extra?: ReactNode; i: number; children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`${h.tarjeta} ${mov.entra}${className ? ` ${className}` : ''}`} style={escalon(i)}>
    <header className={h.ceja}><span>{ceja}</span>{extra}</header>
    {children}
  </section>
}

export function Pliegue({ abierto, onAlternar, titulo, resumen, children, id }: { abierto: boolean; onAlternar: () => void; titulo: ReactNode; resumen?: ReactNode; children: ReactNode; id?: string }) {
  return <div className={h.pliegue} data-abierto={abierto || undefined}>
    <button className={h.pliegueBoton} onClick={onAlternar} aria-expanded={abierto} aria-controls={id}>
      <ChevronRight size={14} aria-hidden /><span>{titulo}</span>{resumen && <small>{resumen}</small>}
    </button>
    <div id={id} className={mov.pliega} data-plegada={!abierto || undefined} inert={!abierto}><div>{children}</div></div>
  </div>
}

function Hueco({ texto }: { texto: string }) { return <p className={`${h.hueco} ${mov.hueco}`}>{texto}</p> }

// ═══ Cobros fijos: la única casa ════════════════════════════════════════════════════════════════════════

/** El ritmo de los próximos 31 días: una barra por día, tan alta como lo que te cobran. */
function Ritmo({ proximos, hoy, fx }: { proximos: { r: FinanceRecurring; fecha: string }[]; hoy: string; fx: FinanceSummary['fx'] }) {
  const dias = 31
  const porDia = Array.from({ length: dias }, () => 0)
  for (const p of proximos) { const k = diasEntre(hoy, p.fecha); if (k >= 0 && k < dias) porDia[k] += aMxn(p.r.amount, p.r.currency, fx) }
  const max = Math.max(1, ...porDia)
  const [y, m, d0] = hoy.split('-').map(Number)
  return <div className={h.ritmo} role="img" aria-label={`Cobros de los próximos ${dias} días: ${proximos.length} en total`}>
    {porDia.map((v, k) => {
      const dt = new Date(Date.UTC(y, m - 1, d0 + k, 12)), dd = dt.getUTCDate()
      return <span key={k} className={h.ritmoDia} data-hoy={k === 0 || undefined} data-mes={dd === 1 || undefined} title={v ? `${fechaCorta(dt.toISOString().slice(0, 10))}: ${pesos(v)}` : undefined}>
        <i className={v ? mov.llena : undefined} style={{ height: v ? `${Math.max(12, Math.sqrt(v / max) * 100)}%` : undefined, ['--i' as string]: Math.min(k, 14) }} data-vacio={!v || undefined} />
        {(k === 0 || dd === 1 || dd === 15) && <em>{dd === 1 ? MESES_CORTO[dt.getUTCMonth()] : dd}</em>}
      </span>
    })}
  </div>
}

export function CobrosFijos({ recurring, accounts, summary, hoy, i, abierto, onAbrir, compacto }: {
  recurring: FinanceRecurring[]; accounts: FinanceAccount[]; summary: FinanceSummary; hoy: string; i: number; abierto: boolean; onAbrir: (a: boolean) => void; compacto?: boolean
}) {
  const activos = recurring.filter(r => r.is_active)
  const proximos = useMemo(() => proximosCobros(recurring, hoy, 31), [recurring, hoy])
  const total30 = proximos.reduce((n, x) => n + aMxn(x.r.amount, x.r.currency, summary.fx), 0)
  const nombre = new Map(accounts.map(a => [a.id, a.name]))
  const mensuales = activos.filter(r => r.periodicity === 'mensual').sort((a, b) => a.charge_day - b.charge_day)
  const anuales = activos.filter(r => r.periodicity === 'anual').sort((a, b) => (a.charge_month ?? 0) - (b.charge_month ?? 0) || a.charge_day - b.charge_day)
  if (!activos.length) return <Tarjeta i={i} ceja={<b>Cobros fijos</b>} id="cobros"><Hueco texto="Aún no hay cobros fijos cargados. Dile a Levy «carga mis suscripciones» y dicta nombre, monto, día y cuenta." /></Tarjeta>
  const sig = proximos.slice(0, compacto ? 1 : 3)
  const Fila = ({ r, fecha }: { r: FinanceRecurring; fecha?: string }) => {
    const cuenta = r.account_name ?? (r.account_id ? nombre.get(r.account_id) : null)
    const n = fecha ? diasEntre(hoy, fecha) : null
    return <li className={h.cobro}>
      <span className={h.cobroDia} data-pronto={n != null && n <= 3 || undefined}>
        {fecha ? <><small>{etiquetaDia(fecha, { weekday: 'short' }).replace('.', '')}</small><b>{Number(fecha.slice(8))}</b></> : <b>{diaDelCobro(r).replace('día ', '')}</b>}
      </span>
      <span className={h.cobroNombre}>
        <span>{r.name}</span>
        <small>{n != null ? `${n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`} · ` : ''}{cuenta ? <><i aria-hidden style={{ backgroundColor: accountColor(cuenta) }} />{nombreCuenta(cuenta)}</> : 'sin cuenta'}</small>
      </span>
      <span className={h.cobroMonto}>{montoDe(r.amount, r.currency)}</span>
    </li>
  }
  return <Tarjeta i={i} id="cobros" ceja={<><b>Cobros fijos</b><InfoTip text={EDU.fijos} label="Qué son los cobros fijos" /></>} extra={<small className={h.ayuda}>{mxn(summary.recurring_monthly_mxn)} al mes · {activos.length} activos</small>}>
    {proximos.length === 0 ? <Hueco texto="Nada se cobra en los próximos 31 días." /> : <>
      <p className={h.resumenCobros}>En los próximos 31 días te cobran <b><Cifra valor={total30} clave={`cobros-${hoy}`} formato={n => pesos(Math.round(n))} /></b> en {proximos.length} {proximos.length === 1 ? 'cobro' : 'cobros'}.</p>
      {!compacto && <Ritmo proximos={proximos} hoy={hoy} fx={summary.fx} />}
      <ul className={h.cobros}>{sig.map(x => <Fila key={x.r.id} r={x.r} fecha={x.fecha} />)}</ul>
    </>}
    {!compacto && <Pliegue id="todos-los-cobros" abierto={abierto} onAlternar={() => onAbrir(!abierto)} titulo={`Todos los cobros fijos (${activos.length})`} resumen="mensuales y anuales">
      <div className={h.dosColumnas}>
        <div><p className={h.subtitulo}>Mensuales · {mensuales.length}</p><ul className={h.cobros}>{mensuales.map(r => <Fila key={r.id} r={r} />)}</ul></div>
        <div><p className={h.subtitulo}>Anuales · {anuales.length}</p>{anuales.length ? <ul className={h.cobros}>{anuales.map(r => <Fila key={r.id} r={r} />)}</ul> : <p className={h.nota}>Sin cobros anuales.</p>}</div>
      </div>
      <p className={h.nota}>Para dar de alta, baja o cambiar un monto, díselo a Levy.</p>
    </Pliegue>}
  </Tarjeta>
}

// ═══ En qué se va / de dónde entra ══════════════════════════════════════════════════════════════════════

export function EnQueSeVa({ summary, i, palabraRango, extraEntra }: { summary: FinanceSummary; i: number; palabraRango: string; extraEntra?: ReactNode }) {
  const [lado, setLado] = useState<'sale' | 'entra'>('sale')
  const items = (lado === 'sale' ? summary.burn_by_category : summary.income_by_source).filter(c => c.total_mxn > 0)
  const total = items.reduce((n, c) => n + c.total_mxn, 0)
  const max = Math.max(1, ...items.map(c => c.total_mxn))
  const estados = (summary.aggregates ?? []).filter(a => a.source === 'estado-de-cuenta' && a.type === 'gasto').length
  const sinClas = items.find(c => sinClasificar(c.category) && lado === 'sale')
  return <Tarjeta i={i} id="en-que-se-va" ceja={<b>{lado === 'sale' ? 'En qué se va' : 'De dónde entra'}</b>} extra={<Segmentado chico etiqueta="Gastos o ingresos" valor={lado} onChange={setLado} opciones={[{ id: 'sale', label: 'Sale' }, { id: 'entra', label: 'Entra' }]} />}>
    <div key={`${lado}-${summary.range}`}>
      {!items.length ? <Hueco texto={lado === 'sale' ? `Sin gastos cargados en ${palabraRango}. Los gastos llegan con el estado de cuenta de cada banco.` : `Sin ingresos en ${palabraRango}.`} />
        : <ul className={h.barras}>
          {items.map((c, k) => {
            const sc = lado === 'sale' && sinClasificar(c.category), color = lado === 'sale' ? categoryColor(c.category) : incomeColor(c.category)
            return <li key={c.category} className={mov.entra} style={escalon(k)}>
              <div className={h.barraTexto}>
                <span>{lado === 'sale' ? nombreCategoria(c.category) : nombreFuente(c.category)}{sc && <InfoTip text={EDU.sinClasificar} label="Qué es sin clasificar" />}</span>
                <span><b>{mxn(c.total_mxn)}</b><small>{Math.round((c.total_mxn / total) * 100)}%</small></span>
              </div>
              <div className={h.barraPista}><i className={`${mov.llena}${sc ? ` ${mov.hueco}` : ''}`} style={{ width: `${Math.max(3, (c.total_mxn / max) * 100)}%`, ['--i' as string]: Math.min(k, 14), backgroundColor: sc ? undefined : color }} /></div>
            </li>
          })}
        </ul>}
    </div>
    <p className={h.fuente}>
      {lado === 'sale'
        ? <>{estados ? `Suma ${estados} ${estados === 1 ? 'total' : 'totales'} de estado de cuenta con corte en ${palabraRango}: cada uno es de un mes completo.` : `Del rango: ${palabraRango}.`}{sinClas && total > 0 ? ` ${Math.round((sinClas.total_mxn / total) * 100)}% está sin clasificar.` : ''}</>
        : <>Entradas registradas en {palabraRango}. Lo de Polar entra en dólares y aquí se ve en pesos al tipo de cambio de hoy ({summary.fx.usd_mxn} MXN por USD).</>}
    </p>
    {lado === 'entra' && extraEntra}
  </Tarjeta>
}

// ═══ Lo que tienes: la foto del último cierre ═══════════════════════════════════════════════════════════

function Saldos({ balances, accounts, despues }: { balances: SnapshotBalance[]; accounts: FinanceAccount[]; despues: Map<string, PostCloseEvent[]> }) {
  const tipo = new Map(accounts.map(a => [a.name, a.kind]))
  const liquidas = balances.filter(b => tipo.get(b.account) !== 'por_cobrar')
  const porCobrar = balances.filter(b => tipo.get(b.account) === 'por_cobrar')
  const Fila = ({ b }: { b: SnapshotBalance }) => {
    const ev = (despues.get(b.account) ?? []).filter(e => e.type === 'pago_deuda' || e.type === 'prestamo')
    const liquidada = ev.find(e => e.type === 'pago_deuda' && e.account === b.account)
    return <li className={h.saldo} data-cambio={ev.length ? true : undefined}>
      <i aria-hidden style={{ backgroundColor: accountColor(b.account) }} />
      <span className={h.saldoNombre}>{nombreCuenta(b.account)}</span>
      <span className={h.saldoMonto} data-tachado={liquidada ? true : undefined}>{montoDe(b.balance, b.currency)}</span>
      {ev.length > 0 && <small className={h.saldoNota}>{ev.map(e => e.type === 'pago_deuda' ? `${e.account === b.account ? 'Liquidó' : 'Recibió'} ${montoDe(e.amount, e.currency)} el ${fechaCorta(e.date)}` : `Préstamo de ${montoDe(e.amount, e.currency)} el ${fechaCorta(e.date)}`).join(' · ')}: es posterior a esta foto.</small>}
    </li>
  }
  return <div className={h.saldos}>
    <ul>{liquidas.map(b => <Fila key={b.account} b={b} />)}</ul>
    {porCobrar.length > 0 && <>
      <p className={h.subtitulo}>Por cobrar, no líquido <InfoTip text={EDU.porCobrar} label="Qué es por cobrar" /></p>
      <ul>{porCobrar.map(b => <Fila key={b.account} b={b} />)}</ul>
    </>}
  </div>
}

export function FotosDeSaldos({ cierre, snapshots, accounts, summary, hoy, palabraRango, onLevy, abierto, onAlternar }: {
  cierre: FinanceSnapshot | null; snapshots: FinanceSnapshot[]; accounts: FinanceAccount[]; summary: FinanceSummary; hoy: string; palabraRango: string; onLevy: () => void; abierto: boolean; onAlternar: () => void
}) {
  const [verCuentas, setVerCuentas] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(false)
  if (!cierre) return <Pliegue id="fotos" abierto={abierto} onAlternar={onAlternar} titulo={<b>Fotos de saldos</b>} resumen="ninguna todavía">
    <Hueco texto="Todavía no hay una foto de tus saldos. Dile a Levy «hagamos el cierre del mes» y dicta cuánto hay en cada cuenta." />
  </Pliegue>
  const f = frescuraCierre(cierre, hoy), viejo = f.frescura === 'viejo'
  const runway = formatoRunway(summary.runway_months)
  const corte = corteGastos(summary.coverage, hoy)
  const parcial = corte.porCuenta.some(c => !c.alDia)
  const despues = despuesDeLaFoto(summary.post_close)
  const anteriores = [...snapshots].filter(s => s.id !== cierre.id).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date)).slice(0, 5)
  return <Pliegue id="fotos" abierto={abierto} onAlternar={onAlternar} titulo={<b>Fotos de saldos</b>} resumen={`última: ${fechaCorta(cierre.snapshot_date)} · ${hace(f.dias ?? 0)}`}>
    <div className={h.fotoCifras} data-viejo={viejo || undefined}>
      <div>
        <p className={h.fotoEtiqueta}>Líquido de esa foto <InfoTip text={EDU.liquido} label="Qué es líquido" /></p>
        <p className={h.fotoCifra}>{cierre.liquid_mxn != null ? pesos(cierre.liquid_mxn) : 'Sin dato'}</p>
        <small>{cierre.liquid_usd != null ? `US$${cierre.liquid_usd.toLocaleString('es-MX')} · ` : ''}con lo que te deben, {cierre.net_worth_mxn != null ? pesos(cierre.net_worth_mxn) : '—'}</small>
      </div>
      <div>
        <p className={h.fotoEtiqueta}>Cuánto aguantarías <InfoTip text={EDU.aguantas} label="Qué es cuánto aguantas" /></p>
        <p className={h.fotoCifra} data-estimado>{runway ?? 'Sin dato'}<em>estimado</em></p>
        <small>{summary.monthly_burn_mxn > 0 ? `con ${mxn(summary.monthly_burn_mxn)} de gasto al mes (promedio de ${palabraRango}${parcial ? ', con estados de cuenta faltantes' : ''}). Cambia mucho de un rango a otro: no es una medición.` : 'sin gasto en el rango'}</small>
      </div>
    </div>
    {viejo && <p className={h.avisoFoto}>Esto es lo que había el {fechaCorta(cierre.snapshot_date)}. Después hubo {summary.post_close?.length ? `${summary.post_close.length} ${summary.post_close.length === 1 ? 'movimiento que cambia' : 'movimientos que cambian'} saldos y ` : ''}meses de gastos e ingresos que la foto no conoce.
      <button className={h.enlace} onClick={onLevy}><MessageCircle size={12} aria-hidden /> Ponerla al día con Levy</button></p>}
    <Pliegue id="cuentas-foto" abierto={verCuentas} onAlternar={() => setVerCuentas(v => !v)} titulo="Cuentas de esa foto" resumen={`${cierre.balances.length} cuentas`}>
      <Saldos balances={cierre.balances} accounts={accounts} despues={despues} />
    </Pliegue>
    {anteriores.length > 0 && <Pliegue id="fotos-anteriores" abierto={verAnteriores} onAlternar={() => setVerAnteriores(v => !v)} titulo="Fotos anteriores" resumen={String(anteriores.length)}>
      <ul className={h.fotos}>{anteriores.map(s => <li key={s.id}>
        <span>{fechaCorta(s.snapshot_date, true)}</span>
        <span>{s.liquid_mxn != null ? pesos(s.liquid_mxn) : '—'} líquido{s.notes && <small>{s.notes}</small>}</span>
        {s.delta_liquid_mxn != null && <b data-signo={s.delta_liquid_mxn >= 0 ? '+' : '-'}>{s.delta_liquid_mxn >= 0 ? '+' : '−'}{pesos(Math.abs(s.delta_liquid_mxn))}</b>}
      </li>)}</ul>
    </Pliegue>}
  </Pliegue>
}

// ═══ Movimientos: agrupados, detrás de un pliegue ═══════════════════════════════════════════════════════

export function Movimientos({ movements, fx, abierto, onAlternar, palabraRango }: {
  movements: FinanceMovement[]; fx: FinanceSummary['fx']; abierto: boolean; onAlternar: () => void; palabraRango: string
}) {
  const [tantos, setTantos] = useState(14)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const grupos = useMemo(() => agruparMovimientos(movements, (a, m) => aMxn(a, m, fx), clasificar), [movements, fx])
  const visibles = grupos.slice(0, tantos)
  const alternar = (k: string) => setExpandido(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return <>
    <Pliegue id="movimientos" abierto={abierto} onAlternar={onAlternar} titulo={<b>Movimientos</b>} resumen={`${movements.length} en ${palabraRango}${grupos.length !== movements.length ? ` · ${grupos.length} renglones` : ''}`}>
      {!grupos.length ? <Hueco texto="Sin movimientos en este rango." /> : <ul className={h.movs}>
        {visibles.map((g, k) => <li key={g.clave}>
          {(k === 0 || visibles[k - 1].mes !== g.mes) && <p className={h.mesCabeza}>{nombreMes(g.mes, true)}</p>}
          <div className={h.mov} data-tipo={g.tipo}>
            <span className={h.movFecha}>{fechaCorta(g.fecha)}</span>
            <span className={h.movTexto}>
              <span>{g.titulo}{g.mesCompleto && <em className={mov.hueco}>total del mes</em>}</span>
              {g.detalle && <small>{g.detalle}</small>}
              {g.items.length > 1 && <button className={h.enlace} onClick={() => alternar(g.clave)} aria-expanded={expandido.has(g.clave)}>{expandido.has(g.clave) ? 'Ocultar' : g.desglose ?? 'Ver el desglose'}</button>}
            </span>
            <span className={h.movMonto}>
              {g.tipo === 'mueve' ? montoDe(g.cantidad, g.moneda) : <>{g.monto >= 0 ? '+' : '−'}{pesos(Math.abs(g.monto))}</>}
              {g.usd > 0 && <small>US${g.usd.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</small>}
            </span>
          </div>
          {expandido.has(g.clave) && <ul className={h.dias}>{g.items.map((it, n) => <li key={n} data-signo={it.monto < 0 ? '-' : '+'}><span>{fechaCorta(it.fecha)}</span><span>{it.texto}</span><b>{it.monto < 0 ? '−' : '+'}{pesos(Math.abs(it.monto))}{it.usd > 0 && <small> US${it.usd.toFixed(2)}</small>}</b></li>)}</ul>}
        </li>)}
      </ul>}
      {grupos.length > tantos && <button className={h.enlace} onClick={() => setTantos(t => t + 14)}>Ver {Math.min(14, grupos.length - tantos)} más</button>}
    </Pliegue>
  </>
}

// ═══ Qué tan completo está ══════════════════════════════════════════════════════════════════════════════

export function Cobertura({ summary, accounts, hoy, abierto, onAlternar }: { summary: FinanceSummary; accounts: FinanceAccount[]; hoy: string; abierto: boolean; onAlternar: () => void }) {
  const cov = summary.coverage
  if (!cov) return null
  const meses: string[] = []
  for (let ym = hoy.slice(0, 7), k = 0; k < 12; ym = mesAnterior(ym), k++) meses.unshift(ym)
  const filas = [
    ...cov.statements.map(s => ({ nombre: nombreCuenta(s.account), tiene: new Set(s.periods), detalle: s.last_date ? `hasta el ${fechaCorta(s.last_date)}` : '' })),
    { nombre: 'Ventas de Polar', tiene: new Set(cov.polar_months), detalle: cov.polar_last_day ? `hasta el ${fechaCorta(cov.polar_last_day)}` : '' },
  ]
  const norm = (n: string) => n.replace(/-/g, '').toLowerCase()
  const conEstado = new Set(cov.statements.map(s => norm(s.account)))
  const sinEstado = accounts.filter(a => a.is_active && ['banco', 'credito', 'wallet'].includes(a.kind) && !conEstado.has(norm(a.name))).map(a => nombreCuenta(a.name))
  const total = filas.reduce((n, f) => n + meses.filter(m => f.tiene.has(m)).length, 0), posible = filas.length * meses.length
  return <>
    <Pliegue id="cobertura" abierto={abierto} onAlternar={onAlternar} titulo={<b>Qué tan completo está</b>} resumen={`${total} de ${posible} casillas`}>
      <p className={h.fuente} style={{ marginTop: 0 }}>Cada casilla es un mes con su estado de cuenta (o sus ventas) cargado. <InfoTip text={EDU.completo} label="Cómo leer esto" /></p>
      <div className={h.matriz} style={{ ['--m' as string]: meses.length }}>
        <span aria-hidden />
        {meses.map(m => <span key={m} className={h.matrizMes} data-ahora={m === hoy.slice(0, 7) || undefined}>{MESES_CORTO[Number(m.slice(5)) - 1][0]}</span>)}
        {filas.map(f => <div key={f.nombre} className={h.matrizFila}>
          <span className={h.matrizNombre}>{f.nombre}<small>{f.detalle}</small></span>
          {meses.map((m, k) => {
            const si = f.tiene.has(m), ahora = m === hoy.slice(0, 7)
            return <i key={m} className={`${si ? mov.llena : mov.hueco} ${h.celda}`} data-si={si || undefined} data-ahora={ahora || undefined} style={{ ['--i' as string]: k }} title={`${nombreMes(m, true)}: ${si ? 'cargado' : ahora ? 'mes en curso' : 'falta'}`} />
          })}
        </div>)}
      </div>
      <p className={h.nota}>Polar empieza en enero de 2026; antes de eso el dinero entraba por Skool y está como depósitos del banco.</p>
      {sinEstado.length > 0 && <p className={h.nota}>Cuentas activas sin ningún estado de cuenta cargado: {sinEstado.join(', ')}.</p>}
    </Pliegue>
  </>
}
