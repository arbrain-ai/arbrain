/**
 * Lo que muestra el diálogo de confirmación humana (I8; CONTRATO-DAEMON.md v3 §6). Puro: lo usan el diálogo y las
 * pruebas (`tests/edicion/confirmacion-v3.test.ts`).
 *
 * v3 (red team C1/C2): el diálogo enseña el LITERAL que de verdad se ejecuta (comando Bash completo, ruta + contenido o
 * la acción de manos en JSON), tal cual lo calculó el daemon; los `avisos` del daemon como etiquetas; y de dónde
 * salió (`creadaPor` + `origen`). El `resumen` es solo el título. Nada de esto lo escribe el modelo.
 */

export type CategoriaConfirmacion = 'enviar' | 'pagar' | 'borrar' | 'publicar' | 'otra'

export interface Confirmacion {
  id: string
  estado: 'pendiente' | 'permitida' | 'rechazada' | 'vencida' | 'usada'
  categoria: CategoriaConfirmacion
  origen: 'agente' | 'manos' | 'cron'
  resumen: string
  detalle?: string
  herramienta?: string
  /** v3: lo que de verdad corre, hasta 4000 caracteres. */
  literal?: string
  /** v3: señales del daemon («decodifica texto: puede esconder lo que de verdad hace», «corre fuera del sandbox»…). */
  avisos?: string[]
  /** v3: 'guardia' = la interceptó el daemon; 'peticion' = la pidió un proceso con el pase (manos). */
  creadaPor?: 'guardia' | 'peticion'
  creada: number
  expira: number
  resuelta?: number
}

/** Pendientes vigentes, la más vieja primero. */
export function ordenarPendientes(lista: Confirmacion[], ahora = Date.now()): Confirmacion[] {
  return lista.filter(c => c.estado === 'pendiente' && c.expira > ahora).sort((a, b) => a.creada - b.creada)
}

export interface EtiquetaOrigen {
  /** Frase corta para la línea bajo el título («Levy, en tu chat, quiere publicar»). */
  quien: string
  /** Etiquetas visibles: «Pedida por Levy», «Manos», «Rutina». */
  marcas: string[]
  /** true si el daemon no dijo cómo nació (daemon v2): se avisa en vez de suponer. */
  sinVerificar: boolean
}

/**
 * De dónde salió la confirmación. Regla v3 (pedido M2): nunca traducir `origen: 'cron'` a un texto inocente salvo que
 * la haya interceptado la guardia; lo que pidió un proceso con el pase se marca «Pedida por Levy».
 */
export function etiquetaOrigen(c: Pick<Confirmacion, 'origen' | 'creadaPor'>): EtiquetaOrigen {
  if (c.creadaPor === 'peticion') {
    const marcas = ['Pedida por Levy']
    if (c.origen === 'manos') marcas.push('Manos')
    return { quien: c.origen === 'manos' ? 'Levy, usando tu computadora,' : 'Levy', marcas, sinVerificar: false }
  }
  if (c.creadaPor === 'guardia') {
    if (c.origen === 'cron') return { quien: 'Una rutina tuya programada', marcas: ['Rutina'], sinVerificar: false }
    if (c.origen === 'manos') return { quien: 'Levy, usando tu computadora,', marcas: ['Manos'], sinVerificar: false }
    return { quien: 'Levy', marcas: [], sinVerificar: false }
  }
  return { quien: 'Un agente', marcas: ['Origen sin verificar'], sinVerificar: true }
}

/** Límite del daemon para el literal (contrato v3 §6). Un literal de ese tamaño pudo llegar recortado. */
export const LIMITE_LITERAL = 4000

/**
 * Caracteres que no se ven en pantalla pero cambian lo que corre: controles C0/C1 (salvo salto de línea y tabulador),
 * marcas de dirección bidi (pueden invertir el orden visible de un comando, «Trojan Source»), espacios de ancho cero,
 * el guion suave y el BOM.
 */
// eslint-disable-next-line no-control-regex
const INVISIBLES = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g

/**
 * El literal tal cual, con lo invisible hecho visible (`⟨U+202E⟩`). No recorta ni reinterpreta nada más: cada
 * carácter visible queda igual y en su lugar.
 */
export function literalVisible(literal: string): { texto: string; invisibles: number } {
  let invisibles = 0
  const texto = literal.replace(INVISIBLES, ch => {
    invisibles++
    return `⟨U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟩`
  })
  return { texto, invisibles }
}

/** Avisos para pintar: los del daemon (sin duplicados ni vacíos) más los que detecta la web sobre el literal. */
export function avisosDe(c: Pick<Confirmacion, 'avisos' | 'literal'>): string[] {
  const lista = (Array.isArray(c.avisos) ? c.avisos : []).map(a => String(a).trim()).filter(Boolean)
  if (c.literal) {
    if (literalVisible(c.literal).invisibles > 0) lista.push('tiene caracteres invisibles (marcados como ⟨U+…⟩)')
    if (c.literal.length >= LIMITE_LITERAL) lista.push('el texto llegó recortado: lo que corre puede ser más largo')
  } else {
    lista.push('el servidor no mandó el comando literal')
  }
  return [...new Set(lista)]
}

/** ¿El evento es un clic humano real? (ni el teclado —detail 0— ni un `click()` sintético —isTrusted false—). */
export function esClicHumano(e: { detail: number; isTrusted: boolean }): boolean {
  return e.isTrusted === true && e.detail > 0
}

// ---------- Sandbox del Bash de los agentes (contrato v3 §6.1) ----------

export interface EstadoSandbox {
  /** true = el Bash de solo lectura corre en sandbox sin preguntar; false = TODO comando de terminal pide su clic. */
  disponible: boolean
  sistema: 'macos' | 'windows' | 'linux' | 'otro'
  /** Linux: faltan `bwrap` o `socat`. */
  faltan?: string[]
}

/** Texto para la persona cuando no hay sandbox (Windows, Linux sin bubblewrap/socat, sandbox apagado). */
export function avisoSinSandbox(s: EstadoSandbox): string {
  const donde = s.sistema === 'windows'
    ? 'En Windows no hay sandbox para la terminal'
    : s.sistema === 'linux'
      ? `En este Linux no hay sandbox para la terminal${s.faltan?.length ? ` (falta ${s.faltan.join(' y ')}: sudo apt install bubblewrap socat)` : ''}`
      : 'En este equipo el sandbox de la terminal está apagado'
  return `${donde}: cada comando que Levy quiera correr, incluso solo para leer, te pedirá un clic. Lee el comando antes de permitirlo.`
}
