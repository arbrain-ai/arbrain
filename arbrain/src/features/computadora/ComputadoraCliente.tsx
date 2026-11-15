'use client'
/**
 * Taller › Computadora en la edición cliente (T16, 29 oct 2026; inventario de la cohorte). Un alumno con 8 GB: «se me estaba
 * trabando mucho Arbrain»; otro pidió ver la memoria y forzar salida; la Mac Mini de un tercero se durmió. En palabras
 * simples: cuánta memoria queda (con semáforo), disco libre, qué tan ocupado va el procesador, si se duerme sola y las 8
 * apps que más memoria usan, con «Cerrar» (amable, con confirmación) y, si no cierra, «Forzar» (segunda confirmación).
 * Lee `/api/computadora` (su daemon). La instalación original sigue con su Máquina (Taller.tsx › MaquinaTaller).
 */
import { useState } from 'react'
import { Cpu, HardDrive, Lightbulb, MemoryStick, Moon, X } from 'lucide-react'
import { releer, useFuente } from '@/features/cabina/datos'
import {
  FRASE_SEMAFORO, fraseDisco, fraseMemoria, fraseProcesador, fraseSueno, tamanoMb,
  type AppComputadora, type FotoComputadora, type RespuestaCierre, type Semaforo,
} from '@/lib/computadora-cliente'
import { tr } from '@/shared/i18n'
import c from './computadora-cliente.module.css'

const URL_COMPUTADORA = '/api/computadora'

async function cerrar(id: string, forzar: boolean): Promise<RespuestaCierre> {
  try {
    const r = await fetch(`${URL_COMPUTADORA}/cerrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, forzar }), cache: 'no-store' })
    const j = await r.json().catch(() => ({})) as RespuestaCierre
    return r.ok ? j : { error: j.error ? tr(j.error) : tr('No se pudo. Intenta de nuevo.') }
  } catch { return { error: tr('Tu Arbrain local no responde. Intenta en unos segundos.') } }
}

export function ComputadoraCliente() {
  const { data, error } = useFuente<FotoComputadora>(URL_COMPUTADORA, 10_000)
  if (!data) return <div className={c.vista} aria-busy="true"><p className={c.nota}>{error ?? tr('Revisando tu computadora…')}</p></div>
  const m = data.memoria
  const cpu = fraseProcesador(data.procesador)
  const sueno = fraseSueno(data)
  const pct = m && m.total > 0 ? Math.min(100, Math.round((m.usada / m.total) * 100)) : 0
  return <div className={c.vista}>
    <p className={c.ceja}>{tr('Cómo va tu computadora')}</p>
    <section className={c.tarjeta} data-tono={m?.semaforo ?? 'verde'} aria-label={tr('Memoria')}>
      <div className={c.fila}><MemoryStick size={15} aria-hidden /><b>{tr('Memoria')}</b><span className={c.estado}>{m ? tr(FRASE_SEMAFORO[m.semaforo]) : tr('Sin dato')}</span></div>
      <div className={c.barra} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tr('Memoria usada')}><span style={{ width: `${pct}%` }} /></div>
      <p className={c.detalle}>{tr(fraseMemoria(m))}</p>
    </section>
    <div className={c.rejilla}>
      <Dato icono={<HardDrive size={15} aria-hidden />} titulo={tr('Disco')} texto={tr(fraseDisco(data.discoLibre))} tono={data.discoLibre !== null && data.discoLibre < 10 * 1024 ** 3 ? 'rojo' : 'verde'} />
      <Dato icono={<Cpu size={15} aria-hidden />} titulo={tr('Procesador')} texto={tr(cpu.texto)} tono={cpu.tono} />
    </div>
    <Dato icono={<Moon size={15} aria-hidden />} titulo={tr('Reposo')} texto={tr(sueno.texto)} tono={sueno.tono} />
    {data.consejos.length > 0 && <section className={c.consejos} aria-label={tr('Consejos')}>
      <div className={c.fila}><Lightbulb size={15} aria-hidden /><b>{tr('Qué puedes hacer')}</b></div>
      <ul>{data.consejos.map(t => <li key={t}>{tr(t)}</li>)}</ul>
    </section>}
    <p className={c.ceja}>{tr('Lo que más memoria usa')}</p>
    {data.apps.length === 0
      ? <p className={c.nota}>{tr('No pude leer las apps abiertas.')}</p>
      : <ul className={c.lista}>{data.apps.map(a => <FilaApp key={a.id} a={a} />)}</ul>}
    <p className={c.nota}>{tr('Cerrar una app es como cerrarla tú: te pide guardar si hace falta. Arbrain y lo del sistema no se pueden cerrar desde aquí.')}</p>
  </div>
}

function Dato({ icono, titulo, texto, tono }: { icono: React.ReactNode; titulo: string; texto: string; tono: Semaforo }) {
  return <section className={c.tarjeta} data-tono={tono} aria-label={titulo}>
    <div className={c.fila}>{icono}<b>{titulo}</b></div>
    <p className={c.detalle}>{texto}</p>
  </section>
}

type Paso = 'quieto' | 'confirmar' | 'cerrando' | 'no-cerro' | 'confirmar-forzar' | 'forzando'

function FilaApp({ a }: { a: AppComputadora }) {
  const [paso, setPaso] = useState<Paso>('quieto')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const correr = async (forzar: boolean) => {
    setPaso(forzar ? 'forzando' : 'cerrando'); setError(null); setMensaje(null)
    const r = await cerrar(a.id, forzar)
    if (r.error) { setError(r.error); setPaso('quieto'); return }
    setMensaje(r.mensaje ?? null)
    setPaso(!r.cerrada && r.puedeForzar ? 'no-cerro' : 'quieto')
    void releer(URL_COMPUTADORA)
  }
  const ocupado = paso === 'cerrando' || paso === 'forzando'
  return <li className={c.app}>
    <div className={c.fila}>
      <strong className={c.nombre} title={a.nombre}>{a.nombre}</strong>
      <span className={c.mem}>{tamanoMb(a.memoriaMb)}</span>
      {a.cerrable && paso === 'quieto' && <button type="button" className={c.boton} onClick={() => setPaso('confirmar')}><X size={13} aria-hidden />{tr('Cerrar')}</button>}
    </div>
    {!a.cerrable && a.motivo && <p className={c.motivo}>{tr(a.motivo)}</p>}
    {a.procesos > 1 && a.cerrable && <p className={c.motivo}>{tr('{n} procesos juntos (la app y sus ayudantes)', { n: a.procesos })}</p>}
    {paso === 'confirmar' && <div className={c.botones} role="group" aria-label={tr('Confirmar cerrar {app}', { app: a.nombre })}>
      <span className={c.pregunta}>{tr('¿Cerrar {app}? Si tienes algo sin guardar, te lo pedirá.', { app: a.nombre })}</span>
      <button type="button" className={c.primario} onClick={() => correr(false)}>{tr('Sí, cerrar')}</button>
      <button type="button" className={c.boton} onClick={() => setPaso('quieto')}>{tr('Cancelar')}</button>
    </div>}
    {ocupado && <p className={c.motivo} role="status">{paso === 'forzando' ? tr('Forzando la salida…') : tr('Cerrando {app}…', { app: a.nombre })}</p>}
    {mensaje && <p className={c.motivo} role="status">{tr(mensaje)}</p>}
    {paso === 'no-cerro' && <div className={c.botones}>
      <button type="button" className={c.boton} onClick={() => setPaso('confirmar-forzar')}>{tr('Forzar salida')}</button>
      <button type="button" className={c.boton} onClick={() => { setPaso('quieto'); setMensaje(null) }}>{tr('Dejarla abierta')}</button>
    </div>}
    {paso === 'confirmar-forzar' && <div className={c.botones} role="group" aria-label={tr('Confirmar forzar {app}', { app: a.nombre })}>
      <span className={c.pregunta}>{tr('¿Forzar la salida de {app}? Se pierde lo que no hayas guardado.', { app: a.nombre })}</span>
      <button type="button" className={c.peligro} onClick={() => correr(true)}>{tr('Sí, forzar')}</button>
      <button type="button" className={c.boton} onClick={() => setPaso('no-cerro')}>{tr('Cancelar')}</button>
    </div>}
    {error && <p className={c.error} role="alert">{error}</p>}
  </li>
}
