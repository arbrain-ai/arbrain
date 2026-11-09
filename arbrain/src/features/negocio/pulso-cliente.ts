/**
 * Tu negocio › El pulso en la edición del alumno (8 nov 2026, Daniel: «este mismo sistema les compartiré a mis alumnos»).
 * Los mismos seis órganos que el pulso del autor, como motor vacío: cada uno enciende su número cuando el dueño conecta su
 * fuente, y mientras tanto dice «Conecta tu fuente» y qué la conectaría. Nada del negocio del autor (cohorte, Polar,
 * finanzas con sus cuentas) viaja ni se pide aquí:
 *
 * - Marketing, venta, entrega y finanzas: la consulta genérica de Business Intelligence que les toca (generico.ts ›
 *   CONSULTA_DEL_ORGANO), leída de las fuentes de `bi-fuentes.json`. La cifra es el total de los últimos 30 días y el detalle
 *   dice cómo cerró el último día contra su corredor de lo normal (la misma lectura del panel de BI).
 * - Mente del comprador: la voz del cliente, igual que en el autor (`voz-del-cliente.json`).
 * - Sistemas: sus rutinas (las del daemon del alumno, `/api/rutinas`).
 * Lógica pura (sin React ni fs): la usan la vista y node:test.
 */
import { cifraDe, consultaEn, esDinero, palabraDe, type Consulta } from '@/features/bi/catalogo'
import { CONSULTA_DEL_ORGANO } from '@/features/bi/generico'
import { leer, type RespuestaConsulta } from '@/features/bi/modelo'
import type { ListaRutinas } from '@/lib/rutinas-cliente'
import type { LecturaDe, Organo, Pulso } from './pulso'

/** Las preguntas que en el pulso del autor hablan de su programa, dichas para cualquier negocio. */
export const PREGUNTA_CLIENTE: Partial<Record<Organo, string>> = { entrega: '¿Le cumples a tus clientes?' }

const VENTANA = 30

/** Un órgano que se lee de una consulta de BI. `catalogo` undefined = el panel de BI todavía no respondió. */
export function pulsoDeConsulta(organo: Organo, catalogo: Consulta[] | undefined, l: LecturaDe<RespuestaConsulta>, extra?: { c?: Consulta | null; l: LecturaDe<RespuestaConsulta> }): Pulso {
  const pregunta = PREGUNTA_CLIENTE[organo]
  const base = { organo, abre: 'bi' as const, conecta: true, ...(pregunta ? { pregunta } : {}) }
  const id = CONSULTA_DEL_ORGANO[organo]
  if (!catalogo) return { ...base, estado: 'leyendo', fuente: 'Business Intelligence' }
  const c = id ? consultaEn(catalogo, id) : null
  if (!c || c.conectada === false) return { ...base, estado: 'sin-sensor', fuente: 'Sin fuente todavía', falta: c?.falta ?? 'Una fuente que la mida.' }
  if (l.error) return { ...base, estado: 'error', fuente: c.fuente, error: l.error }
  if (!l.data) return { ...base, estado: 'leyendo', fuente: c.fuente }
  const lectura = leer(c, 'linea', VENTANA, l.data.datos)
  const puntos = lectura.puntos ?? []
  const medidos = puntos.filter(p => p.valor !== null)
  if (!medidos.length) return { ...base, estado: 'sin-sensor', fuente: c.fuente, falta: 'La fuente está conectada pero no trae días medidos en los últimos 30: revisa que el archivo esté al día.' }
  const total = medidos.reduce((s, p) => s + (p.valor as number), 0)
  const detalle: string[] = []
  if (lectura.detalle || lectura.frase) detalle.push(estadoEnCorto(c, lectura.estado, medidos[medidos.length - 1].valor as number, lectura.puntos![lectura.puntos!.length - 1].fecha))
  // Finanzas: lo que entró y, si los gastos tienen fuente, lo que salió en la misma ventana.
  if (extra?.c && extra.c.conectada !== false && extra.l.data?.datos.forma === 'serie') {
    const salio = extra.l.data.datos.puntos.slice(-VENTANA).reduce((s, p) => s + (p.valor ?? 0), 0)
    detalle.push(`Salió ${cifraDe(salio, extra.c)}`)
  }
  if (l.data.aviso) detalle.push(l.data.aviso)
  return {
    ...base, estado: 'numero', cifra: cifraDe(total, c),
    unidad: c.id === 'ingresos' ? 'entró en 30 días' : esDinero(c) ? `${c.nombre.toLocaleLowerCase('es')} · 30 días` : `${palabraDe(c, total)} en 30 días`,
    detalle, fuente: c.fuente,
  }
}

/** El último día, en una línea: su cifra y si quedó dentro de lo normal. */
function estadoEnCorto(c: Consulta, estado: string, v: number, fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const cuanto = `${dia}: ${cifraDe(v, c)}${esDinero(c) ? '' : ` ${palabraDe(c, v)}`}`
  if (estado === 'fuera') return `${cuanto}, fuera de lo normal`
  if (estado === 'roza') return `${cuanto}, en el borde de lo normal`
  if (estado === 'aprendiendo') return `${cuanto} · todavía aprende su normal`
  return `${cuanto}, dentro de lo normal`
}

/** Sistemas en la edición del alumno: sus rutinas activas y cuántas salieron bien la última vez. */
export function pulsoSistemasCliente(l: LecturaDe<ListaRutinas>): Pulso {
  const base = { organo: 'sistemas' as const, abre: 'taller' as const, conecta: true, fuente: 'Taller · tus rutinas' }
  if (l.error) return { ...base, estado: 'error', error: l.error }
  if (!l.data) return { ...base, estado: 'leyendo' }
  const activas = (l.data.tasks ?? []).filter(t => t.status === 'active')
  if (!activas.length) return { ...base, estado: 'sin-sensor', falta: 'Una rutina que corra sola: prográmala en Taller › Rutinas (o pídesela a Levy) y aquí se ve si salió bien.' }
  const fallo = (r?: string | null) => !!r && /^error:/i.test(r.trim())
  const corrieron = activas.filter(t => t.last_run)
  const bien = corrieron.filter(t => !fallo(t.last_result)).length
  const fallan = corrieron.length - bien
  const detalle = [`De ${activas.length} ${activas.length === 1 ? 'rutina activa' : 'rutinas activas'}`]
  if (fallan) detalle.push(`${fallan} ${fallan === 1 ? 'falló en su última corrida' : 'fallaron en su última corrida'}`)
  if (activas.length > corrieron.length) detalle.push(`${activas.length - corrieron.length} todavía sin correr`)
  return { ...base, estado: 'numero', cifra: String(bien), unidad: bien === 1 ? 'rutina salió bien' : 'rutinas salieron bien', detalle }
}

/**
 * Mente del comprador en la edición del alumno: las dos piezas salen de lo que escribió en Tu primer día (su oferta y su
 * nicho, su negocio); el nombre es el título del documento y la frase, la primera del primer párrafo. La voz del cliente es
 * la misma ruta que en el autor.
 */
export const FUENTES_COMPRADOR_CLIENTE = {
  avatar: { ruta: '.claude/memory/project/mi-negocio/oferta.md', nombre: /^#\s+(.+)$/m, ancla: /\S/ },
  vehiculo: { ruta: '.claude/memory/project/mi-negocio/negocio.md', nombre: /^#\s+(.+)$/m, ancla: /\S/ },
} as const
export const ETIQUETAS_COMPRADOR_CLIENTE = { avatar: 'Tu oferta y tu nicho', vehiculo: 'Tu negocio' } as const
