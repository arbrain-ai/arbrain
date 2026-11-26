/**
 * Las secciones de Contenido por su nombre en la dirección (`/youtube?tab=…`). Los enlaces viejos siguen funcionando:
 * production → Ideas (ahí vive «En producción»), results/contenido → Tu canal, bandeja/comments → Comentarios.
 * 19 nov 2026: también los nombres del menú (inicio, comentarios, downloads); lo desconocido cae en Inicio.
 */
export type SeccionContenido = 'aprender' | 'radar' | 'competidores' | 'ideas' | 'canal' | 'despues' | 'guardados' | 'descargas' | 'inbox'

const ALIAS: [SeccionContenido, string[]][] = [
  ['despues', ['despues', 'ver-despues', 'watch-later']],
  ['guardados', ['guardados', 'saved']],
  ['descargas', ['descargas', 'downloads']],
  ['radar', ['radar', 'intel', 'mercado']],
  ['competidores', ['competidores', 'competencia', 'embudos']],
  ['ideas', ['ideas', 'production']],
  ['canal', ['canal', 'results', 'contenido', 'tu-canal']],
  ['inbox', ['bandeja', 'comments', 'leads', 'comentarios', 'inbox']],
  ['aprender', ['aprender', 'inicio', 'home']],
]

export const pestanaDe = (raw: string): SeccionContenido => ALIAS.find(([, xs]) => xs.includes(raw.toLowerCase()))?.[0] ?? 'aprender'

/** La dirección de cada sección (Comentarios conserva su nombre de siempre, `bandeja`). */
export const tabDe = (id: SeccionContenido): string => (id === 'inbox' ? 'bandeja' : id)
