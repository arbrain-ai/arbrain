'use client'
/**
 * Tu negocio › El pulso (7 nov 2026). Daniel: «el libro no debería verlo… luce aburrido… prefiero un lienzo… un botón que
 * abra y redirija al lienzo en una nueva pestaña» y «sistema nervioso de todas las interconexiones… vamos a darle cien por
 * ciento la atención a esto».
 *
 * Arriba, el sistema nervioso: «Abrir el lienzo completo» abre en una pestaña nueva del panel la página cuyo id trae
 * `lienzo_sistema` en el embudo (vacío = «lienzo en camino»). Debajo, seis órganos con su número vivo, cada uno leído de
 * una fuente que la app ya consulta (features/negocio/pulso.ts); sin sensor, «sin datos todavía» y qué sensor falta.
 * Mente del comprador abre su órgano: avatar, vehículo, canal y la voz del cliente. En modo directo, Cohorte y Finanzas no
 * se piden (sus rutas están vetadas) y la voz llega con iniciales desde el servidor.
 * Encima de los órganos (8 nov), la tarjeta Estrategia: la cabeza del negocio, leída de la investigación de mercado
 * (features/negocio/TarjetaEstrategia.tsx).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowLeft, Brain, ChevronRight, EyeOff, HandCoins, Megaphone, Network, PackageCheck, Wallet, Workflow, type LucideIcon,
} from 'lucide-react'
import type { FinancesPayload } from '@/features/finances/types/finances'
import { urlFinanzas } from '@/features/finances/lib/finanzas'
import type { CronSnapshot } from '@/features/planning/types'
import { useFuente } from '@/features/cabina/datos'
import { urlRutinas } from '@/features/cabina/vistas/Rutinas'
import { urlTrabajos, type Trabajos } from '@/features/cabina/trabajos-modelo'
import { abrirCasa, abrirSeccion } from '@/features/cabina/panel/Secciones'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'
import { useDirecto, useModoDirecto } from '@/shared/stores/modo-directo-store'
import { esEdicionCliente } from '@/lib/edicion'
import { tr, trn, trMarca, trMarcas } from '@/shared/i18n'
import { trNodos } from '@/shared/i18n'
import { CLAVE_DIRECTO } from '@/lib/modo-directo/cubrir'
import { escalon, mov } from '@/shared/movimiento'
import { fechaCorta, type Embudo } from './embudo'
import { TarjetaEstrategia } from './TarjetaEstrategia'
import { CanalLevy } from './CanalLevy'
import {
  canalesDe, lienzoSistema, ORGANO, pulsoComprador, pulsoEntrega, pulsoFinanzas, pulsoMarketing, pulsoSistemas, pulsoVenta,
  URL_COMPRADOR, type Cita, type CohortePulso, type Destino, type Organo, type Pieza, type Pulso, type RespuestaComprador, type Tema,
} from './pulso'
import { rango, URL_MARKETING, type CanalPulso, type RespuestaMarketing } from './marketing'
import type { DatosCartelOrgano } from '@/features/canvas/islas/bloques/cartel'
import { usePulsosCliente } from './usePulsosCliente'
import { usePulsoVivo } from './usePulsoVivo'
import { OrganoVivo } from './OrganoVivo'
import { LeyendaEtapas, Recorrido, titularDe } from './RecorridoVivo'
import { estaciones } from './recorrido'
import { ANCHO_MIN, useUnaPantalla } from './useUnaPantalla'
import p from './pulso.module.css'
import rp from './recorrido.module.css'

const URL_COHORTE = '/api/cohorte'
const mayus = (t: string) => (t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t)
/** El modo recordado en este equipo: en el primer render el store todavía no lo aplicó y Cohorte/Finanzas ya se pedirían. */
const directoRecordado = () => { try { return typeof window !== 'undefined' && window.localStorage.getItem(CLAVE_DIRECTO) === '1' } catch { return false } }
const ICONO: Record<Organo, LucideIcon> = { marketing: Megaphone, venta: HandCoins, comprador: Brain, entrega: PackageCheck, finanzas: Wallet, sistemas: Workflow }

export function ElPulso({ embudo, launchd, grande, inicio, verEtapas }: { embudo: Embudo | null; launchd?: Record<string, { semaforo: 'verde' | 'ambar' | 'rojo' | 'gris'; texto: string }>; grande?: boolean; inicio?: 'comprador' | 'canal-levy'; verEtapas: () => void }) {
  const prendido = useDirecto()
  const confirmado = useModoDirecto(st => st.confirmado)
  const directo = prendido || (!confirmado && directoRecordado())
  const [organo, setOrgano] = useState<'comprador' | 'canal-levy' | null>(inicio ?? null)
  // Edición del alumno (8 nov 2026): los órganos salen de SU motor de BI y sus rutinas; nada del negocio del autor se pide.
  const cliente = esEdicionCliente()
  const cohorte = useFuente<CohortePulso>(directo || cliente ? null : URL_COHORTE)
  const finanzas = useFuente<FinancesPayload>(directo || cliente ? null : urlFinanzas('30d'))
  const crons = useFuente<CronSnapshot>(cliente ? null : urlRutinas())
  const trabajos = useFuente<Trabajos>(cliente ? null : urlTrabajos(6))
  const comprador = useFuente<RespuestaComprador>(URL_COMPRADOR)
  const marketing = useFuente<RespuestaMarketing>(cliente ? null : URL_MARKETING)
  const pulsosCliente = usePulsosCliente(cliente, comprador)

  const pulsos: Pulso[] = pulsosCliente ?? [
    pulsoMarketing(marketing),
    pulsoVenta(cohorte, directo),
    pulsoComprador(comprador),
    pulsoEntrega(cohorte, directo),
    pulsoFinanzas(finanzas, directo),
    pulsoSistemas(crons, trabajos),
  ]
  // Lo vivo del mapa v16 (15 nov 2026): color, curva, clima, bandeja y meta de cada órgano, de la receta de su isla.
  const vivos = usePulsoVivo(pulsos, { directo, cliente })
  // Una sola pantalla (17 nov 2026): con ancho de escritorio, la portada; si además cabe en el alto, sin scroll.
  const raiz = useRef<HTMLDivElement>(null)
  const pantalla = useUnaPantalla(raiz, organo === null)
  const abrir = (d: Destino) => {
    if (d === 'comprador') setOrgano('comprador')
    // Sistemas cuenta rutinas: abre el Taller en Rutinas, no en el segmento que hubiera quedado (11 nov 2026).
    else if (d === 'taller') { pedirSegmentoTaller('rutinas'); abrirCasa('taller') }
    else if (d === 'bi') abrirSeccion({ vista: 'bi' })
    else abrirSeccion({ vista: d })
  }

  if (organo === 'canal-levy') return <CanalLevy grande={grande} volver={() => setOrgano(null)} />
  if (organo === 'comprador') return <OrganoComprador datos={comprador.data} error={comprador.error} embudo={embudo} grande={grande} volver={() => setOrgano(null)} />

  const lienzo = lienzoSistema(embudo)
  const conNumero = pulsos.filter(x => x.estado === 'numero').length
  const duelen = pulsos.filter(x => vivos[x.organo]?.estado === 'duele').length
  const esperan = pulsos.reduce((n, x) => n + (vivos[x.organo]?.decisiones ?? 0), 0)
  const destinoDe = (x: Pulso) => {
    // Cada órgano abre su lugar (15 nov 2026): Marketing → BI, Finanzas → Finanzas, Venta y Entrega → Cohorte,
    // Mente del comprador → su órgano, Sistemas → Taller › Rutinas.
    const d = x.abre ?? (x.organo === 'marketing' ? 'bi' : undefined)
    return d && x.estado !== 'oculto' ? () => abrir(d) : undefined
  }
  const abrirLienzo = () => lienzo && abrirSeccion({ vista: 'lienzo', paginaId: lienzo, titulo: tr('El sistema') })
  const bajada = conNumero === 6 ? tr('Todos con sensor.') : 6 - conNumero === 1 ? tr('Uno todavía sin número: dice qué lo mediría.') : tr('{n} todavía sin número: cada uno dice qué lo mediría.', { n: 6 - conNumero })

  if (pantalla.ancho >= ANCHO_MIN) {
    const es = estaciones(embudo)
    return <div ref={raiz} className={`${p.pulso} ${rp.portada}`} data-testid="el-pulso" data-una-pantalla={pantalla.una || undefined}
      style={pantalla.una && pantalla.alto ? { ['--alto-pulso' as string]: `${pantalla.alto}px` } as CSSProperties : undefined}>
      <header className={`${rp.cabeza} ${mov.entra}`} style={escalon(0)}>
        <div className={rp.cabezaQuien}>
          <p className={p.ceja}>{trNodos('Tu negocio · {pulso}', { pulso: <b>{tr('el pulso')}</b> })}</p>
          <h3>{embudo?.negocio ?? tr('Tu negocio')}</h3>
        </div>
        <div className={rp.clima}>
          {(duelen > 0 || esperan > 0) && <p className={p.alerta} data-testid="pulso-alerta">
            {/* Palabras de marketing (17 nov 2026): se nombra lo que duele, no «N órganos». */}
            {duelen > 0 && <span data-tono="duele"><i aria-hidden />{trn(duelen, '{nombres} duele', '{nombres} duelen', { nombres: pulsos.filter(x => vivos[x.organo]?.estado === 'duele').map(x => tr(ORGANO[x.organo].nombre)).join(', ') })}</span>}
            {esperan > 0 && <span data-tono="toque"><i aria-hidden />{trn(esperan, '{n} decisión espera tu toque', '{n} decisiones esperan tu toque')}</span>}
          </p>}
          {/* Dieta del 17 nov 2026: la bajada salió de la portada (sin cifras; los números ya lo dicen). */}
          <LeyendaEtapas embudo={embudo} />
        </div>
        <button type="button" className={rp.lienzoChip} disabled={!lienzo} data-testid="abrir-lienzo" onClick={abrirLienzo}
          title={lienzo ? tr('A dónde vas: el mapa completo de tu negocio y sus interconexiones') : tr('Cuando el embudo traiga «lienzo_sistema», este botón lo abre')}>
          <span aria-hidden><Network size={13} strokeWidth={2.3} /></span>
          {lienzo ? tr('Abrir el lienzo completo') : tr('Lienzo en camino')}
          {lienzo && <ChevronRight size={14} aria-hidden />}
        </button>
      </header>

      <aside className={rp.lado}>
        <TarjetaEstrategia grande={grande} forma="columna" />
        <footer className={rp.pie}>
          <button type="button" onClick={verEtapas} title={tr('Los números se leen de su fuente al abrir; nada se escribe aquí.')}>{tr('Etapas y skills del embudo')}</button>
        </footer>
      </aside>

      <section className={rp.centro} aria-label={tr('Los seis órganos')}>
        <h4 className={`${rp.titular} ${mov.entra}`} style={escalon(1)} data-testid="pulso-titular">{titularDe(pulsos, vivos, es)}</h4>
        <Recorrido pulsos={pulsos} vivos={vivos} embudo={embudo} iconos={ICONO} destino={destinoDe} alto={null}
          verCanalLevy={!cliente ? () => setOrgano('canal-levy') : undefined}
          crons={crons.data} cronsError={crons.error} launchd={launchd} />
      </section>

    </div>
  }

  return <div ref={raiz} className={`${p.pulso} ${grande ? p.grande : ''}`} data-testid="el-pulso">
    <header className={`${p.cabeza} ${mov.entra}`} style={escalon(0)}>
      <p className={p.ceja}>{trNodos('Tu negocio · {pulso}', { pulso: <b>{tr('el pulso')}</b> })}</p>
      <h3 className={p.titular}>{embudo?.negocio ?? tr('Tu negocio')}</h3>
      <p className={p.bajada}>{tr('Seis órganos, cada uno con su número vivo.')} {bajada}</p>
      {(duelen > 0 || esperan > 0) && <p className={p.alerta} data-testid="pulso-alerta">
        {duelen > 0 && <span data-tono="duele"><i aria-hidden />{trn(duelen, '{n} órgano duele', '{n} órganos duelen')}</span>}
        {esperan > 0 && <span data-tono="toque"><i aria-hidden />{trn(esperan, '{n} decisión espera tu toque', '{n} decisiones esperan tu toque')}</span>}
      </p>}
    </header>

    <button
      type="button" className={`${p.lienzo} ${mov.entra}`} style={escalon(1)} disabled={!lienzo} data-testid="abrir-lienzo"
      onClick={abrirLienzo}
      title={lienzo ? tr('Abre el lienzo en su pestaña de Arbrain') : tr('Cuando el embudo traiga «lienzo_sistema», este botón lo abre')}
    >
      <span className={p.lienzoIcono} aria-hidden><Network size={18} strokeWidth={2.2} /></span>
      <span className={p.lienzoTexto}>
        <b>{lienzo ? tr('Abrir el lienzo completo') : tr('Lienzo en camino')}</b>
        {/* El lienzo dice a dónde vas (la v15); aquí se ve cómo va (15 nov 2026: un solo lugar por cosa). */}
        <small>{tr('A dónde vas: el mapa completo de tu negocio y sus interconexiones')}</small>
      </span>
      {/* Chevron, no «sale de la app» (11 nov 2026): el lienzo abre en una pestaña de Arbrain, como cada tarjeta. */}
      {lienzo && <ChevronRight className={p.lienzoFlecha} size={16} aria-hidden />}
    </button>

    <TarjetaEstrategia grande={grande} />

    <ul className={p.tarjetas} aria-label={tr('Los seis órganos')}>
      {pulsos.map((x, i) => <li key={x.organo} className={mov.entra} style={escalon(2 + i)} data-ancha={x.canales?.length ? '' : undefined}>
        <TarjetaOrgano x={x} i={i} vivo={vivos[x.organo]} abrir={destinoDe(x)} verCanalLevy={x.organo === 'marketing' && !cliente ? () => setOrgano('canal-levy') : undefined} />
      </li>)}
    </ul>

    <p className={p.pie}>
      {tr('Los números se leen de su fuente al abrir; nada se escribe aquí.')}{' '}
      <button type="button" className={p.enlace} onClick={verEtapas}>{tr('Etapas y skills del embudo')}</button>
    </p>
  </div>
}

function TarjetaOrgano({ x, i, vivo, abrir, verCanalLevy }: { x: Pulso; i: number; vivo?: DatosCartelOrgano; abrir?: () => void; verCanalLevy?: () => void }) {
  const numero = x.estado === 'numero'
  return <OrganoVivo x={x} i={i} vivo={vivo} icono={ICONO[x.organo]} abrir={abrir}
    debajo={verCanalLevy && <button type="button" className={p.enlaceCanal} onClick={verCanalLevy} data-testid="abrir-canal-levy">Canal de Levy<small>marcador por video</small><ChevronRight size={14} aria-hidden /></button>}>
    {!numero && <Lectura x={x} />}
    {x.canales && (numero || x.estado === 'sin-sensor') && <Canales canales={x.canales} />}
  </OrganoVivo>
}

function Lectura({ x }: { x: Pulso }) {
  if (x.estado === 'numero') return <span className={p.lectura}>
    <span className={p.cifra}>{x.cifra}</span>
    <span className={p.unidad}>{x.unidad}</span>
    {x.detalle?.map(d => <span key={d} className={p.detalle}>{d}</span>)}
  </span>
  if (x.estado === 'leyendo') return <span className={p.lectura} aria-busy="true"><span className={p.esqueleto} /><span className={`${p.esqueleto} ${p.corto}`} /></span>
  if (x.estado === 'oculto') return <span className={p.lectura}><span className={p.sinDatos}><EyeOff size={13} aria-hidden />{tr('Oculto en directo')}</span></span>
  if (x.estado === 'error') return <span className={p.lectura}><span className={p.sinDatos}>{tr('No se pudo leer ahora')}</span><span className={p.detalle}>{x.error && tr(x.error)}</span></span>
  return <span className={p.lectura}>
    <span className={p.sinDatos}>{tr('Sin datos todavía')}</span>
    <span className={p.falta}><b>{x.conecta ? tr('Conecta tu fuente:') : tr('Falta el sensor:')}</b> {x.falta && tr(x.falta)}</span>
  </span>
}

/** Marketing: un bloque por canal; cada cifra con su semana y su fuente. «Esperando primer dato» nunca es un 0. */
function Canales({ canales }: { canales: CanalPulso[] }) {
  return <span className={p.canalesMk}>
    {canales.map(c => <span key={c.clave} className={p.canalMk} data-estado={c.estado}>
      <span className={p.canalNombre}>
        <b>{c.nombre}</b>
        {c.estado === 'esperando' && <small>{tr('esperando primer dato')}</small>}
        {c.estado === 'sin-token' && <small>{tr('sin autorizar')}</small>}
      </span>
      {c.cifras.length ? <span className={p.cifrasMk}>{c.cifras.map(x => <span key={x.id} className={p.cifraMk} data-espera={x.valor === null || undefined} title={x.espera}>
        <span className={p.cifraEtiqueta}>{x.etiqueta}</span>
        <span className={p.cifraValor}>{x.valor ?? '—'}</span>
        {x.valor !== null && (x.cambio || x.nota) && <span className={p.cifraNota}>{[x.nota, x.cambio].filter(Boolean).join(' · ')}</span>}
        {x.valor === null && x.espera && <span className={p.cifraNota}>{x.espera}</span>}
        <span className={p.cifraFuente}>{x.hasta && x.desde ? `${rango(x.desde, x.hasta)} · ` : ''}{x.fuente}</span>
      </span>)}</span> : null}
      {c.error && <span className={p.detalle}>{c.estado === 'numero' ? tr('Última lectura con error: {error}', { error: c.error }) : c.error}</span>}
    </span>)}
  </span>
}

// ── El órgano: Mente del comprador ──

function OrganoComprador({ datos, error, embudo, grande, volver }: { datos?: RespuestaComprador; error?: string; embudo: Embudo | null; grande?: boolean; volver: () => void }) {
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') volver() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [volver])
  const canales = useMemo(() => canalesDe(embudo), [embudo])
  const on = datos?.activo ? datos : null
  return <div className={`${p.pulso} ${grande ? p.grande : ''}`} data-testid="organo-comprador">
    <div className={`${p.barra} ${mov.entra}`} style={escalon(0)}>
      <button type="button" className={p.volver} onClick={volver}><ArrowLeft size={14} aria-hidden />{tr('El pulso')}</button>
      {on?.directo && <span className={p.directo}><EyeOff size={12} aria-hidden />{tr('En directo: nombres en iniciales')}</span>}
    </div>
    <header className={`${p.cabeza} ${mov.entra}`} style={escalon(1)}>
      <p className={p.ceja}>{trNodos('Órgano · {nombre}', { nombre: <b>{tr('mente del comprador')}</b> })}</p>
      <h3 className={p.titular}>{tr('Quién te compra y qué se dice')}</h3>
    </header>

    {!datos ? <p className={p.bajada}>{error ? tr('No se pudo leer: {error}', { error }) : tr('Leyendo…')}</p> : <>
      <div className={`${p.piezas} ${mov.entra}`} style={escalon(2)}>
        <TarjetaPieza titulo={tr(on?.etiquetas?.avatar ?? trMarca('Avatar'))} pieza={on?.avatar ?? null} />
        <TarjetaPieza titulo={tr(on?.etiquetas?.vehiculo ?? trMarca('Vehículo'))} pieza={on?.vehiculo ?? null} />
        <section className={p.pieza} aria-label={tr('Canal')}>
          <p className={p.etiqueta}>{tr('Canal')}</p>
          {canales.length ? <ul className={p.canales}>{canales.map(c => <li key={`${c.embudo}-${c.nombre}`} data-opera={c.opera || undefined}>
            <i className={p.punto} aria-hidden />
            <span><b>{c.embudo}</b><small>{c.nombre}{c.opera ? '' : ` · ${tr('por construir')}`}</small></span>
          </li>)}</ul> : <p className={p.vacioCorto}>{tr('Sin embudo todavía: el canal sale de su etapa de Adquisición.')}</p>}
        </section>
      </div>

      <Voz voz={on?.voz ?? null} />
    </>}
  </div>
}

function TarjetaPieza({ titulo, pieza }: { titulo: string; pieza: Pieza | null }) {
  return <section className={p.pieza} aria-label={titulo}>
    <p className={p.etiqueta}>{titulo}</p>
    {pieza ? <>
      <h4 className={p.piezaNombre}>{pieza.nombre}</h4>
      {pieza.frase && <p className={p.piezaFrase}>{pieza.frase}</p>}
      <button type="button" className={p.enlace} onClick={() => abrirSeccion({ vista: 'documento', ruta: pieza.ruta, titulo })}>{tr('Abrir el canónico')}</button>
    </> : <p className={p.vacioCorto}>{tr('No se encontró su documento.')}</p>}
  </section>
}

function Voz({ voz }: { voz: Extract<RespuestaComprador, { activo: true }>['voz'] | null }) {
  const [tipo, setTipo] = useState<string | null>(null)
  const datos = voz?.datos ?? null
  const tipos = useMemo(() => [...new Set((datos?.citas ?? []).map(c => c.tipo).filter((t): t is string => !!t))], [datos])
  const [todas, setTodas] = useState(false)
  const filtradas = (datos?.citas ?? []).filter(c => !tipo || c.tipo === tipo)
  const citas = todas ? filtradas : filtradas.slice(0, CITAS_A_LA_VISTA)

  let cuerpo: ReactNode
  if (!voz?.existe) cuerpo = <div className={p.vacio}>
    <p><b>{tr('Todavía no hay voz del cliente.')}</b> {tr('Levy la está reuniendo de tus llamadas y mensajes: las frases tal cual las dicen, con su objeción, su deseo y su dolor.')}</p>
    <p className={p.vacioCorto}>{trNodos('Aparece aquí en cuanto exista {archivo}. Nada se inventa mientras tanto.', { archivo: <code>voz-del-cliente.json</code> })}</p>
  </div>
  else if (!datos) cuerpo = <div className={p.vacio}><p><b>{tr('La voz del cliente no se pudo leer.')}</b></p>{voz.errores?.map(e => <p key={e} className={p.vacioCorto}>{tr(e)}</p>)}</div>
  else cuerpo = <>
    <div className={p.resumen}>
      <Top titulo={tr('Objeciones')} temas={datos.resumen.top_objeciones} />
      <Top titulo={tr('Deseos')} temas={datos.resumen.top_deseos} />
      <Top titulo={tr('Dolores')} temas={datos.resumen.top_dolores} />
    </div>
    {tipos.length > 1 && <div className={p.filtros} role="tablist" aria-label={tr('Filtrar citas')}>
      <button role="tab" aria-selected={!tipo} onClick={() => setTipo(null)}>{tr('Todas')}</button>
      {tipos.map(t => <button key={t} role="tab" aria-selected={tipo === t} onClick={() => setTipo(t)}>{tipoEnPalabras(t)}</button>)}
    </div>}
    {citas.length ? <ul className={p.citas}>{citas.map((c, i) => <CitaFila key={i} c={c} />)}</ul> : <p className={p.vacioCorto}>{tr('Sin citas todavía.')}</p>}
    {filtradas.length > citas.length && <button type="button" className={p.enlace} onClick={() => setTodas(true)}>{tr('Ver las {n}', { n: filtradas.length })}</button>}
    {voz.errores?.length ? <p className={p.vacioCorto}>{trn(voz.errores.length, '{n} cita no se pudo leer.', '{n} citas no se pudieron leer.')}</p> : null}
  </>

  return <section className={`${p.voz} ${mov.entra}`} style={escalon(3)} aria-label={tr('La voz del cliente')}>
    <header className={p.vozCabeza}>
      <p className={p.etiqueta}>{tr('La voz del cliente')}</p>
      {datos && <small>{trn(datos.citas.length, '{n} cita', '{n} citas')}{datos.actualizado ? ` · ${fechaCorta(datos.actualizado)}` : ''}</small>}
    </header>
    {cuerpo}
  </section>
}

function Top({ titulo, temas }: { titulo: string; temas: Tema[] }) {
  return <div className={p.top}>
    <p className={p.etiqueta}>{titulo}</p>
    {temas.length ? <ol>{temas.slice(0, 5).map(t => <li key={t.texto}><span>{mayus(t.texto)}</span>{t.veces !== null && <small>{t.veces}</small>}</li>)}</ol> : <p className={p.vacioCorto}>{tr('Sin datos todavía.')}</p>}
  </div>
}

const CITAS_A_LA_VISTA = 12
/** El tipo como lo escribe el archivo («objecion») en palabras («objeción»). */
const [OBJECION, CREENCIA, DOLOR, DESEO, PREGUNTA] = trMarcas(['objeción', 'creencia', 'dolor', 'deseo', 'pregunta'] as const)
const TIPO: Record<string, string> = { objecion: OBJECION, creencia: CREENCIA, dolor: DOLOR, deseo: DESEO, pregunta: PREGUNTA }
const tipoEnPalabras = (t: string) => tr(TIPO[t.toLowerCase()] ?? t)

function CitaFila({ c }: { c: Cita }) {
  const meta = [c.quien, c.tema, c.nivel_conciencia ? tr('conciencia: {nivel}', { nivel: c.nivel_conciencia }) : null, c.objecion_tipo && c.objecion_tipo !== c.tema ? tr('objeción de {tipo}', { tipo: c.objecion_tipo }) : null].filter(Boolean).join(' · ')
  return <li className={p.cita} data-tipo={c.tipo ?? undefined}>
    <blockquote>«{c.texto}»</blockquote>
    {(c.tipo || meta) && <p>{c.tipo && <span className={p.tipo}>{tipoEnPalabras(c.tipo)}</span>}{meta}</p>}
  </li>
}
