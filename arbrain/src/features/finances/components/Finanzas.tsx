'use client'
/**
 * Finanzas v3 (8 oct 2026). UNA pieza para la sección (/finanzas), el panel derecho y la tarjeta del hilo.
 *
 * Daniel vio la v2 en la app y firmó otra estructura: «yo al principio debería ver las métricas principales»; «la gráfica de
 * barras está bonita, la de por mes»; «no sé por qué quitaste lo del MRR». La v2 se había diseñado alrededor de los huecos
 * de datos y sacaba un veredicto del dato más dudoso. Ahora, de arriba abajo:
 *  1. Métricas principales, en filas como un estado de cuenta: MRR (con su cambio), Cobrado, Gastado (con su corte a la vista) y Patrimonio (con su fecha).
 *     Todo responde al rango 30D/3M/6M/12M. Las advertencias acompañan al número, no lo sustituyen.
 *  2. «Cosas por completar»: una línea discreta que se despliega.
 *  3. Una gráfica con tres lecturas: por mes (default, barras), por día (solo lo que tiene fecha real) y acumulado.
 *  4. Cobros fijos, una sola casa. 5. En qué se va / de dónde entra.
 *  6. Plegado: movimientos, fotos de saldos y qué tan completo está.
 * Regla de evidencia: lo que no se registró no es cero, un mes al que le falta un estado de cuenta es un piso, y los dólares
 * de Polar se ven en pesos al tipo de cambio de hoy (se dice). El cálculo vive en la API y en `lib/modelo.ts`.
 */
import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, RefreshCw, Wallet } from 'lucide-react'
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { mov } from '@/shared/movimiento'
import { useFuente, releer } from '@/features/cabina/datos'
import { hoyCivil } from '@/features/cabina/model'
import { RANGOS, urlFinanzas, ultimoCierre, mxn } from '../lib/finanzas'
import { POLAR_EXACTO_DESDE } from '../lib/granularidad'
import { corteGastos, diasGrafica, mesesDelRango, mesesGrafica, pendientes, pesos } from '../lib/modelo'
import { Segmentado } from './Segmentado'
import { GraficaDinero, type ModoGrafica } from './GraficaDinero'
import { Metricas } from './Metricas'
import { Cobertura, CobrosFijos, EnQueSeVa, FotosDeSaldos, Movimientos, Pliegue } from './Tarjetas'
import type { FinanceRange, FinancesPayload } from '../types/finances'
import h from './finanzas.module.css'
import { capital, NOMBRE_DUENO, NOMBRE_SEGUNDA } from '@/config'

export type DondeFinanzas = 'seccion' | 'panel' | 'hilo'

/** La lectura compartida: misma caché que el resto de la Cabina, así una pluma de Levy refresca panel y sección. */
export function useFinanzas(rango: FinanceRange) {
  const url = urlFinanzas(rango)
  const lectura = useFuente<FinancesPayload>(url)
  return { ...lectura, refrescar: () => void releer(url) }
}

const hablarConLevy = (texto: string) => window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto } }))

export function Finanzas({ donde, rango: rangoInicial = '30d', ver }: { donde: DondeFinanzas; rango?: FinanceRange; ver?: 'cobros' }) {
  const [rango, setRangoLocal] = useState<FinanceRange>(rangoInicial)
  // En la sección el rango vive también en la URL (?rango=3m): recargar o compartir conserva la vista.
  const setRango = (r: FinanceRange) => {
    setRangoLocal(r)
    if (donde === 'seccion') { const u = new URL(window.location.href); if (r === '30d') u.searchParams.delete('rango'); else u.searchParams.set('rango', r); window.history.replaceState(null, '', u) }
  }
  const [modo, setModo] = useState<ModoGrafica>('mes')
  const [cobrosAbiertos, setCobrosAbiertos] = useState(ver === 'cobros')
  const [verMovs, setVerMovs] = useState(false)
  const [verFotos, setVerFotos] = useState(false)
  const [verCobertura, setVerCobertura] = useState(false)
  const [verPend, setVerPend] = useState(false)
  const { data, error, cargando, refrescar, leidoEn } = useFinanzas(donde === 'hilo' ? '30d' : rango)
  const hoy = hoyCivil()

  // /finanzas/cobros redirige aquí con ?ver=cobros: el pliegue ya viene abierto; se lleva al lector hasta él.
  useEffect(() => {
    if (ver !== 'cobros' || !data) return
    const t = setTimeout(() => document.getElementById('cobros')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 350)
    return () => clearTimeout(t)
  }, [ver, !!data])

  const derivado = useMemo(() => {
    if (!data) return null
    const { summary, snapshots } = data
    const cierre = ultimoCierre(snapshots)
    const dias = diasGrafica(summary)
    const meses = mesesGrafica(summary.months ?? [], summary.coverage, hoy, mesesDelRango(summary.days))
    return { cierre, dias, meses, pend: pendientes(data, hoy, cierre), corte: corteGastos(summary.coverage, hoy) }
  }, [data, hoy])

  const acciones = <>
    <Segmentado etiqueta="Rango" valor={rango} onChange={setRango} opciones={RANGOS.map(r => ({ id: r.id, label: r.label, title: r.word }))} />
    <button onClick={refrescar} className={h.icono} title="Refrescar" aria-label="Refrescar finanzas"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /></button>
  </>

  if (!data || !derivado) {
    if (error) return <div className={h.finanzas}><div className={h.falla}>
      <Wallet size={26} aria-hidden /><p>No se pudieron leer las finanzas: {error}</p>
      <button onClick={refrescar} className={h.boton}><RefreshCw size={13} aria-hidden /> Reintentar</button>
    </div></div>
    return <div className={h.finanzas} aria-busy="true"><div className={h.cargando}><div /><div /><div /></div></div>
  }

  const { summary, movements, accounts, recurring, snapshots } = data
  const { cierre, dias, meses, pend, corte } = derivado
  const modoVisible = modo
  const palabraRango = RANGOS.find(r => r.id === summary.range)?.word ?? `${summary.days} días`
  const sinNada = modoVisible === 'mes' ? meses.every(m => m.sinDatos) : !dias.some(d => d.entro || d.salio) && !(summary.aggregates ?? []).length
  const hora = leidoEn ? new Date(leidoEn).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }) : null
  const levy = () => hablarConLevy('Revisa mis finanzas: qué le falta a la vista de Finanzas para estar completa y qué me tienes que preguntar. Empieza por lo que más cambia mis números.')

  // El hilo: las métricas y lo que viene. Lo demás vive en el panel y en la sección.
  if (donde === 'hilo') return <div className={h.finanzas}>
    <Metricas summary={summary} cierre={cierre} hoy={hoy} palabraRango={palabraRango} />
    <CobrosFijos recurring={recurring} accounts={accounts} summary={summary} hoy={hoy} i={6} abierto={false} onAbrir={() => {}} compacto />
  </div>

  return <div className={h.finanzas}>
    {donde === 'seccion'
      ? <SeccionCabecera ceja={<>Finanzas · <b>{capital(NOMBRE_DUENO())} y {NOMBRE_SEGUNDA()}</b></>} titulo="Cómo va el dinero" descripcion="Lo que entra y lo que sale, de dónde viene cada número y de qué fecha es." acciones={acciones} />
      : <div className={h.barra}>{acciones}</div>}
    {error && <p className={h.avisoFoto}>{error} Se muestra la última lectura.</p>}

    <Metricas summary={summary} cierre={cierre} hoy={hoy} palabraRango={palabraRango} />
    {pend.length > 0 && <div className={`${h.pend} ${mov.aparece}`}>
      <Pliegue id="pendientes" abierto={verPend} onAlternar={() => setVerPend(v => !v)} titulo={<span className={h.pendTitulo}><i className={h.pendPunto} aria-hidden />{pend.length} {pend.length === 1 ? 'cosa por completar' : 'cosas por completar'}</span>}>
        <ul className={h.pendLista}>{pend.map(p => <li key={p.clave}>{p.texto}</li>)}</ul>
        <button className={h.enlace} onClick={levy}><MessageCircle size={12} aria-hidden /> Hablar con Levy</button>
      </Pliegue>
    </div>}

    <div className={h.rejilla}>
      <div className={h.columna}>
        <div className={h.o1}>
          <GraficaDinero dias={dias} meses={meses} modo={modoVisible} onModo={setModo} clave={`${summary.range}`} palabraRango={palabraRango}
            gastosHasta={corte.hasta} cuentaAtrasada={corte.cuentaAtrasada} exactoDesde={summary.coverage?.polar_exact_from ?? POLAR_EXACTO_DESDE} hoy={hoy} vacio={sinNada} />
        </div>
        <div className={h.o3}><EnQueSeVa summary={summary} i={5} palabraRango={palabraRango} /></div>
      </div>
      <div className={h.columna}>
        <div className={h.o2}><CobrosFijos recurring={recurring} accounts={accounts} summary={summary} hoy={hoy} i={4} abierto={cobrosAbiertos} onAbrir={setCobrosAbiertos} /></div>
        <div className={h.o4}>
          <section className={`${h.tarjeta} ${h.detalle} ${mov.entra}`} style={{ ['--i' as string]: 6 }} aria-label="Más detalle">
            <Movimientos movements={movements} fx={summary.fx} abierto={verMovs} onAlternar={() => setVerMovs(v => !v)} palabraRango={palabraRango} />
            <FotosDeSaldos cierre={cierre} snapshots={snapshots} accounts={accounts} summary={summary} hoy={hoy} palabraRango={palabraRango} onLevy={levy} abierto={verFotos} onAlternar={() => setVerFotos(v => !v)} />
            <Cobertura summary={summary} accounts={accounts} hoy={hoy} abierto={verCobertura} onAlternar={() => setVerCobertura(v => !v)} />
          </section>
        </div>
      </div>
    </div>

    <footer className={h.pie}>
      <span>{hora ? `Leído a las ${hora} · ` : ''}Dólares en pesos al tipo de cambio de hoy: {summary.fx.usd_mxn} MXN por USD{summary.fx_stale && <span className={h.pieEstado}> (de respaldo, no vivo)</span>}</span>
    </footer>
  </div>
}

/** Una línea para la vista colapsada del hilo: lo cobrado y lo gastado del último mes, con su fecha. */
export function resumenFinanzas(d: FinancesPayload | undefined) {
  if (!d) return null
  const polar = d.summary.income_by_source.find(c => c.category === 'Polar')?.total_mxn ?? 0
  return `cobrado ${pesos(polar)} en ${d.summary.days} días · cobros fijos ${mxn(d.summary.recurring_monthly_mxn)} al mes`
}
