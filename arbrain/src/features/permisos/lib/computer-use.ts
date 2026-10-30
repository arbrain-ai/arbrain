/**
 * Interruptor de computer use (seguridad para clientes, 10 oct 2026; docs/builds/seguridad-empaquetado-2026-10-09).
 *
 * Instalación original: mismo archivo y misma regla que el servidor de manos (`arbrain/server/src/manos/politica.ts`):
 *   `~/.config/arbrain/manos/computer-use.json` = { encendido, decidido_en, por } (0600). Sin archivo: encendido.
 *
 * Edición cliente (contrato v3 §6.2, red team M1): la fuente es el DAEMON, no el archivo. Cualquier proceso del
 * usuario (el Bash de un agente incluido) puede escribir ese archivo, así que el daemon ignora un encendido por
 * archivo. La web lee `GET /manos/interruptor` y decide con `POST /manos/interruptor` (Bearer del daemon y, para
 * encender, `X-Arbrain-Confirmar`), siempre desde este servidor: el navegador nunca ve esos secretos
 * (`app/api/manos/interruptor/route.ts`). Aquí, en cliente, nunca se escribe el archivo.
 * Solo servidor.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { esEdicionCliente } from '@/lib/edicion'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'

export interface EstadoComputerUse { edicion: 'cliente' | 'estandar'; encendido: boolean; decidido: boolean; decidido_en?: string }

// Misma carpeta que el daemon y el servidor de manos (server/src/edicion.ts): en cliente `ARBRAIN_CONFIG_DIR`.
const ruta = () => join(dirConfigArbrain(), 'manos', 'computer-use.json')

/**
 * Edición cliente: la fija la app al lanzar el servidor (variable o build). El marcador `edicion` solo se lee de una
 * carpeta de configuración explícita, nunca de `~/.config/arbrain` (empaquetado, 11 oct 2026: la app del alumno en
 * la Mac de Daniel no debe convertir su instalación).
 */
export function edicionCliente(): boolean {
  if ((process.env.ARBRAIN_EDICION ?? '').trim() || esEdicionCliente()) return esEdicionCliente()
  const explicita = process.env.ARBRAIN_CONFIG_DIR?.trim()
  if (!explicita) return false
  try { return readFileSync(join(explicita, 'edicion'), 'utf8').trim().toLowerCase() === 'cliente' } catch { return false }
}

/** Regla pura: lo decidido manda; sin decisión, apagado en cliente. */
export function estadoDe(archivo: { encendido?: unknown; decidido_en?: unknown } | null, cliente: boolean): EstadoComputerUse {
  const decidido = !!archivo && typeof archivo.encendido === 'boolean'
  return {
    edicion: cliente ? 'cliente' : 'estandar',
    encendido: decidido ? (archivo!.encendido as boolean) : !cliente,
    decidido,
    ...(decidido && typeof archivo!.decidido_en === 'string' ? { decidido_en: archivo!.decidido_en } : {}),
  }
}

export function leerComputerUse(): EstadoComputerUse {
  let archivo = null
  try { archivo = JSON.parse(readFileSync(ruta(), 'utf8')) } catch { /* sin decisión */ }
  return estadoDe(archivo, edicionCliente())
}

/** Solo la instalación original. En cliente lanza: la decisión va al daemon (`POST /manos/interruptor`). */
export function fijarComputerUse(encendido: boolean): EstadoComputerUse {
  if (edicionCliente()) throw new Error('En la edición cliente computer use se decide en el daemon, no en un archivo.')
  const r = ruta()
  mkdirSync(join(r, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(`${r}.tmp`, JSON.stringify({ encendido, decidido_en: new Date().toISOString(), por: 'arbrain-ajustes' }, null, 1), { mode: 0o600 })
  renameSync(`${r}.tmp`, r)
  return leerComputerUse()
}

// ---------- Edición cliente: el daemon manda (contrato v3 §6.2) ----------

/** Respuesta de `GET /manos/interruptor` del daemon. */
export interface InterruptorDaemon { encendido?: unknown; decision?: { encendido?: unknown; decidido_en?: unknown; por?: unknown } | null }

/** Traduce la respuesta del daemon a lo que pinta la web. Algo ilegible = apagado y sin decidir (lado seguro). */
export function estadoDesdeDaemon(r: InterruptorDaemon | null | undefined): EstadoComputerUse {
  const d = r?.decision
  const decidido = !!d && typeof d.encendido === 'boolean'
  return {
    edicion: 'cliente',
    encendido: r?.encendido === true,
    decidido,
    ...(decidido && typeof d!.decidido_en === 'string' ? { decidido_en: d!.decidido_en } : {}),
  }
}

/** Petición al daemon tal como la arma el servidor de Next (`lib/daemon-local.ts › alDaemon`). */
export type PedirAlDaemon = (ruta: string, init?: RequestInit & { confirmar?: boolean; plazoMs?: number }) => Promise<Response>

/** Estado en cliente, leído del daemon. Si el daemon no responde 200, `error` trae su respuesta para devolverla tal cual. */
export async function leerComputerUseCliente(pedir: PedirAlDaemon): Promise<{ estado: EstadoComputerUse } | { error: Response }> {
  const r = await pedir('/manos/interruptor', { plazoMs: 3_000 })
  if (!r.ok) return { error: r }
  return { estado: estadoDesdeDaemon(await r.json().catch(() => null) as InterruptorDaemon | null) }
}

/**
 * Decisión de la persona en cliente. Encender lleva el secreto de confirmar (lo pone `alDaemon` con `confirmar`);
 * apagar no lo necesita, y así funciona aunque a esta copia le falte el secreto (dirección segura).
 */
export async function fijarComputerUseCliente(pedir: PedirAlDaemon, encendido: boolean): Promise<{ estado: EstadoComputerUse } | { error: Response }> {
  const r = await pedir('/manos/interruptor', { method: 'POST', confirmar: encendido, body: JSON.stringify({ encendido }) })
  if (!r.ok) return { error: r }
  return leerComputerUseCliente(pedir)
}
