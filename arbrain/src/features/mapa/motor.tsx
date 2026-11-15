'use client'
/**
 * Los bloques del agente ISLAS dentro del registro del MOTOR (mapa v16, 14 nov 2026). El MOTOR es dueño del esquema
 * `arbrain.isla/v1` y del registro de bloques (`features/canvas/islas/bloques/`); estos son tipos ADICIONALES, con nombre
 * propio (ninguno pisa los 12 del MOTOR), para lo que sus bloques base no dicen: el círculo NOVA con su lámina firmada, el
 * órgano con su monitor, la meta y el error que duele, quién trabaja cada órgano, la bandeja sobre su órgano, el timonel,
 * los principios que se tocan, la oferta y el programa.
 *
 * Para el MOTOR, tres líneas:
 *   ESQUEMAS: { ...ESQUEMAS, ...ESQUEMAS_ISLAS }    (leen con tolerancia: el componente valida lo suyo y pinta un hueco
 *                                                   que lo dice si falta algo; declaran fuentes, destinos y filas)
 *   COMPONENTES: { ...COMPONENTES, ...COMPONENTES_ISLAS }  (cada uno se envuelve en el ámbito de tokens de la isla)
 *   PINTORES: { ...PINTORES, ...PINTORES_ISLAS_TODOS }    (el dibujo ligero de lejos: features/mapa/pintar.ts)
 * y envolver la isla en <ContextoMapa.Provider value={{ ir, modo, tema }}> (o pasarlo por su CtxIsla). Sin proveedor, los
 * bloques usan el `ir` de la app y el tema de la app.
 */
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { BLOQUES } from './bloques'
import { irPorDefecto } from './ir'
import type { Contexto, ModoIsla, TemaIsla } from './tipos'
import type { Bloque } from './receta'
import { pintarIslas, type CajaLigera, type PincelLigero } from './pintar'
import s from './isla.module.css'

export const ContextoMapa = createContext<Partial<Contexto> | null>(null)

const temaApp = (): TemaIsla => (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'oscuro' : 'claro')
function useTemaApp(): TemaIsla {
  return useSyncExternalStore(
    fn => { if (typeof MutationObserver === 'undefined') return () => {}; const o = new MutationObserver(fn); o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); return () => o.disconnect() },
    temaApp, () => 'claro',
  )
}

export { ESQUEMAS_ISLAS, TIPOS_ISLAS } from './esquemas'

/** Un bloque de ISLAS montado en la rejilla del MOTOR: su ámbito de tokens, con el modo, el tema y el `ir` del host. */
function Montado({ tipo, p }: { tipo: string; p: Record<string, unknown> }) {
  const host = useContext(ContextoMapa)
  const tApp = useTemaApp()
  const modo: ModoIsla = host?.modo ?? 'cerca'
  const tema: TemaIsla = host?.tema ?? tApp
  const ir = host?.ir ?? irPorDefecto
  const ctx = useMemo<Contexto>(() => ({ modo, tema, ir }), [modo, tema, ir])
  const C = BLOQUES[tipo]
  return <div className={s.ambito} data-tema={tema} data-modo={modo}>{C ? <C b={{ ...p, tipo } as Bloque} ctx={ctx} /> : null}</div>
}

export const COMPONENTES_ISLAS: Record<string, (props: { p: Record<string, unknown> }) => ReactNode> =
  Object.fromEntries(Object.keys(BLOQUES).map(tipo => [tipo, ({ p }: { p: Record<string, unknown> }) => <Montado tipo={tipo} p={p} />]))


/** El dibujo ligero de CADA tipo de ISLAS (los que no tienen uno propio, su placa con lo que dicen): `PINTORES = { ...PINTORES, ...PINTORES_ISLAS_TODOS }`. */
export const PINTORES_ISLAS_TODOS: Record<string, (pc: PincelLigero, p: Record<string, unknown>, c: CajaLigera) => void> =
  Object.fromEntries(Object.keys(BLOQUES).map(tipo => [tipo, (pc: PincelLigero, p: Record<string, unknown>, c: CajaLigera) => pintarIslas(pc, tipo, p, c)]))
