'use client'
import { useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, GitBranch, SquareTerminal, Workflow, CircleDot, X, Square } from 'lucide-react'
import type { AgentTask } from '../hooks/useChat'
import { useFuente } from '@/features/cabina/datos'
import { urlPanel } from '@/features/cabina/panel/datos'
import type { Trabajos } from '@/features/cabina/trabajos-modelo'
import { abrirTallerDelPanel } from '../lib/abrir-taller'
import {
  claseDeTarea, esViva, ETIQUETA_CLASE, faseDeTarea, reconciliarConPanel, textoVivas,
  type ClaseTarea,
} from '../lib/tareas-turno'

// Subagentes, comandos en segundo plano y workflows del turno (SDK 0.3.201: task_started →
// task_progress → task_notification). 1 oct 2026, pedido de Daniel («así como ocultaste las
// noventa y seis herramientas, quizá tampoco debería ver esto»): el detalle vive en el panel
// (Taller → «Dentro de los turnos de Levy») y el hilo solo da la señal:
//   · corriendo  → UNA línea «◌ 2 agentes y 3 comandos trabajando ›» que abre el Taller;
//   · terminadas → un chip «N tareas» hermano de «N herramientas», expandible;
//   · fallidas   → el chip lo dice discreto («· 1 falló»), sin tarjeta roja suelta.

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${Math.round(n / 1_000)}K`
  : String(n)

// Mismos íconos que el panel (Tipo.tsx): rama = subagente, terminal = comando.
const ICONO_CLASE: Record<ClaseTarea, typeof GitBranch> = {
  subagente: GitBranch, comando: SquareTerminal, workflow: Workflow, otra: CircleDot,
}

// Pastilla del chip (idéntica a «N herramientas»). En teléfono el botón mide 44 px de alto
// (blanco táctil) y la pastilla visible queda centrada dentro; en escritorio es solo la pastilla.
const BOTON = 'group inline-flex items-center cursor-pointer max-md:min-h-11 focus-visible:outline-none'
const PASTILLA = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors group-active:scale-[0.97] group-focus-visible:ring-2 group-focus-visible:ring-brand/50'

function FilaTarea({ task }: { task: AgentTask }) {
  // El resumen final puede ser un párrafo: 2 líneas, y al tocar se abre completo.
  const [abierta, setAbierta] = useState(false)
  const clase = claseDeTarea(task)
  const fase = faseDeTarea(task)
  const Icono = ICONO_CLASE[clase]
  const titulo = task.description?.trim() || ETIQUETA_CLASE[clase]
  const texto = (task.error ?? task.summary)?.trim()
  // En los comandos el resumen repite el título: solo se muestra si dice algo más.
  const detalle = texto && texto !== titulo ? texto : null
  const meta = [
    clase === 'workflow' ? task.workflowName : clase === 'subagente' ? task.subagentType : null,
    task.totalTokens != null ? `${fmtTokens(task.totalTokens)} tokens` : null,
    task.toolUses ? `${task.toolUses} herramientas` : null,
    fase === 'detenida' ? 'detenida' : null,
  ].filter(Boolean).join(' · ')
  const falla = fase === 'fallo'
  const Raiz = detalle ? 'button' : 'div'

  return (
    <Raiz
      {...(detalle ? { type: 'button' as const, onClick: () => setAbierta((a) => !a), 'aria-expanded': abierta } : {})}
      className={`w-full min-w-0 text-left rounded-lg px-2 py-1.5 text-[11px] leading-snug ${falla ? 'bg-error/[0.07]' : ''} ${detalle ? 'cursor-pointer max-md:min-h-11 hover:bg-foreground/[0.04] transition-colors' : ''}`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {falla ? <X size={11} className="shrink-0 text-error" />
          : fase === 'detenida' ? <Square size={9} fill="currentColor" className="shrink-0 mx-px text-muted/70" />
          : <Check size={11} className="shrink-0 text-gold-dark dark:text-gold-bright" />}
        <Icono size={11} className={`shrink-0 ${falla ? 'text-error' : 'text-muted'}`} />
        <span className={`truncate font-medium ${falla ? 'text-error' : 'text-foreground/80'}`}>{titulo}</span>
      </span>
      {(meta || detalle) && (
        <span className="mt-0.5 block pl-[34px] text-[10px] text-muted/80">
          {meta && <span className="block font-mono truncate">{meta}</span>}
          {detalle && <span className={abierta ? 'block' : 'line-clamp-2'}>{detalle}</span>}
        </span>
      )}
    </Raiz>
  )
}

/** `soloVivas`: el turno sigue en curso y las terminadas esperan en su rastro plegado (25 oct 2026). */
export function AgentTaskCards({ tasks, soloVivas = false }: { tasks: AgentTask[]; soloVivas?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  // Cuándo vio este componente nacer cada tarea (para no creerle a una lectura del panel
  // anterior a ella; ver reconciliarConPanel).
  const vistas = useRef(new Map<string, number>())
  const ahora = Date.now()
  for (const t of tasks) if (!vistas.current.has(t.taskId)) vistas.current.set(t.taskId, ahora)

  // Solo se lee el panel mientras el chat cree que algo corre: es la MISMA lectura que usa el
  // panel (una sola petición compartida), y confirma o desmiente el «trabajando» del hilo.
  const lectura = useFuente<Trabajos>(tasks.some(esViva) ? urlPanel(false) : null, 4000)
  if (!tasks.length) return null
  const todas = reconciliarConPanel(tasks, lectura.data?.internas, lectura.leidoEn, (id) => vistas.current.get(id) ?? ahora)

  const vivas = todas.filter(esViva)
  const hechas = soloVivas ? [] : todas.filter((t) => !esViva(t))
  if (soloVivas && !vivas.length) return null
  const fallaron = hechas.filter((t) => faseDeTarea(t) === 'fallo').length
  // Al abrir el chip, lo que falló va primero: es lo único que pide mirar.
  const lista = abierto ? [...hechas.filter((t) => faseDeTarea(t) === 'fallo'), ...hechas.filter((t) => faseDeTarea(t) !== 'fallo')] : []

  return (
    // aria-hidden: chrome del turno — iOS Speak Screen solo debe leer la respuesta
    <div aria-hidden className="flex flex-wrap items-center gap-x-1.5 my-1.5 max-md:my-0" data-tts-exclude>
      {vivas.length > 0 && (
        <button type="button" onClick={abrirTallerDelPanel} title="Verlos en el Taller" className={BOTON}>
          {/* 28 oct 2026: la pastilla morada de antes, con punto quieto en vez del giro. */}
          <span className={`${PASTILLA} bg-brand/10 border-brand/25 text-brand-ink group-hover:border-brand/45`}>
            <span className="size-1.5 rounded-full bg-brand shrink-0" aria-hidden />
            {textoVivas(vivas)}
            <ChevronRight size={10} className="shrink-0" />
          </span>
        </button>
      )}
      {hechas.length > 0 && (
        <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className={BOTON}>
          <span className={`${PASTILLA} bg-card border-border-subtle text-muted group-hover:text-foreground/75 group-hover:border-border`}>
            <Check size={10} className="shrink-0" />
            {hechas.length} {hechas.length === 1 ? 'tarea' : 'tareas'}
            {fallaron > 0 && <span className="text-error">· {fallaron} {fallaron === 1 ? 'falló' : 'fallaron'}</span>}
            <ChevronDown size={10} className={`shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </span>
        </button>
      )}
      {abierto && hechas.length > 0 && (
        <div className="w-full my-1 max-h-80 overflow-y-auto rounded-xl border border-border-subtle bg-card p-1 animate-in fade-in duration-150">
          {lista.map((t) => <FilaTarea key={t.taskId} task={t} />)}
        </div>
      )}
    </div>
  )
}
