// Arnés del salto del chat con una vista de Levy (5 nov 2026, Daniel 07:47: «cuando me muestras esto del negocio al
// volverse a cargar me regresa arriba!»). Un hilo con la MISMA estructura que ChatPanel (contenedor con scroll propio, un
// div con `data-msg-id` y key = id por mensaje, LazyMessage fuera de la cola de 12) y la Cabina REAL: CabinaProvider,
// CabinaDelMensaje, VistaViva, VistaNegocio y PanelEmbudo, con sus datos por la caché real (datos.ts). Lo que se simula
// es lo que lo provoca en la app, con el mismo código de ChatPanel donde lo hay:
//   __refrescar()      Levy escribió algo → refrescarCabina(): las vistas montadas releen su fuente.
//   __otroTurno()      llegan 12 mensajes: el de la vista sale de la cola que se pinta completa (ChatPanel `eager`).
//   __reabrir()        volver a la conversación: todo el hilo nace de nuevo y se restaura su scrollTop antes de pintar
//                      (ChatPanel › paintFromMemory → restoreScrollRef → fijarScroll en un layout effect).
//   __recargarAlFondo() al fondo, loadMessages(fresh): lo nacido en este cliente (`a-…`, `u-…`) trae el id de la base y
//                      se fija el fondo (pinToBottomRef), con el ResizeObserver que sigue el fondo.
//   __abrirIzquierda() Daniel abrió «Tu negocio» en una pestaña del panel (usePanelFijadas.fijar, como «+ › Tu negocio»).
// Con ?antes el hilo envuelve los mensajes como ChatPanel antes del arreglo (`eager ? bubble : <LazyMessage>`).
import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { CabinaDelMensaje, CabinaProvider } from '@/features/cabina/Cabina'
import { refrescarCabina } from '@/features/cabina/datos'
import { usePanelFijadas } from '@/features/cabina/panel/fijadas'
import { LazyMessage } from '@/features/chat/components/LazyMessage'
import { fijarScroll } from '@/features/chat/lib/desplazar'
import type { ChatMessage } from '@/features/chat/hooks/useChat'

const ANTES = new URLSearchParams(location.search).has('antes')
const t0 = Date.now() - 3600_000
const at = (min: number) => new Date(t0 + min * 60_000)
const prosa = (n: number, tema: string) => Array.from({ length: n }, (_, i) => `${tema}, párrafo ${i + 1}. Texto de prueba con el largo de una respuesta normal de Levy para que el hilo tenga altura de verdad y se pueda bajar con la rueda.`).join('\n\n')

const MENSAJES: ChatMessage[] = [
  { id: 'u1', role: 'user', content: '¿Cómo vamos con el lanzamiento?', timestamp: at(0) },
  { id: 'a1', role: 'assistant', content: prosa(6, 'Respuesta anterior'), timestamp: at(1) },
  { id: 'u-1793899990000', role: 'user', content: 'Muéstrame mi negocio completo.', timestamp: at(2) },
  {
    id: 'a-1793900000000', role: 'assistant', timestamp: at(3),
    content: 'Arriba está tu negocio completo: los dos embudos, cada etapa con su número y quién la mueve. El cuello está marcado en ámbar.',
    toolCalls: [{ toolId: 'toolu_negocio', toolName: 'mcp__cabina__mostrar', status: 'done' }] as ChatMessage['toolCalls'],
    toolInputs: { toolu_negocio: JSON.stringify({ vista: 'negocio' }) },
  },
]
const turno = (n: number): ChatMessage[] => Array.from({ length: 12 }, (_, i) => i % 2
  ? { id: `t${n}-${i}`, role: 'assistant', content: `Listo, quedó (${n}.${i}).`, timestamp: at(10 + n * 12 + i) }
  : { id: `t${n}-${i}`, role: 'user', content: `Sigue con lo que va (${n}.${i}).`, timestamp: at(10 + n * 12 + i) })

function Burbuja({ m }: { m: ChatMessage }) {
  return m.role === 'user'
    ? <p style={{ marginLeft: 'auto', maxWidth: '70%', padding: '10px 16px', borderRadius: 16, background: 'rgba(124,58,237,.12)' }}>{m.content}</p>
    : <article className="text-[15px] leading-relaxed">
      {m.toolCalls?.length ? <CabinaDelMensaje msg={m} /> : null}
      {m.content.split('\n\n').map((p, j) => <p key={j} style={{ margin: '0 0 12px' }}>{p}</p>)}
    </article>
}

function Hilo() {
  const [mensajes, setMensajes] = useState(MENSAJES)
  const hilo = useRef<HTMLDivElement>(null), contenido = useRef<HTMLDivElement>(null)
  const restaurar = useRef<number | null>(null), alFondo = useRef(false), fijarFondo = useRef(false), turnos = useRef(0)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__refrescar = () => refrescarCabina(0)
    w.__otroTurno = () => setMensajes(l => [...l, ...turno(++turnos.current)])
    w.__reabrir = () => { restaurar.current = hilo.current!.scrollTop; setMensajes(l => l.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))); setLlave(k => k + 1) }
    w.__recargarAlFondo = () => { fijarFondo.current = true; setMensajes(l => l.map(m => (/^[au]-/.test(m.id) ? { ...m, id: `db-${m.id.slice(2)}` } : m))) }
    w.__abrirIzquierda = () => usePanelFijadas.getState().fijar('mano-negocio', { vista: 'negocio' }, true)
    w.__fijadas = () => usePanelFijadas.getState()
  }, [])
  const [llave, setLlave] = useState(0)
  // ChatPanel: restore del caché en memoria / pin al fondo, síncronos antes de pintar.
  useLayoutEffect(() => {
    const el = hilo.current!
    if (restaurar.current != null) { fijarScroll(el, restaurar.current); restaurar.current = null; return }
    if (fijarFondo.current) { fijarFondo.current = false; fijarScroll(el, el.scrollHeight); alFondo.current = true }
  }, [mensajes, llave])
  // ChatPanel: el ResizeObserver del contenido sigue el fondo solo si ya estabas ahí.
  useEffect(() => {
    const el = hilo.current!, ro = new ResizeObserver(() => { if (alFondo.current) fijarScroll(el, el.scrollHeight) })
    ro.observe(contenido.current!)
    const alScroll = () => { alFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }
    el.addEventListener('scroll', alScroll)
    return () => { ro.disconnect(); el.removeEventListener('scroll', alScroll) }
  }, [])
  return <div ref={hilo} data-hilo style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}>
    {/* La llave remonta TODO el hilo: así nace al volver a la conversación. */}
    <div key={llave} ref={contenido} className="chat-prose" style={{ padding: '24px 16px 40px' }}>
      <CabinaProvider messages={mensajes}>
        {mensajes.map((m, i) => {
          const eager = m.role === 'user' || i >= mensajes.length - 12
          const bubble = <Burbuja m={m} />
          return <div key={m.id} data-msg-id={m.id} data-msg-role={m.role} className={i ? 'mt-5' : ''}>
            {ANTES
              ? (eager ? bubble : <LazyMessage text={m.content}>{bubble}</LazyMessage>)
              : <LazyMessage text={m.content} eager={eager}>{bubble}</LazyMessage>}
          </div>
        })}
      </CabinaProvider>
    </div>
  </div>
}

createRoot(document.getElementById('raiz')!).render(<ThemeProvider><Hilo /></ThemeProvider>)
