'use client'
/**
 * Comentar el entregable de un agente y mandarle el lote (29 oct 2026). Dos piezas que usan la vista Documento (párrafos) y
 * Taller › Historia (líneas de un diff):
 *  · Redactor: lo que se va a comentar (archivo, línea, cita) y la caja para escribir. «Agregar» lo guarda, no envía nada.
 *  · Bandeja: los comentarios pendientes por agente, cada grupo con su botón «Mandar N comentarios a «nombre»». Si no se
 *    supo de quién es el archivo, se elige el agente ahí. Un envío = un mensaje al agente, por la misma vía que «Responder».
 */
import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, Send, X } from 'lucide-react'
import { useFuente } from '../datos'
import { urlPanel } from '../panel/datos'
import type { Trabajos } from '../trabajos-modelo'
import { agenteParaRuta, agentesAbiertos, comentarios, mandarComentarios, textoBoton, useComentarios, type AgenteAbierto, type ComentarioPendiente } from './comentarios'
import c from './comentarios.module.css'

export interface Objetivo { ruta: string; linea?: number; cita?: string }
export interface Pista { rama?: string; carpeta?: string }

/** Los agentes abiertos (la misma lectura del Taller, cada 10 s). En `demo`, los del ejemplo. */
export function useAgentesAbiertos(demo?: AgenteAbierto[]): AgenteAbierto[] {
  const { data } = useFuente<Trabajos>(demo ? null : urlPanel(false), 10_000)
  return demo ?? agentesAbiertos(data)
}

const corta = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const donde = (o: { ruta: string; linea?: number }) => `${o.ruta.split('/').slice(-2).join('/')}${o.linea ? `:${o.linea}` : ''}`

export function Redactor({ objetivo, pista, agentes, onCerrar }: { objetivo: Objetivo; pista?: Pista; agentes: AgenteAbierto[]; onCerrar: () => void }) {
  const [texto, setTexto] = useState('')
  const caja = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { caja.current?.focus() }, [objetivo])
  const agregar = () => {
    if (!texto.trim()) return
    comentarios.agregar({ ...objetivo, texto: texto.trim(), agente: agenteParaRuta(objetivo.ruta, agentes, pista ?? {}) })
    setTexto(''); onCerrar()
  }
  return <form className={c.redactor} data-redactor onSubmit={e => { e.preventDefault(); agregar() }}>
    <p className={c.donde}><MessageSquarePlus size={13} aria-hidden /><b>{donde(objetivo)}</b>{objetivo.cita && <q>{corta(objetivo.cita, 140)}</q>}</p>
    <textarea ref={caja} value={texto} onChange={e => setTexto(e.target.value)} rows={3} placeholder="Qué quieres que cambie aquí" aria-label="Tu comentario"
      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); agregar() } if (e.key === 'Escape') { e.preventDefault(); onCerrar() } }} />
    <div className={c.pie}>
      <button type="submit" className={c.fuerte} disabled={!texto.trim()}>Agregar comentario</button>
      <button type="button" className={c.boton} onClick={onCerrar}>Cancelar</button>
      <small>⌘↵ agrega · no se envía hasta que mandes el lote</small>
    </div>
  </form>
}

/** Los pendientes, agrupados por agente. `solo` acota a los de estas rutas (la vista actual); sin él, todos. */
export function Bandeja({ agentes, solo, demo }: { agentes: AgenteAbierto[]; solo?: (c: ComentarioPendiente) => boolean; demo?: boolean }) {
  const todos = useComentarios()
  const lista = solo ? todos.filter(solo) : todos
  const [nota, setNota] = useState<{ texto: string; error?: boolean } | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)
  if (!lista.length && !nota) return null
  const grupos = new Map<number | 'sin', ComentarioPendiente[]>()
  for (const x of lista) { const k = x.agente != null && agentes.some(a => a.id === x.agente) ? x.agente : 'sin'; grupos.set(k, [...(grupos.get(k) ?? []), x]) }
  const mandar = async (agente: number, cs: ComentarioPendiente[]) => {
    if (demo) { setNota({ texto: `Ejemplo: aquí saldrían ${cs.length} comentarios en un solo mensaje.` }); return }
    setOcupado(agente); setNota(null)
    try { setNota({ texto: await mandarComentarios(agente, cs) }) } catch (e) { setNota({ texto: e instanceof Error ? e.message : 'No se pudo.', error: true }) } finally { setOcupado(null) }
  }
  return <section className={c.bandeja} data-bandeja-comentarios aria-label="Comentarios por mandar">
    {[...grupos].map(([k, cs]) => {
      const a = k === 'sin' ? null : agentes.find(x => x.id === k)!
      return <div key={String(k)} className={c.grupo}>
        <ol className={c.lista}>{cs.map((x, i) => <li key={x.id}>
          <span className={c.num}>{i + 1}</span>
          <div><p className={c.donde}><b>{donde(x)}</b>{x.cita && <q>{corta(x.cita, 90)}</q>}</p><p className={c.texto}>{x.texto}</p></div>
          <button type="button" className={c.quitar} onClick={() => comentarios.quitar(x.id)} aria-label={`Quitar el comentario ${i + 1}`} title="Quitar"><X size={13} aria-hidden /></button>
        </li>)}</ol>
        {a ? <button type="button" className={c.mandar} disabled={ocupado != null} onClick={() => void mandar(a.id, cs)}>
          <Send size={13} aria-hidden />{ocupado === a.id ? 'Mandando…' : textoBoton(cs.length, a.nombre)}
        </button>
          : <label className={c.elegir}>¿Para qué agente?
            <select defaultValue="" onChange={e => { const id = Number(e.target.value); if (id) comentarios.asignar(cs.map(x => x.id), id) }}>
              <option value="" disabled>{agentes.length ? 'Elige un agente abierto' : 'No hay agentes abiertos'}</option>
              {agentes.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>}
      </div>
    })}
    {nota && <p className={c.nota} data-error={nota.error || undefined} role="status">{nota.texto}</p>}
  </section>
}
