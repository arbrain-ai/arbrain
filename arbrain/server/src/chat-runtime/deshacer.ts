/**
 * «Deshacer desde aquí» (27 oct 2026, nodo deshacer del harness de la noche).
 *
 * El SDK guarda, con `enableFileCheckpointing`, una copia de cada archivo antes de que Edit/Write/NotebookEdit lo
 * toque (en `<config>/file-history/<sesión>/`). `Query.rewindFiles(uuidDelMensaje)` devuelve los archivos a como
 * estaban justo antes de ese mensaje del usuario. En el chat durable, el uuid del mensaje es el `turnId` del cliente
 * (claude-session.ts lo empuja como `uuid`) y el journal lo confirma en `native_turn_id` cuando el CLI lo reconoce:
 * ese par (sesión nativa, turno nativo) es el punto de restauración de cada mensaje, ya guardado.
 *
 * Reversible: antes de rebobinar se copia el estado actual de cada archivo que va a volver a `STORE_DIR/deshacer/<id>/`;
 * «Rehacer» lo devuelve. Nada se borra en duro: lo que el rehacer quita se mueve a la carpeta del respaldo.
 * Lo que cambió por comandos (Bash) no lo sigue el SDK y no se deshace: la vista previa lo dice.
 *
 * Se apaga con `ARBRAIN_CHECKPOINTS=0` (el query ya no lleva la opción y el endpoint responde que está apagado).
 */
import type { Options, Query, RewindFilesResult } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { TurnIdentity, TurnRecord } from './journal.js'

export function checkpointsActivos(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.ARBRAIN_CHECKPOINTS ?? '').trim().toLowerCase()
  return !['0', 'false', 'no', 'off', 'apagado'].includes(v)
}

/** Lo que el query del chat añade a sus opciones. Vacío si está apagado (la firma del pool no cambia por nada). */
export function opcionesCheckpoint(env: NodeJS.ProcessEnv = process.env): Pick<Options, 'enableFileCheckpointing'> {
  return checkpointsActivos(env) ? { enableFileCheckpointing: true } : {}
}

export type Rebobinador = Pick<Query, 'rewindFiles'>
export interface DeshacerDeps {
  turno: (id: TurnIdentity) => TurnRecord | null
  /** Hay un turno corriendo en esta conversación: no se rebobina debajo de él. */
  ocupada: (id: Omit<TurnIdentity, 'turnId'>) => boolean
  /** El proceso Claude vivo y libre de la conversación, si es de esa misma sesión nativa. */
  vivo: (id: Omit<TurnIdentity, 'turnId'>, sesion: string) => Rebobinador | undefined
  /** Abre un proceso que solo reanuda la sesión para rebobinar (sin mensaje, sin coste de modelo). */
  abrir: (sesion: string, account: string) => Promise<{ q: Rebobinador; cerrar: () => void }>
  dirRespaldos: string
  activo?: () => boolean
}

export interface VistaDeshacer {
  ok: boolean
  /** Qué archivos volverían y cuántas líneas. Solo en la vista previa (el SDK no lo da en el real). */
  archivos: string[]
  inserciones: number
  borrados: number
  /** Real: id para «Rehacer». */
  respaldoId?: string
  error?: string
  /** Motivo legible cuando no se puede (apagado, turno sin punto, conversación ocupada). */
  motivo?: 'apagado' | 'sin_punto' | 'ocupada' | 'sdk'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const no = (motivo: VistaDeshacer['motivo'], error: string): VistaDeshacer => ({ ok: false, archivos: [], inserciones: 0, borrados: 0, motivo, error })

/** El punto de restauración del turno: solo turnos Claude cuyo uuid el CLI confirmó (Codex no tiene checkpoint). */
export function puntoDeRestauracion(turn: TurnRecord | null): { sesion: string; mensaje: string } | null {
  if (!turn?.nativeThreadId || !turn.nativeTurnId || turn.nativeTurnId !== turn.turnId || !UUID.test(turn.nativeTurnId)) return null
  return { sesion: turn.nativeThreadId, mensaje: turn.nativeTurnId }
}

async function conRebobinador<T>(deps: DeshacerDeps, id: TurnIdentity, sesion: string, fn: (q: Rebobinador) => Promise<T>): Promise<T> {
  const vivo = deps.vivo(id, sesion)
  if (vivo) return fn(vivo)
  const abierto = await deps.abrir(sesion, id.account)
  try { return await fn(abierto.q) } finally { abierto.cerrar() }
}

/** Vista previa (dryRun) o deshacer real del turno `id`: los archivos vuelven a como estaban antes de él. */
export async function deshacerDesde(deps: DeshacerDeps, id: TurnIdentity, opciones: { dryRun: boolean }): Promise<VistaDeshacer> {
  if (!(deps.activo ?? checkpointsActivos)()) return no('apagado', 'Deshacer está apagado en esta instalación (ARBRAIN_CHECKPOINTS=0).')
  const punto = puntoDeRestauracion(deps.turno(id))
  if (!punto) return no('sin_punto', 'Este mensaje no tiene punto de restauración (es anterior a la función, de Codex o no llegó al motor).')
  if (deps.ocupada(id)) return no('ocupada', 'Levy está trabajando en esta conversación; deshaz cuando termine el turno.')
  return conRebobinador(deps, id, punto.sesion, async (q) => {
    const vista: RewindFilesResult = await q.rewindFiles(punto.mensaje, { dryRun: true })
    if (!vista.canRewind) return no('sdk', vista.error ?? 'El motor no pudo preparar la restauración.')
    const archivos = vista.filesChanged ?? []
    const base = { archivos, inserciones: vista.insertions ?? 0, borrados: vista.deletions ?? 0 }
    if (opciones.dryRun || !archivos.length) return { ok: true, ...base }
    // Antes de tocar nada: el estado de ahora, para poder rehacer.
    const respaldoId = respaldar(deps.dirRespaldos, archivos, { turnId: id.turnId, conversationId: id.conversationId })
    const real = await q.rewindFiles(punto.mensaje)
    if (!real.canRewind) return { ...no('sdk', real.error ?? 'El motor no pudo restaurar los archivos.'), respaldoId }
    return { ok: true, ...base, respaldoId }
  })
}

// ─── Respaldo para «Rehacer» ─────────────────────────────────────────────────

interface Entrada { ruta: string; existia: boolean; copia?: string }
interface Manifiesto { id: string; creado: number; turnId: string; conversationId: string; entradas: Entrada[]; rehecho?: number }

export function respaldar(dir: string, archivos: string[], origen: { turnId: string; conversationId: string }, ahora = Date.now()): string {
  const id = randomUUID()
  const carpeta = join(dir, id)
  mkdirSync(carpeta, { recursive: true })
  const entradas: Entrada[] = archivos.filter(r => isAbsolute(r)).map((ruta, i) => {
    let existe = false
    try { existe = lstatSync(ruta).isFile() } catch { existe = false }
    if (!existe) return { ruta, existia: false }
    const copia = `${i}.bak`
    copyFileSync(ruta, join(carpeta, copia))
    return { ruta, existia: true, copia }
  })
  const m: Manifiesto = { id, creado: ahora, ...origen, entradas }
  writeFileSync(join(carpeta, 'manifiesto.json'), JSON.stringify(m, null, 2))
  return id
}

function apartar(de: string, a: string): void {
  try { renameSync(de, a) } catch { copyFileSync(de, a); unlinkSync(de) } // otro volumen (EXDEV): copia y luego quita
}

/** Devuelve los archivos al estado que tenían justo antes de «Deshacer». Idempotente por respaldo. */
export function rehacer(dir: string, respaldoId: string, origen: { conversationId: string }): { ok: boolean; archivos: string[]; error?: string } {
  if (!UUID.test(respaldoId)) return { ok: false, archivos: [], error: 'Respaldo inválido.' }
  const carpeta = join(dir, respaldoId)
  const ruta = join(carpeta, 'manifiesto.json')
  if (!existsSync(ruta)) return { ok: false, archivos: [], error: 'No encontré ese respaldo.' }
  const m = JSON.parse(readFileSync(ruta, 'utf8')) as Manifiesto
  if (m.conversationId !== origen.conversationId) return { ok: false, archivos: [], error: 'Ese respaldo es de otra conversación.' }
  if (m.rehecho) return { ok: true, archivos: m.entradas.map(e => e.ruta) }
  m.entradas.forEach((e, i) => {
    if (e.existia && e.copia) {
      mkdirSync(dirname(e.ruta), { recursive: true })
      copyFileSync(join(carpeta, e.copia), e.ruta)
    } else if (existsSync(e.ruta)) {
      // No existía antes de deshacer: se aparta (no se borra) para que el estado vuelva a ser el mismo.
      apartar(e.ruta, join(carpeta, `${i}.apartado`))
    }
  })
  m.rehecho = Date.now()
  writeFileSync(ruta, JSON.stringify(m, null, 2))
  return { ok: true, archivos: m.entradas.map(e => e.ruta) }
}

// ─── Proceso de solo rebobinar ───────────────────────────────────────────────

/** Buzón que nunca manda mensajes: el proceso reanuda la sesión, atiende el control `rewind_files` y se cierra. */
function entradaVacia(): { iterable: AsyncIterable<never>; cerrar: () => void } {
  let fin: (() => void) | null = null
  const cerrada = new Promise<void>(r => { fin = r })
  return {
    iterable: { [Symbol.asyncIterator]: () => ({ next: async () => { await cerrada; return { done: true, value: undefined as never } } }) },
    cerrar: () => fin?.(),
  }
}

/** Abre con el SDK real un proceso que reanuda `sesion` con checkpoint activo. Sin mensaje no hay llamada al modelo:
 *  medido el 27 oct, ~0.6 s y 0 USD (nodos/deshacer.md). */
export async function abrirConSdk(sesion: string, opts: { cwd: string; env: Record<string, string> }): Promise<{ q: Rebobinador; cerrar: () => void }> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const entrada = entradaVacia()
  const q = query({ prompt: entrada.iterable, options: {
    cwd: opts.cwd, resume: sesion, enableFileCheckpointing: true, settingSources: [], env: opts.env,
    permissionMode: 'default', tools: [], extraArgs: { 'no-chrome': null },
  } })
  // El iterador debe correr para que el canal de control responda; sus mensajes no importan.
  void (async () => { try { for await (const _ of q) { /* nada */ } } catch { /* cerrado */ } })()
  return { q, cerrar: () => { entrada.cerrar(); try { q.close() } catch { /* ya cerrado */ } } }
}
