import { useRecientesStore } from '../stores/recientes-store'
import type { ChatSession } from '../hooks/useChatHistory'
import { EVENTO_CAMBIO_SESION, type CambioSesion } from './cambios-sesion'
import { marcarAMano, olvidarAMano } from './no-leida-a-mano'
import { mostrarAviso, ocultarAviso } from './aviso-efimero'

/**
 * Acciones del menú «⋯» de una conversación (1 oct 2026), compartidas por «Recientes» y «Ver todas».
 * Cada una cambia la pantalla al instante cuando es reversible (fijar, no leído, renombrar: con vuelta
 * atrás si el servidor la rechaza) y espera al servidor cuando no lo es (archivar, eliminar, bifurcar).
 * El cambio se difunde con `openclaw:session-changed`; ver cambios-sesion.ts.
 */

export function emitirCambio(c: CambioSesion) {
  useRecientesStore.getState().aplicarCambio(c)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO_SESION, { detail: c }))
}

const parche = (id: string, p: Partial<ChatSession>) => emitirCambio({ tipo: 'parche', id, parche: p })

async function patch(id: string, cuerpo: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch('/api/chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id, ...cuerpo }),
    })
    if (r.ok) return null
    const j = await r.json().catch(() => null) as { error?: string } | null
    return j?.error ?? `El servidor respondió ${r.status}`
  } catch {
    return 'Sin conexión con el servidor'
  }
}

export async function fijar(s: ChatSession): Promise<void> {
  const valor = !s.is_favorite
  // El servidor limpia la posición manual: recién fijada entra arriba; desfijada no la guarda. Desfijar también
  // le quita la estrella: una favorita siempre está fijada.
  parche(s.id, { is_favorite: valor, pinned_position: null, ...(valor ? {} : { is_starred: false }) })
  const error = await patch(s.id, { is_favorite: valor })
  if (error) { parche(s.id, { is_favorite: !valor, pinned_position: s.pinned_position ?? null, is_starred: !!s.is_starred }); mostrarAviso(`No se pudo ${valor ? 'fijar' : 'desfijar'}: ${error}`, 'error'); return }
  // «Ver todas» y cualquier lista que no escuche `session-changed` se enteran por el aviso de siempre.
  window.dispatchEvent(new CustomEvent('openclaw:session-pinned', { detail: { id: s.id, fijada: valor } }))
}

/**
 * Favorita (4 oct 2026): estrella dorada, además de fijada. Marcarla fija la que estaba suelta; quitarla la deja
 * fijada. Daniel: «las favoritas son las que además de pinneadas yo le di en favorita».
 *
 * Estrella única (v3, 10 oct 2026): marcar una le quita la estrella a la anterior, en la base (PATCH) y en la
 * pantalla de todas las ventanas (canal `arbrain:estrella`). Es la conversación a donde llegan los reportes.
 */
export async function favorita(s: ChatSession): Promise<void> {
  const valor = !s.is_starred
  const fijarTambien = valor && !s.is_favorite
  const previas = valor ? otrasConEstrella(s.id) : []
  for (const id of previas) parche(id, { is_starred: false })
  parche(s.id, { is_starred: valor, ...(fijarTambien ? { is_favorite: true, pinned_position: null } : {}) })
  const { error, desmarcadas } = await patchEstrella(s.id, valor)
  if (error) {
    for (const id of previas) parche(id, { is_starred: true })
    parche(s.id, { is_starred: !!s.is_starred, is_favorite: s.is_favorite, pinned_position: s.pinned_position ?? null })
    mostrarAviso(`No se pudo ${valor ? 'marcar como favorita' : 'quitar de favoritas'}: ${error}`, 'error')
    return
  }
  // La base pudo apagar alguna que esta ventana no tenía cargada: también se apaga aquí.
  for (const id of desmarcadas) if (!previas.includes(id)) parche(id, { is_starred: false })
  if (valor) avisarEstrella(s.id)
  if (fijarTambien) window.dispatchEvent(new CustomEvent('openclaw:session-pinned', { detail: { id: s.id, fijada: true } }))
}

/** Las conversaciones con estrella que pinta esta ventana, salvo `id`. */
function otrasConEstrella(id: string): string[] {
  const st = useRecientesStore.getState()
  const ids = new Set<string>()
  for (const x of [...st.fijadas, ...st.traidas, ...st.sesiones, ...st.rutinas]) if (x.is_starred && x.id !== id) ids.add(x.id)
  return [...ids]
}

async function patchEstrella(id: string, valor: boolean): Promise<{ error: string | null; desmarcadas: string[] }> {
  try {
    const r = await fetch('/api/chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id, is_starred: valor }),
    })
    const j = await r.json().catch(() => null) as { error?: string; desmarcadas?: unknown } | null
    if (!r.ok) return { error: j?.error ?? `El servidor respondió ${r.status}`, desmarcadas: [] }
    return { error: null, desmarcadas: Array.isArray(j?.desmarcadas) ? j.desmarcadas.filter((x): x is string => typeof x === 'string') : [] }
  } catch {
    return { error: 'Sin conexión con el servidor', desmarcadas: [] }
  }
}

const CANAL_ESTRELLA = 'arbrain:estrella'
let canalEstrella: BroadcastChannel | null = null
const abrirCanalEstrella = () => {
  if (!canalEstrella && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') canalEstrella = new BroadcastChannel(CANAL_ESTRELLA)
  return canalEstrella
}

function avisarEstrella(id: string) {
  try { abrirCanalEstrella()?.postMessage({ id }) } catch { /* sin canal: las demás ventanas se enteran al releer la lista */ }
}

/**
 * Otra ventana marcó una favorita: aquí se enciende esa y se apagan las demás, sin esperar a releer la lista. Devuelve
 * cómo dejar de escuchar. Lo monta la barra (RecientesNav).
 */
export function escucharEstrellaUnica(): () => void {
  const canal = abrirCanalEstrella()
  if (!canal) return () => {}
  const alRecibir = (e: MessageEvent) => {
    const id = (e.data as { id?: unknown } | null)?.id
    if (typeof id !== 'string') return
    for (const otra of otrasConEstrella(id)) parche(otra, { is_starred: false })
    parche(id, { is_starred: true })
  }
  canal.addEventListener('message', alRecibir)
  return () => canal.removeEventListener('message', alRecibir)
}

/**
 * Guarda el orden manual de Fijadas (4 oct 2026) tras soltar un arrastre: `orden` son los ids de arriba
 * abajo; `previas` las conversaciones tal como estaban, para volver atrás si el servidor lo rechaza. La
 * que entra desde los días queda fijada en el lugar donde se soltó.
 */
export async function guardarOrdenFijadas(orden: string[], previas: ChatSession[]): Promise<void> {
  orden.forEach((id, i) => parche(id, { is_favorite: true, pinned_position: i }))
  let error: string | null = null
  try {
    const r = await fetch('/api/chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordenFijadas: orden }),
    })
    if (!r.ok) error = (await r.json().catch(() => null) as { error?: string } | null)?.error ?? `El servidor respondió ${r.status}`
  } catch {
    error = 'Sin conexión con el servidor'
  }
  if (error) {
    for (const s of previas) parche(s.id, { is_favorite: s.is_favorite, pinned_position: s.pinned_position ?? null })
    mostrarAviso(`No se pudo acomodar las fijadas: ${error}`, 'error')
    return
  }
  const nuevas = previas.filter((s) => !s.is_favorite)
  for (const s of nuevas) window.dispatchEvent(new CustomEvent('openclaw:session-pinned', { detail: { id: s.id, fijada: true } }))
}

export async function marcarNoLeida(s: ChatSession): Promise<void> {
  marcarAMano(s.id, s.last_message_at)
  parche(s.id, { last_read_at: null })
  const error = await patch(s.id, { markUnread: true })
  if (error) {
    olvidarAMano(s.id)
    parche(s.id, { last_read_at: s.last_read_at ?? null })
    mostrarAviso(`No se pudo marcar como no leída: ${error}`, 'error')
  }
}

export async function marcarLeida(s: ChatSession): Promise<void> {
  olvidarAMano(s.id)
  parche(s.id, { last_read_at: new Date().toISOString() })
  const error = await patch(s.id, { markRead: true })
  if (error) { parche(s.id, { last_read_at: s.last_read_at ?? null }); mostrarAviso(`No se pudo marcar como leída: ${error}`, 'error') }
}

export async function renombrar(s: ChatSession, titulo: string): Promise<void> {
  const nuevo = titulo.trim()
  if (!nuevo || nuevo === s.title) return
  parche(s.id, { title: nuevo })
  const error = await patch(s.id, { title: nuevo })
  if (error) { parche(s.id, { title: s.title }); mostrarAviso(`No se pudo cambiar el nombre: ${error}`, 'error') }
}

/** Archivar o desarchivar. Espera al servidor: si la conversación está abierta, ChatPanel la cierra al quitarla. */
export async function archivar(s: ChatSession, archivada: boolean): Promise<void> {
  const error = await patch(s.id, { archived: archivada })
  if (error) { mostrarAviso(`No se pudo ${archivada ? 'archivar' : 'desarchivar'}: ${error}`, 'error'); return }
  if (archivada) {
    emitirCambio({ tipo: 'quitada', id: s.id, motivo: 'archivada' })
    mostrarAviso('Conversación archivada. La encuentras en «Archivadas» de «Ver todas».', 'ok')
  } else {
    emitirCambio({ tipo: 'agregada', sesion: { ...s, archived_at: null } })
  }
}

export async function eliminar(s: ChatSession): Promise<void> {
  try {
    const r = await fetch('/api/chat/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s.id }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => null) as { error?: string } | null
      throw new Error(j?.error ?? `El servidor respondió ${r.status}`)
    }
  } catch (error) {
    mostrarAviso(`No se pudo eliminar: ${error instanceof Error ? error.message : 'error desconocido'}`, 'error')
    return
  }
  olvidarAMano(s.id)
  emitirCambio({ tipo: 'quitada', id: s.id, motivo: 'eliminada' })
}

// Una bifurcación a la vez por conversación: el doble clic no debe crear dos copias.
const bifurcando = new Set<string>()

export interface ResultadoBifurcar { sesion: ChatSession; contextoMotor: boolean }

/** Crea la copia (ver la ruta /fork), la agrega a las listas y la devuelve para abrirla. Null si falló (ya avisó). */
export async function bifurcar(s: ChatSession): Promise<ResultadoBifurcar | null> {
  if (bifurcando.has(s.id)) return null
  bifurcando.add(s.id)
  mostrarAviso('Bifurcando conversación…', 'info', 0)
  try {
    const r = await fetch(`/api/chat/sessions/${encodeURIComponent(s.id)}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forkId: crypto.randomUUID() }),
    })
    const j = await r.json().catch(() => null) as { session?: ChatSession; contextoMotor?: boolean; error?: string } | null
    if (!r.ok || !j?.session) {
      mostrarAviso(j?.error ?? `No se pudo bifurcar (el servidor respondió ${r.status}).`, 'error', 7000)
      return null
    }
    emitirCambio({ tipo: 'agregada', sesion: j.session })
    if (j.contextoMotor === false) {
      mostrarAviso('Bifurcada. Esta conversación aún no tenía contexto en el motor: Levy verá el historial pero no lo recordará.', 'info', 8000)
    } else {
      ocultarAviso()
    }
    return { sesion: j.session, contextoMotor: j.contextoMotor !== false }
  } catch {
    mostrarAviso('No se pudo bifurcar: sin conexión con el servidor.', 'error', 7000)
    return null
  } finally {
    bifurcando.delete(s.id)
  }
}

/** Las archivadas del espacio de cuenta que se está viendo (el servidor las filtra como a la lista normal). */
export async function pedirArchivadas(cuenta: string): Promise<ChatSession[] | null> {
  try {
    const r = await fetch(`/api/chat/sessions?source=mc&archivadas=1&limit=60&sort=last_message&account=${encodeURIComponent(cuenta)}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json() as { sessions?: ChatSession[] }
    return Array.isArray(j.sessions) ? j.sessions : null
  } catch { return null }
}
