/**
 * Herramientas de Levy sobre el editor de video (MCP «editor», 19 nov 2026). Levy dirige: crea el proyecto desde una
 * toma, pide pases con una skill de estilo, lee las llamadas («dudas») y las versiones, exporta y elige proyecto. Las
 * ediciones finas las hace el agente del motor (su runner, con el prompt de Scarlet) por `pedir_pase`; así se conserva la
 * calidad medida por el examen. `abrir_editor` lo pone en la pantalla de Daniel por el bus del panel (comando `editor`).
 *
 * Puro salvo por lo que se inyecta (`Contexto`): las pruebas usan un motor falso.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DUENO } from '../dueno.js'
import { aEspanol, reloj } from './textos.js'
import type { LlamarMotor } from './motor.js'

export interface Contexto {
  motor: LlamarMotor
  /** El proyecto activo de esta conversación (o el más reciente del motor). */
  activo(): Promise<string | undefined>
  elegir(proyecto: string): void
  /** Lanza editor_ingesta.py desprendido sobre una carpeta de toma. */
  lanzarIngesta(carpeta: string, conPase: boolean): { pid?: number; log: string }
  /** Pide a la app de esta conversación abrir el editor (bus del panel, comando `editor`). */
  abrir(proyecto: string | undefined, titulo: string): Promise<{ text: string; confirmado: boolean }>
}

/** La skill de estilo del dueño en el motor: «/<nombre>-talking-head» (sin acentos, en minúsculas). */
export const SKILL_ESTILO = `/${DUENO.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-talking-head`
export const INGESTA = () => fileURLToPath(new URL('../../../../.claude/skills/edicion-de-video/scripts/obs/editor_ingesta.py', import.meta.url))

const S = { type: 'string' } as const
const PRJ = { type: 'string', description: 'prj_… (sin él, el proyecto activo)' } as const
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false })

export const HERRAMIENTAS_EDITOR = [
  { name: 'proyectos', description: `Lista los proyectos del editor de video (motor sin ventana): id, nombre, estado y cuál es el activo de esta conversación.`, inputSchema: obj({}) },
  { name: 'elegir_proyecto', description: `Fija el proyecto activo de esta conversación; las demás herramientas lo usan si no pasas proyecto.`, inputSchema: obj({ proyecto: S }, ['proyecto']) },
  { name: 'crear_desde_toma', description: `Crea el proyecto desde una carpeta de toma de OBS (camara.mp4, pantalla.mp4, datos/) y, salvo pase:false, arranca el corte con el estilo de ${DUENO}. Corre aparte (~25 min con pase) y al final le llega a ${DUENO} un solo aviso con sus dudas. Solo tomas que ${DUENO} pidió procesar.`, inputSchema: obj({ carpeta: S, pase: { type: 'boolean' } }, ['carpeta']) },
  { name: 'pedir_pase', description: `Pide al agente del motor una tarea de edición sobre el proyecto: una skill («${SKILL_ESTILO}», «/make-shorts», «/add-captions»…) o una instrucción en palabras. Devuelve la tarea; síguela con tarea.`, inputSchema: obj({ proyecto: PRJ, instruccion: S, esfuerzo: { type: 'string', enum: ['medium', 'high'] } }) },
  { name: 'tarea', description: `Estado de una tarea del motor (pase): en curso, terminada, su resumen y si pregunta algo. Con responder, contesta su pregunta; con cancelar:true, la corta.`, inputSchema: obj({ tarea: S, responder: S, cancelar: { type: 'boolean' } }, ['tarea']) },
  { name: 'llamadas', description: `Las dudas que el corte dejó para ${DUENO} («For you» de Scarlet), numeradas, con tramo y recomendación. Con decidir {cambio, cortar:[n…], conservar:[n…]} aplica lo que ${DUENO} eligió.`, inputSchema: obj({ proyecto: PRJ, cambio: S, cortar: { type: 'array', items: { type: 'integer' } }, conservar: { type: 'array', items: { type: 'integer' } } }) },
  { name: 'versiones', description: `Historial de versiones del proyecto (cada edición del agente o de ${DUENO}): id, qué cambió, duración y cuál es la actual.`, inputSchema: obj({ proyecto: PRJ }) },
  { name: 'abrir_editor', description: `Abre el editor de video en la pantalla de ${DUENO} (el monitor secundario, a pantalla completa) en un proyecto; sin proyecto ni activo, la galería. Solo si lo pide o para enseñarle sus dudas.`, inputSchema: obj({ proyecto: PRJ, galeria: { type: 'boolean' } }) },
  { name: 'exportar', description: `Exporta una versión (default la actual) a MP4 con el renderizador del motor; devuelve el render. Con render:<id> consulta su estado y la ruta del archivo.`, inputSchema: obj({ proyecto: PRJ, version: S, alto: { type: 'integer', enum: [720, 1080] }, render: S }) },
] as const

export const NOMBRES_EDITOR = new Set<string>(HERRAMIENTAS_EDITOR.map(h => h.name))

/** Herramientas de Scarlet que Levy ve por defecto: leer y conversar, no editar a mano (≈9 k caracteres; las 50 pesan 121 k por turno). */
export const SCARLET_VISIBLES = new Set(['project_get', 'change_list', 'change_get', 'timeline_diff', 'timeline_get', 'timeline_transcript', 'transcript_search', 'notes_list', 'note_reply', 'skills_list', 'export_otio'])

type Proyecto = { id: string; name: string; updatedAt?: string; createdAt?: string; head?: string | null; pendingChanges?: number; mediaCount?: number; activity?: { kind: string; fraction?: number }[] }
type Tarea = { id: string; kind: string; state: string; instruction?: string; summary?: string; reply?: string; question?: unknown; workedMs?: number; projectId: string }
type Cambio = { id: string; state: string; taskId?: string; fromVersion?: string; toVersion?: string; description?: string; cutAssessments?: { index: number; askOrder?: number; verdict: string; start: number; end: number; summary?: string; reason?: string }[] }
type Version = { version: string; description?: string; duration?: number; isHead?: boolean; createdAt?: string; author?: { type?: string; name?: string } }

export interface Llamada { n: number; cambio: string; indice: number; inicio: number; fin: number; resumen: string; razon: string }

/** Las dudas: cortes con veredicto «ask» en cambios que esperan revisión (state ready). */
export function llamadasDe(cambios: Cambio[]): Llamada[] {
  const out: Llamada[] = []
  for (const c of cambios) {
    if (c.state !== 'ready') continue
    for (const a of c.cutAssessments ?? []) if (a.verdict === 'ask') out.push({ n: a.askOrder ?? a.index + 1, cambio: c.id, indice: a.index, inicio: a.start, fin: a.end, resumen: a.summary ?? '', razon: a.reason ?? '' })
  }
  return out.sort((a, b) => a.n - b.n || a.inicio - b.inicio)
}

export const proyectoMasReciente = (ps: Pick<Proyecto, 'id' | 'updatedAt' | 'createdAt'>[]) => [...ps].sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''))[0]?.id

const estadoProyecto = (p: Proyecto) => {
  const act = (p.activity ?? []).map(a => ({ transcribing: 'transcribiendo', ingesting: 'importando', editing: 'cortando', rendering: 'renderizando' } as Record<string, string>)[a.kind] ?? a.kind)
  if (act.length) return act.join(', ')
  if (!p.head) return 'sin versión todavía'
  return p.pendingChanges ? `${p.pendingChanges} cambio(s) por revisar` : 'listo'
}

/** El nombre legible (la vista header del motor no lo trae). */
async function nombreDe(ctx: Contexto, p: string): Promise<string> {
  const { projects } = await ctx.motor<{ projects: Proyecto[] }>('GET', '/projects')
  const hit = projects.find(x => x.id === p)
  if (!hit) throw new Error(`El editor no tiene el proyecto ${p}; mira proyectos.`)
  return hit.name
}

async function proyectoDe(ctx: Contexto, o: Record<string, unknown>): Promise<string> {
  const p = typeof o.proyecto === 'string' && o.proyecto.trim() ? o.proyecto.trim() : await ctx.activo()
  if (!p) throw new Error('No hay proyectos en el editor todavía: créalo con crear_desde_toma.')
  if (!/^prj_[a-z0-9]+$/.test(p)) throw new Error('proyecto debe ser un id prj_….')
  return p
}

export async function ejecutarEditor(nombre: string, raw: unknown, ctx: Contexto): Promise<{ text: string; error?: boolean }> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  try {
    switch (nombre) {
      case 'proyectos': {
        const { projects } = await ctx.motor<{ projects: Proyecto[] }>('GET', '/projects')
        if (!projects.length) return { text: 'El editor no tiene proyectos todavía.' }
        const activo = await ctx.activo()
        return { text: projects.map(p => `${p.id === activo ? '▶ ' : '  '}${p.id} · ${p.name} · ${estadoProyecto(p)}`).join('\n') + `\n(▶ = activo en esta conversación)` }
      }
      case 'elegir_proyecto': {
        const p = await proyectoDe(ctx, o)
        const nombre = await nombreDe(ctx, p)
        ctx.elegir(p)
        return { text: `Proyecto activo: «${nombre}» (${p}). Las herramientas del editor ya trabajan sobre él.` }
      }
      case 'crear_desde_toma': {
        const carpeta = typeof o.carpeta === 'string' ? o.carpeta.trim().replace(/^~(?=\/)/, process.env.HOME ?? '~') : ''
        if (!carpeta || !path.isAbsolute(carpeta)) throw new Error('carpeta debe ser la ruta absoluta de la toma (~/Movies/OBS/tomas/<fecha>).')
        if (carpeta.split(path.sep).includes('abortadas')) throw new Error('Esa toma la apartó la guarda de cámara (abortadas): no se ingiere.')
        if (!existsSync(path.join(carpeta, 'camara.mp4'))) throw new Error(`${carpeta} no tiene camara.mp4: no es una toma de OBS.`)
        const r = ctx.lanzarIngesta(carpeta, o.pase !== false)
        return { text: `Ingesta lanzada${r.pid ? ` (pid ${r.pid})` : ''}: proyecto en el motor${o.pase !== false ? ` y pase ${SKILL_ESTILO}` : ''}. Tarda ~5 min el proyecto y ~20 el pase; el estado vive en ${path.join(carpeta, 'datos/estado.json')} › editor y el registro en ${r.log}.${o.pase !== false ? ` Al terminar le llega a ${DUENO} un solo aviso con sus dudas.` : ''} Consulta con proyectos.` }
      }
      case 'pedir_pase': {
        const p = await proyectoDe(ctx, o)
        const instruccion = typeof o.instruccion === 'string' && o.instruccion.trim() ? o.instruccion.trim().slice(0, 4000) : SKILL_ESTILO
        const esfuerzo = o.esfuerzo === 'medium' ? 'medium' : 'high'
        const { task } = await ctx.motor<{ task: Tarea }>('POST', `/projects/${p}/tasks`, { kind: 'edit', agent: 'claude', model: 'opus', effort: esfuerzo, instruction: instruccion })
        return { text: `Pase pedido en ${p}: tarea ${task.id} («${instruccion.slice(0, 80)}», Opus, esfuerzo ${esfuerzo}). Lo corre el agente del motor; síguelo con tarea {tarea:"${task.id}"}. Sus cortes seguros se aplican solos y las dudas quedan en llamadas.` }
      }
      case 'tarea': {
        const id = typeof o.tarea === 'string' ? o.tarea.trim() : ''
        if (!/^tsk_[a-z0-9]+$/.test(id)) throw new Error('tarea debe ser un id tsk_….')
        if (o.cancelar === true) { await ctx.motor('POST', `/tasks/${id}/cancel`, {}); return { text: `Tarea ${id} cancelada.` } }
        if (typeof o.responder === 'string' && o.responder.trim()) { await ctx.motor('POST', `/tasks/${id}/answer`, { text: o.responder.trim() }); return { text: `Respuesta entregada a la tarea ${id}; sigue trabajando.` } }
        const { task } = await ctx.motor<{ task: Tarea }>('GET', `/tasks/${id}`)
        const est = ({ queued: 'en cola', claimed: 'arrancando', running: 'trabajando', done: 'terminada', failed: 'falló', cancelled: 'cancelada', canceled: 'cancelada' } as Record<string, string>)[task.state] ?? task.state
        const preg = task.question ? `\nPregunta: ${typeof task.question === 'string' ? task.question : JSON.stringify(task.question)}` : ''
        return { text: `Tarea ${id} (${task.instruction ?? task.kind}): ${est}${task.workedMs ? `, ${Math.round(task.workedMs / 60000)} min de trabajo` : ''}.${task.summary ? `\nResumen: ${aEspanol(task.summary)}` : ''}${task.reply ? `\nLo que dice: ${task.reply.slice(0, 1500)}` : ''}${preg}` }
      }
      case 'llamadas': {
        const p = await proyectoDe(ctx, o)
        const decidir = typeof o.cambio === 'string' && o.cambio.trim()
        if (decidir) {
          const cortar = Array.isArray(o.cortar) ? o.cortar.map(Number) : []
          const conservar = Array.isArray(o.conservar) ? o.conservar.map(Number) : []
          const { changes } = await ctx.motor<{ changes: Cambio[] }>('GET', `/projects/${p}/changes`)
          const delCambio = llamadasDe(changes).filter(l => l.cambio === decidir)
          if (!delCambio.length) throw new Error(`El cambio ${decidir} no tiene llamadas pendientes.`)
          const choices = delCambio.filter(l => cortar.includes(l.n) || conservar.includes(l.n)).map(l => ({ index: l.indice, choice: cortar.includes(l.n) ? 'cut' : 'keep' }))
          if (!choices.length) throw new Error('Di qué llamadas cortar y cuáles conservar por su número.')
          const cambio = changes.find(c => c.id === decidir)!
          await ctx.motor('PUT', `/changes/${decidir}/cut-choices`, { fromVersion: cambio.fromVersion, toVersion: cambio.toVersion, choices })
          return { text: `Guardé la decisión en ${decidir}: cortar ${cortar.join(', ') || '—'}, conservar ${conservar.join(', ') || '—'}. Para aplicarla, ${DUENO} la aprueba en el editor (o tú con su «va»).` }
        }
        const { changes } = await ctx.motor<{ changes: Cambio[] }>('GET', `/projects/${p}/changes`)
        const ls = llamadasDe(changes)
        if (!ls.length) return { text: `Sin dudas pendientes en ${p}.` }
        return { text: `${ls.length} duda(s) para ${DUENO} en ${p}:\n` + ls.map(l => `${l.n}. ${reloj(l.inicio)}–${reloj(l.fin)} (${l.fin - l.inicio < 60 ? `${(l.fin - l.inicio).toFixed(1).replace('.', ',')} s` : reloj(l.fin - l.inicio)}) · ${l.resumen || l.razon.slice(0, 200)}\n   cambio ${l.cambio}`).join('\n') }
      }
      case 'versiones': {
        const p = await proyectoDe(ctx, o)
        const { versions } = await ctx.motor<{ versions: Version[] }>('GET', `/projects/${p}/versions`)
        if (!versions.length) return { text: `${p} no tiene versiones todavía.` }
        return { text: versions.slice(0, 25).map(v => `${v.isHead ? '▶ ' : '  '}${v.version} · ${reloj(v.duration)} · ${aEspanol(v.description) || '(sin descripción)'} · ${v.author?.type === 'human' ? DUENO : v.author?.name ?? '—'}`).join('\n') + (versions.length > 25 ? `\n… y ${versions.length - 25} más` : '') + '\n(▶ = la actual)' }
      }
      case 'abrir_editor': {
        const p = o.galeria === true ? undefined : await proyectoDe(ctx, o).catch(() => undefined)
        let titulo = 'Galería'
        if (p) titulo = await nombreDe(ctx, p)
        const r = await ctx.abrir(p, titulo)
        return { text: r.confirmado ? `Editor abierto en «${titulo}». ${r.text}` : r.text }
      }
      case 'exportar': {
        if (typeof o.render === 'string' && o.render.trim()) {
          const id = o.render.trim()
          const { render } = await ctx.motor<{ render: { state: string; progress?: number; error?: string } }>('GET', `/renders/${id}`)
          const listo = ['done', 'ready', 'complete', 'completed'].includes(render.state)
          return { text: listo ? `Render ${id} listo. Archivo: GET ${'/api'}/renders/${id}/file en el motor (para dejarlo en una carpeta, usa el exportar del motor).` : `Render ${id}: ${render.state}${render.progress != null ? ` ${Math.round(render.progress * 100)} %` : ''}${render.error ? ` · ${render.error}` : ''}.` }
        }
        const p = await proyectoDe(ctx, o)
        let version = typeof o.version === 'string' && o.version.trim() && o.version !== 'head' ? o.version.trim() : undefined
        if (!version) version = (await ctx.motor<{ project: Proyecto }>('GET', `/projects/${p}?view=header`)).project.head ?? undefined
        if (!version) throw new Error(`${p} no tiene versión que exportar.`)
        const alto = o.alto === 720 ? 720 : 1080
        const { render } = await ctx.motor<{ render: { id: string } }>('POST', `/projects/${p}/renders`, { kind: 'export', quality: 'delivery', version, exportOptions: { height: alto, omitCaptions: false } })
        return { text: `Export ${alto}p de ${p}@${version} en marcha: render ${render.id} (un corte de 15 min tarda ~3 min a 720p). Consulta con exportar {render:"${render.id}"}.` }
      }
    }
    throw new Error(`Herramienta desconocida: ${nombre}`)
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), error: true }
  }
}
