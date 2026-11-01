'use client'
/**
 * Taller › Rutinas en la edición cliente (T8, 29 oct 2026; inventario de la cohorte: «todavía no tengo rutinas andando… no
 * entendí bien cómo aplicarlo», «¿eso iba a estar en la interfaz?»). Lo que corre solo en SU computadora: qué hace, cuándo
 * en palabras, la próxima vez, la última y cómo le fue. Se pausa, se reanuda, se prueba y se borra (con confirmación), y se
 * crea con un formulario de dos preguntas: qué quieres que haga y cuándo. Lee `/api/rutinas` (su daemon); la instalación
 * original sigue con su vista viva (RutinasViva.tsx).
 *
 * «De Arbrain» (1 nov 2026): debajo, las precargadas que trae la app (reporte de la mañana, cierre, semana, mes y otras),
 * en pausa hasta que el dueño pulsa «Activar». Cada una dice para qué le sirve y dónde deja su reporte; un reporte que
 * llegó y no ha visto lleva «Nuevo» (la edición cliente no tiene campana: este es su aviso dentro de la app).
 */
import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, Plus, Sparkles, Trash2, Zap } from 'lucide-react'
import { releer, useFuente } from '@/features/cabina/datos'
import { DIAS_SEMANA, TIPOS_CUANDO, lugarReporte, reporteNuevo, separarRutinas, validarFormulario, type Formulario, type ListaRutinas, type RutinaDaemon, type VistaRutina } from '@/lib/rutinas-cliente'
import c from './rutinas-cliente.module.css'

const URL_RUTINAS = '/api/rutinas'
const CLAVE_VISTOS = 'arbrain.rutinas.vistos'

/** Hasta qué corrida vio el dueño el reporte de cada precargada, en este dispositivo. */
function useVistos(): [Record<string, number>, (id: string, hasta: number) => void] {
  const [vistos, setVistos] = useState<Record<string, number>>({})
  useEffect(() => { try { setVistos(JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? '{}')) } catch { /* sin almacenamiento */ } }, [])
  const marcar = useCallback((id: string, hasta: number) => setVistos(v => {
    const n = { ...v, [id]: hasta }
    try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify(n)) } catch { /* sin almacenamiento */ }
    return n
  }), [])
  return [vistos, marcar]
}

async function pedir(url: string, init: RequestInit): Promise<string | null> {
  try {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' })
    if (r.ok) return null
    const j = await r.json().catch(() => ({})) as { error?: string }
    return j.error ?? 'No se pudo. Intenta de nuevo.'
  } catch { return 'Tu Arbrain local no responde. Intenta en unos segundos.' }
}

export function RutinasCliente() {
  const { data, error } = useFuente<ListaRutinas>(URL_RUTINAS, 30_000)
  const [creando, setCreando] = useState(false)
  const [vistos, marcarVisto] = useVistos()
  if (!data) return <div className={c.vista} aria-busy="true"><p className={c.nota}>{error ?? 'Leyendo tus rutinas…'}</p></div>
  const ahora = Date.now()
  const { propias: lista, deArbrain } = separarRutinas(data, ahora)
  const porId = new Map<string, RutinaDaemon>((data.tasks ?? []).map(t => [t.id, t]))
  const nuevos = deArbrain.filter(r => { const t = porId.get(r.id); return !!t && reporteNuevo(t, vistos) })
  return <div className={c.vista}>
    <div className={c.cabecera}>
      <p className={c.ceja}>Lo que corre solo</p>
      {!creando && <button type="button" className={c.nueva} onClick={() => setCreando(true)}><Plus size={14} aria-hidden />Nueva rutina</button>}
    </div>
    {data.aviso && <p className={c.aviso} role="status">{data.aviso}</p>}
    {creando && <NuevaRutina alTerminar={() => setCreando(false)} />}
    {lista.length === 0 && !creando && <Vacia onCrear={() => setCreando(true)} conArbrain={deArbrain.length > 0} />}
    {lista.length > 0 && <ul className={c.lista}>{lista.map(r => <Fila key={r.id} r={r} />)}</ul>}
    {lista.length > 0 && <p className={c.nota}>Tu computadora debe estar encendida para que corran. También puedes pedírselas a Levy en el chat.</p>}
    {deArbrain.length > 0 && <section className={c.arbrain} aria-labelledby="rutinas-de-arbrain">
      <div className={c.cabecera}>
        <p className={c.ceja} id="rutinas-de-arbrain">De Arbrain</p>
        {nuevos.length > 0 && <span className={c.nuevo} role="status">{nuevos.length === 1 ? '1 reporte nuevo' : `${nuevos.length} reportes nuevos`}</span>}
      </div>
      <p className={c.nota}>Rutinas que Arbrain preparó para ti. Vienen en pausa: actívalas en un clic. Cada una deja su reporte en tu cerebro y te avisa al terminar, en tu computadora y en tu teléfono si lo conectaste.</p>
      {data.suscripcion && <p className={c.aviso} role="note">Con tu suscripción de Claude estas rutinas no corren solas, ni siquiera al probarlas: la suscripción es para tu uso directo. Para que corran, conecta una llave en Ajustes › Llaves.</p>}
      <ul className={c.lista}>{deArbrain.map(r => <Fila key={r.id} r={r} nuevo={nuevos.includes(r)} alVer={() => marcarVisto(r.id, porId.get(r.id)?.last_run ?? 0)} />)}</ul>
    </section>}
  </div>
}

function Vacia({ onCrear, conArbrain }: { onCrear: () => void; conArbrain: boolean }) {
  // Con las «De Arbrain» abajo, el vacío no se explica entero: basta con decir que puede crear la suya.
  if (conArbrain) return <div className={c.vacia}>
    <p><b>Aún no tienes rutinas propias.</b> Abajo están las de Arbrain, listas para activar. También puedes crear la tuya o pedírsela a Levy en el chat.</p>
    <button type="button" className={c.nueva} onClick={onCrear}><Plus size={14} aria-hidden />Crear mi primera rutina</button>
  </div>
  return <div className={c.vacia}>
    <p><b>Aún no tienes rutinas.</b> Una rutina es algo que Levy hace solo, a la hora que digas: un resumen de tu día cada mañana, revisar tus pendientes cada lunes.</p>
    <p>Créala aquí o pídesela a Levy en el chat, por ejemplo: <q>cada mañana a las 7 resúmeme mi día</q>.</p>
    <p className={c.nota}>Corren en tu computadora: debe estar encendida a esa hora.</p>
    <button type="button" className={c.nueva} onClick={onCrear}><Plus size={14} aria-hidden />Crear mi primera rutina</button>
  </div>
}

function Fila({ r, nuevo = false, alVer }: { r: VistaRutina; nuevo?: boolean; alVer?: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrar, setBorrar] = useState(false)
  const [probada, setProbada] = useState(false)
  const accion = async (accion: 'pausar' | 'reanudar' | 'probar' | 'borrar') => {
    setOcupado(true); setError(null)
    const url = `${URL_RUTINAS}/${encodeURIComponent(r.id)}`
    const e = accion === 'borrar' ? await pedir(url, { method: 'DELETE' }) : await pedir(url, { method: 'POST', body: JSON.stringify({ accion }) })
    setOcupado(false); setBorrar(false)
    if (e) { setError(e); return }
    if (accion === 'probar') setProbada(true)
    void releer(URL_RUTINAS)
  }
  const tono = !r.activa ? 'pausada' : r.fallo ? 'error' : r.ultima ? 'ok' : 'nueva'
  // Las precargadas se activan en un clic (botón principal) y se pueden probar sin activarlas.
  const activar = !r.activa && (r.deArbrain || (r.deLevy && !r.ultima))
  return <li className={c.fila} data-tono={tono} data-arbrain={r.deArbrain || undefined}>
    <div className={c.encabezado}>
      <strong className={c.titulo} title={r.texto}>{r.titulo}</strong>
      {nuevo && <span className={c.nuevo}>Nuevo</span>}
      {r.deArbrain && <span className={c.sello}>De Arbrain</span>}
      <span className={c.estado}>{r.activa ? 'Activa' : 'En pausa'}</span>
    </div>
    {r.paraQue && <p className={c.paraQue}>{r.paraQue}</p>}
    <p className={c.cuando}>{r.cuando} · {r.activa ? `próxima: ${r.proxima}` : 'no corre hasta que la actives'}</p>
    {r.deLevy && !r.activa && <p className={c.levy}><Sparkles size={12} aria-hidden />La propuso Levy. Revisa qué hace y pulsa «Activar» para que corra.</p>}
    {r.ultima
      ? <p className={c.ultima}>Última: {r.ultima}{r.fallo ? ' · falló' : ''}</p>
      : <p className={c.ultima}>Todavía no ha corrido.{r.carpeta ? ` Su reporte quedará en ${lugarReporte(r.carpeta)}.` : ''}</p>}
    {r.resultado && <details className={c.resultado} onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open) alVer?.() }}>
      <summary>{r.fallo ? 'Qué pasó' : 'Lo que hizo'}</summary><p>{r.resultado}</p>
      {r.reporte && !r.fallo && <p className={c.ultima} title={r.reporte}>Reporte completo en {lugarReporte(r.reporte)}.</p>}
    </details>}
    {probada && <p className={c.ultima}>Corriendo ahora. El resultado aparece aquí al terminar.</p>}
    {error && <p className={c.error} role="alert">{error}</p>}
    {borrar
      ? <div className={c.botones} role="group" aria-label="Confirmar borrado">
          <span className={c.pregunta}>{r.deArbrain ? '¿Borrar esta rutina? No volverá a aparecer; si solo no la quieres ahora, déjala en pausa.' : '¿Borrar esta rutina? No se puede deshacer.'}</span>
          <button type="button" className={c.peligro} disabled={ocupado} onClick={() => accion('borrar')}>Sí, borrar</button>
          <button type="button" className={c.boton} disabled={ocupado} onClick={() => setBorrar(false)}>Cancelar</button>
        </div>
      : <div className={c.botones}>
          {r.activa
            ? <button type="button" className={c.boton} disabled={ocupado} onClick={() => accion('pausar')}><Pause size={13} aria-hidden />Pausar</button>
            : <button type="button" className={r.deArbrain ? c.nueva : c.boton} disabled={ocupado} onClick={() => accion('reanudar')}><Play size={13} aria-hidden />{activar ? 'Activar' : 'Reanudar'}</button>}
          {(r.activa || r.deArbrain) && <button type="button" className={c.boton} disabled={ocupado} onClick={() => accion('probar')} title={r.activa ? 'La corre una vez ahora, sin cambiar su horario' : 'La corre una vez ahora para que veas su reporte; sigue en pausa'}><Zap size={13} aria-hidden />{r.activa ? 'Probar ahora' : 'Probar una vez'}</button>}
          <button type="button" className={c.boton} disabled={ocupado} onClick={() => setBorrar(true)}><Trash2 size={13} aria-hidden />Borrar</button>
        </div>}
  </li>
}

function NuevaRutina({ alTerminar }: { alTerminar: () => void }) {
  const [f, setF] = useState<Formulario>({ que: '', tipo: 'diario', hora: '07:00', dia: 1, cron: '' })
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const cambiar = (p: Partial<Formulario>) => { setF(v => ({ ...v, ...p })); setError(null) }
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validarFormulario(f)
    if (!v.ok) { setError(v.error); return }
    setOcupado(true)
    const err = await pedir(URL_RUTINAS, { method: 'POST', body: JSON.stringify({ prompt: v.prompt, schedule: v.schedule }) })
    setOcupado(false)
    if (err) { setError(err); return }
    void releer(URL_RUTINAS)
    alTerminar()
  }
  const conHora = f.tipo === 'diario' || f.tipo === 'entre-semana' || f.tipo === 'semanal'
  return <form className={c.formulario} onSubmit={guardar}>
    <label className={c.campo}>
      <span>¿Qué quieres que haga?</span>
      <textarea rows={3} value={f.que} maxLength={2000} placeholder="Resúmeme mi día: lo que tengo en el calendario y mis pendientes." onChange={e => cambiar({ que: e.target.value })} autoFocus />
    </label>
    <label className={c.campo}>
      <span>¿Cuándo?</span>
      <select value={f.tipo} onChange={e => cambiar({ tipo: e.target.value as Formulario['tipo'] })}>
        {TIPOS_CUANDO.map(t => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
      </select>
    </label>
    {f.tipo === 'semanal' && <label className={c.campo}>
      <span>Día</span>
      <select value={f.dia} onChange={e => cambiar({ dia: Number(e.target.value) })}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DIAS_SEMANA[d]}</option>)}
      </select>
    </label>}
    {conHora && <label className={c.campo}>
      <span>Hora</span>
      <input type="time" value={f.hora} onChange={e => cambiar({ hora: e.target.value })} />
    </label>}
    {f.tipo === 'avanzado' && <label className={c.campo}>
      <span>Cron (minuto hora día mes día-de-la-semana)</span>
      <input type="text" value={f.cron} placeholder="30 7 * * 1-5" spellCheck={false} onChange={e => cambiar({ cron: e.target.value })} />
    </label>}
    {error && <p className={c.error} role="alert">{error}</p>}
    <div className={c.botones}>
      <button type="submit" className={c.nueva} disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear rutina'}</button>
      <button type="button" className={c.boton} disabled={ocupado} onClick={alTerminar}>Cancelar</button>
    </div>
  </form>
}
