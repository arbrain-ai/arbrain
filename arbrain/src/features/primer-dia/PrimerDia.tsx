'use client'
/**
 * Taller › Tu primer día (5 nov 2026, encendido en la edición del alumno, ARBRAIN_PRIMER_DIA=0 lo apaga; modelo.ts dice qué es cada paso y cuándo
 * cuenta). Levy guía en el chat; aquí se ve el avance: cinco pasos, cada uno con lo que te va a preguntar, lo que queda
 * escrito y su estado leído del disco. «Empezar con Levy» manda el pedido del paso al chat por el mismo cable que el resto del
 * Taller (`cabina:enviar`); el paso 4 activa el Reporte de la mañana en un clic (la misma ruta que Rutinas).
 *
 * `demo` (laboratorio): pinta lo que se le pasa y no envía nada.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleAlert, Loader2, MessageCircle, Repeat, Sparkles, Zap } from 'lucide-react'
import { escalon, mov } from '@/shared/movimiento'
import { releer, useFuente } from '@/features/cabina/datos'
import { RUTINA_MANANA, URL_PRIMER_DIA, type Avance, type Paso, type RespuestaPrimerDia } from './modelo'
import c from './primer-dia.module.css'
import { esEdicionCliente } from '@/lib/edicion'

const CLIENTE = esEdicionCliente()

const ETIQUETA: Record<Paso['estado'], string> = { hecho: 'Listo', siguiente: 'Sigue', pendiente: 'Pendiente', revisar: 'Por corregir', 'sin-dato': 'Sin dato' }

/** Solo la edición del alumno pregunta (en la instalación original la ruta ni existe). */
export function usePrimerDia() {
  return useFuente<RespuestaPrimerDia>(CLIENTE ? URL_PRIMER_DIA : null, 15_000)
}

async function pedir(cuerpo: Record<string, unknown>): Promise<{ mensaje?: string; error?: string }> {
  try {
    const r = await fetch(URL_PRIMER_DIA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    return r.ok ? j : { error: j.error ?? 'No pude hablar con tu Arbrain.' }
  } catch { return { error: 'No pude hablar con tu Arbrain.' } }
}

export function PrimerDia({ demo, onRutinas }: { demo?: { avance: Avance }; onRutinas?: () => void }) {
  const lectura = usePrimerDia()
  const datos = demo ? { activo: true as const, avance: demo.avance, ofrecer: false, oculto: false } : lectura.data
  if (!datos) return <div className={c.vista} aria-busy="true"><p className={c.nota}>{lectura.error ? 'Tu Arbrain no respondió. Vuelvo a intentar en unos segundos.' : 'Leyendo tu primer día…'}</p></div>
  if (!datos.activo) return null
  return <Vista avance={datos.avance} demo={!!demo} onRutinas={onRutinas} />
}

function Vista({ avance, demo, onRutinas }: { avance: Avance; demo: boolean; onRutinas?: () => void }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const alChat = (texto: string) => {
    if (window.location.pathname.startsWith('/chat')) window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto } }))
    else { try { sessionStorage.setItem('cabina:pendiente', texto) } catch { /* sin almacenamiento */ } router.push('/chat') }
  }
  const empezar = async (p: Paso) => {
    if (demo) { setEnviado(p.id); return }
    setOcupado(p.id); setError(null)
    const r = await pedir({ accion: 'empezar', paso: p.id, errores: p.errores })
    setOcupado(null)
    if (r.error || !r.mensaje) { setError(r.error ?? 'No pude preparar el paso.'); return }
    alChat(r.mensaje); setEnviado(p.id)
    setTimeout(() => setEnviado(v => (v === p.id ? null : v)), 6000)
  }
  const activarManana = async () => {
    if (demo) return
    setOcupado('manana'); setError(null)
    try {
      const r = await fetch(`/api/rutinas/${encodeURIComponent(RUTINA_MANANA)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'reanudar' }), cache: 'no-store' })
      if (!r.ok) setError('No pude activar el Reporte de la mañana. Ábrelo en Rutinas.')
    } catch { setError('No pude activar el Reporte de la mañana. Ábrelo en Rutinas.') }
    setOcupado(null)
    void releer(URL_PRIMER_DIA); void releer('/api/rutinas')
  }
  const ocultar = async () => {
    if (demo) return
    await pedir({ accion: 'ocultar' })
    void releer(URL_PRIMER_DIA)
  }

  return <div className={c.vista}>
    <header className={`${c.cabecera} ${mov.entra}`} style={escalon(0)}>
      <p className={c.ceja}>Tu primer día</p>
      <h2 className={c.titular}>{avance.completo ? 'Tu negocio ya vive en tu cerebro' : `${avance.hechos} de ${avance.total} listos`}</h2>
      <div className={c.barra} role="progressbar" aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.hechos} aria-label="Avance de tu primer día">
        {avance.pasos.map(p => <span key={p.id} data-estado={p.estado} />)}
      </div>
      <p className={c.nota}>{avance.completo
        ? 'Lo que sigue: este mismo recorrido es el que le vas a instalar a tu primer cliente.'
        : 'Levy te guía en el chat; aquí ves el avance. Cada paso deja algo escrito en tu cerebro.'}</p>
    </header>

    {error && <p className={c.aviso} role="alert"><CircleAlert size={14} aria-hidden />{error}</p>}

    <ol className={c.lista}>
      {avance.pasos.map((p, i) => <li key={p.id} className={`${c.paso} ${mov.entra}`} style={escalon(i + 1)} data-estado={p.estado}>
        <div className={c.encabezado}>
          <span className={c.numero} aria-hidden>{p.estado === 'hecho' ? <Check size={13} /> : p.numero}</span>
          <h3 className={c.titulo}>{p.titulo}</h3>
          <span className={c.estado}>{ETIQUETA[p.estado]}</span>
        </div>
        <p className={c.que}>{p.que}</p>
        {p.detalle && <p className={c.detalle}>{p.detalle}</p>}
        {p.errores?.length ? <ul className={c.errores}>{p.errores.slice(0, 3).map(e => <li key={e}>{e}</li>)}</ul> : null}
        {p.estado !== 'hecho' && <p className={c.deja}><Sparkles size={12} aria-hidden />{p.deja}</p>}
        <div className={c.botones}>
          {enviado === p.id
            ? <span className={`${c.listo} ${mov.aparece}`}><Check size={12} aria-hidden />Levy lo recibió en el chat</span>
            : <button type="button" className={p.estado === 'siguiente' || p.estado === 'revisar' ? c.principal : c.boton} disabled={ocupado != null} onClick={() => void empezar(p)}>
              {ocupado === p.id ? <Loader2 size={13} className={c.gira} aria-hidden /> : <MessageCircle size={13} aria-hidden />}
              {p.estado === 'hecho' ? 'Revisar con Levy' : p.estado === 'revisar' ? 'Pedir la corrección' : 'Empezar con Levy'}
            </button>}
          {p.id === 'rutinas' && p.estado !== 'hecho' && <BotonesRutinas demo={demo} ocupado={ocupado === 'manana'} activar={activarManana} onRutinas={onRutinas} />}
        </div>
      </li>)}
    </ol>

    {!demo && <p className={c.pie}><button type="button" className={c.enlace} onClick={() => void ocultar()}>Ocultar del Taller</button></p>}
  </div>
}

function BotonesRutinas({ demo, ocupado, activar, onRutinas }: { demo: boolean; ocupado: boolean; activar: () => void; onRutinas?: () => void }) {
  const rutinas = useFuente<{ tasks?: { id: string; status: string }[] }>(demo ? null : '/api/rutinas')
  const manana = rutinas.data?.tasks?.find(t => t.id === RUTINA_MANANA)
  return <>
    {(demo || (manana && manana.status !== 'active')) && <button type="button" className={c.boton} disabled={ocupado} onClick={activar}>
      {ocupado ? <Loader2 size={13} className={c.gira} aria-hidden /> : <Zap size={13} aria-hidden />}Activar el Reporte de la mañana
    </button>}
    {onRutinas && <button type="button" className={c.boton} onClick={onRutinas}><Repeat size={13} aria-hidden />Ver Rutinas</button>}
  </>
}
