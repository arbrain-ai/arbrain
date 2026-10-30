/**
 * Registro de manos: qué adaptador y qué decisor están activos.
 *
 * Se elige por entorno (arbrain/server/.env), nunca en el código de los motores:
 *   MANOS_ADAPTADOR=cua            # tecnología de control: cua, casa (macOS) o windows
 *   MANOS_DECISOR=jev              # decisor rápido
 *   MANOS_DECISOR_RESPALDO=claude  # si el rápido cede (sin cuota, baja confianza)
 *
 * Agregar una tecnología = una entrada en ADAPTADORES (o DECISORES) y cambiar
 * una línea del .env. Receta completa en docs/builds/computer-use-2026-10-02/ADAPTADORES.md.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Adaptador, Decision, Decisor, PedidoDecidir } from './contrato.js'
import { AdaptadorCua } from './adaptadores/cua.js'
import { AdaptadorCasa } from './adaptadores/casa.js'
import { AdaptadorWindows } from './adaptadores/windows.js'
import { CedeDecision, DecisorJev } from './decisores/jev.js'
import { DecisorClaude } from './decisores/claude.js'
import { Freno } from './freno.js'
import { Vigia } from './navegador.js'
import { Grabadora } from './recetas.js'
import { esEdicionCliente } from '../edicion.js'

export const ADAPTADORES: Record<string, () => Adaptador> = {
  cua: () => new AdaptadorCua(),
  casa: () => new AdaptadorCasa(),
  windows: () => new AdaptadorWindows(),
}

/**
 * Sin `MANOS_ADAPTADOR`: en Windows, las manos propias de Windows; en macOS de la edición cliente, las de la casa
 * (ArbrainManos viaja dentro de la app, 0.1.2); en el resto, Cua (como siempre en la instalación de Daniel).
 */
export const adaptadorPorDefecto = () => process.env.MANOS_ADAPTADOR || (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' && esEdicionCliente() ? 'casa' : 'cua')

export const DECISORES: Record<string, () => Decisor> = {
  jev: () => new DecisorJev(),
  claude: () => new DecisorClaude(),
}

const LLAVES = ['MANOS_CEREBRO_MODELO', 'MANOS_CEREBRO_ESCALA', 'MANOS_JEV_VE_ARBOL', 'MANOS_BITACORA_DIR', 'MANOS_ADAPTADOR', 'MANOS_MODO', 'MANOS_CASA_SOCKET', 'MANOS_CASA_APP', 'MANOS_WINDOWS_EXE', 'MANOS_WINDOWS_CACHE', 'MANOS_HALO', 'MANOS_DECISOR', 'MANOS_DECISOR_RESPALDO', 'MANOS_CUA_BIN', 'MANOS_CUA_SESION', 'MANOS_CLAUDE_MODELO', 'MANOS_JEV_MODELO', 'MANOS_JEV_TIMEOUT_MS', 'MANOS_JEV_VIA', 'OPENROUTER_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN']

/**
 * Lee solo las llaves de manos de arbrain/server/.env si el proceso no las trae.
 * El servidor MCP lo lanza un motor o una sesión de Claude/Codex que no siempre
 * hereda el .env; así la elección vive en un solo lugar.
 */
export function cargarEntornoManos(ruta = fileURLToPath(new URL('../../.env', import.meta.url))): void {
  if (!existsSync(ruta)) return
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/)
    if (!m || !LLAVES.includes(m[1]) || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export function crearAdaptador(nombre = adaptadorPorDefecto()): Adaptador {
  const f = ADAPTADORES[nombre]
  if (!f) throw new Error(`MANOS_ADAPTADOR=${nombre} no existe. Disponibles: ${Object.keys(ADAPTADORES).join(', ')}`)
  return f()
}

/**
 * Las manos completas: Grabadora (recetas) → Freno (seguridad) → Vigía (videos silenciados y pausados) → adaptador.
 * Toda vía pasa por el freno: MCP, cerebro, recetas y canario.
 */
export function componerManos(base: Adaptador = crearAdaptador()): Grabadora {
  return new Grabadora(new Freno(new Vigia(base)))
}

/**
 * Privacidad (decisión de Daniel, 2 oct 17:23): la pantalla se queda con Anthropic. A un decisor de otro
 * proveedor (Jev por OpenRouter) solo le llega la pregunta y el menú cerrado de opciones: nunca el árbol ni
 * capturas. `MANOS_JEV_VE_ARBOL=1` lo revierte.
 */
export function sinPantalla(p: PedidoDecidir): PedidoDecidir {
  if (process.env.MANOS_JEV_VE_ARBOL === '1') return p
  const e = p.estado
  if (!e || typeof e !== 'object') return { ...p, estado: {} }
  // Lista blanca: solo la intención del paso, nunca nada leído de la pantalla.
  const permitido = ['meta', 'tarea', 'paso', 'objetivo']
  return { ...p, estado: Object.fromEntries(Object.entries(e as Record<string, unknown>).filter(([k]) => permitido.includes(k))) }
}

/** Decisor encadenado: el rápido primero; si cede, el respaldo decide y queda registrado por qué. */
export class DecisorEncadenado implements Decisor {
  readonly nombre: string
  constructor(private readonly rapido: Decisor, private readonly respaldo: Decisor | null) {
    this.nombre = respaldo ? `${rapido.nombre}→${respaldo.nombre}` : rapido.nombre
  }

  async decidir(p: PedidoDecidir): Promise<Decision> {
    const externo = !this.rapido.nombre.startsWith('claude')
    // Privacidad: si las opciones son contenido de terceros (un chat), el rápido externo ni se consulta.
    if (externo && p.privado) {
      if (!this.respaldo) throw new CedeDecision('privado: contenido de un chat y no hay decisor de Anthropic')
      const d = await this.respaldo.decidir(p)
      return { ...d, cedio: 'privado: contenido de un chat no sale de Anthropic' }
    }
    try {
      // El rápido es de otro proveedor: no ve la pantalla. El respaldo (Anthropic) sí recibe el estado completo.
      return await this.rapido.decidir(externo ? sinPantalla(p) : p)
    } catch (e) {
      if (!this.respaldo) throw e
      const motivo = e instanceof CedeDecision ? e.message : `${this.rapido.nombre} falló: ${(e as Error).message}`
      const d = await this.respaldo.decidir(p)
      const previo = e instanceof CedeDecision ? e.parcial : undefined
      return { ...d, cedio: motivo, ms: d.ms + (previo?.ms ?? 0), costo_usd: (d.costo_usd ?? 0) + (previo?.costo_usd ?? 0) }
    }
  }

  async cerrar(): Promise<void> { await this.rapido.cerrar?.(); await this.respaldo?.cerrar?.() }
}

export function crearDecisor(nombre = process.env.MANOS_DECISOR || 'jev', respaldo = process.env.MANOS_DECISOR_RESPALDO ?? 'claude'): Decisor {
  const f = DECISORES[nombre]
  if (!f) throw new Error(`MANOS_DECISOR=${nombre} no existe. Disponibles: ${Object.keys(DECISORES).join(', ')}`)
  const r = respaldo && respaldo !== nombre ? DECISORES[respaldo] : undefined
  if (respaldo && respaldo !== nombre && !r) throw new Error(`MANOS_DECISOR_RESPALDO=${respaldo} no existe.`)
  return new DecisorEncadenado(f(), r ? r() : null)
}
