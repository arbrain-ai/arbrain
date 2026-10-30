'use client'
import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { mov } from '@/shared/movimiento'
import { useOpsLogs } from '@/features/ops/hooks/useOpsLogs'
import { hace } from './datos'
import { esError, filtrar, FILTROS_REGISTRO, lineaEvento, nombreEvento, ORIGEN, type FiltroRegistro } from './registro-eventos'
import r from './registro.module.css'

/**
 * Registro del Taller (5 oct 2026): lo que valía de /ops. Los turnos de los agentes, sus errores y las rutinas, en vivo
 * desde `ops_events` (Supabase realtime). Las sesiones de chat ya viven en el chat (Recientes · Ver todas) y el horario
 * de los crons en Rutinas; aquí queda el rastro fino para quien construye. Tocar un evento muestra sus datos crudos.
 */
export function Registro() {
  const { events, connected, error, reconnect } = useOpsLogs()
  const [filtro, setFiltro] = useState<FiltroRegistro>('turnos')
  const [abierto, setAbierto] = useState<string | null>(null)
  const lista = useMemo(() => filtrar(events, filtro), [events, filtro])
  const errores = useMemo(() => events.filter(esError).length, [events])
  const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return <div className={r.registro}>
    <div className={r.barra}>
      <span className={`${r.vivo}${connected ? ` ${mov.late}` : ''}`} data-vivo={connected || undefined} aria-hidden />
      <span className={r.estado}>{connected ? 'En vivo' : error ? 'Sin conexión en vivo' : 'Conectando…'} · últimos {events.length}</span>
      <button className={r.icono} onClick={reconnect} aria-label="Releer el registro" title="Releer"><RefreshCw size={13} /></button>
    </div>
    <div className={r.filtros} role="tablist" aria-label="Qué mostrar">
      {FILTROS_REGISTRO.map(f => <button key={f.id} role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}>
        {f.etiqueta}{f.id === 'errores' && errores > 0 && <small>{errores}</small>}
      </button>)}
    </div>
    {error && !events.length ? <p className={r.vacio}>No se pudo leer el registro ({error}). <button onClick={reconnect}>Reintentar</button></p>
      : !lista.length ? <p className={r.vacio}>{filtro === 'errores' ? 'Sin errores en lo reciente.' : 'Nada todavía en este filtro.'}</p>
      : <ol className={r.lista}>{lista.map(e => {
        const [nombre, tono] = nombreEvento(e), linea = lineaEvento(e), ver = abierto === e.id
        // Un evento nuevo aparece una vez; los que ya estaban no se vuelven a animar (la clave es estable).
        return <li key={e.id} data-tono={tono} className={mov.aparece}>
          <button className={r.evento} onClick={() => setAbierto(ver ? null : e.id)} aria-expanded={ver}>
            <time title={new Date(e.timestamp).toLocaleString('es-MX')}>{hora(e.timestamp)}</time>
            <i aria-hidden />
            <span className={r.texto}><b>{nombre}</b><small>{ORIGEN[e.source] ?? e.source}</small>{linea && <span>{linea}</span>}</span>
            <span className={r.hace}>{hace(e.timestamp)}</span>
          </button>
          {ver && <pre className={r.crudo}>{JSON.stringify({ sesion: e.sessionId ?? null, ...e.data }, null, 2)}</pre>}
        </li>
      })}</ol>}
  </div>
}
