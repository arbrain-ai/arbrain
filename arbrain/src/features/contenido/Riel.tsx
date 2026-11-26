'use client'
/**
 * El riel de Contenido (17 nov 2026, el dueño: «inicio radar ideas y canal se posan hasta arriba, pésimo»). La navegación
 * vuelve a donde uno la busca, a la izquierda, como en YouTube: arriba las cuatro secciones; abajo, «Lo tuyo» (Ver
 * después con su cuenta, Guardados, Descargas y Comentarios). Se pliega a iconos (y se pliega solo en ventana angosta).
 * 19 nov 2026 («veo estos botones pocos y simétricos»): dentro del panel junto al chat es el MISMO menú lateral, con nombre
 * e ícono (antes era una fila de iconos arriba que no se entendía); en un panel angosto queda el ícono con su nombre debajo.
 * 20 nov 2026 (en el teléfono, «prefiero que sea… un menú sidebar que aparece»): en ancho de teléfono el riel se esconde y
 * arriba queda una barra delgada (☰ + la sección actual); el menú entra deslizándose desde la izquierda y se cierra al
 * elegir, al tocar afuera o con Esc. En pantallas anchas no cambia nada (todo lo decide el CSS por contenedor).
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bookmark, Clapperboard, Clock, Download, Home, Inbox, Lightbulb, Menu, PanelLeftClose, PanelLeftOpen, Radar, Swords } from 'lucide-react'
import { tr, trMarca } from '@/shared/i18n'
import { useMios } from './useMios'
import { useDescargas } from './useDescargas'
import s from './cuartel.module.css'

import type { SeccionContenido } from './secciones'
export type { SeccionContenido } from './secciones'

const ARRIBA: [SeccionContenido, string, typeof Home][] = [['aprender', trMarca('Inicio'), Home], ['radar', trMarca('Radar'), Radar], ['competidores', trMarca('Competidores'), Swords], ['ideas', trMarca('Ideas'), Lightbulb], ['canal', trMarca('Tu canal'), Clapperboard]]
const TUYO: [SeccionContenido, string, typeof Home][] = [['despues', trMarca('Ver después'), Clock], ['guardados', trMarca('Guardados'), Bookmark], ['descargas', trMarca('Descargas'), Download], ['inbox', trMarca('Comentarios'), Inbox]]
const LLAVE = 'contenido:riel-plegado'

export function RielContenido({ actual, enPanel, href, elegir }: { actual: SeccionContenido; enPanel?: boolean; href: (id: SeccionContenido) => string; elegir?: (id: SeccionContenido) => void }) {
  const { mios } = useMios()
  const ds = useDescargas()
  const [plegado, setPlegado] = useState(false)
  const [abierto, setAbierto] = useState(false)
  useEffect(() => { if (!abierto) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [abierto])
  useEffect(() => { try { setPlegado(localStorage.getItem(LLAVE) === '1') } catch { /* sin almacenamiento */ } }, [])
  const plegar = () => setPlegado(p => { try { localStorage.setItem(LLAVE, p ? '0' : '1') } catch { /* */ } return !p })
  const proximos = mios.despues.filter(d => d.cuando && Date.parse(d.cuando) > Date.now() - 36e5 && Date.parse(d.cuando) < Date.now() + 864e5).length
  const cuenta: Partial<Record<SeccionContenido, number>> = { despues: mios.despues.length, guardados: mios.guardados.length, descargas: ds.lista.length }
  const item = ([id, nombre, Icono]: [SeccionContenido, string, typeof Home]) => {
    const n = cuenta[id], txt = tr(nombre)
    const dentro = <><Icono size={enPanel ? 17 : 19} aria-hidden strokeWidth={actual === id ? 2.2 : 1.8} /><span className={s.rielNombre}>{txt}</span>
      {n ? <b className={s.rielCuenta} data-urge={id === 'despues' && proximos > 0 || undefined} title={id === 'despues' && proximos ? tr('{n} te tocan en las próximas 24 h', { n: proximos }) : undefined}>{n}</b> : null}</>
    const comun = { 'aria-current': actual === id ? 'page' as const : undefined, 'data-seccion': id, title: plegado || enPanel ? txt : undefined, className: s.rielItem }
    return elegir ? <button key={id} type="button" {...comun} onClick={() => { setAbierto(false); elegir(id) }}>{dentro}</button> : <Link key={id} {...comun} href={href(id)} scroll={false} onClick={() => setAbierto(false)}>{dentro}</Link>
  }
  const todos = [...ARRIBA, ...TUYO]
  const actualNombre = tr(todos.find(([id]) => id === actual)?.[1] ?? 'Contenido')
  const hayCuenta = Object.values(cuenta).some(n => (n ?? 0) > 0)
  return <>
  <button type="button" className={s.rielBarra} onClick={() => setAbierto(true)} aria-expanded={abierto} aria-label={tr('Abrir el menú de Contenido')} data-testid="riel-barra">
    <Menu size={18} aria-hidden />{hayCuenta && <i className={s.rielPunto} aria-hidden />}<span>{actualNombre}</span>
  </button>
  {abierto && <div className={s.rielVelo} onClick={() => setAbierto(false)} aria-hidden />}
  <nav className={s.riel} aria-label={tr('Contenido')} data-panel={enPanel || undefined} data-plegado={plegado || undefined} data-abierto={abierto || undefined} data-testid="riel-contenido">
    <div className={s.rielGrupo}>{ARRIBA.map(item)}</div>
    <div className={s.rielGrupo} data-tuyo><p className={s.rielTitulo}>{tr('Lo tuyo')}</p>{TUYO.map(item)}</div>
    {!enPanel && <button type="button" className={s.rielPlegar} onClick={plegar} aria-label={plegado ? tr('Mostrar nombres') : tr('Plegar a iconos')} title={plegado ? tr('Mostrar nombres') : tr('Plegar a iconos')}>
      {plegado ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}<span className={s.rielNombre}>{tr('Plegar')}</span></button>}
  </nav>
  </>
}
