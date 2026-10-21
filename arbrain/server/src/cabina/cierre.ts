/**
 * Cierre del día conversacional (1 oct 2026, pedido de Daniel: «no quiero que me
 * llegue al teléfono, ni las checo ni lleno nada; que sea conversando contigo»).
 *
 * El cron `evening-reflection` se retiró (v67). En su lugar, en el PRIMER turno de
 * la primera conversación de Daniel después de las 17:00, agent-server le pasa a
 * Levy los bloques del calendario que ya pasaron y los hábitos sin marcar; Levy
 * pregunta de pasada (máx. 2 preguntas) y registra lo que Daniel diga por la
 * pluma de hábitos (`/api/sistema`). Sin conversación queda «sin registrar»,
 * nunca cero: este módulo no escribe nada, solo entrega contexto.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROJECT_ROOT, STORE_DIR } from '../config.js'
import { rest } from './llegado.js'

export const HORA_CIERRE = 17
const ZONA = 'America/Mexico_City'
const NOW_MD = join(PROJECT_ROOT, '.claude', 'now.md')
const ESTADO = join(STORE_DIR, 'cierre-conversacional.json')

export interface Bloque { hora: string; texto: string }
export interface Habito { clave: string; nombre: string }

/** Fecha y hora de Ciudad de México de un instante: { fecha: 'YYYY-MM-DD', minutos desde 00:00 }. */
export function ahoraMx(ms: number): { fecha: string; minutos: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** El now.md declara su fecha en el encabezado («Jueves 24 de septiembre 2026, 17:30»). null = no se pudo leer. */
export function fechaDeNow(md: string): string | null {
  const m = /\*\*[^*\n]*?(\d{1,2}) de ([a-záéíóú]+) (\d{4})/i.exec(md)
  const mes = m ? MESES.indexOf(m[2].toLowerCase()) : -1
  if (!m || mes < 0) return null
  return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Bloques de la sección «## Hoy» cuya hora de inicio ya pasó. Agenda de otro día = nada (nunca se adivina). */
export function bloquesPasados(md: string, hoy: string, minutos: number): Bloque[] {
  if (fechaDeNow(md) !== hoy) return []
  const sec = /^## Hoy\s*\n([\s\S]*?)(?=^## |\n---|$(?![\s\S]))/m.exec(md)?.[1] ?? ''
  const out: Bloque[] = []
  for (const l of sec.split('\n')) {
    const m = /^-\s+`(\d{2}):(\d{2})`\s+(.+)$/.exec(l.trim())
    if (m && Number(m[1]) * 60 + Number(m[2]) <= minutos) out.push({ hora: `${m[1]}:${m[2]}`, texto: m[3].trim() })
  }
  return out
}

export function habitosSinMarcar(habitos: Habito[], hechos: string[]): Habito[] {
  const h = new Set(hechos)
  return habitos.filter(x => !h.has(x.clave))
}

export interface Cierre { fecha: string; bloques: Bloque[]; habitos: Habito[]; error?: string }

/** El bloque que se agrega al primer mensaje. null = nada que decir. */
export function bloqueCierre(c: Cierre): string | null {
  if (!c.bloques.length && !c.habitos.length && !c.error) return null
  const l: string[] = []
  if (c.error) l.push(`No pude leer los hábitos (${c.error}). Dilo así si ${DUENO} pregunta; no inventes cuáles faltan.`)
  if (c.bloques.length) l.push('Bloques del calendario de hoy que ya pasaron:', ...c.bloques.map(b => `- ${b.hora} ${b.texto}`))
  if (c.habitos.length) l.push(`Hábitos de hoy (${c.fecha}) sin marcar:`, ...c.habitos.map(h => `- ${h.clave} · ${h.nombre}`))
  return [
    `[CIERRE DEL DÍA · contexto automático; ${DUENO} no lo pidió ni recibió aviso en el teléfono]`,
    ...l,
    `Instrucción: después de atender lo que ${DUENO} escribió, pregunta de pasada y en tono de conversación, máximo 2 preguntas en total (qué bloque pasó o se movió, y qué hábitos sí hizo). Nada de checklist ni formulario.`,
    `Lo que ${DUENO} diga lo registras por la pluma de hábitos (POST /api/sistema {clave, hecho, date:"${c.fecha}"}; el objetivo de mañana o la reflexión van como {tipo:"reflexion", campo, valor}; ver habit-system/references/habitos-y-ritual.md). Solo registra lo que él afirme.`,
    'Lo que no diga queda «sin registrar»: JAMÁS marques hecho=false ni cuentes cero por silencio. Si te dice que lo deje, no insistas.',
  ].join('\n')
}

function yaEntregado(fecha: string): boolean {
  try { return (JSON.parse(readFileSync(ESTADO, 'utf8')) as { fecha?: string }).fecha === fecha } catch { return false }
}
function marcarEntregado(fecha: string): void {
  try { mkdirSync(dirname(ESTADO), { recursive: true }); writeFileSync(ESTADO, JSON.stringify({ fecha })) } catch { /* ayuda, nunca bloquea */ }
}

/** Lo que Levy recibe en el primer turno de la primera conversación del día después de las 17:00. */
export async function cierreDelDia(ahora = Date.now()): Promise<string | null> {
  const { fecha, minutos } = ahoraMx(ahora)
  if (minutos < HORA_CIERRE * 60 || yaEntregado(fecha)) return null
  const bloques = existsSync(NOW_MD) ? bloquesPasados(readFileSync(NOW_MD, 'utf8'), fecha, minutos) : []
  let habitos: Habito[] = []
  let error: string | undefined
  try {
    const [hs, cs] = await Promise.all([
      rest<{ clave: string; nombre: string }[]>('sistema_habitos?select=clave,nombre&activo=eq.true&order=orden'),
      rest<{ habito_clave: string }[]>(`sistema_checks?select=habito_clave&fecha=eq.${fecha}&hecho=eq.true`),
    ])
    habitos = habitosSinMarcar(hs, cs.map(c => c.habito_clave))
  } catch (e) { error = e instanceof Error ? e.message : 'sin conexión' }
  const bloque = bloqueCierre({ fecha, bloques, habitos, error })
  if (bloque) marcarEntregado(fecha)
  return bloque
}
