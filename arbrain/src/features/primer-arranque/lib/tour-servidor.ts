/**
 * El tour de bienvenida del lado del servidor (1 nov 2026): lee el guion editable de la copia del dueño y su índice de
 * manuales, y guarda lo visto en `primer-arranque.json` (campo `tour`). La lógica vive en lib/tour.ts (pura); aquí solo
 * hay disco. Solo servidor.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { separarRutinas, type ListaRutinas } from '@/lib/rutinas-cliente'
import { GUION_INCORPORADO } from '../textos/tour-guion'
import { guardarPrimerArranque, leerPrimerArranque } from './estado'
import {
  manualesDelIndice, parsearGuion, pausarTour, planTour, saltarTour, siguienteCapitulo, textoCapitulo, textoManuales,
  textoRutinas, tourDe, type Capitulo, type Guion, type Manual, type PlanTour, type RutinaResumen,
} from './tour'

/** Dónde vive el guion editable dentro de la copia (la skill `tour-bienvenida` de la plantilla). */
export const RUTA_GUION = join('.claude', 'skills', 'tour-bienvenida', 'guion.md')
/** El índice de manuales: en la app, `arbrain/cerebro/manuales/`; con el prompt de instalación, `cerebro/manuales/`. */
const RUTAS_MANUALES = [join('arbrain', 'cerebro', 'manuales', 'README.md'), join('cerebro', 'manuales', 'README.md')]

const raiz = (r?: string) => { if (r) return r; try { return raizWorkspace() } catch { return null } }

/** El guion del dueño si existe y trae capítulos; si no, el incorporado. */
export function leerGuion(r?: string): Guion {
  const base = raiz(r)
  if (base) {
    try {
      const g = parsearGuion(readFileSync(join(base, RUTA_GUION), 'utf8'))
      if (g.capitulos.length) return g
    } catch { /* sin archivo: el incorporado */ }
  }
  return parsearGuion(GUION_INCORPORADO)
}

/** Los manuales del índice vivo; null si no hay índice. */
export function leerManuales(r?: string): Manual[] | null {
  const base = raiz(r)
  if (!base) return null
  for (const rel of RUTAS_MANUALES) {
    const p = join(base, rel)
    if (existsSync(p)) { try { return manualesDelIndice(readFileSync(p, 'utf8')) } catch { return null } }
  }
  return null
}

/**
 * Las rutinas de `GET /schedule` en lo que necesita el capítulo: las tuyas y luego las «De Arbrain» por su nombre (su
 * prompt es para el modelo, no para el dueño), igual que en Taller › Rutinas.
 */
export function resumenRutinas(lista: Partial<ListaRutinas> | null): RutinaResumen[] | null {
  if (!lista || !Array.isArray(lista.tasks)) return null
  const { propias, deArbrain } = separarRutinas({ tasks: lista.tasks, tz: lista.tz, precargadas: lista.precargadas }, Date.now())
  return [...propias, ...deArbrain].map(r => ({ titulo: r.titulo, cuando: r.cuando, activa: r.activa }))
}

/** ¿Qué toca ahora? Nada antes de terminar la bienvenida. */
export function planActual(r?: string): PlanTour | null {
  const e = leerPrimerArranque()
  if (!e.completado) return null
  const g = leerGuion(r)
  return planTour(tourDe(e, g), g)
}

export interface Entrega { capitulo: Capitulo; texto: string; plan: PlanTour | null }

/**
 * Entrega el siguiente capítulo con sus datos vivos y guarda el avance. `rutinas` solo se pide si el capítulo las usa
 * (es la única lectura que va al daemon). null si no había nada que entregar.
 */
export async function entregarSiguiente(opciones: { raiz?: string; ahora?: string; rutinas?: () => Promise<RutinaResumen[] | null> } = {}): Promise<Entrega | null> {
  const e = leerPrimerArranque()
  if (!e.completado) return null
  const g = leerGuion(opciones.raiz)
  const r = siguienteCapitulo(tourDe(e, g), g, opciones.ahora ?? new Date().toISOString())
  if (!r.capitulo) { guardarPrimerArranque({ tour: r.estado }); return null }
  const c = r.capitulo
  const manuales = c.texto.includes('{{manuales}}') ? textoManuales(leerManuales(opciones.raiz)) : undefined
  const rutinas = c.texto.includes('{{rutinas}}') ? textoRutinas(opciones.rutinas ? await opciones.rutinas().catch(() => null) : null) : undefined
  const texto = textoCapitulo(c, { manuales, rutinas, nombre: e.nombre }, r)
  guardarPrimerArranque({ tour: r.estado })
  return { capitulo: c, texto, plan: planTour(r.estado, g) }
}

export function pausar(r?: string): PlanTour | null {
  const e = leerPrimerArranque()
  const g = leerGuion(r)
  const t = pausarTour(tourDe(e, g))
  guardarPrimerArranque({ tour: t })
  return planTour(t, g)
}

/** Saltar cuenta como visto (también las novedades). */
export function saltar(r?: string, ahora = new Date().toISOString()): PlanTour | null {
  const e = leerPrimerArranque()
  const g = leerGuion(r)
  const t = saltarTour(tourDe(e, g), g, ahora)
  guardarPrimerArranque({ tour: t })
  return planTour(t, g)
}
