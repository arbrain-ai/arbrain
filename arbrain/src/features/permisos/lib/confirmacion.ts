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
  /**
   * `corriendo`/`corrida`: solo «Córrelo tú» (botón Play, 27 oct 2026). `en_cola` (ronda 2): nadie la espera; Levy siguió
   * con lo demás y, cuando la persona decide, el daemon se lo dice en su conversación. Nunca se ejecuta sola.
   */
  estado: 'pendiente' | 'en_cola' | 'permitida' | 'rechazada' | 'vencida' | 'usada' | 'corriendo' | 'corrida'
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
  /** Botón Play: `permiso` = Una vez · Siempre este patrón · No; `manos` = «Córrelo tú». Daemon viejo: sin campo. */
  tipo?: 'permiso' | 'manos'
  /** Qué hará, en palabras de todos los días (la calcula el daemon). */
  frase?: string
  /** Lo que guardaría «Siempre este patrón». Sin campo: no se ofrece (el freno nunca). */
  patron?: string
  comentario?: string
  alcance?: 'una' | 'siempre'
  /** «Córrelo tú»: terminal del motor donde corre y, al terminar, su salida. */
  terminal?: number
  salida?: string
  codigo?: number
  sesion?: string
  /** Conversación de la app que la pidió: su cola se pinta en ese hilo. */
  conversacion?: string
  /** Desde cuándo está en la cola. */
  enColaDesde?: number
  /** «Siempre este patrón» dicho en humano (el patrón literal va en el detalle). */
  patronFrase?: string
  /** Acciones del freno: el botón del sí dice la consecuencia («Borrar 14 archivos»). */
  botonSi?: string
}

/** Pendientes que la persona tiene que ver: las que esperan su clic, las de su cola y las de «Córrelo tú» corriendo. */
export function vivasParaLaPersona(lista: Confirmacion[], ahora = Date.now()): Confirmacion[] {
  return lista.filter(c => (c.estado === 'pendiente' || c.estado === 'en_cola' || c.estado === 'corriendo') && c.expira > ahora).sort((a, b) => a.creada - b.creada)
}

/**
 * La cola de aprobaciones (ronda 2): lo que nadie está esperando. Con `conversacion`, solo la de ese hilo. Incluye las
 * «Córrelo tú» que la persona echó a correr desde la cola (su terminal se ve ahí mismo).
 */
export function enLaCola(lista: Confirmacion[], conversacion?: string | null): Confirmacion[] {
  return lista.filter(c => (c.estado === 'en_cola' || (c.estado === 'corriendo' && !!c.enColaDesde)) && (conversacion === undefined || c.conversacion === conversacion))
}

/** «Desde las 10:42» (hoy) o «desde ayer a las 18:05» / «desde el 24 oct»: explícito, nunca un «9 min» suelto. */
export function desdeCuando(t: number, ahora = Date.now()): string {
  const d = new Date(t), hoy = new Date(ahora)
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mismoDia(d, hoy)) return `desde las ${hora}`
  const ayer = new Date(ahora - 86_400_000)
  if (mismoDia(d, ayer)) return `desde ayer a las ${hora}`
  return `desde el ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')}`
}

/**
 * «Córrelo tú» terminó (ronda 3): lo que pasó en una frase, para el estado «Listo» de la tarjeta. Usa el código de salida
 * y la última línea útil de la salida (sin códigos de color, sin líneas de contraseña). Nunca inventa: sin código, lo dice.
 */
export function ultimaLineaUtil(salida?: string): string | null {
  if (!salida) return null
  const limpia = salida.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '')
  const lineas = limpia.split('\n').map(l => l.trim()).filter(l => l && !/password|contraseña|^\[…\]$/i.test(l))
  const u = lineas.at(-1)
  if (!u) return null
  return u.length > 90 ? `${u.slice(0, 89)}…` : u
}

export function resumenCorrida(c: Pick<Confirmacion, 'codigo' | 'salida'>): { ok: boolean | null; titulo: string; frase: string } {
  const u = ultimaLineaUtil(c.salida)
  if (c.codigo === 0) return { ok: true, titulo: 'Listo: terminó bien', frase: u ? `La última línea dice «${u}». Levy ya lo sabe y sigue.` : 'Levy ya lo sabe y sigue.' }
  if (typeof c.codigo === 'number') return { ok: false, titulo: 'Terminó con un error', frase: `${u ? `La última línea dice «${u}». ` : ''}Levy ya vio lo que salió y te dice qué sigue.` }
  return { ok: null, titulo: 'Terminó', frase: 'Se lo pasé a Levy con lo que salió en la terminal.' }
}

/** ¿Va en el hilo del chat? Lo que pidió Levy en la conversación (no rutinas ni manos de computer use). */
export const vaEnElHilo = (c: Pick<Confirmacion, 'origen' | 'creadaPor'>) => c.origen === 'agente' && c.creadaPor !== 'peticion'

/** Cuerpo para resolver desde la tarjeta. El comentario es opcional y se recorta igual que en el daemon. */
export function cuerpoDecision(id: string, decision: 'permitir' | 'rechazar' | 'correr', op: { alcance?: 'una' | 'siempre'; comentario?: string } = {}) {
  const comentario = (op.comentario ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  return { id, decision, ...(decision === 'permitir' ? { alcance: op.alcance === 'siempre' ? 'siempre' : 'una' } : {}), ...(comentario ? { comentario } : {}) }
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

/**
 * «Córrelo tú» con contraseña (ronda 4): una frase cálida, antes de la terminal, de qué va a pasar y por qué se pide
 * la contraseña. `equipo` es «Tu Mac» o «Tu computadora» (lo decide quien pinta, según el navegador).
 *   sudo installer … + «Con tu contraseña de administrador: instalar el controlador de la impresora (DymoConnect.pkg)»
 *   → «Tu Mac pide tu contraseña para instalar el controlador de la impresora. Escríbela en el recuadro negro de abajo y
 *     presiona Enter; Levy no la ve.»
 * Iniciar sesión (`gh auth login`…): «Este programa te pide iniciar sesión…». Sin literal: null.
 */
export function fraseManos(c: Pick<Confirmacion, 'literal' | 'frase' | 'resumen'>, equipo = 'Tu computadora'): string | null {
  const lit = (c.literal ?? '').trim()
  if (!lit) return null
  if (/^(?:\S+=\S+\s+)*sudo\b/.test(lit)) {
    const accion = (c.frase ?? '')
      .replace(/^con tu contraseña(?: de administrador)?\s*[:,]?\s*/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/[.\s]+$/, '')
      .trim()
    const para = accion ? ` para ${accion.replace(/^./, ch => ch.toLocaleLowerCase('es-MX'))}` : ''
    return `${equipo} pide tu contraseña${para}. Escríbela en el recuadro negro de abajo y presiona Enter; Levy no la ve.`
  }
  return 'Este programa te pide iniciar sesión. Escribe lo que te pida en el recuadro negro de abajo y presiona Enter; Levy no lo ve.'
}

/** El literal en piezas que no se parten a media palabra: cada argumento es una pieza; los espacios, donde se corta. */
export function piezasLiteral(texto: string): string[] {
  return texto.split(/(\s+)/).filter(p => p.length > 0)
}
