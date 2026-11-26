'use client'
/**
 * Tu canal (v4, 19 nov 2026): el tablero profesional del canal. Nació como «videojuego» (estructura de Stats Royale) y
 * el mismo día Daniel lo corrigió: «hay que ser profesionales. No es un videojuego.» Mismos datos y estructura, términos
 * de analista. Se consulta, no persigue: sin avisos.
 *
 *  · Resumen: vistas en 28 días de los largos, nivel (mismos cortes), lugar en los dos rankings, semanas seguidas con
 *    3 videos, ciclo de 4 semanas (12 videos), rendimiento de los últimos videos contra tu mediana y el análisis del
 *    último (qué métrica quedó corta), con la curva de 48 h si hay video nuevo.
 *  · Videos: cada largo contra lo esperado (×N y un indicador de 1 a 3 niveles), con CTR y retención; y sus ventas.
 *  · Formatos: tus formatos y qué tanto superan tu mediana. · Tendencias: los formatos que mejor rinden en los rankings.
 *  · Ranking: hispano y mundial.
 *
 * Los nombres internos (coronas, arenas, partidas) siguen siendo los del contrato `cuartel.juego/1`; solo cambió lo que
 * se ve. Todo viene calculado del cuartel (`/api/contenido/juego`, una vez al día): aquí no se recalcula nada. Lo que
 * falta se dice en pantalla.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart3, CalendarCheck, ChevronDown, Eye, Film, Inbox, LayoutDashboard, Layers, ListOrdered, PlaySquare, RefreshCw, TrendingUp } from 'lucide-react'
import { useReading } from '@/features/clarity/useReading'
import { Miniatura, Vacio, useCuartel } from './piezas'
import { compacto } from './modelo'
import { canalPropio } from './Radar'
import { fechaCorta, multTexto } from './pantalla'
import {
  anchoMedidor, CARTAS, casillas, coronasDe, lecturaDelJuego, nombreFormato, ordenarMazos, posicionArena, resumenCoronas, textoVeredicto, ventanaLiga,
  type Arena, type CurvaVideo, type FilaRanking, type Juego, type LecturaJuego, type LugarLiga, type Mazo, type Partida, type Repeticion,
} from './juego'
import type { LecturaCanal, LecturaCuartel, VideoCuartel, VideoPropio } from './tipos'
import type { EnSala } from './Sala'
import s from './cuartel.module.css'
import j from './juego.module.css'

type Vista = 'perfil' | 'partidas' | 'mazos' | 'meta' | 'rankings'
const VISTAS: [Vista, string, typeof Eye][] = [['perfil', 'Resumen', LayoutDashboard], ['partidas', 'Videos', PlaySquare], ['mazos', 'Formatos', Layers], ['meta', 'Tendencias', TrendingUp], ['rankings', 'Ranking', ListOrdered]]
const LLAVE = 'contenido:juego-vista'

export function TuCanal({ lectura, videosYVentas, irComentarios, abrir }: { lectura: LecturaCuartel; videosYVentas: React.ReactNode; enPanel?: boolean; irComentarios?: () => void; abrir?: (e: EnSala) => void }) {
  const { irCanal } = useCuartel()
  const { data, error, loading, refresh } = useReading<LecturaJuego>('/api/contenido/juego')
  const { data: canal } = useReading<LecturaCanal>('/api/contenido/canal')
  const [vista, setVista] = useState<Vista>('perfil')
  useEffect(() => { try { const v = sessionStorage.getItem(LLAVE) as Vista | null; if (v && VISTAS.some(x => x[0] === v)) setVista(v) } catch { /* */ } }, [])
  const elegir = (v: Vista) => { setVista(v); try { sessionStorage.setItem(LLAVE, v) } catch { /* */ } }
  const yo = canalPropio(lectura.universo?.canales ?? [])[0] ?? null
  // Lo que el cuartel sabe de cada video (títulos de la liga para el meta) y la analítica de los suyos (CTR, retención).
  const porId = useMemo(() => new Map([...lectura.videos, ...lectura.outliers].map(v => [v.video_id, v])), [lectura])
  const analitica = useMemo(() => new Map((canal?.videos ?? []).map(v => [v.video_id, v])), [canal])
  const juego = data?.juego ?? null
  const propio = (p: { video_id: string; titulo: string; publicado: string; vistas?: number | null }): VideoCuartel =>
    ({ video_id: p.video_id, channel_id: yo?.channel_id ?? '', canal: yo?.nombre ?? 'Tú', capa: 'propio', titulo: p.titulo, publicado: p.publicado, vistas: p.vistas ?? null })
  const verPropio = abrir ? (p: Parameters<typeof propio>[0]) => abrir({ video: propio(p), desde: 'biblioteca' }) : undefined
  const verAjeno = abrir ? (v: VideoCuartel) => abrir({ video: v, desde: 'radar' }) : undefined
  const cuando = juego ? lecturaDelJuego(juego.calculado) : null

  return <div className={`${s.pestana} ${j.juego}`} data-testid="juego">
    <nav className={j.vistas} role="tablist" aria-label="Tu canal">
      {VISTAS.map(([id, nombre, Icono]) => <button key={id} role="tab" type="button" aria-selected={vista === id} data-vista={id} onClick={() => elegir(id)}><Icono size={14} aria-hidden />{nombre}</button>)}
      <span className={j.vistasFin}>
        {cuando && <small className={j.calculado} data-viejo={cuando.viejo || undefined} title="Los datos se recalculan una vez al día (06:45), no en vivo" data-testid="calculado">Calculado {cuando.texto}{cuando.viejo ? ' · no se ha recalculado' : ''}</small>}
        <button className={s.icono} onClick={refresh} disabled={loading} aria-label="Releer los datos" title="Releer"><RefreshCw size={13} className={loading ? s.gira : undefined} /></button>
      </span>
    </nav>
    {!data ? (error ? <p className={s.avisoChico}>{error}</p> : <Vacio>Leyendo tu canal…</Vacio>)
      : !juego ? <Vacio>{'falta' in data ? data.falta : 'Sin datos del canal.'}</Vacio>
      : vista === 'perfil' ? <Perfil juego={juego} verPropio={verPropio} irPartidas={() => elegir('partidas')} irRankings={() => elegir('rankings')} acciones={<>
          {yo && <button className={s.enlace} onClick={() => irCanal(yo.channel_id)}>Tu ficha</button>}
          <Link className={s.enlace} href="/youtube/galeria" data-testid="ir-galeria"><Film size={13} /> Tus videos</Link>
          {irComentarios ? <button className={s.enlace} onClick={irComentarios}><Inbox size={13} /> Comentarios</button>
            : <Link className={s.enlace} href="/youtube?tab=bandeja"><Inbox size={13} /> Comentarios</Link>}
        </>} />
      : vista === 'partidas' ? <Partidas partidas={juego.partidas} analitica={analitica} ver={verPropio} videosYVentas={videosYVentas} />
      : vista === 'mazos' ? <Mazos juego={juego} porId={porId} partidas={juego.partidas} />
      : vista === 'meta' ? <Meta juego={juego} porId={porId} ver={verAjeno} />
      : <Rankings juego={juego} />}
  </div>
}

// ── Piezas ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rendimiento de un video contra tu mediana: ×N y un indicador discreto de 3 niveles (1: arriba de la mediana,
 *  2: el doble, 3: ×5); «menos de 24 h» si aún no hay lectura. */
const NIVELES = ['debajo de tu mediana', 'arriba de tu mediana', 'el doble de tu mediana', '×5 o más tu mediana']
export function Rendimiento({ n, puntaje, chico }: { n: number | null; puntaje?: number | null; chico?: boolean }) {
  if (n == null) return <span className={j.enJuego} title="Menos de 24 h: aún sin lectura">menos de 24 h</span>
  const txt = NIVELES[n] ?? ''
  return <span className={j.rendimiento} data-chico={chico || undefined} data-nivel={n} aria-label={`Nivel ${n} de 3: ${txt}`} title={`Nivel ${n} de 3: ${txt}`}>
    {puntaje != null && !chico && <b>{multTexto(puntaje)}</b>}
    <span className={j.barras} aria-hidden>{[0, 1, 2].map(i => <i key={i} data-llena={i < n || undefined} />)}</span>
  </span>
}

const lugarTxt = (n: number) => `${n}.º`

// ── Perfil ─────────────────────────────────────────────────────────────────────────────────────────────────────

function Perfil({ juego, verPropio, irPartidas, irRankings, acciones }: { juego: Juego; verPropio?: (p: Partida) => void; irPartidas: () => void; irRankings: () => void; acciones: React.ReactNode }) {
  const p = juego.perfil
  const t = p.temporada
  const sem = p.racha.semana_actual
  const ultimas = juego.partidas.slice(0, 14)
  const res = resumenCoronas(ultimas)
  return <>
    <section className={j.perfil} data-testid="perfil">
      <div className={j.trofeos}>
        <p className={s.ceja}>Vistas en 28 días <small>de tus videos largos</small></p>
        <p className={j.trofeosNum} data-testid="trofeos"><Eye size={26} aria-hidden /><b>{p.trofeos.toLocaleString('es-MX')}</b></p>
        <p className={j.arenaTxt}>Nivel <b>{p.arena}</b>{p.siguiente_arena && <> · te faltan <b>{p.siguiente_arena.falta.toLocaleString('es-MX')}</b> vistas para el nivel {p.siguiente_arena.numero}</>}</p>
        <p className={j.nota}>{p.largos_28d === 0 ? 'Sin largos publicados en 28 días: las vistas vuelven a contar con tu siguiente video.' : `${p.largos_28d} ${p.largos_28d === 1 ? 'largo' : 'largos'} en 28 días.`}</p>
        <Escalera trofeos={p.trofeos} arenas={juego.arenas} actual={p.arena} />
      </div>
      <div className={j.ligas}>
        {(['hispana', 'mundial'] as const).map(l => <TarjetaLiga key={l} nombre={l === 'hispana' ? 'Ranking hispano' : 'Ranking mundial'} liga={p.ligas[l] ?? null} lider={juego.rankings[l]?.[0] ?? null} ir={irRankings} />)}
      </div>
      <div className={j.ritmo}>
        <div className={j.racha} data-testid="racha">
          <p className={s.ceja}><CalendarCheck size={13} aria-hidden /> Semanas seguidas con 3 videos</p>
          <p className={j.grande}><b>{p.racha.semanas}</b> {p.racha.semanas === 1 ? 'semana' : 'semanas'} <small>mejor: {p.racha.mejor}</small></p>
          <p className={j.nota}>Esta semana (desde el {fechaCorta(`${sem.inicio}T12:00:00Z`)}): {sem.videos} de {sem.meta}</p>
          <span className={j.casillas} aria-hidden>{casillas(sem.videos, sem.meta).map((x, i) => <i key={i} data-hecho={x || undefined} />)}</span>
        </div>
        <div className={j.temporada} data-testid="temporada">
          {t.estado === 'pretemporada' ? <><p className={s.ceja}>Ciclo de 4 semanas</p><p className={j.nota}>El ciclo 1 (12 videos) arranca el {fechaCorta(`${t.inicio}T12:00:00Z`)}.</p></> : <>
            <p className={s.ceja}>Ciclo {t.numero} de 4 semanas <small>semana {t.semana} de {t.de_semanas}{t.fin ? ` · cierra el ${fechaCorta(`${t.fin}T12:00:00Z`)}` : ''}</small></p>
            <p className={j.grande}><b>{t.videos ?? 0}</b> de {t.meta_videos ?? 12} videos <small>{t.coronas ?? 0} puntos de rendimiento</small></p>
            <span className={j.casillas} data-largo aria-hidden>{casillas(t.videos ?? 0, t.meta_videos ?? 12).map((x, i) => <i key={i} data-hecho={x || undefined} />)}</span>
            {t.anterior ? <p className={j.nota}>Ciclo {t.anterior.numero}: {t.anterior.videos} videos, {t.anterior.coronas} puntos de rendimiento.</p> : <p className={j.nota}>El resumen de cada ciclo aparece aquí al cerrarlo.</p>}
          </>}
        </div>
      </div>
    </section>

    <section className={s.bloque} data-testid="ultimas">
      <header className={s.bloqueCabeza}><h3><BarChart3 size={14} /> Tus últimos {ultimas.length} videos</h3>
        <small>{res.cero} debajo de tu mediana · {ultimas.length - res.cero - res.enJuego - res.tres} arriba · {res.tres} a ×5 o más{res.enJuego ? ` · ${res.enJuego} con menos de 24 h` : ''}. Del más nuevo al más viejo.</small>
        <span className={s.cabezaAcciones}><button className={s.enlace} onClick={irPartidas}>Todos tus videos</button>{acciones}</span></header>
      <ol className={j.tira}>{ultimas.map(x => <li key={x.video_id} data-confianza={x.confianza ?? undefined}>
        <button type="button" onClick={verPropio ? () => verPropio(x) : undefined} disabled={!verPropio} title={`${x.titulo} · ${fechaCorta(x.publicado)} · ${multTexto(x.puntaje)} su mediana`}>
          <span className={j.tiraMini}><Miniatura video={{ video_id: x.video_id, titulo: x.titulo }} /></span>
          <Rendimiento n={coronasDe(x)} chico />
          <small>{fechaCorta(x.publicado)} · {multTexto(x.puntaje)}</small>
        </button></li>)}</ol>
    </section>

    {juego.repeticion ? <Repeticion r={juego.repeticion} ver={verPropio} /> : <section className={s.bloque}><header className={s.bloqueCabeza}><h3><PlaySquare size={14} /> Análisis del último video</h3></header><Vacio>Sin análisis: todavía no hay analítica de tu último largo.</Vacio></section>}
    <Curva curva={juego.curva} partidas={juego.partidas} />
  </>
}

/** La escala de niveles: ocho tramos iguales (los cortes del cálculo) y tú en oro. */
function Escalera({ trofeos, arenas, actual }: { trofeos: number; arenas: Arena[]; actual: number }) {
  const xs = [...arenas].sort((a, b) => a.desde - b.desde)
  if (!xs.length) return null
  const pos = posicionArena(trofeos, xs)
  return <div className={j.escalera} data-testid="escalera">
    <div className={j.escaleraPista} aria-hidden>
      {xs.map(a => <span key={a.numero} data-pasada={a.numero <= actual || undefined} />)}
      <b className={j.escaleraTu} style={{ left: `${pos * 100}%` }} />
    </div>
    <ol className={j.escaleraNombres}>{xs.map(a => <li key={a.numero} data-actual={a.numero === actual || undefined}><b>Nivel {a.numero}</b><small>{a.desde >= 1000 ? compacto(a.desde) : a.desde}</small></li>)}</ol>
  </div>
}

function TarjetaLiga({ nombre, liga, lider, ir }: { nombre: string; liga: LugarLiga | null; lider: FilaRanking | null; ir: () => void }) {
  if (!liga) return <div className={j.liga}><p className={s.ceja}>{nombre}</p><p className={j.nota}>Sin lugar en este ranking todavía.</p></div>
  return <button type="button" className={j.liga} onClick={ir} data-testid={`liga-${liga.liga}`} title="Ver el ranking completo">
    <p className={s.ceja}>{nombre}</p>
    <p className={j.lugar}><b>{lugarTxt(liga.lugar)}</b> de {liga.de}{liga.empatados > 0 && <small> · empatado con {liga.empatados}</small>}</p>
    {liga.arriba ? <p className={j.nota}>Arriba: <b>{liga.arriba.nombre}</b> ({compacto(liga.arriba.trofeos)}). Te faltan <b className={j.oro}>{(liga.falta_para_subir ?? 0).toLocaleString('es-MX')}</b> vistas para subir.</p>
      : <p className={j.nota}>Vas primero.</p>}
    {liga.abajo ? <p className={j.nota}>Abajo: {liga.abajo.nombre} ({compacto(liga.abajo.trofeos)}).</p> : <p className={j.nota}>Nadie abajo con menos vistas.</p>}
    {lider && !lider.tuyo && <p className={j.nota}>Líder: {lider.nombre} · {compacto(lider.trofeos)}</p>}
  </button>
}

// ── Análisis del último video ───────────────────────────────────────────────────────────────────────────────────

function fmtMedidor(clave: string, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (clave.startsWith('impresiones')) return compacto(v)
  if (clave === 'subs_por_mil') return v.toFixed(1)
  return `${v.toFixed(1)} %`
}

function Repeticion({ r, ver }: { r: Repeticion; ver?: (p: Partida) => void }) {
  const v = textoVeredicto(r)
  const porCarta = new Map(r.medidores.map(m => [m.carta, m]))
  return <section className={s.bloque} data-testid="repeticion">
    <header className={s.bloqueCabeza}><h3><PlaySquare size={14} /> Análisis del último video</h3>
      <small>{fechaCorta(r.publicado)} · {r.vistas != null ? `${compacto(r.vistas)} vistas` : 'sin vistas'} · {multTexto(r.puntaje)} tu mediana</small></header>
    <div className={j.repeticion}>
      <button type="button" className={j.repMini} onClick={ver ? () => ver({ video_id: r.video_id, titulo: r.titulo, publicado: r.publicado, vistas: r.vistas, esperado: null, puntaje: r.puntaje, coronas: r.coronas }) : undefined} disabled={!ver} aria-label={`Ver: ${r.titulo}`}>
        <Miniatura video={{ video_id: r.video_id, titulo: r.titulo }} />
        <span className={j.repTitulo}><b>{r.titulo}</b><Rendimiento n={coronasDe(r)} puntaje={r.puntaje} /></span>
      </button>
      <div className={j.veredicto} data-veredicto={r.veredicto}>
        <p className={s.ceja}>Diagnóstico</p>
        <p className={j.veredictoTitulo} data-testid="veredicto">{v.titulo}</p>
        <p className={j.nota}>{v.detalle}</p>
      </div>
    </div>
    <ol className={j.cartas} aria-label="Las métricas de este video, en el orden del diagnóstico">
      {CARTAS.map((c, i) => {
        const m = porCarta.get(c.carta)
        const estado = m?.estado ?? 'falta'
        return <li key={c.carta} className={j.carta} data-estado={estado} data-veredicto={r.veredicto === c.carta || undefined} data-confianza={m?.confianza ?? undefined} style={{ ['--i' as string]: i }}>
          <p className={j.cartaNombre}><b>{c.nombre}</b><small>{c.mide}</small></p>
          {m && estado !== 'falta' ? <>
            <p className={j.cartaValor}><b>{fmtMedidor(m.clave, m.valor)}</b> <small>tu mediana {fmtMedidor(m.clave, m.mediana)}{m.n ? ` · n=${m.n}` : ''}</small></p>
            <span className={j.medidor} aria-hidden><i style={{ width: `${anchoMedidor(m.ratio) * 100}%` }} /><em style={{ left: `${(m.umbral / 2) * 100}%` }} /></span>
            <p className={j.cartaEstado}>{estado === 'bajo' ? 'debajo' : 'cumple'} · {m.ratio != null ? `×${m.ratio.toFixed(2)}` : ''}{m.confianza === 'baja' ? ' · poca historia' : ''}</p>
          </> : <p className={j.cartaEstado}>falta el dato</p>}
        </li>
      })}
    </ol>
    {!!r.faltas?.length && <ul className={j.faltas}>{r.faltas.map(f => <li key={f}>Falta · {f}</li>)}</ul>}
    {r.base && <p className={j.nota}>De dónde sale: {r.base}. La raya de cada métrica es el umbral (abajo de ella, queda corta).</p>}
  </section>
}

/** La curva de las primeras 48 h de cada video nuevo contra la mediana de sus anteriores a la misma edad. */
function Curva({ curva, partidas }: { curva: CurvaVideo[] | null; partidas: Partida[] }) {
  return <section className={s.bloque} data-testid="curva">
    <header className={s.bloqueCabeza}><h3>Primeras 48 horas</h3><small>Vistas públicas cada 3 h de tu video nuevo, contra tu mediana a la misma edad.</small></header>
    {!curva?.length ? <Vacio>Sin video de menos de 48 h: la curva aparece sola cuando publiques el siguiente.</Vacio>
      : <div className={j.curvas}>{curva.map(c => {
          const p = partidas.find(x => x.video_id === c.video_id)
          const ult = c.puntos[c.puntos.length - 1]
          const max = Math.max(1, ...c.puntos.flatMap(x => [x.vistas, x.mediana_previos ?? 0]))
          const X = (h: number) => (h / 48) * 300, Y = (v: number) => 90 - (v / max) * 84
          const linea = (xs: [number, number][]) => xs.map(([h, v], i) => `${i ? 'L' : 'M'}${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
          return <div key={c.video_id} className={j.curva}>
            <p className={j.cartaNombre}><b>{p?.titulo ?? c.video_id}</b>{ult && <small>{Math.round(ult.edad_h)} h · {compacto(ult.vistas)} vistas{ult.ratio != null ? ` · ×${ult.ratio.toFixed(2)} tu mediana` : ''}</small>}</p>
            <svg viewBox="0 0 300 96" role="img" aria-label="Curva de vistas en 48 horas">
              <path d={linea(c.puntos.filter(x => x.mediana_previos != null).map(x => [x.edad_h, x.mediana_previos!]))} className={j.curvaMediana} />
              <path d={linea(c.puntos.map(x => [x.edad_h, x.vistas]))} className={j.curvaTu} />
            </svg>
            {c.falta && <p className={j.nota}>Falta · {c.falta}</p>}
          </div>
        })}</div>}
  </section>
}

// ── Videos ─────────────────────────────────────────────────────────────────────────────────────────────────────

function Partidas({ partidas, analitica, ver, videosYVentas }: { partidas: Partida[]; analitica: Map<string, VideoPropio>; ver?: (p: Partida) => void; videosYVentas: React.ReactNode }) {
  const [ventas, setVentas] = useState(false)
  const res = resumenCoronas(partidas)
  const ctr = (v?: VideoPropio) => v?.impressions_ctr == null ? null : v.impressions_ctr > 1 ? v.impressions_ctr : v.impressions_ctr * 100
  return <>
    <section className={s.bloque} data-testid="partidas">
      <header className={s.bloqueCabeza}><h3><PlaySquare size={14} /> Videos</h3>
        <small>Tus últimos {partidas.length} largos contra tu mediana a la misma edad. Indicador: 1 nivel si la supera, 2 si la duplica, 3 si es ×5. <b>{res.total} puntos</b>.</small></header>
      {!partidas.length ? <Vacio>Sin videos: no hay largos tuyos en la lectura.</Vacio> : <ol className={j.partidas}>
        {partidas.map((x, i) => { const a = analitica.get(x.video_id), c = ctr(a)
          return <li key={x.video_id} className={`${j.partida} mov-entra`} style={{ ['--i' as string]: Math.min(i, 14) }} data-confianza={x.confianza ?? undefined} data-coronas={coronasDe(x) ?? 'en-juego'}>
            <button type="button" className={j.partidaMini} onClick={ver ? () => ver(x) : undefined} disabled={!ver} aria-label={`Ver: ${x.titulo}`}><Miniatura video={{ video_id: x.video_id, titulo: x.titulo }} /></button>
            <span className={j.partidaTexto}>
              <b>{x.titulo}</b>
              <small>{fechaCorta(x.publicado)} · {nombreFormato(x.formato)}{x.confianza === 'baja' ? ' · mediana con poca historia' : ''}</small>
            </span>
            <span className={j.partidaNums}>
              <span><b>{compacto(x.vistas)}</b><small>vistas · esperadas {compacto(x.esperado)}</small></span>
              <span><b>{c != null ? `${c.toFixed(1)} %` : '—'}</b><small>CTR</small></span>
              <span><b>{a?.avg_view_percentage != null ? `${Math.round(a.avg_view_percentage)} %` : '—'}</b><small>% visto</small></span>
            </span>
            <span className={j.partidaFin}><Rendimiento n={coronasDe(x)} /><small>{multTexto(x.puntaje)}</small></span>
          </li> })}
      </ol>}
    </section>
    <section className={s.bloque} data-testid="tus-videos">
      <header className={s.bloqueCabeza}><h3>Tus videos y sus ventas</h3><small>Vistas, retención y lo que cada video cobró. Las altas pagadas aún no entran en el rendimiento.</small></header>
      {ventas ? videosYVentas : null}
      <button className={s.verMas} onClick={() => setVentas(!ventas)} aria-expanded={ventas}><ChevronDown size={13} data-abierto={ventas || undefined} /> {ventas ? 'Ocultar' : 'Ver tus videos con sus ventas'}</button>
    </section>
  </>
}

// ── Formatos ──────────────────────────────────────────────────────────────────────────────────────────────────

function BarraTasa({ m, liga }: { m: Mazo; liga?: number | null }) {
  return <span className={j.tasa} aria-hidden>
    <i style={{ width: `${Math.round(m.tasa_coronas * 100)}%` }} />
    {liga != null && <em style={{ left: `${Math.round(liga * 100)}%` }} title={`El ranking: ${Math.round(liga * 100)} %`} />}
  </span>
}

function Mazos({ juego, porId, partidas }: { juego: Juego; porId: Map<string, VideoCuartel>; partidas: Partida[] }) {
  const xs = ordenarMazos(juego.mazos.mazos ?? [])
  // La tasa del ranking por formato, de los 28 días (solo los que entran en el meta de esa ventana).
  const liga = new Map((juego.meta['28d']?.hispana?.top3 ?? []).map(m => [m.formato, m.tasa_coronas]))
  const titulo = (id?: string | null) => (id ? partidas.find(p => p.video_id === id)?.titulo ?? porId.get(id)?.titulo ?? null : null)
  const masUsado = [...xs].sort((a, b) => b.videos - a.videos)[0]
  return <section className={s.bloque} data-testid="mazos">
    <header className={s.bloqueCabeza}><h3><Layers size={14} /> Tus formatos</h3>
      <small>Tus formatos en los largos de 365 días: la barra es el % de videos arriba de tu mediana{liga.size ? '; la raya, el ranking hispano en 28 días' : ''}.</small></header>
    {!xs.length ? <Vacio>Sin formatos clasificados todavía.</Vacio> : <>
      {masUsado && <p className={s.lectura}><b>Tu formato más usado</b> es {nombreFormato(masUsado.formato).toLowerCase()} ({masUsado.videos} videos), y supera tu mediana en el {Math.round(masUsado.tasa_coronas * 100)} %. <b>El que mejor rinde</b> es {nombreFormato(xs[0].formato).toLowerCase()} ({Math.round(xs[0].tasa_coronas * 100)} % en {xs[0].videos} {xs[0].videos === 1 ? 'video' : 'videos'}).</p>}
      <ol className={j.mazos}>{xs.map((m, i) => <li key={m.formato} className={`${j.mazo} mov-entra`} style={{ ['--i' as string]: i }} data-poca={m.videos < 3 || undefined}>
        <p className={j.cartaNombre}><b>{nombreFormato(m.formato)}</b><small>{m.videos} {m.videos === 1 ? 'video' : 'videos'}{m.videos < 3 ? ' · poca muestra' : ''}</small></p>
        <p className={j.mazoTasa}><b>{Math.round(m.tasa_coronas * 100)} %</b> <small>arriba de tu mediana · {m.coronas_por_video.toFixed(2)} puntos por video</small></p>
        <BarraTasa m={m} liga={liga.get(m.formato)} />
        {titulo(m.mejor_video) && <p className={j.nota}>Su mejor: «{titulo(m.mejor_video)}»</p>}
      </li>)}</ol>
      {!!juego.mazos.sin_formato && <p className={j.nota}>{juego.mazos.sin_formato} videos sin formato.</p>}
    </>}
  </section>
}

// ── Tendencias ──────────────────────────────────────────────────────────────────────────────────────────────────

function Meta({ juego, porId, ver }: { juego: Juego; porId: Map<string, VideoCuartel>; ver?: (v: VideoCuartel) => void }) {
  const [ventana, setVentana] = useState<'7d' | '28d'>('7d')
  const tuyos = new Map((juego.mazos.mazos ?? []).map(m => [m.formato, m]))
  return <section className={s.bloque} data-testid="meta">
    <header className={s.bloqueCabeza}><h3><TrendingUp size={14} /> Tendencias</h3>
      <small>Los 3 formatos que mejor rindieron en los rankings {ventana === '7d' ? 'esta semana (7 días)' : 'en 28 días'}, sin ti y sin videos con sospecha de pauta.</small>
      <span className={j.segmento} role="group" aria-label="Ventana">{(['7d', '28d'] as const).map(v => <button key={v} type="button" data-activo={ventana === v || undefined} onClick={() => setVentana(v)}>{v === '7d' ? '7 días' : '28 días'}</button>)}</span></header>
    <div className={j.metaLigas}>{(['hispana', 'mundial'] as const).map(l => {
      const top = juego.meta[ventana]?.[l]?.top3 ?? []
      return <div key={l} className={j.metaLiga}>
        <p className={s.ceja}>{l === 'hispana' ? 'Ranking hispano' : 'Ranking mundial'}</p>
        {!top.length ? <Vacio>Sin videos del ranking en esta ventana.</Vacio> : <ol>{top.map(m => { const ej = m.mejor_video ? porId.get(m.mejor_video) : null, tuyo = tuyos.get(m.formato)
          return <li key={m.formato} className={j.metaFila}>
            <span className={j.metaLugar}>{m.lugar ?? ''}</span>
            <span className={j.metaTexto}>
              <p className={j.cartaNombre}><b>{nombreFormato(m.formato)}</b><small>{m.videos} videos · {Math.round(m.tasa_coronas * 100)} % arriba de su mediana</small></p>
              <BarraTasa m={m} liga={tuyo?.tasa_coronas ?? null} />
              <small className={j.nota}>{tuyo ? `Tú: ${Math.round(tuyo.tasa_coronas * 100)} % en ${tuyo.videos} ${tuyo.videos === 1 ? 'video' : 'videos'} (la raya).` : 'No lo has usado.'}</small>
              {ej ? <button type="button" className={j.ejemplo} onClick={ver ? () => ver(ej) : undefined} disabled={!ver}><span className={j.ejemploMini}><Miniatura video={ej} /></span><span><b>{ej.titulo}</b><small>{ej.canal}{ej.outlier ? ` · ${multTexto(ej.outlier.puntaje)}` : ''}</small></span></button>
                : m.mejor_video ? <small className={j.nota}>Su mejor ejemplo no está en la lectura.</small> : null}
            </span>
          </li> })}</ol>}
      </div> })}</div>
  </section>
}

// ── Ranking ────────────────────────────────────────────────────────────────────────────────────────────────────

function Rankings({ juego }: { juego: Juego }) {
  const { irCanal, avatar } = useCuartel()
  const [liga, setLiga] = useState<'hispana' | 'mundial'>('hispana')
  const [toda, setToda] = useState(false)
  const filas = juego.rankings[liga] ?? []
  const lista = toda ? filas : ventanaLiga(filas, 4)
  const lugar = juego.perfil.ligas[liga]
  return <section className={s.bloque} data-testid="rankings">
    <header className={s.bloqueCabeza}><h3><ListOrdered size={14} /> Ranking</h3>
      <small>{lugar ? <>Vas <b>{lugarTxt(lugar.lugar)} de {lugar.de}</b>. </> : null}Vistas de los largos en 28 días; el mismo cálculo para todos. Se recalcula una vez al día.</small>
      <span className={j.segmento} role="group" aria-label="Liga">{(['hispana', 'mundial'] as const).map(l => <button key={l} type="button" data-activo={liga === l || undefined} onClick={() => setLiga(l)}>{l === 'hispana' ? 'Hispana' : 'Mundial'}</button>)}</span></header>
    {!filas.length ? <Vacio>Sin tabla de este ranking.</Vacio> : <ol className={j.tabla}>
      {lista.map((f, i) => 'hueco' in f ? <li key={`h${i}`} className={j.hueco}>· · · {f.hueco} {f.hueco === 1 ? 'canal' : 'canales'}</li>
        : <li key={f.channel_id} className={j.fila} data-tu={f.tuyo || undefined} data-podio={f.lugar <= 3 || undefined}>
          <span className={j.filaLugar}>{f.lugar}</span>
          {f.tuyo ? <span className={j.filaNombre}><b>Tú</b></span>
            : <button type="button" className={j.filaNombre} onClick={() => irCanal(f.channel_id)} title={`Ir al canal de ${f.nombre}`}>
              {avatar(f.channel_id) ? <img src={avatar(f.channel_id)!} alt="" loading="lazy" /> : <i aria-hidden>{f.nombre.slice(0, 1)}</i>}<b>{f.nombre}</b></button>}
          <small className={j.filaArena}>Nivel {f.arena}</small>
          <small className={j.filaLargos}>{f.largos_28d} {f.largos_28d === 1 ? 'largo' : 'largos'}</small>
          <b className={j.filaTrofeos}><Eye size={12} aria-hidden /> {f.trofeos.toLocaleString('es-MX')}</b>
        </li>)}
    </ol>}
    {filas.length > 0 && <button className={s.verMas} onClick={() => setToda(!toda)} aria-expanded={toda}><ChevronDown size={13} data-abierto={toda || undefined} /> {toda ? 'Solo el podio y tu vecindad' : `Ver el ranking completo (${filas.length})`}</button>}
  </section>
}
