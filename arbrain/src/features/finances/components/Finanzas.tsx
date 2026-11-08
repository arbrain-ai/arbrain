'use client'
/**
 * Finanzas, el espejo (6 nov 2026). UNA pieza para la sección (/finanzas), el panel derecho y la tarjeta del hilo.
 *
 * Daniel: «solo quiero ver lo que tengo, quiero que sea un espejo», «así como pusiste la línea verde, quiero ver la línea roja»,
 * «quiero ver algo profesional», «dos vistas: una acumulado y otra los días que recibí y gasté». De arriba abajo:
 *  1. El espejo, una tarjeta: tres cifras (lo que tienes, lo que entró y lo que salió) y la gráfica a todo el ancho con dos
 *     vistas, acumulado (default) y por día. Abajo, en una línea discreta, hasta qué fecha hay estados de cuenta.
 *  2. En qué se va, cobros fijos y el detalle plegado (lo que falta por completar, movimientos, fotos de saldos, cobertura).
 * El rango por default es «Todo» en la sección y en el panel; el hilo lee 30 días. Lo que no se registró no es cero, y los
 * dólares se ven en pesos de su día. El cálculo vive en la API, `lib/espejo.ts` y `lib/modelo.ts`.
 */
import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, RefreshCw, Wallet } from 'lucide-react'
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { mov } from '@/shared/movimiento'
import { useFuente, releer } from '@/features/cabina/datos'
import { hoyCivil } from '@/features/cabina/model'
import { RANGOS, urlFinanzas, ultimoCierre, mxn } from '../lib/finanzas'
import { diasGrafica, pendientes, pesos } from '../lib/modelo'
import { lineaCobertura, periodo, serieAcumulada, totalesDe } from '../lib/espejo'
import { Segmentado } from './Segmentado'
import { GraficaDinero, type ModoGrafica } from './GraficaDinero'
import { Cifras } from './Cifras'
import { Metricas } from './Metricas'
import { Cobertura, CobrosFijos, EnQueSeVa, FotosDeSaldos, Movimientos, Pliegue } from './Tarjetas'
import type { FinanceRange, FinancesPayload } from '../types/finances'
import h from './finanzas.module.css'
import { capital, NOMBRE_DUENO, NOMBRE_SEGUNDA } from '@/config'

export type DondeFinanzas = 'seccion' | 'panel' | 'hilo'

/** El rango con el que abre Finanzas en la sección y en el panel: toda la historia (6 nov 2026). */
export const RANGO_INICIAL: FinanceRange = 'todo'

/** La lectura compartida: misma caché que el resto de la Cabina, así una pluma de Levy refresca panel y sección. */
export function useFinanzas(rango: FinanceRange) {
  const url = urlFinanzas(rango)
  const lectura = useFuente<FinancesPayload>(url)
  return { ...lectura, refrescar: () => void releer(url) }
}

const hablarConLevy = (texto: string) => window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto } }))

export function Finanzas({ donde, rango: rangoInicial = RANGO_INICIAL, ver }: { donde: DondeFinanzas; rango?: FinanceRange; ver?: 'cobros' }) {
  const [rango, setRangoLocal] = useState<FinanceRange>(rangoInicial)
  // En la sección el rango vive también en la URL (?rango=3m): recargar o compartir conserva la vista.
  const setRango = (r: FinanceRange) => {
    setRangoLocal(r)
    if (donde === 'seccion') { const u = new URL(window.location.href); if (r === RANGO_INICIAL) u.searchParams.delete('rango'); else u.searchParams.set('rango', r); window.history.replaceState(null, '', u) }
  }
  const { data, error, cargando, refrescar, leidoEn } = useFinanzas(donde === 'hilo' ? '30d' : rango)

  // /finanzas/cobros redirige aquí con ?ver=cobros: el pliegue ya viene abierto; se lleva al lector hasta él.
  useEffect(() => {
    if (ver !== 'cobros' || !data) return
    const t = setTimeout(() => document.getElementById('cobros')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 350)
    return () => clearTimeout(t)
  }, [ver, !!data])

  const acciones = <>
    <Segmentado etiqueta="Rango" valor={rango} onChange={setRango} opciones={RANGOS.map(r => ({ id: r.id, label: r.label, title: r.word }))} />
    <button onClick={refrescar} className={h.icono} title="Refrescar" aria-label="Refrescar finanzas"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /></button>
  </>

  if (!data) {
    if (error) return <div className={h.finanzas}><div className={h.falla}>
      <Wallet size={26} aria-hidden /><p>No se pudieron leer las finanzas: {error}</p>
      <button onClick={refrescar} className={h.boton}><RefreshCw size={13} aria-hidden /> Reintentar</button>
    </div></div>
    return <div className={h.finanzas} aria-busy="true"><div className={h.cargando}><div /><div /><div /></div></div>
  }
  return <VistaFinanzas data={data} donde={donde} acciones={acciones} error={error} leidoEn={leidoEn} hoy={hoyCivil()} cobrosAbiertosAlInicio={ver === 'cobros'} />
}

/** Lo que pinta Finanzas con una lectura ya hecha. Aparte para poder probar lo que se ve sin red. */
export function VistaFinanzas({ data, donde, acciones, error, leidoEn, hoy, cobrosAbiertosAlInicio = false, modoInicial = 'acum' }: {
  data: FinancesPayload; donde: DondeFinanzas; acciones?: React.ReactNode; error?: string; leidoEn?: number; hoy: string
  cobrosAbiertosAlInicio?: boolean; modoInicial?: ModoGrafica
}) {
  const [modo, setModo] = useState<ModoGrafica>(modoInicial)
  const [cobrosAbiertos, setCobrosAbiertos] = useState(cobrosAbiertosAlInicio)
  const [verMovs, setVerMovs] = useState(false)
  const [verFotos, setVerFotos] = useState(false)
  const [verCobertura, setVerCobertura] = useState(false)
  const [verPend, setVerPend] = useState(false)

  const { summary, movements, accounts, recurring, snapshots } = data
  const cierre = useMemo(() => ultimoCierre(snapshots), [snapshots])
  const dias = useMemo(() => diasGrafica(summary), [summary])
  const serie = useMemo(() => serieAcumulada(dias, summary.months, summary.range === 'todo'), [dias, summary])
  const totales = totalesDe(serie)
  const pend = useMemo(() => pendientes(data, hoy, cierre), [data, hoy, cierre])
  const palabraRango = RANGOS.find(r => r.id === summary.range)?.word ?? `${summary.days} días`
  const hora = leidoEn ? new Date(leidoEn).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }) : null
  const levy = () => hablarConLevy('Revisa mis finanzas: qué le falta a la vista de Finanzas para estar completa y qué me tienes que preguntar. Empieza por lo que más cambia mis números.')

  // El hilo: las métricas y lo que viene. Lo demás vive en el panel y en la sección.
  if (donde === 'hilo') return <div className={h.finanzas}>
    <Metricas summary={summary} cierre={cierre} hoy={hoy} palabraRango={palabraRango} />
    <CobrosFijos recurring={recurring} accounts={accounts} summary={summary} hoy={hoy} i={6} abierto={false} onAbrir={() => {}} compacto />
  </div>

  const cobertura = lineaCobertura(summary.coverage, hoy)
  return <div className={h.finanzas}>
    {donde === 'seccion'
      ? <SeccionCabecera ceja={<>Finanzas · <b>{capital(NOMBRE_DUENO())} y {NOMBRE_SEGUNDA()}</b></>} titulo="Cómo va el dinero" descripcion="Lo que tienes, lo que entró y lo que salió." acciones={acciones} />
      : acciones && <div className={h.barra}>{acciones}</div>}
    {error && <p className={h.avisoFoto}>{error} Se muestra la última lectura.</p>}

    <section className={`${h.espejo} ${mov.entra}`} aria-label="Lo que tienes, lo que entró y lo que salió">
      <Cifras tienes={data.tienes} entro={totales.entro} salio={totales.salio} hoy={hoy} clave={summary.range} />
      <GraficaDinero dias={dias} serie={serie} movements={movements} fx={summary.fx} modo={modo} onModo={setModo} clave={summary.range} hoy={hoy} periodo={periodo(summary.desde, hoy)} />
      {cobertura && <p className={h.cobertura}>{cobertura.titulo} {cobertura.cortes.map((c, k) => <span key={c}>{k > 0 && ' · '}<span className={h.corte}>{c}</span></span>)}</p>}
    </section>

    <div className={h.rejilla}>
      <div className={h.columna}>
        <div className={h.o1}><EnQueSeVa summary={summary} i={3} palabraRango={palabraRango} /></div>
      </div>
      <div className={h.columna}>
        <div className={h.o2}><CobrosFijos recurring={recurring} accounts={accounts} summary={summary} hoy={hoy} i={4} abierto={cobrosAbiertos} onAbrir={setCobrosAbiertos} /></div>
        <div className={h.o3}>
          <section className={`${h.tarjeta} ${h.detalle} ${mov.entra}`} style={{ ['--i' as string]: 5 }} aria-label="Más detalle">
            {pend.length > 0 && <Pliegue id="pendientes" abierto={verPend} onAlternar={() => setVerPend(v => !v)} titulo="Por completar" resumen={`${pend.length}`}>
              <ul className={h.pendLista}>{pend.map(p => <li key={p.clave}>{p.texto}</li>)}</ul>
              <button className={h.enlace} onClick={levy}><MessageCircle size={12} aria-hidden /> Hablar con Levy</button>
            </Pliegue>}
            <Movimientos movements={movements} fx={summary.fx} abierto={verMovs} onAlternar={() => setVerMovs(v => !v)} palabraRango={palabraRango} />
            <FotosDeSaldos cierre={cierre} snapshots={snapshots} accounts={accounts} summary={summary} hoy={hoy} palabraRango={palabraRango} onLevy={levy} abierto={verFotos} onAlternar={() => setVerFotos(v => !v)} />
            <Cobertura summary={summary} accounts={accounts} hoy={hoy} abierto={verCobertura} onAlternar={() => setVerCobertura(v => !v)} />
          </section>
        </div>
      </div>
    </div>

    <footer className={h.pie}>
      <span>{hora ? `Leído a las ${hora} · ` : ''}Cada movimiento en pesos de su día; lo que no trae ese dato, al tipo de cambio de hoy: {summary.fx.usd_mxn} MXN por USD{summary.fx_stale && <span className={h.pieEstado}> (de respaldo, no vivo)</span>}</span>
    </footer>
  </div>
}

/** Una línea para la vista colapsada del hilo: lo cobrado y lo gastado del último mes, con su fecha. */
export function resumenFinanzas(d: FinancesPayload | undefined) {
  if (!d) return null
  const polar = d.summary.income_by_source.find(c => c.category === 'Polar')?.total_mxn ?? 0
  return `cobrado ${pesos(polar)} en ${d.summary.days} días · cobros fijos ${mxn(d.summary.recurring_monthly_mxn)} al mes`
}
