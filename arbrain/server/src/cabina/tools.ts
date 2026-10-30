/**
 * La Cabina — las manos de Levy sobre la interfaz de Arbrain.
 *
 * Dos verbos: `mostrar` pinta una vista viva DENTRO de la conversación y
 * `abrir` lleva a Daniel a la sección completa de Arbrain (3 oct 2026: nada saca de Arbrain; sfcal y sfmap
 * quedan como nombres viejos que caen en Calendario y Lienzo).
 *
 * El contrato es deliberadamente pequeño: la herramienta NO devuelve datos ni
 * HTML. Lo que se persiste es la INVOCACIÓN (vista + parámetros) dentro del
 * snapshot del turno; el cliente monta el componente real y lee la fuente viva
 * cada vez. Así una conversación recargada muestra datos frescos, no una foto.
 *
 * Este módulo es puro (sin SDK ni red) para que lo compartan el servidor MCP
 * por stdio del runtime de Claude y las dynamicTools del runtime de Codex.
 */

import { ESFUERZOS } from './harness/tipos.js'
import { PERFILES, PERFIL_EN_PALABRAS, esPerfil } from './perfiles.js'
import { DUENO, DUENO_M, PERSONAS, PERSONA_DUENO, REPO_TXT, SEGUNDA, SITIOS_VIGILADOS, dueno } from '../dueno.js'
import { validarDocumento } from './documento.js'
import { ayudaDeCliente, ayudaOriginal } from './ayuda.js'
import { esEdicionCliente } from '../edicion.js'
import { CABINA_SUBAGENTES } from '../cliente/politica-agentes.js'
import { subagentesClienteEncendidos } from '../cliente/subagentes-sdk.js'
import { describir, guardar as guardarEnArchivero, leer as leerArchivero, limpiarVista, pedirAbrir, sacar as sacarDelArchivero } from './archivero.js'
import { anotarBitacora, clientesVivos, describirPanel, emitir, esperarAcuses, esperarAjustes, informe } from './panel-bus.js'
import { aplicar as aplicarAjustes, describir as describirAjustesTodas, DONDES, idDeSeccion, leer as leerAjustes, NOMBRES as NOMBRES_SECCION, NOMBRES_DONDE, SECCIONES } from './panel-ajustes.js'

export const VISTAS = ['calendario', 'objetivos', 'centro', 'lienzo', 'reporte', 'negocio', 'trabajos', 'finanzas', 'contenido', 'rutinas', 'servidores', 'memoria', 'equipo', 'documento', 'diario', 'salud', 'masterclass', 'explorador', 'cohorte', 'casa', 'perro', 'historia'] as const
export const QUIENES = PERSONAS
export const SECCIONES_NEGOCIO = ['avatar', 'oferta', 'embudo', 'sistema'] as const
export const DESTINOS = ['calendario', 'objetivos', 'hoy', 'centro', 'contenido', 'lienzo', 'rutinas', 'finanzas', 'sfcal', 'sfmap'] as const
export const ALCANCES = ['dia', 'semana', 'mes'] as const

export type Vista = typeof VISTAS[number]
export type Destino = typeof DESTINOS[number]
export type Alcance = typeof ALCANCES[number]

/**
 * Edición cliente (carril U, 11 oct 2026): lo único que existe en la app del alumno. Misma lista que la web
 * (arbrain/src/lib/edicion.ts › VISTAS_CLIENTE y SECCIONES_PANEL_CLIENTE); el resto son vistas del negocio de la
 * instalación original y no se ofrecen ni se aceptan.
 */
export const VISTAS_CLIENTE = ['calendario', 'lienzo', 'memoria', 'documento', 'explorador'] as const satisfies readonly Vista[]
export const DESTINOS_CLIENTE = ['lienzo'] as const satisfies readonly Destino[]
export const SECCIONES_PANEL_CLIENTE = ['calendario', 'lienzo', 'explorador', 'taller'] as const satisfies readonly (typeof SECCIONES)[number][]
/** Vistas de `mostrar` según la edición. */
export const vistasEdicion = (cliente = esEdicionCliente()): readonly Vista[] => cliente ? VISTAS_CLIENTE : VISTAS
/** Destinos de `abrir` según la edición. */
export const destinosEdicion = (cliente = esEdicionCliente()): readonly Destino[] => cliente ? DESTINOS_CLIENTE : DESTINOS

export interface MostrarInput { vista: Vista; alcance?: Alcance; fecha?: string; paginaId?: string; titulo?: string; enfoque?: string; seccion?: typeof SECCIONES_NEGOCIO[number]; agenteId?: number; fijar?: boolean; zona?: string; ruta?: string; compararCon?: string; versiones?: string[]; tiempo?: number; soltar?: boolean; pestana?: string; guardar?: boolean; quien?: typeof QUIENES[number]; modo?: 'tu-casa'; repetir?: boolean; telefono?: boolean }
export interface AbrirInput { destino: Destino; alcance?: Alcance; fecha?: string; paginaId?: string; zona?: string; motivo?: string }

// Dieta de contexto (27 oct 2026): estas descripciones viajan en CADA turno. Dicen qué hace la herramienta y cuándo usarla;
// el detalle (qué pinta cada vista, campos finos, reglas largas) vive en ./ayuda.ts y lo devuelve `ayuda {tema}`.
// Sin fechas fijas: se vencen solas. Sensor: dieta.test.ts (tope TOPE_CABINA).
export const MOSTRAR_DESCRIPTION = `Muestra a ${DUENO}, dentro del chat, una vista viva con sus datos reales (la app lee la fuente; tú no ves sus cifras: no las afirmes sin consultarlas). Aparece ARRIBA de tu texto: di «arriba» y deja tu pregunta al final. Úsala si ver el dato ahorra explicación, una o dos por turno; no escribe nada. lienzo pide paginaId (zona encuadra); documento pide ruta (.md, .txt, .html, .pdf, imagen, audio, video o carpeta; nunca código). fijar, soltar, guardar y telefono solo si lo pide; si responden «NO confirmado», no afirmes que quedó. Para enseñar, conversa en el chat en texto plano. Qué pinta cada vista y sus campos: ayuda {tema:"<vista>"}.`
export const ATENDER_DESCRIPTION = `Marca como leídos avisos de la campana que ${DUENO} ya vio o ya conversaron (ids de «LO QUE LLEGÓ» o la vista reporte). todos:true solo si él lo pide. No borra nada.`
export const DELEGAR_DESCRIPTION = `Lanza un subagente en el Studio, proceso propio sin pantalla ni permisos que aprobar (bypass; sobrevive a reinicios): claude, codex, opencode, gemini o qwen. El encargo va acotado y con su Definición de Terminado (qué es hecho y cómo se verifica hoy). Al salir te despierta aquí; su pregunta es tuya (retomar) y si sube a ${DUENO}, en 1:3:1. Código del repo: delegar le crea su worktree (aislamiento; default dentro de ${REPO_TXT}). Confirma antes si escribe fuera de /tmp o toca algo de ${DUENO}. Con tope de paralelo o tokens alcanzado, cierra uno o pregunta. Detalle: ayuda {tema:"delegar"}.`
export const RETOMAR_DESCRIPTION = `Mensaje de seguimiento a un subagente tuyo (agenteId): si terminó, abre otro turno en su sesión; si trabaja, claude lo toma al acabar el paso y los demás al salir. modelo/esfuerzo cambian desde ese turno. Sus preguntas son tuyas; si necesitas a ${DUENO}, 1:3:1. Para cortar, detener.`
export const DETENER_DESCRIPTION = `Corta el paso en curso de un subagente tuyo sin cerrarlo ni perder su sesión; retomar lo reanuda. Descarta y te devuelve los mensajes en cola. Para terminar del todo usa cerrar.`
export const INTERACTIVO_DESCRIPTION = `Abre la sesión de un subagente tuyo (si no está trabajando) en una terminal del motor para que ${DUENO} entre a mano desde el Taller. Solo si lo pide. Devuelve la terminal.`
export const CERRAR_DESCRIPTION = `Cierra un subagente tuyo cuando terminó o ${DUENO} lo pide: libera su lugar y registra sus tokens. Su conversación queda en disco. Nunca cierra terminales de ${DUENO}.`
export const ABRIR_DESCRIPTION = `Lleva a ${DUENO} a la sección completa de Arbrain cuando la vista se queda corta o lo pide («llévame al calendario»). Navega al terminar tu respuesta (puede cancelar); máximo una vez por turno. lienzo acepta paginaId y zona; sfcal y sfmap caen en Calendario y Lienzo.`
export const AYUDA_DESCRIPTION = `Detalle a demanda de la Cabina: qué pinta cada vista, campos y reglas largas de cada herramienta. tema = vista o herramienta ("cohorte", "documento", "delegar"); sin tema, el índice. Úsala cuando dudes.`

const DATE = /^\d{4}-\d{2}-\d{2}$/
const PAGE = /^[A-Za-z0-9_-]{1,100}$/

function validDate(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || !DATE.test(value)) throw new Error('fecha debe ser YYYY-MM-DD.')
  const d = new Date(value + 'T12:00:00Z')
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error('fecha no existe en el calendario.')
  return value
}
function validPage(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || !PAGE.test(value)) throw new Error('paginaId inválido.')
  return value
}
function validText(value: unknown, max: number): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Se esperaba texto.')
  return value.slice(0, max)
}
function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, required = false): T | undefined {
  if (value == null || value === '') { if (required) throw new Error(`${field} es obligatorio (${options.join('|')}).`); return undefined }
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) throw new Error(`${field} debe ser ${options.join('|')}.`)
  return value as T
}

export function parseMostrar(raw: unknown): MostrarInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const vista = oneOf(o.vista, vistasEdicion(), 'vista', true)!
  const input: MostrarInput = { vista, alcance: oneOf(o.alcance, ALCANCES, 'alcance'), fecha: validDate(o.fecha), paginaId: validPage(o.paginaId), titulo: validText(o.titulo, 120), enfoque: validText(o.enfoque, 280) }
  if (vista === 'lienzo' && !input.paginaId) throw new Error('La vista lienzo necesita paginaId (la página de canvas que quieres mostrar).')
  if (o.zona != null && o.zona !== '') {
    if (vista !== 'lienzo') throw new Error('zona solo aplica a la vista lienzo.')
    input.zona = validText(o.zona, 120)!.trim()
  }
  if (vista === 'negocio') input.seccion = oneOf(o.seccion, SECCIONES_NEGOCIO, 'seccion')
  if (o.modo != null || o.repetir != null) {
    if (vista !== 'casa') throw new Error('modo y repetir solo aplican a la vista casa.')
    if (o.modo != null) input.modo = oneOf(o.modo, ['tu-casa'] as const, 'modo')
    if (o.repetir != null && typeof o.repetir !== 'boolean') throw new Error('repetir debe ser true o false.')
    if (o.repetir === true) input.repetir = true
  }
  if (o.quien != null) {
    if (vista !== 'diario') throw new Error('quien solo aplica a la vista diario.')
    input.quien = oneOf(o.quien, QUIENES, 'quien')
  }
  if (vista === 'trabajos' && o.agenteId != null) {
    if (!Number.isInteger(o.agenteId) || (o.agenteId as number) < 0) throw new Error('agenteId debe ser el número de terminal.')
    input.agenteId = o.agenteId as number
  }
  if (vista === 'documento') {
    if (typeof o.ruta !== 'string' || !o.ruta.trim()) throw new Error('La vista documento necesita ruta (relativa al repo, ~/Developer/… o /tmp/…).')
    const doc = validarDocumento(o.ruta)
    if ('error' in doc) throw new Error(doc.error)
    input.ruta = o.ruta.trim()
    const medio = doc.tipo === 'video' || doc.tipo === 'imagen'
    if (o.compararCon != null && o.compararCon !== '') {
      if (typeof o.compararCon !== 'string') throw new Error('compararCon debe ser "HEAD" o una ruta.')
      const otra = o.compararCon.trim()
      if (doc.tipo === 'md' || doc.tipo === 'txt') {
        if (otra !== 'HEAD') { const v = validarDocumento(otra); if ('error' in v) throw new Error(`compararCon: ${v.error}`) }
      } else if (medio) {
        // Video o imagen: la otra versión debe ser del mismo tipo (se ven lado a lado o alternando).
        const v = validarDocumento(otra)
        if ('error' in v) throw new Error(`compararCon: ${v.error}`)
        if (v.tipo !== doc.tipo) throw new Error(`compararCon: la otra versión debe ser ${doc.tipo}, no ${v.tipo}.`)
      } else throw new Error('compararCon solo aplica a .md/.txt (cambios marcados), video e imagen (versiones lado a lado).')
      input.compararCon = otra
    }
    if (o.versiones != null) {
      if (!medio) throw new Error('versiones solo aplica a video e imagen.')
      if (!Array.isArray(o.versiones) || o.versiones.length > 6 || o.versiones.some(x => typeof x !== 'string')) throw new Error('versiones debe ser una lista de hasta 6 rutas.')
      const lista = (o.versiones as string[]).map(x => x.trim()).filter(Boolean)
      for (const x of lista) { const v = validarDocumento(x); if ('error' in v) throw new Error(`versiones: ${v.error}`); if (v.tipo !== doc.tipo) throw new Error(`versiones: «${x}» debe ser ${doc.tipo}, no ${v.tipo}.`) }
      if (lista.length) input.versiones = lista
    }
    if (o.tiempo != null) {
      if (doc.tipo !== 'video' && doc.tipo !== 'audio') throw new Error('tiempo solo aplica a video y audio.')
      if (typeof o.tiempo !== 'number' || !Number.isFinite(o.tiempo) || o.tiempo < 0 || o.tiempo > 86_400) throw new Error('tiempo debe ser segundos desde el inicio (número ≥ 0).')
      input.tiempo = Math.round(o.tiempo * 1000) / 1000
    }
  } else if (o.ruta != null || o.compararCon != null || o.versiones != null || o.tiempo != null) throw new Error('ruta, compararCon, versiones y tiempo solo aplican a la vista documento.')
  if (o.fijar != null && typeof o.fijar !== 'boolean') throw new Error('fijar debe ser true o false.')
  if (o.fijar === true) input.fijar = true
  if (o.soltar != null && typeof o.soltar !== 'boolean') throw new Error('soltar debe ser true o false.')
  if (o.soltar === true) { if (input.fijar) throw new Error('fijar y soltar a la vez no tiene sentido.'); input.soltar = true }
  if (o.pestana != null && o.pestana !== '') {
    if (o.soltar !== true) throw new Error('pestana solo aplica con soltar:true.')
    if (typeof o.pestana !== 'string' || o.pestana.length > 120) throw new Error('pestana debe ser el id que devuelve panel {accion:"listar"}.')
    input.pestana = o.pestana.trim()
  }
  // «Ábrelo en mi teléfono» (14 oct 2026): la fija en el panel (uno solo para todos sus aparatos) y le manda un push.
  if (o.telefono != null && typeof o.telefono !== 'boolean') throw new Error('telefono debe ser true o false.')
  if (o.telefono === true) {
    if (esEdicionCliente()) throw new Error('telefono no está disponible en esta edición.')
    if (input.soltar) throw new Error('telefono y soltar a la vez no tiene sentido.')
    input.telefono = true
    input.fijar = true
  }
  if (o.guardar != null && typeof o.guardar !== 'boolean') throw new Error('guardar debe ser true o false.')
  if (o.guardar === true) { if (input.soltar) throw new Error('guardar y soltar a la vez no tiene sentido: guardar ya la saca de la barra.'); input.guardar = true }
  return input
}

export function parseAbrir(raw: unknown): AbrirInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const destino = oneOf(o.destino, destinosEdicion(), 'destino', true)!
  const input: AbrirInput = { destino, alcance: oneOf(o.alcance, ALCANCES, 'alcance'), fecha: validDate(o.fecha), paginaId: validPage(o.paginaId), motivo: validText(o.motivo, 200) }
  if (o.zona != null && o.zona !== '') {
    if (destino !== 'lienzo' && destino !== 'sfmap') throw new Error('zona solo aplica al lienzo.')
    input.zona = validText(o.zona, 120)!.trim()
  }
  // Sin paginaId la sección Lienzo abre el último lienzo usado (3 oct 2026); la zona sí necesita página.
  if (input.zona && !input.paginaId) throw new Error('zona necesita paginaId.')
  return input
}

const LABEL: Record<string, string> = { diario: 'reporte diario', documento: 'documento', reporte: 'reporte',  negocio: 'negocio', trabajos: 'trabajos', calendario: 'calendario', objetivos: 'objetivos', hoy: 'hoy', centro: 'finanzas · lo que entra', contenido: 'contenido', lienzo: 'lienzo', rutinas: 'rutinas', finanzas: 'finanzas', servidores: 'servidores', memoria: 'memoria y contexto', equipo: 'equipo', salud: 'salud', masterclass: 'masterclass', explorador: 'archivos', cohorte: 'cohorte', casa: 'casa', perro: 'perro', sfcal: 'calendario', sfmap: 'lienzo' }
const ALC: Record<Alcance, string> = { dia: 'día', semana: 'semana', mes: 'mes' }

/** Ejecuta un verbo de la cabina. Solo valida y confirma: la vista la monta el cliente. */
export function callCabina(tool: string, raw: unknown): { text: string; error?: boolean } {
  try {
    if (tool === 'mostrar') {
      const v = parseMostrar(raw)
      if (v.guardar) {
        const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
        const e = guardarEnArchivero(v as unknown as Record<string, unknown>, { conversacion })
        const copia = e.rutaOriginal ? ` Vivía en /tmp: se copió a ${e.input.ruta} y la entrada apunta a la copia.` : ''
        return { text: `«${e.nombre}» guardada en el archivero de ${DUENO} (${e.id}; «+ › Guardadas»).${copia} ${v.fijar ? 'Además quedó abierta como pestaña, marcada como guardada.' : 'No queda en la barra: se reabre desde Guardadas o con archivero {accion:"abrir"}.'}` }
      }
      if (v.vista === 'documento') {
        const nombre = v.titulo ? `«${v.titulo}» (${v.ruta})` : v.ruta
        if (v.soltar) return { text: `Pestaña del documento ${nombre} quitada del panel de ${DUENO} (si estaba fijada).` }
        return { text: `Documento ${nombre}${v.compararCon ? (/\.(md|markdown|txt)$/i.test(v.ruta ?? '') || v.compararCon === 'HEAD' ? ` con cambios marcados contra ${v.compararCon}` : ` comparado con ${v.compararCon}`) : ''}${v.versiones?.length ? ` (+${v.versiones.length} versiones)` : ''}${v.tiempo != null ? ` abierto en ${v.tiempo} s` : ''} mostrado a ${DUENO} ${v.fijar ? 'en la conversación y fijado como pestaña del panel' : 'en la conversación'}. Se refresca solo si el archivo cambia. Sigue tu respuesta; no repitas su contenido.` }
      }
      if (v.soltar) return { text: `Vista ${LABEL[v.vista]} quitada del panel de ${DUENO} (si estaba fijada).` }
      const detail = [v.alcance && ALC[v.alcance], v.fecha, v.paginaId && `página ${v.paginaId}`, v.zona && `zona «${v.zona}»`].filter(Boolean).join(', ')
      return { text: `Vista ${LABEL[v.vista]}${detail ? ` (${detail})` : ''} mostrada a ${DUENO} ${v.fijar ? 'en la conversación y fijada en el panel' : 'en la conversación'} con datos en vivo. No viste sus datos: si vas a citarlos, consúltalos por su fuente. Sigue tu respuesta; no repitas lo que la vista ya enseña.` }
    }
    if (tool === 'abrir') {
      const v = parseAbrir(raw)
      return { text: `Al terminar tu respuesta Arbrain llevará a ${DUENO} a ${LABEL[v.destino]}${v.fecha ? ` (${v.fecha})` : ''}; puede cancelarlo. Cierra tu respuesta sin esperar confirmación de la navegación.` }
    }
    throw new Error(`Herramienta desconocida: ${tool}`)
  } catch (error) {
    return { text: error instanceof Error ? error.message : 'Invocación inválida.', error: true }
  }
}

// Schemas magros: tipos y enums; lo que antes explicaba cada campo vive en ayuda {tema:"campos_<herramienta>"}.
const S = { type: 'string' } as const
const B = { type: 'boolean' } as const
const N = { type: 'number' } as const
const LISTA = { type: 'array', items: S } as const
const AGENTE = { type: 'integer' } as const
/** Los niveles de la casa; el catálogo vivo de cada modelo decide al lanzar cuáles acepta (catalogo-delegar.ts). */
const ESFUERZO = { type: 'string', enum: [...ESFUERZOS] } as const
const alcanceSchema = { type: 'string', enum: [...ALCANCES] }
const fechaSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const paginaSchema = S

export const ARCHIVERO_DESCRIPTION = `Lo guardado en el archivero de ${DUENO} («+ › Guardadas»). accion listar | abrir {id o nombre} (la app la abre como pestaña) | sacar {id o nombre} (no borra el archivo). Para guardar usa mostrar guardar:true, solo si lo pide.`

export const PANEL_DESCRIPTION = `Las pestañas que ${DUENO} tiene abiertas AHORA en su panel, según su app. accion listar: id, vista, ruta, quién la abrió, ventana y qué cliente recibe lo que abres; úsala antes de afirmar qué ve (sin cliente conectado da error). accion secciones: lee o cambia el menú «+» (la config de Ajustes › Panel) con ocultar, mostrar, orden, restablecer o donde; espera el acuse y «NO confirmado» = escrita sin aplicar. Cambiarlo solo si lo pide. Detalle: ayuda {tema:"panel"}.`

/** Texto corto de `despertador` para el dueño `quien` (igual en las dos ediciones); el largo, en ayuda. */
export const textoDespertador = (quien: string) => `Despertadores durables de esta conversación («despiértame en 5 min», «revisa cada hora»): al vencer te llega aquí tu texto aunque el servidor se reinicie; ${quien} ve los pendientes. En vez de CronCreate o loop. accion crear (texto para ti + enMinutos, aLas «HH:MM» de México, o cadaMinutos ≥ 5 con veces) | listar | cancelar {id}. Detalle: ayuda {tema:"despertador"}.`
export const DESPERTADOR_DESCRIPTION = textoDespertador(DUENO)

const obj = <P extends Record<string, unknown>, R extends readonly string[] = readonly []>(properties: P, required?: R, cerrado = false) =>
  ({ type: 'object', ...(cerrado ? { additionalProperties: false } : {}), ...(required ? { required } : {}), properties }) as const

export const CABINA_TOOLS = [
  { name: 'mostrar', description: MOSTRAR_DESCRIPTION, inputSchema: obj({
    vista: { type: 'string', enum: [...VISTAS] }, alcance: alcanceSchema, fecha: fechaSchema, paginaId: paginaSchema,
    titulo: S, enfoque: S, seccion: { type: 'string', enum: [...SECCIONES_NEGOCIO] }, quien: { type: 'string', enum: [...QUIENES] },
    agenteId: AGENTE, modo: { type: 'string', enum: ['tu-casa'] }, repetir: B, fijar: B, zona: S, ruta: S, compararCon: S,
    versiones: LISTA, tiempo: N, soltar: B, pestana: S, guardar: B, telefono: B,
  }, ['vista'] as const, true) },
  { name: 'archivero', description: ARCHIVERO_DESCRIPTION, inputSchema: obj({
    accion: { type: 'string', enum: ['listar', 'abrir', 'sacar'] }, id: S,
  }, ['accion'] as const) },
  { name: 'panel', description: PANEL_DESCRIPTION, inputSchema: obj({
    accion: { type: 'string', enum: ['listar', 'secciones'] },
    ocultar: LISTA, mostrar: LISTA, orden: LISTA, restablecer: B,
    donde: { type: 'string', enum: ['izquierda', 'derecha', 'principal'] },
  }, ['accion'] as const) },
  { name: 'abrir', description: ABRIR_DESCRIPTION, inputSchema: obj({
    destino: { type: 'string', enum: [...DESTINOS] }, alcance: alcanceSchema, fecha: S, paginaId: paginaSchema, zona: S, motivo: S,
  }, ['destino'] as const) },
  { name: 'despertador', description: DESPERTADOR_DESCRIPTION, inputSchema: obj({
    accion: { type: 'string', enum: ['crear', 'listar', 'cancelar'] }, texto: S, enMinutos: N, aLas: S, cadaMinutos: N, veces: N, id: S,
  }, ['accion'] as const) },
  { name: 'atender', description: ATENDER_DESCRIPTION, inputSchema: obj({ ids: LISTA, todos: B }) },
  { name: 'delegar', description: DELEGAR_DESCRIPTION, inputSchema: obj({
    nombre: S, harness: { type: 'string', enum: ['claude', 'codex', 'opencode', 'gemini', 'qwen'] }, encargo: { type: 'string', maxLength: 2000 }, cwd: S, modelo: S, esfuerzo: ESFUERZO, aislamiento: { type: 'string', enum: ['worktree', 'carpeta'] },
    perfil: { type: 'string', enum: [...PERFILES] }, plan: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
  }, [] as const, true) },
  { name: 'retomar', description: RETOMAR_DESCRIPTION, inputSchema: obj({ agenteId: AGENTE, texto: { type: 'string', maxLength: 4000 }, modelo: S, esfuerzo: ESFUERZO }, ['agenteId', 'texto'] as const) },
  { name: 'detener', description: DETENER_DESCRIPTION, inputSchema: obj({ agenteId: AGENTE }, ['agenteId'] as const) },
  { name: 'interactivo', description: INTERACTIVO_DESCRIPTION, inputSchema: obj({ agenteId: AGENTE }, ['agenteId'] as const) },
  { name: 'cerrar', description: CERRAR_DESCRIPTION, inputSchema: obj({ agenteId: AGENTE }, ['agenteId'] as const) },
  { name: 'ayuda', description: AYUDA_DESCRIPTION, inputSchema: obj({ tema: S }) },
] as const

/** Verbos con efecto (async): atender, delegar, retomar, cerrar. mostrar/abrir se validan en callCabina. */
export async function ejecutarCabina(tool: string, raw: unknown): Promise<{ text: string; error?: boolean; imagenes?: { data: string; mimeType: string }[] }> {
  // Red team A1: en la edición cliente `delegar` y compañía no existen (lanzan procesos de CLI aparte, fuera de la
  // guardia y de I8). El alumno delega con `Agent` del SDK, que corre en su sesión bajo la guardia (cliente/subagentes-sdk.ts).
  if (esEdicionCliente() && CABINA_SUBAGENTES.has(tool)) return { text: mensajeSinSubagentes(), error: true }
  // Carril T: la campana (avisos de la instalación original) no existe en cliente.
  if (esEdicionCliente() && CABINA_SOLO_ORIGINAL.has(tool)) return { text: motivoSoloOriginal(tool), error: true }
  if (tool === 'mostrar') return mostrarConEfecto(raw)
  if (tool === 'abrir') return callCabina(tool, raw)
  // Dieta de contexto (27 oct 2026): el detalle que salió de las descripciones, a demanda.
  if (tool === 'ayuda') { const tema = raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).tema === 'string' ? (raw as Record<string, string>).tema : undefined; return { text: esEdicionCliente() ? ayudaDeCliente(dueno(), tema) : ayudaOriginal(tema) } }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  try {
    if (tool === 'despertador') return await despertador(o)
    if (tool === 'archivero') return archivero(o)
    if (tool === 'panel') return await panel(o)
    if (tool === 'atender') {
      const { atender } = await import('./llegado.js')
      const n = await atender({ ids: Array.isArray(o.ids) ? o.ids.map(String) : undefined, todos: o.todos === true })
      return { text: n ? `${n} aviso(s) marcados como leídos en la campana.` : 'No había avisos sin leer con esos ids.' }
    }
    const { delegar, retomar, cerrar, harnessPermitidos } = await import('./cuerpo.js')
    if (tool === 'delegar') {
      const origen = (() => { try { return scopeDeCabina() } catch { return undefined } })()
      // Plan versionado (29 oct 2026, plan.ts): una ruta lo corre (la versión que Daniel dejó, ya commiteada como aprobada).
      if (typeof o.plan === 'string' && o.plan.trim()) {
        const { correrPlan } = await import('./plan.js')
        const { sub, plan } = await correrPlan(o.plan.trim(), origen ? { avisarA: origen } : {})
        return { text: `Plan ${plan.ruta} aprobado${plan.commit ? ` (commit ${plan.commit.slice(0, 8)})` : ` sin commit: ${plan.aviso ?? 'git no respondió'}`} y lanzado: agenteId ${sub.id} (${sub.harness}, perfil ${PERFIL_EN_PALABRAS[sub.perfil ?? 'total']}, ${sub.cwd}). El juez lo juzgará contra la Definición de Terminado de ese commit. Muéstralo con mostrar {vista:"trabajos", agenteId:${sub.id}}.` }
      }
      const permitidos = await harnessPermitidos()
      const harness = typeof o.harness === 'string' && permitidos.includes(o.harness) ? o.harness : null
      if (!harness || typeof o.encargo !== 'string' || !o.encargo.trim() || typeof o.cwd !== 'string' || typeof o.nombre !== 'string') throw new Error(`delegar necesita nombre, harness (${permitidos.join('|')}), encargo y cwd.`)
      const aislamiento = o.aislamiento === 'worktree' || o.aislamiento === 'carpeta' ? o.aislamiento : undefined
      if (o.perfil != null && !esPerfil(o.perfil)) throw new Error(`perfil: ${PERFILES.join(', ')}.`)
      const perfil = esPerfil(o.perfil) ? o.perfil : undefined
      // plan: true → se escribe y commitea el plan, y NO se lanza: Daniel lo edita y lo corre (o te da el «va»).
      if (o.plan === true) {
        const { proponerPlan, origenATexto } = await import('./plan.js')
        const p = await proponerPlan({ nombre: o.nombre, harness, encargo: o.encargo, cwd: o.cwd, ...(perfil ? { perfil } : {}), ...(typeof o.modelo === 'string' && o.modelo ? { modelo: o.modelo } : {}), ...(typeof o.esfuerzo === 'string' && o.esfuerzo ? { esfuerzo: o.esfuerzo } : {}), ...(aislamiento ? { aislamiento } : {}), ...(origen ? { avisar: origenATexto(origen) } : {}) })
        return { text: `Plan escrito en ${p.ruta}${p.commit ? ` (commit ${p.commit.slice(0, 8)})` : ` sin commit: ${p.aviso ?? 'git no respondió'}`}. No lancé nada: espera el «va» de ${DUENO}. Lo ve en Taller › Agentes › «Planes por correr», puede editarlo ahí y correrlo con un botón; si te da el «va» aquí, córrelo con delegar {plan:"${p.ruta}"}. Para enseñárselo: mostrar {vista:"documento", ruta:"${p.ruta}"}.` }
      }
      const sub = await delegar({ nombre: o.nombre, harness, encargo: o.encargo, cwd: o.cwd, modelo: typeof o.modelo === 'string' && o.modelo ? o.modelo : undefined, ...(typeof o.esfuerzo === 'string' && o.esfuerzo ? { esfuerzo: o.esfuerzo } : {}), ...(aislamiento ? { aislamiento } : {}), ...(perfil ? { perfil } : {}), ...(origen ? { avisarA: origen } : {}) })
      const entrega = sub.entrega === 'entregado' ? 'El encargo ya le llegó.' : sub.entrega === 'falló' ? `El encargo NO se confirmó (${sub.entregaNota}); el subagente es tuyo: entrégalo con retomar.` : `El CLI sigue arrancando; la entrega se reintenta sola (${sub.entregaNota ?? 'en curso'}). Si en un minuto no trabaja, usa retomar.`
      const donde = sub.aislamiento === 'worktree' ? ` Trabaja en su worktree ${sub.cwd} (rama ${sub.rama}); al cerrarlo, wt.sh lo quita si ya está en main.` : ''
      if (sub.modo === 'sin-pantalla') return { text: `Subagente «${sub.nombre}» lanzado sin pantalla (proceso propio, sobrevive a reinicios): agenteId ${sub.id} (${sub.harness}, permisos ${sub.permisos === 'bypass' ? 'bypassPermissions' : sub.permisos}, perfil ${PERFIL_EN_PALABRAS[sub.perfil ?? 'total']}${sub.sinGuardia ? `; ojo: ${sub.harness} no acepta la guardia, corre SIN lista negra` : ''}, ${sub.cwd}). ${sub.eleccion ? `Corre con ${sub.eleccion}; si el CLI reporta otra cosa, el Taller lo marca en ámbar y te lo digo al terminar.` : ''}${donde} El encargo ya le llegó como argumento del CLI. ${sub.aviso ? `Aviso: ${sub.aviso}. ` : ''}Muéstralo con mostrar {vista:"trabajos", agenteId:${sub.id}}. ${origen ? 'Cuando su proceso salga (terminó, falló o hizo una pregunta), el servidor te despierta en ESTA conversación con su última respuesta: no necesitas despertador ni vigía para eso. ' : ''}Para seguir la conversación usa retomar; ciérralo con cerrar cuando termine.` }
      return { text: `Subagente «${sub.nombre}» lanzado en ${sub.motor ? 'el motor de Arbrain' : 'SFTerm (motor apagado: respaldo por el gate)'}: agenteId ${sub.id} (${sub.harness}${sub.modelo ? ` · ${sub.modelo}` : ''}, permisos ${sub.permisos === 'bypass' ? 'bypassPermissions' : sub.permisos}, ${sub.cwd}). ${entrega} ${sub.aviso ? `Aviso: ${sub.aviso}. ` : ''}${sub.espera ? `Dejó una pregunta abierta, es tuya (no de ${DUENO}): «${sub.espera}»; respóndela con retomar. ` : ''}Muéstralo con mostrar {vista:"trabajos", agenteId:${sub.id}}. ${origen && sub.motor ? 'Cuando termine (quieto tras responder, o si su proceso muere), el servidor te despierta en ESTA conversación con su última respuesta: no necesitas despertador ni vigía para eso. ' : ''}Ciérralo con cerrar cuando termine.` }
    }
    const id = Number(o.agenteId)
    if (!Number.isInteger(id)) throw new Error('agenteId inválido.')
    if (tool === 'retomar') { if (typeof o.texto !== 'string' || !o.texto.trim()) throw new Error('retomar necesita texto.'); const cambio = { ...(typeof o.modelo === 'string' && o.modelo ? { modelo: o.modelo } : {}), ...(typeof o.esfuerzo === 'string' && o.esfuerzo ? { esfuerzo: o.esfuerzo } : {}) }; const r = await retomar(id, o.texto, cambio); const conCambio = r.eleccion ? ` Desde este turno: ${r.eleccion}.` : ''; if (r.eligio) return { text: r.confirmado ? `Opción ${r.eligio} elegida en el diálogo del subagente ${id}; ya siguió.` : `Marqué la opción ${r.eligio} en el diálogo del subagente ${id}, pero el diálogo sigue en pantalla: míralo con mostrar trabajos.` }; if (r.enVivo) return { text: `Mensaje entregado EN VIVO al subagente ${id}: entró a su turno en curso y lo toma en cuanto termine el paso que está haciendo (no lo interrumpe). Te aviso cuando su proceso salga.` }; return { text: r.confirmado ? (r.encolado ? `Mensaje encolado en el subagente ${id}: seguía en medio de un paso y lo tomará al terminar (quedó en su cola).` : `Mensaje entregado al subagente ${id}.${conCambio}`) : `Mensaje enviado al subagente ${id}${r.encolado ? ' (seguía trabajando)' : ''}, pero no pude confirmar que quedara en su cola: míralo con mostrar trabajos antes de repetirlo.` } }
    if (tool === 'detener') {
      const { detenerSubagente } = await import('./sin-pantalla.js')
      const r = await detenerSubagente(id)
      if (!r.estaba) return { text: `El subagente ${id} no estaba trabajando: no había paso que cortar. Su última respuesta: «${r.respuesta.slice(0, 400) || '(sin respuesta)'}».` }
      const como = r.como === 'protocolo' ? 'con la interrupción de su protocolo' : r.como === 'señal' ? 'con una señal de interrupción' : 'a la fuerza (no respondió a la interrupción)'
      return { text: `Subagente ${id} detenido ${como}. Su sesión sigue: retomar lo reanuda con su contexto.${r.respuesta ? ` Lo último que dijo: «${r.respuesta.slice(0, 400)}».` : ''}${r.colaDescartada.length ? ` Mensajes en cola descartados: ${r.colaDescartada.map(x => `«${x.slice(0, 120)}»`).join(' · ')}.` : ''}` }
    }
    if (tool === 'interactivo') { const { abrirInteractivo } = await import('./sin-pantalla.js'); const r = await abrirInteractivo(id); return { text: `Sesión del subagente ${id} abierta a mano en la terminal ${r.terminal} del motor (${r.comando}). ${DUENO_M} la ve en el Taller; mientras viva, retomar no le escribe encima.` } }
    if (tool === 'cerrar') { await cerrar(id); return { text: `Subagente ${id} cerrado. Su conversación queda en disco.` } }
    throw new Error(`Herramienta desconocida: ${tool}`)
  } catch (error) {
    return { text: error instanceof Error ? error.message : 'No se pudo ejecutar.', error: true }
  }
}

/**
 * `mostrar` con efecto sobre el panel (fijar, soltar, guardar): deja un comando para la app de Daniel y
 * confirma con SU acuse, el estado real de su panel, no con un éxito optimista. Sin cliente conectado lo dice.
 */
async function mostrarConEfecto(raw: unknown): Promise<{ text: string; error?: boolean }> {
  const base = callCabina('mostrar', raw)
  if (base.error) return base
  const v = parseMostrar(raw)
  if (!v.fijar && !v.soltar && !v.guardar) return base
  const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
  const accion = v.guardar ? 'guardar' : v.soltar ? 'soltar' : 'fijar'
  const { comando, objetivos, destino } = emitir(accion, { ...limpiarVista(v as unknown as Record<string, unknown>), ...(v.fijar ? { fijar: true } : {}), ...(v.pestana ? { pestana: v.pestana } : {}) }, conversacion)
  const r = informe(comando, objetivos, await esperarAcuses(comando.id, objetivos), Date.now(), undefined, destino)
  // «NO confirmado» (app dormida, sin acuse o que rechazó) es asunto técnico: Levy lo lee en el texto y queda en la bitácora del bus,
  // pero no es un error de herramienta, o el chat de Daniel lo pinta como aviso naranja (7 oct 2026).
  if (!r.confirmado) anotarBitacora({ evento: 'mostrar-sin-confirmar', accion, comando: comando.id, vista: v.vista, ruta: v.ruta, conectados: objetivos.length, detalle: r.text })
  if (v.telefono) {
    // El push sale aunque ninguna app haya acusado: el enlace abre la vista en el teléfono y la deja en el panel compartido.
    const { avisarAlTelefono } = await import('./telefono.js')
    const push = await avisarAlTelefono(limpiarVista(v as unknown as Record<string, unknown>) as unknown as Record<string, unknown>)
    if (!push.ok) anotarBitacora({ evento: 'telefono-sin-push', vista: v.vista, ruta: v.ruta, detalle: push.texto })
    const panelTxt = r.confirmado ? `En el panel: ${r.text}` : `El escritorio no la confirmó (${r.text}); al tocar el aviso el teléfono la abre y la deja en el panel compartido.`
    return { text: `${push.ok ? `Teléfono: ${push.texto}; al tocarlo abre ${push.url.split('?')[0]} con la vista al frente.` : `Teléfono: NO confirmado, ${push.texto}. No digas que ya le llegó.`} ${panelTxt}` }
  }
  if (accion === 'fijar') return { text: r.confirmado ? `${base.text} Confirmación de la app: ${r.text}` : r.text }
  if (accion === 'soltar') return { text: r.text }
  return { text: `${base.text} Panel: ${r.text}` }
}

/** Las pestañas que Daniel tiene abiertas AHORA, según lo que reporta su app; o la configuración del menú «+» (accion secciones). */
async function panel(o: Record<string, unknown>): Promise<{ text: string; error?: boolean }> {
  if (o.accion === 'secciones') return seccionesDelPanel(o)
  if (o.accion !== 'listar') throw new Error('accion debe ser listar o secciones.')
  const conversacion = (() => { try { return scopeDeCabina().conversationId } catch { return undefined } })()
  const r = describirPanel(Date.now(), undefined, conversacion)
  return { text: r.text, ...(r.conectado ? {} : { error: true }) }
}

/**
 * `panel {accion:"secciones"}` (6 oct 2026): lee o escribe la config del menú «+» (la misma que Ajustes › Panel) y, si escribe,
 * espera a que cada app conectada la reporte aplicada en su latido. Sin cliente conectado la config queda escrita y lo dice.
 */
async function seccionesDelPanel(o: Record<string, unknown>): Promise<{ text: string; error?: boolean }> {
  const lista = (v: unknown, campo: string) => { if (v === undefined) return undefined; if (!Array.isArray(v)) throw new Error(`${campo} debe ser una lista de secciones (${(esEdicionCliente() ? SECCIONES_PANEL_CLIENTE : SECCIONES).join(', ')}).`); return v }
  const ocultar = lista(o.ocultar, 'ocultar'), mostrar = lista(o.mostrar, 'mostrar'), orden = lista(o.orden, 'orden')
  if (o.donde !== undefined && typeof o.donde !== 'string') throw new Error(`donde debe ser una de: ${DONDES.join(', ')}.`)
  const donde = o.donde as string | undefined
  if (o.restablecer !== undefined && typeof o.restablecer !== 'boolean') throw new Error('restablecer debe ser true o false.')
  const restablecer = o.restablecer === true
  // Carril U: en cliente el «+» solo tiene Lienzo, Archivos y Taller; nombrar otra sección es un error, no un cambio invisible.
  const cliente = esEdicionCliente()
  const existen: readonly (typeof SECCIONES)[number][] = cliente ? SECCIONES_PANEL_CLIENTE : SECCIONES
  if (cliente) for (const [campo, xs] of [['ocultar', ocultar], ['mostrar', mostrar], ['orden', orden]] as const) for (const x of xs ?? []) {
    const id = idDeSeccion(x)
    if (!id || !existen.includes(id)) throw new Error(`${campo}: «${String(x)}» no es una sección del «+» en esta edición. Son: ${existen.map(s => NOMBRES_SECCION[s]).join(', ')}.`)
  }
  const describirAjustes = (a: Parameters<typeof describirAjustesTodas>[0]) => describirAjustesTodas(a, existen)
  if (!ocultar && !mostrar && !orden && !restablecer && donde === undefined) return { text: `${describirAjustes(leerAjustes().ajustes)} Para cambiarlo: panel {accion:"secciones", ocultar|mostrar|orden|donde|restablecer}.` }
  const antes = leerAjustes().ajustes
  const objetivos = clientesVivos()
  const nueva = aplicarAjustes({ restablecer, orden, ocultar, mostrar, donde }, 'Levy')
  const { acusaron, sinRespuesta } = await esperarAjustes(nueva.rev, objetivos, { esperaMs: Number(process.env.ARBRAIN_PANEL_ESPERA_MS) || 8000 })
  const cambios = [
    ...nueva.ocultas.filter(s => existen.includes(s) && !antes.ocultas.includes(s)).map(s => `ocultó ${NOMBRES_SECCION[s]}`),
    ...antes.ocultas.filter(s => existen.includes(s) && !nueva.ocultas.includes(s)).map(s => `volvió a mostrar ${NOMBRES_SECCION[s]}`),
    ...(nueva.orden.filter(s => existen.includes(s)).join() !== antes.orden.filter(s => existen.includes(s)).join() ? ['cambió el orden'] : []),
    ...(nueva.donde !== antes.donde ? [`ahora lo que abres cae en ${NOMBRES_DONDE[nueva.donde]}`] : []),
  ]
  const hecho = `Config del «+» escrita (v${nueva.rev}): ${cambios.join(', ') || 'sin cambios (ya estaba así)'}. ${describirAjustes(nueva)}`
  if (!objetivos.length) return { text: `NO confirmado: ${hecho} Pero no hay ninguna app de Arbrain conectada ahora: la verá en cuanto abra. No le digas a ${DUENO} que ya lo ve.`, error: true }
  if (sinRespuesta.length) return { text: `NO confirmado del todo: ${hecho} Aplicaron: ${acusaron.map(c => c.etiqueta).join(', ') || 'ninguna'}. Sin respuesta: ${sinRespuesta.map(c => c.etiqueta).join(', ')} (la config queda escrita; la tomará en su próximo latido). Verifica con panel {accion:"listar"} antes de afirmar.`, error: true }
  return { text: `${hecho} Confirmado por ${acusaron.map(c => c.etiqueta).join(', ')}: ya lo aplicó${cambios.some(c => c.startsWith('ocultó')) ? ' y cerró las pestañas de lo oculto' : ''}.` }
}

function archivero(o: Record<string, unknown>): { text: string; error?: boolean } {
  if (o.accion === 'listar') {
    const { entradas } = leerArchivero()
    return { text: entradas.length ? `${entradas.length} en el archivero:\n${entradas.map(describir).join('\n')}` : 'El archivero está vacío.' }
  }
  const quien = typeof o.id === 'string' ? o.id.trim() : ''
  if (!quien) throw new Error(`${o.accion ?? 'archivero'} necesita id (o el nombre de la entrada).`)
  if (o.accion === 'abrir') {
    const e = pedirAbrir(quien)
    return e ? { text: `«${e.nombre}» se abrirá como pestaña en el panel de ${DUENO} en unos segundos (la app atiende el pedido).` } : { text: `No hay nada guardado como «${quien}». Usa accion listar.`, error: true }
  }
  if (o.accion === 'sacar') {
    const e = sacarDelArchivero(quien)
    return e ? { text: `«${e.nombre}» salió del archivero.${e.rutaOriginal ? ` Su copia ${e.input.ruta} sigue en el repo.` : ''}` } : { text: `No hay nada guardado como «${quien}». Usa accion listar.`, error: true }
  }
  throw new Error('accion debe ser listar, abrir o sacar.')
}

/** La conversación de esta Cabina: la pone el agent-server en el entorno del servidor MCP (stdio). */
function scopeDeCabina(): { owner: string; account: string; conversationId: string } {
  try {
    const s = JSON.parse(process.env.ARBRAIN_CABINA_SCOPE ?? '') as Record<string, unknown>
    if ([s.owner, s.account, s.conversationId].every(v => typeof v === 'string' && v)) return s as { owner: string; account: string; conversationId: string }
  } catch { /* sin conversación */ }
  throw new Error('Los despertadores solo existen dentro de una conversación del chat de Arbrain.')
}

async function despertador(o: Record<string, unknown>): Promise<{ text: string; error?: boolean }> {
  const scope = scopeDeCabina()
  const [{ default: Database }, { join }, { STORE_DIR }, { Despertadores, describirDespertador }] = await Promise.all([
    import('better-sqlite3'), import('node:path'), import('../config.js'), import('../chat-runtime/despertadores.js'),
  ])
  const db = new Database(join(STORE_DIR, 'claudeclaw.db'))
  try {
    const d = new Despertadores(db)
    const num = (v: unknown) => v === undefined || v === null ? undefined : Number(v)
    if (o.accion === 'crear') {
      const nuevo = d.crear(scope, { texto: String(o.texto ?? ''), enMinutos: num(o.enMinutos), aLas: typeof o.aLas === 'string' ? o.aLas : undefined, cadaMinutos: num(o.cadaMinutos), veces: num(o.veces) })
      return { text: `Despertador creado: ${describirDespertador(nuevo)}. Es durable: sobrevive a reinicios. ${DUENO_M} lo ve como pendiente en la conversación. Termina tu respuesta; al vencer te llega aquí el texto.` }
    }
    if (o.accion === 'listar') {
      const lista = d.listar(scope, true).slice(0, 20)
      return { text: lista.length ? lista.map(x => describirDespertador(x)).join('\n') : 'Esta conversación no tiene despertadores.' }
    }
    if (o.accion === 'cancelar') {
      if (typeof o.id !== 'string' || !o.id) throw new Error('cancelar necesita id.')
      return d.cancelar(scope, o.id) ? { text: `Despertador ${o.id} cancelado.` } : { text: `No hay un despertador pendiente ${o.id} en esta conversación.`, error: true }
    }
    throw new Error('accion debe ser crear, listar o cancelar.')
  } finally { db.close() }
}

/** Codex recibe los mismos verbos como dynamicTools con prefijo explícito. Sin `despertador` por ahora:
 * su servidor no recibe la conversación (pendiente; los despertadores nacieron para el chat de Claude). */
export function cabinaDynamicTools() {
  return cabinaToolsVisibles().filter(t => t.name !== 'despertador').map(t => ({ name: `cabina_${t.name}`, description: t.description, inputSchema: t.inputSchema }))
}

/**
 * Herramientas de la Cabina que ve el modelo. Edición cliente (red team A1, 11 oct 2026): sin `delegar` ni el resto
 * de la familia de subagentes. Esos subagentes son CLIs aparte (Claude en `auto`, Codex sin aprobaciones) que no pasan
 * por la guardia ni por la confirmación humana, corren fuera del cerebro y sobreviven a la app; el trabajo largo del
 * alumno lo hace el propio chat (con su Task interno, que sí pasa por la guardia). Daniel: todas, como siempre.
 */
export function cabinaToolsVisibles(): Array<(typeof CABINA_TOOLS)[number]> {
  return esEdicionCliente() ? cabinaToolsCliente() : [...CABINA_TOOLS]
}
/** Herramientas que solo existen en la instalación original: `atender` marca avisos de su campana (carril T). */
export const CABINA_SOLO_ORIGINAL = new Set(['atender'])
/** Por qué una herramienta de CABINA_SOLO_ORIGINAL no corre en cliente. */
export const motivoSoloOriginal = (_tool: string) => SIN_CAMPANA_CLIENTE

/**
 * Textos de la Cabina en la edición cliente (carril U, 11 oct 2026): describen SOLO lo que existe en la app del alumno
 * (vistas lienzo, memoria, documento y explorador; el «+» con Lienzo, Archivos y Taller) y nada de la operación de la
 * instalación original. Una sola fuente: los esquemas son los de CABINA_TOOLS; aquí solo cambian las descripciones, se
 * recortan los enums a la edición y se quitan los campos de vistas que no existen. `quien` = el dueño de la instalación
 * («la persona» o `ARBRAIN_DUENO`), leído al pedir la lista y no al cargar el módulo.
 */
export function textosCabinaCliente(quien = dueno()) {
  const Quien = quien.charAt(0).toLocaleUpperCase('es') + quien.slice(1)
  const mostrar = `Muestra a ${quien}, dentro del chat, una vista viva (la app lee la fuente y se refresca sola). Aparece ARRIBA de tu texto (di «arriba»; tu pregunta va al final). Úsala si ver algo ahorra explicación, una o dos por turno; no escribe nada y no afirmes lo que no consultaste. Vistas: calendario (su plan y agenda; alcance y fecha opcionales; lee .claude/plan/calendario.json, objetivos.md y habitos.json, que tú editas cuando pide agendar o planear: cada uno trae su instructivo) · lienzo (paginaId; zona encuadra) · memoria (lo que sabes y qué entra en tu contexto) · documento (ruta: .md, .txt, .html, .pdf, imagen, audio, video o carpeta; nunca código) · explorador (el árbol de archivos de su cerebro). fijar:true la deja en el panel y soltar:true la cierra, solo si lo pide; guardar:true al archivero. Esperan el acuse de su app: si dice «NO confirmado» no afirmes que quedó. Detalle: ayuda {tema:"<vista>"}.`
  const abrir = `Lleva a ${quien} a la sección Lienzo completa de Arbrain cuando la vista se queda corta o lo pide («ábreme el lienzo en grande»). Navega al terminar tu respuesta (puede cancelar); máximo una vez por turno. paginaId y zona opcionales; sin paginaId abre el último lienzo.`
  const panel = `Las pestañas que ${quien} tiene abiertas AHORA en su panel, según su app (no lo que creas haber fijado). accion listar: id, vista, ruta, quién la abrió y en qué ventana vive; úsala antes de afirmar qué ve. Sin cliente conectado da error: nada fijado está confirmado. accion secciones: lee o cambia el menú «+» (la misma config de Ajustes › Panel) con ocultar, mostrar, orden, restablecer o donde, y espera el acuse; «NO confirmado» = escrita pero sin aplicar aún. Secciones: calendario, lienzo, explorador (Archivos) y taller. Cambiarlo solo si lo pide.`
  const archivero = `Lo guardado en el archivero de ${quien} («+ › Guardadas»). accion listar | abrir {id o nombre} (la app la abre como pestaña) | sacar {id o nombre} (no borra el archivo). Para guardar usa mostrar guardar:true, solo si lo pide.`
  const ayuda = `Detalle a demanda de la Cabina: qué pinta cada vista de mostrar y las reglas largas de cada herramienta. tema = una vista o herramienta (p. ej. "documento", "panel"); sin tema, el índice. Consúltala cuando dudes de una vista o un campo. Para delegar trabajo a un subagente (herramienta Agent, bajo la misma guardia): tema "subagentes".`
  return { quien, Quien, mostrar, abrir, panel, archivero, ayuda, despertador: textoDespertador(quien) }
}

type CabinaTool = (typeof CABINA_TOOLS)[number]
type Propiedades = Record<string, Record<string, unknown>>
/** Una herramienta con otra descripción y otras propiedades (quitar campos, reemplazar enum o descripción de un campo). */
function variante(t: CabinaTool, description: string, cambios: Record<string, Record<string, unknown> | null> = {}): CabinaTool {
  const props: Propiedades = { ...(t.inputSchema.properties as unknown as Propiedades) }
  for (const [k, v] of Object.entries(cambios)) { if (v === null) delete props[k]; else props[k] = { ...props[k], ...v } }
  return { ...t, description, inputSchema: { ...t.inputSchema, properties: props } } as unknown as CabinaTool
}

/** Las herramientas de la Cabina en la edición cliente, ya con sus textos. */
export function cabinaToolsCliente(quien = dueno()): CabinaTool[] {
  const tx = textosCabinaCliente(quien)
  const visibles = CABINA_TOOLS.filter(t => !CABINA_SUBAGENTES.has(t.name) && !CABINA_SOLO_ORIGINAL.has(t.name))
  return visibles.map(t => {
    switch (t.name) {
      case 'mostrar': return variante(t, tx.mostrar, { vista: { enum: [...VISTAS_CLIENTE] }, seccion: null, quien: null, agenteId: null, modo: null, repetir: null, telefono: null })
      case 'abrir': return variante(t, tx.abrir, { destino: { enum: [...DESTINOS_CLIENTE] }, alcance: null, fecha: null })
      case 'panel': return variante(t, tx.panel)
      case 'archivero': return variante(t, tx.archivero)
      case 'despertador': return variante(t, tx.despertador)
      case 'ayuda': return variante(t, tx.ayuda)
      default: return t
    }
  })
}
export const SIN_CAMPANA_CLIENTE = 'La campana de avisos no está disponible en esta edición.'
/**
 * Lo que recibe Levy si en cliente llama a `delegar` (oculto, pero un modelo puede intentarlo por costumbre). Con los
 * subagentes encendidos lo manda a `Agent`; solo si la persona los apagó (`ARBRAIN_SUBAGENTES=0`) dice que no hay.
 */
export const mensajeSinSubagentes = (env: NodeJS.ProcessEnv = process.env) => subagentesClienteEncendidos(env)
  ? 'En esta edición de Arbrain delegas con la herramienta Agent (subagent_type general-purpose, Explore o Plan): el subagente corre dentro de esta conversación, bajo la misma guardia y el mismo modo de permisos, y se ve en Taller › Agentes. delegar, retomar, detener, interactivo y cerrar no existen aquí.'
  : 'Los subagentes están apagados en esta instalación de Arbrain (ARBRAIN_SUBAGENTES=0). Haz el trabajo tú en esta conversación.'
