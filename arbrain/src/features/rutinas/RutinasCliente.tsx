'use client'
/**
 * Taller › Rutinas en la edición cliente (T8, 29 oct 2026; inventario de la cohorte: «todavía no tengo rutinas andando… no
 * entendí bien cómo aplicarlo», «¿eso iba a estar en la interfaz?»). Lo que corre solo en SU computadora: qué hace, cuándo
 * en palabras, la próxima vez, la última y cómo le fue. Se pausa, se reanuda, se prueba y se borra (con confirmación), y se
 * crea con un formulario de dos preguntas: qué quieres que haga y cuándo. Lee `/api/rutinas` (su daemon); la instalación
 * original sigue con su vista viva (RutinasViva.tsx).
 */
import { useState } from 'react'
import { Pause, Play, Plus, Sparkles, Trash2, Zap } from 'lucide-react'
import { releer, useFuente } from '@/features/cabina/datos'
import { DIAS_SEMANA, TIPOS_CUANDO, validarFormulario, vistaRutina, type Formulario, type ListaRutinas, type VistaRutina } from '@/lib/rutinas-cliente'
import c from './rutinas-cliente.module.css'

const URL_RUTINAS = '/api/rutinas'

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
  if (!data) return <div className={c.vista} aria-busy="true"><p className={c.nota}>{error ?? 'Leyendo tus rutinas…'}</p></div>
  const ahora = Date.now()
  const lista = (data.tasks ?? []).map(t => vistaRutina(t, ahora, data.tz))
  return <div className={c.vista}>
    <div className={c.cabecera}>
      <p className={c.ceja}>Lo que corre solo</p>
      {!creando && <button type="button" className={c.nueva} onClick={() => setCreando(true)}><Plus size={14} aria-hidden />Nueva rutina</button>}
    </div>
    {data.aviso && <p className={c.aviso} role="status">{data.aviso}</p>}
    {creando && <NuevaRutina alTerminar={() => setCreando(false)} />}
    {lista.length === 0 && !creando && <Vacia onCrear={() => setCreando(true)} />}
    {lista.length > 0 && <ul className={c.lista}>{lista.map(r => <Fila key={r.id} r={r} />)}</ul>}
    {lista.length > 0 && <p className={c.nota}>Tu computadora debe estar encendida para que corran. También puedes pedírselas a Levy en el chat.</p>}
  </div>
}

function Vacia({ onCrear }: { onCrear: () => void }) {
  return <div className={c.vacia}>
    <p><b>Aún no tienes rutinas.</b> Una rutina es algo que Levy hace solo, a la hora que digas: un resumen de tu día cada mañana, revisar tus pendientes cada lunes.</p>
    <p>Créala aquí o pídesela a Levy en el chat, por ejemplo: <q>cada mañana a las 7 resúmeme mi día</q>.</p>
    <p className={c.nota}>Corren en tu computadora: debe estar encendida a esa hora.</p>
    <button type="button" className={c.nueva} onClick={onCrear}><Plus size={14} aria-hidden />Crear mi primera rutina</button>
  </div>
}

function Fila({ r }: { r: VistaRutina }) {
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
  return <li className={c.fila} data-tono={tono}>
    <div className={c.encabezado}>
      <strong className={c.titulo} title={r.texto}>{r.titulo}</strong>
      <span className={c.estado}>{r.activa ? 'Activa' : 'En pausa'}</span>
    </div>
    <p className={c.cuando}>{r.cuando} · {r.activa ? `próxima: ${r.proxima}` : 'no corre hasta que la actives'}</p>
    {r.deLevy && !r.activa && <p className={c.levy}><Sparkles size={12} aria-hidden />La propuso Levy. Revisa qué hace y pulsa «Activar» para que corra.</p>}
    {r.ultima
      ? <p className={c.ultima}>Última: {r.ultima}{r.fallo ? ' · falló' : ''}</p>
      : <p className={c.ultima}>Todavía no ha corrido.</p>}
    {r.resultado && <details className={c.resultado}><summary>{r.fallo ? 'Qué pasó' : 'Lo que hizo'}</summary><p>{r.resultado}</p></details>}
    {probada && <p className={c.ultima}>Corriendo ahora. El resultado aparece aquí al terminar.</p>}
    {error && <p className={c.error} role="alert">{error}</p>}
    {borrar
      ? <div className={c.botones} role="group" aria-label="Confirmar borrado">
          <span className={c.pregunta}>¿Borrar esta rutina? No se puede deshacer.</span>
          <button type="button" className={c.peligro} disabled={ocupado} onClick={() => accion('borrar')}>Sí, borrar</button>
          <button type="button" className={c.boton} disabled={ocupado} onClick={() => setBorrar(false)}>Cancelar</button>
        </div>
      : <div className={c.botones}>
          {r.activa
            ? <button type="button" className={c.boton} disabled={ocupado} onClick={() => accion('pausar')}><Pause size={13} aria-hidden />Pausar</button>
            : <button type="button" className={c.boton} disabled={ocupado} onClick={() => accion('reanudar')}><Play size={13} aria-hidden />{r.deLevy && !r.ultima ? 'Activar' : 'Reanudar'}</button>}
          {r.activa && <button type="button" className={c.boton} disabled={ocupado} onClick={() => accion('probar')} title="La corre una vez ahora, sin cambiar su horario"><Zap size={13} aria-hidden />Probar ahora</button>}
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
