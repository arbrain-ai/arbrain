// Tareas internas del turno (subagentes, comandos en segundo plano, workflows) vistas
// desde el chat. 1 oct 2026, pedido de Daniel: el detalle vive en el panel (Taller) y el
// hilo solo da la señal; aquí queda la lógica pura (sin React) para que sea verificable.
//
// Tipo y estado siguen el MISMO criterio que el servidor (arbrain/server/src/cabina/internos.ts:
// `tipoDe` y `ESTADO_SDK`) para que el chat y el panel nunca se contradigan: `killed` y
// `stopped` son «detenida» (no un fallo), `paused` sigue contando como trabajando.
import type { AgentTask } from '../hooks/useChat'
import type { TareaInterna } from '@/features/cabina/trabajos-modelo'

export type ClaseTarea = 'subagente' | 'comando' | 'workflow' | 'otra'
export type FaseTarea = 'viva' | 'hecha' | 'fallo' | 'detenida'

export function claseDeTarea(t: AgentTask): ClaseTarea {
  if (t.taskType === 'local_workflow' || t.workflowName) return 'workflow'
  if (t.taskType === 'local_bash' || t.taskType === 'shell') return 'comando'
  if (!t.taskType || t.taskType === 'local_agent' || t.taskType === 'remote_agent') return 'subagente'
  return 'otra'
}

export function faseDeTarea(t: AgentTask): FaseTarea {
  switch (t.status) {
    case 'completed': return 'hecha'
    case 'failed': return 'fallo'
    case 'stopped':
    case 'killed': return 'detenida'
    default: return 'viva' // running, pending y paused
  }
}

export const esViva = (t: AgentTask) => faseDeTarea(t) === 'viva'

/** Título de respaldo cuando el SDK no trajo descripción (mismas palabras que el panel). */
export const ETIQUETA_CLASE: Record<ClaseTarea, string> = {
  subagente: 'Subagente', comando: 'Comando en segundo plano', workflow: 'Workflow', otra: 'Tarea',
}

const NOMBRE: Record<ClaseTarea, [string, string]> = {
  subagente: ['subagente', 'subagentes'], comando: ['comando', 'comandos'], workflow: ['workflow', 'workflows'], otra: ['tarea', 'tareas'],
}
const ORDEN: ClaseTarea[] = ['subagente', 'comando', 'workflow', 'otra']

/** «2 subagentes y 3 comandos trabajando» · «1 subagente trabajando» (solo cuenta las vivas). */
export function textoVivas(tareas: AgentTask[]): string {
  const cuenta: Record<ClaseTarea, number> = { subagente: 0, comando: 0, workflow: 0, otra: 0 }
  for (const t of tareas) if (esViva(t)) cuenta[claseDeTarea(t)]++
  const partes = ORDEN.filter((c) => cuenta[c] > 0).map((c) => `${cuenta[c]} ${NOMBRE[c][cuenta[c] === 1 ? 0 : 1]}`)
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] ?? '')
  return `${lista} trabajando`
}

const DEL_PANEL: Record<TareaInterna['estado'], AgentTask['status']> = {
  trabajando: 'running', completada: 'completed', 'falló': 'failed', detenida: 'stopped',
}
/** Margen para no creerle a una lectura que pudo salir justo antes de que naciera la tarea. */
const MARGEN_MS = 1500

/**
 * El panel (Taller) es la verdad de lo que corre: la línea del chat promete «trabajando» solo
 * si el panel lo confirma. Una tarea que el chat guardó como viva pero que el panel ya cerró
 * (o que el servidor marcó «detenida» al reiniciarse) se muestra como terminada; así un turno
 * viejo no queda con un spinner eterno. Si el panel aún no leyó, o la lectura es anterior a que
 * esta tarea naciera, se respeta al chat (sin parpadeo al nacer).
 */
export function reconciliarConPanel(
  tareas: AgentTask[],
  internas: TareaInterna[] | undefined,
  leidoEn: number | undefined,
  vistaEn: (taskId: string) => number,
): AgentTask[] {
  if (!internas || !leidoEn) return tareas
  const porId = new Map(internas.map((i) => [i.id, i]))
  return tareas.map((t) => {
    if (!esViva(t)) return t
    const i = porId.get(t.taskId)
    if (i) {
      const status = DEL_PANEL[i.estado]
      if (status === 'running') return t
      return { ...t, status, ...(status !== 'completed' && i.nota && !t.error ? { error: i.nota } : {}) }
    }
    // Sin rastro en el panel (ya podado o nunca registrado), pero la lectura es posterior a verla nacer.
    return leidoEn > vistaEn(t.taskId) + MARGEN_MS ? { ...t, status: 'stopped' as const } : t
  })
}
