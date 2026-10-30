/**
 * Canvas v4 — gate de DISTINGUIBILIDAD de roles.
 *
 * Nacio de un hallazgo del critico ciego (ronda 2), textual: "declara cinco
 * categorias pero en el lienzo real solo dos se distinguen; disparador vs
 * entregable vs modulo son variaciones de gris tan sutiles que la leyenda
 * promete una taxonomia que el diagrama no demuestra".
 *
 * Es el pecado de este proyecto con otro disfraz: primero fue codificacion sin
 * diccionario; al agregar el diccionario quedo diccionario sin codificacion. Un
 * contrato que promete lo que el motor no entrega.
 *
 * LA REGLA: dos roles se separan por DOS canales, no por uno. Grosor + trazo,
 * o forma + trazo, o color + trazo. Un solo canal —y menos si es el tono de un
 * gris— no sobrevive al zoom alejado ni a una pantalla mala.
 *
 * Esto no se deja a la disciplina de quien edita la paleta: si alguien mañana
 * acerca dos roles, el gate lo reprueba antes del merge.
 */

import type { Role, Theme, EdgeKind } from '../theme/tokens'
import { contrastRatio } from './judge'

export interface RoleClash {
  a: Role
  b: Role
  canales: number
  detalle: string
}

/**
 * ¿Dos colores se distinguen a simple vista?
 *
 * PRIMERA VERSION DE ESTA FUNCION USABA SOLO CONTRASTE WCAG, y estaba mal:
 * el contraste mide LUMINANCIA. Un morado y un rojo de luminancia parecida dan
 * ratio ~1.0 y la funcion los declaraba identicos — cuando cualquier ojo los
 * separa sin esfuerzo. El gate reprobo la paleta por una medida que media lo
 * equivocado, no por un defecto de la paleta.
 *
 * Se distinguen si cambia la LUZ o si cambia el TONO. Son dos canales
 * perceptuales independientes y basta con uno.
 */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(m)) return null
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Matiz en grados (0-360). null para un gris, que no tiene tono. */
function hue(hex: string): number | null {
  const c = parseHex(hex)
  if (!c) return null
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const delta = max - min
  // Saturacion demasiado baja: es un gris, hablar de su tono no significa nada.
  if (delta < 0.08) return null
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  return ((h * 60) + 360) % 360
}

function colorDifiere(a: string, b: string): boolean {
  if (a === b) return false
  // 1.35:1 es donde dos superficies dejan de leerse como "el mismo tono con
  // otra luz" y empiezan a leerse como dos cosas distintas.
  if (contrastRatio(a, b) >= 1.35) return true
  const ha = hue(a), hb = hue(b)
  if (ha == null || hb == null) return false   // uno es gris: solo contaba la luz
  const d = Math.abs(ha - hb)
  // 25 grados es donde el ojo deja de leer "dos versiones del mismo color".
  return Math.min(d, 360 - d) >= 25
}

/**
 * Cuenta en cuantos canales independientes difieren dos roles.
 * Canales: color de borde · grosor · estilo de trazo · relleno · forma (radio).
 */
export function channelsBetween(theme: Theme, a: Role, b: Role): { n: number; detalle: string } {
  const x = theme.roles[a], y = theme.roles[b]
  const diffs: string[] = []
  if (colorDifiere(x.stroke.color, y.stroke.color)) diffs.push('color de borde')
  // Menos de 0.8px de diferencia no se ve; a zoom alejado, menos todavia.
  if (Math.abs(x.stroke.width - y.stroke.width) >= 0.8) diffs.push('grosor')
  if (x.stroke.style !== y.stroke.style) diffs.push('trazo')
  if (colorDifiere(x.fill, y.fill)) diffs.push('relleno')
  if (Math.abs(x.radius - y.radius) >= 8) diffs.push('forma')
  if ((x.shadow ?? false) !== (y.shadow ?? false)) diffs.push('sombra')
  return { n: diffs.length, detalle: diffs.join(' + ') || 'nada' }
}

/**
 * Audita que todos los roles que APARECEN en la leyenda sean distinguibles
 * entre si. `card` queda fuera: es el neutro, no codifica nada y por eso
 * tampoco se explica.
 */
export function auditRoles(theme: Theme, rolesEnLeyenda: Role[]): RoleClash[] {
  const roles = [...new Set(rolesEnLeyenda)].filter(r => r !== 'card')
  const clashes: RoleClash[] = []
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const { n, detalle } = channelsBetween(theme, roles[i], roles[j])
      if (n < 2) clashes.push({ a: roles[i], b: roles[j], canales: n, detalle })
    }
  }
  return clashes
}

/**
 * La misma vara, para las ARISTAS.
 *
 * Nace de un veredicto: un critico ciego comparo este diagrama contra el
 * conectoma y le dio a ESE el unico punto que perdimos — "codifica el ESTADO de
 * cada relacion, una idea mas rica que el codigo de forma". Al copiar la idea
 * habia que copiar tambien lo que la hace funcionar, y de paso lo que a ELLOS
 * les falla: el mismo critico dijo que sus cuatro variantes de morado eran
 * "casi indistinguibles a este tamaño". Un codigo que el ojo no separa no es un
 * codigo, es ruido con leyenda.
 *
 * Por eso dos canales, igual que las cajas. `flujo` queda fuera: es el neutro.
 */
export function auditEdgeKinds(theme: Theme, kinds: EdgeKind[]): EdgeClash[] {
  const usados = [...new Set(kinds)].filter(k => k !== 'flujo')
  const clashes: EdgeClash[] = []
  for (let i = 0; i < usados.length; i++) {
    for (let j = i + 1; j < usados.length; j++) {
      const x = theme.edges[usados[i]], y = theme.edges[usados[j]]
      const diffs: string[] = []
      if (colorDifiere(x.color, y.color)) diffs.push('color')
      if (x.style !== y.style) diffs.push('trazo')
      if (Math.abs(x.width - y.width) >= 0.8) diffs.push('grosor')
      if (diffs.length < 2) {
        clashes.push({ a: usados[i], b: usados[j], canales: diffs.length,
                       detalle: diffs.join(' + ') || 'nada' })
      }
    }
  }
  return clashes
}

export interface EdgeClash { a: EdgeKind; b: EdgeKind; canales: number; detalle: string }
