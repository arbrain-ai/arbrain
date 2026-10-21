/**
 * BYOK del alumno (empaquetado, 11 oct 2026; contrato §4). La app pasa sus llaves por stdin; el CLI de Claude recibe
 * ANTHROPIC_API_KEY o, con solo OpenRouter, esa llave como ANTHROPIC_AUTH_TOKEN (cliente/proveedor.ts). Nunca un token
 * de la suscripción de claude.ai (12 oct 2026). Sin llave, en la edición cliente no se lanza el agente: se responde un
 * error claro en vez de dejar que el CLI falle con un 401 críptico o busque credenciales ajenas.
 */
import { esEdicionCliente } from '../edicion.js'
import { proveedorClaude } from './proveedor.js'
import { vistaConLlaves } from './cofre.js'

// A/B del primer arranque, ronda 2: «inicia sesión con Claude» ya no existe; el camino es «Conectar con OpenRouter».
export const MENSAJE_FALTA_LLAVE = 'Falta conectar tu cuenta de IA. Abre Ajustes › Llaves y pulsa «Conectar con OpenRouter» (o pega tu llave en «Otras formas»).'
export const CODIGO_FALTA_LLAVE = 'falta_llave'

const tiene = (env: NodeJS.ProcessEnv, k: string) => typeof env[k] === 'string' && env[k]!.trim().length > 0

/** Por defecto mira el entorno más las llaves del cofre (contrato v2: no viven en process.env). */
export function estadoLlaves(env: NodeJS.ProcessEnv = vistaConLlaves()) {
  const proveedor = proveedorClaude(env)
  const anthropic = tiene(env, 'ANTHROPIC_API_KEY')
  // Con solo OpenRouter el chat también corre (cliente/proveedor.ts).
  return { anthropic, openrouter: tiene(env, 'OPENROUTER_API_KEY'), chat: proveedor !== null, proveedor }
}

/** ¿Hay que frenar un turno de Claude por falta de llave? Solo en la edición cliente; Daniel usa su login de siempre. */
export function faltaLlaveClaude(env: NodeJS.ProcessEnv = vistaConLlaves()): boolean {
  return esEdicionCliente(env) && !estadoLlaves(env).chat
}
