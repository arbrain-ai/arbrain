/**
 * Inyección a mitad de turno (7 oct 2026). Daniel le escribe a Levy mientras trabaja y el mensaje entra
 * al turno EN CURSO (como Claude Code), sin detenerlo ni esperar a que termine. Decisiones firmadas:
 *  1. Enter con Levy trabajando = inyectar. «Enviar ya» sigue siendo detener y mandar. La fila del
 *     dispositivo queda para sin red o cuando la inyección no aplica (Codex, imagen/audio, sin turno vivo).
 *  2. El mensaje se ve DENTRO de la actividad del turno, en el punto donde el motor lo tomó,
 *     con su estado «entrando… / leído».
 *  3. Stop con mensajes aún no leídos: vuelven a la fila en pausa. Nunca se descartan.
 *  4. Codex después.
 * Funciones puras: el hook y el panel las usan; las pruebas viven en tests/chat/inyecciones.test.ts.
 */
import type { ChatMessage } from '../hooks/useChat'

/** enviando = el cliente lo mandó; entrando = el host lo registró contra el turno; leido = el motor lo tomó;
 *  en_fila = el host lo dejó como turno normal (no había turno vivo que alcanzar). */
export type EstadoInyeccion = 'enviando' | 'entrando' | 'leido' | 'en_fila'
export interface NotaInyectada {
  id: string
  texto: string
  estado: EstadoInyeccion
  /** Última herramienta del turno cuando el motor lo tomó (el «Razonamiento» la ubica entre sus pasos). */
  afterToolId?: string | null
  at: number
  /** Dónde va en el TEXTO de la respuesta (1 nov 2026): cuánto llevaba escrito Levy cuando el motor la tomó. Sin esto
   *  la nota se pintaba arriba de toda la respuesta, aun encima de lo que Levy ya había escrito antes de leerla. */
  trasTexto?: number | null
  /** Los últimos caracteres de ese texto: ubican el punto aunque la respuesta final cambie separadores o espacios. */
  ancla?: string | null
  /** Llegó a mitad de un tramo de texto que Levy sigue escribiendo: va al final de ese tramo, que aún no cierra. */
  abierta?: boolean
}

/** Solo las claves con valor: una nota sin lugar guardado se ve igual que antes. */
function conLugar<T extends object>(base: T, lugar: { trasTexto?: number | null; ancla?: string | null; abierta?: boolean }): T {
  return {
    ...base,
    ...(typeof lugar.trasTexto === 'number' ? { trasTexto: lugar.trasTexto } : {}),
    ...(typeof lugar.ancla === 'string' ? { ancla: lugar.ancla } : {}),
    ...(typeof lugar.abierta === 'boolean' ? { abierta: lugar.abierta } : {}),
  }
}

/** Lo que el host manda en `resume_meta.inyectados`, `user_injected` e `injections_settled`. */
export interface InyeccionHost { injectionId: string; message: string; status: 'pending' | 'sent' | 'requeued' | 'unread'; afterToolId: string | null; at: number; trasTexto?: number | null; ancla?: string | null; abierta?: boolean
  /** Con fotos (1 nov 2026, opción B): no entra al turno; espera en el servidor y se pinta en la fila, no como nota. */
  imageUrl?: string }

const ORDEN: Record<EstadoInyeccion, number> = { enviando: 0, entrando: 1, en_fila: 1, leido: 2 }

/** Une notas por id sin retroceder de estado (un replay viejo no deshace «leído»). */
export function unirNotas(actuales: NotaInyectada[] | undefined, nuevas: NotaInyectada[]): NotaInyectada[] {
  const porId = new Map((actuales ?? []).map(n => [n.id, n]))
  for (const n of nuevas) {
    const previa = porId.get(n.id)
    if (!previa) { porId.set(n.id, n); continue }
    const gana = ORDEN[n.estado] >= ORDEN[previa.estado] ? n : previa
    // Un lugar ya cerrado no se reabre con un replay; si ninguno cerró, gana el más nuevo.
    const cerrada = [previa, n].find(x => typeof x.trasTexto === 'number' && !x.abierta)
    const lugar = cerrada ? { trasTexto: cerrada.trasTexto, ancla: cerrada.ancla, abierta: false }
      : { trasTexto: n.trasTexto ?? previa.trasTexto, ancla: n.ancla ?? previa.ancla, abierta: n.abierta ?? previa.abierta }
    const { trasTexto: _t, ancla: _a, abierta: _b, ...resto } = { ...previa, ...gana }
    porId.set(n.id, conLugar({ ...resto, afterToolId: gana.afterToolId ?? previa.afterToolId ?? null }, lugar))
  }
  return [...porId.values()].sort((a, b) => a.at - b.at)
}

/** Del host a nota: `unread` y `requeued` no se pintan dentro del turno (van a la fila o a su propio turno), ni lo
 *  que lleva fotos: eso espera en la fila del servidor y se ve en la caja de la fila, editable (lib/fila-servidor). */
export function notaDelHost(i: InyeccionHost): NotaInyectada | null {
  if (i.status === 'unread' || i.status === 'requeued' || i.imageUrl) return null
  const nota: NotaInyectada = { id: i.injectionId, texto: i.message, estado: i.status === 'sent' ? 'leido' : 'entrando', afterToolId: i.afterToolId, at: i.at }
  return conLugar(nota, i)
}

/**
 * El lugar de cada nota en el texto (1 nov 2026, captura de las 08:13: el mensaje del dueño quedó ARRIBA de la
 * respuesta que Levy ya estaba escribiendo). El motor toma lo inyectado en su siguiente llamada al modelo: lo que
 * Levy escribe en el tramo en curso va ANTES de la nota, lo que escribe después de tomarla va DESPUÉS.
 * Abre: `user_injected` (con el largo del texto en ese instante). Mientras siga abierta, el texto que llega la
 * empuja al final del tramo. Cierra: un resultado de herramienta (la siguiente llamada lo lleva), un `init` del
 * motor (arrancó otro paso con el mensaje) o el fin del turno. El servidor aplica la misma regla al guardar
 * (`server/src/chat-runtime/inyecciones.ts · posicionesEnTexto`).
 */
export const CIERRA_NOTAS: ReadonlySet<string> = new Set(['tool_result', 'init', 'result', 'terminal'])
export const LARGO_ANCLA = 60
export function anclaDe(texto: string, hasta = texto.length): string { return texto.slice(Math.max(0, hasta - LARGO_ANCLA), hasta) }

/** Cierra las notas abiertas en el largo actual del texto. Devuelve la misma lista si no había ninguna abierta. */
export function cerrarNotas(notas: NotaInyectada[], texto: string): NotaInyectada[] {
  if (!notas.some(n => n.abierta)) return notas
  return notas.map(n => n.abierta ? { ...n, trasTexto: texto.length, ancla: anclaDe(texto), abierta: false } : n)
}

/** El punto del texto final que corresponde a `trasTexto` (contado sobre el texto en vivo). La respuesta final puede
 *  traer separadores entre tramos que el vivo no tenía: manda el ancla; sin ella, el número; y nunca parte una línea. */
export function ubicarEnTexto(texto: string, trasTexto: number, ancla?: string | null): number {
  const buscar = (a: string) => {
    let mejor = -1, distancia = Infinity
    for (let i = texto.indexOf(a); i !== -1; i = texto.indexOf(a, i + 1)) {
      const fin = i + a.length, d = Math.abs(fin - trasTexto)
      if (d < distancia) { mejor = fin; distancia = d }
    }
    return mejor
  }
  let pos = -1
  if (ancla) pos = buscar(ancla)
  if (pos < 0 && ancla?.trim()) pos = buscar(ancla.trim())
  if (pos >= 0) return pos
  pos = Math.max(0, Math.min(trasTexto, texto.length))
  // A mitad de una línea (sin ancla que lo confirme): al final de esa línea, nunca antes de lo que ya estaba escrito.
  if (pos > 0 && pos < texto.length && texto[pos] !== '\n' && texto[pos - 1] !== '\n') {
    const fin = texto.indexOf('\n', pos)
    pos = fin === -1 ? texto.length : fin
  }
  return pos
}

const sinRenglonesEnBorde = (t: string) => t.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '')

/**
 * La respuesta partida en el orden real: tramo de texto → notas que el motor tomó ahí → siguiente tramo.
 * `arriba`: notas guardadas antes del 1 nov, sin lugar (se pintan como antes, sobre la respuesta).
 * Con el turno vivo, lo que aún no tiene lugar (enviando, entrando, abierta) va al final de lo escrito.
 */
export function partirEnNotas(texto: string, notas: NotaInyectada[] | undefined, vivo: boolean): { arriba: NotaInyectada[]; tramos: Array<{ texto: string; notas: NotaInyectada[] }> } {
  const arriba: NotaInyectada[] = [], alFinal: NotaInyectada[] = []
  const ubicadas: Array<{ pos: number; nota: NotaInyectada }> = []
  for (const n of notas ?? []) {
    if (n.abierta || (typeof n.trasTexto !== 'number' && vivo)) alFinal.push(n)
    else if (typeof n.trasTexto !== 'number') arriba.push(n)
    else ubicadas.push({ pos: ubicarEnTexto(texto, n.trasTexto, n.ancla), nota: n })
  }
  ubicadas.sort((a, b) => a.pos - b.pos || a.nota.at - b.nota.at)
  const tramos: Array<{ texto: string; notas: NotaInyectada[] }> = []
  let desde = 0
  for (const { pos, nota } of ubicadas) {
    const ultimo = tramos.at(-1)
    if (ultimo && pos === desde && ultimo.notas.length) { ultimo.notas.push(nota); continue }
    tramos.push({ texto: sinRenglonesEnBorde(texto.slice(desde, pos)), notas: [nota] })
    desde = pos
  }
  tramos.push({ texto: sinRenglonesEnBorde(texto.slice(desde)), notas: alFinal })
  return { arriba, tramos }
}

/** Respuesta de POST /api/chat/stream con `inyectar: true`. `estado`: cómo quedó la inyección en el host (pending, sent,
 *  unread…); `status`/`codigo`: el HTTP y el código del rechazo, para distinguir lo que vale reintentar. */
export type DesenlaceEnvio = { tipo: 'inyectado'; into: string; estado?: string } | { tipo: 'en_fila_servidor'; turnId: string } | { tipo: 'rechazado'; motivo: string; status?: number; codigo?: string }
export function leerDesenlace(status: number, body: unknown): DesenlaceEnvio {
  const b = (body ?? {}) as { accepted?: unknown; injected?: unknown; into?: unknown; turnId?: unknown; error?: unknown; status?: unknown; code?: unknown }
  if (status === 202 && b.accepted === true && b.injected === true && typeof b.into === 'string') return { tipo: 'inyectado', into: b.into, ...(typeof b.status === 'string' ? { estado: b.status } : {}) }
  if (status === 202 && b.accepted === true && typeof b.turnId === 'string') return { tipo: 'en_fila_servidor', turnId: b.turnId }
  return { tipo: 'rechazado', motivo: typeof b.error === 'string' ? b.error : `HTTP ${status}`, status, ...(typeof b.code === 'string' ? { codigo: b.code } : {}) }
}

/** ¿Este envío puede intentar entrar al turno en curso? Si no, va a la fila del dispositivo como antes. */
export function puedeInyectar(e: { enLinea: boolean; motorCodex: boolean; conAdjuntos: boolean; esComando: boolean; editando: boolean; turnoVivo: boolean; conversacion: string | null | undefined }): boolean {
  return e.enLinea && !e.motorCodex && !e.conAdjuntos && !e.esComando && !e.editando && e.turnoVivo && !!e.conversacion
}

/** Al terminar el turno, lo que quedó «entrando» o «en fila» lo convirtió el host en turno normal:
 *  sale del turno terminado (lo pinta su propio turno al reengancharse). Lo leído se queda. */
export function trasTerminar(notas: NotaInyectada[] | undefined): { quedan: NotaInyectada[]; aSuTurno: NotaInyectada[] } {
  const quedan: NotaInyectada[] = [], aSuTurno: NotaInyectada[] = []
  for (const n of notas ?? []) (n.estado === 'leido' ? quedan : aSuTurno).push(n)
  return { quedan, aSuTurno }
}

/**
 * Historial recargado (Supabase): las filas de Daniel con `metadata.injectedInto` se pintan como notas
 * dentro de la respuesta de ese turno, no como burbujas sueltas. Así la vista recargada coincide con la
 * vista en vivo y no hay duplicados (la nota en memoria y la fila guardada comparten el mismo id lógico:
 * el turnId de la inyección). Sin la respuesta del turno a la vista, la fila queda como burbuja normal.
 */
export function plegarInyectadas(mensajes: ChatMessage[]): ChatMessage[] {
  const respuestas = new Map<string, number>()
  mensajes.forEach((m, i) => { if (m.role === 'assistant' && m.metadata?.turnId) respuestas.set(m.metadata.turnId, i) })
  const notas = new Map<number, NotaInyectada[]>()
  const fuera = new Set<number>()
  mensajes.forEach((m, i) => {
    const into = (m.metadata as { injectedInto?: unknown } | null | undefined)?.injectedInto
    if (m.role !== 'user' || typeof into !== 'string') return
    const destino = respuestas.get(into)
    if (destino === undefined) return
    fuera.add(i)
    const lista = notas.get(destino) ?? []
    const meta = m.metadata as { afterToolId?: unknown; trasTexto?: unknown; ancla?: unknown }
    const afterToolId = meta.afterToolId
    lista.push(conLugar({ id: m.metadata?.turnId ?? m.id, texto: m.content, estado: 'leido' as const, afterToolId: typeof afterToolId === 'string' ? afterToolId : null, at: m.timestamp.getTime() }, {
      trasTexto: typeof meta.trasTexto === 'number' && Number.isFinite(meta.trasTexto) && meta.trasTexto >= 0 ? meta.trasTexto : null,
      ancla: typeof meta.ancla === 'string' ? meta.ancla : null,
    }))
    notas.set(destino, lista)
  })
  if (!fuera.size) return mensajes
  const out: ChatMessage[] = []
  mensajes.forEach((m, i) => {
    if (fuera.has(i)) return
    const extra = notas.get(i)
    out.push(extra ? { ...m, inyectados: unirNotas(m.inyectados, extra) } : m)
  })
  return out
}

/** Dónde va cada nota entre las pills: tras su herramienta si está a la vista; si no, al final de la actividad. */
export function ubicarNotas(notas: NotaInyectada[] | undefined, herramientasVisibles: string[]): { tras: Map<string, NotaInyectada[]>; alFinal: NotaInyectada[] } {
  const visibles = new Set(herramientasVisibles)
  const tras = new Map<string, NotaInyectada[]>()
  const alFinal: NotaInyectada[] = []
  for (const n of notas ?? []) {
    if (n.afterToolId && visibles.has(n.afterToolId)) tras.set(n.afterToolId, [...(tras.get(n.afterToolId) ?? []), n])
    else alFinal.push(n)
  }
  return { tras, alFinal }
}

export const ETIQUETA_ESTADO: Record<EstadoInyeccion, string> = {
  enviando: 'enviando…',
  entrando: 'entrando…',
  leido: 'leído',
  en_fila: 'en fila · sale cuando Levy termine',
}

/** Lo que la nota dice A LA VISTA (1 nov 2026, el dueño: «esta ui de leído no me encanta… sé que lo lees»). Leído no
 *  se escribe: que Levy siga y lo conteste ya lo dice. Solo se ve lo que aún pide atención (sale, entra, espera). */
export function etiquetaVisible(estado: EstadoInyeccion): string | null {
  return estado === 'leido' ? null : ETIQUETA_ESTADO[estado]
}

/** Filas `user` que el webhook de completion guarda por cada inyección leída, en orden de llegada al motor.
 *  Su created_at es ese instante: quedan entre el mensaje que abrió el turno y la respuesta. */
export function filasInyectadas(lista: unknown, sessionId: string, turnId: string, ahora = Date.now()) {
  if (!Array.isArray(lista)) return []
  return (lista as Array<{ turnId?: unknown; message?: unknown; sentAt?: unknown; afterToolId?: unknown; trasTexto?: unknown; ancla?: unknown }>)
    .filter(i => i && typeof i.turnId === 'string' && i.turnId && typeof i.message === 'string' && i.message.trim())
    .map(i => {
      const sentAt = typeof i.sentAt === 'number' && Number.isFinite(i.sentAt) && i.sentAt > 1_600_000_000_000 && i.sentAt <= ahora + 60_000 ? Math.floor(i.sentAt) : null
      return {
        session_id: sessionId, role: 'user' as const, content: i.message as string, audio_url: null, image_url: null,
        metadata: { turnId: i.turnId as string, injectedInto: turnId, ...(typeof i.afterToolId === 'string' ? { afterToolId: i.afterToolId } : {}), ...(sentAt ? { startedAt: sentAt } : {}),
          // Su lugar en el texto de la respuesta (1 nov 2026): al recargar se pinta donde Levy lo leyó, no arriba de todo.
          ...(typeof i.trasTexto === 'number' && Number.isFinite(i.trasTexto) && i.trasTexto >= 0 ? { trasTexto: Math.floor(i.trasTexto) } : {}),
          ...(typeof i.ancla === 'string' && i.ancla.length <= 200 ? { ancla: i.ancla } : {}) } as Record<string, unknown>,
        ...(sentAt ? { created_at: new Date(sentAt).toISOString() } : {}),
      }
    })
}
