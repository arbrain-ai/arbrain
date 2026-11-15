'use client'

/**
 * «＋ Nuevo lienzo» (7 nov 2026, Daniel: «si quiero crear un nuevo lienzo desde acá en blanco… si quiero hacer una clase la
 * experiencia manual de usuario no es tan buena»). Una tarjeta arriba de la lista: el nombre se escribe AHÍ (nada de
 * «Lienzo nuevo» que luego hay que renombrar), se elige cómo nace (en blanco, clase con título y tres bloques, o copia de una
 * plantilla) y nace en la carpeta abierta, que se puede cambiar antes de crear. Enter crea, Esc cierra.
 */
import { useMemo, useState } from 'react'
import { LayoutTemplate, Presentation, Square, X } from 'lucide-react'
import type { Carpeta, ModoNuevo, PaginaResumen } from '../../state/nube'
import { destinosDePagina, plantillasDisponibles } from '../../state/vista-lienzos'
import { Miniatura } from './Miniatura'
import { tr, trMarca } from '@/shared/i18n'
import css from './lienzos.module.css'

type Modo = ModoNuevo['modo']
const MODOS: { modo: Modo; etiqueta: string; nota: string; icono: React.ReactNode }[] = [
  { modo: 'blanco', etiqueta: trMarca('En blanco'), nota: trMarca('Un lienzo vacío para dibujar a mano o pedírselo a Levy.'), icono: <Square size={16} aria-hidden /> },
  { modo: 'clase', etiqueta: trMarca('Clase'), nota: trMarca('Título y tres bloques: qué van a aprender, cómo funciona y qué hacen hoy.'), icono: <Presentation size={16} aria-hidden /> },
  { modo: 'plantilla', etiqueta: trMarca('Desde plantilla'), nota: trMarca('Una copia de la plantilla, con tu nombre y en tu carpeta.'), icono: <LayoutTemplate size={16} aria-hidden /> },
]

interface Props {
  paginas: PaginaResumen[]
  carpetas: Carpeta[]
  /** La carpeta abierta: ahí nace, salvo que se elija otra. */
  carpeta: string | null
  onCrear: (nombre: string, folderId: string | null, modo: ModoNuevo) => Promise<boolean>
  onCerrar: () => void
}

export function NuevoLienzo({ paginas, carpetas, carpeta, onCrear, onCerrar }: Props) {
  const [nombre, setNombre] = useState('')
  const [modo, setModo] = useState<Modo>('blanco')
  const [destino, setDestino] = useState<string | null>(carpeta)
  const [desde, setDesde] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const destinos = useMemo(() => destinosDePagina(carpetas), [carpetas])
  const plantillas = useMemo(() => plantillasDisponibles(paginas, carpetas), [paginas, carpetas])
  const elegida = desde ?? plantillas[0]?.id ?? null
  const listo = !!nombre.trim() && (modo !== 'plantilla' || !!elegida) && !creando

  const crear = async () => {
    if (!listo) return
    setCreando(true)
    const ok = await onCrear(nombre, destino, modo === 'plantilla' ? { modo, desde: elegida! } : { modo } as ModoNuevo)
    setCreando(false)
    if (ok) onCerrar()
  }

  return <form className={css.nuevo} aria-label={tr('Lienzo nuevo')} data-capa-hija="" onSubmit={e => { e.preventDefault(); void crear() }}
    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrar() } }}>
    <div className={css.nuevoCabeza}>
      <span>{tr('Lienzo nuevo')}</span>
      <button type="button" onClick={onCerrar} aria-label={tr('Cerrar')} title={tr('Cerrar (Esc)')}><X size={14} aria-hidden /></button>
    </div>
    <input className={css.campo} autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
      placeholder={tr('¿Cómo se llama?')} aria-label={tr('Nombre del lienzo nuevo')} maxLength={140} />
    <div className={css.modos} role="radiogroup" aria-label={tr('Cómo nace')}>
      {MODOS.map(m => <button key={m.modo} type="button" role="radio" aria-checked={modo === m.modo} className={css.modo}
        data-activo={modo === m.modo ? '' : undefined} onClick={() => setModo(m.modo)}>{m.icono}<span>{tr(m.etiqueta)}</span></button>)}
    </div>
    <p className={css.nuevoNota}>{tr(MODOS.find(m => m.modo === modo)!.nota)}</p>
    {modo === 'plantilla' && (plantillas.length
      ? <div className={css.plantillas} role="radiogroup" aria-label={tr('Plantilla')}>
          {plantillas.map(x => <button key={x.id} type="button" role="radio" aria-checked={elegida === x.id} className={css.plantilla}
            data-activo={elegida === x.id ? '' : undefined} onClick={() => setDesde(x.id)}>
            <Miniatura url={x.miniatura} /><span title={x.nombre}>{x.nombre}</span>
          </button>)}
        </div>
      : <p className={css.nuevoNota}>{tr('Aún no hay plantillas. Ponle «Plantilla» en el nombre a un lienzo y saldrá aquí.')}</p>)}
    <label className={css.destino}>
      <span>{tr('En')}</span>
      <select value={destino ?? ''} onChange={e => setDestino(e.target.value || null)} aria-label={tr('Carpeta del lienzo nuevo')}>
        {destinos.map(d => <option key={d.id ?? 'raiz'} value={d.id ?? ''}>{tr(d.etiqueta)}</option>)}
      </select>
    </label>
    <div className={css.nuevoPie}>
      <button type="button" onClick={onCerrar}>{tr('Cancelar')}</button>
      <button type="submit" data-primario="" disabled={!listo}>{creando ? tr('Creando…') : tr('Crear lienzo')}</button>
    </div>
  </form>
}
