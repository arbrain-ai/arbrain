'use client'
/**
 * Lo vivo de los seis órganos para El pulso (15 nov 2026): la receta de cada isla del mapa v16 y las fuentes que su cartel
 * lee (bandeja, serie del BI, realidad), con el almacén de fuentes del mapa y la caché de la app (`fuenteFresca`): un
 * panel abierto y el mapa comparten la misma lectura. Se relee cada minuto y cuando Levy escribe (`cabina:refrescar`).
 * La lógica vive en `pulso-vivo.ts` (pura).
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { fuenteFresca, useFuente } from '@/features/cabina/datos'
import { AlmacenFuentes } from '@/features/canvas/islas/almacen'
import { leerFuente } from '@/features/canvas/islas/fuentes'
import { urlsApp } from '@/features/canvas/islas/urls-app'
import type { DatosCartelOrgano } from '@/features/canvas/islas/bloques/cartel'
import type { Organo, Pulso } from './pulso'
import { fuentesDeOrgano, islaDeReceta, urlReceta, vivoDe } from './pulso-vivo'

const EDAD_MS = 60_000

export function usePulsoVivo(pulsos: Pulso[], ctx: { directo: boolean; cliente: boolean }): Partial<Record<Organo, DatosCartelOrgano>> {
  const ctxRef = useRef(ctx); ctxRef.current = ctx
  // Las recetas (orden fijo de hooks): en la copia del alumno no hay mapa v16 y no se piden.
  const r = (o: Organo) => (ctx.cliente ? null : urlReceta(o))
  const recetas = {
    marketing: useFuente<unknown>(r('marketing')).data, venta: useFuente<unknown>(r('venta')).data, comprador: useFuente<unknown>(r('comprador')).data,
    entrega: useFuente<unknown>(r('entrega')).data, finanzas: useFuente<unknown>(r('finanzas')).data, sistemas: useFuente<unknown>(r('sistemas')).data,
  } satisfies Record<Organo, unknown>
  const islas = useMemo(() => Object.fromEntries((Object.keys(recetas) as Organo[]).map(o => [o, islaDeReceta(o, recetas[o])])) as Record<Organo, ReturnType<typeof islaDeReceta>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recetas.marketing, recetas.venta, recetas.comprador, recetas.entrega, recetas.finanzas, recetas.sistemas])

  const almacen = useMemo(() => new AlmacenFuentes(f => leerFuente(f, urlsApp(), ctxRef.current, async url => {
    const data = await fuenteFresca<unknown>(url, EDAD_MS)
    return data === undefined ? { error: 'La fuente no respondió.' } : { data }
  })), [])
  const version = useSyncExternalStore(fn => almacen.alCambiar(fn), () => almacen.versionActual, () => 0)

  const fuentes = useMemo(() => [...new Set((Object.keys(islas) as Organo[]).flatMap(o => fuentesDeOrgano(o, islas[o])))].sort(), [islas])
  const clave = fuentes.join('|')
  useEffect(() => {
    if (ctx.cliente) return
    almacen.asegurar(fuentes)
    const tic = () => { if (document.visibilityState === 'visible') void almacen.refrescar(fuentes) }
    const t = setInterval(tic, EDAD_MS)
    window.addEventListener('cabina:refrescar', tic)
    return () => { clearInterval(t); window.removeEventListener('cabina:refrescar', tic) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacen, clave, ctx.cliente])

  // Al prender o apagar el modo directo, lo que se pidió con el otro contexto se relee (cohorte y finanzas se ocultan).
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    if (!ctx.cliente) void almacen.refrescar(fuentes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.directo])

  return useMemo(() => {
    const leer = (f: string) => almacen.get(f)
    return Object.fromEntries(pulsos.map(p => [p.organo, vivoDe(p, islas[p.organo], leer)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulsos, islas, almacen, version])
}
