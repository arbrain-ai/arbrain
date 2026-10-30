/**
 * BYOK del alumno (empaquetado, 11 oct 2026; contrato §4). La app pasa sus llaves por stdin; el CLI de Claude recibe
 * ANTHROPIC_API_KEY o, con solo OpenRouter, esa llave como ANTHROPIC_AUTH_TOKEN (cliente/proveedor.ts). Nunca un token
 * de la suscripción de claude.ai (12 oct 2026). Sin llave, en la edición cliente no se lanza el agente: se responde un
 * error claro en vez de dejar que el CLI falle con un 401 críptico o busque credenciales ajenas.
 */
import { esEdicionCliente } from '../edicion.js'
import { proveedorClaude, type ProveedorClaude } from './proveedor.js'
import { conectarSuscripcionSiHay, motorSuscripcion } from './suscripcion.js'

/** Quién atiende el chat: una llave (Anthropic u OpenRouter) o la suscripción de la persona en su Claude Code. */
export type ProveedorChat = ProveedorClaude | 'suscripcion'
import { vistaConLlaves } from './cofre.js'
import { INICIO_FALTA_LLAVE } from './sin-saldo.js'

// Prueba en Windows del 22 oct 2026 (punto 11): sin llave ni sesión, el chat dice cómo conectarse, nunca un error crudo.
// Empieza con `INICIO_FALTA_LLAVE` (cliente/sin-saldo.ts): la web lo reconoce y ofrece el atajo a Ajustes › Llaves.
export const MENSAJE_FALTA_LLAVE = `${INICIO_FALTA_LLAVE} Abre Ajustes › Llaves: si pagas Claude Pro o Max, pulsa «Iniciar sesión con Claude»; si no, «Conectar con OpenRouter».`
export const CODIGO_FALTA_LLAVE = 'falta_llave'

const tiene = (env: NodeJS.ProcessEnv, k: string) => typeof env[k] === 'string' && env[k]!.trim().length > 0

/** Por defecto mira el entorno más las llaves del cofre (contrato v2: no viven en process.env). */
export function estadoLlaves(env: NodeJS.ProcessEnv = vistaConLlaves()) {
  const anthropic = tiene(env, 'ANTHROPIC_API_KEY')
  const openrouter = tiene(env, 'OPENROUTER_API_KEY')
  // Motor «Mi Claude Code» (cliente/suscripcion.ts): el chat corre con la sesión de la persona; sus llaves, si las
  // tiene, se quedan sin usar. Si la sesión no existe, el CLI lo dice en el turno y el chat lo traduce.
  if (motorSuscripcion(env)) return { anthropic, openrouter, chat: true, proveedor: 'suscripcion' as ProveedorChat }
  const proveedor: ProveedorChat | null = proveedorClaude(env)
  // Con solo OpenRouter el chat también corre (cliente/proveedor.ts).
  return { anthropic, openrouter, chat: proveedor !== null, proveedor }
}

/** ¿Hay que frenar un turno de Claude por falta de llave? Solo en la edición cliente; Daniel usa su login de siempre. */
export function faltaLlaveClaude(env: NodeJS.ProcessEnv = vistaConLlaves()): boolean {
  return esEdicionCliente(env) && !estadoLlaves(env).chat
}

/**
 * Como `faltaLlaveClaude`, pero antes intenta conectar solo el Claude Code de la persona si ya tiene sesión (y nunca
 * eligió «usar una llave»). Así, quien inició sesión en su terminal o con el botón no tiene que volver a Ajustes: su
 * siguiente mensaje ya sale con su plan. Sin llave y sin sesión, sigue faltando y el chat lo dice claro.
 */
export async function faltaLlaveTrasConectar(): Promise<boolean> {
  if (!faltaLlaveClaude()) return false
  try { await conectarSuscripcionSiHay({ sinLlave: true, configDir: process.env.ARBRAIN_CONFIG_DIR }) } catch { /* sigue faltando */ }
  return faltaLlaveClaude()
}
