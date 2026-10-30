/**
 * QUÉ BLOQUES DE UN DOCUMENTO SE LEEN (7 oct 2026, «Escuchar» en las pestañas del panel).
 *
 * El agente que recorre el DOM (lector-agente.ts) ya dejó fuera lo que se reconoce por su sitio en la página
 * (menús, pies de lámina, código, ocultos). Aquí se aplica lo que solo se ve con el documento entero:
 *
 *  · REPETIDOS: un texto corto que sale tres o más veces («Pergamino · Cerebro artificial · 3/10» al pie de
 *    cada lámina) no se lee; los números cuentan como el mismo texto si lo demás es sustancioso (12 letras o más:
 *    «Paso 1», «Paso 2», «Paso 3» son contenido). Un pie se oye una vez o ninguna. Los encabezados no cuentan.
 *  · Las reglas del chat (lector-filtro.ts): fuentes al final, tablas y párrafos que son solo una URL.
 *
 * PURO, sin DOM: testeable en node.
 */
import { filtrarBloques } from '@/features/chat/lib/lector-filtro'

export interface BloqueCrudo {
  /** textContent del bloque, tal cual: los offsets del resaltado son contra este texto */
  t: string
  tabla?: boolean
  enc?: boolean
}

const MAX_REPETIDO = 140
const VECES_REPETIDO = 3

const MIN_LETRAS = 12

const clave = (t: string) => {
  const base = t.toLowerCase().replace(/\s+/g, ' ').trim()
  return (base.match(/\p{L}/gu) ?? []).length >= MIN_LETRAS ? base.replace(/\d+/g, '#') : base
}

/** Índices (en `crudos`) de los bloques que se leen, en orden. */
export function seleccionarBloques(crudos: BloqueCrudo[]): number[] {
  const cuenta = new Map<string, number>()
  const claves = crudos.map(b => (b.t.length <= MAX_REPETIDO && !b.enc ? clave(b.t) : ''))
  for (const k of claves) if (k) cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  const candidatos: number[] = []
  crudos.forEach((_, i) => { if (!claves[i] || (cuenta.get(claves[i]) ?? 0) < VECES_REPETIDO) candidatos.push(i) })
  return filtrarBloques(candidatos.map(i => ({ texto: crudos[i].t.replace(/\s+/g, ' ').trim(), enTabla: !!crudos[i].tabla, esEncabezado: !!crudos[i].enc })))
    .map(k => candidatos[k])
}
