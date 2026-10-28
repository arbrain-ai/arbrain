'use client'
/**
 * Lo que Levy muestra se queda en el panel (diseño v2, 1 oct). Cada vista que
 * enseña se fija arriba como pestaña; en el chat queda una línea que la nombra.
 * Se guarda la INVOCACIÓN (como en el hilo), nunca el HTML: al abrirla se lee
 * de su fuente. Sobrevive a recargar (por navegador, solo comodidad).
 *
 * 3 oct 2026 (Daniel): las pestañas se acomodan como en Chrome. Ninguna es obligatoria (Tareas y
 * Taller también se cierran y vuelven desde «+»), el orden se arrastra y es suyo y global (no por
 * conversación), y no hay tope: lo que fija Levy y él no guarda se cierra solo al cambiar de
 * conversación (`porCerrar`). Guardar la manda al archivero (archivero.ts) y la deja abierta.
 *
 * 5 oct 2026 (Daniel, modelo de Chrome): cada pestaña vive en el panel principal o en una ventana aparte
 * (`enVentana`), con UN solo orden global; cada ventana pinta su tramo. Las ancladas van primero y compactas.
 * Cualquier ventana puede cambiar el estado: se guarda en este dispositivo y se publica a las demás.
 */
import { create } from 'zustand'
import { esEdicionCliente, vistaPermitidaEnCliente } from '@/lib/edicion'
import { esVistaConocida, hoyCivil, rangoCalendario, type MostrarInput } from '../model'
import { coincide, coincideVista, mismaRuta } from './bus-puro'
import { useMemo } from 'react'
import { cerrarVentanas, enlazarFijadas, escuchar, publicar } from './ventanas'
import { pedirSegmentoTaller } from './taller-segmento'
import {
  conAncladas, fueraDe, moverA, moverAVentana as moverEntreVentanas, moverUno as moverUnoEn, normalizarAcomodo, normalizarEnVentana, porCerrar, PRINCIPAL,
  esVentana, TALLER, TAREAS, tiraDe, todasFuera, todasLasClaves, vaciadas, ventanaDe, type EnVentana,
} from './pestanas-fuera'

export interface Fijada {
  id: string; input: MostrarInput; en: number
  /** La fijó Levy (no Daniel a mano): si no se guarda, se cierra sola al cambiar de conversación. */
  deLevy?: boolean
  /** La conversación en la que Levy la fijó. */
  conversacion?: string
  /** Está en el archivero (Levy la guardó con `guardar:true` o Daniel la reabrió desde Guardadas). */
  guardada?: boolean
}
/**
 * ¿Lleva «Guardar»? Solo lo que GENERÓ el agente: un documento (o post), una página de lienzo o un reporte que
 * mostró Levy, y lo que ya está en el archivero. Las vistas por defecto del «+» (Calendario, Objetivos, Tu negocio,
 * Lienzo, Lo que llegó, Command Center, Contenido, Finanzas) no: siempre se reabren desde el «+» (Daniel, 3 oct 2026).
 * Lo abierto a mano desde el «+» nace con id `mano-…` (Secciones.tsx, `abrirSeccion`).
 */
export function guardable(f: Pick<Fijada, 'id' | 'input' | 'guardada'>): boolean {
  if (f.guardada || f.input.vista === 'documento') return true
  // Una sesión del pizarrón (7 oct 2026) se guarda como favorita la haya abierto Levy o Daniel desde la casa del pizarrón.
  if (f.input.vista === 'pizarron' && !!f.input.paginaId) return true
  if (f.id.startsWith('mano-')) return false
  return f.input.vista === 'reporte' || (f.input.vista === 'lienzo' && !!f.input.paginaId)
}

/** 'tareas' y 'taller' son las de la casa; lo demás es el id de una fijada. */
export type PestanaPanel = 'tareas' | 'taller' | (string & {})

/** Vistas que ya no son pestaña propia: pedirlas abre el Taller en su pestaña (y una fijada vieja se suelta al cargar). */

const CLIENTE = esEdicionCliente()
// Historia (28 oct 2026) también: una pestaña «historia» fijada antes se suelta al cargar y pedirla abre Taller › Historia.
export const EN_TALLER = new Map<string, string>([['servidores', 'maquina'], ['rutinas', 'rutinas'], ['memoria', 'memoria'], ['historia', 'historia']])

const CLAVE = 'arbrain.panelDerecho.fijadas'
const CLAVE_ACOMODO = 'arbrain.panelDerecho.acomodo'

/** Calendario y Objetivos son UNA vista (4 oct 2026, pedido de Daniel): «objetivos» es un alias que abre la vista unificada en su escala. */
export const alias = (i: MostrarInput): MostrarInput => i.vista === 'objetivos' ? { ...i, vista: 'calendario', alcance: i.alcance ?? 'mes' } : i

/** Dos invocaciones que piden lo mismo (misma vista, alcance, fecha, sección) son una sola pestaña.
 *  Calendario es SECCIÓN del panel (2 oct 2026): una sola pestaña. Otra semana que Levy muestre reemplaza lo que
 *  enseña, sin abrir otra. Objetivos también desde el 4 oct 2026: su pestaña es la sección completa y navega por día,
 *  semana y mes dentro.
 *  Lienzo: una pestaña POR LIENZO (14 oct 2026, Daniel: «no puedo abrir más de un lienzo… la pestaña número uno se
 *  cambia»). Con una sola clave «lienzo», el «+» reusaba la pestaña abierta y le cambiaba la página. Otra zona del
 *  mismo lienzo sí reusa su pestaña. */
export const claveDe = (i: MostrarInput) => i.vista === 'lienzo' ? `lienzo|${i.paginaId ?? ''}`
  : i.vista === 'calendario' || i.vista === 'objetivos' ? alias(i).vista
  // Un documento es su archivo (3 oct 2026): pedirlo otra vez, con otro título o con cambios marcados, reusa su pestaña.
  : i.vista === 'documento' ? `documento|${i.ruta}`
  : [i.vista, i.alcance, i.fecha, i.seccion, i.paginaId, i.agenteId].join('|')

/** Una pestaña por vista (5 oct 2026): Objetivos y Calendario guardados por separado quedan como dos «Calendario»; se funden en la primera.
 *  Si alguna de las repetidas estaba guardada, la que queda también (no se pierde del archivero). */
export function sinDuplicadas(fijadas: Fijada[]): Fijada[] {
  const vistas: Fijada[] = []
  for (const f of fijadas) {
    const i = vistas.findIndex(v => claveDe(v.input) === claveDe(f.input) || mismoDocumento(v.input, f.input))
    if (i < 0) vistas.push(f)
    else if (f.guardada && !vistas[i].guardada) vistas[i] = { ...vistas[i], guardada: true }
  }
  return vistas
}
const mismoDocumento = (a: MostrarInput, b: MostrarInput) => a.vista === 'documento' && b.vista === 'documento' && mismaRuta(a.ruta, b.ruta)

/** ¿El periodo que enseña esta fecha contiene hoy? Entonces la pestaña no guarda fecha: sigue a «hoy» cada día. */
export const esHoy = (alcance: MostrarInput['alcance'], fecha: string, hoy = hoyCivil()) => {
  const r = rangoCalendario(alcance ?? 'semana', fecha)
  return hoy >= r.desde && hoy < r.hasta
}

/** Al abrir la app, un calendario que quedó en un periodo ya terminado (el «dom 4 oct» del lunes 5) vuelve a hoy.
 *  Un periodo futuro que Levy fijó a propósito se respeta. */
export function fechaViva(i: MostrarInput, hoy = hoyCivil()): MostrarInput {
  if (i.vista !== 'calendario' || !i.fecha) return i
  if (rangoCalendario(i.alcance ?? 'semana', i.fecha).hasta > hoy && !esHoy(i.alcance, i.fecha, hoy)) return i
  const { fecha: _fuera, ...resto } = i
  return resto
}

function leer(): Fijada[] {
  try { const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); return Array.isArray(v) ? sinDuplicadas(v.filter(f => f && typeof f.id === 'string' && f.input && !EN_TALLER.has(f.input.vista)).map(f => ({ ...f, input: fechaViva(alias(f.input)) }))) : [] } catch { return [] }
}
/**
 * Edición cliente (22 oct 2026, prueba de Windows de Daniel: «el botón Calendario debe vivir dentro del panel»): el calendario ya no
 * tiene botón en la cabecera del chat; es la primera pestaña del panel. Se siembra UNA vez por dispositivo (nuevo o de la v0.2.6):
 * si luego la persona la cierra, se respeta y vuelve desde «+».
 */
const CLAVE_CALENDARIO_CLIENTE = 'arbrain.panelDerecho.calendarioCliente'
export const ID_CALENDARIO_INICIAL = 'mano-calendario-inicio'
/** ¿Toca sembrar el calendario? Solo en cliente, una vez, y si no hay ya una pestaña de calendario. Pura (para las pruebas). */
export function siembraCalendario(fijadas: readonly Fijada[], cliente: boolean, yaSembrado: boolean): Fijada | null {
  if (!cliente || yaSembrado || fijadas.some(f => alias(f.input).vista === 'calendario')) return null
  return { id: ID_CALENDARIO_INICIAL, input: { vista: 'calendario', alcance: 'dia' }, en: Date.now() }
}
function marcarSembrado(): boolean {
  try { if (localStorage.getItem(CLAVE_CALENDARIO_CLIENTE)) return true; localStorage.setItem(CLAVE_CALENDARIO_CLIENTE, '1'); return false } catch { return true }
}

function leerAcomodo(): unknown {
  try { return JSON.parse(localStorage.getItem(CLAVE_ACOMODO) ?? 'null') } catch { return null }
}
function escribir(fijadas: Fijada[], orden: string[], taller: boolean, ancladas: string[], enVentana: EnVentana) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(fijadas))
    localStorage.setItem(CLAVE_ACOMODO, JSON.stringify({ orden, taller, ancladas, enVentana }))
  } catch { /* sin almacenamiento */ }
}

/** La ventana de ESTE contexto: el panel principal, o la ventana aparte que lo montó (Ventana.tsx). */
let propia = PRINCIPAL
export const ventanaPropia = () => propia
export function soyVentana(id: string) { propia = id }

/** Origen de una pestaña nueva: quién la fijó y desde qué conversación. */
export interface Origen {
  deLevy?: boolean; conversacion?: string | null; guardada?: boolean
  /** La ventana donde nace una pestaña NUEVA (la que eligió Daniel en «Dónde abre Levy»); sin ella o si la pestaña ya existía, no se mueve. */
  ventana?: string
}

interface Estado {
  fijadas: Fijada[]
  /** El acomodo de Daniel: Tareas (si está abierta) y las fijadas, en su orden. El Taller va aparte, fijo a la derecha. */
  orden: string[]
  taller: boolean
  /** Ancladas a la izquierda (como las fijadas de Chrome): primero en su tira y solo con su ícono. */
  ancladas: string[]
  /** En qué ventana aparte vive cada pestaña (lo que no figura, en el panel principal). */
  enVentana: EnVentana
  /** La pestaña a la vista en ESTA ventana. */
  activa: PestanaPanel
  cargado: boolean
  cargar: () => void
  /** Fija (o trae al frente) una vista; devuelve el id de la pestaña que quedó. */
  fijar: (id: string, input: MostrarInput, activar?: boolean, origen?: Origen) => string
  soltar: (id: string) => void
  /** Cierra cualquier pestaña: Tareas, Taller o una fijada. */
  cerrar: (clave: PestanaPanel) => void
  /** Reabre Tareas o el Taller (desde «+») y la deja a la vista. */
  abrirCasa: (clave: 'tareas' | 'taller') => void
  /** Quita TODA pestaña de esa vista o ruta (Levy con `soltar: true`), la haya abierto quien la haya abierto; devuelve las que cerró. */
  soltarVista: (input: MostrarInput) => Fijada[]
  /** Igual, pero solo dice si había alguna. */
  soltarComo: (input: MostrarInput) => boolean
  activar: (p: PestanaPanel) => void
  /** Guardar ↔ quitar en sitio (4 oct 2026): cambia la marca sin cerrar ni mover la pestaña. */
  marcarGuardada: (id: string, guardada: boolean) => void
  /** Cambia lo que enseña una pestaña desde dentro (otra semana del calendario) sin traerla al frente. */
  actualizar: (id: string, input: MostrarInput) => void
  /** Arrastre: la pestaña queda en la posición `indice` del orden. */
  reordenar: (clave: PestanaPanel, indice: number) => void
  /** ⌥← / ⌥→ */
  moverUno: (clave: PestanaPanel, delta: -1 | 1) => void
  /** Anclar o desanclar (queda la primera de las sueltas, o la última de las ancladas). */
  anclar: (clave: PestanaPanel, si: boolean) => void
  /** Lleva una pestaña a otra ventana (o al panel principal: PRINCIPAL), en la posición `indice` de su tira. */
  moverAVentana: (clave: PestanaPanel, destino: string, indice?: number) => void
  /** Cambió la conversación: se cierra lo de Levy sin guardar de otras conversaciones, menos lo que está a la vista. */
  podarConversacion: (conversacion: string | null) => void
  /** Llegó el panel compartido de otro aparato (14 oct 2026, compartido.ts): pestañas, orden, Taller y ancladas. Las ventanas
   *  de este aparato y su pestaña a la vista se conservan (si la de la vista ya no existe, queda su vecina). */
  aplicarRemoto: (e: { fijadas: Fijada[]; orden: string[]; taller: boolean; ancladas: string[] }) => void
}

/** Las pestañas abiertas, en orden de cabecera (con el Taller al final si está abierto). */
export const clavesDe = (st: Pick<Estado, 'orden' | 'taller'>) => todasLasClaves(st.orden, st.taller)

export const usePanelFijadas = create<Estado>((set, get) => {
  /** Escribe, avisa a las otras ventanas y cierra la ventana de lo que ya no existe. */
  const guardarTodo = (cambio: Partial<Pick<Estado, 'fijadas' | 'orden' | 'taller' | 'activa' | 'ancladas' | 'enVentana'>>, activa?: string) => {
    const antes = get().enVentana
    set(cambio)
    // Lo cerrado deja de estar anclado y de vivir en una ventana.
    const claves = clavesDe(get())
    const enVentana = normalizarEnVentana(get().enVentana, claves), ancladas = get().ancladas.filter(c => claves.includes(c))
    set({ enVentana, ancladas, orden: conAncladas(get().orden, ancladas) })
    const { fijadas, orden, taller } = get()
    escribir(fijadas, orden, taller, ancladas, enVentana)
    publicar({ tipo: 'fijadas', fijadas, orden, taller, ancladas, enVentana, ...(activa ? { activa } : {}) })
    // Una ventana que se queda sin pestañas se cierra, como en Chrome.
    cerrarVentanas(vaciadas(antes, enVentana))
  }
  /** Al cerrar la activa queda a la vista su vecina de la derecha (o la de la izquierda), como en Chrome. */
  const vecina = (clave: string, tambien: string[] = []) => {
    const claves = clavesDe(get()), i = claves.indexOf(clave)
    const quedan = tiraDe(claves.filter(c => c !== clave && !tambien.includes(c)), get().enVentana, propia)
    return claves.slice(i + 1).find(c => quedan.includes(c)) ?? [...claves.slice(0, Math.max(0, i))].reverse().find(c => quedan.includes(c)) ?? ''
  }
  return {
    fijadas: [],
    // Edición cliente: no hay Tareas (Todoist y la planificación son de Daniel); el panel nace con el Taller.
    orden: CLIENTE ? [] : [TAREAS],
    taller: true,
    ancladas: [],
    enVentana: {},
    activa: CLIENTE ? TALLER : TAREAS,
    cargado: false,
    cargar: () => {
      if (get().cargado) return
      let fijadas = leer().filter(f => esVistaConocida(f.input?.vista) && vistaPermitidaEnCliente(f.input.vista, CLIENTE))
      const crudo = leerAcomodo()
      const semilla = CLIENTE ? siembraCalendario(fijadas, CLIENTE, marcarSembrado()) : null
      if (semilla) fijadas = [semilla, ...fijadas]
      const acomodo = normalizarAcomodo(crudo, fijadas.map(f => f.id))
      if (CLIENTE) acomodo.orden = acomodo.orden.filter(c => c !== TAREAS)
      // El calendario sembrado va primero (tras las ancladas) y queda a la vista.
      if (semilla) acomodo.orden = conAncladas([semilla.id, ...acomodo.orden.filter(c => c !== semilla.id)], acomodo.ancladas)
      const enVentana = normalizarEnVentana((crudo as { enVentana?: unknown } | null)?.enVentana, todasLasClaves(acomodo.orden, acomodo.taller))
      set({ fijadas, ...acomodo, enVentana, cargado: true, ...(semilla ? { activa: semilla.id } : {}) })
      if (semilla) escribir(fijadas, acomodo.orden, acomodo.taller, acomodo.ancladas, enVentana)
      // Otra ventana fijó, soltó, movió o se llevó algo: aquí se ve igual.
      escuchar(m => {
        if (m.tipo !== 'fijadas') return
        const fijadas = sinDuplicadas(m.fijadas.filter(f => esVistaConocida(f?.input?.vista)))
        const acomodo = normalizarAcomodo(m.orden ? { orden: m.orden, taller: m.taller, ancladas: m.ancladas ?? get().ancladas } : { orden: get().orden, taller: get().taller, ancladas: get().ancladas }, fijadas.map(f => f.id))
        const enVentana = m.enVentana ? normalizarEnVentana(m.enVentana, todasLasClaves(acomodo.orden, acomodo.taller)) : get().enVentana
        // La pestaña que otra ventana trajo al frente solo cambia ESTA ventana si vive aquí.
        const activa = m.activa && (fijadas.some(f => f.id === m.activa) || m.activa === TAREAS || m.activa === TALLER) && ventanaDe(enVentana, m.activa) === propia ? { activa: m.activa } : {}
        set({ fijadas, ...acomodo, enVentana, ...activa })
      })
    },
    fijar: (id, entrada, activar = true, origen = {}) => {
      get().cargar()
      // Servidores vive en el Taller (5 oct 2026, Daniel: «todo lo técnico me gustaría que cayera en el Taller»): pedirla abre
      // el Taller en su segmento Servidores, venga del chat, de Levy por el bus o de una Guardada vieja.
      // Desde el 5 oct (18:11) también Rutinas y Memoria: el Taller es «tu cerebro por dentro», cada una en su pestaña.
      const seg = EN_TALLER.get(entrada.vista)
      if (seg) { pedirSegmentoTaller(seg); get().abrirCasa(TALLER); return TALLER }
      // Edición cliente: lo que no existe en esta edición no se abre (Levy pudo pedir una vista del negocio de Daniel).
      if (!esVistaConocida(entrada.vista) || !vistaPermitidaEnCliente(entrada.vista, CLIENTE)) return ''
      const input = alias(entrada)
      const clave = claveDe(input)
      // Un documento abierto con ruta relativa y pedido con la absoluta (o ~/) es la misma pestaña: se enfoca, no se duplica.
      const previa = get().fijadas.find(f => f.id === id || claveDe(f.input) === clave || mismoDocumento(f.input, input))
      const ahora = Date.now()
      // La misma vista pedida otra vez reemplaza su enfoque y título, pero conserva su lugar. Lo que Daniel
      // abrió a mano sigue siendo suyo aunque Levy lo vuelva a mostrar.
      const fijadas = previa
        ? get().fijadas.map(f => f === previa ? { ...f, input, en: ahora, deLevy: !!(f.deLevy && origen.deLevy), conversacion: origen.conversacion ?? f.conversacion, guardada: f.guardada || origen.guardada || undefined } : f)
        : [...get().fijadas, { id, input, en: ahora, ...(origen.deLevy ? { deLevy: true } : {}), ...(origen.conversacion ? { conversacion: origen.conversacion } : {}), ...(origen.guardada ? { guardada: true } : {}) }]
      const quedo = previa?.id ?? id
      // Lo nuevo va al final; si Daniel ya lo acomodó, respeta su lugar.
      const orden = get().orden.includes(quedo) ? get().orden : [...get().orden, quedo]
      // Una pestaña nueva de Levy nace en la ventana que Daniel eligió (7 oct 2026): sin pasar antes por el panel de al lado.
      const destino = !previa && origen.ventana && origen.ventana !== PRINCIPAL && esVentana(origen.ventana) ? origen.ventana : null
      const enVentana = destino ? { ...get().enVentana, [quedo]: destino } : get().enVentana
      guardarTodo({ fijadas, orden, ...(destino ? { enVentana } : {}), ...(activar && (!destino || destino === propia) ? { activa: quedo } : {}) }, activar ? quedo : undefined)
      return quedo
    },
    soltarVista: (input) => {
      get().cargar()
      // Solo lo que coincide con vista + ruta/página (o con el id de pestaña que devuelve `panel listar`), nunca lo demás. Se decide
      // sobre una foto del panel y se cierra de una sola vez: un cierre por pestaña publicaba estados intermedios a las otras ventanas.
      const cerradas = get().fijadas.filter(f => input.pestana ? f.id === input.pestana && coincideVista(f.input, input) : coincide(f.input, input))
      if (!cerradas.length) return []
      const ids = cerradas.map(f => f.id), activa = get().activa
      guardarTodo({ fijadas: get().fijadas.filter(f => !ids.includes(f.id)), orden: get().orden.filter(c => !ids.includes(c)), ...(ids.includes(activa) ? { activa: vecina(activa, ids) } : {}) })
      return cerradas
    },
    soltarComo: (input) => get().soltarVista(input).length > 0,
    soltar: (id) => get().cerrar(id),
    cerrar: (clave) => {
      const activa = get().activa === clave ? vecina(clave) : get().activa
      if (clave === TALLER) { guardarTodo({ taller: false, activa }); return }
      guardarTodo({ fijadas: get().fijadas.filter(f => f.id !== clave), orden: get().orden.filter(c => c !== clave), activa })
    },
    abrirCasa: (clave) => {
      get().cargar()
      if (clave === TALLER) guardarTodo({ taller: true, activa: TALLER }, TALLER)
      else if (!CLIENTE) guardarTodo({ orden: get().orden.includes(TAREAS) ? get().orden : [...get().orden, TAREAS], activa: TAREAS }, TAREAS)
    },
    activar: (activa) => set({ activa }),
    marcarGuardada: (id, guardada) => {
      if (!get().fijadas.some(f => f.id === id && !!f.guardada !== guardada)) return
      guardarTodo({ fijadas: get().fijadas.map(f => f.id === id ? { ...f, guardada: guardada || undefined } : f) })
    },
    actualizar: (id, input) => {
      guardarTodo({ fijadas: get().fijadas.map(f => f.id === id ? { ...f, input } : f) })
    },
    reordenar: (clave, indice) => {
      const orden = conAncladas(moverA(get().orden, clave, indice), get().ancladas)
      if (orden.join('\n') !== get().orden.join('\n')) guardarTodo({ orden })
    },
    moverUno: (clave, delta) => {
      const orden = conAncladas(moverUnoEn(get().orden, clave, delta), get().ancladas)
      if (orden.join('\n') !== get().orden.join('\n')) guardarTodo({ orden })
    },
    anclar: (clave, si) => {
      if (clave === TALLER || !get().orden.includes(clave) || get().ancladas.includes(clave) === si) return
      const ancladas = si ? [...get().ancladas, clave] : get().ancladas.filter(c => c !== clave)
      // Al anclarla queda la última de las ancladas; al soltarla, la primera de las sueltas: sin saltos.
      const sin = get().orden.filter(c => c !== clave), n = sin.filter(c => ancladas.includes(c)).length
      guardarTodo({ ancladas, orden: conAncladas([...sin.slice(0, n), clave, ...sin.slice(n)], ancladas) })
    },
    moverAVentana: (clave, destino, indice) => {
      const { orden, enVentana } = moverEntreVentanas(get(), clave, destino, indice)
      if (orden.join('\n') === get().orden.join('\n') && JSON.stringify(enVentana) === JSON.stringify(get().enVentana)) return
      guardarTodo({ orden, enVentana, ...(destino === propia ? { activa: clave } : {}) }, clave)
    },
    aplicarRemoto: (e) => {
      get().cargar()
      const fijadas = sinDuplicadas(e.fijadas.filter(f => f && typeof f.id === 'string' && f.input && esVistaConocida(f.input.vista) && !EN_TALLER.has(f.input.vista) && vistaPermitidaEnCliente(f.input.vista, CLIENTE))
        .map(f => ({ ...f, input: fechaViva(alias(f.input)) })))
      const acomodo = normalizarAcomodo({ orden: e.orden, taller: e.taller, ancladas: e.ancladas }, fijadas.map(f => f.id))
      if (CLIENTE) acomodo.orden = acomodo.orden.filter(c => c !== TAREAS)
      const claves = todasLasClaves(acomodo.orden, acomodo.taller), activa = get().activa
      const sigue = claves.includes(activa)
      // Quitar `ancladas` antes de guardarTodo: normaliza contra las claves nuevas.
      set({ ancladas: acomodo.ancladas })
      guardarTodo({ fijadas, orden: acomodo.orden, taller: acomodo.taller, ...(sigue ? {} : { activa: claves[0] ?? '' }) })
    },
    podarConversacion: (conversacion) => {
      const { fijadas, activa } = get()
      const ids = porCerrar(fijadas, conversacion, [activa, ...fueraDe(get().enVentana)])
      if (!ids.length) return
      guardarTodo({ fijadas: fijadas.filter(f => !ids.includes(f.id)), orden: get().orden.filter(c => !ids.includes(c)) })
    },
  }
})

/** Qué pestaña ocupa una invocación del hilo (por id o por ser la misma vista). */
export function fijadaDe(fijadas: Fijada[], id: string, input: MostrarInput) {
  const clave = claveDe(input)
  return fijadas.find(f => f.id === id) ?? fijadas.find(f => claveDe(f.input) === clave || mismoDocumento(f.input, input))
}

// Las ventanas desprendidas consultan las pestañas por este puerto (ventanas.ts no importa este módulo: sería circular).
enlazarFijadas({
  lista: () => usePanelFijadas.getState().fijadas,
  claves: () => clavesDe(usePanelFijadas.getState()),
  activa: () => usePanelFijadas.getState().activa,
  activar: p => usePanelFijadas.getState().activar(p),
  enVentana: () => usePanelFijadas.getState().enVentana,
  mover: (clave, destino, indice) => usePanelFijadas.getState().moverAVentana(clave, destino, indice),
  propia: () => propia,
  suscribir: f => usePanelFijadas.subscribe((st, antes) => { if (st.enVentana !== antes.enVentana) f(st.enVentana, antes.enVentana) }),
})

/** Las pestañas que viven en una ventana aparte. */
export function useFuera() {
  const en = usePanelFijadas(s => s.enVentana)
  return useMemo(() => fueraDe(en), [en])
}

/** ¿Todas las pestañas del panel están en ventanas aparte? Entonces la columna se cierra sola (1 oct 2026). */
export function useTodasFuera() {
  const fuera = useFuera()
  const orden = usePanelFijadas(s => s.orden)
  const taller = usePanelFijadas(s => s.taller)
  return todasFuera(todasLasClaves(orden, taller), fuera)
}
