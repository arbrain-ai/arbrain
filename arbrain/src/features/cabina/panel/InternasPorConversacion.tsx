'use client'
/**
 * Taller → «Dentro de los turnos de Levy», una sección por conversación (1 oct 2026).
 * Daniel: «el tema de los subagentes quizá debería estar separado entre conversaciones».
 * Cada conversación lleva su título (tocarlo la abre en el chat), sus tareas corriendo y su
 * plegable de terminadas; la que tiene abierta va primero como «Esta conversación». Las que
 * solo tienen terminadas se pliegan enteras. La regla de agrupación es pura y compartida con
 * la vista «trabajos» (`../internas-por-conversacion.ts`); la fila la pinta quien llama.
 */
import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { GrupoInternas } from '../internas-por-conversacion'
import { useAbrirConversacion, useTituloConversacion } from '../conversaciones'
import type { TareaInterna, Terminal } from '../trabajos-modelo'
import s from './panel.module.css'
import c from './conversaciones.module.css'

const textoTerminadas = (g: GrupoInternas) => {
  const n = g.terminadas.length + g.agentesTerminados.length
  return `${n} ${n === 1 ? 'terminada' : 'terminadas'}${g.terminadas.length ? ' hoy' : ''}${g.fallaron ? ` · ${g.fallaron} ${g.fallaron === 1 ? 'falló' : 'fallaron'}` : ''}`
}

type FilaAgente = (t: Terminal) => ReactNode
export function InternasPorConversacion({ grupos, fila, filaAgente }: { grupos: GrupoInternas[]; fila: (t: TareaInterna) => ReactNode; filaAgente?: FilaAgente }) {
  return <>{grupos.map(g => <ConversacionInternas key={g.conversacion || 'sin-conversacion'} g={g} fila={fila} filaAgente={filaAgente} />)}</>
}

/** Un grupo por conversación de origen (3 oct 2026): los subagentes que lanzó Levy desde ella, sus comandos
 *  en segundo plano y los subagentes de sus turnos. «Sin conversación» = registro viejo sin origen. */
function ConversacionInternas({ g, fila, filaAgente }: { g: GrupoInternas; fila: (t: TareaInterna) => ReactNode; filaAgente?: FilaAgente }) {
  const tituloVivo = useTituloConversacion(g.conversacion)
  const titulo = g.conversacion ? tituloVivo : 'Sin conversación'
  const abrir = useAbrirConversacion()
  const [desplegada, setDesplegada] = useState(false)
  const agentes = filaAgente ? g.agentes : [], agentesTerminados = filaAgente ? g.agentesTerminados : []
  const vivos = g.corriendo.length + agentes.length
  // Sin nada vivo, todo el grupo se pliega bajo su línea de «N terminadas».
  const plegada = vivos === 0
  return <div className={c.grupo} role="group" aria-label={g.activa ? `Esta conversación: ${titulo}` : titulo}>
    <div className={c.cabecera}>
      {g.activa
        ? <span className={c.actual} title={titulo}>{titulo}</span>
        : g.conversacion
          ? <button className={c.titulo} onClick={() => abrir(g.conversacion)} title={`Abrir «${titulo}» en el chat`}>{titulo}</button>
          : <span className={c.actual}>{titulo}</span>}
      {plegada
        ? <button className={c.alternar} aria-expanded={desplegada} onClick={() => setDesplegada(v => !v)}>{textoTerminadas(g)}<ChevronRight size={12} aria-hidden /></button>
        : <span className={c.cuenta}>{vivos} en curso</span>}
    </div>
    <div className={s.lista}>
      {agentes.map(t => filaAgente!(t))}
      {g.corriendo.map(t => fila(t))}
      {plegada
        ? desplegada && <>{agentesTerminados.map(t => filaAgente!(t))}{g.terminadas.map(t => fila(t))}</>
        : (g.terminadas.length + agentesTerminados.length) > 0 && <details className={s.terminadas}>
          <summary><ChevronRight size={12} className={s.chevron} aria-hidden />{textoTerminadas(g)}</summary>
          {agentesTerminados.map(t => filaAgente!(t))}
          {g.terminadas.map(t => fila(t))}
        </details>}
    </div>
  </div>
}
