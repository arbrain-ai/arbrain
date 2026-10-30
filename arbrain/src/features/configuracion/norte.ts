/**
 * El Norte leído de docs/business-os/norte.md (6 oct 2026). Módulo puro: parte el markdown en visión, misión (clientes ·
 * Daniel · equipo) y principios, cada uno con su fuente («— …» bajo la línea). No inventa: lo que el documento no trae
 * llega vacío, y «Propuesta de Levy, sin fuente» se marca como propuesta.
 */
export interface LineaNorte { texto: string; fuente: string | null; propuesta?: boolean }
export interface Norte {
  borrador: boolean
  vision: LineaNorte | null
  mision: Array<LineaNorte & { quien: string }>
  principios: LineaNorte[]
}

const limpiar = (t: string) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim()
/** Fuente corta: lo de antes del primer « · » (quién y cuándo); el resto vive en el título emergente. */
export const fuenteCorta = (f: string | null) => (f ? f.split(' · ')[0].trim() : null)

function conFuente(linea: string, sig: string | undefined): LineaNorte & { usoSig: boolean } {
  const f = sig?.trim().startsWith('—') ? limpiar(sig.trim().replace(/^—\s*/, '')) : null
  return { texto: limpiar(linea), fuente: f, usoSig: f != null }
}

export function parseNorte(md: string): Norte {
  const lineas = md.split('\n')
  const out: Norte = { borrador: /^>\s*\*\*BORRADOR/im.test(md) || /sin firmar/i.test(lineas.slice(0, 6).join(' ')), vision: null, mision: [], principios: [] }
  let seccion: 'vision' | 'mision' | 'principios' | null = null
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim()
    const h = /^##\s+(.*)/.exec(l)
    if (h) { seccion = /visi[oó]n/i.test(h[1]) ? 'vision' : /misi[oó]n/i.test(h[1]) ? 'mision' : /principio/i.test(h[1]) ? 'principios' : null; continue }
    if (!l || l.startsWith('—') || l.startsWith('>') || l.startsWith('#')) continue
    if (seccion === 'vision' && !out.vision) { const { usoSig, ...v } = conFuente(l, lineas[i + 1]); out.vision = v; if (usoSig) i++ }
    else if (seccion === 'mision') {
      const m = /^\*\*Para\s+(.+?)\.\*\*\s*(.*)$/.exec(l)
      if (!m) continue
      const quien = m[1].replace(/^los\s+/i, '').replace(/^el\s+/i, '')
      const propuesta = /^\*?Propuesta de Levy/i.test(m[2])
      const cuerpo = propuesta ? m[2].replace(/^\*?Propuesta de Levy[^:]*:\*?\s*/i, '') : m[2]
      const { usoSig, ...c } = conFuente(cuerpo, lineas[i + 1])
      out.mision.push({ ...c, quien: quien.charAt(0).toUpperCase() + quien.slice(1), ...(propuesta ? { propuesta, fuente: null } : {}) }); if (usoSig) i++
    } else if (seccion === 'principios') {
      const m = /^\d+\.\s+(.*)$/.exec(l)
      if (!m) continue
      // «frase» — fuente: se parte en el ÚLTIMO « — » para que la cita pueda llevar rayas propias.
      const k = m[1].lastIndexOf(' — ')
      out.principios.push(k > 0 ? { texto: limpiar(m[1].slice(0, k)), fuente: limpiar(m[1].slice(k + 3)) } : { texto: limpiar(m[1]), fuente: null })
    }
  }
  return out
}

/** «revisado hace N días» y si toca revisar (más de 14 días o sin fecha). Puro: recibe `ahora`. */
export const DIAS_REVISAR = 14
export function revisionDe(revisado: string | null, ahora: number): { texto: string; revisar: boolean; dias: number | null } {
  if (!revisado) return { texto: 'sin fecha de revisión', revisar: true, dias: null }
  const dias = Math.max(0, Math.floor((ahora - Date.parse(revisado)) / 86400_000))
  const texto = dias === 0 ? 'revisado hoy' : dias === 1 ? 'revisado ayer' : `revisado hace ${dias} días`
  return { texto, revisar: dias > DIAS_REVISAR, dias }
}

/** El resumen sin repetir el titular que ya va arriba en grande. */
export function resumenSinTitular(resumen: string, titular: string) {
  const r = resumen.trim(), t = titular.trim()
  if (t && r.startsWith(t)) return r.slice(t.length).replace(/^[\s.,;:—-]+/, '')
  return r
}

/** El ancla del libro puede cortar a media frase («emprendedor que aplica IA»): el titular arranca en mayúscula. */
export const mayuscula = (t: string) => (t ? t.charAt(0).toLocaleUpperCase('es') + t.slice(1) : t)

/** Un titular cortado a media frase (el daemon lee una línea del markdown) se completa con su frase del resumen, que viene entera. */
export function completarTitular(titular: string, resumen: string) {
  const t = titular.trim(), i = t ? resumen.indexOf(t) : -1
  if (i < 0 || /[.!?»]$/.test(t)) return t
  const resto = resumen.slice(i + t.length), fin = resto.search(/[.!?](\s|$)/)
  return fin < 0 ? t : (t + resto.slice(0, fin + 1)).trim()
}
