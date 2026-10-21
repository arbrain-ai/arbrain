/**
 * Vista «negocio»: el libro del negocio en tarjetas (avatar, oferta, embudo y
 * sistema). Cada tarjeta lee SU canónico del repo del Studio (el índice es
 * docs/business-os/libro-del-negocio.md) y su fecha real de revisión (git, o
 * la modificación local si es más nueva). Nunca se resume de memoria.
 */
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { PROJECT_ROOT } from '../config.js'
import { instalacionOriginal } from '../dueno.js'

const run = promisify(execFile)
export const SECCIONES = ['avatar', 'oferta', 'embudo', 'sistema'] as const
export type Seccion = typeof SECCIONES[number]

interface Fuente { etiqueta: string; ruta: string; ancla?: RegExp; sinTitular?: boolean }
/** Página del lienzo de la sección Sistema: vive en la configuración de la instalación original (no viaja). */
const LIENZO_SISTEMA = instalacionOriginal().lienzo_sistema_id ?? ''

const LIBRO: Record<Seccion, { titulo: string; fuentes: Fuente[]; lienzo?: { paginaId: string; nombre: string } }> = {
  avatar: { titulo: 'Avatar', fuentes: [{ etiqueta: 'Avatar (LT + HT)', ruta: '.claude/skills/arquitectura-marketing/references/avatar.md', ancla: /emprendedor que aplica IA/i }] },
  oferta: { titulo: 'Oferta', fuentes: [
    { etiqueta: 'Low ticket (comunidad)', ruta: '.claude/skills/arquitectura-marketing/references/oferta.md', ancla: /«Deja a la IA trabajando por ti»/ },
    { etiqueta: 'High ticket · one-pager', ruta: 'docs/business-os/lanzamiento-ht-15-oct/claridad/one-pager.md', ancla: /^En 90 días/ },
    { etiqueta: 'High ticket · blueprint 12 semanas', ruta: 'docs/business-os/lanzamiento-ht-15-oct/claridad/blueprint-programa.md', ancla: /^La meta del fundador/ },
    { etiqueta: 'High ticket · lanzamiento 15 oct', ruta: '.claude/memory/project/lanzamiento-ht-15-oct-2026.md', ancla: /^Precio [\d,.]+ y (tope|cupo)/i },
  ] },
  embudo: { titulo: 'Embudo', fuentes: [{ etiqueta: 'Nuestro embudo', ruta: '.claude/skills/ideal-funnels/references/nuestro-embudo/ideal.md', ancla: /^Distribución por/ }] },
  sistema: { titulo: 'Sistema', fuentes: [{ etiqueta: 'Mapa del sistema', ruta: 'docs/business-os/system-map.md', sinTitular: true }], ...(LIENZO_SISTEMA ? { lienzo: { paginaId: LIENZO_SISTEMA, nombre: 'Claridad' } } : {}) },
}

/** Rutas canónicas de cada tarjeta (las que lee `libroDelNegocio`). */
export const rutasDe = (seccion: Seccion): string[] => LIBRO[seccion].fuentes.map(f => f.ruta)

/** Una revisión con más de 21 días se marca vieja: el dueño lo ve en la tarjeta. */
export const DIAS_VIEJO = 21

const META = /anti-?drift|vista comprimida|este archivo|fuente de verdad|entrada (única|operativa)|la memoria conserva/i

/** Resumen honesto: el título y el primer párrafo útil del documento, sin markdown.
 *  Trabaja por PÁRRAFOS: una nota sobre el documento mismo se salta completa,
 *  nunca a media frase. */
export function resumir(md: string, max = 360): { titulo: string; resumen: string } {
  const lineas = md.split('\n')
  const iH1 = lineas.findIndex(l => /^#\s/.test(l))
  const h1 = iH1 >= 0 ? lineas[iH1].replace(/^#\s+/, '').trim() : ''
  const parrafos: string[] = []
  let actual: string[] = []
  const cerrar = () => { if (actual.length) parrafos.push(actual.join(' ')); actual = [] }
  for (const l of lineas.slice(iH1 + 1)) {
    const t = l.trim()
    if (!t || /^#{1,6}\s/.test(t)) { cerrar(); if (/^#{1,6}\s/.test(t)) parrafos.push(t.replace(/^#+\s+/, '') + '.'); continue }
    if (/^(\||```|---|<)/.test(t)) { cerrar(); continue }
    actual.push(t)
  }
  cerrar()
  const utiles = parrafos.filter(p => !META.test(p))
  let texto = ''
  // Párrafos completos hasta tener sustancia (~120 caracteres); el tope corta después.
  for (const p of utiles) { texto += (texto ? ' ' : '') + p; if (texto.length > 120) break }
  const limpio = texto.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>]+/g, '').replace(/(^|\s)-\s+/g, '$1').replace(/\s+/g, ' ').trim()
  return { titulo: h1.replace(/[*_`]/g, ''), resumen: limpio.length > max ? limpio.slice(0, max).replace(/\s\S*$/, '') + '…' : limpio }
}

const limpiar = (t: string) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>]+/g, '').replace(/\s+/g, ' ').trim()
const frases = (t: string) => limpiar(t).split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ«¿0-9])/)

/** La respuesta en una línea («¿cuál es mi oferta?»), sacada del canónico sin
 *  inventar: la sección «Promesa» si existe; si no, la primera frase con una
 *  cita «…» (el copy aprobado) que no sea un registro de firma; si no, la que
 *  habla de precio o cupo; si no, la primera frase del resumen. */
/** Une las líneas de un mismo párrafo: una frase partida a mano en dos líneas del markdown no se corta a media frase. */
function parrafosDe(lineas: string[]): string[] {
  const out: string[] = []
  let sigue = false
  for (const l of lineas) {
    const t = l.trim()
    if (!t || /^(#|[-*]\s|\||>|```)/.test(t)) { out.push(l); sigue = false; continue }
    if (sigue) out[out.length - 1] += ' ' + t
    else { out.push(l); sigue = true }
  }
  return out
}

export function titular(md: string, resumen: string, ancla?: RegExp): string {
  const lineas = md.split('\n')
  // Ancla declarada en el libro: la frase exacta del canónico (textual). Si el
  // documento cambió y ya no aparece, se cae a la regla general.
  if (ancla) {
    for (const l of parrafosDe(lineas)) {
      const limpia = limpiar(l.replace(/^#+\s+/, '').replace(/^[-*]\s+/, ''))
      const f = limpia.includes(':') && /^#/.test(l.trim()) ? [limpia.slice(limpia.indexOf(':') + 1).trim()] : frases(limpia)
      const hit = f.find(x => ancla.test(x))
      if (hit) return hit.slice(/:\s*«/.test(hit) ? hit.indexOf('«') : 0).slice(0, 220)
    }
  }
  const iPromesa = lineas.findIndex(l => /^#{2,4}\s.*promesa/i.test(l))
  if (iPromesa >= 0) {
    const p = lineas.slice(iPromesa + 1).find(l => l.trim() && !/^#/.test(l.trim()))
    if (p) return frases(p)[0].slice(0, 220)
  }
  const cuerpo = lineas.slice(0, 80).filter(l => !/^#/.test(l.trim()) && !META.test(l)).join(' ')
  const todas = frases(cuerpo)
  const cita = todas.find(f => /«[^»]{6,}»/.test(f) && !/firmado|dijo|corrección|sobrio/i.test(f))
  // «…fuente del About: «Deja a la IA…»» → el titular arranca en la cita, sin el preámbulo.
  if (cita) return cita.slice(/:\s*«/.test(cita) ? cita.indexOf('«') : 0).slice(0, 220)
  const precio = todas.find(f => /precio|cupo|usd|\$\s?\d/i.test(f) && f.length < 220)
  if (precio) return precio
  return frases(resumen)[0]?.slice(0, 220) ?? ''
}

async function fechaRevision(ruta: string): Promise<{ fecha: string | null; fuente: 'git' | 'local' | null }> {
  let git: string | null = null
  try { git = (await run('git', ['-C', PROJECT_ROOT, 'log', '-1', '--format=%cI', '--', ruta], { timeout: 8000 })).stdout.trim() || null } catch { /* sin git */ }
  let local: string | null = null
  try { local = (await stat(join(PROJECT_ROOT, ruta))).mtime.toISOString() } catch { /* no existe */ }
  if (local && (!git || Date.parse(local) - Date.parse(git) > 3600_000)) return { fecha: local, fuente: 'local' }
  return { fecha: git, fuente: git ? 'git' : null }
}

export interface Tarjeta {
  seccion: Seccion; titulo: string
  fuentes: { etiqueta: string; ruta: string; titulo: string; titular: string; resumen: string; revisado: string | null; origenFecha: 'git' | 'local' | null; viejo: boolean; existe: boolean; texto?: string }[]
  lienzo?: { paginaId: string; nombre: string }
}

export async function libroDelNegocio(opts: { conTexto?: boolean; ahora?: number } = {}): Promise<{ tarjetas: Tarjeta[]; indice: string; leidoEn: string }> {
  const ahora = opts.ahora ?? Date.now()
  const tarjetas = await Promise.all(SECCIONES.map(async seccion => {
    const def = LIBRO[seccion]
    const fuentes = await Promise.all(def.fuentes.map(async f => {
      let md = ''
      try { md = await readFile(join(PROJECT_ROOT, f.ruta), 'utf8') } catch { /* canónico ausente */ }
      const { titulo, resumen } = resumir(md)
      const { fecha, fuente } = await fechaRevision(f.ruta)
      return { etiqueta: f.etiqueta, ruta: f.ruta, titulo, titular: md && !f.sinTitular ? titular(md, resumen, f.ancla) : '', resumen, revisado: fecha, origenFecha: fuente, existe: !!md,
        viejo: !fecha || ahora - Date.parse(fecha) > DIAS_VIEJO * 86400_000, ...(opts.conTexto ? { texto: md.slice(0, 60_000) } : {}) }
    }))
    return { seccion, titulo: def.titulo, fuentes, ...(def.lienzo ? { lienzo: def.lienzo } : {}) }
  }))
  return { tarjetas, indice: 'docs/business-os/libro-del-negocio.md', leidoEn: new Date(ahora).toISOString() }
}
