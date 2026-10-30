/**
 * Qwen Code sin pantalla: `qwen -p <prompt> -o stream-json` (verificado contra 0.22.0, 6 oct 2026). Habla el mismo
 * stream-json que Claude Code. Sin auth propia en el Studio: va por su modo OpenAI-compatible (`--auth-type openai`)
 * contra OpenRouter con la llave de la casa; CABINA_QWEN_BASE_URL/CABINA_QWEN_API_KEY lo apuntan a otro endpoint.
 * `--yolo` y `--auth-type` no salen en su `--help`, pero el CLI los acepta (probado).
 * Ojo: en la shell de Daniel `qwen` es un alias de llama-cli; aquí se llama al binario, no al alias.
 */
import { modeloRuta, modeloSimple, num, type Adaptador } from './tipos.js'
import { leerEstiloClaude, posicional } from './claude.js'
import { esEdicionCliente } from '../../edicion.js'

const modelo = (m: string | null) => m ? ['-m', m] : []
const permisos = (bypass: boolean, perfil?: string) => perfil === 'lectura' ? ['--approval-mode', 'plan'] : bypass ? ['--yolo'] : []

export const qwen: Adaptador = {
  nombre: 'qwen',
  binario: 'qwen',
  modeloDefault: env => env('CABINA_MODELO_QWEN') || 'qwen/qwen3-coder',
  modeloOk: m => modeloSimple(m) || modeloRuta(m),
  recibeEsfuerzo: false,
  sesionPropia: false,
  perfiles: ['total', 'lectura'],
  lanzar: p => ['--auth-type', 'openai', '-p', posicional(p.encargo), '-o', 'stream-json', ...modelo(p.modelo), ...permisos(p.permisos === 'bypass', p.perfil)],
  reanudar: p => ['--auth-type', 'openai', '-r', p.sesion, '-p', posicional(p.texto), '-o', 'stream-json', ...modelo(p.modelo), ...permisos(p.permisos === 'bypass', p.perfil)],
  leerEvento: l => leerEstiloClaude(l, u => num(u.total_tokens) || num(u.input_tokens) + num(u.output_tokens)),
  entorno: {
    OPENAI_API_KEY: { fuentes: ['CABINA_QWEN_API_KEY', 'OPENROUTER_API_KEY'] },
    OPENAI_BASE_URL: { fuentes: ['CABINA_QWEN_BASE_URL'], valor: 'https://openrouter.ai/api/v1' },
    QWEN_CODE_SUPPRESS_YOLO_WARNING: { valor: '1' },
  },
  interactivo: (s, m) => ['--auth-type', 'openai', '-r', s, ...modelo(m), ...(esEdicionCliente() ? [] : ['--yolo'])],
}
