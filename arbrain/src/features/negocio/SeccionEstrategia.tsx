'use client'
/**
 * Estrategia v2 (9 nov 2026). Daniel: «ahora mismo tengo mi panel de estrategia, pero no me encanta! quiero algo tan bonito
 * visualmente como business intelligence… es mucho texto».
 *
 * La vara es Business Intelligence (features/bi): arriba el mercado habla primero (una palabra en serif y una frase) y
 * debajo, cuatro tarjetas, una por pregunta. Cada tarjeta es una pregunta en serif, UNA figura que la contesta y UNA frase;
 * el detalle de antes (segmentos, fichas con su cara, tendencias, borradores con su evidencia) queda plegado al pie.
 *
 *  · ¿Quién te compra?        una barra por escalón partida en sus segmentos (las unidades de cada escalón no se cruzan).
 *  · ¿Contra quién…?          la escalera de precios: un punto por quien cobra en cada peldaño, oro donde estás tú,
 *                             punteado en el hueco; debajo, las caras de los directos en español.
 *  · ¿Hacia dónde va?         lo que ya pasa en inglés cruzando hacia el español: 10 puntos hoy, la franja de 6 a 12 meses
 *                             y las señales que ya se mueven aquí.
 *  · ¿Qué decides tú?         los cuatro sellos (tres avatares y la frase): punteado mientras no estén firmados.
 *
 * Las frases salen del archivo (la cabeza de mercado.json, la frase de posicionamiento) o son conteos; no se redacta nada
 * aquí. Lo no firmado lleva su sello. Mismos datos: `mercado.json` vía features/negocio/estrategia.ts.
 *
 * Nada nace en opacidad 0 (9 nov): la captura de las 10:26 salió con SaaS Factory y el Acompañamiento en blanco porque cada
 * tarjeta entraba escalonada desde invisible (hasta 1.2 s) y la pestaña elegida se volvía a montar. Ahora el contenido se
 * pinta de una; solo las marcas de las figuras crecen, y sus números y nombres ya están a la vista.
 *
 * La tarjeta Estrategia de El pulso deja un pedido (LLAVE_VISTA_ESTRATEGIA): la sección baja a esa tarjeta.
 * En la edición del alumno, sin su investigación, dice «Conecta tu investigación» y no pinta nada más.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, Compass, EyeOff, X } from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { esEdicionCliente } from '@/lib/edicion'
import { escucharPedido, tomarPedido } from '@/shared/navigation/ir-a'
import {
  alcanceDe, audiencia, directos, dominio, esVista, EVENTO_VISTA_ESTRATEGIA, fechaHumana, fraseRumbo, iniciales, lineaDe, LLAVE_VISTA_ESTRATEGIA, marcaDe,
  nombreCorto, ofertasDePago, pie, sinFirmar, titularDe, tramos, URL_ESTRATEGIA,
  type Borrador, type Competidor, type ContraQuien, type Escalon as EscalonT, type Evidencia, type HaciaDonde, type Imagen, type Linea, type LoQueDecides, type Mercado,
  type Peldano, type QuienCompra, type Referente, type RespuestaEstrategia, type Segmento, type Vista,
} from './estrategia'
import l from '@/features/cabina/luz.module.css'
import e from './estrategia.module.css'
import x from './estrategia-seccion.module.css'
import v from './estrategia-panel.module.css'

const mayus = (t: string) => (t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t)
/** El precio de la tarjeta, corto: sin paréntesis ni la letra pequeña que sigue a «;», «,» o «con». */
const corto = (precio: string) => precio.split(/\s\(|;\s|,\s|\scon\s/)[0]
const numero = (n: number) => n.toLocaleString('es-MX')

const PREGUNTAS: Record<Vista, string> = {
  compra: '¿Quién te compra?',
  contra: '¿Contra quién te comparan?',
  rumbo: '¿Hacia dónde va el mercado?',
  decides: '¿Qué decides tú?',
}

export function Estrategia({ grande }: { grande?: boolean }) {
  const { data, error } = useFuente<RespuestaEstrategia>(URL_ESTRATEGIA)
  const raiz = useRef<HTMLDivElement>(null)
  const [pedida, setPedida] = useState<Vista | null>(null)
  // El pedido de la tarjeta de El pulso: al montarse lo toma; ya montada, lo escucha. La sección baja a esa tarjeta.
  useEffect(() => {
    const p = tomarPedido(LLAVE_VISTA_ESTRATEGIA)
    if (esVista(p)) setPedida(p)
    return escucharPedido(EVENTO_VISTA_ESTRATEGIA, y => { if (esVista(y)) { tomarPedido(LLAVE_VISTA_ESTRATEGIA); setPedida(y) } })
  }, [])

  const on = data?.activo ? data : null
  const cliente = on ? on.cliente : esEdicionCliente()
  const datos = on?.datos ?? null
  let estado: 'leyendo' | 'apagado' | 'vacia' | 'error' | 'lista'
  if (!data && !error) estado = 'leyendo'
  else if (data && !data.activo) estado = 'apagado'
  else if ((!on && cliente) || (on && !on.existe)) estado = 'vacia'
  else if (!on || !datos) estado = 'error'
  else estado = 'lista'

  useEffect(() => {
    if (!pedida || estado !== 'lista') return
    raiz.current?.querySelector(`[data-tarjeta="${pedida}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [pedida, estado])

  const pendientes = datos ? sinFirmar(datos.lo_que_decides) : 0
  const precio = datos ? lineaDe(datos.cabeza, 'precio') : null
  return <div ref={raiz} className={`${v.raiz} ${grande ? v.grande : ''}`} data-testid="estrategia-seccion" data-estado={estado}>
    <div className={v.luna} aria-hidden />
    <header className={v.cabeza}>
      <div className={v.cejaFila}>
        <p className={v.ceja}>Estrategia{datos?.actualizado ? <> · <b>{fechaHumana(datos.actualizado)}</b></> : null}</p>
        {estado === 'lista' && datos?.lo_que_decides && !on?.oculto.includes('decides') && <span className={v.pulso} data-pendiente={pendientes > 0 || undefined}>
          <i aria-hidden />{pendientes > 0 ? `${pendientes} sin firmar` : 'todo firmado'}
        </span>}
      </div>
      <h3 className={v.palabra}>{estado === 'lista' && datos ? titularDe(datos) : estado === 'leyendo' ? 'Leyendo tu mercado' : 'Tu mercado'}</h3>
      {estado === 'lista' && precio && <p className={v.frase}>{precio.respuesta}<small>{pie(precio, datos?.actualizado)}</small></p>}
      {estado === 'leyendo' && <p className={v.frase} aria-busy="true">Quién te compra, contra quién te comparan, hacia dónde va y lo que decides. Un momento.</p>}
    </header>

    {estado === 'apagado' && <p className={l.aviso}>Tu negocio está apagado en esta instalación (ARBRAIN_PANEL_NEGOCIO=0).</p>}
    {estado === 'vacia' && <Vacia />}
    {estado === 'error' && <p className={l.aviso}>{error ? `No se pudo leer ahora: ${error}` : 'La investigación no se pudo leer.'}{on?.errores?.slice(0, 3).map(y => <span key={y} className={x.errorLinea}>{y}</span>)}</p>}

    {estado === 'lista' && on && datos && <>
      {on.directo && <p className={x.directo}><EyeOff size={12} aria-hidden />En directo: tus números quedan fuera; lo público se ve.</p>}
      <div className={v.rejilla}>
        <Tarjeta id="compra" n={1} oculto={on.oculto.includes('compra')} pedida={pedida === 'compra'}
          frase={lineaDe(datos.cabeza, 'compra')} ref_={datos.actualizado}
          figura={datos.quien_compra && <FiguraCompra q={datos.quien_compra} />}
          detalle={datos.quien_compra && { cuantos: datos.quien_compra.escalones.reduce((s, y) => s + y.segmentos.length, 0), que: 'segmentos', cuerpo: <Compra q={datos.quien_compra} ref_={datos.actualizado} /> }} />
        <Tarjeta id="contra" n={2} oculto={on.oculto.includes('contra')} pedida={pedida === 'contra'}
          frase={lineaDe(datos.cabeza, 'contra')} ref_={datos.actualizado}
          figura={datos.contra_quien && <FiguraContra c={datos.contra_quien} ref_={datos.actualizado} />}
          detalle={datos.contra_quien && { cuantos: datos.contra_quien.hispanos.length + datos.contra_quien.anglos.length, que: 'competidores y referentes', cuerpo: <Contra c={datos.contra_quien} ref_={datos.actualizado} /> }} />
        <Tarjeta id="rumbo" n={3} oculto={on.oculto.includes('rumbo')} pedida={pedida === 'rumbo'}
          frase={datos.hacia_donde && { texto: fraseRumbo(datos.hacia_donde), pie: pie(datos.hacia_donde, datos.actualizado) }} ref_={datos.actualizado}
          figura={datos.hacia_donde && <FiguraRumbo h={datos.hacia_donde} />}
          detalle={datos.hacia_donde && { cuantos: datos.hacia_donde.tendencias.length, que: 'tendencias', cuerpo: <Rumbo h={datos.hacia_donde} ref_={datos.actualizado} /> }} />
        <Tarjeta id="decides" n={4} oculto={on.oculto.includes('decides')} pedida={pedida === 'decides'}
          frase={null} ref_={datos.actualizado}
          figura={datos.lo_que_decides && <FiguraDecides d={datos.lo_que_decides} ref_={datos.actualizado} />}
          detalle={datos.lo_que_decides && { cuantos: datos.lo_que_decides.avatares.length + (datos.lo_que_decides.posicionamiento ? 1 : 0), que: 'borradores con su evidencia', cuerpo: <Decides d={datos.lo_que_decides} ref_={datos.actualizado} /> }} />
      </div>
      {on.errores?.length ? <p className={x.avisoErrores}>{on.errores.length} {on.errores.length === 1 ? 'pieza no se pudo leer' : 'piezas no se pudieron leer'}: {on.errores[0]}</p> : null}
      <footer className={v.pie}>Fuente: tu investigación de mercado (mercado.json). Cada número trae la suya; lo que dice «sin firmar» es propuesta de Levy, no decisión.</footer>
    </>}
  </div>
}

function Vacia() {
  return <section className={x.vacia} aria-label="Conecta tu investigación">
    <span className={x.vaciaIcono} aria-hidden><Compass size={22} strokeWidth={2} /></span>
    <h3>Conecta tu investigación</h3>
    <p>Pídele a Levy que investigue tu mercado: quién te compra de verdad, contra quién te comparan, a qué precio y hacia dónde va. Aparece aquí en cuanto exista <code>mercado.json</code> en tu cerebro.</p>
    <p className={l.fuente}>Nada se inventa mientras tanto.</p>
  </section>
}

/**
 * Una pregunta: su figura, su frase y el detalle plegado. `frase` es una línea de la cabeza (lectura de Levy con su fuente) o
 * un conteo; en «decides» la frase vive dentro de la figura (es la de posicionamiento, con su sello).
 */
function Tarjeta({ id, n, oculto, pedida, frase, figura, detalle, ref_ }: {
  id: Vista; n: number; oculto: boolean; pedida: boolean; ref_: string | null
  frase: Linea | { texto: string; pie: string } | null; figura: ReactNode
  detalle: { cuantos: number; que: string; cuerpo: ReactNode } | null
}) {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => { if (pedida) setAbierto(false) }, [pedida])
  const texto = frase ? ('respuesta' in frase ? frase.respuesta : frase.texto) : null
  const pieFrase = frase ? ('respuesta' in frase ? pie(frase, ref_) : frase.pie) : null
  return <article className={v.tarjeta} data-tarjeta={id} data-pedida={pedida || undefined} aria-label={PREGUNTAS[id]}>
    <p className={v.indice}><span>{String(n).padStart(2, '0')}</span></p>
    <h4 className={v.pregunta}>{PREGUNTAS[id]}</h4>
    {oculto ? <p className={x.oculto}><EyeOff size={14} aria-hidden />Oculto en directo: esta parte trae números de tu negocio.</p> : !figura ? <p className={l.vacio}>Tu investigación no trae esta parte todavía.</p> : <>
      <div className={v.figura}>{figura}</div>
      {texto && <p className={v.lectura}><b>Levy</b>{texto}</p>}
      {pieFrase && <p className={v.fuente}>{pieFrase}</p>}
      {detalle && <details className={v.detalle} open={abierto} onToggle={ev => setAbierto((ev.currentTarget as HTMLDetailsElement).open)}>
        <summary><ChevronDown size={14} aria-hidden />Ver el detalle<small>{detalle.cuantos} {detalle.que}</small></summary>
        {abierto && <div className={v.detalleCuerpo}>{detalle.cuerpo}</div>}
      </details>}
    </>}
  </article>
}

// ── Figuras ──

/** Quién compra: una barra por escalón, partida en sus segmentos. Cada escalón se lee contra sí mismo (su unidad, su total). */
function FiguraCompra({ q }: { q: QuienCompra }) {
  return <div className={v.compra}>
    {q.escalones.map(esc => <BarraEscalon key={esc.id} esc={esc} />)}
  </div>
}

function BarraEscalon({ esc }: { esc: EscalonT }) {
  const ts = tramos(esc)
  return <section className={v.escalon} aria-label={esc.nombre}>
    <p className={v.escalonCabeza}><b>{esc.nombre}</b>{ts.find(t => t.unidad) && <small>en {ts.find(t => t.unidad)!.unidad}</small>}</p>
    <div className={v.barra} role="img" aria-label={ts.map(t => `${t.nombre}: ${t.valor === null ? 'sin dato' : `${numero(t.valor)} ${t.unidad ?? ''}`}`).join('; ')}>
      {ts.map((t, k) => t.valor === null
        ? <i key={t.nombre} data-sin-dato title={`${t.nombre}: sin dato`} />
        : <i key={t.nombre} data-k={k} style={{ flexGrow: Math.max(t.parte, 0.02) }} title={`${t.nombre}: ${numero(t.valor)} ${t.unidad ?? ''}`} />)}
    </div>
    <ul className={v.leyenda}>{ts.map((t, k) => <li key={t.nombre} data-k={t.valor === null ? undefined : k}>
      <i aria-hidden /><b>{t.valor === null ? 'Sin dato' : numero(t.valor)}</b><span>{t.nombre}</span>
    </li>)}</ul>
  </section>
}

/**
 * Contra quién: la escalera de precios. Cada peldaño sube; un punto por quien cobra ahí (lleno en español, hueco en inglés),
 * el oro donde estás tú y el punteado en el hueco. Abre en el hueco; tocar otro peldaño cambia la línea de abajo.
 */
function FiguraContra({ c, ref_ }: { c: ContraQuien; ref_: string | null }) {
  const esc = c.escalera
  const inicial = esc ? Math.max(0, esc.peldanos.findIndex(p => p.hueco)) : 0
  const [sel, setSel] = useState(inicial)
  const dir = directos(c.hispanos)
  return <div className={v.contra}>
    {esc && esc.peldanos.length > 0 && <>
      <div className={v.peldanos} role="tablist" aria-label="Peldaños de precio">
        {esc.peldanos.map((y, i) => {
          const hisp = y.quienes.filter(q => q.mercado === 'hispano').length, angl = y.quienes.length - hisp
          const alto = 46 + Math.round((i / Math.max(1, esc.peldanos.length - 1)) * 74)
          return <button key={y.id} type="button" role="tab" aria-selected={sel === i} onClick={() => setSel(i)} title={`${y.nombre} · ${y.rango}`}
            data-hueco={y.hueco || undefined} data-tu={y.tu ? '' : undefined} style={{ height: alto }}>
            {y.hueco && <span className={v.huecoEtiqueta}>El hueco</span>}
            <span className={v.puntos} aria-hidden>
              {Array.from({ length: hisp }, (_, k) => <b key={`h${k}`} />)}
              {Array.from({ length: angl }, (_, k) => <b key={`a${k}`} data-anglo />)}
            </span>
            {y.tu && <span className={v.tu} aria-label="Tú">Tú</span>}
          </button>
        })}
      </div>
      <Peldano p={esc.peldanos[sel] ?? esc.peldanos[0]} ref_={ref_} />
      <p className={v.leyendaEscalera}><i className={v.lHisp} aria-hidden />En español <i className={v.lAngl} aria-hidden />En inglés <i className={v.lTu} aria-hidden />Tú <i className={v.lHueco} aria-hidden />El hueco</p>
    </>}
    {dir.length > 0 && <div className={v.caras} aria-label={`${dir.length} directos en español`}>
      <span className={v.carasFila}>{dir.slice(0, 12).map(y => <span key={y.nombre} className={v.cara} title={y.nombre}><Cara nombre={y.nombre} imagen={y.imagen} chica /></span>)}</span>
      <small>{dir.length} directos en español · {c.anglos.length} referentes en inglés</small>
    </div>}
  </div>
}

function Peldano({ p, ref_ }: { p: Peldano; ref_: string | null }) {
  return <div className={v.peldano} data-hueco={p.hueco || undefined} aria-live="polite">
    <p className={v.peldanoCabeza}><b>{p.nombre}</b><span>{p.rango}</span></p>
    {p.tu ? <p className={v.peldanoTu}><i aria-hidden /><span><b>Tú:</b> {p.tu.texto}</span></p>
      : <p className={v.peldanoQuienes}>{p.quienes.length ? `${p.quienes.length} cobran aquí: ${p.quienes.slice(0, 3).map(q => nombreCorto(q.nombre)).join(', ')}${p.quienes.length > 3 ? '…' : ''}` : 'Nadie publica precio aquí.'}</p>}
    <details className={v.peldanoMas}>
      <summary>Quién cobra aquí y de dónde sale</summary>
      <Lectura p={p} ref_={ref_} />
    </details>
  </div>
}

/**
 * Hacia dónde va: lo que hoy pasa en inglés cruza al español. Arriba, un punto por tendencia en «hoy»; cada uno baja a la
 * franja de 6 a 12 meses del español (dentro de la franja la posición no es fecha). Abajo a la izquierda, las señales que
 * ya se mueven en español. Tocar un punto muestra su tendencia y lo que anticipa.
 */
function FiguraRumbo({ h }: { h: HaciaDonde }) {
  const [sel, setSel] = useState(0)
  const n = h.tendencias.length, s = h.senales_hispanas?.lista.length ?? 0
  const W = 480, H = 176, yIng = 34, yEsp = 136
  const xHoy = (k: number) => 30 + k * Math.min(16, 150 / Math.max(1, n))
  const banda = { x: 268, w: 196 }
  const enBanda = (k: number) => {
    const cols = Math.ceil(n / 2), fila = k % 2, col = Math.floor(k / 2)
    return { x: banda.x + 22 + col * ((banda.w - 44) / Math.max(1, cols - 1)), y: yEsp - 8 + fila * 16 }
  }
  const t = h.tendencias[sel]
  return <div className={v.rumbo}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${n} tendencias en inglés que cruzan al español en 6 a 12 meses; ${s} señales ya se mueven en español`}>
      <rect className={v.franja} x={banda.x} y={yEsp - 24} width={banda.w} height={48} rx={12} />
      <line className={v.carril} x1={20} x2={W - 8} y1={yIng} y2={yIng} />
      <line className={v.carril} x1={20} x2={W - 8} y1={yEsp} y2={yEsp} />
      <text className={v.etiqueta} x={20} y={yIng - 14}>En inglés · hoy</text>
      <text className={v.etiqueta} x={20} y={yEsp + 32}>En español</text>
      <text className={v.etiqueta} x={banda.x + banda.w / 2} y={yEsp + 38} textAnchor="middle">en 6 a 12 meses</text>
      {h.tendencias.map((_, k) => {
        const a = { x: xHoy(k), y: yIng }, b = enBanda(k)
        return <path key={`c${k}`} className={v.cruce} data-sel={sel === k || undefined} d={`M${a.x},${a.y} C${a.x + 110},${a.y + 10} ${b.x - 120},${b.y - 10} ${b.x},${b.y}`} />
      })}
      {h.senales_hispanas?.lista.map((y, k) => <circle key={`s${k}`} className={v.senal} cx={30 + k * 14} cy={yEsp} r={5}><title>{y.texto}</title></circle>)}
      {s > 0 && <text className={v.etiquetaFuerte} x={30 + s * 14 + 4} y={yEsp + 4}>{s} ya aquí</text>}
      {h.tendencias.map((y, k) => {
        const a = { x: xHoy(k), y: yIng }, b = enBanda(k)
        return <g key={`t${k}`} className={v.tendencia} data-sel={sel === k || undefined} onClick={() => setSel(k)} role="button" tabIndex={0} aria-label={`${k + 1}. ${y.tendencia}`}
          onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSel(k) } }}>
          <circle cx={a.x} cy={a.y} r={sel === k ? 7 : 5.5} />
          <circle className={v.llega} cx={b.x} cy={b.y} r={4.5} />
          <circle className={v.toque} cx={a.x} cy={a.y} r={11} />
        </g>
      })}
      <text className={v.etiquetaFuerte} x={xHoy(n - 1) + 14} y={yIng + 4}>{n}</text>
    </svg>
    {t && <div className={v.tendenciaSel}>
      <p><span>{String(sel + 1).padStart(2, '0')}</span>{t.tendencia}</p>
      {t.en_espanol && <p className={v.enEspanol}><b>En español</b>{t.en_espanol}</p>}
    </div>}
  </div>
}

/** Lo que decides: un sello por pieza (los avatares por escalón y la frase). Punteado = sin firmar; lleno = firmado con su fecha. */
function FiguraDecides({ d, ref_ }: { d: LoQueDecides; ref_: string | null }) {
  const piezas = [...d.avatares.map(a => ({ nombre: a.escalon, b: a as Borrador })), ...(d.posicionamiento ? [{ nombre: 'La frase', b: d.posicionamiento }] : [])]
  const firmados = piezas.filter(y => y.b.estado === 'firmado').length
  const p = d.posicionamiento
  return <div className={v.decides}>
    <div className={v.sellos}>
      {piezas.map(y => <span key={y.nombre} className={v.sello} data-firmado={y.b.estado === 'firmado' || undefined}>
        <i aria-hidden>{y.b.estado === 'firmado' ? '✓' : iniciales(y.nombre)}</i>
        <small>{nombreCorto(y.nombre).replace(/^Audiencia de /, '')}</small>
      </span>)}
      <span className={v.cuenta}><b>{firmados} de {piezas.length}</b><small>firmados</small></span>
    </div>
    {p && <blockquote className={v.posicionamiento} data-firmado={p.estado === 'firmado' || undefined}>
      <p>«{p.estado === 'firmado' && p.firmado?.texto ? p.firmado.texto : p.borrador}»</p>
      <footer><span className={x.firma}>{p.estado === 'firmado' ? `Firmada ${fechaHumana(p.firmado!.fecha, ref_)}` : 'Borrador de Levy · sin firmar'}</span></footer>
    </blockquote>}
    {d.estado !== 'firmado' && d.como_firmar && <p className={v.fuente}>{d.como_firmar}</p>}
  </div>
}

// ── El detalle plegado (lo de antes, sin entradas escalonadas) ──

function Titulo({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return <div className={l.seccion}><h4>{children}</h4>{nota && <small>{nota}</small>}</div>
}

function ListaEvidencia({ xs, ref_ }: { xs: Evidencia[]; ref_: string | null }) {
  if (!xs.length) return null
  return <ul className={e.evidencia}>{xs.map((y, i) => <li key={i} data-tipo={y.tipo}>
    {y.tipo === 'cita' ? <blockquote>«{y.texto}»</blockquote> : <span>{y.texto}</span>}
    <small>{y.lectura ? 'Lectura · ' : ''}{pie(y, ref_)}</small>
  </li>)}</ul>
}

/** Desplegar algo que se acaba de elegir y traerlo a la vista (en el teléfono queda debajo de la cuadrícula). */
function useAlElegir<T>(elegido: T | null) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (elegido !== null) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }, [elegido])
  return ref
}

// ── 1. Quién compra ──

function Compra({ q, ref_ }: { q: QuienCompra; ref_: string | null }) {
  // Aquí las cifras grandes son los segmentos mismos: no se suman (las unidades y los universos de cada escalón no se mezclan).
  return <div className={x.vista}>
    {q.escalones.map(esc => <Escalon key={esc.id} esc={esc} ref_={ref_} />)}
    {q.huecos.length > 0 && <details className={e.plegable}>
      <summary>Lo que estos datos no dicen <small>{q.huecos.length}</small></summary>
      <ul className={e.lista}>{q.huecos.map(h => <li key={h}>{h}</li>)}</ul>
    </details>}
    <p className={l.fuente}>{pie(q, ref_)}</p>
  </div>
}

function Escalon({ esc, ref_ }: { esc: QuienCompra['escalones'][number]; ref_: string | null }) {
  const [abierto, setAbierto] = useState<number | null>(null)
  const max = Math.max(1, ...esc.segmentos.map(s => s.tamano?.valor ?? 0))
  const caja = useAlElegir(abierto)
  const s = abierto !== null ? esc.segmentos[abierto] : null
  return <section aria-label={esc.nombre}>
    <Titulo nota={esc.universo}>{esc.nombre}</Titulo>
    <ul className={x.segmentos}>{esc.segmentos.map((seg, k) => <li key={seg.nombre}>
      <TarjetaSegmento s={seg} max={max} abierta={abierto === k} tocar={() => setAbierto(a => (a === k ? null : k))} />
    </li>)}</ul>
    {s && <div ref={caja} className={x.detalle} data-testid="segmento-abierto">
      <DetalleSegmento s={s} ref_={ref_} cerrar={() => setAbierto(null)} />
    </div>}
    {esc.separa.length > 0 && <details className={e.plegable}>
      <summary>Qué separa al que compra <small>{esc.separa.length}</small></summary>
      <ul className={e.lista}>{esc.separa.map(y => <li key={y.texto}>{y.texto}{y.evidencia && <small className={x.letraChica}>{y.evidencia}</small>}</li>)}</ul>
    </details>}
    {esc.ventana && <p className={l.fuente}>Ventana: {esc.ventana}</p>}
  </section>
}

function TarjetaSegmento({ s, max, abierta, tocar }: { s: Segmento; max: number; abierta: boolean; tocar: () => void }) {
  const ancho = s.tamano ? Math.max(4, Math.round((s.tamano.valor / max) * 100)) : 0
  return <button type="button" className={x.segmento} aria-expanded={abierta} data-abierta={abierta || undefined} onClick={tocar}>
    {s.tamano ? <span className={x.segCifra}><strong>{numero(s.tamano.valor)}</strong><small>{s.tamano.unidad}</small></span>
      : <span className={x.segCifra} data-sin-dato><strong>Sin dato</strong></span>}
    {s.tamano && <span className={x.medidor} aria-hidden><i style={{ width: `${ancho}%` }} /></span>}
    <b className={x.segNombre}>{s.nombre}</b>
    {s.quiere && <span className={x.segQuiere}><em>Quiere</em> {s.quiere}</span>}
  </button>
}

function DetalleSegmento({ s, ref_, cerrar }: { s: Segmento; ref_: string | null; cerrar: () => void }) {
  const campos: [string, string | null][] = [['Quién', s.quien], ['Quiere', s.quiere], ['Teme', s.teme], ['Intentó antes', s.intento_antes], ['Paga', s.paga]]
  return <>
    <header className={x.detalleCabeza}>
      <span><b>{s.nombre}</b>{s.tamano && <small>{numero(s.tamano.valor)} {s.tamano.unidad}{s.tamano.que ? ` · ${s.tamano.que}` : ''} · {pie(s.tamano, ref_)}</small>}</span>
      <button type="button" className={x.cerrar} onClick={cerrar} aria-label="Cerrar"><X size={15} aria-hidden /></button>
    </header>
    <dl className={e.campos}>{campos.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <ListaEvidencia xs={s.evidencia} ref_={ref_} />
  </>
}

// ── 2. Contra quién ──

type Ficha = { tipo: 'hispano'; c: Competidor } | { tipo: 'anglo'; c: Referente }

function Contra({ c, ref_ }: { c: ContraQuien; ref_: string | null }) {
  const dir = directos(c.hispanos)
  const resto = c.hispanos.filter(y => y.grupo !== 'directo')
  const primera = c.anglos.filter(y => y.nivel !== 'segunda fila')
  const segunda = c.anglos.filter(y => y.nivel === 'segunda fila')
  return <div className={x.vista}>
    {dir.length > 0 && <Cuadricula titulo="Directos en español" nota={`${dir.length} de ${c.hispanos.length}`} fichas={dir.map(y => ({ tipo: 'hispano', c: y }))} ref_={ref_} />}
    {primera.length > 0 && <Cuadricula titulo="Referentes en inglés" nota="Lo que hacen que el mercado hispano todavía no" fichas={primera.map(y => ({ tipo: 'anglo', c: y }))} ref_={ref_} />}
    {resto.length > 0 && <details className={e.plegable}>
      <summary>Alcance, alternativas y contraste en español <small>{resto.length}</small></summary>
      <Cuadricula fichas={resto.map(y => ({ tipo: 'hispano', c: y }))} ref_={ref_} />
    </details>}
    {segunda.length > 0 && <details className={e.plegable}>
      <summary>Segunda fila en inglés <small>{segunda.length}</small></summary>
      <Cuadricula fichas={segunda.map(y => ({ tipo: 'anglo', c: y }))} ref_={ref_} />
    </details>}

    {c.comparan && <section aria-label="Contra qué te comparan">
      <Titulo>Contra qué te comparan</Titulo>
      <dl className={e.comparan}>{c.comparan.filas.map(f => <div key={f.escalon}><dt>{f.escalon}</dt><dd>{f.contra}</dd></div>)}</dl>
      <p className={l.fuente}>{pie(c.comparan, ref_)}</p>
    </section>}

    {(c.hueco.length > 0 || c.dato_promesa) && <section aria-label="Dónde está el hueco">
      <Titulo nota="Inferencia de la investigación, no dato">Dónde está el hueco</Titulo>
      <ul className={e.lista}>{c.hueco.map(h => <li key={h}>{mayus(h.replace(/^Inferencia:\s*/i, ''))}</li>)}</ul>
      {c.dato_promesa && <p className={e.dato}><b>Dato:</b> {c.dato_promesa.texto}<small>{pie(c.dato_promesa, ref_)}</small></p>}
      {c.saturado.length > 0 && <details className={e.plegable}>
        <summary>Dónde está saturado <small>{c.saturado.length}</small></summary>
        <ul className={e.lista}>{c.saturado.map(h => <li key={h}>{h}</li>)}</ul>
      </details>}
    </section>}

    {c.voz_publica && c.voz_publica.citas.length > 0 && <section aria-label="La voz del que no compró">
      <Titulo nota="Fuentes públicas, sin nombres">La voz del que no compró</Titulo>
      <ul className={e.evidencia}>{c.voz_publica.citas.map(y => <li key={y.texto} data-tipo="cita"><blockquote>«{y.texto}»</blockquote><small>{pie(y, ref_)}</small></li>)}</ul>
      {c.voz_publica.falta && <p className={l.fuente}>{c.voz_publica.falta}</p>}
    </section>}

    {c.limites.length > 0 && <details className={e.plegable}>
      <summary>Límites de esta parte <small>{c.limites.length}</small></summary>
      <ul className={e.lista}>{c.limites.map(h => <li key={h}>{h}</li>)}</ul>
    </details>}
    <p className={l.fuente}>{pie(c, ref_)}{c.convencion ? `. Convención: ${c.convencion}` : ''}</p>
  </div>
}

function Lectura({ p, ref_ }: { p: Peldano; ref_: string | null }) {
  // La fuente más común del peldaño va una vez al pie; la que difiere (un tercero, sin verificar) va junto a su precio.
  const comun = mayoria(p.quienes.map(q => `${q.fuente}|${q.fecha}`))
  const linea = (mercado: 'hispano' | 'anglo') => p.quienes.filter(q => q.mercado === mercado).map(q => <span key={q.nombre} className={x.quien}>
    {q.nombre}{q.precio !== '0' && <b>{q.precio}</b>}{`${q.fuente}|${q.fecha}` !== comun && <small>{q.fuente}, {fechaHumana(q.fecha, ref_)}</small>}
  </span>)
  const hisp = linea('hispano'), angl = linea('anglo')
  return <div className={x.lectura} data-hueco={p.hueco || undefined} aria-live="polite">
    <p className={x.lecturaCabeza}><b>{p.nombre}</b><span>{p.rango}</span>{p.hueco && <em>El hueco</em>}</p>
    {hisp.length > 0 && <p className={x.quienes}><span>Español</span>{hisp}</p>}
    {angl.length > 0 && <p className={x.quienes}><span>Inglés</span>{angl}</p>}
    {!p.quienes.length && <p className={x.nadie}>Nadie publica precio aquí.</p>}
    {p.tu && <p className={x.tu}><i aria-hidden /><span><b>Tú:</b> {p.tu.texto}<small>{pie(p.tu, ref_)}</small></span></p>}
    {p.nota && <p className={l.fuente}>{p.nota}</p>}
    {comun && <p className={l.fuente}>{comun.split('|')[0]} · {fechaHumana(comun.split('|')[1], ref_)}</p>}
  </div>
}

function mayoria(xs: string[]): string | null {
  const n = new Map<string, number>()
  for (const y of xs) n.set(y, (n.get(y) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function Cuadricula({ titulo, nota, fichas, ref_ }: { titulo?: string; nota?: string; fichas: Ficha[]; ref_: string | null }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const caja = useAlElegir(abierta)
  const f = fichas.find(y => y.c.nombre === abierta) ?? null
  return <section aria-label={titulo}>
    {titulo && <Titulo nota={nota}>{titulo}</Titulo>}
    <ul className={x.fichas}>{fichas.map((y, i) => <li key={y.c.nombre}>
      <TarjetaFicha f={y} abierta={abierta === y.c.nombre} tocar={() => setAbierta(a => (a === y.c.nombre ? null : y.c.nombre))} />
    </li>)}</ul>
    {f && <div ref={caja} className={x.detalle} data-testid="ficha-abierta"><DetalleFicha f={f} ref_={ref_} cerrar={() => setAbierta(null)} /></div>}
  </section>
}

/** La cara pública: el avatar del canal sobre su propio color desenfocado (como una miniatura), la portada tal cual o sus iniciales. */
function Cara({ nombre, imagen, chica }: { nombre: string; imagen: Imagen | null; chica?: boolean }) {
  const [fallo, setFallo] = useState(false)
  // En la fila de caras de la figura va solo la imagen, recortada en círculo (o sus iniciales, sin la placa de la miniatura).
  if (chica) return !imagen || fallo ? <span aria-hidden>{iniciales(nombre)}</span>
    : <img src={imagen.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} />
  if (!imagen || fallo) return <span className={x.iniciales} aria-hidden>{iniciales(nombre)}</span>
  if (imagen.forma === 'portada') return <img className={x.portada} src={imagen.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} />
  return <>
    <img className={x.fondo} src={imagen.url} alt="" aria-hidden loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    <img className={x.avatar} src={imagen.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} />
  </>
}

function precioDe(f: Ficha): string | null {
  const pago = ofertasDePago(f.c)
  const p = f.tipo === 'anglo' ? pago.find(o => /\$\d/.test(o.precio)) : pago.find(o => /\d/.test(o.precio))
  return p ? corto(p.precio) : null
}

function TarjetaFicha({ f, abierta, tocar }: { f: Ficha; abierta: boolean; tocar: () => void }) {
  const a = alcanceDe(f.c), precio = precioDe(f)
  const marca = f.tipo === 'hispano' ? marcaDe(f.c.nombre) : f.c.categoria
  return <button type="button" className={x.ficha} aria-expanded={abierta} data-abierta={abierta || undefined} onClick={tocar}>
    <span className={`${l.miniatura} ${x.marco}`} data-forma={f.c.imagen?.forma ?? 'iniciales'}>
      <Cara nombre={f.c.nombre} imagen={f.c.imagen} />
      {precio && <span className={x.precio}>{precio}</span>}
    </span>
    <strong>{nombreCorto(f.c.nombre)}</strong>
    {marca && <small className={x.marca}>{marca}</small>}
    <small>{a ? `${audiencia(a)} · ${a.tipo.replace(/_/g, ' ')}` : 'audiencia sin dato'}</small>
  </button>
}

function DetalleFicha({ f, ref_, cerrar }: { f: Ficha; ref_: string | null; cerrar: () => void }) {
  const c = f.c, pago = ofertasDePago(c)
  return <>
    <header className={x.detalleCabeza}>
      <span><b>{c.nombre}</b><small>{f.tipo === 'hispano' ? [f.c.rol, f.c.pais && f.c.pais !== 'no verificado' ? f.c.pais : null].filter(Boolean).join(' · ') : [f.c.nivel, f.c.categoria].filter(Boolean).join(' · ')}</small></span>
      <button type="button" className={x.cerrar} onClick={cerrar} aria-label="Cerrar"><X size={15} aria-hidden /></button>
    </header>
    {pago.length > 0 && <ul className={e.ofertas}>{pago.map(o => <li key={o.oferta}>
      <span><b>{o.precio}</b> · {o.oferta}</span>
      {o.promesa && o.promesa !== '—' && <small>{o.promesa}</small>}
    </li>)}</ul>}
    <dl className={e.campos}>
      {c.avatar && <div><dt>A quién</dt><dd>{c.avatar}</dd></div>}
      {f.tipo === 'hispano' && f.c.hueco && <div><dt>Su hueco</dt><dd>{f.c.hueco}</dd></div>}
      {f.tipo === 'anglo' && f.c.adelanto && <div><dt>Lo que hace que aquí no</dt><dd>{f.c.adelanto.replace(/^\(lectura\)\s*/i, '')}</dd></div>}
      {f.tipo === 'anglo' && f.c.no_copiar && <div><dt>No copiar</dt><dd>{f.c.no_copiar}</dd></div>}
    </dl>
    {f.tipo === 'hispano' && f.c.voz.length > 0 && <ul className={e.evidencia}>{f.c.voz.map(v => <li key={v} data-tipo="cita"><span>{v}</span></li>)}</ul>}
    {c.canales.length > 0 && <ul className={e.canales}>{c.canales.map(y => <li key={`${y.tipo}-${y.valor}`}>
      <span>{y.tipo.replace(/_/g, ' ')}</span> {y.url ? <a href={y.url} target="_blank" rel="noreferrer">{y.valor}</a> : <b>{y.valor}</b>}
      <small>{y.fuente} · {fechaHumana(y.fecha, ref_)}{y.nota ? ` · ${y.nota}` : ''}</small>
    </li>)}</ul>}
    {c.imagen && <p className={l.fuente}>Imagen: {c.imagen.fuente}{c.imagen.de && <> · <a className={x.enlace} href={c.imagen.de} target="_blank" rel="noreferrer">{dominio(c.imagen.de)}<ArrowUpRight size={11} aria-hidden /></a></>} · {fechaHumana(c.imagen.fecha, ref_)}</p>}
  </>
}

// ── 3. Hacia dónde va ──

function Rumbo({ h, ref_ }: { h: HaciaDonde; ref_: string | null }) {
  return <div className={x.vista}>
    <Titulo nota="Y lo que anticipa en español en 6 a 12 meses">Lo que ya pasa en inglés</Titulo>
    <ol className={x.tendencias}>{h.tendencias.map((t, i) => <li key={t.tendencia} className={x.tendencia}>
      <span className={x.indice} aria-hidden>{String(i + 1).padStart(2, '0')}</span>
      <p className={x.tendTitulo}>{t.tendencia}</p>
      {t.en_espanol && <p className={x.enEspanol}><span>En español</span>{t.en_espanol}</p>}
      {(t.evidencia || t.fuentes.length > 0) && <details className={x.tendMas}>
        <summary>Evidencia{t.fuentes.length ? ` · ${t.fuentes.length} ${t.fuentes.length === 1 ? 'fuente' : 'fuentes'}` : ''}</summary>
        {t.evidencia && <p>{t.evidencia}</p>}
        {t.fuentes.length > 0 && <p className={e.enlaces}>{t.fuentes.map(u => /^https?:\/\//.test(u)
          ? <a key={u} href={u} target="_blank" rel="noreferrer">{dominio(u)}</a>
          : <span key={u}>{u}</span>)}</p>}
      </details>}
    </li>)}</ol>
    <p className={l.fuente}>{pie(h, ref_)}</p>
    {h.senales_hispanas && <section aria-label="Lo que ya se mueve en español">
      <Titulo>Lo que ya se mueve en español</Titulo>
      <ul className={e.evidencia}>{h.senales_hispanas.lista.map(s => <li key={s.texto} data-tipo="dato"><span>{s.texto}</span><small>{pie(s, ref_)}</small></li>)}</ul>
    </section>}
    {h.dos_avatares && <section aria-label="Dos avatares que no se mezclan">
      <Titulo nota="Así partió la categoría el mercado anglo">Dos avatares que no se mezclan</Titulo>
      <div className={x.dos}>
        <div><span>El que vende IA</span><p>{h.dos_avatares.el_que_vende}</p></div>
        <div><span>El dueño que la usa</span><p>{h.dos_avatares.el_dueno_que_usa}</p></div>
      </div>
      {h.dos_avatares.donde_caes && <p className={e.dato}>{h.dos_avatares.donde_caes}</p>}
    </section>}
  </div>
}

// ── 4. Lo que decides ──

function Decides({ d, ref_ }: { d: LoQueDecides; ref_: string | null }) {
  const piezas = useMemo(() => [...d.avatares.map(a => ({ titulo: a.escalon, tipo: 'Avatar', b: a as Borrador })), ...(d.posicionamiento ? [{ titulo: 'Posicionamiento', tipo: 'Frase', b: d.posicionamiento }] : [])], [d])
  return <div className={x.vista}>
    <div className={x.propuesta} data-firmado={d.estado === 'firmado' || undefined}>
      <p className={x.propuestaTitulo}>{d.estado === 'firmado' ? 'Firmado' : 'Propuesta de Levy, sin firmar'}</p>
      {d.para_que && <p>{d.para_que}</p>}
      {d.estado !== 'firmado' && d.como_firmar && <p className={x.comoFirmar}>{d.como_firmar}</p>}
    </div>
    <ul className={x.borradores}>{piezas.map((y, i) => <li key={`${y.tipo}-${y.titulo}`}><TarjetaBorrador tipo={y.tipo} titulo={y.titulo} b={y.b} ref_={ref_} /></li>)}</ul>
    {d.no_se_reabre.length > 0 && <section aria-label="Lo firmado que esto no toca">
      <Titulo>Lo firmado que esto no toca</Titulo>
      <ul className={e.lista}>{d.no_se_reabre.map(y => <li key={y}>{y}</li>)}</ul>
    </section>}
    <p className={l.fuente}>{pie(d, ref_)}</p>
  </div>
}

function TarjetaBorrador({ tipo, titulo, b, ref_ }: { tipo: string; titulo: string; b: Borrador; ref_: string | null }) {
  const firmado = b.estado === 'firmado'
  return <article className={x.borrador} data-estado={b.estado} aria-label={`${tipo} · ${titulo}`}>
    <p className={x.borradorCabeza}>
      <span className={x.borradorTipo}>{tipo} · <b>{titulo}</b></span>
      <span className={x.firma}>{firmado ? `Firmado ${fechaHumana(b.firmado!.fecha, ref_)}` : 'Sin firmar'}</span>
    </p>
    <p className={x.frase}>{firmado && b.firmado?.texto ? b.firmado.texto : b.borrador}</p>
    {b.por_que && <p className={x.porQue}><b>Por qué:</b> {b.por_que}</p>}
    {b.no_es && <p className={x.porQue}><b>No es:</b> {b.no_es}</p>}
    {b.evidencia.length > 0 && <details className={x.tendMas}>
      <summary>Evidencia · {b.evidencia.length}</summary>
      <ListaEvidencia xs={b.evidencia} ref_={ref_} />
    </details>}
  </article>
}
