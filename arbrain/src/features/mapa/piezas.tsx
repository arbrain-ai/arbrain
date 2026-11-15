'use client'
/**
 * Las piezas que comparten los bloques (mapa v16, 14 nov 2026): ceja, sello de estado, botón a destino y el punto que
 * respira. Estado = trazo (gramática de la v15): firmado sólido, abierto y pendiente en rayas, idea en puntos.
 */
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowRight, BarChart3, Brain, CalendarDays, Clapperboard, ExternalLink, FileText, Flame, HandCoins, LayoutDashboard,
  ListChecks, Map, Megaphone, PackageCheck, Radio, Sparkles, Wallet, Workflow, Wrench, type LucideIcon,
} from 'lucide-react'
import s from './isla.module.css'
import { esObj, esTexto, lista, texto, type Contexto } from './tipos'

export const ICONOS: Record<string, LucideIcon> = {
  flecha: ArrowRight, fuera: ExternalLink, doc: FileText, panel: LayoutDashboard, bi: BarChart3, mente: Brain,
  calendario: CalendarDays, contenido: Clapperboard, supernova: Flame, venta: HandCoins, mapa: Map, marketing: Megaphone,
  entrega: PackageCheck, radio: Radio, oferta: Sparkles, finanzas: Wallet, sistemas: Workflow, taller: Wrench, lista: ListChecks,
}
/** Logos reales (public/mapa/logos): Polar, YouTube, Google Meet, GitHub, Claude, Arbrain. */
export const LOGOS = new Set(['polar', 'youtube', 'googlemeet', 'github', 'claude', 'arbrain'])

export type Estado = 'firmado' | 'abierto' | 'pendiente' | 'idea' | 'hoy' | 'rojo' | 'con-datos'
export const ESTADOS: readonly Estado[] = ['firmado', 'abierto', 'pendiente', 'idea', 'hoy', 'rojo', 'con-datos']
export const esEstado = (x: unknown): x is Estado => typeof x === 'string' && (ESTADOS as readonly string[]).includes(x)

export function Ceja({ children, tono, style }: { children: ReactNode; tono?: 'oro' | 'morado'; style?: CSSProperties }) {
  return <p className={s.ceja} data-tono={tono} style={style}>{children}</p>
}

export function Sello({ estado, tono, children }: { estado: Estado; tono?: 'oro' | 'morado'; children?: ReactNode }) {
  return <span className={s.sello} data-estado={estado} data-tono={tono}>{children ?? estado}</span>
}

/** Un sello leído de la receta: `"sello": "firmado"` o `{ "estado": "abierto", "texto": "el nombre, en enero" }`. */
export function SelloDe({ v, tono }: { v: unknown; tono?: 'oro' | 'morado' }) {
  if (esEstado(v)) return <Sello estado={v} tono={tono} />
  if (esObj(v) && esEstado(v.estado)) return <Sello estado={v.estado} tono={tono}>{texto(v.texto, v.estado)}</Sello>
  return null
}

export interface BotonReceta { texto: string; destino: string; icono?: string; logo?: string; tono?: 'oro' | 'morado'; donde?: string }
export const esBoton = (x: unknown): x is BotonReceta => esObj(x) && esTexto(x.texto) && esTexto(x.destino)

function iconoDe(b: BotonReceta) {
  if (b.icono && ICONOS[b.icono]) return ICONOS[b.icono]
  return b.destino.startsWith('url:') ? ExternalLink : b.destino.startsWith('doc:') ? FileText : b.destino.startsWith('lienzo:') ? Map : LayoutDashboard
}

export function Boton({ b, ctx }: { b: BotonReceta; ctx: Contexto }) {
  const Icono = iconoDe(b)
  const logo = b.logo && LOGOS.has(b.logo) ? b.logo : null
  return <button type="button" className={s.boton} data-tono={b.tono} onClick={e => { e.stopPropagation(); ctx.ir(b.destino) }}
    onPointerDown={e => e.stopPropagation()} title={b.destino}>
    <span className={s.disco} data-logo={logo ? '' : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={`/mapa/logos/${logo}.png`} alt="" /> : <Icono size={19} strokeWidth={2.2} aria-hidden />}
    </span>
    {b.texto}{b.donde ? <span className={s.donde}>{b.donde}</span> : null}
  </button>
}

export function Botones({ v, ctx, style }: { v: unknown; ctx: Contexto; style?: CSSProperties }) {
  const bs = lista(v, esBoton)
  if (!bs.length) return null
  return <div className={s.botones} style={style}>{bs.map(b => <Boton key={b.destino + b.texto} b={b} ctx={ctx} />)}</div>
}

export function Respira({ tono, apagado }: { tono?: 'oro'; apagado?: boolean }) {
  return <span className={s.respira} data-tono={tono} data-apagado={apagado ? '' : undefined} aria-hidden />
}

/** Lo que un bloque pinta cuando su receta no le dio lo mínimo: un hueco que lo dice, nunca un error rojo en el mapa. */
export function Hueco({ children }: { children: ReactNode }) {
  return <div className={s.hueco}>{children}</div>
}
