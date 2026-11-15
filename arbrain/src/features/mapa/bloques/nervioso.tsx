'use client'
/**
 * Bloques del SISTEMA NERVIOSO (mapa v16, 14 nov 2026). La vara de Daniel (07:34): «la mejor plataforma de lienzos
 * agéntica post-ASI». El mapa ES el negocio: sabe a dónde va y siente dónde duele (la señal algedónica de Beer).
 *
 *   organo-vivo la cabeza de un órgano: su pregunta, su número vivo (El pulso), el monitor que late solo si su fuente
 *               responde, su sensor. { organo, nombre?, pregunta?, capa?, sensor: {nombre, logos?}, forma?: 'columna'|'franja' }
 *   meta-error  META, REALIDAD y ERROR (meta menos realidad, principio firmado de Daniel) con su tendencia. Sin meta escrita en
 *               su fuente, la meta es un HUECO a propósito que invita a ponerla («Ponle meta» le pasa la pregunta a Levy); nunca
 *               una meta inventada. En calma respira como «En calma» del BI; cuando el error crece (o la serie sale de su
 *               corredor hacia el lado malo) DUELE: una lámpara sobria, nunca una alarma. La realidad es la serie del BI o, si
 *               el órgano se mide en otro lado, `realidad` (hoy: la Semana 1 de la cohorte en su plataforma).
 *               { serie?: {consulta, ventana?}, realidad?: {fuente: 'cohorte:resumen', campo, total?, etiqueta, nombre?},
 *                 meta?: {valor, unidad?, texto, fuente, fecha?}, sinMeta?, organo? }
 *   actividad   quién trabaja el órgano AHORA (agentes de la Cabina) y lo último que hizo (sus rutinas, del scheduler y de
 *               launchd). { columnas: [etapas], palabras?: [para reconocer a sus agentes] }
 *   decision    las tarjetas de la bandeja que DECLARAN este órgano (campo `organo` de la tarjeta, que pone quien la sube:
 *               `cli.ts decidir --organo`, la cola de publicación, los vigilantes), con Sí y No ahí mismo; caben `max` (1 por
 *               defecto, hasta 3) y el texto largo se recorta (completo al pasar encima). Nada se adivina por palabras.
 *               { organo, max?: 1 }
 *   terminales  una terminal por etapa que siente (embudo.json): encendida si opera y ya tiene número; el cuello en rojo.
 *               { columnas: [etapas] } o { rutinas: true }
 *   timonel     la meta menos lo que mide es la corrección (el cuello de embudo.json) y los dos lazos. {}
 *
 * Nada inventado: cada número sale de su fuente (El pulso, BI, el scheduler, la Cabina, la bandeja, embudo.json); sin dato
 * dice «sin dato», nunca 0.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import {
  Brain, ChevronRight, Cpu, HandCoins, Megaphone, PackageCheck, Plus, Wallet, Workflow, type LucideIcon,
} from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { URL_BI, urlConsulta, type RespuestaBI } from '@/features/bi/fuente'
import { consultaEn } from '@/features/bi/catalogo'
import { leer, type RespuestaConsulta, type Punto } from '@/features/bi/modelo'
import { urlRutinas } from '@/features/cabina/vistas/Rutinas'
import { urlTrabajos, type Trabajos } from '@/features/cabina/trabajos-modelo'
import { estado as estadoRutina } from '@/features/rutinas/model'
import type { CronSnapshot } from '@/features/planning/types'
import { useBandeja } from '@/features/decisiones/useBandeja'
import { organoDeTarjeta, type Tarjeta } from '@/features/decisiones/lib/bandeja'
import { corridaLaunchd, URL_EMBUDO, type RespuestaEmbudo, type Etapa } from '@/features/negocio/embudo'
import { ORGANO, type Organo, type Pulso } from '@/features/negocio/pulso'
import { Ceja, Hueco, LOGOS, Respira, Sello } from '../piezas'
import { esObj, esTexto, lista, numero, texto, type ComponenteBloque, type PropsBloque } from '../tipos'
import { useCohorte, useEmbudo, usePulso } from '../datos'
import { semana1De } from '@/features/canvas/islas/fuentes'
import { campo } from '@/features/canvas/islas/receta'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { NOMBRE_DUENO } from '@/config'
import s from '../isla.module.css'
import v from './nervioso.module.css'

const ORGANOS = Object.keys(ORGANO) as Organo[]
const esOrgano = (x: unknown): x is Organo => typeof x === 'string' && (ORGANOS as string[]).includes(x)
/** Las tarjetas que declaran este órgano (mapa v16): el campo `organo` de la tarjeta manda; nunca se adivina por palabras. */
export const tarjetasDe = <T extends Pick<Tarjeta, 'organo' | 'categoria'>>(pendientes: readonly T[], organo: Organo): T[] => pendientes.filter(t => organoDeTarjeta(t) === organo)
const ICONO: Record<Organo, LucideIcon> = { marketing: Megaphone, venta: HandCoins, comprador: Brain, entrega: PackageCheck, finanzas: Wallet, sistemas: Workflow }
const COLS = ['Adquisición', 'Nutrición', 'Conversión', 'Bienvenida', 'Entrega', 'Expansión']
const FMT = (n: number, usd?: boolean) => (usd ? '$' : '') + new Intl.NumberFormat('es-MX', { maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n) + (usd ? ' USD' : '')
/** Una cifra grande con su unidad chica al lado (no se parte en dos renglones). */
function Cifra({ n, usd }: { n: number; usd?: boolean }) {
  return <b className={v.valor}>{usd ? '$' : ''}{new Intl.NumberFormat('es-MX', { maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n)}{usd ? <small> USD</small> : null}</b>
}
const hace = (ms: number | null | undefined) => {
  if (!ms) return ''
  const m = Math.max(0, (Date.now() - ms) / 60000)
  return m < 2 ? 'hace un momento' : m < 60 ? `hace ${Math.round(m)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`
}

// ════════════════════════════════════════════════════════════════════════════
// ÓRGANO: la cabeza, el número vivo y el monitor
// ════════════════════════════════════════════════════════════════════════════
function textoPulso(p: Pulso) {
  if (p.estado === 'numero') return { cifra: p.cifra ?? 'sin dato', unidad: p.unidad ?? '', detalle: (p.detalle ?? []).join(' · ') }
  if (p.estado === 'sin-sensor') return { cifra: 'sin sensor', unidad: p.falta ?? '', detalle: '' }
  if (p.estado === 'leyendo') return { cifra: '…', unidad: 'leyendo su fuente', detalle: '' }
  if (p.estado === 'oculto') return { cifra: '••••', unidad: 'modo directo', detalle: '' }
  return { cifra: 'sin dato', unidad: p.error ?? 'la fuente no respondió', detalle: '' }
}

/** El monitor: late mientras su fuente responde; plano y punteado si no hay sensor. De lejos, una pose quieta. */
function Monitor({ vivo, leyendo, modo }: { vivo: boolean; leyendo: boolean; modo: 'lejos' | 'cerca' }) {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = cv.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const css = getComputedStyle(c)
    const col = (n: string, r: string) => css.getPropertyValue(n).trim() || r
    const traza = col('--i-mor', '#8c27f1'), cabeza = col('--i-oro', '#ff9101'), rejilla = col('--i-linea', 'rgba(127,127,127,.15)'), plano = col('--i-tenue', '#888')
    const PER = 2.6, BAR = 3 * PER, K = 2
    const onda = (x: number) => { const f = ((x % 1) + 1) % 1; const g = (c0: number, w: number, a: number) => a * Math.exp(-(((f - c0) / w) ** 2))
      return g(0.16, 0.03, 0.12) - g(0.27, 0.008, 0.18) + g(0.29, 0.012, 1) - g(0.315, 0.01, 0.32) + g(0.5, 0.05, 0.22) }
    let raf = 0
    const pinta = (t: number) => {
      const W = (c.width = c.offsetWidth * K), H = (c.height = c.offsetHeight * K)
      ctx.clearRect(0, 0, W, H)
      ctx.strokeStyle = rejilla; ctx.lineWidth = 1
      for (let x = 0; x < W; x += 40 * K) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke() }
      for (let y = 0; y < H; y += 40 * K) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke() }
      const base = H * 0.62, amp = H * 0.42
      if (!vivo) {
        ctx.setLineDash(leyendo ? [] : [10 * K, 8 * K]); ctx.strokeStyle = plano; ctx.lineWidth = 2.2 * K
        ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(W, base); ctx.stroke(); ctx.setLineDash([])
        return
      }
      const tt = t + BAR * 0.82, hx = ((tt / BAR) % 1) * W
      ctx.lineWidth = 2.6 * K; ctx.lineCap = 'round'
      let prev: [number, number] | null = null
      for (let x = 0; x <= W; x += 3 * K) {
        const edad = ((hx - x) / W + 1) % 1
        if (edad > 0.93) { prev = null; continue }
        const y = base - amp * onda((tt - edad * BAR) / PER)
        if (prev) { ctx.globalAlpha = Math.max(0.08, 1 - edad * 1.05); ctx.strokeStyle = traza; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke() }
        prev = [x, y]
      }
      ctx.globalAlpha = 1; ctx.fillStyle = cabeza
      ctx.beginPath(); ctx.arc(hx, base - amp * onda(tt / PER), 5 * K, 0, 7); ctx.fill()
    }
    if (modo === 'cerca' && vivo) {
      const t0 = performance.now()
      const tic = (a: number) => { pinta((a - t0) / 1000); raf = requestAnimationFrame(tic) }
      raf = requestAnimationFrame(tic)
    } else pinta(0)
    return () => cancelAnimationFrame(raf)
  }, [vivo, leyendo, modo])
  return <div className={v.monitor}><canvas ref={cv} /><span className={v.monRot}>el pulso de su fuente</span><span className={v.monEstado}>{vivo ? 'responde' : leyendo ? 'leyendo' : 'falta el sensor'}</span></div>
}

function OrganoBloque({ b: r, ctx }: PropsBloque) {
  if (!esOrgano(r.organo)) return <Hueco>organo: «organo» es uno de {ORGANOS.join(', ')}</Hueco>
  return <OrganoVivo organo={r.organo} r={r} modo={ctx.modo} />
}
/** ¿Vive aquí el cuello del negocio? (la etapa marcada como cuello en embudo.json, por la columna que siente este órgano) */
const COLUMNAS_DE: Record<Organo, string[]> = { marketing: ['Adquisición', 'Nutrición'], venta: ['Conversión'], entrega: ['Bienvenida', 'Entrega'], finanzas: ['Expansión'], comprador: [], sistemas: [] }

function OrganoVivo({ organo, r, modo }: { organo: Organo; r: Record<string, unknown>; modo: 'lejos' | 'cerca' }) {
  const p = usePulso(organo)
  const t = textoPulso(p)
  const { embudo } = useEmbudo()
  const cuello = embudo?.etapas.find(e => e.cuello?.es && COLUMNAS_DE[organo].includes(e.etapa)) ?? null
  const Icono = ICONO[organo]
  const sensor = esObj(r.sensor) ? r.sensor : {}
  const logos = lista(sensor.logos, esTexto).filter(l => LOGOS.has(l))
  const franja = r.forma === 'franja'
  const largo = t.cifra.length
  return <section className={v.organo} data-forma={franja ? 'franja' : 'columna'} data-estado={p.estado} data-cuello={cuello ? '' : undefined}>
    {cuello ? <div className={v.cuello}><i />aquí está el cuello · «{cuello.nombre}»<span>{cuello.mide?.nombre}</span></div> : null}
    <div className={v.cab}>
      <span className={v.glifo} data-apagado={p.estado !== 'numero' ? '' : undefined}><Icono size={franja ? 36 : 42} strokeWidth={1.9} aria-hidden /></span>
      <div className={v.cabTexto}>
        <Ceja tono="morado">{texto(r.capa, 'órgano')}</Ceja>
        <h2 className={s.titulo} style={{ fontSize: franja ? 60 : 84 }}>{texto(r.nombre, ORGANO[organo].nombre)}</h2>
        <p className={v.pregunta}>{texto(r.pregunta, ORGANO[organo].pregunta)}</p>
      </div>
      <Sello estado={p.estado === 'numero' ? 'con-datos' : p.estado === 'leyendo' ? 'idea' : 'rojo'}>{p.estado === 'numero' ? 'con datos' : p.estado === 'leyendo' ? 'leyendo' : p.estado === 'sin-sensor' ? 'aún sin datos' : 'sin dato'}</Sello>
    </div>
    <div className={v.cuerpo}>
      <div className={v.numero} data-estado={p.estado}>
        <b className={v.cifra} data-late={p.estado === 'numero' ? t.cifra : undefined} style={{ fontSize: p.estado !== 'numero' ? 52 : largo > 11 ? 76 : largo > 7 ? 96 : 128 }}>{t.cifra}</b>
        <p className={v.unidad}>{t.unidad}</p>
        {t.detalle ? <p className={v.detalle}>{t.detalle}</p> : null}
        <p className={v.fuente}>{p.fuente}</p>
        <div className={v.sensor}><span className={s.ceja} data-tono="morado">su sensor</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logos.map(l => <img key={l} src={`/mapa/logos/${l}.png`} alt="" />)}<b>{texto(sensor.nombre)}</b></div>
      </div>
      <Monitor vivo={p.estado === 'numero'} leyendo={p.estado === 'leyendo'} modo={modo} />
    </div>
    {esTexto(r.nota) ? <p className={v.nota}>{r.nota}</p> : null}
  </section>
}

// ════════════════════════════════════════════════════════════════════════════
// ERROR: meta, realidad y error con tendencia (la señal algedónica)
// ════════════════════════════════════════════════════════════════════════════
interface Meta { valor: number; unidad?: string; texto: string; fuente: string; fecha?: string }
const esMeta = (x: unknown): x is Meta => esObj(x) && typeof x.valor === 'number' && esTexto(x.texto) && esTexto(x.fuente)

/** La pendiente de los últimos `n` puntos (por día), por mínimos cuadrados; null si no hay suficientes. */
function pendiente(ps: Punto[], n = 14): number | null {
  const xs = ps.filter(p => p.valor != null).slice(-n)
  if (xs.length < 5) return null
  const m = xs.length, mx = (m - 1) / 2, my = xs.reduce((a, p) => a + (p.valor as number), 0) / m
  let num = 0, den = 0
  xs.forEach((p, i) => { num += (i - mx) * ((p.valor as number) - my); den += (i - mx) ** 2 })
  return den ? num / den : null
}

/**
 * La realidad que no vive en el BI: la Semana 1 de la cohorte en su plataforma (`cohorte:resumen`, sin nombres) o el número del
 * propio órgano (`pulso:<organo>`: las citas de la voz del cliente, las rutinas que salieron bien).
 */
function useRealidad(r: Record<string, unknown>): { valor: number; total: number | null; nombre: string; etiqueta: string; fuente: string } | null | 'leyendo' {
  const rv = esObj(r.realidad) && esTexto(r.realidad.fuente) ? r.realidad : null
  const deCohorte = rv?.fuente === 'cohorte:resumen'
  const delPulso = rv && esTexto(rv.fuente) && rv.fuente.startsWith('pulso:') ? rv.fuente.slice(6) : null
  const cohorte = useCohorte(deCohorte)
  const pulso = usePulso(esOrgano(delPulso) ? delPulso : 'comprador', esOrgano(delPulso))
  if (!rv) return null
  if (esOrgano(delPulso)) {
    if (pulso.estado === 'leyendo') return 'leyendo'
    const n = pulso.estado === 'numero' && pulso.cifra ? Number(pulso.cifra.replace(/[^0-9.-]/g, '')) : NaN
    return Number.isFinite(n) ? { valor: n, total: null, nombre: texto(rv.nombre, 'su número'), etiqueta: texto(rv.etiqueta, pulso.unidad ?? ''), fuente: pulso.fuente } : null
  }
  if (!deCohorte) return null
  if (!cohorte.data) return cohorte.error ? null : 'leyendo'
  const resumen = { semana1: semana1De(cohorte.data) }
  const v = campo(resumen, texto(rv.campo)), tot = rv.total ? campo(resumen, texto(rv.total)) : null
  if (typeof v !== 'number') return null
  return { valor: v, total: typeof tot === 'number' ? tot : null, nombre: texto(rv.nombre, 'su realidad'), etiqueta: texto(rv.etiqueta), fuente: 'la plataforma · casillas de la cohorte' }
}

function ErrorMeta({ b: r }: PropsBloque) {
  const serie = esObj(r.serie) && esTexto(r.serie.consulta) ? { consulta: r.serie.consulta, ventana: ([7, 30, 90].includes(Number(r.serie.ventana)) ? Number(r.serie.ventana) : 30) as 7 | 30 | 90 } : null
  const meta = esMeta(r.meta) ? r.meta : null
  const otra = useRealidad(r)
  const bi = useFuente<RespuestaBI>(serie ? URL_BI : null)
  const catalogo = bi.data && bi.data.activo ? bi.data.catalogo : null
  const c = serie && catalogo ? consultaEn(catalogo, serie.consulta) : null
  const consulta = useFuente<RespuestaConsulta>(serie && c && c.conectada !== false ? urlConsulta(serie.consulta, serie.ventana) : null)
  const datos = consulta.data?.datos
  const puntos = datos && datos.forma === 'serie' ? datos.puntos : []
  const lectura = c && datos ? leer(c, c.tipo, serie!.ventana, datos) : null
  const real = otra && otra !== 'leyendo' ? otra : null
  const ultimo = real ? real.valor : [...puntos].reverse().find(p => p.valor != null)?.valor ?? null
  const usd = c?.unidad === 'usd' || meta?.unidad === 'USD'
  const error = meta && ultimo != null ? meta.valor - ultimo : null
  // la tendencia del ERROR: si la realidad se aleja de la meta (o, sin meta, si cae del lado malo de su corredor)
  const m = pendiente(puntos)
  const mejorArriba = (c?.mejor ?? 'arriba') !== 'abajo'
  const crece = meta ? (m != null && (mejorArriba ? m < 0 : m > 0)) : false
  const senal = lectura?.senal
  const dueleSerie = !!senal && senal.tono === 'dolor'
  const duele = crece || dueleSerie
  const estado: 'duele' | 'calma' | 'sin-dato' = ultimo == null ? 'sin-dato' : duele ? 'duele' : 'calma'
  // la pequeña gráfica: la realidad, su corredor (lo normal de BI) y la meta si cabe
  const vals = puntos.map(p => p.valor).filter((x): x is number => x != null)
  const corr = lectura?.puntos?.at(-1)?.corredor
  const lo = Math.min(...vals, corr?.lo ?? Infinity), hi = Math.max(...vals, corr?.hi ?? -Infinity)
  const W = 520, H = 120, X = (i: number) => (i / Math.max(1, puntos.length - 1)) * W, Y = (y: number) => H - 8 - ((y - lo) / Math.max(1e-9, hi - lo)) * (H - 16)
  const linea = puntos.map((p, i) => (p.valor == null ? null : `${X(i).toFixed(1)},${Y(p.valor).toFixed(1)}`)).filter(Boolean).join(' ')
  return <section className={v.error} data-estado={estado}>
    <div className={v.lampara} aria-hidden />
    <div className={v.errCab}>
      <Ceja tono="morado">{texto(r.ceja, 'meta · realidad · error')}</Ceja>
      <span className={v.clima} data-estado={estado}><i />{estado === 'duele' ? 'duele' : estado === 'calma' ? 'en calma' : 'sin dato'}</span>
    </div>
    <div className={v.tres}>
      <div className={v.celdaE} data-tipo="meta">
        <p className={v.etq}>la meta</p>
        {meta ? <><Cifra n={meta.valor} usd={usd} /><p className={v.sub}>{meta.texto}</p><p className={v.fte}>{meta.fuente}{meta.fecha ? ` · ${meta.fecha}` : ''}</p></>
          : <div className={v.hueco}>
            <b className={v.sinMeta}>sin meta</b>
            <p className={v.sub}>{texto(r.sinMeta, `No hay meta escrita en su fuente: pendiente de ${NOMBRE_DUENO()}.`)}</p>
            <button type="button" className={v.ponla} onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); pedirALevy(`Quiero ponerle meta a ${(esOrgano(r.organo) ? ORGANO[r.organo].nombre : 'este órgano')} en mi mapa. Hoy su realidad es ${ultimo != null ? new Intl.NumberFormat('es-MX').format(ultimo) : 'sin dato'}${real ? ` ${real.etiqueta}` : c ? ` (${c.nombre.toLocaleLowerCase('es')})` : ''}. Ayúdame a elegir el número y la fecha, y escríbela en su fuente cuando la firme.`) }}>
              <Plus size={15} aria-hidden />Ponle meta</button>
          </div>}
      </div>
      <span className={v.op}>−</span>
      <div className={v.celdaE} data-tipo="realidad">
        <p className={v.etq}>la realidad</p>
        {ultimo != null ? (real ? <b className={v.valor}>{real.valor}{real.total != null ? <small> de {real.total}</small> : null}</b> : <Cifra n={ultimo} usd={usd} />)
          : <b className={v.valor} data-sin="">{otra === 'leyendo' ? '…' : 'sin dato'}</b>}
        <p className={v.sub}>{real ? `${real.nombre}: ${real.etiqueta}` : c ? c.nombre : serie ? 'su serie no respondió' : 'sin serie conectada'}</p>
        <p className={v.fte}>{real ? real.fuente : c ? c.fuente : ''}{!real && consulta.data?.hasta ? ` · al ${consulta.data.hasta}` : ''}</p>
      </div>
      <span className={v.op}>=</span>
      <div className={v.celdaE} data-tipo="error">
        <p className={v.etq}>el error</p>
        {error != null ? <Cifra n={Math.abs(error)} usd={usd} /> : <b className={v.valor} data-sin="">—</b>}
        <p className={v.sub}>{error == null ? (meta ? 'sin realidad para restar' : 'sin meta no hay error que medir') : error > 0 ? 'falta para la meta' : 'la meta ya se cruzó'}</p>
        <p className={v.fte}>{m == null ? 'tendencia: poca historia' : `tendencia 14 días: ${crece ? 'el error crece' : meta ? 'el error se cierra' : m > 0 ? 'sube' : m < 0 ? 'baja' : 'plana'}`}</p>
      </div>
    </div>
    {vals.length > 1 ? <svg className={v.chispa} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {corr ? <rect x={0} width={W} y={Y(corr.hi)} height={Math.max(2, Y(corr.lo) - Y(corr.hi))} className={v.corredor} /> : null}
      <polyline points={linea} className={v.trazo} />
      {ultimo != null ? <circle cx={X(puntos.length - 1)} cy={Y(ultimo)} r={5} className={v.punto} /> : null}
    </svg> : null}
    {lectura?.frase && estado !== 'sin-dato' ? <p className={v.frase}>{lectura.frase}</p> : null}
  </section>
}

// ════════════════════════════════════════════════════════════════════════════
// ACTIVIDAD: quién lo trabaja ahora y lo último que hizo
// ════════════════════════════════════════════════════════════════════════════
function etapasDe(etapas: Etapa[] | undefined, columnas: string[]) {
  return (etapas ?? []).filter(e => columnas.includes(e.etapa))
}

function Actividad({ b: r, ctx }: PropsBloque) {
  const columnas = lista(r.columnas, esTexto)
  const palabras = lista(r.palabras, esTexto).map(p => p.toLocaleLowerCase('es'))
  const { embudo } = useEmbudo()
  const respEmbudo = useFuente<RespuestaEmbudo>(URL_EMBUDO).data
  const crons = useFuente<CronSnapshot>(urlRutinas())
  const trabajos = useFuente<Trabajos>(urlTrabajos(6), ctx.modo === 'cerca' ? 15_000 : undefined)
  const suyas = (r.todas === true ? embudo?.etapas ?? [] : etapasDe(embudo?.etapas, columnas))
  const rutinas = [...new Map(suyas.flatMap(e => (e.rutinas ?? []).filter(x => x.activa && x.id).map(x => [x.id as string, { ...x, etapa: e.nombre }]))).values()]
  const filas = rutinas.map(rt => {
    const job = crons.data?.jobs.find(j => j.id === rt.id)
    if (job) { const e = estadoRutina(job, crons.data!.runs); return { id: rt.id!, que: rt.que_hace, tono: e.tono, texto: e.texto, ms: e.ms ?? null } }
    const l = corridaLaunchd(respEmbudo && respEmbudo.activo ? respEmbudo.launchd?.[rt.id!] : undefined)
    const ms = respEmbudo && respEmbudo.activo ? Date.parse(respEmbudo.launchd?.[rt.id!]?.medidoEn ?? '') || null : null
    return { id: rt.id!, que: rt.que_hace, tono: l.tono, texto: l.texto, ms }
  }).sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))
  const agentes = (trabajos.data?.internas ?? []).filter(t => t.estado === 'trabajando' && palabras.length > 0 && palabras.some(p => t.descripcion.toLocaleLowerCase('es').includes(p)))
  const ultima = filas.find(f => f.ms)
  return <section className={v.actividad}>
    <Ceja tono="morado">{texto(r.ceja, 'quién lo trabaja')}</Ceja>
    <div className={v.ahora}>
      <span className={v.etq}>ahora</span>
      {agentes.length ? agentes.slice(0, 2).map(a => <p key={a.id} className={v.agente}><Respira /><b>{a.descripcion}</b>{a.actividad ? <span>{a.actividad}</span> : null}</p>)
        : <p className={v.quieto}><Cpu size={16} aria-hidden />{trabajos.data ? 'Ningún agente en este órgano ahora.' : trabajos.error ? 'La Cabina no respondió.' : 'leyendo la Cabina…'}</p>}
    </div>
    <div className={v.ultimo}>
      <span className={v.etq}>lo último</span>
      {ultima ? <p className={v.ultimaTxt}><b>{ultima.que}</b> · {ultima.texto}{ultima.ms ? ` · ${hace(ultima.ms)}` : ''}</p>
        : <p className={v.quieto}>{rutinas.length ? 'Sus rutinas todavía no reportan una corrida.' : 'Ninguna rutina corre sola en este órgano todavía.'}</p>}
    </div>
    {filas.length > 0 && <ul className={v.rutinas}>
      {filas.slice(0, 4).map(f => <li key={f.id} data-tono={f.tono}><i />{f.que}<span>{f.texto}</span></li>)}
    </ul>}
  </section>
}

// ════════════════════════════════════════════════════════════════════════════
// DECISIÓN: la bandeja sobre su órgano
// ════════════════════════════════════════════════════════════════════════════
function Decision({ b: r, ctx }: PropsBloque) {
  const bandeja = useBandeja(ctx.modo === 'cerca' ? 8_000 : 60_000)
  // Cuántas tarjetas caben: una por defecto (el texto largo de una recomendación se recorta; el completo, al pasar encima).
  const max = Math.max(1, Math.min(3, Math.round(numero(r.max, 1))))
  if (!esOrgano(r.organo)) return <Hueco>decision: «organo» es uno de {ORGANOS.join(', ')} (la tarjeta declara el suyo)</Hueco>
  const suyas = tarjetasDe(bandeja.vista?.pendientes ?? [], r.organo)
  if (!bandeja.vista) return <section className={v.decision} data-vacia=""><Ceja tono="oro">{texto(r.ceja, 'decisiones de la bandeja')}</Ceja><p className={v.quieto}>{bandeja.error ? 'La bandeja no respondió.' : 'leyendo la bandeja…'}</p></section>
  if (!suyas.length) return <section className={v.decision} data-vacia=""><Ceja tono="oro">{texto(r.ceja, 'decisiones de la bandeja')}</Ceja><p className={v.quieto}>Nada espera tu toque en este órgano.</p></section>
  return <section className={v.decision}>
    <Ceja tono="oro">{texto(r.ceja, 'espera tu toque')} · {suyas.length}</Ceja>
    {suyas.slice(0, max).map(t => <article key={t.id} className={v.tarjeta}>
      <p className={v.tTitulo} title={t.titulo}>{t.titulo}</p>
      {t.recomendacion ? <p className={v.tReco} title={t.recomendacion}><b>Levy recomienda {t.recomienda === 'no' ? 'no' : 'sí'}:</b> {t.recomendacion}</p> : null}
      <div className={v.tAcciones}>
        <button type="button" className={v.si} disabled={!!bandeja.ocupado} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void bandeja.resolver(t.id, 'si') }}>{t.botonSi ?? 'Sí'}</button>
        <button type="button" className={v.no} disabled={!!bandeja.ocupado} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void bandeja.resolver(t.id, 'no') }}>No</button>
        <button type="button" className={v.otro} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ctx.ir('panel:diario') }}>Otro<ChevronRight size={14} aria-hidden /></button>
      </div>
    </article>)}
    {suyas.length > max ? <p className={v.quieto}>y {suyas.length - max} más en la bandeja</p> : null}
  </section>
}

// ════════════════════════════════════════════════════════════════════════════
// TERMINALES: una por etapa que siente
// ════════════════════════════════════════════════════════════════════════════
function Terminales({ b: r }: PropsBloque) {
  const { embudo, cargando } = useEmbudo()
  const columnas = lista(r.columnas, esTexto)
  if (!embudo) return <section className={v.terminales}><Ceja>{texto(r.ceja, 'sus terminales')}</Ceja><p className={v.quieto}>{cargando ? 'leyendo el embudo…' : 'sin dato del embudo'}</p></section>
  const nombre = Object.fromEntries((embudo.embudos ?? []).map(b => [b.id, b.nombre]))
  const orden = Object.fromEntries((embudo.embudos ?? []).map((b, i) => [b.id, i]))
  const suyas = (r.rutinas === true ? embudo.etapas.filter(e => (e.rutinas ?? []).some(x => x.activa)) : embudo.etapas.filter(e => columnas.includes(e.etapa)))
    .sort((a, b) => COLS.indexOf(a.etapa) - COLS.indexOf(b.etapa) || (orden[a.embudo] ?? 0) - (orden[b.embudo] ?? 0))
  return <section className={v.terminales}>
    <Ceja>{texto(r.ceja, 'sus terminales · una por etapa que siente')}</Ceja>
    <ul className={v.terms} style={{ '--cols': numero(r.columnasLista, 2) } as CSSProperties}>
      {suyas.map(e => { const on = e.opera_hoy && e.mide?.hay_numero, cu = e.cuello?.es
        return <li key={e.id} data-on={on ? '' : undefined} data-cuello={cu ? '' : undefined}><i />
          <div><b>{e.nombre}</b><span>{cu ? <em>cuello · </em> : null}{nombre[e.embudo] ?? e.embudo} · {e.mide?.nombre}</span></div></li> })}
    </ul>
  </section>
}

// ════════════════════════════════════════════════════════════════════════════
// TIMONEL: meta − lo que mide = corrección, y los lazos
// ════════════════════════════════════════════════════════════════════════════
const COL_ORG: Record<string, string> = { Adquisición: 'Marketing', Nutrición: 'Marketing', Conversión: 'Venta', Bienvenida: 'Entrega', Entrega: 'Entrega', Expansión: 'Finanzas' }
const sinCifras = (f?: string) => (f ?? '').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x && !/\d/.test(x)).join(' ')

function Timonel({ b: r }: PropsBloque) {
  const { embudo, cargando } = useEmbudo()
  if (!embudo) return <Hueco>{cargando ? 'Leyendo el embudo…' : 'Sin dato del embudo: el timonel no tiene qué restar.'}</Hueco>
  const cu = embudo.etapas.find(e => e.cuello?.es)
  if (!cu) return <Hueco>El embudo no marca un cuello.</Hueco>
  const nom = Object.fromEntries((embudo.embudos ?? []).map(b => [b.id, b.nombre]))
  const mide = cu.mide
  const hay = !!mide?.hay_numero && mide.valor != null
  const vol = embudo.aristas.find(a => a.tipo === 'volante')
  return <section className={v.timonel}>
    <p className={v.timBajada}>{texto(r.bajada, `${NOMBRE_DUENO()} decide. Levy atenúa: le sube decisiones, no reportes.`)}</p>
    <div className={v.ecuacion}>
      <article className={v.term} data-tipo="meta"><p className={v.etq}>la meta</p><p className={v.metaTxt}>{sinCifras(cu.cuello.frase) || cu.nombre}</p></article>
      <span className={v.opG}>−</span>
      <article className={v.term} data-tipo="mide" data-sin={hay ? undefined : ''}><p className={v.etq}>lo que mide · su número</p><p className={v.termT}>{mide?.nombre}</p>
        {hay ? <b className={v.valor}>{FMT(Number(mide.valor))}</b> : null}<p className={v.sub}>{hay ? 'Con número: vive en su fuente.' : `Sin número todavía: ${mide?.frecuencia ?? ''}`}</p></article>
      <span className={v.opG}>=</span>
      <article className={v.term} data-tipo="corr"><p className={v.etq}>la corrección</p><p className={v.termT}>Empujar «{cu.nombre}»</p><p className={v.sub}>el cuello · {nom[cu.embudo] ?? cu.embudo}</p>
        <p className={v.baja}>↓ baja la corrección · a {COL_ORG[cu.etapa] ?? 'su órgano'}</p></article>
    </div>
    <div className={v.lazos}>
      <div className={v.lazo} data-tipo="b"><span className={v.lazoSello}>B</span><div><p className={v.lazoK}>lazo negativo · corrige hacia la meta</p>
        <p className={v.lazoX}>{mide?.nombre} es el número del timonel. Contra la meta, la diferencia empuja «{cu.nombre}».</p>
        <p className={v.lazoY}>Frena o empuja. {hay ? 'Hoy corre.' : 'Hoy no corre: su número todavía no existe.'}</p></div></div>
      {vol ? <div className={v.lazo} data-tipo="r"><span className={v.lazoSello}>R</span><div><p className={v.lazoK}>lazo positivo · {vol.accion}</p>
        <p className={v.lazoX}>{vol.nota ?? 'Crece solo cuando arranca.'}</p><p className={v.lazoY}>Crece solo cuando arranca.</p></div></div> : null}
    </div>
    <p className={v.fte}>Embudo del {embudo.generado ?? ''}, leído en vivo de embudo.json.</p>
  </section>
}

export const BLOQUES_NERVIOSO: Record<string, ComponenteBloque> = {
  'organo-vivo': OrganoBloque, 'meta-error': ErrorMeta, actividad: Actividad, decision: Decision, terminales: Terminales, timonel: Timonel,
}
