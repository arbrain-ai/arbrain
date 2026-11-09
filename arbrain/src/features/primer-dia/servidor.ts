/**
 * Tu primer día del lado del servidor (5 nov 2026, encendido en la edición del alumno, ARBRAIN_PRIMER_DIA=0 lo apaga). Lee el cerebro del dueño (sus
 * fichas, su embudo, sus skills) y sus rutinas de SU daemon; el juicio vive en modelo.ts (puro). Lo único que guarda es si ya
 * se ofreció y si lo ocultó (`primer-arranque.json`, campo `primerDia`), y la guía en su memoria al empezar. Solo servidor.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { separarRutinas, type ListaRutinas } from '@/lib/rutinas-cliente'
import { createServiceClient } from '@/lib/supabase/service'
import { LOCAL_DESKTOP_USER_ID } from '@/lib/desktop-auth'
import { guardarPrimerArranque, leerPrimerArranque } from '@/features/primer-arranque/lib/estado'
import { textoGuia } from './guia'
import {
  RUTA_EMBUDO, RUTA_GUIA, RUTA_NEGOCIO, RUTA_OFERTA, RUTA_OFERTA_COMPLETA, RUTINA_MANANA, estadoPrimerDia, leerEmbudo, skillsDelEmbudo,
  type EstadoPrimerDia, type Senales,
} from './modelo'

const raiz = (r?: string) => { if (r) return r; try { return raizWorkspace() } catch { return null } }
const leerTexto = (ruta: string): string | null => { try { return readFileSync(ruta, 'utf8') } catch { return null } }
/** Caracteres con contenido (sin espacios ni encabezados vacíos); null si no existe. */
const largo = (ruta: string): number | null => { const t = leerTexto(ruta); return t == null ? null : t.replace(/\s+/g, ' ').trim().length }
/** El mayor de varios largos; null si ninguno existe. */
const mayor = (...ls: (number | null)[]): number | null => ls.reduce<number | null>((m, l) => l == null ? m : Math.max(m ?? 0, l), null)

/** Las rutinas del daemon en lo que necesita el paso 4; null si no respondió. */
export function rutinasDe(lista: Partial<ListaRutinas> | null): Senales['rutinas'] {
  if (!lista || !Array.isArray(lista.tasks)) return null
  const { propias, deArbrain } = separarRutinas({ tasks: lista.tasks, tz: lista.tz, precargadas: lista.precargadas }, Date.now())
  const todas = [...propias, ...deArbrain]
  const manana = lista.tasks.find(t => t.id === RUTINA_MANANA)
  return {
    activas: todas.filter(r => r.activa).map(r => ({ id: r.id, titulo: r.titulo })),
    manana: !manana ? 'falta' : manana.status === 'active' ? 'activa' : 'pausada',
  }
}

/** Todo lo que se lee del disco para juzgar los pasos (las rutinas llegan aparte, del daemon). */
export function leerSenales(rutinas: Senales['rutinas'], r?: string): Senales {
  const base = raiz(r)
  if (!base) return { negocio: null, oferta: null, embudo: { estado: 'falta' }, rutinas, skillsEnDisco: [] }
  const embudo = leerEmbudo(leerTexto(join(base, RUTA_EMBUDO)))
  const nombres = skillsDelEmbudo(embudo.estado === 'ok' ? embudo.embudo : null)
  return {
    negocio: largo(join(base, RUTA_NEGOCIO)),
    oferta: mayor(largo(join(base, RUTA_OFERTA)), largo(join(base, RUTA_OFERTA_COMPLETA))),
    embudo,
    rutinas,
    skillsEnDisco: nombres.filter(n => /^[\w.-]+$/.test(n) && existsSync(join(base, '.claude', 'skills', n, 'SKILL.md'))),
  }
}

export function leerEstado(): EstadoPrimerDia {
  return estadoPrimerDia(leerPrimerArranque().primerDia)
}

function guardarEstado(cambio: Partial<EstadoPrimerDia>): EstadoPrimerDia {
  const nuevo = { ...leerEstado(), ...cambio }
  guardarPrimerArranque({ primerDia: nuevo })
  return nuevo
}

export const marcarOfrecido = (ahora = new Date()) => guardarEstado({ ofrecido: ahora.toISOString() })
export const ocultar = (ahora = new Date()) => guardarEstado({ oculto: ahora.toISOString() })
export const mostrar = () => guardarEstado({ oculto: null })

/** Siembra la guía en su memoria si no existe (nunca la pisa). Devuelve si la escribió. */
export function sembrarGuia(r?: string): boolean {
  const base = raiz(r)
  if (!base) return false
  const ruta = join(base, RUTA_GUIA)
  if (existsSync(ruta)) return false
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, textoGuia(), { flag: 'wx' })
  return true
}

/**
 * El mensaje de Levy que abre el primer día, en la conversación de bienvenida (o una nueva). Mismo camino que el capítulo del
 * tour (primer-arranque/lib/tour-chat.ts): una fila de Levy en la base local del chat.
 */
export async function publicarOferta(texto: string, sesion: string | null, creadoEn = new Date()): Promise<string> {
  const db = createServiceClient()
  let id = sesion
  if (!id) {
    id = randomUUID()
    const s = await db.from('chat_sessions').insert({ id, title: 'Tu primer día', profile_id: LOCAL_DESKTOP_USER_ID, account: null, last_message_at: creadoEn.toISOString(), is_favorite: false, archived_at: null })
    if (s.error) throw new Error(s.error.message)
  }
  const m = await db.from('chat_messages').insert({ id: randomUUID(), session_id: id, role: 'assistant', content: texto, created_at: creadoEn.toISOString(), metadata: { source: 'primer-dia' } })
  if (m.error) throw new Error(m.error.message)
  await db.from('chat_sessions').update({ last_message_at: creadoEn.toISOString() }).eq('id', id)
  return id
}
