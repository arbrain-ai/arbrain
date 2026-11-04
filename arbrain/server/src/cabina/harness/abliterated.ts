/**
 * Modo «abliterated» (3 nov 2026, Daniel: «quiero montar nosotros el procesamiento con estas APIs de las GPUs, quiero
 * aprender y experimentar»): el MISMO Claude Code (`claude -p --output-format stream-json`) apuntado a un endpoint con
 * formato Anthropic (`/v1/messages`) que no es Anthropic. El default `claude` no cambia: esto es otro nombre de harness.
 *
 * Dos destinos, el mismo adaptador:
 *  - api.abliteration.ai (modelo `abliterated-model-large-flash`): el default. Llave en `ABLITERATION_AI_API_KEY`.
 *  - nuestro pod de RunPod (vLLM con DeepSeek-V4.1-Flash-1017 abliterated): `arbrain/scripts/gpu/deepseek-abliterated/
 *    ds41.py conectar` escribe `ABLITERATED_BASE_URL`, `ABLITERATED_API_KEY` y `CABINA_MODELO_ABLITERATED` en el .env
 *    del agent-server; `desconectar` los quita y se vuelve a abliteration.ai.
 *
 * Aislamiento: corre con su propia carpeta de Claude Code (`CLAUDE_CONFIG_DIR`), así el login de Daniel en Anthropic
 * nunca viaja a un tercero; el token va por `ANTHROPIC_AUTH_TOKEN` (cabecera Bearer). Sin token no lanza (`requiere`).
 * Perfil «lectura» por default (primeras pruebas): pedir `perfil: total` o `codigo` es explícito.
 * Sin catálogo vivo ni `--effort`: el servidor no es de Anthropic y el esfuerzo lo decide su plantilla (max).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { claude } from './claude.js'
import type { Adaptador } from './tipos.js'

export const ABLITERATION_AI = 'https://api.abliteration.ai'
export const MODELO_ABLITERATED = 'abliterated-model-large-flash'
/** Carpeta propia de Claude Code para este modo: sin credenciales de Anthropic adentro. */
export const CONFIG_ABLITERATED = join(homedir(), '.config/arbrain/claude-abliterated')

const modeloDe = { fuentes: ['CABINA_MODELO_ABLITERATED'], valor: MODELO_ABLITERATED }
/** Lo que el CLI no debe pedirle a Anthropic: sin esto, sus llamadas de fondo (haiku) irían con un modelo que el
 *  endpoint no conoce, y la telemetría saldría hacia Anthropic sin cuenta. */
const sinAnthropic = {
  ANTHROPIC_DEFAULT_OPUS_MODEL: modeloDe,
  ANTHROPIC_DEFAULT_SONNET_MODEL: modeloDe,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: modeloDe,
  ANTHROPIC_SMALL_FAST_MODEL: modeloDe,
  CLAUDE_CODE_SUBAGENT_MODEL: modeloDe,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: { valor: '1' },
  // betas de Anthropic (context management, etc.) que un adaptador de vLLM rechazaría con 400
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: { valor: '1' },
}

export const abliterated: Adaptador = {
  ...claude,
  nombre: 'abliterated',
  binario: 'claude',
  modeloDefault: env => env('CABINA_MODELO_ABLITERATED') || MODELO_ABLITERATED,
  recibeEsfuerzo: false,
  cuentaCatalogo: undefined,
  perfilDefault: 'lectura',
  entorno: {
    ANTHROPIC_BASE_URL: { fuentes: ['ABLITERATED_BASE_URL'], valor: ABLITERATION_AI },
    // primero el del pod (si `conectar` lo dejó), luego la llave de abliteration.ai
    ANTHROPIC_AUTH_TOKEN: { fuentes: ['ABLITERATED_API_KEY', 'ABLITERATION_AI_API_KEY'] },
    CLAUDE_CONFIG_DIR: { valor: CONFIG_ABLITERATED },
    ...sinAnthropic,
  },
  requiere: ['ANTHROPIC_AUTH_TOKEN'],
  // el mismo argv de claude, nunca con `--effort` (el servidor no lo entiende; el esfuerzo lo fija su plantilla)
  lanzar: p => claude.lanzar({ ...p, esfuerzo: null }),
  reanudar: p => claude.reanudar({ ...p, esfuerzo: null }),
  vivo: { protocolo: 'claude-stream', argv: p => claude.vivo!.argv({ ...p, esfuerzo: null }) },
  interactivo: (s, m) => claude.interactivo(s, m, null),
}
