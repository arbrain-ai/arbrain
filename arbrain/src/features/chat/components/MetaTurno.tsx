'use client'
/**
 * La meta (`/goal`) en el chat (27 oct 2026, Goal UX). Principio: la respuesta que Levy escribió para Daniel nunca
 * queda escondida por las revisiones de la meta.
 *   · VueltasMeta: bajo la respuesta, un renglón discreto y plegado («Meta: 6 revisiones · sin cumplir · espera a
 *     Daniel ›»); al abrirlo, cada revisión con el motivo del evaluador y lo que Levy dijo en esa vuelta.
 *   · ChipMeta: encima del compositor, la meta activa con su estado y Pausar/Reanudar y Quitar, sin teclear comandos.
 * Todo con data-tts-exclude: voz, lector y copiar leen solo la respuesta.
 */
import { useId, useState } from 'react'
import { ChevronRight, Target, Pause, Play, X } from 'lucide-react'
import { condicionCorta, estadoEnPalabras, resumenMeta, type MetaTurno, type MetaVigente } from '../lib/meta'
import s from './meta.module.css'

export function VueltasMeta({ meta, streaming = false }: { meta: MetaTurno | null | undefined; streaming?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  if (!meta || meta.revisiones === 0) return null
  return (
    <div className={s.vueltas} data-meta-vueltas data-tts-exclude>
      <button type="button" className={s.abrir} aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(a => !a)}>
        <Target aria-hidden className={s.icono} />
        <span className={s.abrirTexto}>{resumenMeta(meta, streaming)}</span>
        <ChevronRight aria-hidden className={s.flecha} />
      </button>
      {abierto && <div id={id} role="region" aria-label="Revisiones de la meta" className={s.cuerpo}>
        <p className={s.condicion}>Condición: {condicionCorta(meta.condicion, 400)}</p>
        {meta.vueltas.map((v, i) => (
          <div key={i} className={s.vuelta}>
            <p className={s.motivo}>Revisión {i + 1}: {condicionCorta(v.motivo, 280)}</p>
            {v.texto.trim() && <p className={s.texto}>{v.texto.trim()}</p>}
          </div>
        ))}
        {meta.frenada === 'repeticion' && <p className={s.nota}>Arbrain frenó la meta: el mismo veredicto se repitió sin acción nueva. Vuelve a revisarse cuando escribas.</p>}
        {meta.frenada === 'pausa' && <p className={s.nota}>La meta está en pausa: no se revisa hasta que la reanudes.</p>}
      </div>}
    </div>
  )
}

export function ChipMeta({ meta, ocupado = false, onPausar, onReanudar, onQuitar }: {
  meta: MetaVigente | null
  ocupado?: boolean
  onPausar: () => void
  onReanudar: () => void
  onQuitar: () => void
}) {
  if (!meta) return null
  const pausada = meta.estado === 'pausada'
  const cerrada = meta.estado === 'cumplida'
  return (
    <div className={s.chip} data-chip-meta={meta.estado} role="group" aria-label="Meta activa de la conversación">
      <Target aria-hidden className={s.icono} />
      <span className={s.chipMeta}>Meta</span>
      <span className={s.chipCondicion} title={meta.condicion}>{condicionCorta(meta.condicion)}</span>
      <span className={s.estado} data-estado={meta.estado}><span className={s.punto} aria-hidden />{estadoEnPalabras(meta.estado)}</span>
      <span className={s.acciones}>
        {!cerrada && (pausada
          ? <button type="button" className={s.boton} onClick={onReanudar} disabled={ocupado}><Play size={12} aria-hidden />Reanudar</button>
          : <button type="button" className={s.boton} onClick={onPausar} disabled={ocupado}><Pause size={12} aria-hidden />Pausar</button>)}
        <button type="button" className={s.boton} onClick={onQuitar} disabled={ocupado} aria-label="Quitar la meta"><X size={12} aria-hidden />Quitar</button>
      </span>
    </div>
  )
}
