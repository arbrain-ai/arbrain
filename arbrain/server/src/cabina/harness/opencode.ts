/**
 * opencode sin pantalla: `opencode run --format json` (verificado contra 1.18.27, 6 oct 2026). Es la puerta a
 * cualquier proveedor: `-m proveedor/modelo` (OpenRouter, OpenAI, DeepSeek, modelos locales). No emite un evento
 * «result»: el turno termina cuando el proceso sale (el último `step_finish` trae `reason: stop`).
 * `--auto` aprueba lo que la config no niega explícitamente (el equivalente a bypass).
 */
import { json, modeloRuta, num, obj, str, type Adaptador, type Evento } from './tipos.js'
import { posicional } from './claude.js'

const modelo = (m: string | null) => m ? ['-m', m] : []

export const opencode: Adaptador = {
  nombre: 'opencode',
  binario: 'opencode',
  // DeepSeek por OpenRouter (decisión del 2 oct): un default fuera de Anthropic a propósito.
  modeloDefault: env => env('CABINA_MODELO_OPENCODE') || 'openrouter/~deepseek/deepseek-v4-flash-latest',
  modeloOk: modeloRuta,
  sesionPropia: false,
  lanzar: p => ['run', '--format', 'json', ...modelo(p.modelo), ...(p.permisos === 'bypass' ? ['--auto'] : []), posicional(p.encargo)],
  reanudar: p => ['run', '--format', 'json', '-s', p.sesion, ...modelo(p.modelo), ...(p.permisos === 'bypass' ? ['--auto'] : []), posicional(p.texto)],
  leerEvento: l => {
    const d = json(l)
    if (!d) return null
    const e: Evento = {}
    const sesion = str(d.sessionID)
    if (sesion) e.sesion = sesion
    const part = obj(d.part)
    if (d.type === 'text') { const t = str(part.text)?.trim(); if (t) e.texto = t }
    else if (d.type === 'tool_use') e.herramienta = str(part.tool) ?? 'herramienta'
    else if (d.type === 'step_finish') { e.tokens = num(obj(part.tokens).total); if (part.reason === 'stop') e.fin = true }
    else if (d.type === 'error') { const er = obj(d.error); e.error = str(obj(er.data).message) ?? str(er.name) ?? 'error' }
    return Object.keys(e).length ? e : null
  },
  entorno: { OPENROUTER_API_KEY: { fuentes: ['OPENROUTER_API_KEY'] } },
  interactivo: (s, m) => ['-s', s, ...modelo(m)],
}
