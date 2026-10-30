/**
 * `encargar`: el pedido completo de Daniel en una sola llamada MCP (nodo E, 3 oct 2026).
 *
 * Por qué existe (docs/builds/manos-noche-2026-10-02/C-velocidad.md, «Lo que quedó mal»): Levy manejando `manos`
 * turno por turno desde el chat tardaba minutos («guardados de X» unos 2 min y sin éxito al primer intento); el
 * cerebro hace lo mismo en 15–25 s porque no paga una vuelta del chat por cada clic. `encargar` le pasa el pedido
 * entero al cerebro (`cerebro.ts → pedir`): receta sin modelo → Jev → Sonnet → Opus, insistencia en código, web por
 * la extensión con URL directa y precalentado.
 *
 * Freno: la autoridad es SOLO `cita` (las palabras textuales de Daniel). El `pedido` puede redactarlo Levy; nada de
 * lo que él escriba ahí confirma un envío, un borrado, un pago o una publicación, ni enciende «quiero verte» o
 * «ponme». «Quiero verte» trae la ventana al frente con el Halo; nunca mueve el cursor de Daniel (regla del 3 oct). Si algo irreversible no tiene la cita, el encargo vuelve con `estado: requiere_confirmacion` y la
 * pregunta para Daniel.
 *
 * Avance: cada paso sale como `notifications/progress` (si el cliente mandó `progressToken`) y en
 * `~/.config/arbrain/manos/encargos/<id>.json` (o `MANOS_ENCARGOS_DIR`) para que la UI de Arbrain lo pinte.
 * El avance no lleva texto de las apps: solo herramienta, acción, rol/etiqueta de control y resultado. El estado
 * final en disco (0600, local) sí incluye el resultado y la pregunta que redactó el cerebro, igual que la respuesta.
 */
import { DUENO, DUENO_M, ejemploPerfilChrome } from '../dueno.js'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Adaptador, Decisor } from './contrato.js'
import type { OpcionesPedir, Progreso, ResultadoPedido } from './cerebro.js'
import { DIR_ARBRAIN, esEdicionCliente } from '../edicion.js'
import { citaReal, MENSAJE_CITA_FALSA } from './politica.js'

export const DIR_ENCARGOS = () => process.env.MANOS_ENCARGOS_DIR || join(DIR_ARBRAIN(), 'manos', 'encargos')

/** Presupuesto por defecto: cubre Sonnet + reintento + Opus en tareas de varios pasos (medido: 8–31 s típico). */
export const TOPE_POR_DEFECTO_S = 180

export const ENCARGAR_TOOL = {
  name: 'encargar',
  description: `PRIMERA OPCIÓN para cualquier tarea de varios pasos en la Mac o en la web («abre el 6.º guardado de X», «escríbele a Lucía en WhatsApp…», «12 × 3 en la Calculadora», «¿el Dock se oculta solo?»). Resuelve el pedido COMPLETO de punta a punta con el cerebro de las manos (receta guardada sin modelo → Jev → Sonnet 5.5 → Opus 5.5, insistencia, web por la extensión con URL directa, precalentado), todo en segundo plano, y devuelve: estado, resultado verificado con su evidencia, resumen corto de pasos, tiempo y URL final o captura. Tarda segundos, no minutos: no lo partas en pasos tú. FRENO: \`cita\` = las palabras TEXTUALES de ${DUENO}; solo ellas autorizan enviar, borrar, pagar o publicar, y «quiero verte / muéstrame» (la ventana al frente con el Halo, tu cursor). El ratón de ${DUENO} no se toca: el encargo nunca usa su cursor real. Si algo irreversible no tiene su cita, vuelve con estado requiere_confirmacion y \`pregunta\`: pregúntale a ${DUENO} y repite el encargo con su respuesta textual en \`cita\`. Las herramientas finas (observar, actuar, web_*) quedan para un paso suelto o para depurar un encargo que falló.`,
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['pedido', 'cita'],
    properties: {
      pedido: { type: 'string', description: 'Qué hay que lograr, en lenguaje natural y con todo lo que haga falta (app, contacto, texto entre «», qué cuenta como hecho). Puede ser tu redacción.' },
      cita: { type: 'string', description: `Las palabras TEXTUALES de ${DUENO} que originan el encargo (copiadas, sin parafrasear). Es lo único que vale como confirmación del freno y para «ponme / muéstrame / quiero verte».` },
      captura: { type: 'boolean', description: 'Captura PNG del resultado (ventana o pestaña propia, sin traerla al frente). Por defecto true.' },
      perfil: { type: 'string', description: `Solo si hay varios Chrome conectados: parte del correo del perfil donde trabajar la web (p. ej. ${ejemploPerfilChrome()}). Sin él: el perfil personal de ${DUENO}, salvo que el pedido nombre la cuenta de trabajo.` },
      tope_s: { type: 'integer', minimum: 10, maximum: 600, description: `Tope del encargo completo en segundos (por defecto ${TOPE_POR_DEFECTO_S}).` },
    },
  },
} as const

export interface DepsEncargar {
  manos: Adaptador
  decisor: () => Decisor
  /** El cerebro (inyectable en pruebas). */
  pedir?: (pedido: string, op: OpcionesPedir) => Promise<ResultadoPedido>
  /** Avance en vivo hacia el cliente MCP. */
  progreso?: (p: Progreso & { encargo: string }) => void
  /** Quién llama (clientInfo del MCP), para la bitácora. */
  quien?: string
  /** Se aborta si Daniel detiene el turno (MCP `notifications/cancelled`). */
  senal?: AbortSignal
}

export interface RespuestaEncargo {
  encargo: string
  estado: ResultadoPedido['estado']
  ok: boolean
  resultado: string
  evidencia?: string
  /** Solo si hay que volver con Daniel (freno o aclaración). */
  pregunta?: string
  pasos: string[]
  tiempo_s: number
  url_final?: string
  titulo_final?: string
  captura?: string
  ruta?: ResultadoPedido['ruta']
  modelos: string[]
  escalado?: ResultadoPedido['escalado']
  aprendida?: string
  bitacora_id: string
  costo_usd?: number
}

/** Estado del encargo en disco para la UI (se reescribe entero en cada avance; escritura atómica). */
function guardarEstado(id: string, datos: Record<string, unknown>): void {
  try {
    const dir = DIR_ENCARGOS()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const ruta = join(dir, `${id}.json`)
    writeFileSync(`${ruta}.tmp`, JSON.stringify({ id, actualizado: new Date().toISOString(), ...datos }, null, 2), { mode: 0o600 })
    renameSync(`${ruta}.tmp`, ruta)
  } catch { /* el avance en disco nunca tumba el encargo */ }
}

export function preguntaPara(r: Pick<ResultadoPedido, 'estado' | 'detalle'>): string | undefined {
  if (r.estado === 'requiere_confirmacion') return `El freno detuvo el encargo antes de algo irreversible: ${(r.detalle ?? '(sin detalle)').replace(/[.\s]+$/, '')}. Pregúntale a ${DUENO} si lo autoriza; si dice que sí, repite encargar con su respuesta TEXTUAL en cita.`
  if (r.estado === 'aclaracion') return r.detalle ?? `El encargo necesita una aclaración de ${DUENO}.`
  return undefined
}

/**
 * Al terminar, fallar o detenerse un encargo, las manos sueltan sus ventanas y el Halo se apaga YA (falla del 6 oct,
 * 19:43: Daniel detuvo un encargo y el Halo se quedó encima; el servidor MCP es persistente y nunca se desconectaba).
 */
export async function ejecutarEncargar(args: any, deps: DepsEncargar): Promise<{ text: string; error?: boolean; respuesta?: RespuestaEncargo }> {
  try { return await encargarSinSoltar(args, deps) } finally { await soltarManos(deps.manos) }
}

/** Primera capa del adaptador que sabe soltar (Freno → casa); `soltar` en ArbrainManos también apaga el Halo de la sesión. */
export async function soltarManos(a: Adaptador | undefined): Promise<void> {
  let x: any = a
  for (let i = 0; x && i < 8; i++, x = x.interno) if (typeof x.soltar === 'function') { await Promise.resolve(x.soltar()).catch(() => {}); return }
}

async function encargarSinSoltar(args: any, deps: DepsEncargar): Promise<{ text: string; error?: boolean; respuesta?: RespuestaEncargo }> {
  const pedido = typeof args?.pedido === 'string' ? args.pedido.trim() : ''
  const cita = typeof args?.cita === 'string' ? args.cita.trim() : ''
  if (!pedido) return { text: 'encargar necesita `pedido` (qué hay que lograr).', error: true }
  if (!cita) return { text: `encargar necesita \`cita\`: las palabras textuales de ${DUENO}. Sin ellas el freno no tiene a quién obedecer.`, error: true }
  // Edición cliente: la cita es la autoridad del freno, así que tiene que salir de lo que la persona escribió de verdad.
  if (esEdicionCliente() && !citaReal(cita)) return { text: `FRENO (cita): ${MENSAJE_CITA_FALSA}`, error: true }
  const id = `enc-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const tope = Math.min(600, Math.max(10, Number(args?.tope_s) || TOPE_POR_DEFECTO_S))
  const lineas: string[] = []
  const pedirFn = deps.pedir ?? (await import('./cerebro.js')).pedir
  guardarEstado(id, { estado: 'en_curso', pedido: pedido.slice(0, 200), fase: 'inicio', mensaje: 'encargo recibido', pasos: 0, ms: 0, quien: deps.quien })
  const progreso = (p: Progreso) => {
    if (p.fase === 'paso') lineas.push(p.mensaje)
    guardarEstado(id, { estado: p.fase === 'fin' ? 'cerrando' : 'en_curso', pedido: pedido.slice(0, 200), fase: p.fase, mensaje: p.mensaje, pasos: p.pasos, ms: p.ms, ultimos: lineas.slice(-6), quien: deps.quien })
    try { deps.progreso?.({ ...p, encargo: id }) } catch { /* el cliente se fue: el encargo sigue */ }
  }
  let r: ResultadoPedido
  try {
    r = await pedirFn(pedido, { manos: deps.manos, decisor: deps.decisor, cita, origen: 'encargar', silencio: true, captura: args?.captura !== false, perfil: typeof args?.perfil === 'string' ? args.perfil : undefined, presupuestoMs: tope * 1000, progreso, senal: deps.senal })
  } catch (e) {
    const msg = (e as Error).message
    guardarEstado(id, { estado: 'fallo', pedido: pedido.slice(0, 200), mensaje: msg.slice(0, 300), pasos: lineas.length })
    return { text: JSON.stringify({ encargo: id, estado: 'fallo', ok: false, resultado: `el cerebro no pudo correr: ${msg}` }), error: true }
  }
  const { resumirPasos } = await import('./cerebro.js')
  const respuesta: RespuestaEncargo = {
    encargo: id, estado: r.estado, ok: r.ok,
    resultado: r.detalle ?? (r.ok ? 'hecho' : 'sin detalle'),
    ...(r.evidencia ? { evidencia: r.evidencia } : {}),
    ...(preguntaPara(r) ? { pregunta: preguntaPara(r) } : {}),
    pasos: resumirPasos(r.pasos ?? []),
    tiempo_s: Number((r.ms / 1000).toFixed(1)),
    ...(r.url_final ? { url_final: r.url_final } : {}), ...(r.titulo_final ? { titulo_final: r.titulo_final } : {}),
    ...(r.captura ? { captura: r.captura } : {}),
    ruta: r.ruta, modelos: r.intentos.map(i => i.modelo),
    ...(r.escalado ? { escalado: r.escalado } : {}), ...(r.aprendida ? { aprendida: r.aprendida } : {}),
    bitacora_id: r.id,
    costo_usd: Number(r.intentos.reduce((s, i) => s + (i.costo_usd ?? 0), 0).toFixed(4)),
  }
  guardarEstado(id, { estado: r.estado, pedido: pedido.slice(0, 200), ok: r.ok, resultado: respuesta.resultado.slice(0, 300), pregunta: respuesta.pregunta, pasos: respuesta.pasos, tiempo_s: respuesta.tiempo_s, url_final: respuesta.url_final, captura: respuesta.captura, bitacora_id: r.id, quien: deps.quien })
  // Un fallo o una pregunta no son error del protocolo: el modelo debe leer la respuesta y decidir.
  return { text: JSON.stringify(respuesta, null, 1), respuesta }
}
