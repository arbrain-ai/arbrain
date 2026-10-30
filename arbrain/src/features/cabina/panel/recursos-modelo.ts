/**
 * «El taller hoy» (15 oct 2026, Daniel: «los gráficos más hermosos… para mostrar lo que consume recursos en esta máquina,
 * pensando en el dueño de negocio que le interesa su "taller"… no demasiado técnico»). La parte PURA: de las muestras del
 * vigía de recursos (`arbrain/server/scripts/vigia-recursos.py`, una por minuto en `~/.claudeclaw/logs/vigia-recursos.jsonl`)
 * a lo que el dueño entiende: qué parte del taller trabaja, cuánto espacio ocupa, si está sano y qué cambió hace una hora.
 *
 * Traducción al taller:
 *  · memoria real → «espacio» en la mesa (32 GB = la mesa entera; lo libre se ve vacío)
 *  · CPU          → «esfuerzo»: % de la fuerza de TODA la máquina (el vigía la da en % de un núcleo; se divide entre núcleos)
 *  · GPU          → «gráficos» (solo total: macOS no la reparte por proceso)
 *  · swap, disco y presión → la salud, con los mismos umbrales del vigía (nunca otros)
 * Los nombres de cada parte son los del Taller (agent-server `cabina/procesos.ts`: «Servidor de Levy», «Arbrain web»,
 * «Voz de los agentes», «Base de Mission Control»…). Falta de medición nunca es cero: lo que no se midió queda `null`.
 * Pruebas: tests/panel/recursos-modelo.test.ts.
 */

export type GrupoTaller = 'levy' | 'arbrain' | 'datos' | 'apps' | 'tuyo' | 'sistema'
export interface ParteTaller { nombre: string; grupo: GrupoTaller; que: string; porque: string }

/** Cada componente del vigía con su nombre en el Taller. El orden es el de la mesa (de lo tuyo de negocio a lo del sistema). */
export const PARTES: Record<string, ParteTaller> = {
  agentes: { nombre: 'Agentes de Levy', grupo: 'levy', que: 'Las conversaciones y los encargos que trabajan para ti', porque: 'Sube cuando Levy o sus agentes trabajan: compilar, generar imágenes o video, abrir navegadores de prueba. Cada conversación viva ocupa unos 220 MB y se retira 30 min después del último mensaje.' },
  'agent-server': { nombre: 'Servidor de Levy', grupo: 'levy', que: 'El chat de Levy, sus crons y esta misma vista', porque: 'Es el corazón de Levy: pesa poco y casi siempre igual. Si crece hora tras hora, el vigía te avisa.' },
  manos: { nombre: 'Manos de Levy', grupo: 'levy', que: 'Cómo Levy usa tu computadora y su propio Chrome', porque: 'Trabaja cuando Levy navega o usa una app por ti; su Chrome guarda páginas abiertas.' },
  sueltos: { nombre: 'Claude y Codex sueltos', grupo: 'levy', que: 'Sesiones abiertas fuera de Arbrain', porque: 'Terminales de Claude o Codex que abriste a mano. Ciérralas cuando ya no las uses.' },
  escritorio: { nombre: 'App Arbrain', grupo: 'arbrain', que: 'La ventana donde estás ahora', porque: 'Crece con el uso del día (chat largo, calendario, lienzo). Sin foco casi no gasta; cerrarla y abrirla la deja ligera.' },
  web: { nombre: 'Arbrain web', grupo: 'arbrain', que: 'La app que abres en el navegador y en el Funnel', porque: 'Trabaja cuando alguien abre Arbrain o una vista pide datos.' },
  motor: { nombre: 'Motor de Arbrain', grupo: 'arbrain', que: 'Las terminales de los agentes', porque: 'Pesa casi nada; lo que corre dentro de una terminal se cuenta aquí.' },
  servicios: { nombre: 'Servicios del negocio', grupo: 'arbrain', que: 'Crons, túneles, Salud y la Casa', porque: 'Los pequeños servicios que corren solos: suben un momento cuando les toca su rutina.' },
  colima: { nombre: 'Base de Mission Control', grupo: 'datos', que: 'Supabase local: tareas, calendario y lienzos', porque: 'Una máquina virtual que guarda tu calendario, tareas y lienzos. Ocupa siempre lo mismo (su tope es 5 GB).' },
  voz: { nombre: 'Voz de los agentes', grupo: 'apps', que: 'La voz con la que hablan Levy y los agentes', porque: 'El modelo de voz vive cargado para responder al instante: ocupa ~2 GB aunque esté callado.' },
  'apps-sf': { nombre: 'Apps SaaS Factory', grupo: 'apps', que: 'SFlow, SFPoint y las demás', porque: 'SFlow carga su modelo de dictado: de 1.3 a 3 GB según lo que haga.' },
  chrome: { nombre: 'Tu Chrome', grupo: 'tuyo', que: 'Tu navegador y sus pestañas', porque: 'Cada pestaña abierta guarda su página; tras varios días abierto pesa más.' },
  otras: { nombre: 'Otras apps', grupo: 'tuyo', que: 'WhatsApp, Logitech, Tailscale y las demás', porque: 'Las apps que abriste tú.' },
  macos: { nombre: 'macOS', grupo: 'sistema', que: 'El edificio: el sistema donde vive todo', porque: 'Pantallas, audio, ventanas y el propio sistema. Su parte es fija y no se toca.' },
}
export const ORDEN_PARTES = Object.keys(PARTES)
export const GRUPOS: Record<GrupoTaller, string> = { levy: 'Levy', arbrain: 'Arbrain', datos: 'Datos', apps: 'Voz y apps', tuyo: 'Tuyo', sistema: 'Sistema' }
export const parte = (id: string): ParteTaller => PARTES[id] ?? { nombre: id, grupo: 'tuyo', que: 'Otra parte de la máquina', porque: '' }

/** Una línea del registro del vigía (lo que escribe `log()` en vigia-recursos.py). `comp`: id → [MB reales, % de un núcleo, procesos]. */
export interface LineaVigia {
  ts: string; presion?: number; libre_pct?: number; swap_gb?: number; swapout_mb_min?: number | null; cpu_pct?: number | null
  carga?: number; disco_gb?: number; gpu_pct?: number | null; comp?: Record<string, [number, number, number?]>; alertas?: string[]
}

/** Un punto de la jornada (promedio de su intervalo). `t` en ms. `cpu`: % de la máquina; `comp`: id → [MB, % de la máquina]. */
export interface Punto { t: number; cpu: number | null; gpu: number | null; usado: number; swap: number | null; disco: number | null; comp: Record<string, [number, number]> }

export interface FotoRecursos {
  disponible: boolean
  ramMb: number; nucleos: number
  /** La última muestra, cruda (para el veredicto y la mesa). */
  ahora: LineaVigia | null
  serie: Punto[]
  pasoMin: number
  /** Desde cuándo hay registro (ms): antes de esto no se midió. */
  desde: number | null
}

/** Lee un JSONL tolerando líneas cortadas (la primera de un trozo leído desde la mitad). */
export function leerLineas(texto: string): LineaVigia[] {
  const out: LineaVigia[] = []
  for (const l of texto.split('\n')) {
    if (!l.startsWith('{')) continue
    try { const x = JSON.parse(l) as LineaVigia; if (typeof x.ts === 'string' && !Number.isNaN(Date.parse(x.ts))) out.push(x) } catch { /* línea a medias */ }
  }
  return out
}

/** % de un núcleo → % de la máquina entera. */
export const deLaMaquina = (pctNucleo: number, nucleos: number) => pctNucleo / Math.max(1, nucleos)

/**
 * Las muestras de la ventana [ahora - horas, ahora] promediadas en intervalos de `pasoMin`. Un intervalo sin muestras no
 * se inventa: simplemente no hay punto (la gráfica deja el hueco). `usado` = MB ocupados según la memoria libre del kernel.
 */
export function jornada(lineas: LineaVigia[], o: { ramMb: number; nucleos: number; ahora: number; horas: number; pasoMin: number }): Punto[] {
  const paso = o.pasoMin * 60_000, inicio = o.ahora - o.horas * 3600_000
  const cubos = new Map<number, LineaVigia[]>()
  for (const l of lineas) {
    const t = Date.parse(l.ts)
    if (t < inicio || t > o.ahora + 60_000) continue
    const k = Math.floor(t / paso) * paso
    const c = cubos.get(k); if (c) c.push(l); else cubos.set(k, [l])
  }
  const prom = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  return [...cubos.entries()].sort((a, b) => a[0] - b[0]).map(([k, ls]) => {
    const ids = new Set(ls.flatMap(l => Object.keys(l.comp ?? {})))
    const comp: Record<string, [number, number]> = {}
    for (const id of ids) {
      const mb = prom(ls.map(l => l.comp?.[id]?.[0])) ?? 0
      const cpu = prom(ls.map(l => l.comp?.[id]?.[1])) ?? 0
      comp[id] = [Math.round(mb), round1(deLaMaquina(cpu, o.nucleos))]
    }
    const cpu = prom(ls.map(l => l.cpu_pct)), libre = prom(ls.map(l => l.libre_pct))
    return {
      t: k + paso / 2, cpu: cpu == null ? null : round1(cpu), gpu: nulo1(prom(ls.map(l => l.gpu_pct))),
      usado: libre == null ? 0 : Math.round(o.ramMb * (1 - libre / 100)), swap: nulo1(prom(ls.map(l => l.swap_gb))), disco: nulo1(prom(ls.map(l => l.disco_gb))), comp,
    }
  })
}
const round1 = (x: number) => Math.round(x * 10) / 10
const nulo1 = (x: number | null) => x == null ? null : round1(x)

// ── La salud: los MISMOS umbrales del vigía (vigia-recursos.py, dict U). Aquí se leen, no se inventan. ──
export const UMBRALES = { presionAviso: 2, presionUrgente: 4, librePct: 20, swapGb: 8, cpuPct: 85, discoAvisoGb: 40, discoUrgenteGb: 15 }

export type TonoSalud = 'sana' | 'atenta' | 'apretada' | 'sin-dato'
export interface Salud { tono: TonoSalud; palabra: string; razones: string[] }

/** Sana / atenta / apretada. «Apretada» = un umbral urgente o un aviso que el vigía ya sostuvo (sus `alertas`). */
export function salud(l: LineaVigia | null, edadMs: number): Salud {
  if (!l || edadMs > 10 * 60_000) return { tono: 'sin-dato', palabra: 'Sin lectura', razones: [l ? `El vigía no mide desde hace ${Math.round(edadMs / 60_000)} min.` : 'El vigía todavía no ha medido.'] }
  const urg: string[] = [], av: string[] = []
  if ((l.presion ?? 1) >= UMBRALES.presionUrgente) urg.push('macOS está en presión crítica de memoria')
  else if ((l.presion ?? 1) >= UMBRALES.presionAviso) av.push('macOS empieza a apretar la memoria')
  if (l.libre_pct != null && l.libre_pct < UMBRALES.librePct) av.push(`queda ${l.libre_pct} % de espacio libre`)
  if (l.swap_gb != null && l.swap_gb >= UMBRALES.swapGb) av.push(`usa ${l.swap_gb.toFixed(1)} GB del disco como memoria`)
  if (l.cpu_pct != null && l.cpu_pct >= UMBRALES.cpuPct) av.push(`trabaja al ${Math.round(l.cpu_pct)} % de su fuerza`)
  if (l.disco_gb != null && l.disco_gb < UMBRALES.discoUrgenteGb) urg.push(`quedan ${Math.round(l.disco_gb)} GB de disco`)
  else if (l.disco_gb != null && l.disco_gb < UMBRALES.discoAvisoGb) av.push(`quedan ${Math.round(l.disco_gb)} GB de disco`)
  const sostenidas = (l.alertas ?? []).length
  if (urg.length || sostenidas) return { tono: 'apretada', palabra: 'Apretada', razones: [...urg, ...av, ...(sostenidas && !urg.length && !av.length ? ['el vigía ya te avisó de algo sostenido'] : [])] }
  if (av.length) return { tono: 'atenta', palabra: 'Atenta', razones: av }
  return { tono: 'sana', palabra: 'Sana', razones: [] }
}

/** Las partes de la mesa ahora: espacio (MB) y esfuerzo (% de la máquina), en el orden del taller. Lo mínimo (< 40 MB) se omite. */
export interface ParteAhora { id: string; mb: number; esfuerzo: number; parte: ParteTaller }
export function mesa(l: LineaVigia | null, nucleos: number): ParteAhora[] {
  if (!l?.comp) return []
  const ids = Object.keys(l.comp)
  const orden = [...ORDEN_PARTES.filter(id => ids.includes(id)), ...ids.filter(id => !ORDEN_PARTES.includes(id))]
  return orden.map(id => ({ id, mb: l.comp![id][0], esfuerzo: round1(deLaMaquina(l.comp![id][1], nucleos)), parte: parte(id) })).filter(p => p.mb >= 40)
}

/** «Trabajando» = usa al menos 1.5 % de la fuerza de la máquina (~15 % de un núcleo en el Studio). macOS nunca se dora. */
export const UMBRAL_TRABAJA = 1.5
export const trabaja = (p: { id: string; esfuerzo: number }) => p.id !== 'macos' && p.esfuerzo >= UMBRAL_TRABAJA

/** El punto más cercano a `t` (± medio intervalo de tolerancia extra). */
export function puntoEn(serie: Punto[], t: number, tolMs = 12 * 60_000): Punto | null {
  let mejor: Punto | null = null, d = Infinity
  for (const p of serie) { const x = Math.abs(p.t - t); if (x < d) { d = x; mejor = p } }
  return mejor && d <= tolMs ? mejor : null
}

/** Quién trabajaba más en un punto (sin macOS): los `n` primeros con esfuerzo > 0.3 %. */
export function quienes(p: Punto | null, n = 3) {
  if (!p) return []
  return Object.entries(p.comp).filter(([id, [, c]]) => id !== 'macos' && c > 0.3).sort((a, b) => b[1][1] - a[1][1]).slice(0, n).map(([id, [mb, c]]) => ({ id, mb, esfuerzo: c, parte: parte(id) }))
}

/**
 * Los momentos que vale la pena señalar en la jornada: empujones de esfuerzo claramente por encima de lo normal del día
 * (≥ 25 % de la máquina y ≥ 2× la mediana), separados al menos una hora. Cada uno dice quién empujó.
 */
export interface Momento { t: number; cpu: number; quien: string | null }
export function momentos(serie: Punto[], max = 3): Momento[] {
  const vals = serie.map(p => p.cpu).filter((x): x is number => x != null).sort((a, b) => a - b)
  if (vals.length < 6) return []
  const mediana = vals[Math.floor(vals.length / 2)]
  const umbral = Math.max(25, mediana * 2)
  const candidatos = serie.filter(p => p.cpu != null && p.cpu >= umbral).sort((a, b) => b.cpu! - a.cpu!)
  const elegidos: Momento[] = []
  for (const p of candidatos) {
    if (elegidos.some(m => Math.abs(m.t - p.t) < 3600_000)) continue
    elegidos.push({ t: p.t, cpu: p.cpu!, quien: quienes(p, 1)[0]?.id ?? null })
    if (elegidos.length >= max) break
  }
  return elegidos.sort((a, b) => a.t - b.t)
}

const gb = (mb: number) => `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`
export const enGb = gb

/** Qué cambió hace una hora, en una frase (o null si no hay registro de entonces). */
export function haceUnaHora(serie: Punto[], ahora: Punto | null, t: number): string | null {
  const antes = puntoEn(serie, t - 3600_000)
  if (!antes || !ahora) return null
  const dEsp = ahora.usado - antes.usado
  const cpuA = antes.cpu ?? 0, cpuB = ahora.cpu ?? 0
  const partes: string[] = []
  if (Math.abs(cpuB - cpuA) >= 8) partes.push(cpuB > cpuA ? `el taller trabaja más (${Math.round(cpuA)} → ${Math.round(cpuB)} %)` : `el taller trabaja menos (${Math.round(cpuA)} → ${Math.round(cpuB)} %)`)
  if (Math.abs(dEsp) >= 768) partes.push(`${partes.length ? '' : 'el taller '}${dEsp > 0 ? `ocupa ${gb(dEsp)} más` : `liberó ${gb(-dEsp)}`}`)
  // La parte que más cambió de espacio, si fue grande.
  const ids = new Set([...Object.keys(ahora.comp), ...Object.keys(antes.comp)])
  let mayor: { id: string; d: number } | null = null
  for (const id of ids) { if (id === 'macos') continue; const d = (ahora.comp[id]?.[0] ?? 0) - (antes.comp[id]?.[0] ?? 0); if (!mayor || Math.abs(d) > Math.abs(mayor.d)) mayor = { id, d } }
  if (mayor && Math.abs(mayor.d) >= 512) partes.push(`${parte(mayor.id).nombre} ${mayor.d > 0 ? `creció ${gb(mayor.d)}` : `soltó ${gb(-mayor.d)}`}`)
  if (!partes.length) return 'Igual que hace una hora: nada se movió de verdad.'
  return `Desde hace una hora, ${partes.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
}

/** La frase grande: cómo está el taller en una línea, sin tecnicismos. */
export function frase(s: Salud, l: LineaVigia | null, partes: ParteAhora[]): string {
  if (!l) return 'Esperando la primera lectura del vigía'
  const libre = l.libre_pct ?? null
  const cpu = l.cpu_pct ?? 0
  const top = [...partes].filter(trabaja).sort((a, b) => b.esfuerzo - a.esfuerzo)[0]
  if (s.tono === 'apretada') return `El taller está apretado: ${s.razones[0] ?? 'revisa lo que más ocupa'}`
  if (s.tono === 'atenta') return `El taller trabaja, pero ${s.razones[0]}`
  const espacio = libre != null && libre >= 50 ? 'con espacio de sobra' : libre != null && libre >= 30 ? 'con espacio suficiente' : 'con poco espacio libre'
  if (cpu >= 55) return `El taller está a todo vapor${top ? `: ${top.parte.nombre} empuja` : ''}, ${espacio}`
  if (cpu >= 20) return `El taller trabaja a buen ritmo y ${espacio.replace('con ', 'tiene ')}`
  return `El taller está en calma y ${espacio.replace('con ', 'tiene ')}`
}
