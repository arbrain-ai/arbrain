/**
 * Bitácora de uso real de las manos.
 *
 * Una línea JSON por pedido en `~/.config/arbrain/manos/bitacora/AAAA-MM-DD.jsonl`
 * (o `MANOS_BITACORA_DIR`): qué pidió Daniel, en qué apps, cada paso con quién lo
 * decidió y con qué confianza, si se verificó, cuánto tardó y si hubo corrección.
 *
 * Privacidad (spec v1 §4): sin capturas y sin texto de las apps.
 *   - Lo que se escribe se guarda como longitud, nunca el texto.
 *   - De los elementos solo se guarda el rol y, para controles (botón, enlace,
 *     menú, pestaña), una etiqueta recortada a 40 caracteres; en apps y páginas
 *     de chat o correo, ni eso.
 *   - El pedido de Daniel se guarda recortado a 200 caracteres: es su intención,
 *     no contenido de una app.
 *
 * Resumen: `npx tsx src/manos/bitacora.ts resumen [--dias 7] [--todo]`.
 * Corrección de Daniel: `npx tsx src/manos/bitacora.ts corregir <id> "qué estuvo mal"`.
 * Formato documentado en docs/builds/manos-v1-estable-2026-10-02/BITACORA.md.
 */
import { DIR_ARBRAIN } from '../edicion.js'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { APPS_CHAT } from './freno.js'

export const DIR_BITACORA = () => process.env.MANOS_BITACORA_DIR || join(DIR_ARBRAIN(), 'manos', 'bitacora')

export type Origen = 'cerebro' | 'encargar' | 'mcp' | 'receta' | 'canario' | 'prueba'

export interface PasoBitacora {
  /** ms desde el inicio del pedido. */
  t: number
  herramienta: string
  accion?: string
  app?: string
  rol?: string
  etiqueta?: string
  /** Longitud de lo escrito (nunca el texto). */
  escrito?: number
  tecla?: string
  /** Quién decidió el paso: el modelo del cerebro, `jev`, `receta`, `claude:…`, `guion`. */
  decidio?: string
  confianza?: number | null
  resultado: 'ok' | 'fallo' | 'bloqueado' | 'lectura'
  efecto?: string
  freno?: { categoria: string; paso: boolean }
  ms: number
  detalle?: string
}

export interface EntradaBitacora {
  tipo: 'pedido'
  id: string
  en: string
  origen: Origen
  pedido: string
  apps: string[]
  /** Modelos que intervinieron, en orden; `escalado` si Sonnet pasó a Opus y por qué. */
  cerebro?: { modelos: string[]; escalado?: { de: string; a: string; motivo: string }; intentos: number; costo_usd?: number }
  pasos: PasoBitacora[]
  verificacion?: { ok: boolean; como: string }
  ok: boolean
  /** a la primera: ok, un solo intento, sin escalar por falla y sin corrección. */
  a_la_primera: boolean
  ms: number
  falla?: { firma: string; detalle: string }
  correccion?: string | null
}

export interface Correccion { tipo: 'correccion'; id: string; en: string; nota: string }

const ROLES_CONTROL = /^(AXButton|AXLink|AXMenuItem|AXMenuBarItem|AXTab|AXRadioButton|AXCheckBox|AXPopUpButton|AXMenuButton|AXSwitch|AXDisclosureTriangle)$/
const WEB_PRIVADA = /(whatsapp|mail\.google|outlook|messenger|instagram\.com\/direct|linkedin\.com\/messaging|slack|discord|telegram)/i

/** Lo único que se guarda de un elemento. */
export function etiquetaSegura(rol: string | undefined, etiqueta: string | undefined, app?: string, url?: string): string | undefined {
  if (!rol || !etiqueta || !ROLES_CONTROL.test(rol)) return undefined
  if (app && APPS_CHAT.has(app.toLowerCase())) return undefined
  if (url && WEB_PRIVADA.test(url)) return undefined
  // En la web, los enlaces llevan títulos (videos, asuntos, nombres): solo se guardan etiquetas de botones.
  if (url && rol === 'AXLink') return undefined
  return etiqueta.replace(/\s+/g, ' ').trim().slice(0, 40)
}

export const nuevoId = () => `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`

/** Firma estable de una falla: sin números, refs ni comillas, para reconocer «la misma» falla otro día. */
export function firmaFalla(app: string | undefined, detalle: string): string {
  return `${app ?? '?'}|${detalle.toLowerCase().replace(/«[^»]*»|"[^"]*"/g, '«»').replace(/\be\d+\b/g, 'eN').replace(/\d+(\.\d+)?/g, 'N').replace(/\s+/g, ' ').slice(0, 120)}`
}

function archivo(d = new Date()): string {
  const dir = DIR_BITACORA()
  mkdirSync(dir, { recursive: true })
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return join(dir, `${f}.jsonl`)
}

export function escribir(e: EntradaBitacora | Correccion | Record<string, unknown>): void {
  try { appendFileSync(archivo(), JSON.stringify(e) + '\n') } catch { /* la bitácora nunca rompe una acción */ }
}

/** Arma una entrada mientras transcurre el pedido. */
export class Registro {
  readonly id = nuevoId()
  private readonly t0 = performance.now()
  readonly pasos: PasoBitacora[] = []
  readonly apps = new Set<string>()
  cerebro?: EntradaBitacora['cerebro']
  verificacion?: EntradaBitacora['verificacion']
  cerrado = false

  constructor(readonly origen: Origen, readonly pedido: string) {}

  get ms() { return Math.round(performance.now() - this.t0) }

  paso(p: Omit<PasoBitacora, 't'>): void {
    if (p.app) this.apps.add(p.app)
    this.pasos.push({ t: this.ms, ...p })
  }

  cerrar(ok: boolean, extra: { falla?: string; intentos?: number; escaloPorFalla?: boolean } = {}): EntradaBitacora {
    this.cerrado = true
    const app = [...this.apps][0]
    const e: EntradaBitacora = {
      tipo: 'pedido', id: this.id, en: new Date().toISOString(), origen: this.origen, pedido: this.pedido.slice(0, 200), apps: [...this.apps],
      ...(this.cerebro ? { cerebro: this.cerebro } : {}), pasos: this.pasos, ...(this.verificacion ? { verificacion: this.verificacion } : {}),
      ok, a_la_primera: ok && (extra.intentos ?? 1) <= 1 && !extra.escaloPorFalla, ms: this.ms,
      ...(ok || !extra.falla ? {} : { falla: { firma: firmaFalla(app, extra.falla), detalle: extra.falla.slice(0, 300) } }), correccion: null,
    }
    escribir(e)
    return e
  }
}

// ---------- Lectura y resumen ----------

export function leerTodo(dir = DIR_BITACORA()): { pedidos: EntradaBitacora[]; correcciones: Correccion[]; otros: any[] } {
  const pedidos: EntradaBitacora[] = [], correcciones: Correccion[] = [], otros: any[] = []
  if (!existsSync(dir)) return { pedidos, correcciones, otros }
  for (const f of readdirSync(dir).filter(x => x.endsWith('.jsonl')).sort()) {
    for (const l of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!l.trim()) continue
      try { const x = JSON.parse(l); (x.tipo === 'pedido' ? pedidos : x.tipo === 'correccion' ? correcciones : otros).push(x) } catch { /* línea rota: se salta */ }
    }
  }
  for (const c of correcciones) { const p = pedidos.find(x => x.id === c.id); if (p) { p.correccion = c.nota; p.a_la_primera = false } }
  return { pedidos, correcciones, otros }
}

export interface Resumen {
  desde: string
  pedidos: number
  ok: number
  a_la_primera: number
  pct_a_la_primera: number | null
  por_origen: Record<string, number>
  escalados: { id: string; pedido: string; motivo: string }[]
  frenos: { categoria: string; paso: boolean; n: number }[]
  fallas_nuevas: { id: string; firma: string; detalle: string }[]
  jev_alta_confianza_erronea: { id: string; confianza: number; detalle: string }[]
  jev_decisiones: number
  alertas_canario: any[]
}

/** `uso_real`: excluye canario y pruebas del % (miden salud, no uso). */
export function resumir(dias = 7, todo = false, dir = DIR_BITACORA()): Resumen {
  const { pedidos, otros } = leerTodo(dir)
  const desde = new Date(Date.now() - dias * 86_400_000)
  const ventana = pedidos.filter(p => new Date(p.en) >= desde)
  const uso = todo ? ventana : ventana.filter(p => p.origen !== 'canario' && p.origen !== 'prueba')
  const previas = new Set(pedidos.filter(p => new Date(p.en) < desde && p.falla).map(p => p.falla!.firma))
  const fallasNuevas: Resumen['fallas_nuevas'] = []
  for (const p of ventana) {
    if (!p.falla) continue
    if (!previas.has(p.falla.firma)) fallasNuevas.push({ id: p.id, firma: p.falla.firma, detalle: p.falla.detalle })
    previas.add(p.falla.firma)
  }
  // Jev con confianza alta y equivocado: su paso falló o la corrida terminó mal justo después, o Daniel corrigió.
  const jevMal: Resumen['jev_alta_confianza_erronea'] = []
  let jevN = 0
  for (const p of ventana) {
    p.pasos.forEach((s, i) => {
      if (!/^jev/.test(s.decidio ?? '')) return
      jevN++
      if ((s.confianza ?? 0) < 0.85) return
      const siguienteFallo = p.pasos.slice(i, i + 3).some(x => x.resultado === 'fallo')
      if (siguienteFallo || p.correccion || (!p.ok && i >= p.pasos.length - 3)) jevMal.push({ id: p.id, confianza: s.confianza!, detalle: `${s.accion ?? s.herramienta} ${s.rol ?? ''} «${s.etiqueta ?? ''}» → ${p.correccion ?? s.detalle ?? (p.falla?.detalle ?? 'la corrida falló')}`.slice(0, 200) })
    })
  }
  const frenos = new Map<string, { categoria: string; paso: boolean; n: number }>()
  for (const p of ventana) for (const s of p.pasos) if (s.freno) {
    const k = `${s.freno.categoria}|${s.freno.paso}`
    frenos.set(k, { categoria: s.freno.categoria, paso: s.freno.paso, n: (frenos.get(k)?.n ?? 0) + 1 })
  }
  const porOrigen: Record<string, number> = {}
  for (const p of ventana) porOrigen[p.origen] = (porOrigen[p.origen] ?? 0) + 1
  const primera = uso.filter(p => p.a_la_primera).length
  return {
    desde: desde.toISOString(), pedidos: uso.length, ok: uso.filter(p => p.ok).length, a_la_primera: primera,
    pct_a_la_primera: uso.length ? Math.round((primera / uso.length) * 100) : null, por_origen: porOrigen,
    escalados: ventana.filter(p => p.cerebro?.escalado).map(p => ({ id: p.id, pedido: p.pedido.slice(0, 80), motivo: `${p.cerebro!.escalado!.de}→${p.cerebro!.escalado!.a}: ${p.cerebro!.escalado!.motivo}` })),
    frenos: [...frenos.values()], fallas_nuevas: fallasNuevas, jev_alta_confianza_erronea: jevMal, jev_decisiones: jevN,
    alertas_canario: otros.filter(o => o.tipo === 'canario' && new Date(o.en) >= desde && o.regresiones?.length),
  }
}

export function textoResumen(r: Resumen): string {
  const l: string[] = []
  l.push(`Bitácora de manos desde ${r.desde.slice(0, 10)} · ${DIR_BITACORA()}`)
  l.push(`Pedidos de uso real: ${r.pedidos} · resueltos ${r.ok} · a la primera ${r.a_la_primera}${r.pct_a_la_primera != null ? ` (${r.pct_a_la_primera} %)` : ''}`)
  l.push(`Por origen: ${Object.entries(r.por_origen).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`)
  l.push(`Fallas nuevas: ${r.fallas_nuevas.length}${r.fallas_nuevas.map(f => `\n  - ${f.id}: ${f.detalle.slice(0, 120)}`).join('')}`)
  l.push(`Jev: ${r.jev_decisiones} decisiones · con confianza ≥0.85 y equivocado: ${r.jev_alta_confianza_erronea.length}${r.jev_alta_confianza_erronea.map(j => `\n  - ${j.id} (${j.confianza}): ${j.detalle}`).join('')}`)
  l.push(`Escalados a Opus: ${r.escalados.length}${r.escalados.map(e => `\n  - ${e.id} «${e.pedido}»: ${e.motivo}`).join('')}`)
  l.push(`Freno: ${r.frenos.map(f => `${f.categoria} ${f.paso ? 'pasó con pedido' : 'bloqueó'} ×${f.n}`).join(' · ') || 'sin intervenciones'}`)
  l.push(`Canario: ${r.alertas_canario.length ? `${r.alertas_canario.length} corridas con regresión` : 'sin regresiones'}`)
  return l.join('\n')
}

if (process.argv[1] && /bitacora\.(ts|js)$/.test(process.argv[1])) {
  const [cmd, ...resto] = process.argv.slice(2)
  if (cmd === 'corregir') {
    const [id, ...nota] = resto
    if (!id || !nota.length) { console.error('uso: bitacora.ts corregir <id> "qué estuvo mal"'); process.exit(64) }
    escribir({ tipo: 'correccion', id, en: new Date().toISOString(), nota: nota.join(' ') } satisfies Correccion)
    console.log(`corrección anotada en ${id}`)
  } else {
    const dias = Number(resto[resto.indexOf('--dias') + 1]) || (cmd === 'hoy' ? 1 : 7)
    const r = resumir(dias, resto.includes('--todo'))
    console.log(resto.includes('--json') ? JSON.stringify(r, null, 2) : textoResumen(r))
  }
}
