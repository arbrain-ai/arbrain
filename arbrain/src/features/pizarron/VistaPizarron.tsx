'use client'
/**
 * Vista «pizarrón» del panel (7 oct 2026): donde Levy enseña conversando.
 *
 * Con `paginaId` es una sesión: el escenario aislado (public/pizarron/escenario.html) pinta, el director lleva el
 * reloj de la voz, y esta vista sondea la sesión mientras Levy escribe pasos. Sin `paginaId` es la casa del pizarrón:
 * sesiones anteriores (retomar o volver a ver) y la biblioteca de objetos vivos.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, CaptionsOff, Eye, Loader2, Maximize, Pause, Pencil, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { Director, RelojVirtual, type EstadoDirector } from './director'
import type { EstadoSesion, Ficha, ResumenSesion } from './modelo'
import { usePanelFijadas } from '@/features/cabina/panel/fijadas'
import { mostrarPanel } from '@/features/cabina/panel/ventanas'
import s from './pizarron.module.css'

const SONDEO_MS = 1000

export function VistaPizarron({ sesion, grande, render }: { sesion?: string; grande?: boolean; render?: boolean }) {
  return sesion ? <Sesion id={sesion} grande={grande} render={render} /> : <Casa />
}

const enviarChat = (texto: string) => {
  // En el banco (sin chat) solo se deja constancia: las pruebas lo leen de aquí.
  if (window.location.pathname.startsWith('/pizarron-lab')) { ((window as unknown as { __pizarronChat?: string[] }).__pizarronChat ??= []).push(texto); return }
  if (window.location.pathname.startsWith('/chat')) window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto } }))
  else { try { sessionStorage.setItem('cabina:pendiente', texto) } catch { /* sin almacenamiento */ } window.location.assign('/chat') }
}

function Sesion({ id, grande, render }: { id: string; grande?: boolean; render?: boolean }) {
  const marco = useRef<HTMLIFrameElement | null>(null)
  const [estado, setEstado] = useState<EstadoDirector | null>(null)
  const [tema, setTema] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  // El director nace y muere con el efecto (no con useMemo): un doble montaje no deja vivo a uno ya destruido.
  // El iframe lleva su número: cada director tiene SU escenario y recibe SU «listo».
  const [vivo, setVivo] = useState<{ director: Director; n: number } | null>(null)
  useEffect(() => {
    // render: exportar a video. El reloj es virtual y lo avanza el exportador (scripts/pizarron-video.mjs) cuadro a cuadro.
    const reloj = render ? new RelojVirtual() : undefined
    const director = new Director({
      sesionId: id, reloj,
      alEstado: e => setEstado({ ...e }),
      enviarChat,
      anotar: async eventos => { const r = await fetch('/api/pizarron/sesion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, eventos }) }); if (!r.ok) throw new Error(String(r.status)) },
      pedirVoz: async texto => {
        const r = await fetch('/api/pizarron/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sesion: id, texto }) })
        if (!r.ok) return null
        const j = await r.json() as { url: string; alin: { c: string[]; s: number[]; e: number[] } }
        return { url: j.url, alin: j.alin }
      },
    })
    // Mensajes del escenario: solo de SU iframe.
    const al = (e: MessageEvent) => { if (e.source && e.source === marco.current?.contentWindow && e.data?.pz === 1) director.recibir(e.data) }
    window.addEventListener('message', al)
    setVivo(v => ({ director, n: (v?.n ?? 0) + 1 }))
    if (reloj) (window as unknown as Record<string, unknown>).__pizarronRender = {
      avanzar: async (ms: number) => { await reloj.avanzar(ms); await director.pintarCuadro(reloj.ahora()) },
      listo: () => director.listoEscenario && director.e.fase === 'reproduciendo',
      terminado: () => director.e.fase === 'fin-reproduccion',
      pistas: () => director.pistas,
    }
    return () => { window.removeEventListener('message', al); director.destruir() }
  }, [id, render])
  const director = vivo?.director ?? null

  // Sondeo de la sesión: la primera lectura reconstruye; las siguientes traen los pasos que Levy va escribiendo.
  useEffect(() => {
    if (!director) return
    let activo = true, huella = '', primera = true
    let t: ReturnType<typeof setTimeout>
    const leer = async () => {
      try {
        const r = await fetch(`/api/pizarron/sesion?id=${encodeURIComponent(id)}${huella ? `&huella=${encodeURIComponent(huella)}` : ''}`, { cache: 'no-store' })
        const j = await r.json() as (EstadoSesion & { huella: string }) | { sinCambios: true; huella: string } | { error: string }
        if (!activo) return
        if ('error' in j) setError(j.error)
        else if (!('sinCambios' in j)) {
          huella = j.huella; setError(null); setTema(j.sesion.tema)
          if (primera) { primera = false; if (render) { director.fijarSesion(j); void director.reproducir() } else director.cargar(j) }
          else if (!render) director.actualizar(j)
        }
      } catch { /* sin red: el siguiente sondeo reintenta */ }
      if (activo) t = setTimeout(leer, document.hidden ? SONDEO_MS * 4 : SONDEO_MS)
    }
    void leer()
    return () => { activo = false; clearTimeout(t) }
  }, [id, director, render])

  const conectar = useCallback((el: HTMLIFrameElement | null) => { marco.current = el; director?.conectar(el?.contentWindow ?? null) }, [director])

  const e = estado
  const rotulo = !e ? 'Abriendo…' : {
    cargando: 'Abriendo…', hablando: 'Levy explica', 'esperando-gesto': 'Tu turno', prediciendo: 'Predice antes de ver', 'esperando-levy': 'Levy prepara el siguiente paso',
    pausado: 'En pausa', cerrada: 'Sesión cerrada · lo entendido quedó escrito', reproduciendo: 'Reproducción', 'fin-reproduccion': 'Fin de la reproducción',
  }[e.fase]
  return <div className={s.sesion} data-grande={grande || undefined} data-render={render || undefined}>
    <header className={s.cabecera}>
      <div className={s.tema}><b>{tema || 'Pizarrón'}</b><span data-fase={e?.fase}>{rotulo}{e && e.pasos ? ` · ${Math.min(e.hechos, e.pasos)}/${e.pasos}` : ''}</span></div>
      <div className={s.herramientas}>
        <button onClick={() => director?.lapiz()} aria-pressed={e?.lapiz} title="Lápiz: dibuja encima (Levy lo ve)"><Pencil size={14} aria-hidden /></button>
        <button onClick={() => director?.verTodo()} title="Ver todo el pizarrón"><Maximize size={14} aria-hidden /></button>
        <button onClick={() => director?.subtitulos()} title={e?.subtitulos ? 'Quitar subtítulos' : 'Poner subtítulos'}>{e?.subtitulos === false ? <CaptionsOff size={14} aria-hidden /> : <Captions size={14} aria-hidden />}</button>
        <button onClick={() => director?.silencio()} title={e?.silencio ? 'Con voz' : 'Sin voz'}>{e?.silencio ? <VolumeX size={14} aria-hidden /> : <Volume2 size={14} aria-hidden />}</button>
        <button className={s.vel} onClick={() => director?.velocidad()} title="Velocidad de la voz">{(e?.velocidad ?? 1).toString().replace('.', ',')}×</button>
        {e?.fase === 'reproduciendo' || e?.fase === 'fin-reproduccion'
          ? <button onClick={() => director?.volverAlVivo()} title="Volver a la sesión"><Eye size={14} aria-hidden /></button>
          : <button onClick={() => void director?.reproducir()} title="Ver de nuevo desde el principio"><RotateCcw size={14} aria-hidden /></button>}
      </div>
    </header>
    <div className={s.escenario}>
      {vivo && <iframe key={vivo.n} ref={conectar} src="/pizarron/escenario.html" sandbox="allow-scripts" title={`Pizarrón: ${tema}`} />}
      {error && <p className={s.error}>{error}</p>}
      <div className={s.mando}>
        <button className={s.play} onClick={() => director?.alternarPausa()} aria-label={e?.fase === 'pausado' ? 'Seguir' : 'Pausa'}>
          {e?.fase === 'pausado' || e?.aviso?.startsWith('Toca') ? <Play size={16} aria-hidden /> : e?.fase === 'cargando' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Pause size={16} aria-hidden />}
        </button>
        {(e?.fase === 'esperando-gesto' || e?.fase === 'prediciendo') && <button className={s.sigue} onClick={() => director?.seguir()}><SkipForward size={13} aria-hidden />{e.fase === 'prediciendo' ? 'Sin predecir' : 'Sigue'}</button>}
        {e && !['reproduciendo', 'fin-reproduccion', 'cerrada'].includes(e.fase) && <span className={s.reacciones}>
          <button onClick={() => director?.decir('No me quedó claro esto. Explícamelo de otra forma.')}>No me quedó</button>
          <button onClick={() => director?.decir('Esto ya lo sé. Llévame un paso más lejos.')}>Ya lo sé, más lejos</button>
        </span>}
      </div>
      {e?.aviso && <p className={s.aviso}>{e.aviso}</p>}
    </div>
  </div>
}

function Casa() {
  const [datos, setDatos] = useState<{ sesiones: ResumenSesion[]; biblioteca: Ficha[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fijar = usePanelFijadas(st => st.fijar)
  useEffect(() => {
    let vivo = true
    const leer = () => fetch('/api/pizarron', { cache: 'no-store' }).then(r => r.json()).then(j => { if (vivo) { if (j.error) setError(j.error); else setDatos(j) } }).catch(() => { if (vivo) setError('No pude leer el pizarrón.') })
    void leer(); const t = setInterval(leer, 15_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  const abrir = (x: ResumenSesion) => mostrarPanel(fijar(`pizarron-${x.id}`, { vista: 'pizarron', paginaId: x.id, titulo: x.tema }))
  if (!datos) return <div className={s.casa}><p className={s.vacio}>{error ?? 'Abriendo el pizarrón…'}</p></div>
  return <div className={s.casa}>
    <section>
      <h3 className={s.h}>Sesiones</h3>
      {!datos.sesiones.length && <p className={s.vacio}>Todavía no hay sesiones. Pídele a Levy «enséñame…» y el pizarrón se abre solo.</p>}
      <ul className={s.lista}>
        {datos.sesiones.map(x => <li key={x.id}><button onClick={() => abrir(x)}>
          <b>{x.tema}</b>
          <span>{new Date(x.actualizada).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {x.pasos} paso{x.pasos === 1 ? '' : 's'}{x.cerrada ? ' · entendido y escrito' : ''}</span>
        </button></li>)}
      </ul>
    </section>
    <section>
      <h3 className={s.h}>Biblioteca de objetos vivos <small>{datos.biblioteca.length}</small></h3>
      <p className={s.nota}>Cada objeto que Levy fabrica se queda aquí y se reusa al instante en la siguiente sesión, de cualquier tema.</p>
      <ul className={s.biblioteca}>
        {datos.biblioteca.map(f => <li key={f.id}><b>{f.nombre}</b><span>{f.ensena}</span>{f.usos ? <small>{f.usos} uso{f.usos === 1 ? '' : 's'}</small> : null}</li>)}
      </ul>
    </section>
  </div>
}
