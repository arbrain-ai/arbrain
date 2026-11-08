import './process-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { FranjaPlan } from '../../src/features/planning/FranjaPlan'
import { ListaDia, type Prioridad } from '../../src/features/planning/ListaDia'
import { Segmentos } from '../../src/features/planning/ObjetivoCaja'
import { listaDelDia, type ItemDia } from '../../src/features/planning/lista-dia'
import type { PlanTask } from '../../src/features/planning/types'
import '../../src/app/globals.css'

// El Hoy del dom 8 nov 2026 (8 nov, Daniel: «¿por qué unas casillas son cuadradas y otras círculo?» y prioridades «justo como lo hace y
// permite Todoist»). Criterios tal como están en .claude/plan/objetivos.md y las tareas de Todoist del día (API v1, 8 nov 09:30); las dos
// últimas tareas (P3 vencida y P4) completan la escala de colores. La ListaDia y listaDelDia son las reales; la prioridad se cambia en local.
const q = new URLSearchParams(location.search)
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')
localStorage.setItem('arbrain.calendario.franja-abierta', '1')
const DIA = '2026-11-08', ZONA = 'America/Mexico_City'
const tarea = (id: string, title: string, due: string, priority: number, extra: Partial<PlanTask> = {}): PlanTask => ({
  id, externalId: id, kind: 'task', title, description: '', projectId: null, sectionId: null, parentId: null, priority, due, timeZone: null,
  recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: null, ...extra,
})
const CRITERIOS = [
  { linea: 0, texto: 'Cola de la semana del canal de Levy revisada y con tu sí', hecho: false },
  { linea: 1, texto: 'Permiso de estadísticas de YouTube tocado en la bandeja', hecho: true },
  { linea: 2, texto: 'Mensajes de cobro a Fulano, Mengano y Zutano enviados', hecho: false },
  { linea: 3, texto: 'Rutina 5:30 + gym de abdomen y correr', hecho: false },
  { linea: 4, texto: 'Revisión corta de la semana', hecho: false },
]
const ABIERTAS = [
  tarea('6hwmQ7CWGrCqjG5W', 'Mandar a Fulano, Mengano y Zutano el aviso amable de pago (borradores abajo)', DIA, 1),
  tarea('6hwvGR8Fr9FGJM2W', 'Revisar y dar tu sí a la cola de la semana del canal de Levy', DIA, 1),
  tarea('caja', '🎨 miplataforma.com: mejor UI para la caja de comunidad', '2026-11-06', 3),
  tarea('vps', '🖥️ Comprar VPS desechable para la beta del modo espejo', DIA, 4),
]
const COMPLETADAS = [tarea('6hwvGRFwFq5QPhf4', 'Tocar en la bandeja el permiso de estadísticas de YouTube (canal de Levy)', DIA, 2, { completed: true, completedAt: '2026-11-08T15:07:54Z' })]

function Hoy() {
  const [prio, setPrio] = React.useState<Record<string, number>>({})
  const conPrio = (t: PlanTask) => ({ ...t, priority: prio[t.id] ?? t.priority })
  const items: ItemDia[] = React.useMemo(() => listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: CRITERIOS, abiertas: ABIERTAS.map(conPrio), completadas: COMPLETADAS.map(conPrio) }), [prio]) // eslint-disable-line react-hooks/exhaustive-deps
  ;(window as unknown as { __items: ItemDia[] }).__items = items
  const hechas = items.filter(i => i.hecho).length
  const detalle = <>
    <Segmentos k={hechas} n={items.length} i={1} />
    <ListaDia items={items} alternar={() => {}} puede={() => true} evento={new Map()} onAbrir={() => {}} onNueva={() => {}}
      onPrioridad={(t: PlanTask, p: Prioridad) => setPrio(x => ({ ...x, [t.id]: p }))} />
  </>
  return <div style={{ maxWidth: 720, margin: '0 auto', padding: '18px 22px 40px' }}>
    <div style={{ padding: '0 0 14px', fontSize: 20, fontWeight: 650 }}>Dom 8 nov</div>
    <FranjaPlan rotulo="Hoy" titulo="Dejar corriendo la primera máquina de adquisición: el canal de Levy programado desde el lunes" vacio="Sin objetivo del día."
      cuenta={{ k: hechas, n: items.length }} detalle={detalle} />
  </div>
}
createRoot(document.getElementById('root')!).render(<div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}><Hoy /></div>)
