/**
 * La raíz del cerebro que leen Tu negocio, Estrategia y Business Intelligence (16 nov 2026).
 *
 * Seis rutas repetían `[BUSINESS_OS_ROOT, raizRepoRespaldo, cwd/..]`. En la app instalada del alumno (Mac, Windows o Linux)
 * ninguna de las tres existe: la app no pasa `BUSINESS_OS_ROOT`, la plantilla deja vacío el respaldo y Next corre en
 * `resources/next/standalone`. El cerebro del alumno está en `ARBRAIN_HOME` (src-tauri/src/daemon.rs › entorno_comun), así
 * que esos tres paneles salían vacíos o con «No se encontró la raíz del cerebro» aunque Levy ya hubiera escrito su embudo.
 * Edición cliente: `ARBRAIN_HOME` primero. La instalación original no cambia.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'

type Env = Record<string, string | undefined>

export function raicesCerebro(env: Env = process.env, cwd: string = process.cwd()): string[] {
  const alumno = esEdicionCliente(env) ? env.ARBRAIN_HOME?.trim() : undefined
  return [alumno, env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(cwd, '..')].filter(Boolean) as string[]
}

/** La primera candidata con `.claude/memory/MEMORY.md`, o null. */
export function raizCerebro(env: Env = process.env, cwd: string = process.cwd()): string | null {
  return raicesCerebro(env, cwd).find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null
}
