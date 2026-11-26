/**
 * Tu negocio › El pulso con alma (15 nov 2026). Daniel: «lo bonito de esta versión 16 puedes meterlo a tu negocio, e
 * igualmente manteniendo la calidad» y «hacerlo dinámico como el mapa vivo… y al darle clic me abre la parte de venta,
 * finanzas, etc.». Un solo lugar por cosa: Tu negocio dice CÓMO VA (la realidad viva); el lienzo, A DÓNDE VOY.
 *
 * Aquí no nace nada. Cada órgano se lee con la MISMA cuenta que el cartel del mapa v16 (`canvas/islas/bloques/cartel.ts ›
 * datosDelCartel`) sobre la MISMA receta de su isla (`docs/builds/mapa-v16/islas/<organo>/receta.json`): su color y su
 * ícono, su número (el de El pulso, el mismo que pinta la tarjeta), su estado «en calma / duele», cuántas decisiones de la
 * bandeja declaran ese órgano, la curva de su serie del BI y su meta contra la realidad (solo si la meta está escrita en su
 * fuente; si no, el hueco «sin meta · ponla tú»). Editar la meta o la serie de un órgano = editar su receta: el mapa y este
 * panel cambian juntos.
 *
 * Sin receta (la copia del alumno, o el archivo no se pudo leer) el órgano sigue vivo con lo que sí hay: su número, su
 * estado y su hueco de meta. Puro (tests/negocio/pulso-vivo.test.ts).
 */
import { datosDelCartel, IDENTIDAD, type DatosCartelOrgano, type IslaMin } from '@/features/canvas/islas/bloques/cartel'
import { prepararIsla } from '@/features/canvas/islas/modelo'
import { dePulso, type LecturaFuente } from '@/features/canvas/islas/fuentes'
import type { Receta } from '@/features/canvas/islas/receta'
import { ORGANOS, type Organo, type Pulso } from './pulso'

/** La receta de la isla de cada órgano en el mapa v16 (relativa a la raíz del cerebro). */
export const RECETA_ORGANO: Readonly<Record<Organo, string>> = Object.fromEntries(
  ORGANOS.map(o => [o, `docs/builds/mapa-v16/islas/${o}/receta.json`]),
) as Record<Organo, string>

/** La URL que la sirve (la misma ruta que relee el lienzo: `/api/canvas/receta`). */
export const urlReceta = (o: Organo) => `/api/canvas/receta?liga=${encodeURIComponent(`doc:${RECETA_ORGANO[o]}`)}`

/** El órgano sin receta: solo sabe quién es (su número, su estado y su hueco de meta salen igual). */
const sinReceta = (o: Organo): IslaMin => ({ receta: { organo: o, titulo: o } as unknown as Receta, bloques: [] })

/** La isla del órgano a partir de lo que respondió `/api/canvas/receta`. Si no es la suya o no se lee, la mínima. */
export function islaDeReceta(o: Organo, respuesta: unknown): IslaMin {
  const r = respuesta && typeof respuesta === 'object' ? (respuesta as { receta?: unknown }).receta : null
  if (!r) return sinReceta(o)
  const l = prepararIsla(r)
  if (!l.ok || l.isla.receta.organo !== o) return sinReceta(o)
  return { receta: l.isla.receta, bloques: l.isla.bloques }
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/**
 * Las fuentes que el órgano lee además de su pulso (que ya trae el panel): su bandeja, la serie del BI de su meta y la
 * realidad que su receta declare. Nombres del catálogo de `canvas/islas/fuentes.ts`.
 */
export function fuentesDeOrgano(o: Organo, isla: IslaMin): string[] {
  const fs = new Set<string>([`bandeja:${o}`])
  const me = isla.bloques.find(b => b.ok && b.tipo === 'meta-error')
  const p = me && obj(me.p) ? me.p : null
  if (p && obj(p.serie) && typeof p.serie.consulta === 'string') fs.add(`bi:${p.serie.consulta}`)
  if (p && obj(p.realidad) && typeof p.realidad.fuente === 'string' && !p.realidad.fuente.startsWith('pulso:')) fs.add(p.realidad.fuente)
  if (p && obj(p.aparte) && typeof p.aparte.fuente === 'string') fs.add(p.aparte.fuente)
  const c = isla.receta.lejos?.cifra?.fuente
  if (c && !c.startsWith('pulso:')) fs.add(c)
  return [...fs]
}

/** Lo vivo del órgano: el cartel del mapa v16 con el pulso que ya pinta el panel (el mismo número, nunca otro). */
export function vivoDe(pulso: Pulso, isla: IslaMin, leer: (f: string) => LecturaFuente | undefined): DatosCartelOrgano {
  const propio: LecturaFuente = { ...dePulso(pulso), fecha: null }
  const d = datosDelCartel(isla, f => (f === `pulso:${pulso.organo}` ? propio : leer(f)))
  if (d && d.forma === 'organo') return d
  // Una receta que pida otra forma de lejos no le quita su identidad al órgano en el panel.
  return datosDelCartel(sinReceta(pulso.organo), f => (f === `pulso:${pulso.organo}` ? propio : leer(f))) as DatosCartelOrgano
}

export { IDENTIDAD }

/**
 * Una cifra en texto, partida para contarla: «$354,912 MXN» → { antes: '$', n: 354912, decimales: 0, despues: ' MXN' }.
 * null si no empieza con un número legible (se pinta tal cual, sin animar).
 */
export function partirCifra(s: string): { antes: string; n: number; decimales: number; agrupa: boolean; despues: string } | null {
  const m = /^([^\d-]*)(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)(.*)$/.exec(s)
  if (!m) return null
  const limpio = m[2].replace(/,/g, '')
  const n = Number(limpio)
  if (!Number.isFinite(n)) return null
  return { antes: m[1], n, decimales: limpio.includes('.') ? limpio.split('.')[1].length : 0, agrupa: m[2].includes(',') || Math.abs(n) < 1000, despues: m[3] }
}

/** La cifra partida, de vuelta en texto con el número `n` (mismo formato que la fuente: es-MX con comas). */
export function unirCifra(c: { antes: string; decimales: number; agrupa: boolean; despues: string }, n: number): string {
  return `${c.antes}${n.toLocaleString('es-MX', { minimumFractionDigits: c.decimales, maximumFractionDigits: c.decimales, useGrouping: c.agrupa })}${c.despues}`
}

/** «7.9 %», «42 %»: la meta contra la realidad, como la dice el cartel. */
export const porcentaje = (f: number) => `${f < 0.1 ? (Math.round(f * 1000) / 10).toLocaleString('es-MX') : Math.round(f * 100)} %`
