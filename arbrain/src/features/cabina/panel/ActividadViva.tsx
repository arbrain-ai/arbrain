'use client'
/**
 * Verlo trabajar (7 oct 2026). Desde el 6 oct los subagentes corren sin pantalla y el detalle mostraba un
 * resumen quieto; Daniel: «me gustaba esa sensación de entrar y verlo trabajando… ahora se siente estático».
 * Esto es su terminal reconstruida de la bitácora de eventos: cada comando con su salida, cada archivo que toca
 * con sus líneas, lo que dice y cuándo piensa, en vivo (sondeo de 1 s mientras trabaja, solo lo nuevo por offset).
 * Agnóstico al proveedor: claude, codex, opencode, qwen o gemini se ven igual.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { aplicar, duracion, enQue, relativa, urlActividad, vacia, type Actividad, type Lectura, type Resultado, type Visible } from './actividad-modelo'
import a from './actividad.module.css'

const VIVO_MS = 1000, QUIETO_MS = 6000

export function ActividadViva({ agente, cwd }: { agente: number; cwd: string }) {
  const [act, setAct] = useState<Actividad>(vacia)
  const [error, setError] = useState<string | null>(null)
  const [encargo, setEncargo] = useState<string | null>(null)
  const ref = useRef(act); ref.current = act
  const caja = useRef<HTMLDivElement | null>(null)
  const pegado = useRef(true)
  const [lejos, setLejos] = useState(false)
  const [ahora, setAhora] = useState(() => Date.now())
  // Cuándo vio la app nacer cada herramienta: su reloj corre aunque el CLI no mande progreso.
  const vistas = useRef(new Map<string, number>())

  useEffect(() => {
    let vivo = true, t: ReturnType<typeof setTimeout> | undefined
    const ciclo = async () => {
      if (!vivo) return
      if (document.visibilityState === 'visible') {
        try {
          const r = await fetch(urlActividad(agente, ref.current), { cache: 'no-store' })
          const j = await r.json() as Lectura & { error?: string }
          if (!vivo) return
          if (!r.ok) setError(j.error ?? 'No se pudo leer su actividad.')
          else {
            setError(null)
            if (j.encargo) setEncargo(j.encargo)
            const n = Date.now()
            for (const p of j.pasos) if (p.k === 'herramienta' && !vistas.current.has(p.id)) vistas.current.set(p.id, n)
            setAct(prev => aplicar(prev, j, n))
          }
        } catch { if (vivo) setError('Sin conexión con el Studio.') }
      }
      if (vivo) t = setTimeout(ciclo, ref.current.corriendo || ref.current.offset == null ? VIVO_MS : QUIETO_MS)
    }
    void ciclo()
    const alVolver = () => { if (document.visibilityState === 'visible') { clearTimeout(t); void ciclo() } }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo = false; clearTimeout(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [agente])

  // Reloj de un segundo solo mientras trabaja: «hace 12 s», el tiempo de un comando largo.
  useEffect(() => {
    if (!act.corriendo) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [act.corriendo])

  // Seguir el final como una terminal, salvo que Daniel haya subido a leer.
  useLayoutEffect(() => { const el = caja.current; if (el && pegado.current) el.scrollTop = el.scrollHeight }, [act])
  const alDesplazar = () => {
    const el = caja.current; if (!el) return
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    pegado.current = cerca; setLejos(!cerca)
  }
  const alFinal = () => { const el = caja.current; if (el) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); pegado.current = true; setLejos(false) } }

  const ahoraEn = enQue(act)
  const ultimo = act.pasos.length - 1
  const quieto = act.corriendo && act.ultimoCambio ? (ahora - act.ultimoCambio) / 1000 : 0
  const cargando = act.offset == null && !error

  return <div className={a.marco}>
    <div ref={caja} className={a.caja} onScroll={alDesplazar} aria-live="off">
      {act.recortado && <p className={a.recorte}>Sus pasos más recientes. Lo anterior sigue en su bitácora.</p>}
      {cargando && <p className={a.nota}>Leyendo lo que está haciendo…</p>}
      {!cargando && act.pasos.length === 0 && encargo && <Bloque titulo="Encargo de Levy" texto={encargo} />}
      {act.pasos.map((p, i) => <PasoVista key={i} p={p} ultimo={i === ultimo} act={act} cwd={cwd} ahora={ahora} vistas={vistas.current} />)}
      {act.corriendo && <div className={a.vivo} data-tipo={ahoraEn.tipo}>
        <span className={a.chispa} aria-hidden>✻</span>
        <span className={a.vivoTexto}>{ahoraEn.texto}</span>
        {quieto >= 8 && ahoraEn.tipo !== 'herramienta' && <span className={a.vivoQuieto}>· sin novedad hace {duracion(quieto)}</span>}
        <span className={a.cursor} aria-hidden />
      </div>}
      {error && <p className={a.falla}>{error}</p>}
    </div>
    {lejos && <button className={a.alFinal} onClick={alFinal}><ArrowDown size={13} aria-hidden />{act.corriendo ? 'En vivo' : 'Al final'}</button>}
  </div>
}

function PasoVista({ p, ultimo, act, cwd, ahora, vistas }: { p: Visible; ultimo: boolean; act: Actividad; cwd: string; ahora: number; vistas: Map<string, number> }) {
  switch (p.k) {
    case 'encargo': return <Bloque titulo={p.n > 1 ? `Turno ${p.n} · Levy le escribió` : 'Encargo de Levy'} texto={p.texto} />
    case 'entrada': return <div className={a.entrada}><b>Levy, a mitad del paso</b><p>{p.texto}</p></div>
    case 'texto': return <p className={a.texto} data-sub={p.sub || undefined}>{p.texto}</p>
    case 'pensando': return null
    case 'fin': return <div className={a.fin} data-falla={p.codigo !== 0 && !p.detenido || undefined}><span>{p.detenido ? 'Levy detuvo el paso' : p.codigo === 0 ? 'Terminó su turno' : `Salió con código ${p.codigo}`}</span></div>
    case 'error': return <p className={a.falla}>{p.texto}</p>
    case 'herramienta': return <Herramienta p={p} res={act.resultados[p.id]} seg={act.progreso[p.id]} corriendo={act.corriendo} ultimo={ultimo} cwd={cwd} ahora={ahora} desde={vistas.get(p.id)} />
  }
}

const ES_ARCHIVO = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function Herramienta({ p, res, seg, corriendo, ultimo, cwd, ahora, desde }: { p: Extract<Visible, { k: 'herramienta' }>; res?: Resultado; seg?: number; corriendo: boolean; ultimo: boolean; cwd: string; ahora: number; desde?: number }) {
  const [abierto, setAbierto] = useState(false)
  const enCurso = !res && corriendo
  const estado = res ? (res.ok ? 'ok' : 'falla') : enCurso ? 'corriendo' : 'suelta'
  const detalle = ES_ARCHIVO.has(p.nombre) || p.nombre === 'Grep' || p.nombre === 'Glob' ? relativa(p.detalle, cwd) : p.detalle
  const largo = detalle.split('\n').length > 3 || detalle.length > 240
  const tiempo = enCurso ? Math.max(seg ?? 0, desde ? (ahora - desde) / 1000 : 0) : 0
  return <div className={a.her} data-estado={estado} data-sub={p.sub || undefined} data-ultimo={ultimo || undefined}>
    <span className={a.punto} aria-hidden />
    <div className={a.herCuerpo}>
      <div className={a.herCab}>
        <b>{p.que}</b>
        {p.cambio && (p.cambio.pone > 0 || p.cambio.quita > 0) && <span className={a.cambio}>{p.cambio.pone > 0 && <ins>+{p.cambio.pone}</ins>}{p.cambio.quita > 0 && <del>−{p.cambio.quita}</del>}</span>}
        {enCurso && tiempo >= 2 && <span className={a.reloj}>{duracion(tiempo)}</span>}
      </div>
      {detalle && <pre className={a.detalle} data-comando={p.nombre === 'Bash' || undefined} data-plegado={largo && !abierto || undefined} onClick={largo ? () => setAbierto(v => !v) : undefined}>{detalle}</pre>}
      {res && <Salida r={res} nombre={p.nombre} />}
    </div>
  </div>
}

function Salida({ r, nombre }: { r: Resultado; nombre: string }) {
  const [abierta, setAbierta] = useState(false)
  if (nombre === 'Read' && r.ok) return <span className={a.resumen}>{r.lineas} líneas</span>
  if (!r.salida) return r.codigo && r.codigo !== 0 ? <span className={a.resumen} data-falla>salió con código {r.codigo}</span> : null
  const lineas = r.salida.split('\n').length
  const plegable = lineas > 5
  return <pre className={a.salida} data-falla={!r.ok || undefined} data-plegado={plegable && !abierta || undefined} onClick={plegable ? () => setAbierta(v => !v) : undefined} title={plegable ? (abierta ? 'Plegar' : 'Ver más') : undefined}>
    {r.salida}{r.codigo != null && r.codigo !== 0 ? `\n(salió con código ${r.codigo})` : ''}
  </pre>
}

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  const [abierto, setAbierto] = useState(false)
  const largo = texto.length > 280 || texto.split('\n').length > 4
  return <div className={a.encargo}>
    <span className={a.turno}>{titulo}</span>
    <p data-plegado={largo && !abierto || undefined}>{texto}</p>
    {largo && <button className={a.enlace} onClick={() => setAbierto(v => !v)}>{abierto ? 'Plegar' : 'Ver completo'}</button>}
  </div>
}

