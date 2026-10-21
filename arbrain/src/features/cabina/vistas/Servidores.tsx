'use client'
/**
 * Servidores (4 oct 2026, Daniel: «está apagado… ¿podemos crear en el panel alguna función para ver ese servidor
 * activo?»). No estaba apagado: respondía solo por http. Esta vista le dice, sin ser técnico, si lo que usan sus
 * miembros abre, si su cerebro corre y si las máquinas aguantan. La mide el agent-server del Studio cada 5 min
 * (aunque nadie mire) y avisa a la campana si algo de los miembros cae 2 revisiones seguidas; aquí solo se lee la
 * última foto. «Sin dato» nunca es verde. Puertos y pids, plegados en «ver detalle».
 */
import { useState } from 'react'
import { ArrowUpRight, ChevronRight, RefreshCw } from 'lucide-react'
import { releer, useFuente } from '../datos'
import { escalon } from '../movimiento'
import s from '../cabina.module.css'
import l from '../luz.module.css'
import v from './servidores.module.css'
import { porMaquina, type Maquina } from './servidores-maquinas'
import { veredicto, type FilaServidor, type FotoServidores, type Grupo, type Semaforo } from './servidores-veredicto'

export type { FilaServidor, FotoServidores, Semaforo }

export const URL_SERVIDORES = '/api/cabina/servidores'

const GRUPOS: { id: Grupo; titulo: string; nota: string }[] = [
  { id: 'miembros', titulo: 'Lo que usan tus miembros', nota: 'comprobado desde afuera, como lo abriría un miembro' },
  { id: 'cerebro', titulo: 'Tu cerebro', nota: 'lo que hace funcionar a Levy y a Arbrain' },
  { id: 'maquinas', titulo: 'Las máquinas', nota: 'vivas, disco y memoria' },
]
const ETIQUETA: Record<Semaforo, string> = { ok: 'Bien', lento: 'Atención', caido: 'Caído', 'sin-dato': 'Sin dato' }
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })
function hace(iso: string, ahora = Date.now()) {
  const m = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`
}

function Fila({ f, i }: { f: FilaServidor; i: number }) {
  const detalle = Object.entries(f.detalle).filter(([, x]) => x != null && x !== '')
  const problema = f.estado !== 'ok'
  return <li className={`${v.fila} ${l.entra}`} style={escalon(i)} data-estado={f.estado}>
    <i className={v.luz} aria-hidden />
    <div className={v.cuerpo}>
      <p className={v.linea}>
        <b>{f.nombre}</b>
        <span className={v.etiqueta}>{ETIQUETA[f.estado]}</span>
        {f.abrir && <a className={v.abrir} href={f.abrir} target="_blank" rel="noreferrer" title={`Abrir ${f.abrir}`}>Abrir<ArrowUpRight size={12} aria-hidden /></a>}
      </p>
      <p className={problema ? v.frase : v.dato}>{problema ? f.frase ?? 'Sin explicación.' : f.dato ?? f.que}</p>
      {problema && f.estado === 'caido' && f.racha > 1 && f.desde && <p className={v.desde}>Caído desde las {hora(f.desde)} · {f.racha} revisiones seguidas</p>}
      <details className={v.detalle}>
        <summary><ChevronRight size={11} aria-hidden />ver detalle</summary>
        <p className={v.que}>{f.que}</p>
        <dl>{detalle.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{String(x)}</dd></div>)}<div><dt>revisado</dt><dd>{hora(f.revisado)}</dd></div></dl>
      </details>
    </div>
  </li>
}

/** `soloMiembros` (Taller, 5 oct 2026): el semáforo de lo que usan tus miembros y nada más; el cerebro y las máquinas
 *  ya se ven abajo con su dueño. */
export function VistaServidores({ grande, soloMiembros }: { grande?: boolean; soloMiembros?: boolean }) {
  // Se relee cada minuto mientras está a la vista: barato, el servidor responde con su foto cacheada.
  const { data, error } = useFuente<FotoServidores>(URL_SERVIDORES, 60_000)
  const [revisando, setRevisando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [elegida, setElegida] = useState<Maquina>('studio')
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Revisando tus servidores…'}</div>
  const miembros = data.filas.filter(f => f.grupo === 'miembros')
  const ver = veredicto(soloMiembros && miembros.length ? miembros : data.filas)
  const ahora = async () => {
    setRevisando(true); setFallo(null)
    try {
      const r = await fetch(`${URL_SERVIDORES}?ahora=1`, { cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `respondió ${r.status}`)
      await releer(URL_SERVIDORES)
    } catch (e) { setFallo(e instanceof Error ? e.message : 'no se pudo revisar') } finally { setRevisando(false) }
  }
  const viejo = Date.now() - Date.parse(data.revisadoEn) > (data.cadenciaMin * 2 + 1) * 60_000
  const maquinas = porMaquina(data.filas)
  const activa = maquinas.find(m => m.id === elegida) ?? maquinas[0]
  let n = 2
  return <div className={v.vista} data-grande={grande || undefined}>
    <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>{soloMiembros ? 'Tus miembros' : 'Servidores'} · <b>¿abre lo que usan{soloMiembros ? '' : ' tus miembros'}?</b></p>
    <div className={`${v.heroe} ${l.entra}`} style={escalon(1)} data-tono={ver.tono} role="status">
      <i className={v.luzGrande} aria-hidden />
      <div>
        <p className={`${l.serif} ${v.titular}`}>{ver.texto}</p>
        <p className={v.cuando}>
          Revisado {hace(data.revisadoEn)} ({hora(data.revisadoEn)}) · se revisa solo cada {data.cadenciaMin} min
          <button className={v.revisar} onClick={ahora} disabled={revisando} aria-busy={revisando}><RefreshCw size={12} aria-hidden className={revisando ? v.gira : undefined} />{revisando ? 'Revisando…' : 'Revisar ahora'}</button>
        </p>
      </div>
    </div>
    {viejo && <p className={l.aviso}>Esta foto tiene {hace(data.revisadoEn).replace('hace ', '')}: el vigía del Studio no ha revisado a tiempo. Lo de abajo puede no ser el estado de ahora.</p>}
    {(error || fallo) && <p className={l.aviso}>{fallo ? `No pude revisar ahora: ${fallo}.` : `${error} Se muestra la última foto.`}</p>}
    {data.alarmas.length > 0 && <p className={v.alarma} role="alert">Avisé a tu campana: {data.alarmas.map(a => `${a.nombre} caído desde las ${hora(a.desde)}`).join(' · ')}</p>}
    {soloMiembros ? <ul className={`${v.lista} ${v.listaMiembros}`}>{miembros.map(f => <Fila key={f.id} f={f} i={n++} />)}</ul> : <>
    <div className={v.pestanas} role="tablist" aria-label="Servidores por máquina">
      {maquinas.map(m => <button key={m.id} role="tab" id={`srv-tab-${m.id}`} aria-selected={m.id === activa?.id} aria-controls="srv-panel" className={v.pestana} data-tono={m.tono} onClick={() => setElegida(m.id)}>
        <i className={v.luzChica} aria-hidden /><span>{m.titulo}</span><small>{m.texto}</small>
      </button>)}
    </div>
    {activa && <div role="tabpanel" id="srv-panel" aria-labelledby={`srv-tab-${activa.id}`}>
      <p className={v.resumenMaquina} data-tono={activa.tono}>{activa.titulo} · {activa.texto} ({activa.bien} de {activa.filas.length} bien){grande ? ` · ${activa.nota}` : ''}</p>
      {GRUPOS.map(g => {
        const filas = activa.filas.filter(f => f.grupo === g.id)
        if (!filas.length) return null
        const bien = filas.filter(f => f.estado === 'ok').length
        return <section key={g.id} aria-label={g.titulo}>
          <div className={l.seccion}><h4>{g.titulo}</h4><small>{`${bien} de ${filas.length} bien`}{grande ? ` · ${g.nota}` : ''}</small></div>
          <ul className={v.lista}>{filas.map(f => <Fila key={f.id} f={f} i={n++} />)}</ul>
        </section>
      })}
    </div>}
    </>}
    {!soloMiembros && <p className={l.fuente}>Lo mide el servidor de Levy en el Studio: sitios por HTTPS desde afuera (código, tiempo y certificado), el mensajero en la base de SaaS Factory y el VPS por SSH en solo lectura. La lista vive en arbrain/server/servidores.json.</p>}
  </div>
}

export function resumenServidores(d: FotoServidores | undefined) {
  if (!d) return null
  const v = veredicto(d.filas)
  return `${v.texto} · revisado ${hace(d.revisadoEn)}`
}
