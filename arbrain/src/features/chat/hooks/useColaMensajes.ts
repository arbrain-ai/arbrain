'use client'
/**
 * La fila de mensajes (30 sep 2026, pedido de Daniel: «no te puedo enviar mensajes
 * mientras estás trabajando… quisiera que se acumulara a la fila; nota cómo lo hace
 * Anthropic e intenta superarlos»).
 *
 * Mientras Levy trabaja, Enter no se pierde: el mensaje entra a una fila VISIBLE
 * y editable de esa conversación. Al terminar el turno, la fila sale sola como UN
 * mensaje (los pendientes unidos en orden, como Claude Code). Lo que lo supera:
 *  - la fila se ve, se edita y se reordena por partes (quitar, regresar al
 *    composer); Claude Code solo deja editar la última con ↑;
 *  - sobrevive a recargar o cerrar la app (localStorage por conversación);
 *  - «Enviar ya» detiene el turno conservando lo hecho y manda la fila;
 *  - si TÚ detienes a Levy o el turno falla, la fila NO sale sola: queda en
 *    pausa, a la vista, hasta que decidas.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { unirFila } from '../lib/envio-chat'
import { sacarDeFila } from '../lib/fila-edicion'

/** `imagenes`: URLs ya subidas al storage; sobreviven a recargar igual que el texto. */
export interface EnFila { id: string; texto: string; creado: number; imagenes?: string[] }
const LLAVE = 'arbrain:cola:'
/** Pausa por conversación mientras viva la página: ir y volver de una conversación
 *  no pausa su fila; solo recargar/abrir la app la trae en pausa. */
const pausaEnMemoria = new Map<string, boolean>()

function leer(clave: string): EnFila[] {
  try { const v = JSON.parse(localStorage.getItem(LLAVE + clave) ?? '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x.texto === 'string').map(x => ({ ...x, imagenes: Array.isArray(x.imagenes) ? x.imagenes.filter((u: unknown) => typeof u === 'string') : undefined })) : [] } catch { return [] }
}

export function useColaMensajes(clave: string) {
  // El estado lleva su clave: al cambiar de conversación nunca se muestra (ni se
  // mezcla) la fila de la anterior, ni por un cuadro.
  const [estado, setEstado] = useState<{ clave: string; items: EnFila[]; pausada: boolean }>({ clave: '', items: [], pausada: false })
  const vigente = estado.clave === clave ? estado : { clave, items: [] as EnFila[], pausada: false }
  const actual = useRef(vigente)
  actual.current = vigente
  // Al abrir una conversación con fila guardada, la fila llega EN PAUSA: nada sale
  // solo después de recargar; tú decides si mandarla.
  useEffect(() => {
    const cargar = () => { const l = leer(clave); setEstado({ clave, items: l, pausada: l.length > 0 && (pausaEnMemoria.get(clave) ?? true) }) }
    cargar()
    // Una mudanza de servidor (11 oct 2026) puede traer la fila del origen anterior después de montar: llega EN PAUSA.
    window.addEventListener('arbrain:cola-importada', cargar)
    return () => window.removeEventListener('arbrain:cola-importada', cargar)
  }, [clave])
  const guardar = useCallback((lista: EnFila[], pausada?: boolean) => {
    const k = actual.current.clave
    const nuevo = { clave: k, items: lista, pausada: pausada ?? (lista.length ? actual.current.pausada : false) }
    actual.current = nuevo
    pausaEnMemoria.set(k, nuevo.pausada)
    setEstado(nuevo)
    try { if (lista.length) localStorage.setItem(LLAVE + k, JSON.stringify(lista)); else localStorage.removeItem(LLAVE + k) } catch { /* la fila sigue en memoria */ }
  }, [])
  const encolar = useCallback((texto: string, imagenes?: string[]) => {
    const t = texto.trim(); if (!t && !imagenes?.length) return
    // Escribir de nuevo es intención: la fila deja de estar en pausa.
    guardar([...actual.current.items, { id: crypto.randomUUID(), texto: t, creado: Date.now(), ...(imagenes?.length ? { imagenes } : {}) }], false)
  }, [guardar])
  const quitar = useCallback((id: string) => guardar(actual.current.items.filter(x => x.id !== id)), [guardar])
  /** Saca un pendiente (o el último) ENTERO, texto y fotos, para editarlo en el composer (ver fila-edicion). */
  const sacar = useCallback((id?: string) => {
    const r = sacarDeFila(actual.current.items, id)
    if (!r) return null
    guardar(r.resto)
    return r.item
  }, [guardar])
  /** Vacía la fila y la devuelve como UN mensaje, en orden, con las fotos de todos. */
  const tomarTodo = useCallback(() => {
    const unido = unirFila(actual.current.items)
    if (actual.current.items.length) guardar([], false)
    return unido
  }, [guardar])
  const pausar = useCallback(() => { if (actual.current.items.length) guardar(actual.current.items, true) }, [guardar])
  /** Stop con mensajes inyectados que Levy no leyó (7 oct 2026): vuelven aquí EN PAUSA, nunca se descartan
   *  y nunca salen sin que Daniel lo decida. */
  const devolverEnPausa = useCallback((textos: string[]) => {
    const nuevos = textos.map(t => t.trim()).filter(Boolean).map(texto => ({ id: crypto.randomUUID(), texto, creado: Date.now() }))
    if (nuevos.length) guardar([...actual.current.items, ...nuevos], true)
  }, [guardar])
  return { items: vigente.items, pausada: vigente.pausada, pausar, encolar, quitar, sacar, tomarTodo, devolverEnPausa,
    hay: () => actual.current.items.length > 0, estaPausada: () => actual.current.pausada,
    /** Hay pendientes que van a salir solos: lo nuevo se forma detrás para respetar el orden. */
    esperando: () => actual.current.items.length > 0 && !actual.current.pausada }
}
