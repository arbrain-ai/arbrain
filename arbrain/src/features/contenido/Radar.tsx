'use client'
/**
 * Radar (v2, 15 nov 2026): función antes que belleza. El dueño: «me gustó el radar, ¿podemos mejorar la UX?».
 *  1. El filtro: desde el 19 nov es la barra única de arriba (`Filtro.tsx`), la misma de Inicio; aquí ya no hay filas de
 *     botones de idioma, ventana, tema ni capa.
 *  2. El detector: cada outlier como un punto en fecha (horizontal, hoy a la derecha) × multiplicador (vertical, eje
 *     ajustado a los datos). Arriba a la derecha vive lo que importa: nuevo y fuerte. Debajo, las tarjetas.
 *  3. Tu universo: el directorio de canales (quién publicó último, primero), con el mismo filtro; la constelación queda chica,
 *     al lado. Tocar un canal abre su ficha dentro de Arbrain.
 *  4. Lo último, con tope. Aquí no hay scroll infinito.
 */
import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, Loader2, Radar as RadarIcono, Sparkles, Users } from 'lucide-react'
import { FilaVideo, Miniatura, TarjetaVideo, useCuartel, Vacio } from './piezas'
import { compacto, edad, NOMBRE_CAPA, ORDEN_CAPAS } from './modelo'
import { canalesActivos, dominioLog, fechaCorta, multTexto, ordenarOutliers, posFecha, posLog, publicoHacePoco, ticksFecha, ticksLog, TOPE_MULT, unirOutliers } from './pantalla'
import { pasaCanales, pasaVideo, type Criterio } from './filtro'
import { generarIdea } from './acciones'
import type { CanalCuartel, LecturaCuartel, VideoCuartel } from './tipos'
import type { EnSala } from './Sala'
import s from './cuartel.module.css'

/** El filtro lo manda la barra única de arriba (19 nov 2026): aquí solo se aplica. */
export function Radar({ lectura, abrir, criterio }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void; criterio: Criterio }) {
  const [nOut, setNOut] = useState(8)
  const [nUlt, setNUlt] = useState(12)
  // Cambiar el filtro vuelve a la primera página.
  useEffect(() => { setNOut(8); setNUlt(12) }, [criterio.clave])
  const canales = useMemo(() => lectura.universo?.canales ?? [], [lectura.universo])
  const todosOutliers = useMemo(() => unirOutliers(lectura.outliers, lectura.videos), [lectura.outliers, lectura.videos])
  const outliers = useMemo(() => { const ahora = Date.now(); return ordenarOutliers(todosOutliers.filter(v => pasaVideo(v, criterio, ahora))) }, [todosOutliers, criterio])
  const recientes = useMemo(() => { const ahora = Date.now(); return lectura.videos.filter(v => pasaVideo(v, criterio, ahora)) }, [lectura.videos, criterio])
  const ver = (v: VideoCuartel) => abrir({ video: v, desde: 'radar', calificacion: lectura.ranking[v.video_id] })
  const firmes = outliers.filter(v => v.outlier?.confianza !== 'baja').length
  const ventana = criterio.dias

  return <div className={s.pestana}>
    <section className={s.bloque} data-testid="detector">
      <header className={s.bloqueCabeza}><h3><Sparkles size={14} /> Outliers <b className={s.cuenta}>{outliers.length}</b></h3>
        <small className={s.soloAncho}>Rinden muy por encima de lo normal de su canal. Arriba a la derecha: lo nuevo y fuerte.{firmes < outliers.length ? <> Punto hueco o sello oscuro: canal con poca historia.</> : null}</small></header>
      {outliers.length ? <>
        <Dispersion outliers={outliers} ventana={ventana} ver={ver} />
        <div className={s.rejilla}>{outliers.slice(0, nOut).map((v, i) => <TarjetaOutlier key={v.video_id} v={v} i={i} ver={ver} />)}</div>
        {outliers.length > nOut && nOut < 24 && <button className={s.verMas} onClick={() => setNOut(Math.min(24, nOut + 8))}>Ver {Math.min(8, outliers.length - nOut)} más</button>}
      </> : <Vacio>Sin outliers con este filtro. Prueba una ventana más larga («90 días») o «todos los temas».</Vacio>}
    </section>

    <Canales canales={canales} videos={lectura.videos} criterio={criterio} />

    <section className={s.bloque} data-testid="ultimo">
      <header className={s.bloqueCabeza}><h3><RadarIcono size={14} /> Lo último <b className={s.cuenta}>{recientes.length}</b></h3><small>Quién publicó qué y cuánto le está funcionando, lo más nuevo primero.</small></header>
      {recientes.length ? <>
        <ul className={`${s.filas} ${s.filasDos}`}>{recientes.slice(0, nUlt).map((v, i) => <FilaVideo key={v.video_id} v={v} i={i} abrir={ver} />)}</ul>
        {recientes.length > nUlt && nUlt < 36 ? <button className={s.verMas} onClick={() => setNUlt(Math.min(36, nUlt + 12))}>Ver {Math.min(12, recientes.length - nUlt)} más</button>
          : <p className={s.alDia}>Hasta aquí lo último. Lo demás está en la ficha de cada canal.</p>}
      </> : <Vacio>Nada publicado con este filtro.</Vacio>}
    </section>
  </div>
}

// ── La gráfica: fecha × multiplicador ────────────────────────────────────────

/**
 * Cada outlier es un punto: a la derecha lo más nuevo, arriba lo que más rinde. El eje vertical es logarítmico y se
 * ajusta a lo que hay (antes iba fijo de ×1 a ×30 y todo quedaba amontonado en una esquina). Los 3 más fuertes llevan
 * su multiplicador escrito. Pasar el cursor (o tocar) enseña el video; tocar la tarjetita lo abre.
 */
function Dispersion({ outliers, ventana, ver }: { outliers: VideoCuartel[]; ventana: number; ver: (v: VideoCuartel) => void }) {
  const [foco, setFoco] = useState<VideoCuartel | null>(null)
  const ahora = Date.now()
  const pts = outliers.slice(0, 320)
  // El eje se topa en ×100: más arriba ya no distingue nada y solo aplasta lo demás. Lo que pasa de ahí se pinta en el
  // techo y su marca dice «×100+».
  const { min, max } = dominioLog(pts.map(v => v.outlier!.puntaje), TOPE_MULT)
  const pasa = pts.some(v => v.outlier!.puntaje > TOPE_MULT)
  const ty = ticksLog(min, max), tx = ticksFecha(ventana, ahora)
  const pos = (v: VideoCuartel) => ({ x: posFecha(v.publicado, ventana, ahora), y: posLog(v.outlier!.puntaje, min, max) })
  // Rótulos: los 3 con más peso, sin encimarse (si dos caen juntos, se rotula el de más peso) ni salirse del lienzo.
  const rotulados: { id: string; x: number }[] = []
  for (const v of pts) { const x = posFecha(v.publicado, ventana, ahora); if (rotulados.every(r => Math.abs(r.x - x) > 0.2)) rotulados.push({ id: v.video_id, x }); if (rotulados.length >= 3) break }
  const tope = new Set(rotulados.map(r => r.id))
  const f = foco && pts.some(v => v.video_id === foco.video_id) ? { v: foco, ...pos(foco) } : null
  return <div className={s.dispersion} data-testid="dispersion" onMouseLeave={() => setFoco(null)}>
    <div className={s.dispEjeY} aria-hidden>{ty.map(t => <span key={t} style={{ bottom: `${posLog(t, min, max) * 100}%` }}>×{t}{pasa && t === max ? '+' : ''}</span>)}</div>
    <div className={s.dispLienzo} role="group" aria-label={`${pts.length} outliers por fecha y multiplicador`}>
      {ty.map(t => <i key={`y${t}`} className={s.dispGuiaY} style={{ bottom: `${posLog(t, min, max) * 100}%` }} aria-hidden />)}
      {tx.map(t => <i key={`x${t.x}`} className={s.dispGuiaX} style={{ left: `${t.x * 100}%` }} aria-hidden />)}
      {pts.map((v, i) => { const p = pos(v); return <button key={v.video_id} className={s.punto} data-capa={v.capa} data-baja={v.outlier?.confianza === 'baja' || undefined}
        data-tope={tope.has(v.video_id) || undefined} data-foco={foco?.video_id === v.video_id || undefined} data-lado={p.x > 0.85 ? 'der' : p.x < 0.15 ? 'izq' : undefined}
        style={{ left: `${p.x * 100}%`, bottom: `${p.y * 100}%`, ['--i' as string]: Math.min(i, 20) }}
        onMouseEnter={() => setFoco(v)} onFocus={() => setFoco(v)} onClick={() => (foco?.video_id === v.video_id ? ver(v) : setFoco(v))}
        aria-label={`${multTexto(v.outlier!.puntaje)} · ${v.titulo} · ${v.canal} · ${fechaCorta(v.publicado)}`}>
        {tope.has(v.video_id) && <span><i className={s.soloAnchoEnLinea}>{v.canal.length > 16 ? `${v.canal.slice(0, 15)}…` : v.canal} </i>{multTexto(v.outlier!.puntaje)}</span>}
      </button> })}
      {f && <button className={s.dispFoco} onClick={() => ver(f.v)} data-abajo={f.y > 0.55 || undefined}
        style={{ left: `clamp(0px, calc(${f.x * 100}% - 130px), calc(100% - 260px))`, ...(f.y > 0.55 ? { top: `calc(${(1 - f.y) * 100}% + 14px)` } : { bottom: `calc(${f.y * 100}% + 14px)` }) }}>
        <Miniatura video={f.v} /><span><b>{multTexto(f.v.outlier!.puntaje)}</b> {f.v.titulo}<small>{f.v.canal} · {fechaCorta(f.v.publicado)} · {compacto(f.v.vistas)} vistas</small></span>
      </button>}
    </div>
    <div className={s.dispEjeX} aria-hidden>{tx.map(t => <span key={t.x} data-borde={t.x < 0.04 ? 'izq' : t.x > 0.96 ? 'der' : undefined} style={{ left: `${t.x * 100}%` }}>{t.etiqueta}</span>)}</div>
  </div>
}

function TarjetaOutlier({ v, i, ver }: { v: VideoCuartel; i: number; ver: (v: VideoCuartel) => void }) {
  const [idea, setIdea] = useState<'nada' | 'generando' | 'lista' | 'error'>('nada')
  const [error, setError] = useState<string | null>(null)
  const crear = async () => {
    setIdea('generando'); setError(null)
    try { await generarIdea(v.video_id); setIdea('lista') } catch (e) { setIdea('error'); setError((e as Error).message) }
  }
  return <TarjetaVideo v={v} i={i} abrir={ver} pie={<>
    <span className={s.contra}><b>{compacto(v.vistas)}</b> vistas · le tocaban <b>{compacto(v.outlier?.esperado)}</b></span>
    <button className={s.enlace} onClick={crear} disabled={idea === 'generando' || idea === 'lista'}>
      {idea === 'generando' ? <><Loader2 size={12} className={s.gira} /> Levy la está pensando…</> : idea === 'lista' ? <>Idea lista en la pestaña Ideas</> : <><Lightbulb size={12} /> Volverla idea de video</>}
    </button>
    {error && <small className={s.avisoChico}>{error}</small>}
  </>} />
}

// ── Tu universo: el directorio y la constelación chica ───────────────────────

/** El propio del dueño: el de más suscriptores entre los «propio» (el otro es el canal de Levy, que va de luna). */
export const canalPropio = (canales: CanalCuartel[]) => [...canales.filter(c => c.capa === 'propio')].sort((a, b) => (b.suscriptores ?? 0) - (a.suscriptores ?? 0))

function Canales({ canales, videos, criterio }: { canales: CanalCuartel[]; videos: VideoCuartel[]; criterio: Criterio }) {
  const { irCanal } = useCuartel()
  const capa = criterio.capa && criterio.capa !== 'descubierto' ? criterio.capa : null
  const lista = useMemo(() => canalesActivos(pasaCanales(canales, criterio)), [canales, criterio])
  const total = canales.filter(c => c.capa !== 'propio').length
  const enVivo = lista.filter(c => publicoHacePoco(c)).length
  const porVideo = useMemo(() => new Map(videos.map(v => [v.video_id, v])), [videos])
  if (!canales.length) return <section className={s.bloque}><Vacio>El universo aún no se publica.</Vacio></section>
  return <section className={s.bloque} data-testid="universo">
    <header className={s.bloqueCabeza}><h3><Users size={14} /> Tu universo <b className={s.cuenta}>{lista.length === total ? total : `${lista.length} de ${total}`}</b></h3>
      <small>{enVivo} publicaron en 72 h. Toca un canal para ir a su ficha; para buscar uno, escribe su nombre arriba.</small>
    </header>
    <div className={s.universoCuerpo}>
      {lista.length ? <ul className={s.canales}>{lista.map(c => {
        const ult = c.ultimo_video
        const mult = c.mejor_outlier_30d && c.mejor_outlier_30d.puntaje >= 2 ? c.mejor_outlier_30d.puntaje : null
        return <li key={c.channel_id}><button onClick={() => irCanal(c.channel_id)} data-capa={c.capa} data-vivo={publicoHacePoco(c) || undefined} title={`Ir al canal de ${c.nombre}`}>
          {c.miniatura_url ? <img src={c.miniatura_url} alt="" loading="lazy" /> : <i aria-hidden>{c.nombre.slice(0, 1)}</i>}
          <span><strong>{c.nombre}</strong><small>{ult ? <>{edad(ult.publicado)} · {porVideo.get(ult.video_id)?.titulo ?? ult.titulo}</> : 'sin videos recientes'}</small></span>
          {mult != null && <b className={s.mult} data-real title="Su mejor outlier de 30 días">{multTexto(mult)}</b>}
        </button></li>
      })}</ul> : <Vacio>Ningún canal con este filtro.</Vacio>}
      <Constelacion canales={canales} capa={capa} irCanal={irCanal} />
    </div>
  </section>
}

const C = 500

/**
 * La constelación, chica: el dueño al centro y un anillo por capa. Cada canal es una estrella del tamaño de su audiencia;
 * late si publicó en 72 h y lleva halo de oro si es de los 5 outliers más fuertes del mes. Tocar una estrella abre su ficha.
 */
function Constelacion({ canales, capa, irCanal }: { canales: CanalCuartel[]; capa: string | null; irCanal: (id: string) => void }) {
  const [yo, ...lunas] = canalPropio(canales)
  const anillos = ORDEN_CAPAS.filter(c => c !== 'propio' && canales.some(x => x.capa === c))
  const otros = canales.filter(c => c.capa !== 'propio')
  const subs = otros.map(c => c.suscriptores ?? 0).filter(x => x > 0)
  const lmin = Math.log10(Math.max(1000, Math.min(...subs, 1e6))), lmax = Math.log10(Math.max(...subs, 1e4))
  const grande = otros.length > 100 ? 10 : otros.length > 60 ? 12 : 15
  const tam = (c: CanalCuartel) => 6 + grande * Math.max(0, Math.min(1, (Math.log10(Math.max(1000, c.suscriptores ?? 1000)) - lmin) / Math.max(0.5, lmax - lmin)))
  // Oro solo para los 5 canales con el outlier más fuerte del mes: si todos brillan, nada brilla.
  const dorados = new Set(otros.filter(c => (c.mejor_outlier_30d?.puntaje ?? 0) >= 3).sort((a, b) => (b.mejor_outlier_30d?.puntaje ?? 0) - (a.mejor_outlier_30d?.puntaje ?? 0)).slice(0, 5).map(c => c.channel_id))
  // Cada anillo ocupa un ancho proporcional a la raíz de cuántos canales trae: 76 de competencia no caben en lo que 6 mentores.
  const cuantos = anillos.map(a => otros.filter(c => c.capa === a).length)
  const pesos = cuantos.map(n => Math.sqrt(Math.max(1, n)) + 1.2), totalPeso = pesos.reduce((a, b) => a + b, 0)
  const anchos = pesos.map(w => (350 * w) / totalPeso)
  const inicio = anchos.map((_, k) => 118 + anchos.slice(0, k).reduce((a, b) => a + b, 0))
  const radio = (k: number) => inicio[k] + anchos[k] / 2
  const nodos = anillos.flatMap((capaK, k) => {
    const r = radio(k)
    const del = otros.filter(c => c.capa === capaK).sort((a, b) => (a.idioma ?? '').localeCompare(b.idioma ?? '') || (b.suscriptores ?? 0) - (a.suscriptores ?? 0))
    // Carriles: si no caben a ~30 de paso en su círculo, se reparten en 2 o 3 órbitas alternas dentro de su banda.
    const carriles = Math.min(3, Math.max(1, Math.ceil((del.length * 30) / (2 * Math.PI * r))))
    const sep = Math.min(30, (anchos[k] - 8) / Math.max(1, carriles))
    return del.map((c, i) => {
      const rr = r + ((i % carriles) - (carriles - 1) / 2) * sep
      const ang = ((i + carriles) / (del.length + 2 * carriles - 1)) * Math.PI * 2 - Math.PI / 2
      return { c, x: C + rr * Math.cos(ang), y: C + rr * Math.sin(ang), r: tam(c), k, i, vivo: publicoHacePoco(c), oro: dorados.has(c.channel_id) }
    })
  })
  return <figure className={s.constelacionCaja}>
    <svg className={s.constelacion} viewBox="0 0 1000 1000" role="img" aria-label={`Constelación de ${otros.length} canales por capa`}>
      <defs>
        <radialGradient id="cu-nucleo"><stop offset="0" stopColor="var(--gold)" stopOpacity="0.5" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></radialGradient>
        {nodos.map(n => <clipPath key={n.c.channel_id} id={`cu-c-${n.c.channel_id}`}><circle r={n.r} /></clipPath>)}
        <clipPath id="cu-yo"><circle cx={C} cy={C} r={44} /></clipPath>
      </defs>
      {anillos.map((a, k) => <g key={a} className={s.anillo} data-capa={a} data-apagado={(capa && capa !== a) || undefined}><circle cx={C} cy={C} r={radio(k)} style={{ ['--i' as string]: k }} /></g>)}
      <circle cx={C} cy={C} r={118} fill="url(#cu-nucleo)" />
      <g className={s.centro} onClick={() => yo && irCanal(yo.channel_id)} role={yo ? 'button' : undefined} aria-label={yo ? `Tú: ${yo.nombre}` : 'Tú'}>
        <circle cx={C} cy={C} r={48} />
        {yo?.miniatura_url ? <image href={yo.miniatura_url} x={C - 44} y={C - 44} width={88} height={88} clipPath="url(#cu-yo)" /> : <text x={C} y={C + 6} textAnchor="middle">Tú</text>}
      </g>
      {lunas.map((l, i) => <g key={l.channel_id} className={s.luna} onClick={() => irCanal(l.channel_id)} role="button" aria-label={l.nombre}
        style={{ ['--x' as string]: `${C + 78 * Math.cos(-0.7 + i)}px`, ['--y' as string]: `${C + 78 * Math.sin(-0.7 + i)}px` }}>
        <circle r={15} />
        {l.miniatura_url ? <><clipPath id={`cu-l-${l.channel_id}`}><circle r={13} /></clipPath><image href={l.miniatura_url} x={-13} y={-13} width={26} height={26} clipPath={`url(#cu-l-${l.channel_id})`} /></> : null}
      </g>)}
      {nodos.map(n => <g key={n.c.channel_id} className={s.estrella} data-capa={n.c.capa} data-vivo={n.vivo || undefined} data-oro={n.oro || undefined}
        data-apagado={(capa && capa !== n.c.capa) || undefined}
        style={{ ['--x' as string]: `${n.x}px`, ['--y' as string]: `${n.y}px`, ['--i' as string]: n.k * 3 + (n.i % 6) }}
        onClick={() => irCanal(n.c.channel_id)} role="button" tabIndex={-1} aria-label={`${n.c.nombre}, ${NOMBRE_CAPA[n.c.capa]}`}>
        <title>{n.c.nombre} · {NOMBRE_CAPA[n.c.capa]} · {compacto(n.c.suscriptores)} subs</title>
        {n.oro && <circle className={s.halo} r={n.r + 7} />}
        {n.vivo && <circle className={s.pulso} r={n.r + 3} />}
        <circle className={s.disco} r={n.r + 1.5} />
        {n.c.miniatura_url ? <image href={n.c.miniatura_url} x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} clipPath={`url(#cu-c-${n.c.channel_id})`} preserveAspectRatio="xMidYMid slice" />
          : <text className={s.inicial} dy="0.35em" textAnchor="middle">{n.c.nombre.slice(0, 1)}</text>}
      </g>)}
    </svg>
    <figcaption className={s.leyenda}>
      {anillos.map(a => <span key={a} data-capa={a}><i />{NOMBRE_CAPA[a]} {otros.filter(c => c.capa === a).length}</span>)}
      <span><i className={s.leyendaVivo} />72 h</span><span><i className={s.leyendaOro} />top 5 del mes</span>
    </figcaption>
  </figure>
}
