/**
 * Registro de modelos y proveedores de Arbrain (motor estándar, 2 oct 2026).
 *
 * Decisión de Daniel: los motores son solo dos. Claude Code SDK para los modelos de Claude y el
 * Codex App Server para todo lo demás. Un modelo que no es de OpenAI entra por el MISMO Codex App
 * Server con un `model_provider` propio (wire_api = "responses"), probado en
 * docs/builds/motor-estandar-2026-10-02/INFORME.md.
 *
 * Tres ejes separados: modelo (qué piensa), proveedor (quién lo sirve) y motor (quién corre el bucle
 * de herramientas). Una ruta es la tripleta. Agregar un modelo es agregar una entrada, no un `if`.
 *
 * Las llaves se guardan SOLO por nombre de variable (`apiKeyEnv`); el valor se lee de
 * arbrain/server/.env al lanzar el proceso del motor y nunca se persiste, se loguea ni sale por HTTP.
 */
import { textoFaltaLlave, textoMotorApiApagado } from '../edicion.js'
import { readEnvFile } from '../env.js'

export type Motor = 'claude-agent-sdk' | 'codex-app-server'
export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Autenticacion =
  | { kind: 'suscripcion'; cuentas: string[] }       // OAuth: Max (default, bro) o ChatGPT (codex, yt)
  | { kind: 'api-key'; apiKeyEnv: string }            // NOMBRE de la variable, nunca el valor

export interface Proveedor {
  id: string
  nombre: string
  baseUrl: string
  wire: 'anthropic-messages' | 'openai-responses'
  auth: Autenticacion
}

/** Ajustes del Codex App Server para una ruta con proveedor propio. */
export interface RutaCodexPropia {
  /** Id dentro de [model_providers.<id>]; no puede ser openai, ollama ni lmstudio. */
  providerId: string
  /** Catálogo oficial que Codex exige para ids que no son de OpenAI (arbrain/server/src/modelos/catalogos). */
  catalogo: string
  /** Probado 2 oct 2026: `freeform` rompe en OpenRouter (HTTP 400 «unknown variant custom»); null es lo seguro. */
  applyPatchToolType: 'freeform' | null
  /** Niveles de razonamiento que se anuncian a Codex. Sin esto, los del catálogo base (los de DeepSeek). */
  razonamiento?: { niveles: Esfuerzo[]; porDefecto: Esfuerzo }
}

export interface Ruta {
  /** Estable: `<modelo>@<proveedor>`. */
  id: string
  nombre: string
  /** Id que entiende el proveedor. */
  modelId: string
  proveedorId: string
  motor: Motor
  /** Espacio del chat que atiende esta ruta. Las rutas por API tienen el suyo: su hilo no se mezcla con otra cuenta. */
  cuenta: string
  codex?: RutaCodexPropia
  capacidades: { herramientas: boolean; vision: boolean; contexto: number; esfuerzos: Esfuerzo[] }
  precio?: { entrada: number; cache: number | null; salida: number; fuente: string }
  estado: 'validada' | 'experimental' | 'desactivada'
  validadaEn?: string
}

export interface Registro { version: 1; proveedores: Proveedor[]; rutas: Ruta[] }

/** Espacios por suscripción que ya existían. Su lista de modelos sale del catálogo vivo de cada motor. */
export const CUENTAS_SUSCRIPCION = ['default', 'bro', 'codex', 'yt'] as const

export const REGISTRO: Registro = {
  version: 1,
  proveedores: [
    { id: 'anthropic', nombre: 'Claude (suscripción Max)', baseUrl: 'https://api.anthropic.com', wire: 'anthropic-messages', auth: { kind: 'suscripcion', cuentas: ['default', 'bro'] } },
    { id: 'openai', nombre: 'OpenAI (ChatGPT Pro)', baseUrl: 'https://chatgpt.com', wire: 'openai-responses', auth: { kind: 'suscripcion', cuentas: ['codex', 'yt'] } },
    { id: 'openrouter', nombre: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', wire: 'openai-responses', auth: { kind: 'api-key', apiKeyEnv: 'OPENROUTER_API_KEY' } },
  ],
  rutas: [
    {
      id: 'deepseek-v4.1-flash@openrouter',
      nombre: 'DeepSeek V4.1 Flash',
      modelId: 'deepseek/deepseek-v4.1-flash',
      proveedorId: 'openrouter',
      motor: 'codex-app-server',
      cuenta: 'deepseek',
      codex: { providerId: 'openrouter', catalogo: 'deepseek-flash.json', applyPatchToolType: null },
      capacidades: { herramientas: true, vision: true, contexto: 1_048_576, esfuerzos: ['low', 'high', 'max'] },
      precio: { entrada: 0.15, cache: 0.003, salida: 0.60, fuente: 'openrouter.ai, 2026-10-02 (varía por endpoint)' },
      estado: 'experimental',
    },
    // Catálogo de modelos (2 oct 2026, 16:31): top 10 del Artificial Analysis Intelligence Index que vio Daniel
    // más GPT-6 Luna. Todos por OpenRouter con Codex como arnés, mismo catálogo base que DeepSeek; cada uno en su
    // espacio (su hilo no se mezcla con otro modelo: los items de razonamiento no son portables entre labs).
    // Precio y existencia se verifican en vivo contra OpenRouter (modelos/catalogo.ts), no se congelan aquí.
    rutaOpenRouter('gpt-6-luna', 'GPT-6 Luna', 'openai/gpt-6-luna', 'gpt-luna', 1_050_000),
    rutaOpenRouter('gpt-6-astra', 'GPT-6 Astra', 'openai/gpt-6-astra', 'gpt-astra', 1_050_000),
    rutaOpenRouter('gpt-6.1-sol', 'GPT-6.1 Sol', 'openai/gpt-6.1-sol', 'gpt-sol', 1_050_000),
    rutaOpenRouter('gemini-4-argon', 'Gemini 4 Argon', 'google/gemini-4-argon', 'gemini', 1_048_576),
    rutaOpenRouter('muse-spark-1.3', 'Muse Spark 1.3', 'meta/muse-spark-1.3', 'muse', 1_048_576),
    rutaOpenRouter('grok-4.7', 'Grok 4.7', 'x-ai/grok-4.7', 'grok', 500_000),
    rutaOpenRouter('mimo-v2.6-pro', 'MiMo-V2.6-Pro', 'xiaomi/mimo-v2.6-pro', 'mimo', 1_050_000),
    rutaOpenRouter('glm-5.3', 'GLM-5.3', 'z-ai/glm-5.3', 'glm', 1_048_576),
  ],
}

function rutaOpenRouter(id: string, nombre: string, modelId: string, cuenta: string, contexto: number): Ruta {
  const esfuerzos: Esfuerzo[] = ['low', 'medium', 'high']
  return {
    id: `${id}@openrouter`, nombre, modelId, proveedorId: 'openrouter', motor: 'codex-app-server', cuenta,
    codex: { providerId: 'openrouter', catalogo: 'deepseek-flash.json', applyPatchToolType: null, razonamiento: { niveles: esfuerzos, porDefecto: 'medium' } },
    capacidades: { herramientas: true, vision: true, contexto, esfuerzos },
    estado: 'experimental',
  }
}

export function proveedor(id: string): Proveedor | undefined { return REGISTRO.proveedores.find(p => p.id === id) }

/** Rutas que corren en el Codex App Server con proveedor propio (llave por API). */
export function rutasApi(): Ruta[] { return REGISTRO.rutas.filter(r => r.motor === 'codex-app-server' && r.codex && r.estado !== 'desactivada') }

/** Ruta de un espacio por API (`deepseek`), o undefined si el espacio es de suscripción. */
export function rutaDeCuenta(cuenta: string | null | undefined): Ruta | undefined {
  return cuenta ? rutasApi().find(r => r.cuenta === cuenta) : undefined
}
export const esCuentaApi = (cuenta: string | null | undefined): boolean => !!rutaDeCuenta(cuenta)

/** Todos los espacios que el daemon reconoce. Una conversación vieja de un espacio por API se sigue reconociendo con el interruptor apagado (se rechaza su turno, no se manda a otro motor). */
export function cuentasChat(): string[] { return [...CUENTAS_SUSCRIPCION, ...rutasApi().map(r => r.cuenta)] }
export const esCuentaChat = (cuenta: unknown): cuenta is string => typeof cuenta === 'string' && cuentasChat().includes(cuenta)

/**
 * Interruptor del motor Codex con proveedor propio. Apagado por defecto: sin `ARBRAIN_MOTOR_API=1` en
 * arbrain/server/.env nada cambia respecto a hoy. Se lee en cada llamada para que encenderlo o apagarlo
 * no exija reiniciar el daemon.
 */
export function motorApiEncendido(): boolean {
  return (process.env.ARBRAIN_MOTOR_API ?? readEnvFile(['ARBRAIN_MOTOR_API']).ARBRAIN_MOTOR_API) === '1'
}

/** ¿La variable de la llave existe en arbrain/server/.env? Devuelve solo un booleano, jamás el valor. */
export function llavePresente(p: Proveedor): boolean {
  if (p.auth.kind !== 'api-key') return true
  const nombre = p.auth.apiKeyEnv
  return !!(process.env[nombre] || readEnvFile([nombre])[nombre])
}

/** Vista pública del registro para la UI: nombres de variables y estados, nunca valores. */
export function registroPublico() {
  const encendido = motorApiEncendido()
  return {
    version: REGISTRO.version,
    motorApi: encendido,
    proveedores: REGISTRO.proveedores.map(p => ({
      id: p.id, nombre: p.nombre, wire: p.wire,
      auth: p.auth.kind === 'api-key' ? { kind: 'api-key' as const, variable: p.auth.apiKeyEnv, presente: llavePresente(p) } : { kind: 'suscripcion' as const, cuentas: p.auth.cuentas },
    })),
    rutas: REGISTRO.rutas.map(r => {
      const p = proveedor(r.proveedorId)
      const disponible = r.estado !== 'desactivada' && encendido && !!p && llavePresente(p)
      return {
        id: r.id, nombre: r.nombre, modelId: r.modelId, proveedorId: r.proveedorId, motor: r.motor, cuenta: r.cuenta,
        capacidades: r.capacidades, precio: r.precio ?? null, estado: r.estado, validadaEn: r.validadaEn ?? null,
        disponible,
        motivo: disponible ? null : r.estado === 'desactivada' ? 'Ruta desactivada en el registro.' : !encendido ? textoMotorApiApagado('Motor por API apagado (ARBRAIN_MOTOR_API).') : textoFaltaLlave(p?.auth.kind === 'api-key' ? p.auth.apiKeyEnv : '', `Falta la variable ${p?.auth.kind === 'api-key' ? p.auth.apiKeyEnv : ''} en arbrain/server/.env.`),
      }
    }),
  }
}
