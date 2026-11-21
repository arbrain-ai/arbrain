/**
 * Cuartel de YouTube · banco de ideas (v2, 15 nov 2026): lo que la pestaña Ideas puede pedir, validado antes de tocar el
 * proceso. Puro (sin Next ni disco) para poder probarlo. `generar` sigue yendo a `cerebro.py` (lee el video primero);
 * lo demás va a `ideas.py`, que es el dueño del banco y de «Tu tipo de contenido».
 */
import { ESTADOS_IDEA, idVideo } from './cerebro-pedidos'

export type PedidoIdeas = { guion: 'cerebro' | 'ideas'; args: string[]; ms: number } | { error: string }

export const MOTIVOS_FUERA = ['no_es_mi_nicho', 'ya_lo_hice', 'no_me_late'] as const
export const DECISIONES_TIPO = ['si', 'ajustar', 'no'] as const

const ID_IDEA = /^idea-[A-Za-z0-9_-]{3,80}$/
const texto = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
const esIdea = (x: unknown): x is string => typeof x === 'string' && ID_IDEA.test(x)

export const PEDIDO_BANCO: PedidoIdeas = { guion: 'ideas', args: ['banco'], ms: 20_000 }

export function pedidoBanco(cuerpo: unknown): PedidoIdeas {
  const b = (cuerpo ?? {}) as Record<string, unknown>
  switch (b.accion) {
    case 'generar':
      if (!idVideo(b.video_id)) return { error: 'Video inválido.' }
      return { guion: 'cerebro', args: ['ideas', `--video=${b.video_id}`], ms: 240_000 }
    case 'estado': {
      if (!esIdea(b.id)) return { error: 'Idea inválida.' }
      if (!ESTADOS_IDEA.includes(b.estado as (typeof ESTADOS_IDEA)[number])) return { error: `El estado es uno de: ${ESTADOS_IDEA.join(', ')}.` }
      const motivo = MOTIVOS_FUERA.includes(b.motivo as (typeof MOTIVOS_FUERA)[number]) && b.estado === 'descartada' ? [`--motivo=${b.motivo as string}`] : []
      return { guion: 'ideas', args: ['estado', b.id, b.estado as string, ...motivo], ms: 30_000 }
    }
    case 'backlog': {
      // «A mi backlog»: fija el título elegido, deja el brief y crea la semilla en Todoist › YouTube (sin fecha).
      if (!esIdea(b.id)) return { error: 'Idea inválida.' }
      const n = b.titulo
      if (n != null && !(Number.isInteger(n) && (n as number) >= 0 && (n as number) < 10)) return { error: 'Título inválido.' }
      return { guion: 'ideas', args: ['backlog', b.id, ...(n != null ? [`--titulo=${n as number}`] : [])], ms: 45_000 }
    }
    case 'firmar': {
      // La firma de «Tu tipo de contenido» es del dueño: sí, ajustar (con su nota) o no.
      if (!DECISIONES_TIPO.includes(b.decision as (typeof DECISIONES_TIPO)[number])) return { error: 'La decisión es «si», «ajustar» o «no».' }
      const nota = texto(b.nota).slice(0, 600)
      if (b.decision === 'ajustar' && !nota) return { error: 'Para ajustarla, di qué cambiar.' }
      return { guion: 'ideas', args: ['firmar', b.decision as string, ...(nota ? [`--nota=${nota}`] : [])], ms: 20_000 }
    }
    case 'tipo':
      return { guion: 'ideas', args: ['tipo', ...(b.rehacer === true ? ['--rehacer'] : [])], ms: 280_000 }
    case 'refrescar':
      return { guion: 'ideas', args: ['refrescar'], ms: 290_000 }
    case 'tuya': {
      // «+ Idea» (19 nov): la idea del dueño en una línea, escrita o dictada; entra al banco con su fuente y sin reescribirse.
      const t = texto(b.texto).replace(/\s+/g, ' ')
      if (!t) return { error: 'Escribe la idea.' }
      if (t.length > 600) return { error: 'La idea pasa de 600 caracteres: dila en una o dos líneas.' }
      return { guion: 'ideas', args: ['tuya', `--texto=${t}`], ms: 20_000 }
    }
    case 'titular':
      // Títulos y miniatura (boceto) para una idea suya: tarda lo que tarda el modelo.
      if (!esIdea(b.id)) return { error: 'Idea inválida.' }
      return { guion: 'ideas', args: ['titular', b.id], ms: 200_000 }
    default:
      return { error: 'La acción es «generar», «estado», «backlog», «firmar», «tipo», «refrescar», «tuya» o «titular».' }
  }
}
