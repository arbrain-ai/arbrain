'use client'
/**
 * «El taller hoy» (15 oct 2026), la capa de arriba de Taller › Máquina. Daniel: «quiero… los gráficos más hermosos,
 * creativos y originales para mostrar lo que consume recursos en esta máquina, pero pensando en el dueño de negocio que le
 * interesa su "taller"… no demasiado técnico, sí muy bonito visualmente».
 *
 * Tres lecturas, de lo inmediato a lo explorable:
 *  · La frase y la salud: cómo está el taller en una línea y qué cambió hace una hora.
 *  · La mesa: los 32 GB de la máquina como una mesa de trabajo; cada parte del taller ocupa su tramo, lo libre se ve
 *    vacío y lo que trabaja AHORA lleva su filo de oro. Tocar una parte la elige.
 *  · La jornada: el esfuerzo, el espacio y los gráficos del día, con los empujones señalados y «hace 1 h». Con una parte
 *    elegida, su parte de la jornada se ilumina en oro. Al pasar el dedo dice quién trabajaba a esa hora.
 *
 * Ligera a propósito (es lo que mide y no puede ser lo que consume): una lectura por minuto mientras está a la vista,
 * SVG estático, nada late ni repinta en reposo. Lo único que se mueve es la entrada (una vez) y la mesa cuando cambia el
 * dato. Con «reducir movimiento», todo quieto. Datos y reglas: recursos-modelo.ts.
 */
import { useId, useMemo, useState, type PointerEvent as PunteroReact } from 'react'
import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react'
import { escalon, mov } from '@/shared/movimiento'
import { useFuente } from '../datos'
import {
  enGb, frase, haceUnaHora, mesa, momentos, parte as parteDe, puntoEn, quienes, salud, trabaja, type FotoRecursos, type ParteAhora, type Punto,
} from './recursos-modelo'
import r from './recursos.module.css'

export const URL_RECURSOS = '/api/taller/recursos?horas=24'
const hora = (t: number) => new Date(t).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false })
const pct = (x: number | null | undefined) => x == null ? '—' : `${Math.round(x)} %`
const ICONO = { sana: CircleCheck, atenta: TriangleAlert, apretada: CircleAlert, 'sin-dato': CircleDashed } as const

export function RecursosTaller() {
  const { data, error } = useFuente<FotoRecursos>(URL_RECURSOS, 60_000)
  const [elegida, setElegida] = useState<string | null>(null)
  const vista = useMemo(() => {
    if (!data?.disponible || !data.ahora) return null
    const l = data.ahora, t = Date.parse(l.ts)
    const partes = mesa(l, data.nucleos)
    const s = salud(l, Date.now() - t)
    const ultimo = data.serie.at(-1) ?? null
    return { l, t, partes, s, frase: frase(s, l, partes), cambio: haceUnaHora(data.serie, ultimo, t), momentos: momentos(data.serie) }
  }, [data])

  if (error && !data) return null
  if (!data) return <section className={`${r.taller} ${r.cargando}`} aria-busy="true" aria-label="El taller hoy"><span /><span /><span /></section>
  if (!vista) return null
  const { l, s, partes } = vista
  const Icono = ICONO[s.tono]
  const usadoMb = Math.round(data.ramMb * (1 - (l.libre_pct ?? 0) / 100))
  const sel = partes.find(p => p.id === elegida) ?? null
  return <section className={`${r.taller} ${mov.entra}`} style={escalon(1)} aria-label="El taller hoy">
    <header className={r.cabeza}>
      <span className={r.ceja}>El taller hoy</span>
      <span className={r.salud} data-tono={s.tono} title={s.razones.join(' · ') || 'Memoria, disco y fuerza dentro de lo normal'}><Icono size={13} aria-hidden />{s.palabra}</span>
      <span className={r.medido}>medido a las {hora(vista.t)}</span>
    </header>
    <p className={r.frase}>{vista.frase}</p>
    {vista.cambio && <p className={r.cambio}>{vista.cambio}</p>}

    <div className={r.medidores}>
      <Medidor nombre="Espacio" valor={`${enGb(usadoMb)}`} de={`de ${Math.round(data.ramMb / 1024)} GB`} lleno={usadoMb / data.ramMb} i={2} ayuda="La memoria: cuánto de la mesa está ocupado." />
      <Medidor nombre="Esfuerzo" valor={pct(l.cpu_pct)} de="de su fuerza" lleno={(l.cpu_pct ?? 0) / 100} i={3} ayuda={`El procesador: ${data.nucleos} núcleos trabajando juntos.`} />
      <Medidor nombre="Gráficos" valor={pct(l.gpu_pct)} de={l.gpu_pct == null ? 'desde hoy' : 'de la GPU'} lleno={l.gpu_pct == null ? null : l.gpu_pct / 100} i={4} ayuda="La tarjeta gráfica: pantallas, video y la app." />
      <Medidor nombre="Disco" valor={l.disco_gb == null ? '—' : `${Math.round(l.disco_gb)} GB`} de="libres" lleno={null} i={5} ayuda={`Te avisa con menos de 40 GB.${l.swap_gb ? ` Usa ${l.swap_gb.toFixed(1)} GB de disco como reserva de memoria.` : ''}`} />
    </div>

    <Mesa partes={partes} ramMb={data.ramMb} usadoMb={usadoMb} elegida={elegida} elegir={setElegida} />
    {sel && <Ficha p={sel} serie={data.serie} quitar={() => setElegida(null)} />}
    <Jornada foto={data} sel={sel} momentosDia={vista.momentos} />
  </section>
}

function Medidor({ nombre, valor, de, lleno, i, ayuda }: { nombre: string; valor: string; de: string; lleno: number | null; i: number; ayuda: string }) {
  return <div className={`${r.medidor} ${mov.entra}`} style={escalon(i)} title={ayuda}>
    <span className={r.medidorNombre}>{nombre}</span>
    <span className={r.medidorValor}>{valor} <small>{de}</small></span>
    {lleno == null ? <span className={`${r.medidorBarra} ${r.medidorHueco}`} aria-hidden /> : <span className={r.medidorBarra} aria-hidden><i className={mov.llena} style={{ ...escalon(i), width: `${Math.max(1.5, Math.min(100, lleno * 100))}%` }} /></span>}
  </div>
}

// ── La mesa: 32 GB, de izquierda a derecha en el orden del taller; lo libre al final, vacío ──
function Mesa({ partes, ramMb, usadoMb, elegida, elegir }: { partes: ParteAhora[]; ramMb: number; usadoMb: number; elegida: string | null; elegir: (id: string | null) => void }) {
  // Las partes suman memoria real por proceso; lo «usado» del kernel incluye cachés. La mesa reparte lo usado entre las partes
  // en su proporción y deja lo libre como libre: así el largo total es honesto (32 GB) y cada tramo conserva su peso relativo.
  const suma = partes.reduce((a, p) => a + p.mb, 0) || 1
  const escala = Math.min(1, usadoMb / suma)
  const libre = Math.max(0, ramMb - usadoMb)
  const [abierta, setAbierta] = useState(false)
  // Mesa y lista en el MISMO orden (de lo que más ocupa a lo que menos; macOS, el edificio, al final): el tramo y su renglón se encuentran solos.
  const lista = [...partes].sort((a, b) => Number(a.id === 'macos') - Number(b.id === 'macos') || b.mb - a.mb)
  const visibles = abierta ? lista : lista.slice(0, 6)
  return <div className={r.mesa}>
    <div className={r.subcabeza}><span>La mesa</span><small>cada tramo es el espacio que ocupa una parte del taller · <i className={r.filoMuestra} aria-hidden /> trabajando ahora</small></div>
    <div className={r.barra} role="group" aria-label={`La mesa de ${Math.round(ramMb / 1024)} GB`}>
      {lista.map(p => <button key={p.id} type="button" className={r.tramo} data-grupo={p.parte.grupo} data-trabaja={trabaja(p) || undefined} data-ancho={(p.mb * escala) / ramMb >= 0.07 ? 'grande' : undefined} aria-pressed={elegida === p.id}
        style={{ flexGrow: p.mb * escala }} onClick={() => elegir(elegida === p.id ? null : p.id)}
        title={`${p.parte.nombre} · ${enGb(p.mb)}${trabaja(p) ? ` · trabajando (${p.esfuerzo.toFixed(1)} % de la fuerza)` : ''}`}>
        <span className={r.tramoNombre}>{p.parte.nombre}</span>
      </button>)}
      <span className={r.libre} style={{ flexGrow: libre }} title={`Espacio libre · ${enGb(libre)}`}><span className={r.tramoNombre}>Libre · {enGb(libre)}</span></span>
    </div>
    <ul className={r.partes}>
      {visibles.map((p, i) => <li key={p.id}>
        <button type="button" className={`${r.parte} ${mov.entra}`} style={escalon(i + 6)} aria-pressed={elegida === p.id} data-grupo={p.parte.grupo} onClick={() => elegir(elegida === p.id ? null : p.id)}>
          <i className={r.muestra} data-trabaja={trabaja(p) || undefined} aria-hidden />
          <span className={r.parteNombre}>{p.parte.nombre}</span>
          <span className={r.parteDato}>{enGb(p.mb)}</span>
          <span className={r.parteEsfuerzo} data-trabaja={trabaja(p) || undefined}>{trabaja(p) ? `trabaja ${p.esfuerzo < 10 ? p.esfuerzo.toFixed(1) : Math.round(p.esfuerzo)} %` : 'en reposo'}</span>
        </button>
      </li>)}
    </ul>
    {suma > usadoMb * 1.15 && <p className={r.aprieta}>Entre todas piden {enGb(suma)}; macOS las aprieta (comprime y guarda en disco lo que no están usando) para que quepan en {enGb(usadoMb)} de la mesa.</p>}
    {lista.length > 6 && <button type="button" className={r.mas} onClick={() => setAbierta(!abierta)}>{abierta ? 'Ver menos' : `Ver las ${lista.length} partes`}</button>}
  </div>
}

function Ficha({ p, serie, quitar }: { p: ParteAhora; serie: Punto[]; quitar: () => void }) {
  const pico = serie.reduce<{ t: number; mb: number; c: number } | null>((m, x) => { const v = x.comp[p.id]; return v && (!m || v[0] > m.mb) ? { t: x.t, mb: v[0], c: v[1] } : m }, null)
  const esf = serie.reduce<{ t: number; c: number } | null>((m, x) => { const v = x.comp[p.id]; return v && (!m || v[1] > m.c) ? { t: x.t, c: v[1] } : m }, null)
  const ultimo = serie.at(-1)
  const antes = ultimo ? puntoEn(serie, ultimo.t - 3600_000)?.comp[p.id]?.[0] : undefined
  return <div className={`${r.ficha} ${mov.aparece}`} data-grupo={p.parte.grupo}>
    <div className={r.fichaCabeza}><b>{p.parte.nombre}</b><span>{p.parte.que}</span><button type="button" onClick={quitar} aria-label="Cerrar la ficha">×</button></div>
    <p className={r.fichaPorque}>{p.parte.porque}</p>
    <dl className={r.fichaDatos}>
      <div><dt>Ahora</dt><dd>{enGb(p.mb)}{trabaja(p) ? ` · ${p.esfuerzo.toFixed(1)} % de la fuerza` : ' · en reposo'}</dd></div>
      {antes != null && <div><dt>Hace 1 h</dt><dd>{enGb(antes)}</dd></div>}
      {pico && <div><dt>Su mayor espacio hoy</dt><dd>{enGb(pico.mb)} a las {hora(pico.t)}</dd></div>}
      {esf && esf.c >= 1 && <div><dt>Su mayor esfuerzo</dt><dd>{Math.round(esf.c)} % a las {hora(esf.t)}</dd></div>}
    </dl>
  </div>
}

// ── La jornada: tres tiras con el mismo reloj (esfuerzo, espacio, gráficos), cada una con su propia escala de 0 a 100 % ──
const AN = 1000
function Jornada({ foto, sel, momentosDia }: { foto: FotoRecursos; sel: ParteAhora | null; momentosDia: ReturnType<typeof momentos> }) {
  const id = useId().replace(/:/g, '')
  const [cursor, setCursor] = useState<Punto | null>(null)
  const serie = foto.serie
  if (serie.length < 2) return <p className={r.nota}>La jornada se dibuja cuando el vigía junte unos minutos de lecturas.</p>
  const fin = serie.at(-1)!.t, ini = Math.min(serie[0].t, fin - 3600_000 * 6)
  const x = (t: number) => ((t - ini) / (fin - ini)) * AN
  const paso = foto.pasoMin * 60_000
  const conGpu = serie.some(p => p.gpu != null)
  const tiras: { clave: string; nombre: string; valor: (p: Punto) => number | null; de?: (p: Punto) => number | null; formato: (p: Punto) => string }[] = [
    { clave: 'esfuerzo', nombre: 'Esfuerzo', valor: p => p.cpu, de: sel ? p => p.comp[sel.id]?.[1] ?? 0 : undefined, formato: p => pct(p.cpu) },
    { clave: 'espacio', nombre: 'Espacio', valor: p => (p.usado / foto.ramMb) * 100, de: sel ? p => ((p.comp[sel.id]?.[0] ?? 0) / foto.ramMb) * 100 : undefined, formato: p => enGb(p.usado) },
    ...(conGpu ? [{ clave: 'graficos', nombre: 'Gráficos', valor: (p: Punto) => p.gpu, formato: (p: Punto) => pct(p.gpu) }] : []),
  ]
  const unaHora = fin - 3600_000
  const marcas = horasRedondas(ini, fin).filter(t => Math.abs(x(t) - x(unaHora)) > 70)
  const mover = (e: PunteroReact<HTMLDivElement>) => {
    const b = (e.currentTarget.querySelector('[data-lienzo]') ?? e.currentTarget).getBoundingClientRect()
    const t = ini + ((e.clientX - b.left) / b.width) * (fin - ini)
    setCursor(puntoEn(serie, t, paso * 1.5))
  }
  const quien = quienes(cursor, 3)
  return <div className={r.jornada}>
    <div className={r.subcabeza}><span>La jornada</span><small>{sel ? <>en oro, la parte de <b>{sel.parte.nombre}</b></> : 'desde ' + hora(serie[0].t) + ' · pasa el dedo para ver quién trabajaba'}</small></div>
    <div className={r.tiras} onPointerMove={mover} onPointerLeave={() => setCursor(null)} onPointerDown={mover}>
      {tiras.map(tira => <div key={tira.clave} className={r.tira}>
        <span className={r.tiraNombre}>{tira.nombre}</span>
        <div className={r.tiraLienzo} data-lienzo>
        <svg viewBox={`0 0 ${AN} 100`} preserveAspectRatio="none" className={r.tiraSvg} aria-hidden>
          <defs><linearGradient id={`${id}-${tira.clave}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" className={r.gradA} /><stop offset="1" className={r.gradB} /></linearGradient></defs>
          {[25, 50, 75].map(y => <line key={y} x1="0" x2={AN} y1={y} y2={y} className={r.reja} vectorEffect="non-scaling-stroke" />)}
          <path d={area(serie, x, tira.valor, paso)} fill={`url(#${id}-${tira.clave})`} />
          <path d={linea(serie, x, tira.valor, paso)} className={r.trazo} vectorEffect="non-scaling-stroke" />
          {tira.de && <path d={area(serie, x, tira.de, paso)} className={`${r.oro} ${mov.aparece}`} />}
          <line x1={x(unaHora)} x2={x(unaHora)} y1="0" y2="100" className={r.haceUna} vectorEffect="non-scaling-stroke" />
        </svg>
        {tira.clave === 'esfuerzo' && momentosDia.map(m => <span key={m.t} className={r.momento} data-lado={x(m.t) > AN * 0.62 ? 'izq' : undefined} style={{ left: `${(x(m.t) / AN) * 100}%` }} title={`${hora(m.t)} · empujón al ${Math.round(m.cpu)} %${m.quien ? ` · ${PARTE_NOMBRE(m.quien)}` : ''}`}>
          <i aria-hidden /><span>{hora(m.t)}{m.quien ? ` · ${PARTE_NOMBRE(m.quien)}` : ''}</span>
        </span>)}
        </div>
      </div>)}
      {cursor && <div className={r.capa}>
        <span className={r.cursor} style={{ left: `${(x(cursor.t) / AN) * 100}%` }} aria-hidden />
        <div className={r.globo} data-lado={x(cursor.t) > AN * 0.6 ? 'izq' : 'der'} style={{ left: `${(x(cursor.t) / AN) * 100}%` }} role="status">
          <b>{hora(cursor.t)}</b>
          <span>Esfuerzo {pct(cursor.cpu)} · Espacio {enGb(cursor.usado)}{cursor.gpu != null ? ` · Gráficos ${pct(cursor.gpu)}` : ''}</span>
          {quien.length ? <ul>{quien.map(q => <li key={q.id}><i data-grupo={q.parte.grupo} aria-hidden />{q.parte.nombre}<em>{q.esfuerzo < 10 ? q.esfuerzo.toFixed(1) : Math.round(q.esfuerzo)} %</em></li>)}</ul> : <span className={r.globoCalma}>Todo en reposo</span>}
        </div>
      </div>}
    </div>
    <div className={r.reloj} aria-hidden>
      {marcas.map(t => <span key={t} style={{ left: `${(x(t) / AN) * 100}%` }}>{hora(t).replace(':00', '')}</span>)}
      <span className={r.relojHace} style={{ left: `${(x(unaHora) / AN) * 100}%` }}>hace 1 h</span>
    </div>
  </div>
}
const PARTE_NOMBRE = (id: string) => parteDe(id).nombre

/** Horas redondas para el reloj de abajo: cada 3 h en 24 h, cada hora en ventanas cortas. */
function horasRedondas(ini: number, fin: number) {
  const span = (fin - ini) / 3600_000, cada = span > 12 ? 3 : span > 6 ? 2 : 1
  const out: number[] = []
  const h0 = new Date(ini); h0.setMinutes(0, 0, 0)
  for (let t = h0.getTime() + 3600_000; t < fin - 1800_000; t += 3600_000) {
    const h = Number(new Date(t).toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }))
    if (h % cada === 0) out.push(t)
  }
  return out
}

/** Tramos continuos (un hueco de más de 2 intervalos parte la gráfica: no se inventa lo que no se midió). */
function tramos(serie: Punto[], valor: (p: Punto) => number | null, paso: number) {
  const out: { t: number; v: number }[][] = []
  let cur: { t: number; v: number }[] = [], prev: number | null = null
  for (const p of serie) {
    const v = valor(p)
    if (v == null || (prev != null && p.t - prev > paso * 2.5)) { if (cur.length) out.push(cur); cur = [] }
    if (v != null) cur.push({ t: p.t, v: Math.max(0, Math.min(100, v)) })
    prev = p.t
  }
  if (cur.length) out.push(cur)
  return out
}
const Y = (v: number) => 100 - v * 0.96
function linea(serie: Punto[], x: (t: number) => number, valor: (p: Punto) => number | null, paso: number) {
  return tramos(serie, valor, paso).map(tr => tr.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')).join('')
}
function area(serie: Punto[], x: (t: number) => number, valor: (p: Punto) => number | null, paso: number) {
  return tramos(serie, valor, paso).map(tr => {
    const a = x(tr[0].t).toFixed(1), b = x(tr.at(-1)!.t).toFixed(1)
    return `M${a},100${tr.map(p => `L${x(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')}L${b},100Z`
  }).join('')
}
