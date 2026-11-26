'use client'
/**
 * La barra del filtro único (19 nov 2026): un campo arriba de Inicio y Radar que entiende lo que escribes y lo vuelve
 * fichas que se quitan con ✕. Mientras escribes, abajo salen sugerencias agrupadas y «lo que entendí». Vacío = lo de hoy.
 * El estado vive en el Cuartel (viaja entre vistas) y se guarda en la sesión (sobrevive a recargar).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { analizar, etiqueta, quitar, resumen, sugerir, sumar, ultimaPalabra, type Criterio, type Ficha, type Sugerencia, type Vocabulario } from './filtro'
import s from './cuartel.module.css'

export function BarraFiltro({ fichas, cambiar, previa, voc, criterio }: {
  fichas: Ficha[]; cambiar: (f: Ficha[]) => void; previa: (f: Ficha[]) => void; voc: Vocabulario; criterio: Criterio
}) {
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [foco, setFoco] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  const entendido = useMemo(() => analizar(texto, voc), [texto, voc])
  useEffect(() => { previa(entendido) }, [entendido, previa])
  useEffect(() => () => previa([]), [previa])
  const fragmento = ultimaPalabra(texto)
  const antes = fragmento ? texto.slice(0, texto.length - fragmento.length) : texto
  const sugerencias = useMemo(() => sugerir(fragmento, voc, sumar(fichas, analizar(antes, voc))), [fragmento, antes, voc, fichas])
  useEffect(() => { setFoco(-1) }, [fragmento])
  const grupos = useMemo(() => {
    const m = new Map<string, { s: Sugerencia; i: number }[]>()
    sugerencias.forEach((x, i) => m.set(x.grupo, [...(m.get(x.grupo) ?? []), { s: x, i }]))
    return [...m.entries()]
  }, [sugerencias])

  const aplicar = () => { if (entendido.length) cambiar(sumar(fichas, entendido)); setTexto('') }
  const elegir = (x: Sugerencia) => {
    // Lo escrito antes del fragmento se aplica tal cual; el fragmento lo reemplaza la sugerencia.
    cambiar(sumar(sumar(fichas, analizar(antes, voc)), [x.ficha])); setTexto(''); input.current?.focus()
  }
  const tecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); if (foco >= 0 && sugerencias[foco]) elegir(sugerencias[foco]); else aplicar() }
    else if (e.key === 'Backspace' && !texto && fichas.length) cambiar(fichas.slice(0, -1))
    else if (e.key === 'Escape') { setAbierta(false); input.current?.blur() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAbierta(true); setFoco(f => Math.min(sugerencias.length - 1, f + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco(f => Math.max(-1, f - 1)) }
  }
  const sinMarca = fichas.some(f => f.k === 'mis4') && !voc.mis4.length
  const ph = fichas.length ? 'Añade otro: tema, canal, idioma, días, ×N…' : 'Filtra: tema, canal, idioma, días, ×N o «mis 4»'

  return <div className={s.barraFiltro} data-testid="filtro" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAbierta(false) }}>
    <div className={s.filtroCampo} data-abierta={abierta || undefined} onClick={() => input.current?.focus()}>
      <Search size={15} aria-hidden />
      {fichas.map(f => <span key={JSON.stringify(f)} className={s.ficha} data-tipo={f.k}>{etiqueta(f, voc)}
        <button type="button" onClick={e => { e.stopPropagation(); cambiar(quitar(fichas, f)) }} aria-label={`Quitar ${etiqueta(f, voc)}`}><X size={12} /></button></span>)}
      <input ref={input} value={texto} placeholder={ph} aria-label="Filtro de contenido" data-testid="filtro-campo"
        onChange={e => { setTexto(e.target.value); setAbierta(true) }} onFocus={() => setAbierta(true)} onKeyDown={tecla} />
      {!fichas.length && !texto && <small className={s.filtroHoy} aria-hidden>{resumen(criterio, voc)}</small>}
      {(fichas.length > 0 || texto) && <button type="button" className={s.filtroLimpiar} onClick={e => { e.stopPropagation(); cambiar([]); setTexto('') }}>Lo de hoy</button>}
    </div>
    {fichas.length > 0 && <p className={s.filtroResumen} data-testid="filtro-resumen">{sinMarca ? 'Tus 4 referentes aún no están marcados en tu universo.' : <>Viendo: {resumen(criterio, voc)}{criterio.textos.length ? ` · con «${criterio.textos.join('», «')}»` : ''}</>}</p>}
    {abierta && (sugerencias.length > 0 || entendido.length > 0) && <div className={s.filtroMenu} role="listbox" data-testid="filtro-menu">
      {texto.trim() && entendido.length > 0 && <div className={s.filtroGrupo}><p>Lo que entendí · Enter para aplicar</p>
        <div>{entendido.map(f => <span key={JSON.stringify(f)} className={s.ficha} data-tipo={f.k} data-previa>{etiqueta(f, voc)}</span>)}</div></div>}
      {grupos.map(([g, xs]) => <div key={g} className={s.filtroGrupo}><p>{g}</p><div>
        {xs.map(({ s: x, i }) => <button key={`${g}${i}`} type="button" role="option" aria-selected={foco === i} data-tipo={x.ficha.k} tabIndex={-1}
          onMouseDown={e => e.preventDefault()} onClick={() => elegir(x)} title={x.detalle}>{x.texto}{x.detalle && x.ficha.k === 'mis4' ? <small>{x.detalle}</small> : null}</button>)}
      </div></div>)}
    </div>}
  </div>
}
