/**
 * Business Intelligence · datos SIMULADOS (7 nov 2026). Solo para capturas, video y pruebas: las cifras reales nunca se suben
 * a git. Deterministas (semilla por consulta, sin Math.random ni reloj): la misma fecha da los mismos números. El panel los
 * marca siempre como «datos simulados». Dos escenarios: `calma` (todo en su corredor) y `alarma` (ayer las visitas se
 * desplomaron y arrastraron los clics: una señal de dolor con su eco).
 */
import { consultaDe, type Ventana } from './catalogo'
import { HISTORIA, sumarDias, type Barra, type Datos, type Punto } from './modelo'

export type Escenario = 'calma' | 'alarma'

/** mulberry32: un generador chico y determinista. */
function semilla(texto: string) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const diaSemana = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay()

/** Una serie diaria con ritmo semanal, tendencia suave y ruido; termina en `hasta`. */
function serie(id: string, hasta: string, dias: number, base: number, o: { ruido?: number; semana?: number; tendencia?: number; entero?: boolean; piso?: number } = {}): Punto[] {
  const r = semilla(id)
  const out: Punto[] = []
  for (let k = dias - 1; k >= 0; k--) {
    const f = sumarDias(hasta, -k)
    const dow = diaSemana(f)
    const semana = 1 + (o.semana ?? 0.18) * (dow === 0 || dow === 6 ? -1 : dow === 2 || dow === 3 ? 0.6 : 0.2)
    const t = 1 + (o.tendencia ?? 0) * ((dias - k) / dias)
    const ruido = 1 + (o.ruido ?? 0.12) * ((r() + r() + r()) / 1.5 - 1)
    let v = Math.max(o.piso ?? 0, base * semana * t * ruido)
    v = o.entero === false ? Math.round(v * 100) / 100 : Math.round(v)
    out.push({ fecha: f, valor: v })
  }
  return out
}

const TITULOS = [
  'Cómo construí mi cerebro artificial', 'Claude Code de cero a experto', 'Cinco automatizaciones que se pagan solas',
  'El agente que contesta mis correos', 'Mi stack de IA en 2026', 'Vender sin llamadas con un VSL', 'Qué es un harness y por qué importa',
]
const PAISES = ['México', 'Colombia', 'Argentina', 'España', 'Perú', 'Chile', 'Estados Unidos', 'Ecuador']

/** `hasta` = el último día cerrado (ayer en Ciudad de México). */
export function datosSimulados(id: string, ventana: Ventana, hasta: string, escenario: Escenario = 'calma'): Datos | null {
  const c = consultaDe(id)
  if (!c) return null
  const dias = ventana + HISTORIA
  const r = semilla(`${id}:${ventana}`)
  const golpe = (p: Punto[], factor: number) => { const u = p[p.length - 1]; if (u.valor !== null) u.valor = Math.round(u.valor * factor) }
  switch (id) {
    case 'visitas': { const p = serie('visitas', hasta, dias, 420, { tendencia: 0.08 }); if (escenario === 'alarma') golpe(p, 0.38); return { forma: 'serie', puntos: p } }
    case 'clics': { const p = serie('clics', hasta, dias, 96, { tendencia: 0.06 }); if (escenario === 'alarma') golpe(p, 0.46); return { forma: 'serie', puntos: p } }
    case 'altas': { const p = serie('altas', hasta, dias, 6.4, { ruido: 0.35, semana: 0.1 }); if (escenario === 'alarma') golpe(p, 0); return { forma: 'serie', puntos: p } }
    case 'bajas': return { forma: 'serie', puntos: serie('bajas', hasta, dias, 2.6, { ruido: 0.45, semana: 0.05 }) }
    case 'suscriptores': {
      const p: Punto[] = []; let v = 1180
      for (const x of serie('suscriptores', hasta, dias, 4, { ruido: 0.6 })) { v += Math.round(((x.valor ?? 0) - 2.6) * 0.9); p.push({ fecha: x.fecha, valor: v }) }
      return { forma: 'serie', puntos: p }
    }
    case 'mrr': {
      const p: Punto[] = []; let v = 8400
      for (const x of serie('mrr', hasta, dias, 40, { ruido: 0.8 })) { v += Math.round(((x.valor ?? 0) - 34) * 1.4); p.push({ fecha: x.fecha, valor: v }) }
      return { forma: 'serie', puntos: p }
    }
    case 'vistas-canal': { const p = serie('vistas-canal', hasta, dias, 1050, { tendencia: -0.04 }); if (escenario === 'alarma') golpe(p, 0.42); return { forma: 'serie', puntos: p } }
    case 'altas-netas': return { forma: 'serie', puntos: serie('altas-netas', hasta, dias, 4, { ruido: 0.9, semana: 0.1 }).map(x => ({ ...x, valor: (x.valor ?? 0) - 3 })) }
    case 'clics-por-video': {
      const escala = ventana / 30
      const barras: Barra[] = TITULOS.map((t, i) => ({ id: `video-${i + 1}`, etiqueta: t, valor: Math.max(0, Math.round((70 / (i + 1.2)) * escala * (0.8 + r() * 0.4))) }))
      return { forma: 'barras', barras, resto: { id: 'sin-video', etiqueta: 'Enlaces sin video identificado', valor: Math.round(6 * escala) } }
    }
    case 'comunidad': return { forma: 'serie', puntos: serie('comunidad', hasta, dias, 138, { tendencia: 0.05 }) }
    case 'lecciones': return { forma: 'serie', puntos: serie('lecciones', hasta, dias, 64, { ruido: 0.25 }) }
    case 'cobrado': {
      // Del 1 del mes anterior a `hasta`: renovaciones diarias y algunas anuales que entran de golpe.
      const inicio = `${sumarDias(`${hasta.slice(0, 7)}-01`, -1).slice(0, 7)}-01`
      const p: Punto[] = []
      for (let f = inicio; f <= hasta; f = sumarDias(f, 1)) {
        const base = 200 + r() * 140 + (r() < 0.12 ? 600 + r() * 900 : 0)
        p.push({ fecha: f, valor: Math.round(base) })
      }
      return { forma: 'serie', puntos: p }
    }
    case 'ventas-por-video': {
      const escala = ventana / 30
      const barras: Barra[] = TITULOS.map((t, i) => ({ id: `video-${i + 1}`, etiqueta: t, valor: Math.max(0, Math.round((34 / (i + 1.3)) * escala * (0.8 + r() * 0.4))) }))
      const atribuidos = barras.reduce((s, b) => s + b.valor, 0)
      return { forma: 'barras', barras, resto: { id: 'sin-video', etiqueta: 'Sin video (sin enlace rastreado)', valor: Math.round(atribuidos * 0.58) } }
    }
    case 'embudo-web': {
      const e = ventana / 30
      const v = [11800, 2950, 1310, 1020, 205, 171].map(x => Math.round(x * e * (0.95 + r() * 0.1)))
      const etiquetas = ['Vieron la página', 'Tocaron comprar', 'Abrieron el pago', 'Eligieron plan', 'Se registraron', 'Terminaron el onboarding']
      return { forma: 'embudo', pasos: v.map((valor, i) => ({ id: `paso-${i + 1}`, etiqueta: etiquetas[i], valor })) }
    }
    case 'dispositivo': {
      const t = 420 * ventana
      return { forma: 'barras', barras: [{ id: 'mobile', etiqueta: 'Teléfono', valor: Math.round(t * 0.68) }, { id: 'desktop', etiqueta: 'Computadora', valor: Math.round(t * 0.29) }, { id: 'tablet', etiqueta: 'Tableta', valor: Math.round(t * 0.03) }] }
    }
    case 'origen': {
      const t = 420 * ventana
      return { forma: 'barras', barras: [{ id: 'youtube', etiqueta: 'YouTube', valor: Math.round(t * 0.61) }, { id: 'directo', etiqueta: 'Directo', valor: Math.round(t * 0.39) }] }
    }
    case 'paises': {
      const t = 380 * ventana
      const pesos = [0.38, 0.14, 0.11, 0.09, 0.08, 0.06, 0.05, 0.04]
      return { forma: 'barras', barras: PAISES.map((p, i) => ({ id: p, etiqueta: p, valor: Math.round(t * pesos[i] * (0.9 + r() * 0.2)) })) }
    }
  }
  return null
}
