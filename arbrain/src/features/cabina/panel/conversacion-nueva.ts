/**
 * La conversación nueva que abrió Levy (31 oct 2026), del lado de la app. La herramienta `conversacion` de la Cabina ya creó la
 * fila fijada; el bus del panel le avisa a esta ventana (comando `conversacion`, server/src/cabina/panel-bus.ts) para que la
 * barra la pinte en Fijadas sin esperar su refresco y, si Levy la pidió abierta, la abra. El acuse dice lo que de verdad pasó.
 * Sin dependencias de React: se prueba en tests/cabina/conversacion-nueva-bus.test.ts.
 */
import { useRecientesStore } from '@/features/chat/stores/recientes-store'

/** Comandos nuevos del bus que esta web sabe atender: el servidor solo se los manda a quien los declara. */
export const SABE = ['conversacion'] as const

export interface ConversacionNueva { id: string; titulo: string; abrir: boolean }

export interface Entorno {
  emitir: (evento: string, detalle: unknown) => void
  fijadas: () => string[]
  activa: () => string | null
  esperar: (ms: number) => Promise<void>
}

const entornoReal = (): Entorno => ({
  emitir: (evento, detalle) => window.dispatchEvent(new CustomEvent(evento, { detail: detalle })),
  fijadas: () => useRecientesStore.getState().fijadas.map((s) => s.id),
  activa: () => useRecientesStore.getState().activaId,
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
})

async function hasta(cond: () => boolean, e: Entorno, plazoMs: number, cadaMs = 200): Promise<boolean> {
  for (let t = 0; ; t += cadaMs) {
    if (cond()) return true
    if (t >= plazoMs) return false
    await e.esperar(cadaMs)
  }
}

/** Pide a la barra releer Fijadas (y abrir la conversación si `abrir`) y espera a verlo hecho. */
export async function atenderConversacion(sesion: ConversacionNueva | undefined, e: Entorno = entornoReal(), plazoMs = 5000): Promise<{ ok: boolean; detalle: string }> {
  if (!sesion || typeof sesion.id !== 'string' || !sesion.id) return { ok: false, detalle: 'el aviso no trae la conversación' }
  e.emitir('openclaw:session-pinned', { id: sesion.id, fijada: true })
  const enFijadas = await hasta(() => e.fijadas().includes(sesion.id), e, plazoMs)
  const pinto = enFijadas ? `«${sesion.titulo}» ya aparece en Fijadas` : `pedí releer Fijadas pero «${sesion.titulo}» aún no aparece (sale en el próximo refresco)`
  if (!sesion.abrir) return { ok: enFijadas, detalle: pinto }
  e.emitir('openclaw:open-session', sesion.id)
  const abierta = await hasta(() => e.activa()?.replace(/^sdk:/, '') === sesion.id, e, plazoMs)
  return { ok: enFijadas && abierta, detalle: `${pinto}; ${abierta ? 'y quedó abierta' : 'no se abrió (la sección de chat no está a la vista)'}` }
}
