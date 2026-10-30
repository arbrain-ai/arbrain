/**
 * Motor Codex con proveedor propio (2 oct 2026): el mismo Codex App Server que ya corre las cuentas
 * ChatGPT, con un CODEX_HOME propio por ruta donde `config.toml` declara el proveedor y `models.json`
 * trae el catálogo que Codex exige para ids que no son de OpenAI. La llave llega por `env_key` (el
 * NOMBRE de la variable) y el valor solo vive en el entorno del proceso hijo.
 *
 * Plantilla probada en docs/builds/motor-estandar-2026-10-02/poc/poc.mts (seis turnos A-F).
 */
import { textoFaltaLlave } from '../edicion.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnvFile } from '../env.js'
import { proveedor, type Ruta } from './registro.js'

const CATALOGOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'modelos', 'catalogos')
const NIVELES: Record<string, string> = { low: 'Fast responses with lighter reasoning', medium: 'Balanced reasoning', high: 'Extra high reasoning for complex problems', xhigh: 'Maximum reasoning depth', max: 'Maximum reasoning depth' }
const IDS_RESERVADOS = new Set(['openai', 'ollama', 'lmstudio'])

/** CODEX_HOME de una ruta por API: `~/.codex-<cuenta>`. Ahí viven sus hilos (rollouts). */
export function homeDeRuta(ruta: Ruta): string { return path.join(os.homedir(), `.codex-${ruta.cuenta}`) }

const toml = (s: string) => JSON.stringify(s)

export function configToml(ruta: Ruta, home: string): string {
  const p = proveedor(ruta.proveedorId)
  if (!ruta.codex || !p) throw new Error(`La ruta ${ruta.id} no tiene configuración Codex.`)
  if (p.auth.kind !== 'api-key') throw new Error('El proveedor propio requiere una llave por API.')
  if (IDS_RESERVADOS.has(ruta.codex.providerId)) throw new Error(`El id de proveedor ${ruta.codex.providerId} está reservado por Codex.`)
  if (!/^[a-z0-9_-]+$/i.test(ruta.codex.providerId)) throw new Error('Id de proveedor inválido.')
  return [
    `model = ${toml(ruta.modelId)}`,
    `model_provider = ${toml(ruta.codex.providerId)}`,
    `model_catalog_json = ${toml(path.join(home, 'models.json'))}`,
    // La búsqueda web es una herramienta hospedada de OpenAI: no existe en otro proveedor.
    `web_search = "disabled"`,
    `approval_policy = "never"`,
    ``,
    `[model_providers.${ruta.codex.providerId}]`,
    `name = ${toml(p.nombre)}`,
    `base_url = ${toml(p.baseUrl)}`,
    `env_key = ${toml(p.auth.apiKeyEnv)}`,
    `wire_api = "responses"`,
    ``,
  ].join('\n')
}

export function catalogoJson(ruta: Ruta): string {
  if (!ruta.codex) throw new Error(`La ruta ${ruta.id} no tiene catálogo.`)
  // Las instrucciones base del catálogo dicen «an agent based on GPT-5» (plantilla de Codex): con otro modelo
  // eso es falso y el modelo se presenta como GPT-5 (prueba del 2 oct 2026). Se nombra el modelo real.
  const crudo = readFileSync(path.join(CATALOGOS, ruta.codex.catalogo), 'utf8').replaceAll('based on GPT-5', `based on ${ruta.nombre}`)
  const base = JSON.parse(crudo) as Record<string, unknown>
  // Sin `razonamiento` (DeepSeek) conserva los niveles del catálogo oficial.
  const r = ruta.codex.razonamiento
  const propio = r ? {
    context_window: ruta.capacidades.contexto, max_context_window: ruta.capacidades.contexto,
    default_reasoning_level: r.porDefecto,
    supported_reasoning_levels: r.niveles.map(effort => ({ effort, description: NIVELES[effort] })),
  } : {}
  // Sin búsqueda de herramientas: con `supports_search_tool` Codex difiere los MCP (manos, web_*) detrás de una
  // búsqueda que fuera de OpenAI no los encuentra, y el modelo se queda sin ellos (prueba del 2 oct 2026: «NINGUNA»
  // con true, las 27 de manos con false). Así llegan como funciones normales, igual que las de la Cabina.
  return JSON.stringify({ models: [{ ...base, slug: ruta.modelId, display_name: ruta.nombre, apply_patch_tool_type: ruta.codex.applyPatchToolType, supports_search_tool: false, ...propio }] })
}

/** Deja listo el CODEX_HOME de la ruta (idempotente: solo escribe si cambió). Devuelve su ruta. */
export function prepararHome(ruta: Ruta): string {
  const home = homeDeRuta(ruta)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  for (const [nombre, contenido] of [['config.toml', configToml(ruta, home)], ['models.json', catalogoJson(ruta)]] as const) {
    const destino = path.join(home, nombre)
    if (!existsSync(destino) || readFileSync(destino, 'utf8') !== contenido) writeFileSync(destino, contenido, { mode: 0o600 })
  }
  return home
}

/** Entorno del proceso hijo: el del daemon (que no carga .env) más SOLO la variable de la llave de esta ruta. */
export function entornoDeRuta(ruta: Ruta, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const p = proveedor(ruta.proveedorId)
  if (!p || p.auth.kind !== 'api-key') throw new Error(`La ruta ${ruta.id} no usa llave por API.`)
  const nombre = p.auth.apiKeyEnv
  const valor = base[nombre] || readEnvFile([nombre])[nombre]
  if (!valor) throw new Error(textoFaltaLlave(nombre, `Falta la variable ${nombre} en arbrain/server/.env.`))
  return { ...base, [nombre]: valor }
}
