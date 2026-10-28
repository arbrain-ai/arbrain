/**
 * Aviso de subagentes (chat vivo, 3 oct 2026).
 *
 * Un encargo largo va al motor con `delegar`: sobrevive a reinicios, pero Levy no se enteraba de que
 * terminó hasta que Daniel preguntaba. Ahora `delegar` anota en el registro la conversación que lo
 * lanzó (`avisarA`) y el agent-server, que vive por launchd, revisa cada pocos segundos a esos
 * subagentes en el motor. Cuando uno queda quieto tras responder (o su proceso muere), deja un aviso
 * que vence YA en la tabla de despertadores: se dispara por el MISMO camino que un despertador
 * (turno normal en el journal → corredor → sesión retomada → respuesta en vivo) y cuenta para su tope
 * de disparos por hora.
 *
 * Preguntas al coordinador (5 oct 2026, Daniel: «un subagente no debería esperar instrucciones mías sino del
 * agente coordinador»). Cuando un subagente lanzado por Levy se detiene en una pregunta (su caja con «…?»,
 * un AskUserQuestion o un permiso), el aviso va PRIMERO a la conversación que lo lanzó, con la pregunta
 * textual: Levy la contesta con retomar o, si necesita a Daniel, se la pregunta en el chat. «Espera tu
 * decisión» (y la campana) solo se encienden si nadie la atiende en ARBRAIN_PREGUNTA_ESCALA_MIN (10 por
 * defecto) o si su conversación de origen ya no existe.
 *
 * Sin pantalla (6 oct 2026): el subagente es un proceso propio (`./sin-pantalla.ts`), no una PTY del motor. Su fin
 * no se adivina por «30 s quieto»: es su proceso saliendo (marca de salida en su bitácora, con su código). Se observa
 * aunque el motor esté apagado, y al terminar un turno con mensajes en cola, la cola se entrega en vez de avisar.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { VEREDICTO_EN_PALABRAS, extraerDoD, juezActivo, juzgar, type Juicio } from './juez.js'
import { anotar, estadoDe, leerRegistro, preguntaPendiente, rescatarHuerfanos, dialogoAbierto, tachar, type PreguntaAbierta, type Subagente, type SubagenteOrigen } from './cuerpo.js'

export interface Observacion {
  /** ¿Sigue su terminal en el motor? */
  vivo: boolean
  trabajando: boolean
  /** ms de la última actividad de su conversación (transcript). */
  ultimaActividad: number | null
  ultimaRespuesta: string | null
  pregunta: string | null
  /** Error con el que cerró su último mensaje (API, límite, crash del CLI), si lo hubo. */
  error?: string | null
  /** Detenido en un diálogo (AskUserQuestion, permiso): no avanza hasta que alguien elige. */
  dialogo?: { pregunta: string; opciones: string[] } | null
  /** Sin pantalla: por qué terminó, en palabras (salió con código N), y tokens medidos de su bitácora. */
  motivo?: string
  tokens?: number | null
  /** Sin pantalla: número del turno observado (el juez lo anota con su veredicto). */
  turno?: number
}

/** ¿Lo vigila este aviso? Los del motor (PTY) y los sin pantalla (proceso propio). */
export const vigilable = (s: Subagente) => !s.cerrado && (!!s.motor || s.modo === 'sin-pantalla')

export type EstadoFinal = 'terminó' | 'falló' | 'se cerró'

/** Quieto este tiempo tras su último evento = terminó su turno (no una pausa entre herramientas). */
export const QUIETO_MS = () => Number(process.env.ARBRAIN_AVISO_SUBAGENTE_QUIETO_MS) || 30_000

export type Decision = { avisar: false } | { avisar: true; texto: string; cambio: Partial<Subagente> }

/** Regla pura: ¿hay que despertar a la conversación que lanzó a este subagente? */
export function decidirAviso(sub: Subagente, obs: Observacion, ahora: number, quietoMs = QUIETO_MS()): Decision {
  const no = { avisar: false } as const
  if (!sub.avisarA || !vigilable(sub)) return no
  // sin pantalla, «terminó» es un hecho (su proceso salió), no una espera: no hay ventana de quietud
  if (sub.modo === 'sin-pantalla') quietoMs = 0
  const cabecera = (estado: EstadoFinal, por: string) => `Subagente «${sub.nombre}» (agenteId ${sub.id}, ${sub.harness}) · estado: ${estado.toUpperCase()} · ${por}.`
  const encargo = `Encargo: «${sub.encargo.length > 300 ? sub.encargo.slice(0, 299) + '…' : sub.encargo}» · cwd ${sub.cwd}.`
  if (!obs.vivo) {
    if (sub.avisadoFin) return no
    // recién nacido: su CLI aún no toma el primer plano de la PTY (el shell lo precede un instante)
    if (sub.entrega === 'pendiente' && ahora - Date.parse(sub.creado) < 3 * 60_000) return no
    const fallo = sub.entrega === 'falló'
    return { avisar: true, cambio: { avisadoFin: new Date(ahora).toISOString() }, texto: [
      cabecera(fallo ? 'falló' : 'se cerró', fallo ? `el encargo nunca se confirmó (${sub.entregaNota ?? 'sin nota'}) y su proceso ya no está en el motor` : 'su proceso ya no está en el motor (salió o lo cerraron fuera del chat)'), encargo,
      'Lee su conversación en disco o mira la vista «trabajos» y ciérralo con cerrar para que no ocupe el tope.',
    ].join('\n') }
  }
  if (sub.entrega !== 'entregado' || obs.trabajando || obs.ultimaActividad == null || !obs.ultimaRespuesta) return no
  if (ahora - obs.ultimaActividad < quietoMs) return no
  if (sub.avisadoHasta != null && obs.ultimaActividad <= sub.avisadoHasta) return no
  const respuesta = tachar(obs.ultimaRespuesta.trim())
  const estado: EstadoFinal = obs.error ? 'falló' : 'terminó'
  const por = obs.error ? `su último turno cerró con error: ${tachar(obs.error).slice(0, 200)}${obs.motivo ? ` (${obs.motivo})` : ''}` : obs.motivo ? `${obs.motivo}${obs.pregunta ? ', con una pregunta' : ''}` : obs.pregunta ? 'quieto en su caja con una pregunta' : 'quieto en su caja tras responder'
  return { avisar: true, cambio: { avisadoHasta: obs.ultimaActividad }, texto: [
    cabecera(estado, por), encargo,
    obs.pregunta ? `Dejó una pregunta para ti (no para ${DUENO}): «${tachar(obs.pregunta)}». Si puedes decidirlo, respóndela con retomar; si necesitas a ${DUENO}, pregúntaselo aquí en el chat y luego contesta con retomar. Si nadie la atiende en ${Math.round(ESCALA_MS() / 60_000)} min, sube a ${DUENO}.` : null,
    `Su última respuesta${respuesta.length > 1500 ? ' (recortada)' : ''}:`,
    respuesta.length > 1500 ? respuesta.slice(0, 1500) + '…' : respuesta,
    'Si ya cumplió, ciérralo con cerrar; si falta algo, retomar. Puedes mostrarlo con mostrar {vista:"trabajos", agenteId}.',
  ].filter(Boolean).join('\n') }
}

/** Minutos que Levy tiene para atender la pregunta de un subagente antes de que suba a Daniel. */
export const ESCALA_MS = () => (Number(process.env.ARBRAIN_PREGUNTA_ESCALA_MIN) || 10) * 60_000

/** La pregunta abierta que se ve AHORA, o null. Un diálogo manda sobre la última frase con «?». */
export function preguntaActual(obs: Observacion): Omit<PreguntaAbierta, 'desde'> | null {
  if (!obs.vivo) return null
  if (obs.dialogo) {
    const texto = `${obs.dialogo.pregunta} · Opciones: ${obs.dialogo.opciones.map((o, i) => `${i + 1}. ${o}`).join(' · ')}`
    return { tipo: 'dialogo', texto: tachar(texto).slice(0, 900), firma: `dialogo:${obs.dialogo.pregunta}:${obs.dialogo.opciones.join('|')}`.slice(0, 300) }
  }
  if (obs.pregunta && !obs.trabajando) return { tipo: 'pregunta', texto: tachar(obs.pregunta).slice(0, 900), firma: `pregunta:${obs.pregunta}`.slice(0, 300) }
  return null
}

export type DecisionPregunta = { cambio?: Partial<Subagente>; coordinador?: string; dueno?: { motivo: string; texto: string } }

/**
 * Regla pura de la ruta de preguntas. La pregunta de caja («¿uso A o B?») ya viaja en el aviso de fin de turno
 * (decidirAviso); aquí se avisa el DIÁLOGO (el agente no queda «quieto tras responder»: queda detenido) y se
 * decide cuándo sube a Daniel. Una pregunta que desaparece (Levy contestó) borra la marca y la escalada.
 */
export function decidirPregunta(sub: Subagente, obs: Observacion, ahora: number, o: { origenExiste: boolean; escalaMs?: number }): DecisionPregunta {
  if (!vigilable(sub)) return {}
  const actual = preguntaActual(obs)
  if (!actual) return sub.pregunta || sub.escalado ? { cambio: { pregunta: undefined, escalado: undefined, escaladoPor: undefined } } : {}
  const escalaMs = o.escalaMs ?? ESCALA_MS()
  const escalaMin = escalaMs < 60_000 ? `${Math.round(escalaMs / 1000)} s` : `${Math.round(escalaMs / 60_000)} min`
  const quien = `Subagente «${sub.nombre}» (agenteId ${sub.id}, ${sub.harness})`
  const paraDueno = (motivo: string) => ({ motivo, texto: `${quien} pregunta: «${actual.texto}». ${motivo}. Contéstale desde el Taller o pídele a Levy que lo haga.` })
  if (sub.pregunta?.firma !== actual.firma) {
    const pregunta: PreguntaAbierta = { ...actual, desde: ahora }
    const sinCoordinador = !sub.avisarA ? 'No se sabe qué conversación de Levy lo lanzó' : !o.origenExiste ? 'La conversación de Levy que lo lanzó ya no existe' : null
    if (sinCoordinador) return { cambio: { pregunta, escalado: new Date(ahora).toISOString(), escaladoPor: sinCoordinador }, dueno: paraDueno(sinCoordinador) }
    // La pregunta de caja viaja en el aviso de fin de turno; solo si ese aviso ya no saldrá (actividad ya avisada,
    // p. ej. un rescatado) se avisa aquí.
    const yaAvisada = actual.tipo === 'pregunta' && sub.avisadoHasta != null && obs.ultimaActividad != null && obs.ultimaActividad <= sub.avisadoHasta
    const coordinador = actual.tipo === 'dialogo' || yaAvisada ? [
      actual.tipo === 'dialogo' ? `${quien} · estado: DETENIDO EN UN DIÁLOGO · espera una elección para seguir.` : `${quien} · estado: QUIETO CON UNA PREGUNTA PARA TI.`,
      `Encargo: «${sub.encargo.length > 300 ? sub.encargo.slice(0, 299) + '…' : sub.encargo}» · cwd ${sub.cwd}.`,
      `Pregunta textual (es para ti, no para ${DUENO}): «${actual.texto}».`,
      `${actual.tipo === 'dialogo' ? `Si puedes decidirlo, contesta con retomar {agenteId:${sub.id}, texto:"<número de la opción>"} (un texto libre cierra el diálogo y le llega como mensaje).` : `Si puedes decidirlo, contesta con retomar {agenteId:${sub.id}, texto:"…"}.`} Si necesitas a ${DUENO}, pregúntaselo aquí en el chat y luego contesta con retomar. Si nadie la atiende en ${escalaMin}, sube a ${DUENO} como «Espera tu decisión».`,
    ].join('\n') : undefined
    return { cambio: { pregunta, escalado: undefined, escaladoPor: undefined }, ...(coordinador ? { coordinador } : {}) }
  }
  if (!sub.escalado && ahora - sub.pregunta.desde >= (o.escalaMs ?? ESCALA_MS())) {
    const motivo = `Levy no la atendió en ${escalaMin}`
    return { cambio: { escalado: new Date(ahora).toISOString(), escaladoPor: motivo }, dueno: paraDueno(motivo) }
  }
  return {}
}

export interface PuertoAviso {
  registro(): Promise<Subagente[]>
  observar(sub: Subagente): Promise<Observacion | null>
  anotar(sub: Subagente, cambio: Partial<Subagente>): Promise<void>
  avisar(origen: SubagenteOrigen, texto: string): void
  /** Sin pantalla: entrega los mensajes encolados como un turno nuevo (el proceso ya salió). */
  entregarCola?(sub: Subagente): Promise<boolean>
  /** ¿Sigue existiendo la conversación que lo lanzó? Sin el dato se asume que sí (no se molesta a Daniel por duda). */
  origenExiste?(origen: SubagenteOrigen): boolean
  /** Sube la pregunta a Daniel (campana). Sin puerto, solo queda la marca en el registro («Espera tu decisión»). */
  escalar?(sub: Subagente, texto: string): Promise<void> | void
  /** Juez separado (27 oct 2026): veredicto del turno que terminó contra su Definición de Terminado. null = sin juez. */
  juzgar?(sub: Subagente, obs: Observacion): Promise<Juicio | null>
}

/** ¿Este aviso es el cierre de un turno que el juez debe revisar? (terminó bien, sin pregunta abierta). */
export const pideJuicio = (obs: Observacion) => obs.vivo && !obs.trabajando && !obs.error && !obs.pregunta && !!obs.ultimaRespuesta

/** La línea del veredicto para el aviso a Levy. */
export function lineaJuicio(j: Juicio): string {
  const v = VEREDICTO_EN_PALABRAS[j.veredicto].toUpperCase()
  if (j.veredicto === 'sin-dod') return `Juez separado: SIN DoD · el encargo no traía Definición de Terminado; verifícalo tú antes de reportarlo como hecho.`
  const siguiente = j.veredicto === 'cumple' ? 'Puedes reportarlo con su evidencia.' : j.veredicto === 'no-cumple' ? 'No lo reportes como hecho: retomar con lo que falta.' : 'Pídele la evidencia (comando y salida) con retomar antes de reportarlo.'
  return `Juez separado (${j.modelo ?? 'otro modelo'}, sin el contexto del agente): ${v} · ${j.razon} ${siguiente}`
}

/** Una pasada: devuelve cuántos avisos dejó. El aviso se escribe ANTES de marcar el registro: si
 *  el proceso muere entre medias, se repite un aviso (mejor que perderlo). */
export async function revisarSubagentes(p: PuertoAviso, ahora = Date.now()): Promise<number> {
  let n = 0
  for (const sub of await p.registro()) {
    if (!vigilable(sub)) continue
    const obs = await p.observar(sub).catch(() => null)
    if (!obs) continue
    if (sub.modo === 'sin-pantalla') {
      if (obs.tokens != null && obs.tokens !== sub.tokens) { await p.anotar(sub, { tokens: obs.tokens }); sub.tokens = obs.tokens }
      // Terminó su turno con mensajes esperando: se le entregan (turno nuevo) en vez de despertar a Levy por un
      // resultado intermedio; el aviso llegará al terminar ese turno.
      if (!obs.trabajando && sub.cola?.length && p.entregarCola && await p.entregarCola(sub).catch(() => false)) {
        if (obs.ultimaActividad != null) await p.anotar(sub, { avisadoHasta: obs.ultimaActividad })
        continue
      }
    }
    const q = decidirPregunta(sub, obs, ahora, { origenExiste: !sub.avisarA || (p.origenExiste?.(sub.avisarA) ?? true) })
    if (q.coordinador && sub.avisarA) { p.avisar(sub.avisarA, q.coordinador); n++ }
    if (q.dueno) await Promise.resolve(p.escalar?.(sub, q.dueno.texto)).catch(() => {})
    if (q.cambio) { await p.anotar(sub, q.cambio); Object.assign(sub, q.cambio) }
    if (!sub.avisarA) continue
    const d = decidirAviso(sub, obs, ahora)
    if (!d.avisar) continue
    // El juez nunca bloquea el cierre: si falla o tarda, el aviso sale sin veredicto.
    const juicio = p.juzgar && pideJuicio(obs) ? await p.juzgar(sub, obs).catch(() => null) : null
    p.avisar(sub.avisarA, juicio ? `${d.texto}\n${lineaJuicio(juicio)}` : d.texto)
    await p.anotar(sub, juicio ? { ...d.cambio, juicio } : d.cambio)
    n++
  }
  return n
}

/** El puerto real: registro de la Cabina + motor de Arbrain. Sin motor, no observa nada. */
/** Terminales ya revisadas por el rescate en la vida de este proceso (la búsqueda en el diario no se repite). */
const rescateVisto = new Set<string>()

export async function puertoMotor(avisar: PuertoAviso['avisar'], extra: Pick<PuertoAviso, 'origenExiste' | 'escalar'> & { alRescatar?: (s: Subagente[]) => void } = {}): Promise<PuertoAviso> {
  const [{ motor }, { leer }] = await Promise.all([import('../motor/cliente.js'), import('../motor/lector.js')])
  let terms: Awaited<ReturnType<typeof motor.info>>['terms'] | null = null
  return {
    ...(extra.origenExiste ? { origenExiste: extra.origenExiste } : {}),
    ...(extra.escalar ? { escalar: extra.escalar } : {}),
    registro: async () => {
      terms = await motor.info().then(r => r.terms, () => null)
      if (terms) {
        // Huérfanos (5 oct 2026): un subagente vivo que se perdió del registro vuelve a ser de Levy.
        const rescatados = await rescatarHuerfanos(terms, rescateVisto).catch(() => [])
        if (rescatados.length) extra.alRescatar?.(rescatados)
      }
      // sin motor, los del motor no se pueden observar; los sin pantalla sí (no dependen de él)
      return (await leerRegistro()).filter(s => vigilable(s) && (s.modo === 'sin-pantalla' || !!terms))
    },
    entregarCola: async sub => (await import('./sin-pantalla.js')).entregarCola(sub.id),
    // Juez separado: la DoD guardada al delegar, la del encargo o la del primer turno de su bitácora (encargo completo).
    ...(juezActivo() ? { juzgar: async (sub: Subagente, obs: Observacion) => {
      let dod = sub.dod ?? extraerDoD(sub.encargo)
      if (!dod && sub.modo === 'sin-pantalla') dod = extraerDoD((await (await import('./sin-pantalla.js')).bitacora(sub)).b.turnos[0]?.texto)
      return juzgar({ dod, informe: tachar(obs.ultimaRespuesta ?? ''), ...(obs.turno != null ? { turno: obs.turno } : {}) })
    } } : {}),
    observar: async sub => {
      if (sub.modo === 'sin-pantalla') return (await import('./sin-pantalla.js')).observarSinPantalla(sub)
      const t = terms?.find(x => x.id === sub.id)
      // id + pid: un motor nuevo reusa ids; sin su pid, ese subagente ya no existe
      if (!t || (sub.pid != null && t.pid !== sub.pid)) return { vivo: false, trabajando: false, ultimaActividad: null, ultimaRespuesta: null, pregunta: null }
      // la PTY sigue pero su CLI ya salió (queda el shell): eso también es «se cerró»
      if (!t.fg || !/claude|codex|node/i.test(t.fg.name)) return { vivo: false, trabajando: false, ultimaActividad: null, ultimaRespuesta: null, pregunta: null }
      const pantalla = await motor.screen(sub.id, 40).catch(() => '')
      const conv = t.fg ? await leer(t.fg).catch(() => null) : null
      const turno = conv?.parsed.turn
      const ultima = [...(conv?.parsed.msgs ?? [])].reverse().find(m => m.role === 'assistant' && !m.sys)
      const texto = ultima ? (ultima.parts?.filter(x => x.type === 'text').map(x => (x as { text: string }).text).join('\n') || ultima.text) : null
      return {
        vivo: true,
        trabajando: turno?.state === 'working' || estadoDe(t.fg?.name ?? '', pantalla) === 'trabajando',
        ultimaActividad: turno?.lastEventAt ?? null,
        ultimaRespuesta: texto?.trim() ? texto : null,
        pregunta: preguntaPendiente(sub.harness, pantalla),
        dialogo: dialogoAbierto(pantalla),
        error: ultima?.error ?? null,
      }
    },
    anotar: (sub, cambio) => anotar(sub.id, sub.pid, cambio),
    avisar,
  }
}

/**
 * La pregunta sube a Daniel: «Espera tu decisión» ya se enciende por la marca `escalado` del registro; aquí
 * además queda en su campana (política única de avisos, kind agente, sin sonido salvo ARBRAIN_ESCALADA_PUSH=1).
 * ARBRAIN_ESCALADA_USUARIO = pruebas contra QA, nunca Daniel.
 */
export async function escalarACampana(sub: Subagente, texto: string): Promise<void> {
  const { readEnvFile } = await import('../env.js')
  const env = readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_URL'])
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? env.OPENCLAW_GATEWAY_TOKEN, mc = process.env.MC_URL ?? env.MC_URL ?? 'http://127.0.0.1:3300'
  if (!token) return
  const usuario = process.env.ARBRAIN_ESCALADA_USUARIO
  await fetch(`${mc}/api/notifications/send`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ title: `Un subagente espera tu decisión · ${sub.nombre}`.slice(0, 120), body: texto.slice(0, 600), url: '/', tag: `subagente-${sub.id}`, source: 'cabina:subagente', kind: 'agente', quiet: process.env.ARBRAIN_ESCALADA_PUSH !== '1', ...(usuario ? { userId: usuario } : {}) }),
  })
}
