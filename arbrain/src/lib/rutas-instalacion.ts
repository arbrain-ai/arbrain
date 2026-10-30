/**
 * Carpetas de esta instalación (empaquetado, 11 oct 2026; contrato en docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md §2).
 *
 * Edición cliente: todo sale de las variables que la app pasa a su Next (CONTRATO-DAEMON.md › «Web (Next)»):
 *   - `ARBRAIN_CONFIG_DIR`: configuración compartida con el daemon y el servidor de manos (interruptor de computer
 *     use, panel, explorador…). Es la misma carpeta que el daemon usa como `<datos>/daemon/config`.
 *   - `ARBRAIN_DATA_DIR`: carpeta propia de la web (`<datos>/web`): base local de chat y lienzo, primer arranque.
 *   - `ARBRAIN_HOME`: workspace del alumno (su cerebro). Único lugar de archivos que la web lee.
 * Si faltan, falla con un error claro: NUNCA cae a `~/.config/arbrain` ni a `~/Developer/...`, que en esta Mac pueden
 * ser los de Daniel.
 *
 * Instalación de Daniel (sin edición cliente): lo de siempre (`ARBRAIN_CONFIG_DIR` o `~/.config/arbrain`,
 * `BUSINESS_OS_ROOT` o su checkout).
 *
 * Puro respecto de node:fs (solo `os` y `path`): se puede importar desde rutas y pruebas.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { esEdicionCliente } from './edicion'

type Env = Record<string, string | undefined>

export class ConfiguracionFaltante extends Error {
  constructor(readonly variable: string) {
    super(`Falta ${variable}: la app de Arbrain debe pasarla al servidor local. Cierra y vuelve a abrir Arbrain; si sigue, reinstala.`)
    this.name = 'ConfiguracionFaltante'
  }
}

function requerida(env: Env, nombre: string): string {
  const v = env[nombre]?.trim()
  if (!v) throw new ConfiguracionFaltante(nombre)
  return v
}

/**
 * Carpeta de configuración compartida con el daemon y el servidor de manos. Cliente: `ARBRAIN_CONFIG_DIR` obligatoria
 * (su `ARBRAIN_DATA_DIR` es la de la web, no la del daemon: derivarla partiría el estado en dos).
 */
export function dirConfigArbrain(env: Env = process.env): string {
  if (esEdicionCliente(env)) return requerida(env, 'ARBRAIN_CONFIG_DIR')
  return env.ARBRAIN_CONFIG_DIR?.trim() || join(homedir(), '.config', 'arbrain')
}

/** Carpeta de datos propios de la web (base local de chat y lienzo, estado del primer arranque). Solo cliente. */
export function dirDatosWeb(env: Env = process.env): string {
  return requerida(env, 'ARBRAIN_DATA_DIR')
}

/**
 * Raíz del workspace. Cliente: `ARBRAIN_HOME` (obligatoria). Daniel: `BUSINESS_OS_ROOT`, si no `ARBRAIN_HOME`, si no
 * el `respaldoOriginal` que dé quien llama (su checkout histórico).
 */
export function raizWorkspace(respaldoOriginal?: string, env: Env = process.env): string {
  if (esEdicionCliente(env)) return requerida(env, 'ARBRAIN_HOME')
  return env.BUSINESS_OS_ROOT?.trim() || env.ARBRAIN_HOME?.trim() || respaldoOriginal || join(process.cwd(), '..')
}
