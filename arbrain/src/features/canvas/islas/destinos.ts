/**
 * Mapa v16 · la LISTA BLANCA de destinos de los botones de una isla (14 nov 2026).
 *
 * Daniel: «un botón que en finanzas me lleve a Polar, o abra otro panel donde sí tengo las finanzas, o la entrega, o la
 * venta, o YouTube Studio» · «a dónde lleva cada botón estoy seguro que lo sabes».
 *
 *   panel:<seccion>   una sección de Arbrain como pestaña del panel (Finanzas, Tu negocio › El pulso, BI, Taller…)
 *   doc:<ruta>        un documento del repo en la vista documento (misma validación que las ligas `doc:` del lienzo)
 *   url:<https…>      un sitio de fuera, SOLO por el opener (`lib/navegador.ts`), nunca `window.open` desde la isla.
 *                     Solo https y solo dominios de esta lista; una URL de Arbrain se abre dentro, como pestaña.
 *   lienzo:<capitulo> volar a un capítulo de la página (id del marco o su título) o, con `lienzo:page:<id>`, abrir otro lienzo
 *
 * Lo que no está aquí se ignora (y se dice en la consola de la isla). Puro (tests/canvas/islas-destinos.test.ts).
 */
import type { MostrarInput, SeccionNegocio, Vista } from '@/features/cabina/model'
import { leerLigaDoc } from '../model/doc'

export type DestinoIsla =
  | { tipo: 'panel'; input: MostrarInput; clave: string }
  | { tipo: 'casa'; casa: 'taller' | 'tareas'; segmento?: 'rutinas'; clave: string }
  | { tipo: 'doc'; ruta: string; fragmento?: string }
  | { tipo: 'url'; url: string }
  | { tipo: 'capitulo'; capitulo: string }
  | { tipo: 'pagina'; paginaId: string }

const negocio = (seccion?: SeccionNegocio): MostrarInput => (seccion ? { vista: 'negocio', seccion } : { vista: 'negocio' })

/**
 * Las secciones que una isla puede abrir, por su nombre en palabras de Daniel. `negocio` y `pulso` son la misma vista:
 * Tu negocio abre en El pulso. Las vistas que necesitan parámetros (documento, lienzo, explorador) no entran aquí: van por
 * `doc:` y `lienzo:`.
 */
export const SECCIONES: Readonly<Record<string, Exclude<DestinoIsla, { tipo: 'doc' | 'url' | 'capitulo' | 'pagina' }>>> = {
  finanzas: { tipo: 'panel', input: { vista: 'finanzas' }, clave: 'finanzas' },
  bi: { tipo: 'panel', input: { vista: 'bi' }, clave: 'bi' },
  negocio: { tipo: 'panel', input: negocio(), clave: 'negocio' },
  pulso: { tipo: 'panel', input: negocio(), clave: 'negocio' },
  embudo: { tipo: 'panel', input: negocio('embudo'), clave: 'negocio:embudo' },
  comprador: { tipo: 'panel', input: negocio('avatar'), clave: 'negocio:avatar' },
  avatar: { tipo: 'panel', input: negocio('avatar'), clave: 'negocio:avatar' },
  oferta: { tipo: 'panel', input: negocio('oferta'), clave: 'negocio:oferta' },
  sistema: { tipo: 'panel', input: negocio('sistema'), clave: 'negocio:sistema' },
  'canal-levy': { tipo: 'panel', input: negocio('canal-levy'), clave: 'negocio:canal-levy' },
  estrategia: { tipo: 'panel', input: { vista: 'estrategia' }, clave: 'estrategia' },
  contenido: { tipo: 'panel', input: { vista: 'contenido' }, clave: 'contenido' },
  youtube: { tipo: 'panel', input: { vista: 'contenido' }, clave: 'contenido' },
  calendario: { tipo: 'panel', input: { vista: 'calendario' }, clave: 'calendario' },
  cohorte: { tipo: 'panel', input: { vista: 'cohorte' }, clave: 'cohorte' },
  entrega: { tipo: 'panel', input: { vista: 'cohorte' }, clave: 'cohorte' },
  venta: { tipo: 'panel', input: { vista: 'cohorte' }, clave: 'cohorte' },
  objetivos: { tipo: 'panel', input: { vista: 'objetivos' }, clave: 'objetivos' },
  rutinas: { tipo: 'panel', input: { vista: 'rutinas' }, clave: 'rutinas' },
  salud: { tipo: 'panel', input: { vista: 'salud' }, clave: 'salud' },
  masterclass: { tipo: 'panel', input: { vista: 'masterclass' }, clave: 'masterclass' },
  memoria: { tipo: 'panel', input: { vista: 'memoria' }, clave: 'memoria' },
  equipo: { tipo: 'panel', input: { vista: 'equipo' }, clave: 'equipo' },
  centro: { tipo: 'panel', input: { vista: 'centro' }, clave: 'centro' },
  diario: { tipo: 'panel', input: { vista: 'diario' }, clave: 'diario' },
  trabajos: { tipo: 'panel', input: { vista: 'trabajos' }, clave: 'trabajos' },
  taller: { tipo: 'casa', casa: 'taller', clave: 'taller' },
  'taller-rutinas': { tipo: 'casa', casa: 'taller', segmento: 'rutinas', clave: 'taller:rutinas' },
  tareas: { tipo: 'casa', casa: 'tareas', clave: 'tareas' },
}

/**
 * Los sitios de fuera que un botón puede abrir: los cobros (Polar), YouTube Studio y la comunidad (Skool). Un subdominio de
 * uno de ellos también vale. Los dominios propios de la instalación (`instalacion().dominiosPropios`) los abre el host como
 * suyos (`esPropia`), sin estar aquí: así esta lista no lleva datos de nadie. Agregar uno nuevo es una línea aquí.
 */
export const DOMINIOS_FUERA: readonly string[] = ['polar.sh', 'studio.youtube.com', 'youtube.com', 'skool.com']

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Un dominio de la lista (o subdominio suyo). */
export function dominioPermitido(host: string, lista: readonly string[] = DOMINIOS_FUERA): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return lista.some(d => h === d || h.endsWith(`.${d}`))
}

/**
 * El destino que pidió una isla, o null si no está en la lista blanca. `esPropia(url)` dice si una URL es de esta misma
 * instalación (Studio, localhost, dominio propio): esas se abren dentro, nunca en el navegador.
 */
export function leerDestino(destino: string, esPropia: (u: URL) => boolean = () => false): DestinoIsla | null {
  const s = (destino ?? '').trim()
  const i = s.indexOf(':')
  if (i <= 0 || s.length > 600) return null
  const tipo = s.slice(0, i).toLowerCase(), resto = s.slice(i + 1).trim()
  if (!resto) return null
  switch (tipo) {
    case 'panel': {
      const clave = normal(resto).replace(/[\s_/›>]+/g, '-').replace(/^tu-negocio-?/, '').replace(/^el-/, '') || 'negocio'
      return SECCIONES[clave] ?? null
    }
    case 'doc': {
      const liga = leerLigaDoc(`doc:${resto}`)
      return liga ? { tipo: 'doc', ruta: liga.ruta, ...(liga.fragmento ? { fragmento: liga.fragmento } : {}) } : null
    }
    case 'url': {
      let u: URL
      try { u = new URL(resto) } catch { return null }
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && esPropia(u))) return null
      if (u.username || u.password) return null
      if (esPropia(u)) return { tipo: 'url', url: u.href }
      return dominioPermitido(u.hostname) ? { tipo: 'url', url: u.href } : null
    }
    case 'lienzo': {
      if (/^page:/i.test(resto)) {
        const id = resto.slice(5).trim()
        return /^[A-Za-z0-9-]{6,64}$/.test(id) ? { tipo: 'pagina', paginaId: id } : null
      }
      return resto.length <= 160 ? { tipo: 'capitulo', capitulo: resto } : null
    }
    default: return null
  }
}

/** El capítulo al que se refiere un botón: por id del marco, por título exacto o por título sin acentos ni mayúsculas. */
export function buscarCapitulo(capitulos: ReadonlyArray<{ id: string; titulo: string }>, pedido: string): number {
  const exacto = capitulos.findIndex(c => c.id === pedido)
  if (exacto >= 0) return exacto
  const n = normal(pedido)
  const porTitulo = capitulos.findIndex(c => normal(c.titulo) === n)
  if (porTitulo >= 0) return porTitulo
  return capitulos.findIndex(c => n.length >= 3 && normal(c.titulo).startsWith(n))
}

/** Las vistas que `SECCIONES` abre: la prueba comprueba que todas existen en el panel. */
export const vistasDeSecciones = (): Vista[] =>
  [...new Set(Object.values(SECCIONES).flatMap(d => (d.tipo === 'panel' ? [d.input.vista] : [])))]
