/**
 * El tablero de agentes, agrupado por la conversación que los lanzó (29 oct 2026). Puro, sin React ni red.
 *
 * Daniel (29 oct, Taller › Agentes): «antes en una version antigua yo ya categorizaba los subagentes por conversaciones,
 * y eso se perdio, recupera esa logica adaptada a esta ui quiero ver separados los grupos de subagentes». La lógica
 * vieja (`internas-por-conversacion.ts`, 1 y 3 oct) agrupaba por `origen`; la ronda 3 del 27 oct la cambió por grupos de
 * estado. Aquí vuelve sobre el MISMO tablero (`armarTablero`): las mismas filas y la misma cuenta, otra forma de
 * juntarlas. Nada cambia de número: un grupo suma exactamente sus renglones.
 *
 *  · Un grupo por conversación de origen (`sdk:<id>` y `<id>` son la misma). La que Daniel tiene abierta va primero y
 *    se marca; luego las que tienen algo vivo; a igualdad, la de actividad más reciente. «Sin conversación» (crons,
 *    sesiones abiertas a mano, registros viejos) siempre al final: no se puede abrir.
 *  · Dentro de cada grupo, por estado: trabajando, te espera, no pudo terminar, se detuvo, listo; a igualdad, lo más
 *    nuevo primero (el orden que ya trae cada columna).
 *  · Resumen en una línea («2 trabajando · 1 te espera · 1 listo») y una línea de tiempo mínima: un carril por agente,
 *    de cuándo empezó a cuándo dio su última señal (o ahora, si sigue abierto). Responde «¿esta conversación sigue
 *    moviendo algo, desde cuándo, y se pisan?» sin abrir nada.
 *  · Plegado por omisión: un grupo que no es el abierto y no tiene nada que hacer (solo listos) se pliega.
 */
import { ORDEN_COLUMNAS, duracion, type Columna, type FilaTablero, type Tablero } from './tablero-modelo'

/** Orden de lectura dentro de un grupo (Daniel, 29 oct: «trabajando, te espera, falló, listo»). */
export const ORDEN_EN_GRUPO: Columna[] = ['trabajando', 'te-espera', 'falló', 'murió', 'listo']
const PESO = Object.fromEntries(ORDEN_EN_GRUPO.map((c, i) => [c, i])) as Record<Columna, number>

export const sinPrefijo = (id: string | null | undefined) => (id ?? '').replace(/^sdk:/, '')

export type ParteResumen = 'trabajando' | 'te-espera' | 'sin-terminar' | 'listo'
export interface Tramo {
  /** Clave del renglón (`tipo` + `id`), la misma que usa la lista: así un tramo y su renglón se resaltan juntos. */
  clave: string; nombre: string; columna: Columna
  /** Posición y ancho en la ventana del grupo, de 0 a 1. */
  x: number; ancho: number
  /** Sigue abierto: su tramo llega hasta ahora. */
  abierto: boolean
}
export interface GrupoConversacion {
  /** Id de la conversación sin `sdk:`; '' = sin conversación. */
  conversacion: string
  activa: boolean
  filas: FilaTablero[]
  cuenta: { trabajando: number; teEspera: number; sinTerminar: number; listos: number }
  resumen: { parte: ParteResumen; n: number; texto: string }[]
  /** Trabaja o te pregunta algo ahora. */
  vivo: boolean
  /** Hay algo que te toca (pregunta o no pudo terminar). */
  pide: boolean
  /** Último hecho medido del grupo (ms): ordena los grupos. */
  reciente: number
  /** La línea de tiempo: desde el primer arranque del grupo hasta ahora. */
  linea: { desde: number; hasta: number; tramos: Tramo[]; ocultos: number; titulo: string; escala: string }
  /** Cómo empieza: plegado si no es el abierto y no tiene nada vivo ni pendiente. */
  plegadoInicial: boolean
}

export const claveFila = (f: Pick<FilaTablero, 'tipo' | 'id'>) => `${f.tipo}${f.id}`
/** Máximo de carriles en la línea de tiempo: más no se leen a 520 px. Los demás se cuentan («+3»). */
export const MAX_CARRILES = 6
/** Ventana mínima: un grupo de un solo minuto no estira su tramo a todo el ancho como si llevara horas. */
export const VENTANA_MIN_MS = 10 * 60_000

export function resumenGrupo(c: GrupoConversacion['cuenta']): GrupoConversacion['resumen'] {
  const partes: { parte: ParteResumen; n: number; texto: (n: number) => string }[] = [
    { parte: 'trabajando', n: c.trabajando, texto: n => `${n} trabajando` },
    { parte: 'te-espera', n: c.teEspera, texto: n => `${n} ${n === 1 ? 'te espera' : 'te esperan'}` },
    { parte: 'sin-terminar', n: c.sinTerminar, texto: n => `${n} sin terminar` },
    { parte: 'listo', n: c.listos, texto: n => `${n} ${n === 1 ? 'listo' : 'listos'}` },
  ]
  return partes.filter(p => p.n).map(p => ({ parte: p.parte, n: p.n, texto: p.texto(p.n) }))
}

const abierta = (f: FilaTablero) => f.columna === 'trabajando' || f.columna === 'te-espera'

export function lineaDeTiempo(filas: FilaTablero[], ahora: number): GrupoConversacion['linea'] {
  const visibles = filas.slice(0, MAX_CARRILES)
  const fin = (f: FilaTablero) => abierta(f) ? ahora : Math.max(f.desde, f.fin)
  const desde = Math.min(ahora - VENTANA_MIN_MS, ...filas.map(f => Math.min(f.desde, fin(f))))
  const hasta = ahora, total = Math.max(1, hasta - desde)
  const tramos = visibles.map(f => {
    const a = Math.max(desde, Math.min(f.desde, fin(f))), b = Math.min(hasta, fin(f))
    const x = (a - desde) / total
    // Un tramo de segundos sigue viéndose: mínimo 3 % del ancho, sin salirse por la derecha.
    const ancho = Math.min(1 - x, Math.max(0.03, (b - a) / total))
    return { clave: claveFila(f), nombre: f.nombre, columna: f.columna, x: Math.min(x, 0.97), ancho, abierto: abierta(f) }
  })
  return { desde, hasta, tramos, ocultos: filas.length - visibles.length, escala: `hace ${duracion(hasta - desde)}`,
    titulo: `Desde hace ${duracion(hasta - desde)} hasta ahora (la raya de la derecha) · un carril por agente: lleno = trabajando, contorno = te espera, punteado = sin terminar, gris = listo` }
}

/**
 * Los renglones visibles del tablero (las cinco columnas), por conversación. «Más actividad» (comandos, tareas rápidas,
 * anteriores) no entra: sigue en su pliegue único. `activa` = la conversación abierta en el chat (o null).
 */
export function agruparPorConversacion(t: Tablero, { activa = null, ahora = Date.now() }: { activa?: string | null; ahora?: number } = {}): GrupoConversacion[] {
  const por = new Map<string, FilaTablero[]>()
  for (const c of ORDEN_COLUMNAS) for (const f of t[c]) {
    const k = sinPrefijo(f.origen)
    por.set(k, [...(por.get(k) ?? []), f])
  }
  const abiertaId = sinPrefijo(activa)
  const grupos: GrupoConversacion[] = [...por].map(([conversacion, lista]) => {
    // Estable: dentro de una misma columna conserva el orden del tablero (lo más nuevo primero).
    const filas = lista.map((f, i) => ({ f, i })).sort((a, b) => PESO[a.f.columna] - PESO[b.f.columna] || a.i - b.i).map(x => x.f)
    const n = (c: Columna) => filas.filter(f => f.columna === c).length
    const cuenta = { trabajando: n('trabajando'), teEspera: n('te-espera'), sinTerminar: n('falló') + n('murió'), listos: n('listo') }
    const esActiva = !!abiertaId && conversacion === abiertaId
    const vivo = cuenta.trabajando + cuenta.teEspera > 0
    const pide = cuenta.teEspera + cuenta.sinTerminar > 0
    return {
      conversacion, activa: esActiva, filas, cuenta, resumen: resumenGrupo(cuenta), vivo, pide,
      reciente: Math.max(0, ...filas.map(f => abierta(f) ? ahora : Math.max(f.fin, f.desde))),
      linea: lineaDeTiempo(filas, ahora),
      plegadoInicial: !esActiva && !vivo && !pide,
    }
  })
  grupos.sort((a, b) => Number(b.activa) - Number(a.activa) || Number(a.conversacion === '') - Number(b.conversacion === '')
    || Number(b.vivo) - Number(a.vivo) || Number(b.pide) - Number(a.pide) || b.reciente - a.reciente)
  return grupos
}
