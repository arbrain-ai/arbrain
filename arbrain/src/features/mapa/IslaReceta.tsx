'use client'
/**
 * Una isla del mapa v16, pintada desde su RECETA (14 nov 2026). La receta vive en el repo,
 * `docs/builds/mapa-v16/islas/<id>/receta.json`, y se relee sola cada pocos segundos: Levy la edita y la isla cambia en
 * vivo, sin reiniciar la app (Daniel, 07:30). Los bloques son nativos (features/mapa/bloques); un tipo que esta versión no
 * conoce se pinta como hueco que lo dice, nunca rompe la isla.
 *
 *   <IslaPorId id="norte" modo="cerca" tema="oscuro" ir={host.ir} />    el lienzo (el registro del MOTOR la monta)
 *   <IslaReceta receta={r} ctx={…} />                                   la receta ya leída (galería, pruebas)
 */
import { memo, useMemo, type CSSProperties } from 'react'
import { useFuente } from '@/features/cabina/datos'
import { leerReceta, type Bloque, type Receta } from './receta'
import { BLOQUES, TIPOS_BLOQUE } from './bloques'
import { Hueco } from './piezas'
import { useIr } from './ir'
import type { Contexto, ModoIsla, TemaIsla } from './tipos'
import s from './isla.module.css'

export const CARPETA_ISLAS = 'docs/builds/mapa-v16/islas'
export const rutaReceta = (id: string) => `${CARPETA_ISLAS}/${id}/receta.json`
const urlReceta = (id: string) => `/api/cabina/documento?ruta=${encodeURIComponent(rutaReceta(id))}&codigo=1`
/** Cada cuánto se relee la receta mientras la isla está montada (editar sin reiniciar). */
export const RELEER_RECETA_MS = 4000

function BloqueVivo({ b, ctx }: { b: Bloque; ctx: Contexto }) {
  const C = BLOQUES[b.tipo]
  if (!C) return <Hueco>El bloque «{b.tipo}» no existe en esta versión de Arbrain.</Hueco>
  return <C b={b} ctx={ctx} />
}

export const IslaReceta = memo(function IslaReceta({ receta, ctx }: { receta: Receta; ctx: Contexto }) {
  const estilo = { '--ancho': `${receta.ancho}px`, '--alto': `${receta.alto}px` } as CSSProperties
  return <div className={s.isla} data-isla={receta.id} data-modo={ctx.modo} data-tema={ctx.tema} data-acento={receta.acento ?? 'morado'} style={estilo}>
    <div className={s.luna} aria-hidden />
    {receta.filas.map((f, i) => (
      <div key={i} className={s.fila} style={{
        ...(f.alto ? { height: f.alto, flex: 'none' } : {}), ...(f.gap != null ? { gap: f.gap } : {}),
        ...(f.aire != null ? { marginTop: f.aire } : {}),
        alignItems: f.alinear === 'centro' ? 'center' : f.alinear === 'fin' ? 'flex-end' : f.alinear === 'inicio' ? 'flex-start' : 'stretch',
      }}>
        {f.bloques.map((b, j) => <div key={b.id ?? `${b.tipo}-${j}`} className={s.celda} style={{ flex: `${b.peso ?? 1} 1 0` }}><BloqueVivo b={b} ctx={ctx} /></div>)}
      </div>
    ))}
  </div>
})

/** La receta de una isla, leída del repo y releída sola (la misma caché de la app: una lectura por URL). */
export function useReceta(id: string) {
  const l = useFuente<{ texto?: string; hash?: string; error?: string }>(urlReceta(id), RELEER_RECETA_MS)
  return useMemo(() => {
    if (!l.data?.texto) return { receta: null, avisos: [] as string[], error: l.error ?? l.data?.error ?? null, cargando: l.cargando }
    let json: unknown
    try { json = JSON.parse(l.data.texto) } catch (e) { return { receta: null, avisos: [], error: `receta.json no es JSON válido: ${(e as Error).message}`, cargando: false } }
    const r = leerReceta(json, TIPOS_BLOQUE)
    return r.ok ? { receta: r.receta, avisos: r.avisos, error: null, cargando: false } : { receta: null, avisos: [], error: r.errores.join(' '), cargando: false }
  }, [l.data, l.error, l.cargando])
}

/** La isla `id` como la monta el lienzo: lee su receta y la pinta en el modo, tema e `ir` del host. */
export function IslaPorId({ id, modo, tema, ir }: { id: string; modo: ModoIsla; tema: TemaIsla; ir?: (destino: string) => void }) {
  const irA = useIr(ir)
  const ctx = useMemo<Contexto>(() => ({ modo, tema, ir: irA }), [modo, tema, irA])
  const { receta, error } = useReceta(id)
  if (!receta) return <div className={s.isla} data-modo={modo} data-tema={tema} style={{ '--ancho': '1440px', '--alto': '900px' } as CSSProperties}>
    <Hueco>{error ? `La isla «${id}» no se pudo leer: ${error}` : `Leyendo la isla «${id}»…`}</Hueco>
  </div>
  return <IslaReceta receta={receta} ctx={ctx} />
}
