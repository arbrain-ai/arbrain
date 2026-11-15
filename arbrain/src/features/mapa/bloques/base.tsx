'use client'
/**
 * Bloques BASE del mapa v16 (14 nov 2026): lo que toda isla usa para hablar.
 *   encabezado  { ceja, titulo, bajada?, sello?, tam?: 'grande'|'normal', tono?: 'oro'|'morado', botones? }
 *   firma       { rotulo?, glosa?, fecha?, frase, autor?, tam?, tono? }        una frase firmada, palabra por palabra
 *   parrafo     { texto, estilo?: 'cuerpo'|'glosa'|'ceja', tam? }
 *   botones     { botones: [{ texto, destino, icono?, logo?, tono? }], ceja? }
 *   numerada    { ceja?, titulo?, items: [string | { texto, resalta? }], numerada? }
 */
import type { CSSProperties } from 'react'
import { Botones, Ceja, Hueco, SelloDe } from '../piezas'
import { esObj, esTexto, lista, numero, texto, type ComponenteBloque, type PropsBloque } from '../tipos'
import s from '../isla.module.css'
import b from './base.module.css'

const tono = (v: unknown) => (v === 'oro' || v === 'morado' ? v : undefined)

function Encabezado({ b: r, ctx }: PropsBloque) {
  const grande = r.tam === 'grande'
  return <header className={b.encabezado}>
    <div className={b.encCuerpo}>
      <div className={b.encCeja}>{esTexto(r.ceja) && <Ceja tono={tono(r.tono) ?? 'oro'}>{r.ceja}</Ceja>}<SelloDe v={r.sello} tono={tono(r.tono)} /></div>
      <h2 className={s.titulo} style={{ fontSize: numero(r.tamTitulo, grande ? 104 : 76) }}>{texto(r.titulo)}</h2>
      {esTexto(r.bajada) && <p className={s.glosa} style={{ fontSize: grande ? 21 : 19, marginTop: 14, maxWidth: 900 }}>{r.bajada}</p>}
    </div>
    <Botones v={r.botones} ctx={ctx} style={{ alignSelf: 'flex-end' }} />
  </header>
}

function Cita({ b: r }: PropsBloque) {
  if (!esTexto(r.frase)) return <Hueco>cita sin «frase»</Hueco>
  const t = tono(r.tono) ?? 'oro'
  return <figure className={b.cita} data-tono={t}>
    {(esTexto(r.rotulo) || esTexto(r.fecha)) && <div className={b.citaCab}>
      {esTexto(r.rotulo) && <Ceja tono={t}>{r.rotulo}</Ceja>}
      {esTexto(r.glosa) && <span className={b.citaGlosa}>{r.glosa}</span>}
      {esTexto(r.fecha) && <span className={b.citaFecha}>{r.fecha}</span>}
    </div>}
    <blockquote className={s.firma} style={{ fontSize: numero(r.tam, 30) }}>{r.frase}</blockquote>
    {esTexto(r.autor) && <figcaption className={b.citaAutor}>{r.autor}</figcaption>}
  </figure>
}

function Texto({ b: r }: PropsBloque) {
  const estilo = r.estilo === 'glosa' ? s.glosa : r.estilo === 'ceja' ? s.ceja : s.cuerpo
  return <p className={estilo} style={{ fontSize: numero(r.tam, r.estilo === 'ceja' ? 13 : 18) } as CSSProperties}>{texto(r.texto)}</p>
}

function BloqueBotones({ b: r, ctx }: PropsBloque) {
  return <div className={b.botonesFila}>
    {esTexto(r.ceja) && <Ceja>{r.ceja}</Ceja>}
    <Botones v={r.botones} ctx={ctx} />
    {esTexto(r.glosa) && <span className={s.glosa} style={{ fontSize: 15 }}>{r.glosa}</span>}
  </div>
}

type Item = { texto: string; resalta?: boolean }
const esItem = (x: unknown): x is string | Item => esTexto(x) || (esObj(x) && esTexto(x.texto))

function Lista({ b: r }: PropsBloque) {
  const items = lista(r.items, esItem).map(i => (esTexto(i) ? { texto: i } : i))
  return <section className={b.lista}>
    {esTexto(r.ceja) && <Ceja tono={tono(r.tono) ?? 'oro'}>{r.ceja}</Ceja>}
    {esTexto(r.titulo) && <h3 className={b.listaTitulo}>{r.titulo}</h3>}
    <ol className={b.items} data-numerada={r.numerada === false ? undefined : ''}>
      {items.map((i, k) => <li key={k} data-resalta={i.resalta ? '' : undefined}><span className={b.n}>{k + 1}</span><span>{i.texto}</span></li>)}
    </ol>
  </section>
}

export const BLOQUES_BASE: Record<string, ComponenteBloque> = {
  encabezado: Encabezado, firma: Cita, parrafo: Texto, botones: BloqueBotones, numerada: Lista,
}
