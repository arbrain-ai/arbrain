import './process-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { FranjaPlan } from '../../src/features/planning/FranjaPlan'
import { ListaDia } from '../../src/features/planning/ListaDia'
import { Segmentos } from '../../src/features/planning/ObjetivoCaja'
import { AvisoDecisiones, EVENTO_ENFOCAR_DECISIONES, pedirEnfocarDecisiones, SeccionDecisiones } from '../../src/features/decisiones/FranjaDecisiones'
import { useBandeja } from '../../src/features/decisiones/useBandeja'
import { AgentesTrabajando } from '../../src/features/cabina/panel/AgentesTrabajando'
import type { ItemDia } from '../../src/features/planning/lista-dia'
import type { Tarjeta } from '../../src/features/decisiones/lib/bandeja'
import '../../src/app/globals.css'

// «N te esperan» solo en el Hoy (4 nov 2026, 19:31). El encabezado del chat con la píldora REAL (AgentesTrabajando) y, debajo, el Día:
// la tarjeta HOY real (FranjaPlan + ListaDia + SeccionDecisiones) con la bandeja de esa tarde (nombres ficticios: el escáner de fugas) y
// una línea del tiempo dibujada. `?version=antes` monta las copias de main que scripts/qa/capturas-sin-te-esperan.mjs deja (sin
// commitear) en antes-sin-te-esperan/: la píldora con «5 te esperan», la franja que la señal dejaba abierta para siempre y la vencida
// tachada. `?telefono=1` es el ancho del iPhone: la tarjeta no recuerda (nace plegada) aunque el dispositivo la tenga guardada abierta.
const RUTA_ANTES = './antes-sin-te-esperan/'
const q = new URLSearchParams(location.search)
const antes = q.get('version') === 'antes', plegada = q.get('plegada') === '1', telefono = q.get('telefono') === '1'
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')
if (!q.has('sinPreferencia')) localStorage.setItem('arbrain.calendario.franja-abierta', plegada ? '0' : '1')

const base = { estado: 'en_cola', tipo: 'decision', origen: 'agente', irreversible: true, unaPorUna: true } as const
const ahora = Date.now()
const pendientes: Tarjeta[] = [
  { ...base, id: 'cf_aa2c491b17fe', categoria: 'enviar', creada: ahora - 28 * 3600_000, titulo: 'WhatsApp a Mengano: adelantar su uno a uno de oferta al jueves 12:00', recomienda: 'si', recomendacion: 'Se lo ofreciste en la grupal y ya tiene su borrador de oferta.', persona: 'Mengano', vence: ahora + 17 * 3600_000 },
  { ...base, id: 'cf_f8f55e2411e9', categoria: 'enviar', creada: ahora - 28 * 3600_000 + 1000, titulo: 'Comentario a Mengano en el resumen fijado de la grupal', recomienda: 'si', recomendacion: 'Lo pediste en la grupal: que use el transcript con su prospecto.', persona: 'Mengano', detalle: 'Mengano, usa el transcript de la grupal con tu prospecto: ahí está la pregunta que te faltó.' },
  { ...base, id: 'cf_566e98f903d6', categoria: 'enviar', creada: ahora - 27 * 3600_000, titulo: 'DM a Zutano en miplataforma.com: el curso 2 ya abre', recomienda: 'si', recomendacion: 'Él preguntó por el curso 2 el lunes y ya está publicado.', persona: 'Zutano' },
  { ...base, id: 'cf_d32f269a6c75', categoria: 'enviar', creada: ahora - 23 * 3600_000, titulo: 'Responderle a Perengano en su post de la cohorte: cómo pasar Arbrain a su llave', recomienda: 'si', recomendacion: 'Está trabado desde ayer y es un clic en Ajustes › Modelos.', persona: 'Perengano' },
  { ...base, id: 'cf_8ef80e45bcdc', categoria: 'pagar', creada: ahora - 23 * 3600_000 + 1000, titulo: 'Comprar midominio.app para «Tu Levy en el teléfono» sin Tailscale', recomienda: 'si', recomendacion: 'El prototipo ya funciona; 14.20 USD al año y sin más pagos.' },
]
// La de Fulano venció hace 5 min: antes se quedaba tachada en la lista; ahora solo vive en el historial.
const vencidasHoy: Tarjeta[] = [{ ...base, id: 'cf_5ed7f5800fdf', categoria: 'enviar', estado: 'vencida', creada: ahora - 30 * 3600_000, resuelta: ahora - 5 * 60_000, titulo: 'WhatsApp a Fulano: mover el diagnóstico de hoy a la 1:00 pm', persona: 'Fulano' } as Tarjeta]
const vistaBandeja = { pendientes, decididasHoy: [], vencidasHoy, espera: { hoy: { dia: '2026-11-04', minutos: 0, tarjetas: 0, abiertas: 0 }, ayer: { dia: '2026-11-03', minutos: 0, tarjetas: 0, abiertas: 0 } }, hechoSolo: { hoy: [], ayer: [] }, politica: {} }
// La píldora: un subagente trabajando para esta conversación y una pregunta de un modelo (lo que se queda).
const trabajos = { terminales: [], internas: [{ id: 'i1', tipo: 'subagente', descripcion: 'Revisar el deck de la clase', estado: 'trabajando', desde: new Date(ahora - 300_000).toISOString(), actualizado: new Date(ahora - 10_000).toISOString(), conversacion: 'chat-a', turno: 't1' }] }
const avisos = { avisos: [{ id: 'av1', created_at: new Date(ahora - 600_000).toISOString(), kind: 'pregunta', title: '¿Subo la clase con o sin la lámina 14?', body: null, url: null, read_at: null }] }
const real = window.fetch.bind(window)
const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/decisiones') return json(vistaBandeja)
  if (url.pathname === '/api/avisos') return json(avisos)
  if (url.pathname.startsWith('/api/cabina/trabajos') || url.pathname.startsWith('/api/trabajos')) return json(trabajos)
  if (url.pathname.startsWith('/api/')) return json({})
  return real(input, init)
}
;(window as unknown as { __enfocar: typeof pedirEnfocarDecisiones }).__enfocar = pedirEnfocarDecisiones

const tarea = (id: string, texto: string, minuto: number | null): ItemDia => ({ id, origen: 'casilla', texto, hecho: false, minuto, linea: 0 })
const ITEMS: ItemDia[] = [
  tarea('a', 'Rutina nueva a las 5:30: agua y creatina, luz, meditación, yoga y plancha (15 min)', 330),
  tarea('b', 'Clase de las 12:00 dada: la ecuación de valor y la Grand Slam Offer aplicadas a su consultoría', 720),
  tarea('c', 'Post de Wins publicado con la foto del perro', null),
  tarea('d', 'Monterrey: lugar del encuentro publicado, hotel y coche comprados', null),
]
const EVENTO = new Map([['a', 'Ritual matutino'], ['b', 'Grupal']])
const BLOQUES = [
  { h: 5.5, d: 0.5, t: '🌅 5:30 Ritual matutino · luz, agua, yoga, respiración, plancha y ducha fría', c: '#8c27f1' },
  { h: 6, d: 3, t: '🧠 Trabajo fuerte · post de Wins y estudiar la clase de ofertas de 100 millones', c: '#8c27f1' },
  { h: 9.5, d: 2, t: 'GYM · Pecho, hombro y tríceps', c: '#c0504d' },
  { h: 12, d: 1, t: '👥 Grupal · Cerebro Artificial (cohorte fundadora)', c: '#8c27f1' },
]

function LineaDelTiempo() {
  const top = (h: number) => (h - 5) * 44
  return <div data-linea-tiempo style={{ position: 'relative', height: 9 * 44, margin: '14px 0 0 0' }} aria-label="Línea del tiempo (dibujo)">
    {Array.from({ length: 10 }, (_, i) => <div key={i} style={{ position: 'absolute', top: i * 44, left: 0, right: 0, borderTop: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)', fontSize: 11, color: 'var(--muted)' }}><span style={{ position: 'relative', top: -8, background: 'var(--background)', paddingRight: 6 }}>{String(5 + i).padStart(2, '0')}</span></div>)}
    {BLOQUES.map(b => <div key={b.t} style={{ position: 'absolute', left: 34, right: 0, top: top(b.h) + 1, height: b.d * 44 - 3, borderRadius: 8, background: 'var(--card)', boxShadow: `inset 3px 0 0 ${b.c}, 0 0 0 1px color-mix(in srgb, var(--foreground) 8%, transparent)`, padding: '4px 10px', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{b.t}</div>)}
  </div>
}

type Mods = { Plan: typeof FranjaPlan; Seccion: typeof SeccionDecisiones; Aviso: typeof AvisoDecisiones; Pildora: typeof AgentesTrabajando; Evento: string }
const DESPUES: Mods = { Plan: FranjaPlan, Seccion: SeccionDecisiones, Aviso: AvisoDecisiones, Pildora: AgentesTrabajando, Evento: EVENTO_ENFOCAR_DECISIONES }

function Pantalla() {
  const [m, setM] = React.useState<Mods | null>(antes ? null : DESPUES)
  React.useEffect(() => {
    if (!antes) return
    void Promise.all([import(/* @vite-ignore */ RUTA_ANTES + 'FranjaPlan.tsx'), import(/* @vite-ignore */ RUTA_ANTES + 'FranjaDecisiones.tsx'), import(/* @vite-ignore */ RUTA_ANTES + 'AgentesTrabajando.tsx')])
      .then(([p, d, a]) => setM({ Plan: p.FranjaPlan, Seccion: d.SeccionDecisiones, Aviso: d.AvisoDecisiones, Pildora: a.AgentesTrabajando, Evento: d.EVENTO_ENFOCAR_DECISIONES }))
  }, [])
  const b = useBandeja()
  const [abrir, setAbrir] = React.useState(0)
  React.useEffect(() => { if (!m) return; const f = () => setAbrir(x => x + 1); window.addEventListener(m.Evento, f); return () => window.removeEventListener(m.Evento, f) }, [m])
  if (!m) return null
  const n = b.vista?.pendientes.length ?? 0
  const detalle = <>
    <Segmentos k={0} n={ITEMS.length} i={1} />
    <ListaDia items={ITEMS} alternar={() => {}} puede={() => true} evento={EVENTO} onAbrir={() => {}} onNueva={() => {}} />
    {b.vista && <m.Seccion b={b} />}
  </>
  // Lo mismo que DiaVivo: en el teléfono no recuerda (después); antes recordaba en todos lados.
  const extra = antes ? {} : { recordar: !telefono }
  return <div style={{ maxWidth: telefono ? undefined : 760, margin: '0 auto' }}>
    <header data-encabezado-chat style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)' }}>
      <span style={{ width: 28, height: 28, borderRadius: 999, background: 'color-mix(in srgb, var(--brand, #8c27f1) 30%, var(--card))', display: 'inline-block' }} aria-hidden />
      <span style={{ fontSize: 14, fontWeight: 650 }}>Levy</span>
      <m.Pildora compacta={telefono} conversacion="chat-a" />
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>encabezado del chat</span>
    </header>
    <div style={{ padding: telefono ? '12px 12px 40px' : '18px 22px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 0 14px', fontSize: 20, fontWeight: 650 }}>Mié 4 nov</div>
      <m.Plan rotulo="Hoy" titulo="Clase de ofertas de 100 millones: cada fundador sale con el primer borrador de su oferta" vacio="Sin objetivo del día."
        cuenta={{ k: 0, n: ITEMS.length }} detalle={detalle} aviso={<m.Aviso n={n} />} abrirSenal={abrir} {...extra} />
      <LineaDelTiempo />
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}><Pantalla /></div>)
