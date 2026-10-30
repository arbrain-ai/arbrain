/**
 * Quién te escribe (16 oct 2026). El dueño: «¿podemos enviarle el briefing al Levy de [la socia] para que él se lo
 * explique cuando ella empiece a conversar con él?».
 *
 * Hasta hoy el Levy de otra persona del equipo no sabía que no le escribía el dueño: mismo agente, misma memoria, y en
 * el primer turno recibía la campana DEL DUEÑO (y podía marcarla leída con `atender`). Ahora, si el perfil del turno
 * está en `perfiles_equipo` de `instalacion.json` (la instalación original; la copia del alumno no lo lleva), Levy
 * recibe a quién le habla y el archivo de contexto de esa persona, y no recibe la campana del dueño.
 *
 *   conversación nueva            identidad + contexto
 *   conversación ya abierta       solo si el contexto cambió desde la última vez que se le entregó (novedad)
 *   contexto nuevo o cambiado     además, la instrucción de abrir con lo que llegó («ya llegó todo»)
 *
 * «Entregado» = huella del archivo por perfil en `store/equipo-entregado.json`, marcada al completar el turno. Puro
 * salvo `leer`/`marcarEntregado`; pruebas en `equipo.test.ts`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DUENO, instalacionOriginal, type Instalacion } from '../dueno.js'
import { esEdicionCliente } from '../edicion.js'

export interface PersonaEquipo { nombre: string; contexto?: string }
export interface BloqueEquipo { texto: string; huella: string | null; novedad: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOPE = 40_000

/** La persona del equipo dueña de este perfil, o null (el dueño, un perfil desconocido o la edición cliente). */
export function personaDelEquipo(owner: string, inst: Instalacion = instalacionOriginal(), cliente = esEdicionCliente()): PersonaEquipo | null {
  if (cliente || !UUID.test(owner)) return null
  const p = inst.perfiles_equipo?.[owner.toLowerCase()] ?? inst.perfiles_equipo?.[owner]
  if (!p || typeof p.nombre !== 'string' || !p.nombre.trim()) return null
  return { nombre: p.nombre.trim().slice(0, 60), ...(typeof p.contexto === 'string' && p.contexto.trim() ? { contexto: p.contexto.trim() } : {}) }
}

/** Lee el contexto solo si queda dentro de la raíz del repo. null = no existe o fuera de la raíz. */
export function leerContexto(raiz: string, ruta: string): string | null {
  const abs = resolve(raiz, ruta)
  const rel = relative(raiz, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  try { return readFileSync(abs, 'utf8').slice(0, TOPE) } catch { return null }
}

export const huellaDe = (texto: string) => createHash('sha256').update(texto).digest('hex').slice(0, 16)

/**
 * El bloque para el prompt, o null si este turno no lleva nada.
 * `entregada` = huella ya entregada a ese perfil (o undefined si nunca).
 */
export function bloqueEquipo(p: PersonaEquipo, contexto: string | null, opts: { conversacionNueva: boolean; entregada?: string | null }): BloqueEquipo | null {
  const huella = contexto ? huellaDe(contexto) : null
  const novedad = !!huella && huella !== opts.entregada
  if (!opts.conversacionNueva && !novedad) return null
  const lineas = [
    `[QUIÉN TE ESCRIBE · contexto automático; ${p.nombre} no lo pidió]`,
    `Te escribe ${p.nombre}, no ${DUENO}: es su propio perfil en Arbrain. Háblale por su nombre, en español cálido, simple y sin tecnicismos. Tu memoria y las reglas de ${DUENO} siguen valiendo, pero no le atribuyas a ${p.nombre} decisiones, pendientes ni avisos de ${DUENO}, y no marques con \`atender\` la campana de ${DUENO}. Enviar, publicar, pagar o borrar sigue necesitando un pedido explícito: lo de ${p.nombre}, el suyo en esta conversación; lo de ${DUENO}, solo el de ${DUENO}.`,
  ]
  if (contexto) lineas.push('', `--- Contexto de ${p.nombre} (fuente: ${p.contexto}) ---`, contexto.trim(), '--- fin del contexto ---')
  if (novedad) lineas.push('', `NOVEDAD: este contexto es nuevo para ${p.nombre}. Si su mensaje es un saludo o no pide algo concreto, ábrele con lo que llegó, como indica el contexto; si pide algo, atiéndelo primero y luego cuéntale lo que llegó. Se dice una sola vez; en conversaciones siguientes ya no lo anuncies.`)
  return { texto: lineas.join('\n'), huella, novedad }
}

// ── Registro de entregas (store/equipo-entregado.json) ─────────────────────────
type Registro = Record<string, { huella: string; en: string }>

export function leerEntregas(archivo: string): Registro {
  try { const r = JSON.parse(readFileSync(archivo, 'utf8')); return r && typeof r === 'object' ? r as Registro : {} } catch { return {} }
}

export function marcarEntregado(archivo: string, owner: string, huella: string, ahora = new Date()): void {
  const r = leerEntregas(archivo)
  r[owner.toLowerCase()] = { huella, en: ahora.toISOString() }
  if (!existsSync(dirname(archivo))) mkdirSync(dirname(archivo), { recursive: true })
  const tmp = `${archivo}.tmp`
  writeFileSync(tmp, JSON.stringify(r, null, 2))
  renameSync(tmp, archivo)
}

/** Lo que usa chat-job: persona, bloque y cómo marcarlo entregado. null = turno del dueño (sin cambios). */
export function equipoDelTurno(owner: string, raiz: string, store: string, conversacionNueva: boolean, inst?: Instalacion): { persona: PersonaEquipo; bloque: BloqueEquipo | null; marcar: () => void } | null {
  const persona = personaDelEquipo(owner, inst)
  if (!persona) return null
  const archivo = join(store, 'equipo-entregado.json')
  const contexto = persona.contexto ? leerContexto(raiz, persona.contexto) : null
  const bloque = bloqueEquipo(persona, contexto, { conversacionNueva, entregada: leerEntregas(archivo)[owner.toLowerCase()]?.huella ?? null })
  return {
    persona, bloque,
    marcar: () => { if (bloque?.novedad && bloque.huella) marcarEntregado(archivo, owner, bloque.huella) },
  }
}
