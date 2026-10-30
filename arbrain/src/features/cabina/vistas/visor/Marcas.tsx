'use client'
/**
 * Marcas de tiempo (8 oct 2026): el oficio de Frame.io, comentar un INSTANTE. Daniel pausa, pulsa M («Marcar aquí»), dice qué
 * hacer en esa marca («quita esto», «más rápido aquí») y el instante viaja a Levy como `tiempo` en la línea de tiempo de la
 * versión que miraba (documento/medio.ts → mensajeMarca). Las marcas se recuerdan por documento hasta que se quitan.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Flag, Send, X } from 'lucide-react'
import { formatoTiempo, mensajeMarca, mensajeMarcas, type Marca } from '../../documento/medio'
import { pedirALevy } from '../../documento/enviar'
import v from './visor.module.css'

const llave = (clave: string) => `arbrain-marcas:${clave}`
const leer = (clave: string): Marca[] => { try { const j = JSON.parse(window.localStorage.getItem(llave(clave)) ?? '[]'); return Array.isArray(j) ? j.filter(m => m && typeof m.tiempo === 'number' && typeof m.ruta === 'string') : [] } catch { return [] } }

export function useMarcas(clave: string, tipo: 'Video' | 'Audio' = 'Video') {
  const [marcas, setMarcas] = useState<Marca[]>([])
  useEffect(() => { setMarcas(leer(clave)) }, [clave])
  const guardar = useCallback((f: (m: Marca[]) => Marca[]) => setMarcas(prev => {
    const sig = f(prev)
    try { window.localStorage.setItem(llave(clave), JSON.stringify(sig)) } catch { /* modo privado */ }
    return sig
  }), [clave])
  const agregar = useCallback((m: Omit<Marca, 'id'>): Marca => { const nueva = { ...m, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }; guardar(p => [...p, nueva]); return nueva }, [guardar])
  const quitar = useCallback((id: string) => guardar(p => p.filter(m => m.id !== id)), [guardar])
  const editar = useCallback((id: string, nota: string) => guardar(p => p.map(m => m.id === id ? { ...m, nota, enviada: false } : m)), [guardar])
  const enviar = useCallback((ms: Marca[]) => {
    if (!ms.length) return
    pedirALevy(ms.length === 1 ? mensajeMarca(ms[0], tipo) : mensajeMarcas(ms, tipo))
    const ids = new Set(ms.map(m => m.id))
    guardar(p => p.map(m => ids.has(m.id) ? { ...m, enviada: true } : m))
  }, [guardar, tipo])
  return { marcas, agregar, quitar, editar, enviar }
}

const ATAJOS = ['quita esto', 'más rápido aquí', 'recorta aquí', 'subtítulo aquí', 'acércate aquí']

/** El cuadro que aparece al marcar: el instante, una línea para decir qué hacer y atajos de lo más pedido. */
export function ComposerMarca({ tiempo, fps, version, alEnviar, alGuardar, alCerrar }: {
  tiempo: number; fps: number; version: string; alEnviar: (nota: string) => void; alGuardar: (nota: string) => void; alCerrar: () => void
}) {
  const [nota, setNota] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => { campo.current?.focus() }, [])
  return <form className={v.composer} onSubmit={e => { e.preventDefault(); alEnviar(nota) }}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); alCerrar() } }}>
    <div className={v.composerCabeza}>
      <Flag size={13} aria-hidden /><b>{formatoTiempo(tiempo, { fps, fotogramas: true })}</b><span>en {version}</span>
      <button type="button" className={v.mini} aria-label="Cerrar" onClick={alCerrar}><X size={13} aria-hidden /></button>
    </div>
    <div className={v.atajos}>{ATAJOS.map(a => <button key={a} type="button" onClick={() => { setNota(a); campo.current?.focus() }}>{a}</button>)}</div>
    <div className={v.composerFila}>
      <input ref={campo} value={nota} onChange={e => setNota(e.target.value)} placeholder="¿Qué hacemos aquí? (Enter envía a Levy)" aria-label="Qué hacer en este instante" />
      <button type="submit" className={v.enviar}><Send size={13} aria-hidden />Enviar a Levy</button>
      <button type="button" className={v.secundario} onClick={() => alGuardar(nota)}>Solo marcar</button>
    </div>
  </form>
}

/** Las marcas hechas: clic salta al instante; las pendientes se mandan juntas. */
export function ListaMarcas({ marcas, fps, versionActual, alSaltar, alQuitar, alEnviar }: {
  marcas: Marca[]; fps: number; versionActual: string; alSaltar: (m: Marca) => void; alQuitar: (id: string) => void; alEnviar: (ms: Marca[]) => void
}) {
  if (!marcas.length) return null
  const pendientes = marcas.filter(m => !m.enviada)
  const orden = [...marcas].sort((a, b) => a.version.localeCompare(b.version, 'es', { numeric: true }) || a.tiempo - b.tiempo)
  return <section className={v.marcas} aria-label="Marcas">
    <header>
      <b>{marcas.length === 1 ? '1 marca' : `${marcas.length} marcas`}</b>
      {pendientes.length > 1 && <button type="button" className={v.enviar} onClick={() => alEnviar(pendientes)}><Send size={12} aria-hidden />Enviar las {pendientes.length} a Levy</button>}
    </header>
    <ul>
      {orden.map(m => <li key={m.id} data-enviada={m.enviada || undefined} data-otra={m.version !== versionActual || undefined}>
        <button type="button" className={v.salto} onClick={() => alSaltar(m)} title="Ir a este instante">
          <code>{formatoTiempo(m.tiempo, { fps, fotogramas: true })}</code><span className={v.versionMarca}>{m.version}</span><span className={v.nota}>{m.nota || 'sin nota'}</span>
        </button>
        {m.enviada ? <span className={v.listo}><Check size={12} aria-hidden />enviada</span> : <button type="button" className={v.mini} aria-label="Enviar a Levy" title="Enviar a Levy" onClick={() => alEnviar([m])}><Send size={12} aria-hidden /></button>}
        <button type="button" className={v.mini} aria-label="Quitar marca" title="Quitar" onClick={() => alQuitar(m.id)}><X size={12} aria-hidden /></button>
      </li>)}
    </ul>
  </section>
}
