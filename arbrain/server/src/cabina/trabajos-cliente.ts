/**
 * Taller › Agentes en la edición cliente (29 oct 2026, fundador en Windows: «El Studio no respondió · No disponible en
 * esta edición»).
 *
 * `trabajos()` de `cuerpo.ts` lee lo que solo existe en el Studio de Daniel: el motor de terminales, SFTerm, los
 * puertos (`lsof`), los servicios de launchd, los procesos con dueño y los planes del repo. En la computadora del
 * alumno nada de eso es suyo ni se puede leer igual (Windows no tiene `lsof` ni `launchctl`), así que su daemon no
 * llama a `trabajos()`: responde esta foto, que solo trae SUS subagentes (los `Agent` del SDK de sus conversaciones,
 * que `internos.ts` observa en su propia carpeta de datos) y sus comandos en segundo plano. Sin terminales, servidores
 * ni servicios: la vista los pinta vacíos y, si no hay nada, «Aún no has delegado nada».
 *
 * Solo lectura. Las acciones del tablero (detener, responder) son de los subagentes de `delegar`, que en cliente no
 * existen, y siguen fuera.
 */
import type { Trabajos } from './cuerpo.js'
import { internas, type TareaInterna } from './internos.js'

/** Lo que sale hacia la app: sin el resultado completo (va por `salida`) y sin secretos en los textos. */
export function internaParaLista(t: TareaInterna, tachar: (s: string) => string): TareaInterna {
  return {
    ...t, descripcion: tachar(t.descripcion),
    ...(t.actividad ? { actividad: tachar(t.actividad) } : {}),
    ...(t.resumen ? { resumen: tachar(t.resumen).slice(0, 300) } : {}),
    ...(t.resultado ? { resultado: undefined } : {}),
  }
}

export async function trabajosCliente(o: { leer?: () => Promise<TareaInterna[]>; tachar?: (s: string) => string } = {}): Promise<Trabajos> {
  const tachar = o.tachar ?? (await import('./cuerpo.js')).tachar
  let error: string | undefined
  const lista = await (o.leer ?? internas)().catch((e: unknown) => { error = `no se pudo leer el registro de subagentes: ${e instanceof Error ? e.message : e}`; return [] as TareaInterna[] })
  return {
    fuente: 'ninguna', sfterm: false,
    internas: lista.map(t => internaParaLista(t, tachar)),
    permitidos: { harness: [], carpetas: [] },
    terminales: [], servidores: [], servicios: [],
    leidoEn: new Date().toISOString(),
    ...(error ? { error } : {}),
  }
}
