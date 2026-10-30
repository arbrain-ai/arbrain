/**
 * `now.md` del alumno (29 oct 2026, cohorte fundadora: «ya falta memory now»). En la instalación del autor lo escribe
 * `now-snapshot.py` con su Google y su Todoist; ese script no viaja. Aquí el daemon de la edición cliente arma el mismo
 * archivo, corto, con lo que SÍ vive en el cerebro del alumno:
 *
 *   .claude/plan/calendario.json            eventos y tareas con fecha (la pluma local de la app, src/lib/planning/local.ts)
 *   .claude/plan/objetivos.md               objetivos del mes, la semana y el día (registro arbrain-objectives-v1 y texto)
 *   .claude/plan/habitos.json               hábitos activos y lo marcado hoy
 *   .claude/memory/project/meta-90-dias.md  su meta a 90 días (la trae su expediente del programa)
 *   .claude/memory/project/mi-camino.md     dónde va en el programa (la trae el puente)
 *
 * Cuándo: al arrancar el scheduler del alumno, cada 20 minutos y cuando cambia algo en `.claude/plan/`. Solo la máquina
 * que corre las rutinas (la líder del espejo, `CLAUDECLAW_ROLE` distinto de `chat`) lo escribe: el espejo ya asume que
 * `now.md` es SOLO_LIDER. La instalación del autor no llama a esto (su scheduler sigue con `now-snapshot.py`).
 *
 * Propiedad (regla de la casa: un generador solo modifica lo que posee): la primera línea lleva la huella del contenido.
 * Si el dueño o Levy lo editan a mano, la huella ya no cuadra y el daemon deja el archivo como está; con
 * `<!-- manual -->` en una línea propia, también. Para volver a la versión generada basta con borrar el archivo.
 * Si solo cambiaría la línea «Generado por Arbrain…», no se reescribe: así no ensucia git ni el espejo cada 20 minutos.
 *
 * Git: `.claude/now.md` sigue versionado en la rama del dueño (es su capa; el autor nunca lo toca, así que una
 * actualización no choca con él) porque el espejo lo lleva de la líder a las demás máquinas por esa misma rama.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { esEdicionCliente } from '../edicion.js'

export const RUTA_NOW = '.claude/now.md'
const RUTA_CAL = '.claude/plan/calendario.json'
const RUTA_OBJ = '.claude/plan/objetivos.md'
const RUTA_HAB = '.claude/plan/habitos.json'
const RUTA_META = '.claude/memory/project/meta-90-dias.md'
const RUTA_CAMINO = '.claude/memory/project/mi-camino.md'

const MARCA = /^<!-- arbrain:now (pendiente|sha256=([0-9a-f]{64})) -->\r?\n/
/** `<!-- manual -->` en una línea propia (el encabezado lo menciona entre comillas invertidas, a media línea: no cuenta). */
const MANUAL = /^[ \t]*<!--\s*manual\s*-->[ \t]*$/im
/** La semilla vieja (hasta la 0.2.15) no tenía marca: se reconoce por su texto y se considera nuestra. */
const SEMILLA_VIEJA = /Todavía sin datos[\s\S]*Auto-generado por `now-snapshot\.py`/
const SELLO = /^> Generado por Arbrain el .*$/m
const MAX_EVENTOS_DIA = 10
const DIAS_SEMANA = 6

export type Resultado = 'escrito' | 'igual' | 'editado_a_mano' | 'sin_cerebro' | 'no_cliente'

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const conMarca = (cuerpo: string) => `<!-- arbrain:now sha256=${sha(cuerpo)} -->\n${cuerpo}`

// ── Fechas sin dependencias ────────────────────────────────────────────────────────────────────────────────────────

export function zonaValida(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}
export function zonaDelSistema(): string {
  const env = process.env.ARBRAIN_TZ
  if (zonaValida(env)) return env
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}
function paredEn(t: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(t).map(x => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` }
}
function instanteDePared(dia: string, hora: string, tz: string): Date {
  const comoUtc = Date.parse(`${dia}T${hora}Z`)
  let t = comoUtc
  for (let i = 0; i < 2; i++) { const w = paredEn(new Date(t), tz); t += comoUtc - Date.parse(`${w.dia}T${w.hora}Z`) }
  return new Date(t)
}
const sumarDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const esDia = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const diaLargo = (d: string) => `${DIAS[dow(d)]} ${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
const diaCorto = (d: string) => `${DIAS[dow(d)].slice(0, 3)} ${Number(d.slice(8))}`
const horaCorta = (t: number, tz: string) => paredEn(new Date(t), tz).hora.slice(0, 5)

// ── Lectura tolerante ──────────────────────────────────────────────────────────────────────────────────────────────

function leer(raiz: string, rel: string): string | null {
  try { return readFileSync(join(raiz, rel), 'utf8') } catch { return null }
}
function leerJson(raiz: string, rel: string): Record<string, unknown> | null {
  const t = leer(raiz, rel)
  if (!t) return null
  try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null } catch { return null }
}
/** Una línea de texto que viene de un archivo del dueño: sin saltos ni comentarios HTML, recortada. */
const linea = (v: unknown, max = 140) => typeof v === 'string' ? v.replace(/<!--|-->/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''
const primero = (o: Record<string, unknown>, ...k: string[]) => { for (const x of k) if (o[x] !== undefined && o[x] !== null && o[x] !== '') return o[x]; return undefined }

// ── Calendario (misma lectura que la vista: src/lib/planning/local.ts, en corto) ──────────────────────────────────

interface Ocurrencia { inicio: number; fin: number; todoElDia: boolean; dia: string; titulo: string }

/** Días de una serie RRULE mínima (DAILY, WEEKLY con BYDAY, MONTHLY por día del mes) dentro de [desde, hasta). */
function diasDeSerie(regla: string, primerDia: string, desde: string, hasta: string): string[] {
  const f = Object.fromEntries(regla.replace(/^RRULE:/, '').split(';').map(x => x.split('=')))
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(f.FREQ)) return []
  const intervalo = Math.max(1, Number(f.INTERVAL) || 1)
  const conteo = f.COUNT ? Math.max(0, Number(f.COUNT) || 0) : Infinity
  const fin = f.UNTIL ? `${f.UNTIL.slice(0, 4)}-${f.UNTIL.slice(4, 6)}-${f.UNTIL.slice(6, 8)}` : null
  const porDia = f.BYDAY ? String(f.BYDAY).split(',').map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d.slice(-2))).filter(n => n >= 0) : []
  const tope = fin && fin < hasta ? sumarDia(fin, 1) : hasta
  const out: string[] = []
  let n = 0
  for (let d = primerDia, g = 0; d < tope && n < conteo && g < 20_000; d = sumarDia(d, 1), g++) {
    const dias = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${primerDia}T12:00:00Z`)) / 86_400_000)
    let toca = false
    if (f.FREQ === 'DAILY') toca = dias % intervalo === 0
    else if (f.FREQ === 'WEEKLY') toca = Math.floor((dias + ((dow(primerDia) + 6) % 7)) / 7) % intervalo === 0 && (porDia.length ? porDia.includes(dow(d)) : dow(d) === dow(primerDia))
    else toca = d.slice(8) === primerDia.slice(8) && ((Number(d.slice(0, 4)) - Number(primerDia.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(primerDia.slice(5, 7))) % intervalo === 0
    if (!toca) continue
    n++
    if (d >= desde) out.push(d)
  }
  return out
}

function instanteLibre(v: string, zona: string): number {
  const t = v.trim()
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(t)) return Date.parse(t)
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t)
  return m && esDia(m[1]) ? instanteDePared(m[1], `${m[2]}:${m[3]}:${m[4] ?? '00'}`, zona).getTime() : Number.NaN
}

/** Ocurrencias de los eventos que tocan los días [desde, hasta) de la zona `tz`. Lo ilegible se omite. */
export function eventosEntre(cal: Record<string, unknown> | null, desde: string, hasta: string, tz: string): Ocurrencia[] {
  const eventos = Array.isArray(cal?.eventos) ? cal!.eventos as unknown[] : []
  const zonaCal = zonaValida(cal?.zona) ? cal!.zona as string : tz
  const tDesde = instanteDePared(desde, '00:00:00', tz).getTime(), tHasta = instanteDePared(hasta, '00:00:00', tz).getTime()
  const out: Ocurrencia[] = []
  for (const crudo of eventos) {
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) continue
    const o = crudo as Record<string, unknown>
    const titulo = linea(primero(o, 'titulo', 'title', 'nombre', 'summary'), 80) || 'Sin título'
    const ini = primero(o, 'inicio', 'start', 'desde', 'fecha'), finC = primero(o, 'fin', 'end', 'hasta')
    if (typeof ini !== 'string') continue
    const zona = zonaValida(o.zona) ? o.zona : zonaCal
    const regla = primero(o, 'repetir', 'rrule', 'recurrence')
    const omitir = new Set(Array.isArray(o.omitir) ? o.omitir.filter((x): x is string => typeof x === 'string') : [])
    const todoElDia = primero(o, 'todoElDia', 'allDay', 'todo_el_dia') === true || /^\d{4}-\d{2}-\d{2}$/.test(ini.trim())
    if (todoElDia) {
      const a = ini.trim().slice(0, 10)
      if (!esDia(a)) continue
      const b = typeof finC === 'string' && esDia(finC.trim().slice(0, 10)) && finC.trim().slice(0, 10) > a ? finC.trim().slice(0, 10) : sumarDia(a, 1)
      const largo = Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
      const arranques = typeof regla === 'string' ? diasDeSerie(regla, a, sumarDia(desde, -largo), hasta).filter(d => !omitir.has(d)) : [a]
      for (const s of arranques) for (let i = 0; i < largo; i++) {
        const d = sumarDia(s, i)
        if (d >= desde && d < hasta) out.push({ inicio: Date.parse(`${d}T00:00:00Z`), fin: Date.parse(`${d}T00:00:00Z`), todoElDia: true, dia: d, titulo })
      }
      continue
    }
    const tIni = instanteLibre(ini, zona)
    if (Number.isNaN(tIni)) continue
    const tFinC = typeof finC === 'string' ? instanteLibre(finC, zona) : Number.NaN
    const dur = !Number.isNaN(tFinC) && tFinC > tIni ? tFinC - tIni : 60 * 60_000
    const inicios = typeof regla === 'string'
      ? diasDeSerie(regla, paredEn(new Date(tIni), zona).dia, sumarDia(desde, -2), sumarDia(hasta, 1)).filter(d => !omitir.has(d)).map(d => instanteDePared(d, paredEn(new Date(tIni), zona).hora, zona).getTime())
      : [tIni]
    for (const a of inicios) {
      if (!(a < tHasta && a + dur > tDesde)) continue
      out.push({ inicio: a, fin: a + dur, todoElDia: false, dia: paredEn(new Date(Math.max(a, tDesde)), tz).dia, titulo })
    }
  }
  return out.sort((x, y) => (x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : Number(y.todoElDia) - Number(x.todoElDia) || x.inicio - y.inicio))
}

interface TareaVista { titulo: string; dia: string; hora: string | null }
function tareasPendientes(cal: Record<string, unknown> | null, tz: string): TareaVista[] {
  const tareas = Array.isArray(cal?.tareas) ? cal!.tareas as unknown[] : []
  const out: TareaVista[] = []
  for (const crudo of tareas) {
    if (!crudo || typeof crudo !== 'object') continue
    const t = crudo as Record<string, unknown>
    if (t.hecha === true || typeof t.fecha !== 'string') continue
    const f = t.fecha.trim()
    if (esDia(f)) out.push({ titulo: linea(t.titulo, 80) || 'Sin título', dia: f, hora: null })
    else if (!Number.isNaN(Date.parse(f))) { const w = paredEn(new Date(Date.parse(f)), tz); out.push({ titulo: linea(t.titulo, 80) || 'Sin título', dia: w.dia, hora: w.hora.slice(0, 5) }) }
  }
  return out.sort((a, b) => (a.dia + (a.hora ?? '')).localeCompare(b.dia + (b.hora ?? '')))
}

// ── Objetivos (registro arbrain-objectives-v1 y texto heredado; misma forma que objectives_store.py) ───────────────

interface Hitos { mes: string | null; semana: string | null; dia: { texto: string; hecho: boolean }[] }

export function hitosDe(contenido: string | null, hoy: string): Hitos {
  const h: Hitos = { mes: null, semana: null, dia: [] }
  if (!contenido) return h
  const registro = /<!-- arbrain-objectives-v1\s*\n([\s\S]*?)\n-->/.exec(contenido)
  if (registro) try {
    const goals = (JSON.parse(registro[1]).goals ?? []) as Record<string, unknown>[]
    for (const g of goals) {
      if (!g || typeof g.start !== 'string' || typeof g.end !== 'string' || !(g.start <= hoy && hoy < g.end)) continue
      const titulo = linea(g.title)
      if (!titulo) continue
      const marca = g.status === 'draft' ? ' _(borrador)_' : ''
      if (g.scope === 'month' && !h.mes) h.mes = titulo + marca
      else if (g.scope === 'week' && !h.semana) h.semana = titulo + marca
      else if (g.scope === 'day') h.dia.push({ texto: titulo, hecho: g.status === 'completed' })
    }
  } catch { /* registro ilegible: queda el texto */ }
  const limpio = contenido.replace(/<!--[\s\S]*?-->/g, '').replace(/<details\b[\s\S]*?<\/details>/gi, '')
  let mes: string | null = null, enSemana = false, enDia = false
  const mesHoy = hoy.slice(0, 7)
  for (const l of limpio.split(/\r?\n/)) {
    if (l.startsWith('## ')) {
      enSemana = enDia = false
      const m = /^##\s+(\S+)\s+(\d{4})$/.exec(l.trim())
      mes = m && MESES.includes(m[1].toLowerCase()) ? `${m[2]}-${String(MESES.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}` : null
    } else if (l.startsWith('### ')) {
      enDia = false
      const m = /^###\s+Semana\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/.exec(l)
      enSemana = !!(mes === mesHoy && m && Number(m[1]) <= Number(hoy.slice(8)) && Number(hoy.slice(8)) <= Number(m[2]))
    } else if (l.startsWith('#### ')) {
      const m = /^####\s+\S+\s+(\d{1,2})\b/.exec(l)
      enDia = !!(mes === mesHoy && m && Number(m[1]) === Number(hoy.slice(8)))
    }
    if (mes === mesHoy && l.startsWith('**Mes:**') && !h.mes) h.mes = linea(l.split('**Mes:**')[1])
    else if (enSemana && l.startsWith('**Foco:**') && !h.semana) h.semana = linea(l.split('**Foco:**')[1])
    else if (enDia && /^- \[[ xX]\]/.test(l)) h.dia.push({ texto: linea(l.replace(/^- \[[ xX]\]\s*/, '')), hecho: /^- \[[xX]\]/.test(l) })
  }
  return h
}

// ── Meta, camino y hábitos ─────────────────────────────────────────────────────────────────────────────────────────

/** La línea de la meta a 90 días del expediente (o del fechado más reciente si el canónico sigue pendiente). */
export function metaDe(raiz: string): string | null {
  const dir = join(raiz, '.claude/memory/project')
  const candidatos = [RUTA_META]
  try { candidatos.push(...readdirSync(dir).filter(n => /^meta-90-dias-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort().reverse().map(n => `.claude/memory/project/${n}`)) } catch { /* sin carpeta */ }
  for (const rel of candidatos) {
    const t = leer(raiz, rel)
    if (!t || /^<!-- arbrain:expediente pendiente -->/.test(t)) continue
    const m = /\*\*Meta a 90 días:\*\*\s*(.+)/i.exec(t) ?? /^\s*[-*]\s*\*\*Meta[^*]*:\*\*\s*(.+)/im.exec(t)
    if (m) return linea(m[1], 200)
  }
  return null
}

function caminoDe(raiz: string): string | null {
  const t = leer(raiz, RUTA_CAMINO)
  const m = t ? /\*\*Dónde voy:\*\*\s*(.+)/.exec(t) : null
  return m ? linea(m[1], 200) : null
}

function habitosDe(raiz: string, hoy: string): string | null {
  const j = leerJson(raiz, RUTA_HAB)
  if (!j || !Array.isArray(j.habitos)) return null
  const reg = (j.registro && typeof j.registro === 'object' ? (j.registro as Record<string, unknown>)[hoy] : null) as Record<string, { hecho?: unknown }> | null
  const activos = (j.habitos as Record<string, unknown>[]).filter(h => h && h.activo !== false && typeof h.clave === 'string')
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
  if (!activos.length) return null
  return activos.slice(0, 8).map(h => {
    const v = reg?.[h.clave as string]?.hecho
    return `${linea(h.nombre, 60) || h.clave} (${v === true ? 'hecho' : v === false ? 'no' : 'pendiente'})`
  }).join(' · ')
}

// ── El archivo ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function generarNow(raiz: string, ahora = new Date(), tz = zonaDelSistema()): string {
  if (!zonaValida(tz)) tz = 'UTC'
  const hoy = paredEn(ahora, tz).dia
  const cal = leerJson(raiz, RUTA_CAL)
  const hitos = hitosDe(leer(raiz, RUTA_OBJ), hoy)
  const meta = metaDe(raiz), camino = caminoDe(raiz), habitos = habitosDe(raiz, hoy)
  const fin = sumarDia(hoy, DIAS_SEMANA + 1)
  const eventos = eventosEntre(cal, hoy, fin, tz)
  const tareas = tareasPendientes(cal, tz).filter(t => t.dia < fin)
  const ev = (e: Ocurrencia) => e.todoElDia ? `\`todo el día\` ${e.titulo}` : `\`${horaCorta(e.inicio, tz)}\` ${e.titulo}${e.fin - e.inicio >= 30 * 60_000 ? ` (hasta ${horaCorta(e.fin, tz)})` : ''}`

  const l: string[] = [
    '# Ahora',
    '',
    `> **${diaLargo(hoy)}** (${tz})`,
    '> Lo arma Arbrain con tu calendario, tus objetivos y tus hábitos. Si algo está mal, corrige la fuente (Calendario u',
    '> Objetivos) y se regenera solo. Si prefieres escribirlo tú, pon `<!-- manual -->` en la primera línea y Arbrain ya no lo toca.',
    '',
    '## Hitos',
    ...(meta ? [`- **Meta a 90 días:** ${meta}`] : []),
    ...(camino ? [`- **Dónde voy en el programa:** ${camino}`] : []),
    `- **Mes:** ${hitos.mes ?? '_(sin objetivo del mes; pídeselo a Levy: «planeemos el mes»)_'}`,
    `- **Semana:** ${hitos.semana ?? '_(sin foco de la semana)_'}`,
    ...(hitos.dia.length ? ['- **Hoy:**', ...hitos.dia.slice(0, 8).map(d => `    - [${d.hecho ? 'x' : ' '}] ${d.texto}`)] : ['- **Hoy:** _(sin objetivo del día)_']),
    '',
    '## Hoy',
  ]
  const deHoy = eventos.filter(e => e.dia === hoy)
  const vencidas = tareas.filter(t => t.dia < hoy), tareasHoy = tareas.filter(t => t.dia === hoy)
  for (const e of deHoy.slice(0, MAX_EVENTOS_DIA)) l.push(`- ${ev(e)}`)
  if (deHoy.length > MAX_EVENTOS_DIA) l.push(`- _y ${deHoy.length - MAX_EVENTOS_DIA} más en tu calendario_`)
  for (const t of tareasHoy.slice(0, 8)) l.push(`- [ ] ${t.hora ? `\`${t.hora}\` ` : ''}${t.titulo}`)
  for (const t of vencidas.slice(0, 5)) l.push(`- [ ] ${t.titulo} _(venció el ${diaCorto(t.dia).toLowerCase()})_`)
  if (vencidas.length > 5) l.push(`- _y ${vencidas.length - 5} tareas vencidas más_`)
  if (habitos) l.push(`- Hábitos: ${habitos}`)
  if (!deHoy.length && !tareasHoy.length && !vencidas.length) l.push('_Nada agendado._')
  l.push('', '## Esta semana')
  let alguno = false
  for (let i = 1; i <= DIAS_SEMANA; i++) {
    const d = sumarDia(hoy, i)
    const cosas = [...eventos.filter(e => e.dia === d).map(ev), ...tareas.filter(t => t.dia === d).map(t => `tarea: ${t.titulo}`)]
    if (!cosas.length) continue
    alguno = true
    l.push(`- **${diaCorto(d)}:** ${cosas.slice(0, 6).join(' · ')}${cosas.length > 6 ? ` · y ${cosas.length - 6} más` : ''}`)
  }
  if (!alguno) l.push('_Nada agendado._')
  const w = paredEn(ahora, tz)
  l.push('', '---', `> Generado por Arbrain el ${Number(w.dia.slice(8))} ${MESES[Number(w.dia.slice(5, 7)) - 1].slice(0, 3)} ${w.dia.slice(0, 4)}, ${w.hora.slice(0, 5)} (${tz}).`)
  return l.join('\n') + '\n'
}

/** ¿El archivo actual es del daemon? Semilla, huella intacta o la semilla vieja sin marca. `<!-- manual -->` gana. */
export function esNuestro(contenido: string): boolean {
  if (MANUAL.test(contenido)) return false
  const m = MARCA.exec(contenido)
  if (!m) return SEMILLA_VIEJA.test(contenido)
  if (m[1] === 'pendiente') return true
  return sha(contenido.slice(m[0].length)) === m[2]
}

const sinSello = (t: string) => t.replace(MARCA, '').replace(SELLO, '')

function escribirAtomico(ruta: string, contenido: string) {
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`
  try { writeFileSync(tmp, contenido, 'utf8'); renameSync(tmp, ruta) }
  finally { if (existsSync(tmp)) try { unlinkSync(tmp) } catch { /* noop */ } }
}

/** Escribe `<raiz>/.claude/now.md` si sigue siendo nuestro y cambió algo más que la hora del sello. */
export function escribirNow(raiz: string, opciones: { ahora?: Date; tz?: string } = {}): Resultado {
  if (!esEdicionCliente()) return 'no_cliente'
  if (!raiz || !existsSync(join(raiz, '.claude'))) return 'sin_cerebro'
  const ruta = join(raiz, RUTA_NOW)
  let actual: string | null = null
  try { actual = readFileSync(ruta, 'utf8') } catch { /* no existe: se crea */ }
  if (actual !== null && !esNuestro(actual)) return 'editado_a_mano'
  const cuerpo = generarNow(raiz, opciones.ahora, opciones.tz)
  if (actual !== null && sinSello(actual) === sinSello(cuerpo)) return 'igual'
  escribirAtomico(ruta, conMarca(cuerpo))
  return 'escrito'
}

// ── Reloj ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RelojNow { detener: () => void; ahora: () => Resultado }

/**
 * Arranca el generador: una vez ya, cada `intervaloMs` (20 min) y, con un respiro de 3 s, cuando cambia algo en
 * `.claude/plan/` (calendario, objetivos, hábitos). Si la carpeta no se puede vigilar, queda el reloj.
 */
export function iniciarNowAlumno(raiz: string, opciones: { intervaloMs?: number; registrar?: (r: Resultado, motivo: string) => void } = {}): RelojNow | null {
  if (!esEdicionCliente() || !raiz) return null
  const registrar = opciones.registrar ?? (() => {})
  const correr = (motivo: string): Resultado => {
    try { const r = escribirNow(raiz); registrar(r, motivo); return r } catch (err) { registrar('igual', `${motivo}: fallo ${(err as Error).message}`); return 'igual' }
  }
  correr('arranque')
  const reloj = setInterval(() => correr('reloj'), opciones.intervaloMs ?? 20 * 60_000)
  reloj.unref?.()
  let vigia: FSWatcher | null = null, espera: NodeJS.Timeout | null = null
  try {
    vigia = watch(join(raiz, '.claude/plan'), { persistent: false }, (_e, nombre) => {
      if (nombre && !/^(calendario\.json|objetivos\.md|habitos\.json)$/.test(String(nombre))) return
      if (espera) clearTimeout(espera)
      espera = setTimeout(() => { espera = null; correr('cambio del plan') }, 3_000)
      espera.unref?.()
    })
    vigia.on('error', () => { try { vigia?.close() } catch { /* noop */ } vigia = null })
  } catch { vigia = null }
  return {
    detener: () => { clearInterval(reloj); if (espera) clearTimeout(espera); try { vigia?.close() } catch { /* noop */ } },
    ahora: () => correr('a pedido'),
  }
}
