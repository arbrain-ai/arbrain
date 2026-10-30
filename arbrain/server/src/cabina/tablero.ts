/**
 * Tablero de agentes por estado, con latido verificado (27 oct 2026, BRECHA §2.3 y §2.4).
 *
 * Hasta hoy el estado de un subagente era lo que Levy creía: el 26 oct cuatro agentes murieron con un compacto y se
 * siguieron reportando vivos. Aquí el estado sale de dos hechos medidos, nunca de lo que diga un modelo:
 *   · el proceso: ¿sigue vivo ESE pid con la marca de la envoltura? (`estaVivo`, sin-pantalla.ts)
 *   · la bitácora: ¿cuándo fue su última escritura? (mtime de `~/.config/arbrain/subagentes/<id>.jsonl`)
 *
 * Cinco columnas, las del agent view de Claude Code en palabras de dueño:
 *   trabajando · te espera · listo para revisar · falló · murió
 * «Murió» = su proceso terminó sin cerrar su turno, o sigue vivo pero lleva más del umbral sin escribir nada
 * (ARBRAIN_LATIDO_MS, 20 min por defecto: un comando largo en primer plano no escribe en la bitácora mientras corre).
 */
export type Columna = 'trabajando' | 'te-espera' | 'listo' | 'falló' | 'murió'
export const COLUMNAS: Columna[] = ['te-espera', 'trabajando', 'listo', 'falló', 'murió']

export interface Latido {
  /** ms epoch de la última escritura de su bitácora; null = no hay bitácora. */
  ultimaEscritura: number | null
  procesoVivo: boolean
  /** ms desde la última escritura; null sin bitácora. */
  edadMs: number | null
  umbralMs: number
}
export interface EstadoTablero {
  columna: Columna; motivo: string; latido: Latido
  /** El último paso en humano («Corriendo las pruebas», «Editando tablero.ts»), de su última herramienta. Sin llamar a un modelo. */
  paso?: string
  /** ms epoch en que empezó su turno actual: el tiempo transcurrido de la tarjeta. */
  desde?: number
}

export const UMBRAL_LATIDO_MS = (env: NodeJS.ProcessEnv = process.env) => Number(env.ARBRAIN_LATIDO_MS) || 20 * 60_000

/** Lo medido de un subagente sin pantalla, ya reducido a hechos. */
export interface Hechos {
  /** ¿Tiene al menos un turno en su bitácora? */
  hayTurno: boolean
  /** ¿Su último turno tiene la marca de salida de la envoltura? */
  cerroTurno: boolean
  procesoVivo: boolean
  ultimaEscritura: number | null
  /** ms epoch en que nació (registro), para «nunca arrancó». */
  creado: number
  error: string | null
  detenido: boolean
  /** Pregunta abierta: diálogo visto por el vigía o respuesta que cerró con «?». */
  pregunta: string | null
  entregaFallo: boolean
}

const minutos = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`

/** Regla pura: la columna y su motivo en palabras de dueño. */
export function estadoTablero(h: Hechos, ahora: number, umbralMs = UMBRAL_LATIDO_MS()): EstadoTablero {
  const edadMs = h.ultimaEscritura != null ? Math.max(0, ahora - h.ultimaEscritura) : null
  const latido: Latido = { ultimaEscritura: h.ultimaEscritura, procesoVivo: h.procesoVivo, edadMs, umbralMs }
  const es = (columna: Columna, motivo: string): EstadoTablero => ({ columna, motivo, latido })
  if (h.entregaFallo) return es('falló', 'El encargo nunca le llegó')
  if (!h.hayTurno) {
    if (h.procesoVivo) return es('trabajando', 'Arrancando')
    return ahora - h.creado > 3 * 60_000 ? es('murió', 'Nunca arrancó: no hay proceso ni bitácora') : es('trabajando', 'Arrancando')
  }
  if (!h.cerroTurno) {
    if (!h.procesoVivo) return es('murió', 'Se detuvo sin terminar su turno (se cerró o se cayó)')
    if (edadMs != null && edadMs > umbralMs) return es('murió', `Sigue el proceso pero no escribe nada hace ${minutos(edadMs)}`)
    if (h.pregunta) return es('te-espera', 'Detenido en una pregunta')
    return es('trabajando', 'Trabajando')
  }
  // El error manda sobre «detenido»: un turno cerrado con error no espera a nadie, aunque lo hayan detenido (28 oct).
  if (h.error) return es('falló', h.error)
  if (h.detenido) return es('te-espera', 'Detenido: un mensaje lo reanuda')
  if (h.pregunta) return es('te-espera', 'Terminó con una pregunta')
  return es('listo', 'Terminó su turno')
}

/** Comandos de Bash en palabras de dueño, en orden de prioridad: «cd x && npm run typecheck && npm test» = pruebas. */
const COMANDOS: [RegExp, string][] = [
  [/\b(vitest|jest|pytest|node --test)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/, 'Corriendo las pruebas'],
  [/\btypecheck\b|\btsc\b/, 'Revisando que el código compile'],
  [/\bgit\s+commit\b/, 'Guardando su avance en git'],
  [/\bgit\s+push\b/, 'Subiendo sus cambios'],
  [/\bgit\s+(merge|rebase|cherry-pick)\b/, 'Juntando ramas en git'],
  [/\bgit\b/, 'Revisando la historia en git'],
  [/\b(npm|pnpm|yarn)\s+(run\s+)?build\b|\bnext build\b/, 'Construyendo la app'],
  [/\b(npm|pnpm|yarn|bun)\s+(i|install|ci|add)\b/, 'Instalando dependencias'],
  [/playwright|screenshot|captur/i, 'Tomando capturas'],
  [/\bnext dev\b|\b(npm|pnpm)\s+run\s+dev\b/, 'Levantando la app para probarla'],
  [/\b(curl|wget)\b/, 'Consultando un servicio'],
  [/\b(sleep|wait)\b/, 'Esperando a que algo termine'],
  [/\b(grep|rg|find|ls)\b/, 'Buscando archivos'],
  [/\b(cat|sed|head|tail|less)\b/, 'Leyendo archivos'],
  [/\b(python3?|node|tsx)\b/, 'Corriendo un script'],
]
const base = (ruta?: string) => (ruta ?? '').split('/').filter(Boolean).at(-1) ?? ''

/** La última herramienta y lo que tocó, como una frase en español en gerundio. Pura: sin modelo, sin red. */
export function pasoEnHumano(herramienta: string, detalle?: string): string {
  const archivo = base(detalle)
  switch (herramienta) {
    case 'Bash': return COMANDOS.find(([re]) => re.test(detalle ?? ''))?.[1] ?? 'Corriendo un comando'
    case 'Read': return archivo ? `Leyendo ${archivo}` : 'Leyendo un archivo'
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return archivo ? `Editando ${archivo}` : 'Editando un archivo'
    case 'Write': return archivo ? `Escribiendo ${archivo}` : 'Escribiendo un archivo'
    case 'Grep': case 'Glob': return 'Buscando en el código'
    case 'WebFetch': return 'Leyendo una página web'
    case 'WebSearch': return 'Buscando en la web'
    case 'TodoWrite': return 'Ordenando sus pendientes'
    case 'Task': case 'Agent': return 'Pidiendo ayuda a otro agente'
  }
  const m = /^mcp__([^_]+)__(.+)$/.exec(herramienta)
  if (m) return m[1] === 'manos' ? 'Usando la computadora' : `Usando ${m[2].replace(/_/g, ' ')}`
  return `Usando ${herramienta}`
}
