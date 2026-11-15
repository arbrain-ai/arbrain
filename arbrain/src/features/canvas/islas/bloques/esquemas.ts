/**
 * Mapa v16 · los TIPOS de bloque y sus propiedades (14 nov 2026). La parte pura del registro: qué acepta cada tipo, qué
 * fuentes lee, a dónde llevan sus botones y cuántas filas ocupa sin `en`. El componente vivo (React) y su dibujo ligero
 * (canvas) viven en `registro.tsx` y `pintar.ts`; los tres se registran con el MISMO `tipo`.
 *
 * Agregar un tipo: su esquema aquí, su componente y su `pintar`, una línea en cada registro y una prueba. Es lo único de las
 * islas que pide actualizar la app (se instala en reposo); todo lo demás es receta y se edita en vivo.
 *
 * Los textos aceptan huecos con datos vivos: `"Entró {finanzas:resumen.texto.entro}"` (fuente.campo). Sin dato: «sin dato».
 * Puro (tests/canvas/islas-receta.test.ts).
 */
import { FORMA_FUENTE } from '../protocolo'
import { ESQUEMAS_ISLAS } from '@/features/mapa/esquemas'
import { fuentesDeTexto } from '../receta'

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const txt = (x: unknown, max = 600) => (typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : null)
const uno = <T extends string>(lista: readonly T[], x: unknown, d: T): T => ((lista as readonly unknown[]).includes(x) ? x as T : d)
const fuenteOk = (x: unknown) => (typeof x === 'string' && FORMA_FUENTE.test(x) ? x : null)
const numOCampo = (x: unknown): number | string | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && /^[a-zA-Z0-9_.]{1,80}$/.test(x) ? x : null)

export const ORGANOS_PULSO = ['marketing', 'venta', 'comprador', 'entrega', 'finanzas', 'sistemas'] as const

export interface BotonP { texto: string; destino: string; estilo: 'oro' | 'contorno' | 'fantasma' }
export type PropsDe = {
  titulo: { texto: string; ceja?: string; tamano: 'xl' | 'l' | 'm'; alinear: 'izq' | 'centro' }
  texto: { texto: string; estilo: 'cuerpo' | 'display' | 'nota' | 'mono'; alinear: 'izq' | 'centro' | 'der' }
  cita: { texto: string; autor?: string }
  numero: { fuente: string; campo: string; etiqueta?: string; unidad?: string; detalle?: string; tendencia?: { fuente: string; campo: string }; sin: string; alinear: 'izq' | 'centro' }
  organo: { organo: string; fuente: string; nombre?: string; pregunta?: string; botones: BotonP[] }
  boton: BotonP
  progreso: { etiqueta: string; fuente?: string; valor: number | string; total: number | string; nota?: string }
  nova: { centro: { texto: string; sub?: string }; anillos: Array<{ nombre: string; texto?: string }> }
  escalera: { titulo?: string; peldanos: Array<{ nombre: string; precio?: string; nota?: string; estado: 'vivo' | 'abierto' | 'hueco' | 'tu' | 'por-firmar' }> }
  'linea-tiempo': { hitos: Array<{ fecha?: string; texto: string; estado: 'hecho' | 'hoy' | 'viene' }> }
  lista: { items: string[]; estilo: 'chips' | 'puntos' }
  separador: { etiqueta?: string }
}
export type TipoBloque = keyof PropsDe

export interface EsquemaBloque<T extends TipoBloque = TipoBloque> {
  /** Lo que la receta trae → props limpias, o los errores que impiden pintarlo. */
  leer(x: Record<string, unknown>): { p: PropsDe[T] } | { errores: string[] }
  fuentes(p: PropsDe[T]): string[]
  destinos(p: PropsDe[T]): string[]
  /** Filas de la rejilla cuando el bloque no trae `en`. */
  filas(p: PropsDe[T]): number
}

const boton = (x: unknown): BotonP | null => {
  if (!obj(x)) return null
  const texto = txt(x.texto, 80), destino = txt(x.destino, 600)
  return texto && destino ? { texto, destino, estilo: uno(['oro', 'contorno', 'fantasma'] as const, x.estilo, 'contorno') } : null
}
const textoConFuentes = (t: string) => fuentesDeTexto(t)

export const ESQUEMAS: { [T in TipoBloque]: EsquemaBloque<T> } = {
  titulo: {
    leer: x => { const texto = txt(x.texto, 300); return texto ? { p: { texto, ...(txt(x.ceja, 120) ? { ceja: txt(x.ceja, 120)! } : {}), tamano: uno(['xl', 'l', 'm'] as const, x.tamano, 'l'), alinear: uno(['izq', 'centro'] as const, x.alinear, 'izq') } } : { errores: ['«texto» es obligatorio.'] } },
    fuentes: p => [...textoConFuentes(p.texto), ...(p.ceja ? textoConFuentes(p.ceja) : [])],
    destinos: () => [],
    filas: p => (p.tamano === 'xl' ? 3 : 2),
  },
  texto: {
    leer: x => { const texto = txt(x.texto, 4000); return texto ? { p: { texto, estilo: uno(['cuerpo', 'display', 'nota', 'mono'] as const, x.estilo, 'cuerpo'), alinear: uno(['izq', 'centro', 'der'] as const, x.alinear, 'izq') } } : { errores: ['«texto» es obligatorio.'] } },
    fuentes: p => textoConFuentes(p.texto),
    destinos: () => [],
    filas: p => Math.max(1, Math.min(8, Math.ceil(p.texto.length / (p.estilo === 'display' ? 40 : 110)))),
  },
  cita: {
    leer: x => { const texto = txt(x.texto, 1200); return texto ? { p: { texto, ...(txt(x.autor, 120) ? { autor: txt(x.autor, 120)! } : {}) } } : { errores: ['«texto» es obligatorio.'] } },
    fuentes: p => textoConFuentes(p.texto),
    destinos: () => [],
    filas: p => Math.max(2, Math.min(6, Math.ceil(p.texto.length / 70) + (p.autor ? 1 : 0))),
  },
  numero: {
    leer: x => {
      const fuente = fuenteOk(x.fuente)
      if (!fuente) return { errores: ['«fuente» es obligatoria (p. ej. "pulso:venta", "bi:<consulta>").'] }
      const t = obj(x.tendencia) ? x.tendencia : null
      const tf = t ? fuenteOk(t.fuente) ?? fuente : null
      return { p: {
        fuente, campo: typeof x.campo === 'string' && /^[a-zA-Z0-9_.]{1,80}$/.test(x.campo) ? x.campo : 'cifra',
        ...(txt(x.etiqueta, 160) ? { etiqueta: txt(x.etiqueta, 160)! } : {}),
        ...(txt(x.unidad, 160) ? { unidad: txt(x.unidad, 160)! } : {}),
        ...(txt(x.detalle, 400) ? { detalle: txt(x.detalle, 400)! } : {}),
        ...(t && tf ? { tendencia: { fuente: tf, campo: typeof t.campo === 'string' && /^[a-zA-Z0-9_.]{1,80}$/.test(t.campo) ? t.campo : 'puntos' } } : {}),
        sin: txt(x.sin, 80) ?? 'sin dato',
        alinear: uno(['izq', 'centro'] as const, x.alinear, 'izq'),
      } }
    },
    fuentes: p => [p.fuente, ...(p.tendencia ? [p.tendencia.fuente] : []), ...(p.etiqueta ? textoConFuentes(p.etiqueta) : []), ...(p.unidad ? textoConFuentes(p.unidad) : []), ...(p.detalle ? textoConFuentes(p.detalle) : [])],
    destinos: () => [],
    filas: p => (p.tendencia ? 4 : 3),
  },
  organo: {
    leer: x => {
      const organo = typeof x.organo === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(x.organo) ? x.organo : null
      if (!organo) return { errores: ['«organo» es obligatorio (marketing, venta, comprador, entrega, finanzas, sistemas…).'] }
      const fuente = fuenteOk(x.fuente) ?? ((ORGANOS_PULSO as readonly string[]).includes(organo) ? `pulso:${organo}` : null)
      if (!fuente) return { errores: [`«${organo}» no tiene pulso propio: pon su «fuente».`] }
      const botones = Array.isArray(x.botones) ? x.botones.map(boton).filter((b): b is BotonP => !!b).slice(0, 4) : []
      return { p: { organo, fuente, botones, ...(txt(x.nombre, 80) ? { nombre: txt(x.nombre, 80)! } : {}), ...(txt(x.pregunta, 160) ? { pregunta: txt(x.pregunta, 160)! } : {}) } }
    },
    fuentes: p => [p.fuente],
    destinos: p => p.botones.map(b => b.destino),
    filas: p => (p.botones.length ? 6 : 5),
  },
  boton: {
    leer: x => { const b = boton(x); return b ? { p: b } : { errores: ['«texto» y «destino» son obligatorios.'] } },
    fuentes: () => [],
    destinos: p => [p.destino],
    filas: () => 1,
  },
  progreso: {
    leer: x => {
      const etiqueta = txt(x.etiqueta, 160), valor = numOCampo(x.valor), total = numOCampo(x.total)
      if (!etiqueta || valor === null || total === null) return { errores: ['«etiqueta», «valor» y «total» son obligatorios (número o campo de la fuente).'] }
      const fuente = fuenteOk(x.fuente) ?? undefined
      if ((typeof valor === 'string' || typeof total === 'string') && !fuente) return { errores: ['Con «valor» o «total» como campo, falta «fuente».'] }
      return { p: { etiqueta, valor, total, ...(fuente ? { fuente } : {}), ...(txt(x.nota, 200) ? { nota: txt(x.nota, 200)! } : {}) } }
    },
    fuentes: p => [...(p.fuente ? [p.fuente] : []), ...textoConFuentes(p.etiqueta)],
    destinos: () => [],
    filas: () => 2,
  },
  nova: {
    leer: x => {
      const c = obj(x.centro) ? x.centro : null
      const centro = c && txt(c.texto, 300) ? { texto: txt(c.texto, 300)!, ...(txt(c.sub, 300) ? { sub: txt(c.sub, 300)! } : {}) } : null
      const anillos = Array.isArray(x.anillos) ? x.anillos.filter(obj).map(a => ({ nombre: txt(a.nombre, 60), texto: txt(a.texto, 400) })).filter(a => a.nombre).map(a => ({ nombre: a.nombre!, ...(a.texto ? { texto: a.texto } : {}) })).slice(0, 6) : []
      if (!centro || !anillos.length) return { errores: ['«centro» { texto } y al menos un anillo { nombre } son obligatorios.'] }
      return { p: { centro, anillos } }
    },
    fuentes: () => [], destinos: () => [],
    filas: () => 10,
  },
  escalera: {
    leer: x => {
      const peldanos = Array.isArray(x.peldanos) ? x.peldanos.filter(obj).filter(p => txt(p.nombre, 80)).slice(0, 8).map(p => ({
        nombre: txt(p.nombre, 80)!, ...(txt(p.precio, 60) ? { precio: txt(p.precio, 60)! } : {}), ...(txt(p.nota, 200) ? { nota: txt(p.nota, 200)! } : {}),
        estado: uno(['vivo', 'abierto', 'hueco', 'tu', 'por-firmar'] as const, p.estado, 'vivo'),
      })) : []
      return peldanos.length ? { p: { peldanos, ...(txt(x.titulo, 120) ? { titulo: txt(x.titulo, 120)! } : {}) } } : { errores: ['«peldanos» necesita al menos uno con «nombre».'] }
    },
    fuentes: p => p.peldanos.flatMap(q => [...textoConFuentes(q.nombre), ...(q.precio ? textoConFuentes(q.precio) : [])]),
    destinos: () => [],
    filas: p => Math.max(4, p.peldanos.length + 2),
  },
  'linea-tiempo': {
    leer: x => {
      const hitos = Array.isArray(x.hitos) ? x.hitos.filter(obj).filter(h => txt(h.texto, 200)).slice(0, 12).map(h => ({
        ...(txt(h.fecha, 40) ? { fecha: txt(h.fecha, 40)! } : {}), texto: txt(h.texto, 200)!, estado: uno(['hecho', 'hoy', 'viene'] as const, h.estado, 'viene'),
      })) : []
      return hitos.length ? { p: { hitos } } : { errores: ['«hitos» necesita al menos uno con «texto».'] }
    },
    fuentes: () => [], destinos: () => [],
    filas: () => 3,
  },
  lista: {
    leer: x => {
      const items = Array.isArray(x.items) ? x.items.map(i => txt(i, 300)).filter((i): i is string => !!i).slice(0, 24) : []
      return items.length ? { p: { items, estilo: uno(['chips', 'puntos'] as const, x.estilo, 'puntos') } } : { errores: ['«items» necesita al menos un texto.'] }
    },
    fuentes: p => p.items.flatMap(textoConFuentes),
    destinos: () => [],
    filas: p => (p.estilo === 'chips' ? 1 : Math.max(1, Math.min(10, p.items.length))),
  },
  separador: {
    leer: x => ({ p: { ...(txt(x.etiqueta, 80) ? { etiqueta: txt(x.etiqueta, 80)! } : {}) } }),
    fuentes: () => [], destinos: () => [],
    filas: () => 1,
  },
}

export const TIPOS_BLOQUE = Object.keys(ESQUEMAS) as TipoBloque[]
/**
 * Los tipos del agente ISLAS (`features/mapa`: estrella, organo-vivo, meta-error, escalera-valor, modulos…) se suman con
 * su propio nombre, sin pisar ninguno de estos 12. Sus esquemas son puros (`features/mapa/esquemas.ts`); su componente
 * vivo y su dibujo ligero entran por el mismo respaldo en `registro.tsx` y `pintar.ts`.
 */
export const esquemaDe = (tipo: string): EsquemaBloque | null =>
  tipo in ESQUEMAS ? ESQUEMAS[tipo as TipoBloque] as EsquemaBloque : (ESQUEMAS_ISLAS[tipo] as unknown as EsquemaBloque | undefined) ?? null
export const esTipoBloque = (t: string): t is TipoBloque => !!esquemaDe(t)

/** Un bloque de la receta ya validado por su tipo; si no se pudo, queda como bloque roto con su motivo (se pinta así). */
export type BloqueListo = { tipo: TipoBloque; p: PropsDe[TipoBloque]; ok: true } | { tipo: string; ok: false; motivo: string }

export function prepararBloque(tipo: string, props: Record<string, unknown>): BloqueListo {
  if (!esTipoBloque(tipo)) return { tipo, ok: false, motivo: `No hay un bloque «${tipo}» en esta versión de la app (${TIPOS_BLOQUE.join(', ')}).` }
  const r = esquemaDe(tipo)!.leer(props)
  return 'p' in r ? { tipo, p: r.p, ok: true } : { tipo, ok: false, motivo: r.errores.join(' ') }
}
