'use client'
/**
 * Taller › Agentes › En cola por memoria (5 nov 2026, uno a uno con un fundador de MacBook de 8 GB que armó su propia
 * cola: «mínimo 1.8 GB libres para lanzar un agente; si no, entra en cola», con un panel que reordena arrastrando).
 * Arbrain lo trae de fábrica (server/src/cliente/cola-memoria.ts): lo que no cabe espera aquí y sale solo, en orden,
 * cuando la computadora tiene aire.
 *
 * Solo aparece cuando algo espera (o salió de la cola hace poco). Cada encargo dice qué es, cuánto lleva y su lugar;
 * se reordena arrastrando la manija (o ↑/↓ con el foco en ella), «Subir» lo adelanta un lugar y «Lanzar ya» lo saca
 * aunque falte aire. Para hacer aire de verdad, Taller › Computadora cierra apps.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, GripVertical, MemoryStick, Repeat, Rocket } from 'lucide-react'
import { escalon, mov } from '@/shared/movimiento'
import { releer, useFuente } from '../datos'
import { arrastrarFila } from './arrastre-lista'
import { aireHaciaUmbral, demoCola, enGb, fraseCola, fraseReciente, hayQueMostrar, metaEncargo, URL_COLA_MEMORIA, type VistaCola } from './cola-memoria-modelo'
import c from './cola-memoria.module.css'
import w from './taller.module.css'

function useDemoCola(): VistaCola | null {
  const [demo, setDemo] = useState<VistaCola | null>(null)
  useEffect(() => { if (new URLSearchParams(window.location.search).get('demo-cola') === '1') setDemo(demoCola()) }, [])
  return demo
}

export function ColaMemoriaTaller() {
  const demo = useDemoCola()
  const { data: real } = useFuente<VistaCola>(demo ? null : URL_COLA_MEMORIA, 5000)
  const [local, setLocal] = useState<VistaCola | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => { const i = setInterval(() => setAhora(Date.now()), 15_000); return () => clearInterval(i) }, [])
  useEffect(() => { setLocal(null) }, [real])
  const v = local ?? demo ?? real
  if (!hayQueMostrar(v)) return null
  const vista = v!
  const esperan = vista.esperando

  const pedir = async (cuerpo: Record<string, unknown>) => {
    setError(null)
    if (demo) { setLocal(simular(vista, cuerpo)); return }
    try {
      const r = await fetch(URL_COLA_MEMORIA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(12_000) })
      const b = await r.json().catch(() => null) as VistaCola & { error?: string } | null
      if (!r.ok || !b) throw new Error(b?.error ?? 'No pude hablar con tu Arbrain.')
      setLocal(b)
      void releer(URL_COLA_MEMORIA)
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude hablar con tu Arbrain.') }
  }
  // Las admitidas van primero en la lista y no se mueven: la posición de arrastre cuenta solo las que esperan.
  const admitidas = esperan.filter(e => e.estado === 'admitido').length
  const mover = (id: string, posicion: number) => void pedir({ accion: 'mover', id, posicion })

  return <section className={`${c.cola} ${mov.entra}`} style={escalon(0)} aria-labelledby="cola-memoria-titulo">
    <div className={c.cabeza}>
      <span className={c.icono}><MemoryStick size={16} aria-hidden /></span>
      <div className={c.cabezaTexto}>
        <h3 id="cola-memoria-titulo" className={w.ceja}>En cola por memoria</h3>
        <p className={c.frase}>{fraseCola(vista)}</p>
      </div>
    </div>
    {vista.libreBytes != null && vista.umbralBytes != null && <div className={c.aire} role="meter" aria-label="Memoria libre hacia la que hace falta para lanzar" aria-valuemin={0} aria-valuemax={vista.umbralBytes} aria-valuenow={vista.libreBytes}>
      <span className={c.aireBarra}><i style={{ width: `${Math.round(aireHaciaUmbral(vista) * 100)}%` }} /></span>
      <small>{enGb(vista.libreBytes)} de {enGb(vista.umbralBytes)}</small>
    </div>}
    {esperan.length > 0 && <ol ref={lista} className={c.lista}>
      {esperan.map((e, i) => {
        const espera = e.estado === 'esperando'
        const k = i - admitidas
        const Icono = e.tipo === 'rutina' ? Repeat : Bot
        return <li key={e.id} className={c.fila} data-estado={e.estado} data-cola-fila={espera || undefined}>
          {espera
            ? <button type="button" className={c.manija} aria-label={`Mover «${e.titulo}» (lugar ${e.posicion}); flechas arriba y abajo`}
                onPointerDown={ev => { if (lista.current) arrastrarFila(ev, { lista: lista.current, selector: ':scope > [data-cola-fila]', desde: k, alSoltar: d => mover(e.id, d) }) }}
                onKeyDown={ev => { if (ev.key === 'ArrowUp' && k > 0) { ev.preventDefault(); mover(e.id, k - 1) } if (ev.key === 'ArrowDown' && k < esperan.length - admitidas - 1) { ev.preventDefault(); mover(e.id, k + 1) } }}>
                <GripVertical size={14} aria-hidden />
              </button>
            : <span className={c.manija} aria-hidden />}
          <span className={c.lugar} aria-label={espera ? `lugar ${e.posicion}` : 'saliendo'}>{espera ? e.posicion : '·'}</span>
          <span className={c.tipo}><Icono size={14} aria-hidden /></span>
          <span className={c.texto}>
            <span className={c.titulo}>{e.titulo}</span>
            <span className={c.meta}>{metaEncargo(e, ahora)}</span>
          </span>
          {espera && <span className={c.acciones}>
            <button type="button" className={c.accion} disabled={k === 0} onClick={() => mover(e.id, k - 1)} title="Adelantarlo un lugar"><ArrowUp size={13} aria-hidden />Subir</button>
            <button type="button" className={`${c.accion} ${c.ya}`} disabled={e.forzar} onClick={() => void pedir({ accion: 'forzar', id: e.id })} title="Lanzarlo aunque falte memoria (la computadora puede ir lenta un rato)"><Rocket size={13} aria-hidden />Lanzar ya</button>
          </span>}
        </li>
      })}
    </ol>}
    {error && <p className={c.error} role="alert">{error}</p>}
    {vista.recientes.length > 0 && <ul className={c.recientes}>
      {vista.recientes.map(r => <li key={r.id}><b>{r.titulo}</b> · {fraseReciente(r, ahora)}</li>)}
    </ul>}
    <p className={c.pie}>Arrastra para cambiar el orden. Para hacer aire, cierra apps en Taller › Computadora; las conversaciones quietas sueltan su memoria solas.</p>
  </section>
}

/** Demo: reordenar y «Lanzar ya» se ven en la captura sin daemon. */
function simular(v: VistaCola, cuerpo: Record<string, unknown>): VistaCola {
  const esperan = v.esperando.filter(e => e.estado === 'esperando')
  const i = esperan.findIndex(e => e.id === cuerpo.id)
  if (i < 0) return v
  if (cuerpo.accion === 'forzar') esperan[i] = { ...esperan[i], forzar: true }
  if (cuerpo.accion === 'mover') { const [e] = esperan.splice(i, 1); esperan.splice(Math.max(Number(cuerpo.posicion), 0), 0, e) }
  return { ...v, esperando: [...v.esperando.filter(e => e.estado !== 'esperando'), ...esperan.map((e, k) => ({ ...e, posicion: k + 1 }))] }
}
