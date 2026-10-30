/**
 * Frontmatter de un documento y vista previa por destino (3 oct 2026).
 *
 * `destino:` dice dónde va a vivir el texto, y el panel lo enseña «así se verá» ahí. Hoy existe
 * feed-sfc (post del feed de SaaS Factory). Para sumar otro destino (youtube-miniatura, whatsapp,
 * correo): agregarlo a DESTINOS con su adaptador y su componente en Documento.tsx (PREVIAS).
 */
export type DestinoDocumento = 'feed-sfc'
export const DESTINOS: Record<DestinoDocumento, { nombre: string }> = {
  'feed-sfc': { nombre: 'Feed de SaaS Factory' },
}
export const esDestino = (d: string | undefined): d is DestinoDocumento => !!d && d in DESTINOS

/** `---\nclave: valor\n---` al inicio. Solo pares simples (es lo que escribimos a mano). */
export function partirFrontmatter(texto: string): { datos: Record<string, string>; cuerpo: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(texto)
  if (!m) return { datos: {}, cuerpo: texto }
  const datos: Record<string, string> = {}
  for (const linea of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(linea)
    if (kv) datos[kv[1].toLowerCase()] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return { datos, cuerpo: texto.slice(m[0].length) }
}

export interface PostFeed { titulo: string; contenido: string; categoria: { nombre: string; emoji: string } }

/** Categorías reales del feed (tabla categories de SFC, 3 oct 2026). */
const CATEGORIAS: Record<string, string> = { general: '💬', logros: '🏆', anuncios: '📢', presentate: '🤝', ayuda: '🙋', videollamadas: '🎬', 'feedback v2': '🦾' }

/** Del borrador al post: título de `titulo:` o de la línea «**Título:** …»; el cuerpo es lo que sigue
 *  al primer `---` (lo de arriba son notas para Daniel) o, si no hay, todo menos el `# encabezado`. */
export function postDelFeed(datos: Record<string, string>, cuerpo: string): PostFeed {
  const lineaTitulo = /^\s*\*\*T[ií]tulo:?\*\*:?\s*(.+?)\s*$/im
  let contenido = cuerpo
  const hr = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m.exec(cuerpo)
  if (hr) contenido = cuerpo.slice(hr.index + hr[0].length)
  else contenido = cuerpo.replace(/^\s*#\s+.*$/m, '')
  const titulo = datos.titulo || lineaTitulo.exec(contenido)?.[1] || lineaTitulo.exec(cuerpo)?.[1] || /^\s*#\s+(.+)$/m.exec(cuerpo)?.[1] || ''
  contenido = contenido.replace(lineaTitulo, '').trim()
  const nombre = (datos.categoria || 'ANUNCIOS').trim()
  return { titulo: titulo.replace(/\*\*/g, ''), contenido, categoria: { nombre, emoji: CATEGORIAS[nombre.toLowerCase()] ?? '📢' } }
}

/** Párrafos (línea en blanco) con sus saltos de línea y **negritas**: así llega al editor del feed. */
export type Trozo = { texto: string; negrita?: boolean } | { salto: true }
export function parrafos(contenido: string): Trozo[][] {
  return contenido.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    const out: Trozo[] = []
    p.split('\n').forEach((linea, i) => {
      if (i) out.push({ salto: true })
      linea.split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach(t => out.push(t.startsWith('**') && t.endsWith('**') && t.length > 4 ? { texto: t.slice(2, -2), negrita: true } : { texto: t }))
    })
    return out
  })
}

/** Lo que enseña la tarjeta del feed: todo en una corrida (el feed junta párrafos y quita saltos). */
export const enUnaLinea = (contenido: string) => contenido.replace(/\*\*/g, '').replace(/\s*\n\s*/g, ' ').trim()
