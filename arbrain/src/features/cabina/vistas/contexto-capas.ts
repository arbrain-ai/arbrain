/**
 * Memoria y contexto (4 oct 2026): las formas que manda el agent-server y la cuenta de la barra de la ventana.
 * Puro (sin React) para probarlo. Regla: cada número dice de dónde sale. «medido» = usage del proveedor;
 * «contado» = conteo de tokens del SDK (getContextUsage / `/context`); «por diferencia» = medido menos contado;
 * «estimado» = caracteres × la razón tokens/carácter que el SDK midió en CLAUDE.md.
 */

export type Capa = 'esencia' | 'indice' | 'user' | 'feedback' | 'project' | 'reference'
export interface ArchivoMemoria {
  ruta: string; capa: Capa; titulo: string; bytes: number; fecha: string | null
  descripcion: string | null; indice: 'indice' | 'user' | 'archivo' | null; triggers: string[]; oculto: boolean
}
export interface FotoMemoria { archivos: ArchivoMemoria[]; raiz: string; leidoEn: string }

export interface UsoLlamada { input: number; cacheCreacion: number; cacheLectura: number; salida: number }
export interface Llamada { en: string; uso: UsoLlamada; total: number }
export interface Desglose {
  modelo: string; total: number; ventana: number
  categorias: { nombre: string; tokens: number; tipo: 'used' | 'free' | 'buffer' | 'deferred' }[]
  memoria: { ruta: string; tokens: number }[]
  skills: { nombre: string; origen: string; tokens: number }[]
  mcp: { servidor: string; herramientas: number; tokens: number }[]
  secciones?: { nombre: string; tokens: number }[]
  herramientasSistema?: { nombre: string; tokens: number }[]
  mensajes?: { llamadas: number; resultados: number; adjuntos: number; asistente: number; usuario: number; sinAtribuir: number; adjuntosPorTipo: { nombre: string; tokens: number }[] }
}
export interface Anatomia {
  conversacion: {
    id: string; cuenta: string; sesion: string | null; transcript: boolean
    primera: Llamada | null; ultima: Llamada | null
    ultimoTurno: { en: string; caracteres: number; llamadas: number; primera: Llamada | null } | null
    primerMensaje: { caracteres: number; inyeccion: number } | null
    llamadas: number; turnos: number
    compactaciones: { en: string; antes: number | null; despues: number | null; disparo: string | null }[]
    inyeccion: { en: string; evento: string; texto: string; caracteres: number; partes: { nombre: string; caracteres: number }[] } | null
    modelo: string | null
  } | null
  desglose: { fuente: 'turno' | 'sonda'; en: string; datos: Desglose } | null
  ventana: { tokens: number | null; modelo: string | null; fuente: string }
  archivos: { ruta: string; caracteres: number }[]
  ganchos: { evento: string; comando: string }[]
  tokensPorCaracter: number | null
}

export type Fuente = 'medido' | 'contado' | 'por diferencia' | 'estimado'
export interface Segmento { id: 'proveedor' | 'memoria' | 'skills' | 'mcp' | 'historial' | 'reserva' | 'libre'; nombre: string; tokens: number; fuente: Fuente; nota: string }

export const CAPAS_MEMORIA: { id: Capa; nombre: string; nota: string }[] = [
  { id: 'user', nombre: 'Identidad', nota: 'quién eres, cómo trabajas, tu historia' },
  { id: 'feedback', nombre: 'Correcciones', nota: 'lo que me corregiste y por qué' },
  { id: 'project', nombre: 'Proyectos', nota: 'decisiones y estado de iniciativas, con fecha' },
  { id: 'reference', nombre: 'Referencias', nota: 'dónde vive cada cosa fuera de aquí' },
  { id: 'indice', nombre: 'Índices', nota: 'el mapa que usa el recall' },
  { id: 'esencia', nombre: 'Esencia', nota: 'entra en TODA conversación' },
]

/** Razón tokens/carácter cuando el SDK aún no la midió: la de CLAUDE.md medida el 4 oct 2026 (3,995 / 9,049). */
const RAZON_RESPALDO = 0.44
const cat = (d: Desglose | undefined, nombre: string) => d?.categorias.find(c => c.nombre === nombre)?.tokens ?? 0

/** Estima tokens de un texto que nadie contó. Siempre se pinta como «estimado». */
export const estimar = (caracteres: number, razon: number | null) => Math.round(caracteres * (razon ?? RAZON_RESPALDO))

/** Las capas apiladas de la barra. Suman exactamente la ventana cuando la ventana se conoce. */
export function capas(a: Anatomia): { ventana: number | null; usado: number; fuenteUsado: Fuente; segmentos: Segmento[] } {
  const d = a.desglose?.datos
  const memoria = d?.memoria.length ? d.memoria.reduce((n, m) => n + m.tokens, 0) : cat(d, 'Memory files')
  const skills = cat(d, 'Skills')
  const mcp = cat(d, 'MCP tools') + cat(d, 'MCP server instructions')
  const agentes = cat(d, 'Custom agents')
  const contadas = memoria + skills + mcp + agentes
  const c = a.conversacion
  const primerMensaje = c?.primerMensaje ? estimar(c.primerMensaje.caracteres + c.primerMensaje.inyeccion, a.tokensPorCaracter) : 0
  const proveedor = c?.primera
    ? { tokens: Math.max(0, c.primera.total - contadas - primerMensaje), fuente: 'por diferencia' as const, nota: 'primera llamada medida menos lo contado (memoria, skills, herramientas) y tu primer mensaje' }
    : { tokens: cat(d, 'System prompt') + cat(d, 'System tools'), fuente: 'contado' as const, nota: 'según /context del SDK (sin conversación medida)' }
  const usado = c?.ultima?.total ?? (d ? d.categorias.filter(x => x.tipo === 'used').reduce((n, x) => n + x.tokens, 0) : 0)
  const fuenteUsado: Fuente = c?.ultima ? 'medido' : 'contado'
  const historial = Math.max(0, usado - proveedor.tokens - contadas)
  const ventana = a.ventana.tokens
  const reserva = ventana ? Math.min(cat(d, 'Autocompact buffer'), Math.max(0, ventana - usado)) : 0
  const segmentos: Segmento[] = [
    { id: 'proveedor', nombre: 'Proveedor · system prompt y herramientas', tokens: proveedor.tokens, fuente: proveedor.fuente, nota: proveedor.nota },
    { id: 'memoria', nombre: 'CLAUDE.md + esencia + agenda', tokens: memoria, fuente: 'contado', nota: 'los archivos que se importan siempre' },
    { id: 'skills', nombre: 'Descripciones de skills', tokens: skills + agentes, fuente: 'contado', nota: 'solo nombre y descripción; el cuerpo se lee a demanda' },
    { id: 'mcp', nombre: 'Herramientas MCP cargadas', tokens: mcp, fuente: 'contado', nota: 'esquemas e instrucciones de los servidores MCP' },
    { id: 'historial', nombre: 'Esta conversación', tokens: historial, fuente: c?.ultima ? 'por diferencia' : 'contado', nota: 'tus mensajes, mis respuestas, herramientas y lo inyectado en cada turno' },
  ]
  if (ventana) {
    segmentos.push({ id: 'reserva', nombre: 'Reserva de compactación', tokens: reserva, fuente: 'contado', nota: 'al llegar aquí el SDK resume la conversación' })
    segmentos.push({ id: 'libre', nombre: 'Libre', tokens: Math.max(0, ventana - usado - reserva), fuente: 'por diferencia', nota: 'ventana menos lo usado y la reserva' })
  }
  return { ventana, usado, fuenteUsado, segmentos }
}

/** Herramientas que existen pero NO entran a la ventana hasta que Levy las busca (ToolSearch). */
export const diferidas = (a: Anatomia) => (a.desglose?.datos.categorias ?? []).filter(c => c.tipo === 'deferred').reduce((n, c) => n + c.tokens, 0)

/** Filtro del navegador de memoria: busca en título, ruta, frase del índice y triggers, sin acentos. */
export const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function filtrar(archivos: ArchivoMemoria[], q: string, capa: Capa | 'todo'): ArchivoMemoria[] {
  const t = sinAcentos(q.trim())
  return archivos.filter(f => (capa === 'todo' || f.capa === capa) && (!t || sinAcentos(`${f.titulo} ${f.ruta} ${f.descripcion ?? ''} ${f.triggers.join(' ')}`).includes(t)))
}

/** 350699 → «350.7K»; 1000000 → «1M». */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}K`
  return String(n)
}
export const pct = (n: number, de: number | null) => (de ? (n / de) * 100 : 0)
export const fmtPct = (n: number, de: number | null) => {
  const p = pct(n, de)
  return !de ? '—' : p > 0 && p < 0.1 ? '<0.1 %' : `${p.toFixed(p < 10 ? 1 : 0)} %`
}
