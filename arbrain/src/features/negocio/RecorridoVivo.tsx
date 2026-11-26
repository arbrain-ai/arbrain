'use client'
/**
 * Tu negocio › El pulso, la portada (17 nov 2026). Daniel: «no debería haber scroll, debería ser estático vertical, todas
 * las secciones… no tiene por qué ser todo tarjetas cuadradas… que un experto y un niño se enamoren al verlo». Y sobre la
 * pieza «El nervio» de su lienzo: «esto me encanto». Concepto elegido por el juez de la ronda 1 («La portada»), con sus
 * correcciones: los órganos cuelgan bajo su llave del recorrido (no una cuadrícula), cada cifra pegada a su fuente y su
 * fecha, morado y oro (el rojo solo para lo que duele).
 *
 * De izquierda a derecha corre la gente (`Nervio`). Arriba de cada tramo, su órgano con su número vivo; debajo de cada
 * estación, sus etapas del embudo encendidas (ya tienen número) o apagadas (y qué les falta, al pasar); debajo, el detalle
 * de cada órgano con su fuente. Sistemas es el riel de abajo: una rutina por punto. Nada nace aquí: todo es de `pulso.ts`,
 * `pulso-vivo.ts` (las recetas del mapa v16) y `embudo.json` (`recorrido.ts`).
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, EyeOff, Plus, X, type LucideIcon } from 'lucide-react'
import { ACENTO, type DatosCartelOrgano } from '@/features/canvas/islas/bloques/cartel'
import { escalon, mov } from '@/shared/movimiento'
import { tr, trn, trNodos } from '@/shared/i18n'
import type { Embudo } from './embudo'
import { ORGANO, type Organo, type Pulso } from './pulso'
import { rango, type CanalPulso } from './marketing'
import { CifraViva, Meta, pedirMeta, TEXTO_CLIMA } from './OrganoVivo'
import { altoDelRio, cuelloDelRecorrido, encendido, estaciones, estadoRutina, lazoDe, senalDeRutinas, TRAMOS, type Estacion, type EstadoRutina, type EtapaRecorrido } from './recorrido'
import type { CronSnapshot } from '@/features/planning/types'
import { abrirEtapaNegocio } from '@/shared/navigation/ir-a'
import { partirCifra, porcentaje } from './pulso-vivo'
import { Nervio } from './Nervio'
import r from './recorrido.module.css'

type Vivos = Partial<Record<Organo, DatosCartelOrgano>>

/** La frase de la portada, hecha SOLO de datos: lo que duele (y cuánto de su meta), el cuello y cuántas etapas tienen número. */
export function titularDe(pulsos: Pulso[], vivos: Vivos, es: Estacion[]): ReactNode[] {
  const partes: ReactNode[] = []
  for (const p of pulsos) {
    const v = vivos[p.organo]
    if (v?.estado !== 'duele') continue
    const nombre = tr(ORGANO[p.organo].nombre)
    partes.push(v.meta && v.meta.fraccion !== null
      ? <span key={p.organo}>{trNodos('{organo} duele: va en el {pct} de tu meta de {meta}.', { organo: nombre, pct: <em>{porcentaje(v.meta.fraccion)}</em>, meta: v.meta.texto })}</span>
      : <span key={p.organo}>{tr('{organo} duele: {porque}.', { organo: nombre, porque: v.porque || tr('duele') })}</span>)
  }
  const cu = cuelloDelRecorrido(es)
  if (cu) partes.push(<span key="cuello">{cu.etapa.encendida
    ? tr('El cuello está en «{etapa}».', { etapa: cu.etapa.nombre })
    : tr('El cuello, «{etapa}», todavía no tiene número.', { etapa: cu.etapa.nombre })}</span>)
  const { encendidas, total } = encendido(es)
  if (!partes.length) partes.push(<span key="encendidas">{total
    ? tr('{n} de {total} etapas de tu embudo ya tienen número.', { n: encendidas, total })
    : tr('Tu embudo todavía no está dibujado.')}</span>)
  return partes
}

/** Cómo se leen los puntos de las etapas (encendida, sin número, por construir), con la cuenta total del embudo. */
export function LeyendaEtapas({ embudo }: { embudo: Embudo | null }) {
  const { encendidas, total } = encendido(estaciones(embudo))
  return <ul className={r.leyenda} aria-label={tr('Cómo leer las etapas')}>
    <li><i data-punto="on" />{tr('ya tiene número')}{total ? ` · ${tr('{n} de {total}', { n: encendidas, total })}` : ''}</li>
    <li><i data-punto="off" />{tr('sin número todavía')}</li>
    <li><i data-punto="construir" />{tr('por construir')}</li>
  </ul>
}

export function Recorrido({ pulsos, vivos, embudo, iconos, destino, verCanalLevy, alto, crons, cronsError, launchd }: {
  pulsos: Pulso[]; vivos: Vivos; embudo: Embudo | null
  /** Fase 2: de dónde se lee el estado real de cada rutina (las mismas lecturas del Taller y de El sistema). */
  crons?: CronSnapshot; cronsError?: string; launchd?: Parameters<typeof estadoRutina>[1]['launchd']
  iconos: Record<Organo, LucideIcon>
  /** Lo que abre tocar el número de cada órgano (su lugar de siempre). */
  destino: (p: Pulso) => (() => void) | undefined
  verCanalLevy?: () => void
  /** El alto entero del recorrido cuando el panel va en una sola pantalla; null = el que pida su contenido. */
  alto: number | null
}) {
  const es = estaciones(embudo)
  const cu = cuelloDelRecorrido(es)
  const lazo = lazoDe(embudo)
  const por = Object.fromEntries(pulsos.map(p => [p.organo, p])) as Record<Organo, Pulso>
  const malla = useRef<HTMLDivElement>(null)
  const columnas = useRef<(HTMLDivElement | null)[]>([])
  const [xs, setXs] = useState<number[]>([])
  const [anchoMalla, setAnchoMalla] = useState(0)
  const [altoRio, setAltoRio] = useState(0)
  const rio = useRef<HTMLDivElement>(null)
  // Fase 2: la estación abierta (una a la vez). Tocarla otra vez, Esc, la × o tocar fuera la cierran; el foco vuelve a ella.
  const [abierta, setAbierta] = useState<number | null>(null)
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const abiertaAhora = useRef<number | null>(null)
  abiertaAhora.current = abierta
  // Al cerrar, el foco vuelve a su estación cuando la ficha ya se fue (dos cuadros: después de que React la quita).
  const cerrarFicha = useCallback(() => {
    const i = abiertaAhora.current
    setAbierta(null)
    if (i !== null) requestAnimationFrame(() => requestAnimationFrame(() => botones.current[i]?.focus({ preventScroll: true })))
  }, [])
  const alternar = (i: number) => setAbierta(a => (a === i ? null : i))
  useLayoutEffect(() => {
    const el = malla.current; if (!el) return
    const medir = () => {
      const base = el.getBoundingClientRect(), escala = el.offsetWidth ? base.width / el.offsetWidth : 1
      const sig = columnas.current.map(c => c ? (c.getBoundingClientRect().left - base.left) / escala + 5 : 0)
      setXs(prev => (prev.length === sig.length && prev.every((x, i) => Math.abs(x - sig[i]) < 0.5) ? prev : sig))
      setAnchoMalla(el.offsetWidth)
      setAltoRio(rio.current?.offsetHeight ?? 0)
    }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const organo = (o: Organo) => por[o]
  const altoNervio = anchoMalla && anchoMalla < 1300 ? 96 : NERVIO_ALTO
  const bandas = TRAMOS.flatMap(t => { const v = vivos[t.organo]; return v && por[t.organo]?.estado === 'numero' && v.serie.length >= 5
    ? [{ organo: t.organo, desde: t.desde, hasta: t.hasta, serie: v.serie, nombre: v.serieNombre, duele: v.estado === 'duele' }] : [] })
  // Dónde corre el hilo dentro del río: la misma cuenta que `Nervio` (más arriba si abajo viven el lazo o el terreno).
  // Por fuera también vive: la estación con una rutina que falló se marca en rojo; con una corriendo, late.
  const ahoraRio = Date.now()
  const senales = es.map(s => senalDeRutinas(s.etapas.flatMap(et => et.rutinas.map(ru => estadoRutina(ru, { crons, cronsError, launchd, ahora: ahoraRio }).tono))))
  const yHilo = altoRio ? Math.round(altoDelRio(altoRio, altoNervio) * (lazo || bandas.length ? 0.3 : 0.5)) : 0
  return <div ref={malla} className={r.recorrido} style={alto ? { height: alto } : undefined} data-testid="recorrido">
    {TRAMOS.map(t => <OrganoTramo key={t.organo} p={organo(t.organo)} vivo={vivos[t.organo]} icono={iconos[t.organo]} desde={t.desde} hasta={t.hasta}
      abrir={destino(organo(t.organo))} verCanalLevy={t.organo === 'marketing' ? verCanalLevy : undefined} />)}
    <Voz p={organo('comprador')} vivo={vivos.comprador} abrir={destino(organo('comprador'))} />

    <div ref={rio} className={r.nervioFila}>
      <Nervio xs={xs} estaciones={es} llena abierta={abierta} senales={senales} alto={altoNervio}
        lazo={lazo ? { texto: lazo.accion ?? lazo.nota ?? '', estado: lazo.estado } : null}
        cuello={cu ? { columna: cu.columna, texto: cu.etapa.nombre, frase: cu.etapa.frase } : null}
        ramas={TRAMOS.map(t => ({ desde: t.desde, hasta: t.hasta }))}
        nota={encendido(es).total === 0 ? tr('Levy lo arma con lo que ya sabe de tu negocio y te pregunta lo que falte.') : undefined}
        bandas={bandas} />
      {/* Las estaciones del río también se tocan (con el ratón; el teclado entra por la columna de cada una). */}
      {altoRio > 0 && xs.map((x, i) => <button key={i} type="button" tabIndex={-1} aria-hidden className={r.estacionPunto} data-estacion-toca={i}
        data-abierta={abierta === i || undefined} style={{ left: x - 22, top: yHilo - 22 }} onClick={() => alternar(i)} />)}
    </div>

    {es.map((s, i) => <div key={s.columna} ref={el => { columnas.current[i] = el }} className={`${r.estacion} ${mov.aparece}`} style={{ gridColumn: i + 1, ...escalon(6 + i) }}
      data-cuello={s.cuello || undefined} data-estacion={i} data-toca="" data-estacion-toca={i} data-abierta={abierta === i || undefined}
      onClick={() => alternar(i)}>
      {/* Toda la columna se toca (sus etapas conservan su «al pasar»); el teclado entra por este botón, sobre su nombre. */}
      <button type="button" ref={el => { botones.current[i] = el }} className={r.estacionToca} data-testid={`estacion-${i + 1}`}
        aria-expanded={abierta === i} aria-controls={abierta === i ? 'ficha-estacion' : undefined}
        aria-label={tr('{n} · {columna}: ver sus etapas y rutinas', { n: i + 1, columna: tr(s.columna) })} />
      <p className={r.estacionNombre}><span>{i + 1} · {tr(s.columna)}</span>{s.etapas.length ? <small>{tr('{n} de {total}', { n: s.encendidas, total: s.etapas.length })}</small> : null}</p>
      {s.etapas.length ? <ul className={r.etapas} aria-label={tr('Sus etapas')}>{s.etapas.map(et => <Etapa key={et.id} et={et} />)}</ul>
        : null}
      {/* Juez de la dieta (17 nov): la raya roja del cuello sin nombre no se leía; su etapa se nombra aquí, una sola. */}
      {s.etapas.find(et => et.cuello) ? <p className={r.cuelloNombre} aria-hidden>{s.etapas.find(et => et.cuello)!.nombre}</p> : null}
      {s.etapas.length ? null
        : <p className={r.sinEtapas}>{tr('Sin etapas todavía')}</p>}
    </div>)}

    <Riel p={organo('sistemas')} vivo={vivos.sistemas} icono={iconos.sistemas} abrir={destino(organo('sistemas'))} />

    {abierta !== null && es[abierta] ? (() => {
      const t = TRAMOS.find(x => abierta >= x.desde && abierta <= x.hasta)!
      // Más etapas, más columnas (nunca más alto): 1 hasta 2 etapas, 2 hasta 4 y 3 desde 5.
      const n = es[abierta].etapas.length
      // Cada detalle vive en UNA ficha: Marketing en Adquisición (1), Mente del comprador en Nutrición (2), Venta en
      // Conversión (3), Entrega en Bienvenida y Entrega (4 y 5, el mismo órgano), Finanzas en Expansión (6).
      const quien: Organo | null = abierta === 1 ? 'comprador' : t.organo
      const conDetalle = !!quien && organo(quien)?.estado === 'numero'
      const ancho = Math.min(anchoMalla || 680, conDetalle ? (quien === 'marketing' ? 1100 : n > 4 ? 980 : 760) : n > 4 ? 920 : n > 2 ? 680 : 440)
      const left = Math.max(0, Math.min((xs[abierta] ?? 0) - 34, (anchoMalla || ancho) - ancho))
      const top = (rio.current?.offsetTop ?? 0) + (yHilo ? yHilo + 28 : 0)
      const ahora = Date.now()
      return <div className={r.fichaCapa}>
        <FichaEstacion key={abierta} s={es[abierta]} i={abierta} organo={organo(t.organo)} xEstacion={xs[abierta] ?? 0}
          detalle={conDetalle && quien ? <DetalleOrgano p={organo(quien)} vivo={vivos[quien]} /> : undefined}
          estilo={{ left, top, width: ancho, ['--pico' as string]: `${Math.max(14, (xs[abierta] ?? 0) - left - 7)}px`, ['--ficha-top' as string]: `${top}px` }}
          estadoDe={ru => estadoRutina(ru, { crons, cronsError, launchd, ahora })} cerrar={cerrarFicha}
          irARutinas={destino(organo('sistemas'))} irAEtapa={id => { setAbierta(null); abrirEtapaNegocio(id) }} />
      </div>
    })() : null}
  </div>
}

const NERVIO_ALTO = 120
/** «De 14 fundadores» → «de 14 fundadores» al ir a media línea (solo la primera letra; nada más cambia). */
const minuscula = (t: string) => (t && /^\p{Lu}\p{Ll}/u.test(t) ? t[0].toLocaleLowerCase('es') + t.slice(1) : t)

function Etapa({ et }: { et: EtapaRecorrido }) {
  const que = et.encendida ? tr('{embudo} · mide: {mide}', { embudo: et.embudo, mide: et.mide })
    : et.falta?.tipo === 'medir' ? tr('{embudo} · le falta para encender: {como}', { embudo: et.embudo, como: et.falta.como })
      : tr('{embudo} · por construir', { embudo: et.embudo })
  // Dieta del 17 nov 2026: en la portada, un punto por etapa; su nombre y qué mide, al pasar y en la ficha de la estación.
  return <li className={r.etapa} data-encendida={et.encendida || undefined} data-falta={et.falta?.tipo} data-cuello={et.cuello || undefined} title={`${et.nombre}\n${et.cuello && et.frase ? `${que}\n${et.frase}` : que}`}>
    <i aria-hidden /><span className={r.oculto}>{et.nombre} · </span>
    <span className={r.oculto}>{et.encendida ? tr('ya tiene número') : et.falta?.tipo === 'medir' ? tr('sin número todavía') : tr('por construir')}</span>
  </li>
}

/** El color de identidad del órgano (cartel v16) vive solo en su punto; lo demás es morado, oro y, si duele, rojo. */
function estilo(p: Pulso, vivo: DatosCartelOrgano | undefined, i: number, extra?: CSSProperties): CSSProperties {
  const a = vivo ? ACENTO[vivo.acento] : ACENTO.violeta
  return { ['--id-claro' as string]: a.claro, ['--id-oscuro' as string]: a.oscuro, ['--n' as string]: i, ...extra }
}
const climaDe = (p: Pulso, vivo?: DatosCartelOrgano) => vivo?.estado ?? (p.estado === 'numero' ? 'calma' : p.estado === 'leyendo' ? 'leyendo' : p.estado === 'oculto' ? 'oculto' : 'sin-sensor')

/**
 * Un órgano que mide un tramo del recorrido: su llave arriba y su número (se toca: abre su lugar). Dieta del 17 nov 2026
 * (Daniel: «hay mucho texto»): la portada es números y río; sus notas, su meta (o «sin meta») y su fuente viven en la
 * ficha de cada estación que mide (`DetalleOrgano`). Marketing deja en la portada dos cifras por canal.
 */
function OrganoTramo({ p, vivo, icono: I, desde, hasta, abrir, verCanalLevy }: {
  p: Pulso; vivo?: DatosCartelOrgano; icono: LucideIcon; desde: number; hasta: number; abrir?: () => void; verCanalLevy?: () => void
}) {
  const nombre = tr(ORGANO[p.organo].nombre)
  const clima = climaDe(p, vivo)
  const ancho = hasta - desde + 1
  return <section className={r.organo} style={estilo(p, vivo, desde, { gridColumn: `${desde + 1} / span ${ancho}` })} data-organo={p.organo}
    data-testid={`organo-${p.organo}`} data-estado={p.estado} data-clima={clima} data-ancho={ancho} aria-label={nombre}>
    <header className={`${r.llave} ${mov.aparece}`} style={escalon(1 + desde)}>
      <span className={r.llaveNombre}><i aria-hidden /><I size={12} strokeWidth={2.4} aria-hidden />{nombre}</span>
      <span className={r.llavePregunta}>{tr(p.pregunta ?? ORGANO[p.organo].pregunta)}</span>
    </header>
    <div className={r.columnaNumero}>
      <Numero p={p} vivo={vivo} abrir={abrir} nombre={nombre} />
      {p.estado === 'numero' && p.canales?.length ? <CanalesCortos canales={p.canales} /> : null}
      {verCanalLevy && <button type="button" className={r.canalLevy} onClick={verCanalLevy} data-testid="abrir-canal-levy">{tr('Canal de Levy')}<small>{tr('marcador por video')}</small><ChevronRight size={12} aria-hidden /></button>}
    </div>
  </section>
}

/** Marketing en la portada: dos cifras por canal (las dos primeras que trae su sensor); la tabla completa, en su ficha. */
function CanalesCortos({ canales }: { canales: CanalPulso[] }) {
  const cols = canales.find(c => c.cifras.length)?.cifras.slice(0, 2).map(x => ({ id: x.id, etiqueta: x.etiqueta })) ?? []
  if (!cols.length) return null
  return <ul className={r.canalesCortos} data-testid="canales-cortos" aria-label={tr('Tus canales')}>
    {canales.map(c => <li key={c.clave}>
      <span className={r.ccCanal}>{c.nombre}</span>
      <span className={r.ccCifras}>{cols.map((col, k) => {
        const x = c.cifras.find(y => y.id === col.id)
        return <span key={col.id} data-espera={!x || x.valor === null || undefined} title={x?.valor === null ? x.espera : undefined}>
          {k ? ' · ' : ''}<small>{col.etiqueta}</small> <b>{x?.valor ?? '—'}</b>
        </span>
      })}</span>
    </li>)}
  </ul>
}

/** El número del órgano: lo grande de la portada. Se toca y abre su lugar (BI, Cohorte, Finanzas, Taller). */
function Numero({ p, vivo, abrir, nombre }: { p: Pulso; vivo?: DatosCartelOrgano; abrir?: () => void; nombre: string }) {
  const numero = p.estado === 'numero' && !!p.cifra
  const decisiones = vivo?.decisiones ?? 0
  const cuerpo = <>
    {numero ? <span className={r.cifra} data-largo={(p.cifra?.length ?? 0) > 7 || undefined}><CifraPartida texto={p.cifra!} clave={`pulso-vivo:${p.organo}`} /></span>
      : <span className={r.sinNumero}>{p.estado === 'leyendo' ? <span className={r.esqueleto} aria-busy="true" /> : p.estado === 'oculto' ? <><EyeOff size={13} aria-hidden />{tr('Oculto en directo')}</> : p.estado === 'error' ? tr('No se pudo leer ahora') : tr('Sin datos todavía')}</span>}
    {numero && p.unidad && <span className={r.unidad}>{p.unidad}{p.organo === 'entrega' && p.detalle?.[0] ? ` · ${minuscula(p.detalle[0])}` : ''}{abrir && <ChevronRight className={r.ir} size={14} aria-hidden />}</span>}
    {!numero && p.estado === 'sin-sensor' && p.falta ? <span className={r.falta}><b>{p.conecta ? tr('Conecta tu fuente:') : tr('Falta el sensor:')}</b> {tr(p.falta)}</span> : null}
    {!numero && p.estado === 'error' && p.error ? <span className={r.nota}>{tr(p.error)}</span> : null}
    <span className={r.pildoras}>
      {climaDe(p, vivo) !== 'calma' && <ClimaPalabra estado={climaDe(p, vivo)} porque={vivo?.porque} />}
      {decisiones > 0 && <span className={r.toque} title={tr('Decisiones de la bandeja que declaran este órgano')}><i aria-hidden />{decisiones === 1 ? tr('1 espera tu toque') : tr('{n} esperan tu toque', { n: decisiones })}</span>}
    </span>
  </>
  return abrir
    ? <button type="button" className={`${r.numero} ${mov.entra}`} style={escalon(2)} onClick={abrir} aria-label={tr('{nombre}: abrir', { nombre })}>{cuerpo}</button>
    : <div className={`${r.numero} ${mov.entra}`} style={escalon(2)}>{cuerpo}</div>
}

/** Lo que dice tu gente (Mente del comprador): su número y su objeción principal sobre la estación de la confianza. Se toca y
 *  abre su órgano; su meta y su fuente viven en la ficha de esa estación. */
function Voz({ p, vivo, abrir }: { p: Pulso; vivo?: DatosCartelOrgano; abrir?: () => void }) {
  const nombre = tr(ORGANO.comprador.nombre)
  const numero = p.estado === 'numero'
  const clima = climaDe(p, vivo)
  return <section className={`${r.voz} ${mov.entra}`} style={estilo(p, vivo, 1, escalon(3))} data-testid="organo-comprador" data-organo="comprador" data-estado={p.estado} data-clima={clima} aria-label={nombre}>
    {abrir ? <button type="button" className={r.cubre} onClick={abrir} aria-label={tr('{nombre}: abrir', { nombre })} /> : null}
    <span className={r.vozNombre}><i aria-hidden />{nombre}</span>
    {numero && p.cifra ? <span className={r.vozCifra}><b><CifraViva texto={p.cifra} clave="pulso-vivo:comprador" /></b> {p.unidad}</span>
      : <span className={r.sinNumero}>{p.estado === 'leyendo' ? <span className={r.esqueleto} aria-busy="true" /> : tr('Sin datos todavía')}</span>}
    {numero && p.detalle?.[0] ? <span className={r.vozCita}>{p.detalle[0]}</span> : null}
    {!numero && p.falta && <span className={r.falta}><b>{p.conecta ? tr('Conecta tu fuente:') : tr('Falta el sensor:')}</b> {tr(p.falta)}</span>}
    {clima !== 'calma' && numero ? <ClimaPalabra estado={clima} porque={vivo?.porque} /> : null}
  </section>
}

/** Sistemas, el riel de abajo: lo que corre solo. Un punto por rutina activa (las cuentas de su detalle), en rojo las que fallaron. */
function Riel({ p, vivo, icono: I, abrir }: { p: Pulso; vivo?: DatosCartelOrgano; icono: LucideIcon; abrir?: () => void }) {
  const nombre = tr(ORGANO.sistemas.nombre)
  const numero = p.estado === 'numero'
  const riel = p.riel
  const puntos = riel ? Array.from({ length: Math.min(riel.activas, 60) }, (_, k) => (k < riel.bien ? 'bien' : k < riel.bien + riel.fallan ? 'falla' : 'espera')) : []
  return <section className={`${r.riel} ${mov.aparece}`} style={estilo(p, vivo, 6, escalon(13))} title={tr('Fuente: {fuente}', { fuente: tr(p.fuente) })} data-testid="organo-sistemas" data-organo="sistemas" data-estado={p.estado} data-clima={climaDe(p, vivo)} aria-label={nombre}>
    {abrir && <button type="button" className={r.cubre} onClick={abrir} aria-label={tr('{nombre}: abrir', { nombre })} />}
    <span className={r.llaveNombre}><i aria-hidden /><I size={12} strokeWidth={2.4} aria-hidden />{nombre}</span>
    <span className={r.llavePregunta}>{tr(p.pregunta ?? ORGANO.sistemas.pregunta)}</span>
    {numero && p.cifra ? <span className={r.rielCifra}><b><CifraViva texto={p.cifra} clave="pulso-vivo:sistemas" /></b> {p.unidad}</span> : <Lectura p={p} />}
    {puntos.length > 0 && <span className={r.via} role="img" aria-label={tr('{bien} de {activas} rutinas activas salieron bien', { bien: riel!.bien, activas: riel!.activas })}>
      {puntos.map((x, k) => <i key={k} data-punto={x} style={{ ['--k' as string]: k }} />)}</span>}
    {numero && p.detalle?.length ? <span className={r.rielDetalle}>{p.detalle.join(' · ')}</span> : null}
    {climaDe(p, vivo) !== 'calma' && <ClimaPalabra estado={climaDe(p, vivo)} porque={vivo?.porque} />}
    {numero && vivo && !vivo.meta && <span className={r.sinMetaCorta}><b>{tr('Sin meta')}</b>{realidadAparte(vivo, p)}<PonlaTu vivo={vivo} nombre={nombre} /></span>}
  </section>
}

/**
 * El detalle de un órgano, dentro de la ficha de su estación (dieta del 17 nov 2026): lo que en la portada era texto
 * (sus notas, la tabla de canales, su meta o «sin meta · ponla tú», su clima y su fuente) vive aquí, a un toque. Las
 * mismas piezas de antes, sin plegar: la ficha tiene su propio alto.
 */
function DetalleOrgano({ p, vivo }: { p: Pulso; vivo?: DatosCartelOrgano }) {
  const nombre = tr(ORGANO[p.organo].nombre)
  const numero = p.estado === 'numero'
  const lineas = p.organo === 'comprador' ? p.detalle?.slice(1) : p.detalle
  return <section className={r.fichaDetalle} style={estilo(p, vivo, 0)} data-organo={p.organo} data-clima={climaDe(p, vivo)} data-testid={`ficha-organo-${p.organo}`} aria-label={nombre}>
    <p className={r.fichaDetalleNombre}><i aria-hidden />{nombre}{p.organo === 'comprador' && numero && p.cifra ? <small> · {p.cifra} {p.unidad}</small> : null}</p>
    {!numero && <Lectura p={p} />}
    {numero && p.canales && <TablaCanales canales={p.canales} />}
    {numero && lineas?.length && !p.canales ? <span className={r.lineas}>{lineas.map(d => <span key={d}>{d}</span>)}</span> : null}
    {numero && vivo ? <span className={r.pildoras}>
      <ClimaPalabra estado={climaDe(p, vivo)} porque={vivo.porque} />
      {(vivo.decisiones ?? 0) > 0 && <span className={r.toque}><i aria-hidden />{vivo.decisiones === 1 ? tr('1 espera tu toque') : tr('{n} esperan tu toque', { n: vivo.decisiones })}</span>}
    </span> : null}
    {numero && vivo && (vivo.meta ? <MetaConFuente vivo={vivo} /> : <SinMeta vivo={vivo} nombre={nombre} />)}
    <span className={r.fuente}>{tr('Fuente: {fuente}', { fuente: tr(p.fuente) })}</span>
  </section>
}

/** El clima en una palabra, como las anotaciones del lienzo: su punto (late si su fuente responde) y «en calma» o «duele». */
function ClimaPalabra({ estado, porque }: { estado: DatosCartelOrgano['estado']; porque?: string }) {
  return <span className={r.climaPalabra} data-clima={estado} title={porque || undefined}><i aria-hidden />{estado === 'sin-sensor' ? tr('sin número todavía') : tr(TEXTO_CLIMA[estado])}</span>
}

/** La realidad junto a «sin meta», salvo que sea el mismo número que ya se ve en grande (no se dice dos veces). */
function realidadAparte(vivo: DatosCartelOrgano, p: Pulso): string {
  const r0 = vivo.realidad?.trim()
  if (!r0 || (p.cifra && r0.startsWith(`${p.cifra} `))) return ''
  return ` · ${r0}`
}

/** «$210,671 MXN»: la cifra cuenta en grande y su unidad pegada («MXN») va chica, para que quepa en su estación. */
function CifraPartida({ texto, clave }: { texto: string; clave: string }) {
  const c = partirCifra(texto)
  const cola = c?.despues ?? ''
  if (!c || !/^\s+[A-Za-z]{2,4}$/.test(cola)) return <CifraViva texto={texto} clave={clave} />
  return <><CifraViva texto={texto.slice(0, texto.length - cola.length)} clave={clave} /><small className={r.cifraUnidad}>{cola}</small></>
}

/** Sin número: qué pasa con su fuente (leyendo, oculto en directo, error, o qué la conectaría). Nunca un cero. */
function Lectura({ p }: { p: Pulso }) {
  if (p.estado === 'leyendo') return <span className={r.esqueleto} aria-busy="true" />
  if (p.estado === 'oculto') return <span className={r.nota}><EyeOff size={12} aria-hidden /> {tr('Oculto en directo')}</span>
  if (p.estado === 'error') return <span className={r.lineas}><span>{tr('No se pudo leer ahora')}</span>{p.error && <span>{tr(p.error)}</span>}</span>
  return <span className={r.falta}><b>{p.conecta ? tr('Conecta tu fuente:') : tr('Falta el sensor:')}</b> {p.falta && tr(p.falta)}</span>
}

/** «Sin meta · ponla tú»: la realidad de hoy (con su fecha) y el botón que le pasa la pregunta a Levy. */
function SinMeta({ vivo, nombre }: { vivo: DatosCartelOrgano; nombre: string }) {
  return <span className={r.sinMeta}>
    <span className={r.nota}><b>{tr('Sin meta')}</b>{vivo.realidad ? <span data-tercero="">{` · ${vivo.realidad}`}</span> : null}</span>
    <PonlaTu vivo={vivo} nombre={nombre} />
  </span>
}

/** El botón «ponla tú»: le pasa a Levy la pregunta de la meta con la realidad de hoy. */
function PonlaTu({ vivo, nombre }: { vivo: DatosCartelOrgano; nombre: string }) {
  return <button type="button" className={r.ponla} onClick={() => pedirMeta(vivo, nombre)} title={tr('Le pasa la pregunta a Levy con la realidad de hoy')}>
    {tr('ponla tú')}<Plus size={12} strokeWidth={2.4} aria-hidden />
  </button>
}

/** La meta firmada contra la realidad (la barra del mapa v16) y, aparte, lo que no es meta, con su fuente. */
function MetaConFuente({ vivo }: { vivo: DatosCartelOrgano }) {
  return <span className={r.meta}>
    <Meta vivo={{ ...vivo, aparte: null }} />
    {vivo.aparte && <span className={r.nota} data-meta-aparte="" data-segundo="">{vivo.aparte} · {tr('Polar, en vivo')}</span>}
  </span>
}

/** «Clics a la comunidad» → «Clics a la» / «comunidad»: dos renglones por el espacio más central, nunca a media palabra. */
function partirEtiqueta(t: string): ReactNode {
  const espacios = [...t.matchAll(/ /g)].map(m => m.index!)
  if (!espacios.length || t.length < 10) return t
  const corte = espacios.reduce((a, b) => (Math.abs(b - t.length / 2) < Math.abs(a - t.length / 2) ? b : a))
  return <>{t.slice(0, corte)}<br />{t.slice(corte + 1)}</>
}

/** Marketing por canal: un canal por fila, una cifra por columna (como el panel de antes). Cada valor lleva la letra de su semana y su fuente. */
function TablaCanales({ canales }: { canales: CanalPulso[] }) {
  const letras = new Map<string, string>()
  const ventanas = new Map<string, [string, string][]>() // la semana → sus letras con su fuente (la leyenda, agrupada)
  const clave = (x: CanalPulso['cifras'][number]) => `${x.desde && x.hasta ? `${rango(x.desde, x.hasta)} · ` : ''}${x.fuente}`
  for (const c of canales) for (const x of c.cifras) {
    const k = clave(x); if (letras.has(k)) continue
    const l = 'abcdefgh'[letras.size] ?? '·', v = x.desde && x.hasta ? rango(x.desde, x.hasta) : ''
    letras.set(k, l); ventanas.set(v, [...(ventanas.get(v) ?? []), [l, x.fuente]])
  }
  const filas = canales.find(c => c.cifras.length)?.cifras.map(x => ({ id: x.id, etiqueta: x.etiqueta })) ?? []
  const sinSemana = (t?: string) => t?.replace(/ contra la semana anterior$/, '')
  return <div className={r.canales}>
    <table className={r.tabla}>
      <thead><tr><th />{filas.map(f => <th key={f.id} scope="col" title={f.etiqueta}>{partirEtiqueta(f.etiqueta)}</th>)}</tr></thead>
      <tbody>{canales.map(c => <tr key={c.clave}><th scope="row">{c.nombre}{c.estado === 'esperando' ? <small>{tr('esperando primer dato')}</small> : c.estado === 'sin-token' ? <small>{tr('sin autorizar')}</small> : null}</th>{filas.map(f => {
        const x = c.cifras.find(y => y.id === f.id)
        if (!x) return <td key={f.id} className={r.vacia}>—</td>
        const nota = [x.nota, sinSemana(x.cambio)].filter(Boolean).join(' · ')
        return <td key={f.id} data-espera={x.valor === null || undefined} title={x.valor === null ? x.espera : [x.nota, x.cambio].filter(Boolean).join(' · ') || undefined}>
          <span className={r.valor}><b>{x.valor ?? '—'}</b><sup>{letras.get(clave(x))}</sup></span>{x.valor !== null && nota ? <span data-segundo="">{nota}</span> : null}{x.valor === null && x.espera ? <span>{x.espera}</span> : null}
        </td>
      })}</tr>)}</tbody>
    </table>
    <p className={r.letras} data-cuarto="">{[...ventanas].map(([v, g]) => <span key={v || '·'}>{v ? `${v}: ` : ''}{g.map(([l, f], i) => <Fragment key={l}>{i ? '; ' : ''}<sup>{l}</sup>{f}</Fragment>)}</span>)}<span data-segundo="">{tr('± %: contra la semana anterior')}</span></p>
    {canales.filter(c => c.error).map(c => <p key={c.clave} className={r.nota}>{c.nombre}: {c.estado === 'numero' ? tr('Última lectura con error: {error}', { error: c.error! }) : c.error}</p>)}
  </div>
}


/**
 * Fase 2 · la ficha de una estación (17 nov 2026). Daniel, sobre su lienzo: «darle clic a las rutinas debería ser mejor la
 * UX… más dinámico, no tan estático». Tocar una estación (o Enter sobre ella) abre, encima del recorrido y sin mover nada ni
 * hacer scroll, lo suyo: el número del órgano que la mide (de `pulso.ts`), sus etapas (encendidas o qué les falta, de
 * `embudo.json`) y las rutinas que corren ahí con su estado real (cómo les fue y cuándo les toca, las lecturas del Taller).
 * Sin etapas (la copia vacía del alumno) dice qué fuente la encendería; nunca un cero. Esc, la × o tocar fuera la cierran.
 */
export function FichaEstacion({ s, i, organo, estilo: pos, xEstacion, estadoDe, cerrar, irARutinas, irAEtapa, detalle }: {
  s: Estacion; i: number; organo?: Pulso; estilo: CSSProperties; xEstacion: number
  /** Dieta del 17 nov 2026: lo que la portada ya no dice del órgano que mide esta estación (notas, meta, fuente). */
  detalle?: ReactNode
  estadoDe: (r: EtapaRecorrido['rutinas'][number]) => EstadoRutina
  cerrar: () => void; irARutinas?: () => void; irAEtapa: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  // Si sus etapas no caben en su alto, la ficha toma todo el ancho del recorrido y más columnas: nunca se recorta.
  const [ancha, setAncha] = useState(false)
  useLayoutEffect(() => { const ul = lista.current; if (!ancha && ul && ul.scrollHeight > ul.clientHeight + 1) setAncha(true) }, [ancha])
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); cerrar() } }
    // Tocar fuera la cierra (tocar otra estación la cambia: lo resuelve su propio botón).
    const fuera = (ev: PointerEvent) => {
      const t = ev.target as Element | null
      if (!t || ref.current?.contains(t) || t.closest?.('[data-estacion-toca]')) return
      cerrar()
    }
    window.addEventListener('keydown', tecla)
    document.addEventListener('pointerdown', fuera, true)
    return () => { window.removeEventListener('keydown', tecla); document.removeEventListener('pointerdown', fuera, true) }
  }, [cerrar])
  const rutinas = s.etapas.reduce((n, et) => n + et.rutinas.length, 0)
  const nombreOrgano = organo ? tr(ORGANO[organo.organo].nombre) : ''
  const numero = organo?.estado === 'numero' && organo.cifra
  // Si su contenido pasa del alto que queda bajo el río, la ficha sube lo justo (y pierde el pico): nunca se recorta.
  const [subida, setSubida] = useState<number | null>(null)
  useLayoutEffect(() => {
    const f = ref.current, capa = f?.parentElement
    if (!f || !capa || subida !== null) return
    // Su alto natural: sin el tope de alto, medido antes de pintar (nada se ve moverse).
    const tope = f.style.maxHeight
    f.style.maxHeight = 'none'
    const natural = f.offsetHeight
    f.style.maxHeight = tope
    const libre = capa.clientHeight - f.offsetTop
    if (natural > libre + 1) setSubida(Math.max(0, capa.clientHeight - natural))
  }, [subida, ancha])
  const base = ancha ? { ...pos, left: 0, width: '100%', ['--pico' as string]: `${Math.max(14, xEstacion - 7)}px` } : pos
  const estilo = subida !== null ? { ...base, top: subida, ['--ficha-top' as string]: `${subida}px` } : base
  return <div ref={ref} id="ficha-estacion" className={r.ficha} style={estilo} role="dialog" aria-modal="false" tabIndex={-1}
    data-testid="ficha-estacion" data-estacion={i} data-con-detalle={detalle ? '' : undefined} data-subida={subida !== null || undefined}
    data-columnas={detalle ? (s.etapas.length > 2 ? '2' : undefined) : ancha ? '4' : s.etapas.length > 4 ? '3' : s.etapas.length > 2 ? '2' : undefined}
    aria-label={tr('{n} · {columna}: sus etapas y rutinas', { n: i + 1, columna: tr(s.columna) })}>
    <header className={r.fichaCabeza}>
      <span>
        <b>{i + 1} · {tr(s.columna)}</b>
        <small>{s.etapas.length ? tr('{n} de {total} etapas ya tienen número', { n: s.encendidas, total: s.etapas.length }) : tr('Sin etapas todavía')}{rutinas ? ` · ${trn(rutinas, '{n} rutina', '{n} rutinas')}` : ''}</small>
      </span>
      {organo && <span className={r.fichaOrgano}>
        <small>{tr('La mide {organo}', { organo: nombreOrgano })}</small>
        {numero ? <b>{organo.cifra}<small> {organo.unidad}</small></b>
          : organo.estado === 'leyendo' ? <small>{tr('Leyendo…')}</small>
            : <small>{tr('sin número todavía')}</small>}
      </span>}
      <button type="button" className={r.fichaCerrar} onClick={cerrar} aria-label={tr('Cerrar')}><X size={14} aria-hidden /></button>
    </header>
    <div className={r.fichaCuerpo}>
    {detalle ? <div className={r.fichaDetalles}>{detalle}</div> : null}
    {s.etapas.length ? <ul ref={lista} className={r.fichaEtapas}>{s.etapas.map(et => <li key={et.id} className={r.fichaEtapa} data-encendida={et.encendida || undefined} data-falta={et.falta?.tipo} data-cuello={et.cuello || undefined}>
      <button type="button" className={r.fichaEtapaNombre} onClick={() => irAEtapa(et.id)} title={tr('Ver la etapa en El sistema')}>
        <i aria-hidden /><b>{et.nombre}</b><small>{et.embudo}</small>
      </button>
      <p className={r.fichaMide}>{et.encendida ? tr('Mide: {que}', { que: et.mide }) : et.falta?.tipo === 'medir' ? tr('Le falta para encender: {como}', { como: et.falta.como }) : tr('Por construir')}</p>
      {et.rutinas.length ? <ul className={r.fichaRutinas}>{et.rutinas.map((ru, k) => { const st = estadoDe(ru); return <li key={ru.id ?? k} data-tono={st.tono}>
        <i aria-hidden /><span>{ru.que_hace}</span><small>{st.texto}{st.toca ? ` · ${st.toca}` : ''}</small>
      </li> })}</ul> : null}
    </li>)}</ul>
      : <div className={r.fichaVacia}>
        <p>{tr('Levy lo arma con lo que ya sabe de tu negocio y te pregunta lo que falte.')}</p>
        {organo && organo.estado !== 'numero' && organo.falta ? <p><b>{organo.conecta ? tr('Conecta tu fuente:') : tr('Falta el sensor:')}</b> {tr(organo.falta)}</p> : null}
      </div>}
    </div>
    {irARutinas && rutinas ? <footer className={r.fichaPie}>
      <button type="button" onClick={irARutinas}>{tr('Ver en Taller › Rutinas')}<ChevronRight size={13} aria-hidden /></button>
    </footer> : null}
  </div>
}
