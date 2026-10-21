/**
 * Gemini CLI sin pantalla: `gemini -p <prompt> -o stream-json` (verificado contra 0.56.0, 6 oct 2026). Acepta una
 * sesión fijada por Levy (`--session-id <uuid>`) y se reanuda con `-r <uuid>`. `--skip-trust` evita el diálogo de
 * confiar en la carpeta. Sin modelo explícito («auto») la petición falló con «fetch failed»: va uno fijo.
 * La credencial de la casa es GOOGLE_API_KEY; el CLI la quiere como GEMINI_API_KEY.
 */
import { json, modeloSimple, num, obj, str, type Adaptador, type Evento, type Permisos } from './tipos.js'
import { posicional } from './claude.js'

const permisos = (p: Permisos) => ['--approval-mode', p === 'bypass' ? 'yolo' : 'auto_edit']
const modelo = (m: string | null) => m ? ['-m', m] : []

export const gemini: Adaptador = {
  nombre: 'gemini',
  binario: 'gemini',
  modeloDefault: env => env('CABINA_MODELO_GEMINI') || 'gemini-2.5-flash',
  modeloOk: modeloSimple,
  sesionPropia: true,
  lanzar: p => ['-p', posicional(p.encargo), '-o', 'stream-json', '--skip-trust', ...(p.sesion ? ['--session-id', p.sesion] : []), ...modelo(p.modelo), ...permisos(p.permisos)],
  reanudar: p => ['-r', p.sesion, '-p', posicional(p.texto), '-o', 'stream-json', '--skip-trust', ...modelo(p.modelo), ...permisos(p.permisos)],
  leerEvento: l => {
    const d = json(l)
    if (!d) return null
    if (d.type === 'init') { const s = str(d.session_id); return s ? { sesion: s } : null }
    if (d.type === 'message' && d.role === 'assistant') { const t = str(d.content); return t ? { texto: t, ...(d.delta === true ? { delta: true } : {}) } : null }
    if (d.type === 'tool_use') return { herramienta: str(d.tool_name) ?? 'herramienta' }
    if (d.type === 'error') return d.severity === 'warning' ? null : { error: str(d.message) ?? 'error' }
    if (d.type === 'result') {
      const e: Evento = { fin: true, tokens: num(obj(d.stats).total_tokens) }
      if (d.status && d.status !== 'success') e.error = str(obj(d.error).message) ?? String(d.status)
      return e
    }
    return null
  },
  entorno: { GEMINI_API_KEY: { fuentes: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] } },
  interactivo: (s, m) => ['-r', s, ...modelo(m), '--approval-mode', 'yolo'],
}
