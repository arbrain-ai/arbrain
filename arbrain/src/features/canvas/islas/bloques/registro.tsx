'use client'
/**
 * Mapa v16 · el REGISTRO de bloques vivos (14 nov 2026): el componente React de cada tipo. Mismo `tipo` que su esquema
 * (`esquemas.ts`) y su dibujo ligero (`pintar.ts`). Los datos llegan del almacén de la app (`useDato`), los botones van por
 * `ir` (la lista blanca de la Pizarra) y `vivo` dice si la isla está despierta (al dormir, todo se pausa).
 *
 * Diseño: el de BI «En calma», Finanzas y Estrategia (bloques.module.css). Gráfica de tendencia: `monotono` del BI.
 */
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { monotono } from '@/features/bi/Graficas'
import { ORGANO } from '@/features/negocio/pulso'
import type { AlmacenFuentes } from '../almacen'
import { useDato } from '../almacen'
import { campo, llenar } from '../receta'
import type { IslaLista } from '../modelo'
import { serieDe } from '../modelo'
import type { LecturaFuente } from '../fuentes'
import type { PropsDe, TipoBloque, BotonP } from './esquemas'
import b from './bloques.module.css'
import { COMPONENTES_ISLAS, ContextoMapa } from '@/features/mapa/motor'

export interface CtxIsla { almacen: AlmacenFuentes | null; ir: (destino: string) => void; vivo: boolean }
const Ctx = createContext<CtxIsla>({ almacen: null, ir: () => {}, vivo: false })
const useIsla = () => useContext(Ctx)

/** Texto con huecos `{fuente.campo}` llenos con datos vivos (se suscribe a cada fuente que nombra). */
function useTexto(t: string | undefined, sin = 'sin dato'): string {
  const { almacen } = useIsla()
  const fuentes = t ? [...t.matchAll(/\{([a-z][a-z0-9-]{0,31}(?::[a-z0-9_-]{1,40})?)/g)].map(m => m[1]) : []
  // Un hook por fuente posible: los textos de una receta tienen pocas; se fija un máximo para no romper el orden de hooks.
  const l0 = useDato(almacen, fuentes[0]), l1 = useDato(almacen, fuentes[1]), l2 = useDato(almacen, fuentes[2]), l3 = useDato(almacen, fuentes[3])
  if (!t) return ''
  const mapa = new Map<string, LecturaFuente | undefined>(fuentes.slice(0, 4).map((f, i) => [f, [l0, l1, l2, l3][i]]))
  return llenar(t, f => mapa.get(f) ?? almacen?.get(f), sin)
}

const sinValor = (l: LecturaFuente | undefined, v: unknown) => !l || l.estado !== 'ok' || v === null || v === undefined || v === ''
const estadoDe = (l: LecturaFuente | undefined, v: unknown) => (!l ? 'leyendo' : l.estado === 'ok' && sinValor(l, v) ? 'sin-dato' : l.estado)
const textoSin = (l: LecturaFuente | undefined, sin: string) => (!l || l.estado === 'leyendo' ? '…' : l.estado === 'oculto' ? 'oculto' : sin)

function Titulo({ p }: { p: PropsDe['titulo'] }) {
  const texto = useTexto(p.texto), ceja = useTexto(p.ceja)
  return <div className={p.alinear === 'centro' ? b.centro : undefined}>
    {ceja && <p className={b.ceja}>{ceja}</p>}
    <h2 className={b.titulo} data-tam={p.tamano}>{texto}</h2>
  </div>
}

function Texto({ p }: { p: PropsDe['texto'] }) {
  const t = useTexto(p.texto)
  return <p className={`${b.texto} ${p.alinear === 'centro' ? b.centro : p.alinear === 'der' ? b.der : ''}`} data-estilo={p.estilo}>{t}</p>
}

function Cita({ p }: { p: PropsDe['cita'] }) {
  const t = useTexto(p.texto)
  return <blockquote className={b.cita}><p>«{t}»</p>{p.autor && <footer>— {p.autor}</footer>}</blockquote>
}

/** La línea de tendencia: los puntos de la fuente, con su «ahora» en oro. */
function Serie({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null
  const W = 600, H = 72, min = Math.min(...valores), max = Math.max(...valores), span = max - min || 1
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 12)] as [number, number])
  const d = monotono(pts)
  const [ux, uy] = pts[pts.length - 1]
  return <svg className={b.serie} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
    <path className={b.area} d={`${d} L${W},${H} L0,${H} Z`} /><path d={d} vectorEffect="non-scaling-stroke" /><circle cx={ux} cy={uy} r={6} />
  </svg>
}

function Numero({ p }: { p: PropsDe['numero'] }) {
  const { almacen } = useIsla()
  const l = useDato(almacen, p.fuente)
  const lt = useDato(almacen, p.tendencia?.fuente)
  const v = l?.estado === 'ok' ? campo(l.valor, p.campo) : null
  const etiqueta = useTexto(p.etiqueta), unidad = useTexto(p.unidad, ''), detalle = useTexto(p.detalle, '')
  const estado = estadoDe(l, v)
  const serie = p.tendencia && lt?.estado === 'ok' ? serieDe(campo(lt.valor, p.tendencia.campo)) : []
  return <div className={p.alinear === 'centro' ? b.centro : undefined} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    {etiqueta && <p className={b.etiqueta}>{etiqueta}</p>}
    <div className={b.cifraFila}>
      <span className={b.cifra} data-estado={estado} title={l?.error}>{estado === 'ok' ? String(v) : textoSin(l, p.sin)}</span>
      {estado === 'ok' && unidad && unidad !== 'sin dato' && <span className={b.unidad}>{unidad}</span>}
    </div>
    {detalle && detalle !== 'sin dato' && <p className={b.detalle}>{detalle}</p>}
    {serie.length > 1 && <Serie valores={serie} />}
  </div>
}

function Boton({ p }: { p: BotonP }) {
  const { ir } = useIsla()
  const [yendo, setYendo] = useState(false)
  return <button type="button" className={b.boton} data-estilo={p.estilo} data-control="" {...(yendo ? { 'data-yendo': '' } : {})}
    onClick={e => { e.stopPropagation(); setYendo(true); setTimeout(() => setYendo(false), 420); ir(p.destino) }}>{p.texto}</button>
}

function Organo({ p }: { p: PropsDe['organo'] }) {
  const { almacen } = useIsla()
  const l = useDato(almacen, p.fuente)
  const pulso = (l?.estado === 'ok' || l?.estado === 'sin-dato' ? l.valor : null) as { cifra?: string; unidad?: string; detalle?: string[]; falta?: string; senal?: { tono?: string } } | null
  const conocido = (ORGANO as Record<string, { nombre: string; pregunta: string }>)[p.organo]
  const dolor = pulso?.senal?.tono === 'dolor'
  const estado = dolor ? 'dolor' : estadoDe(l, pulso?.cifra)
  return <div className={b.organo} data-dolor={dolor ? 'true' : undefined}>
    <div className={b.orgCabeza}><h3 className={b.orgNombre}>{p.nombre ?? conocido?.nombre ?? p.organo}</h3><i className={b.punto} data-estado={estado} /></div>
    <p className={b.orgPregunta}>{p.pregunta ?? conocido?.pregunta ?? ''}</p>
    {l?.estado === 'ok' && pulso?.cifra
      ? <><div className={b.cifraFila}><span className={b.cifra}>{pulso.cifra}</span>{pulso.unidad && <span className={b.unidad}>{pulso.unidad}</span>}</div>
          {!!pulso.detalle?.length && <p className={b.detalle}>{pulso.detalle.join(' · ')}</p>}</>
      : <p className={b.falta}>{!l || l.estado === 'leyendo' ? 'Leyendo…' : l.estado === 'oculto' ? 'Oculto en modo directo.' : l.estado === 'error' ? `La fuente no respondió (no es cero). ${l.error ?? ''}` : pulso?.falta ?? 'Sin dato todavía.'}</p>}
    {!!p.botones.length && <div className={b.orgBotones}>{p.botones.map((x, i) => <Boton key={i} p={x} />)}</div>}
  </div>
}

function Progreso({ p }: { p: PropsDe['progreso'] }) {
  const { almacen } = useIsla()
  const l = useDato(almacen, p.fuente)
  const num = (x: number | string) => (typeof x === 'number' ? x : l?.estado === 'ok' ? Number(campo(l.valor, x)) : NaN)
  const v = num(p.valor), t = num(p.total)
  const ok = Number.isFinite(v) && Number.isFinite(t) && t > 0
  const etiqueta = useTexto(p.etiqueta)
  return <div>
    <div className={b.progFila}><span>{etiqueta}</span><span>{ok ? `${v} de ${t}` : textoSin(l, 'sin dato')}</span></div>
    <div className={b.barra}><i style={{ width: ok ? `${Math.max(0, Math.min(100, (v / t) * 100))}%` : 0 }} /></div>
    {p.nota && <p className={b.detalle}>{p.nota}</p>}
  </div>
}

/** El círculo NOVA de adentro hacia afuera: el centro (por qué y para qué) y un anillo por capa, con su nombre en el arco. */
function Nova({ p }: { p: PropsDe['nova'] }) {
  const S = 1000, c = S / 2, n = p.anillos.length, r0 = 150, paso = (c - 30 - r0) / Math.max(1, n)
  return <div style={{ position: 'relative', height: '100%' }}>
    <svg className={b.nova} viewBox={`0 0 ${S} ${S}`} preserveAspectRatio="xMidYMid meet">
      <defs>{p.anillos.map((_, i) => { const r = r0 + paso * (i + 1) - 18; return <path key={i} id={`arco-${i}`} d={`M ${c - r},${c} A ${r},${r} 0 0 1 ${c + r},${c}`} /> })}</defs>
      {p.anillos.map((a, i) => <g key={i}>
        <circle className={b.anillo} data-i={i} cx={c} cy={c} r={r0 + paso * (i + 1)} />
        <text className={b.nombre} textAnchor="middle"><textPath href={`#arco-${i}`} startOffset="50%">{a.nombre}</textPath></text>
      </g>)}
      <circle className={b.nucleo} cx={c} cy={c} r={r0} />
      <foreignObject x={c - r0 + 16} y={c - r0 + 16} width={(r0 - 16) * 2} height={(r0 - 16) * 2}>
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div><div className={b.centroTexto} style={{ fontFamily: 'var(--serif-ui, serif)', fontSize: 28, fontWeight: 600, lineHeight: 1.15 }}>{p.centro.texto}</div>
            {p.centro.sub && <div style={{ marginTop: 8, fontSize: 17, color: 'var(--muted)', lineHeight: 1.3 }}>{p.centro.sub}</div>}</div>
        </div>
      </foreignObject>
    </svg>
  </div>
}

function Escalera({ p }: { p: PropsDe['escalera'] }) {
  const n = p.peldanos.length
  return <div className={b.escalera} style={{ position: 'relative', paddingTop: p.titulo ? 34 : 8 }}>
    {p.titulo && <h4>{p.titulo}</h4>}
    {p.peldanos.map((x, i) => <Peldano key={i} x={x} alto={`${40 + (60 * (i + 1)) / n}%`} />)}
  </div>
}
function Peldano({ x, alto }: { x: PropsDe['escalera']['peldanos'][number]; alto: string }) {
  const nombre = useTexto(x.nombre), precio = useTexto(x.precio, '')
  const marca = x.estado === 'abierto' ? 'Abierto' : x.estado === 'por-firmar' ? 'Por firmar' : x.estado === 'hueco' ? 'El hueco' : x.estado === 'tu' ? 'Aquí estás' : null
  return <div className={b.peldano} data-estado={x.estado} style={{ height: alto }}>
    {marca && <small className={b.marca}>{marca}</small>}
    {precio && <span>{precio}</span>}<b>{nombre}</b>{x.nota && <small>{x.nota}</small>}
  </div>
}

function LineaTiempo({ p }: { p: PropsDe['linea-tiempo'] }) {
  return <div className={b.linea}>{p.hitos.map((h, i) => <div key={i} className={b.hito} data-estado={h.estado}><i />{h.fecha && <small>{h.fecha}</small>}<span>{h.texto}</span></div>)}</div>
}

function Lista({ p }: { p: PropsDe['lista'] }) {
  return p.estilo === 'chips'
    ? <div className={b.chips}>{p.items.map((t, i) => <Item key={i} t={t} chip />)}</div>
    : <ul className={b.lista}>{p.items.map((t, i) => <Item key={i} t={t} />)}</ul>
}
function Item({ t, chip }: { t: string; chip?: boolean }) { const x = useTexto(t); return chip ? <span>{x}</span> : <li>{x}</li> }

function Separador({ p }: { p: PropsDe['separador'] }) {
  return <div className={b.separador} {...(p.etiqueta ? { 'data-etiqueta': '' } : {})}>{p.etiqueta}</div>
}

/** El componente de cada tipo (mismo `tipo` que su esquema y su dibujo). */
export const COMPONENTES: { [T in TipoBloque]: (props: { p: PropsDe[T] }) => ReactNode } = {
  titulo: Titulo, texto: Texto, cita: Cita, numero: Numero, organo: Organo, boton: Boton, progreso: Progreso,
  nova: Nova, escalera: Escalera, 'linea-tiempo': LineaTiempo, lista: Lista, separador: Separador,
}

/**
 * Una isla NATIVA viva: la receta lista, sus bloques en sus cajas (las mismas que dibuja el canvas de lejos). Se posiciona
 * con un solo `transform` (la Pizarra le pasa traslado y escala); `vivo` false = montada pero dormida (oculta y en pausa).
 */
export function IslaNativa({ isla, almacen, ir, vivo, estilo }: { isla: IslaLista; almacen: AlmacenFuentes; ir: (d: string) => void; vivo: boolean; estilo: CSSProperties }) {
  const r = isla.receta
  // Los bloques del agente ISLAS (features/mapa) leen su modo e `ir` de ContextoMapa; el tema, del de la app.
  return <Ctx.Provider value={{ almacen, ir, vivo }}><ContextoMapa.Provider value={{ ir, modo: vivo ? 'cerca' : 'lejos' }}>
    <div data-isla-nativa={r.id} style={{ ...estilo, width: isla.ancho, height: isla.alto }}>
      <div className={b.isla} data-variante={r.variante} data-animacion={r.animacion} data-vivo={vivo ? 'true' : 'false'}>
        {isla.bloques.map((x, i) => {
          const C = x.ok ? (COMPONENTES[x.tipo as TipoBloque] ?? COMPONENTES_ISLAS[x.tipo]) as (props: { p: unknown }) => ReactNode : null
          return <div key={`${i}-${x.tipo}-${x.id ?? ''}`} className={b.bloque} data-tipo={x.tipo} data-bloque={x.id}
            data-variante={x.variante} {...(x.destino ? { 'data-destino': '', 'data-control': '', onClick: () => ir(x.destino!) } : {})}
            style={{ left: x.caja.x, top: x.caja.y, width: x.caja.w, height: x.caja.h, ['--i' as string]: i } as CSSProperties}>
            {C && x.ok ? <C p={x.p} /> : <div className={b.roto}>{!x.ok && <span>Bloque <b>{x.tipo}</b>: {x.motivo}</span>}</div>}
          </div>
        })}
        {isla.errores.length > 0 && <div className={b.errores}>{isla.errores.slice(0, 3).join(' · ')}{isla.errores.length > 3 ? ` · y ${isla.errores.length - 3} más` : ''}</div>}
      </div>
    </div>
  </ContextoMapa.Provider></Ctx.Provider>
}
