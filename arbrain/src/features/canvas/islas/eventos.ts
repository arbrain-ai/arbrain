/**
 * Mapa v16 · el BUS DE EVENTOS reales y los IMPULSOS por los hilos (14 nov 2026).
 *
 * La vara de Daniel (07:34): «no nos comparamos con el Notion o Figma pre-IA, nos comparamos con la mejor plataforma de
 * lienzos del mundo agéntica post-ASI». Lo que separa un lienzo bonito de un sistema nervioso vivo: cuando pasa algo DE
 * VERDAD, un impulso viaja por el hilo entre los órganos que toca. Nunca es animación de relleno: cada impulso nace de un
 * evento con su fuente, detectado por DIFERENCIA entre dos lecturas reales que la app ya hace:
 *
 *   rutina    una rutina del Taller terminó una corrida nueva          → sistemas   (Taller · rutinas)
 *   agente    un agente de la Cabina empezó o terminó un encargo         → sistemas   (Cabina · trabajos)
 *   cobro     subieron los lugares pagados de la cohorte                 → venta      (Polar · cohorte)
 *   cerebro   un fundador más conectó su cerebro                         → entrega    (la plataforma · cohorte)
 *   video     salió un video nuevo en el canal de Levy                   → marketing  (YouTube · marcador)
 *   dinero    entró un movimiento nuevo a Finanzas                       → finanzas   (Finanzas · tus cuentas)
 *
 * La PRIMERA lectura es la línea base: no dispara nada (abrir el mapa no es «que pasaron 40 cosas»). Clases publicadas por
 * el enrutador y llamadas que entran no tienen sensor que la app lea todavía: quedan fuera hasta que lo tengan.
 *
 * Puro (tests/canvas/islas-eventos.test.ts): `detectar*` comparan dos fotos; el sondeo y el pintado viven en useIslas y
 * en el motor.
 */

export type TipoEvento = 'rutina' | 'agente' | 'cobro' | 'cerebro' | 'video' | 'dinero'

export interface EventoVivo {
  tipo: TipoEvento
  organo: string
  /** Qué pasó, en palabras («Corrió: Reporte de la mañana»). */
  texto: string
  /** De dónde salió (la fuente que lo vio). */
  fuente: string
  /** Cuándo lo vio el lienzo (ms epoch). */
  en: number
  /** Algo salió mal (una rutina que falló): el impulso va en el color del dolor. */
  dolor?: boolean
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])

/** La foto mínima de cada fuente: lo justo para comparar (ids y conteos), sin guardar datos de nadie. */
export interface Foto {
  rutinas?: { ids: Set<string>; nombres: Map<string, string> }
  agentes?: Map<string, string>          // id → estado
  cohorte?: { pagados: number | null; conectados: number }
  videos?: Set<string>
  movimientos?: Set<string>
}

export function fotoRutinas(x: unknown): Foto['rutinas'] | undefined {
  if (!obj(x) || !Array.isArray(x.runs)) return undefined
  const nombres = new Map<string, string>()
  for (const j of arr(x.jobs)) if (obj(j) && typeof j.id === 'string') nombres.set(j.id, typeof j.name === 'string' ? j.name : typeof j.nombre === 'string' ? j.nombre : j.id)
  const ids = new Set<string>()
  for (const r of x.runs) if (obj(r) && typeof r.id === 'string' && r.status !== 'running') ids.add(`${r.id}|${r.job_id ?? ''}|${r.status ?? ''}`)
  return { ids, nombres }
}
export function fotoAgentes(x: unknown): Foto['agentes'] | undefined {
  if (!obj(x)) return undefined
  const m = new Map<string, string>()
  for (const t of arr(x.terminales)) if (obj(t) && (typeof t.id === 'number' || typeof t.id === 'string') && obj(t.subagente)) m.set(`t${t.id}|${typeof t.titulo === 'string' ? t.titulo : ''}`, String(t.estado ?? ''))
  for (const t of arr(x.internas)) if (obj(t) && typeof t.id === 'string') m.set(`i${t.id}|${typeof t.titulo === 'string' ? t.titulo : typeof t.nombre === 'string' ? t.nombre : ''}`, String(t.estado ?? ''))
  return m
}
export function fotoCohorte(x: unknown): Foto['cohorte'] | undefined {
  if (!obj(x) || !obj(x.numeros) || !Array.isArray(x.fundadores)) return undefined
  const p = x.numeros.cuposPagados
  return { pagados: typeof p === 'number' ? p : null, conectados: x.fundadores.filter(f => obj(f) && f.cerebro).length }
}
export function fotoVideos(x: unknown): Foto['videos'] | undefined {
  if (!obj(x) || x.activo !== true || !Array.isArray(x.videos)) return undefined
  return new Set(x.videos.flatMap(v => (obj(v) && typeof v.id === 'string' && v.estado === 'publico' ? [v.id] : [])))
}
export function fotoMovimientos(x: unknown): Foto['movimientos'] | undefined {
  if (!obj(x) || !Array.isArray(x.movements)) return undefined
  return new Set(x.movements.flatMap(m => (obj(m) && typeof m.id === 'string' ? [m.id] : [])))
}

const corto = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/** Lo que pasó entre dos fotos. Sin foto anterior (o sin la nueva) no hay evento: es línea base o falta de dato. */
export function detectar(antes: Foto, ahora: Foto, en: number): EventoVivo[] {
  const out: EventoVivo[] = []
  if (antes.rutinas && ahora.rutinas) {
    for (const id of ahora.rutinas.ids) {
      if (antes.rutinas.ids.has(id)) continue
      const [, job, estado] = id.split('|')
      const falla = /error|fail|fall/i.test(estado)
      out.push({ tipo: 'rutina', organo: 'sistemas', texto: `${falla ? 'Falló' : 'Corrió'}: ${corto(ahora.rutinas.nombres.get(job) ?? job)}`, fuente: 'Taller · rutinas', en, ...(falla ? { dolor: true } : {}) })
    }
  }
  if (antes.agentes && ahora.agentes) {
    for (const [id, estado] of ahora.agentes) {
      const prev = antes.agentes.get(id)
      const titulo = corto(id.split('|').slice(1).join('|') || 'un encargo')
      if (prev === undefined && estado === 'trabajando') out.push({ tipo: 'agente', organo: 'sistemas', texto: `Empezó: ${titulo}`, fuente: 'Cabina · trabajos', en })
      else if (prev === 'trabajando' && estado !== 'trabajando') out.push({ tipo: 'agente', organo: 'sistemas', texto: `${/fall/i.test(estado) ? 'Falló' : 'Terminó'}: ${titulo}`, fuente: 'Cabina · trabajos', en, ...(/fall/i.test(estado) ? { dolor: true } : {}) })
    }
  }
  if (antes.cohorte && ahora.cohorte) {
    const a = antes.cohorte.pagados, b = ahora.cohorte.pagados
    if (a !== null && b !== null && b > a) out.push({ tipo: 'cobro', organo: 'venta', texto: b - a === 1 ? 'Un lugar pagado más' : `${b - a} lugares pagados más`, fuente: 'Polar · cohorte', en })
    if (ahora.cohorte.conectados > antes.cohorte.conectados) out.push({ tipo: 'cerebro', organo: 'entrega', texto: 'Un fundador más conectó su cerebro', fuente: 'La plataforma · cohorte', en })
  }
  if (antes.videos && ahora.videos) {
    const nuevos = [...ahora.videos].filter(v => !antes.videos!.has(v)).length
    if (nuevos) out.push({ tipo: 'video', organo: 'marketing', texto: nuevos === 1 ? 'Salió un video' : `Salieron ${nuevos} videos`, fuente: 'YouTube · canal de Levy', en })
  }
  if (antes.movimientos && ahora.movimientos) {
    const nuevos = [...ahora.movimientos].filter(v => !antes.movimientos!.has(v)).length
    if (nuevos) out.push({ tipo: 'dinero', organo: 'finanzas', texto: nuevos === 1 ? 'Un movimiento nuevo' : `${nuevos} movimientos nuevos`, fuente: 'Finanzas · tus cuentas', en })
  }
  // Una avalancha (p. ej. el primer sondeo tras dormir la computadora) no es 40 impulsos: se resume en uno por órgano.
  if (out.length > 6) {
    const porOrgano = new Map<string, EventoVivo>()
    for (const e of out) { const y = porOrgano.get(e.organo); porOrgano.set(e.organo, y ? { ...y, texto: `${y.texto} y más`, dolor: y.dolor || e.dolor } : e) }
    return [...porOrgano.values()]
  }
  return out
}

// ── El impulso: a dónde viaja y cómo se mueve ──

/** Duración de un impulso por el hilo (ms). */
export const DURACION_IMPULSO = 1800

export interface Impulso { evento: EventoVivo; conector: string; reverso: boolean; t0: number }

/** La isla de un órgano: su receta lo dice (`organo` o su `id`), o el id del elemento (`isla-<organo>`). */
export function islaDeOrgano(organo: string, islas: ReadonlyArray<{ elId: string; organo?: string; id?: string }>): string | null {
  return islas.find(i => i.organo === organo)?.elId ?? islas.find(i => i.id === organo)?.elId ?? islas.find(i => i.elId === `isla-${organo}`)?.elId ?? null
}

/** Los impulsos de un evento: uno por cada hilo que sale (o llega) a la isla del órgano, alejándose de ella. */
export function impulsosDe(e: EventoVivo, islaId: string, conectores: ReadonlyArray<{ id: string; fromId: string; toId: string }>, t0: number): Impulso[] {
  return conectores.filter(c => c.fromId === islaId || c.toId === islaId).map(c => ({ evento: e, conector: c.id, reverso: c.toId === islaId, t0 }))
}

/** Un punto a fracción `u` (0..1) del largo de una polilínea. */
export function puntoEn(pts: ReadonlyArray<{ x: number; y: number }>, u: number): { x: number; y: number } | null {
  if (pts.length < 2) return pts[0] ?? null
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let falta = Math.max(0, Math.min(1, u)) * total
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (falta <= d || i === pts.length - 1) {
      const k = d ? Math.min(1, falta / d) : 0
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }
    }
    falta -= d
  }
  return pts[pts.length - 1]
}

/** Suave al salir y al llegar: un impulso nervioso acelera y frena. */
export const aliento = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
