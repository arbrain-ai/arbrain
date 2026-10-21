'use client'
/**
 * Código en solo lectura (8 oct 2026), para lo que se abre desde el explorador de archivos. Números de línea, el resaltado de
 * highlight.js (el mismo tema que los bloques de código del chat) y, en archivos de más de 300 KB, texto mono sin color para
 * no trabar el panel. highlight.js carga solo al abrir el primer archivo de código. No se edita: es para ver y controlar.
 * Las líneas largas se ajustan al ancho por defecto (como en el chat: sin scroll horizontal dentro del panel); apagar «Ajustar»
 * las deja en un renglón. Cada línea lleva su número, así que ajustar no las desalinea.
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Lock, WrapText } from 'lucide-react'
import { lenguajeDe } from '../../explorador/arbol'
import { escaparHtml, lineasHtml } from '../../explorador/codigo'
import { pesoLegible } from '../../documento/medio'
import 'highlight.js/styles/github-dark-dimmed.css'
import c from './codigo.module.css'

const TOPE_COLOR = 300_000

type Hljs = typeof import('highlight.js').default
let hljs: Promise<Hljs> | null = null
const cargarHljs = () => (hljs ??= import('highlight.js/lib/common').then(m => m.default as Hljs))

export function Codigo({ texto, archivo, bytes }: { texto: string; archivo: string; bytes?: number }) {
  const lenguaje = lenguajeDe(archivo)
  const [html, setHtml] = useState<string | null>(null)
  const [ajustar, setAjustar] = useState(true)
  const [copiado, setCopiado] = useState(false)
  const filas = useMemo(() => {
    const todas = lineasHtml(html ?? escaparHtml(texto))
    return texto.endsWith('\n') && todas.length > 1 ? todas.slice(0, -1) : todas
  }, [html, texto])
  const lineas = filas.length

  useEffect(() => {
    let vivo = true
    setHtml(null)
    if (!lenguaje || texto.length > TOPE_COLOR) return
    void cargarHljs().then(h => {
      if (!vivo || !h.getLanguage(lenguaje)) return
      try { setHtml(h.highlight(texto, { language: lenguaje, ignoreIllegals: true }).value) } catch { /* queda en mono */ }
    })
    return () => { vivo = false }
  }, [texto, lenguaje])

  const copiar = () => { void navigator.clipboard.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1600) }) }

  return <div className={c.codigo} data-ajustar={ajustar || undefined}>
    <div className={c.barra}>
      <span className={c.lenguaje}>{lenguaje ?? 'texto'}</span>
      <span className={c.dato}>{lineas.toLocaleString('es-MX')} {lineas === 1 ? 'línea' : 'líneas'}{bytes != null ? ` · ${pesoLegible(bytes)}` : ''}</span>
      <span className={c.solo}><Lock size={11} aria-hidden />Solo lectura</span>
      <span className={c.acciones}>
        <button onClick={() => setAjustar(a => !a)} aria-pressed={ajustar} title={ajustar ? 'Las líneas largas se ajustan al ancho · clic para dejarlas en un renglón con scroll' : 'Ajustar las líneas largas al ancho'}><WrapText size={12} aria-hidden />Ajustar</button>
        <button onClick={copiar} title="Copiar todo el archivo">{copiado ? <><Check size={12} aria-hidden />Copiado</> : <><Copy size={12} aria-hidden />Copiar</>}</button>
      </span>
    </div>
    {texto.length > TOPE_COLOR && lenguaje && <p className={c.aviso}>Archivo grande: sin color para no trabar el panel.</p>}
    <div className={c.cuerpo}>
      <div className={c.lineas} style={{ ['--digitos' as string]: String(lineas).length }}>
        {filas.map((h, i) => <div key={i} className={c.linea}><span className={c.n} aria-hidden>{i + 1}</span><code dangerouslySetInnerHTML={{ __html: h || ' ' }} /></div>)}
      </div>
    </div>
  </div>
}
