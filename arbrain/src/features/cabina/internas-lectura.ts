/**
 * Cómo se lee una tarea interna de Levy para un dueño de negocio (2 oct 2026).
 *
 * Daniel: «el Taller es para un dueño de negocio; quiere claridad. Los títulos no son
 * descriptivos. Desde aquí debería poder ver cuánto tiempo lleva corriendo, cuánto contexto
 * ha consumido, qué modelo está usando». Aquí vive, sin React ni red (se prueba con
 * `tsx --test`), el paso de lo que reporta el SDK a lo que se muestra:
 *   - título: la descripción con la que Levy lanzó la tarea (el daemon ya no la reescribe);
 *   - actividad: lo que hace AHORA, en español («revisando código»), no «usando Bash»;
 *   - tiempo: en vivo mientras corre; la duración total cuando terminó;
 *   - contexto: tokens de su última llamada (transcripción) o, si no, los del SDK;
 *   - modelo: el id real de su transcripción, con nombre legible. Sin dato, no se muestra.
 */
import { modelDisplayName } from '../chat/stores/model-store'
import type { TareaInterna, TipoInterna } from './trabajos-modelo'

/** Cómo se llama cada tipo para quien no construye software. */
export const TIPO_LEGIBLE: Record<TipoInterna, string> = { subagente: 'Agente', comando: 'Comando', workflow: 'Flujo de trabajo', otra: 'Tarea' }

/** «45 s», «12 min», «1 h 05 min». */
export function duracionCorta(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`
}

/** «850», «1.5 k», «140 k», «1.2 M». */
export function tokensCortos(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')} k`
  if (n < 1_000_000) return `${Math.round(n / 1000)} k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} M`
}

/** Cuánto lleva (corriendo) o cuánto duró (terminada). `null` si no hay de dónde sacarlo. */
export function tiempoDe(t: TareaInterna, ahora = Date.now()): number | null {
  const desde = Date.parse(t.desde)
  if (!desde) return null
  if (t.estado === 'trabajando') return Math.max(0, ahora - desde)
  if (t.duracionMs != null && t.duracionMs > 0) return t.duracionMs
  const fin = Date.parse(t.fin ?? t.actualizado)
  return fin ? Math.max(0, fin - desde) : null
}

/** El rótulo de la ficha: lo que lleva corriendo, o lo que tardó. */
export const tiempoRotulo = (t: Pick<TareaInterna, 'estado'>): string => t.estado === 'trabajando' ? 'Lleva' : 'Tardó'

/** Tokens en contexto: el de su última llamada si hay transcripción; si no, lo que reportó el SDK. */
export const contextoDe = (t: TareaInterna): number | null => t.contexto ?? t.tokens ?? null
/** «Sonnet 5.5», «Opus 5.5», «GPT-6 Astra»; sin id real, `null` (no se inventa). */
export const modeloLegible = (t: Pick<TareaInterna, 'modelo'>, respaldo?: string | null): string | null => modelDisplayName(t.modelo ?? respaldo)

/** Una herramienta de Bash según lo que dice su descripción o comando. */
function actividadDeBash(texto = ''): string {
  if (/\b(vitest|jest|pytest|playwright|tsx --test|node --test|npm (run )?test|pnpm test|tests?)\b/i.test(texto)) return 'corriendo pruebas'
  if (/\b(tsc|typecheck|type-check|type check|eslint|lint)\b/i.test(texto)) return 'revisando tipos'
  if (/\b(build|compil\w*|bundle)\b/i.test(texto)) return 'compilando'
  if (/\b(git|gh pr|commit|push)\b/i.test(texto)) return 'trabajando con Git'
  if (/\b(curl|fetch|http|api|request)\b/i.test(texto)) return 'consultando un servicio'
  return 'corriendo un comando'
}

const SDK_VERBO: [RegExp, string][] = [
  [/^(fetching|searching the web)\b/i, 'buscando en la web'],
  [/^(reading|read|searching|search|grep|globbing|listing)\b/i, 'revisando código'],
  [/^(editing|edit|updating|update)\b/i, 'editando código'],
  [/^(writing|write|creating)\b/i, 'escribiendo un archivo'],
]

/** Lo que hace AHORA en español. `null` si no hay pista (la vista dice solo «Trabajando»). */
export function actividadLegible(t: Pick<TareaInterna, 'ultimaHerramienta' | 'actividad' | 'tipo'>): string | null {
  const h = t.ultimaHerramienta ?? ''
  if (/^(Read|Glob|Grep|LS|NotebookRead)$/.test(h)) return 'revisando código'
  if (/^(Edit|MultiEdit|NotebookEdit)$/.test(h)) return 'editando código'
  if (h === 'Write') return 'escribiendo un archivo'
  if (h === 'Bash') return actividadDeBash(t.actividad)
  if (h === 'WebSearch') return 'buscando en la web'
  if (h === 'WebFetch') return 'leyendo una página web'
  if (h === 'Agent' || h === 'Task') return 'delegando en otro agente'
  if (h === 'TodoWrite') return 'ordenando su plan'
  if (h === 'Skill') return 'consultando una skill'
  if (h === 'ToolSearch') return 'buscando herramientas'
  if (/^mcp__claude-in-chrome__/.test(h)) return 'usando el navegador'
  if (/^mcp__/.test(h)) return 'usando una herramienta conectada'
  if (t.actividad) {
    if (/^Running\b/i.test(t.actividad)) return actividadDeBash(t.actividad)
    for (const [r, txt] of SDK_VERBO) if (r.test(t.actividad)) return txt
  }
  return t.tipo === 'comando' ? 'en segundo plano' : null
}

const COMANDO = /^(cd |npx |npm |pnpm |yarn |node |python3? |bash |sh |cat |for |while |git |curl |tsx |\.\/|\/|[A-Z_]+=)|&&|\|\||\n|\$\(/
/** Un comando en segundo plano sin descripción llega como el comando mismo: se rotula en palabras. */
export function tituloLegible(t: Pick<TareaInterna, 'descripcion' | 'tipo'>): string {
  const d = t.descripcion.trim()
  if (t.tipo !== 'comando' || !COMANDO.test(d)) return d
  const corto = d.replace(/^cd\s+\S+\s*&&\s*/, '').split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 64)
  const que = actividadDeBash(d)
  const rotulo = que === 'corriendo pruebas' ? 'Pruebas' : que === 'revisando tipos' ? 'Revisión de tipos' : que === 'compilando' ? 'Compilación' : que === 'trabajando con Git' ? 'Git' : null
  return rotulo ? `${rotulo}: ${corto}` : `Comando: ${corto}`
}

/** La primera idea de un texto largo, sin markdown, para la segunda línea de una fila. */
export function resultadoCorto(texto: string | null | undefined, max = 120): string | null {
  if (!texto) return null
  const limpio = texto.split('\n').map(l => l.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim()).find(l => l.length > 2)
  if (!limpio) return null
  const frase = /^(.{20,}?[.!?])(\s|$)/.exec(limpio)?.[1] ?? limpio
  return frase.length > max ? `${frase.slice(0, max - 1).trimEnd()}…` : frase
}

export interface DatoInterna { clave: 'tiempo' | 'contexto' | 'modelo'; texto: string; ayuda: string }

/** Lo que cabe en una línea de la fila: tiempo, contexto y modelo. Lo que no se sabe no aparece. */
export function datosInterna(t: TareaInterna, ahora = Date.now()): DatoInterna[] {
  const out: DatoInterna[] = []
  const ms = tiempoDe(t, ahora)
  if (ms != null) out.push({ clave: 'tiempo', texto: duracionCorta(ms), ayuda: t.estado === 'trabajando' ? 'Lleva corriendo' : 'Lo que tardó' })
  const c = contextoDe(t)
  if (c) out.push({ clave: 'contexto', texto: `${tokensCortos(c)} tokens`, ayuda: 'Contexto que lleva consumido' })
  const m = modeloLegible(t)
  if (m) out.push({ clave: 'modelo', texto: m, ayuda: 'Modelo que está usando' })
  return out
}

/** La segunda línea de la fila: qué hace ahora, o cómo acabó. */
export function lineaDeFila(t: TareaInterna): string | null {
  if (t.estado === 'trabajando') {
    const a = t.resumen && t.resumen.length < 160 ? t.resumen : actividadLegible(t)
    return a ? `Ahora: ${a}` : null
  }
  if (t.estado === 'completada') return resultadoCorto(t.resumen)
  return resultadoCorto(t.nota ?? t.resumen)
}

/** Nombre corto de una herramienta: `mcp__claude-in-chrome__computer` → «computer». */
const nombreHerramienta = (n: string) => n.startsWith('mcp__') ? n.split('__').at(-1) ?? n : n

/** «Bash ×18 · Write ×3 · Read ×4», de más a menos y sin más de `max` rubros. */
export function herramientasEnPalabras(h: readonly { nombre: string; n: number }[], max = 8): string {
  const suma = new Map<string, number>()
  for (const x of h) suma.set(nombreHerramienta(x.nombre), (suma.get(nombreHerramienta(x.nombre)) ?? 0) + x.n)
  const lista = [...suma].sort((a, b) => b[1] - a[1])
  const texto = lista.slice(0, max).map(([n, c]) => `${n} ×${c}`).join(' · ')
  return lista.length > max ? `${texto} · +${lista.length - max} más` : texto
}

/** Una acción del agente en palabras: «Leyó PanelDerecho.tsx», «Corrió: Typecheck arbrain». */
export function accionEnPalabras(a: { herramienta: string; objetivo?: string }): string {
  const o = a.objetivo
  switch (a.herramienta) {
    case 'Read': return o ? `Leyó ${o}` : 'Leyó un archivo'
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return o ? `Editó ${o}` : 'Editó un archivo'
    case 'Write': return o ? `Escribió ${o}` : 'Escribió un archivo'
    case 'Grep': case 'Glob': return o ? `Buscó «${o}» en el código` : 'Buscó en el código'
    case 'Bash': return o ? `Corrió: ${o}` : 'Corrió un comando'
    case 'WebSearch': return o ? `Buscó en la web «${o}»` : 'Buscó en la web'
    case 'WebFetch': return o ? `Abrió una página de ${o}` : 'Abrió una página web'
    case 'Agent': case 'Task': return o ? `Delegó: ${o}` : 'Delegó en otro agente'
    case 'Skill': return o ? `Consultó la skill ${o}` : 'Consultó una skill'
    case 'TodoWrite': return 'Actualizó su plan'
    case 'ToolSearch': return 'Buscó herramientas'
    default: return a.herramienta.startsWith('mcp__') ? `Usó ${nombreHerramienta(a.herramienta)}` : `Usó ${a.herramienta}`
  }
}
