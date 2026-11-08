import './process-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { FranjaPlan } from '../../src/features/planning/FranjaPlan'
import { ListaDia } from '../../src/features/planning/ListaDia'
import { Segmentos } from '../../src/features/planning/ObjetivoCaja'
import { AvisoDecisiones, EVENTO_ENFOCAR_DECISIONES, SeccionDecisiones } from '../../src/features/decisiones/FranjaDecisiones'
import { useBandeja } from '../../src/features/decisiones/useBandeja'
import { SincronizacionAvanzada } from '../../src/shared/components/SincronizacionAvanzada'
import type { ItemDia } from '../../src/features/planning/lista-dia'
import type { Tarjeta } from '../../src/features/decisiones/lib/bandeja'
import '../../src/app/globals.css'

// «Esperan tu toque» dentro de la tarjeta HOY (4 nov 2026). La tarjeta HOY real (FranjaPlan + ListaDia) y la sección real, con las
// tarjetas de la bandeja de Daniel del 4 nov a las 18:40 (tabla `confirmaciones`), tal como las devuelve el daemon. Después de la
// caducidad por sentido quedan 5 (Fulano «de hoy a la 1:00 pm» y el botón de comunidad.example caducaron) y Mengano va en una sola tarjeta.
// ?version=antes pinta la franja de main (copia sin commitear en antes-bandeja/). La línea del tiempo de abajo es un dibujo simple.
// Las copias de main viven sin commitear (scripts/qa/capturas-punto-verde-bandeja.mjs las saca de git al correr).
const RUTA_ANTES = './antes-bandeja/'
const q = new URLSearchParams(location.search)
const antes = q.get('version') === 'antes', plegada = q.get('plegada') === '1', vista = q.get('vista') ?? 'hoy'
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')
localStorage.setItem('arbrain.calendario.franja-abierta', plegada ? '0' : '1')

const base = { estado: 'en_cola', tipo: 'decision', origen: 'agente', irreversible: true, unaPorUna: true } as const
const TODAS: (Tarjeta & { caduca?: boolean })[] = [
  { ...base, id: 'cf_5ed7f5800fdf', categoria: 'enviar', creada: Date.parse('2026-11-03T15:14:09Z'), titulo: 'WhatsApp a Fulano: mover el diagnóstico de hoy a la 1:00 pm', recomienda: 'si', recomendacion: 'A las 12 se te cruzó la grupal; la 1:00 te deja comer antes.', persona: 'Fulano', caduca: true },
  { ...base, id: 'cf_aa2c491b17fe', categoria: 'enviar', creada: Date.parse('2026-11-03T15:14:09Z'), titulo: 'WhatsApp a Mengano: adelantar su uno a uno de oferta al jueves 12:00', recomienda: 'si', recomendacion: 'Se lo ofreciste en la grupal y ya tiene su borrador de oferta.', persona: 'Mengano', vence: Date.parse('2026-11-05T18:00:00Z') },
  { ...base, id: 'cf_f8f55e2411e9', categoria: 'enviar', creada: Date.parse('2026-11-03T15:14:10Z'), titulo: 'Comentario a Mengano en el resumen fijado de la grupal', recomienda: 'si', recomendacion: 'Lo pediste en la grupal: que use el transcript con su prospecto.', persona: 'Mengano' },
  { ...base, id: 'cf_566e98f903d6', categoria: 'enviar', creada: Date.parse('2026-11-03T15:33:06Z'), titulo: 'DM a Zutano en miplataforma.com: el curso 2 ya abre', recomienda: 'si', recomendacion: 'Él preguntó por el curso 2 el lunes y ya está publicado.', persona: 'Zutano' },
  { ...base, id: 'cf_d32f269a6c75', categoria: 'enviar', creada: Date.parse('2026-11-03T19:53:37Z'), titulo: 'Responderle a Perengano en su post de la cohorte: cómo pasar Arbrain a su llave', recomienda: 'si', recomendacion: 'Está trabado desde ayer y es un clic en Ajustes › Modelos.', persona: 'Perengano' },
  { ...base, id: 'cf_8ef80e45bcdc', categoria: 'pagar', creada: Date.parse('2026-11-03T20:04:48Z'), titulo: 'Comprar midominio.app para «Tu Levy en el teléfono» sin Tailscale', recomienda: 'si', recomendacion: 'El prototipo ya funciona; 14.20 USD al año y sin más pagos.' },
  { ...base, id: 'cf_35266d3fa1c0', tipo: 'permiso', origen: 'manos', categoria: 'enviar', creada: Date.parse('2026-11-04T14:51:07Z'), titulo: 'comunidad.example: botón sin texto en un chat o compositor: puede enviar', recomienda: 'si', recomendacion: 'es parte de lo que pediste', botonSi: 'Sí, enviarlo', caduca: true },
]
const pendientes = TODAS.filter(t => antes || !t.caduca).map(({ caduca: _c, ...t }) => antes ? (({ persona: _p, ...r }) => r)(t) : t)
const vistaBandeja = { pendientes, decididasHoy: [], vencidasHoy: [], espera: { hoy: { dia: '2026-11-04', minutos: 0, tarjetas: 0, abiertas: 0 }, ayer: { dia: '2026-11-03', minutos: 0, tarjetas: 0, abiertas: 0 } }, hechoSolo: { hoy: [], ayer: [] }, politica: {} }
const real = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/decisiones') return new Response(JSON.stringify(vistaBandeja), { headers: { 'Content-Type': 'application/json' } })
  if (url.pathname.startsWith('/api/')) return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  return real(input, init)
}

const tarea = (id: string, texto: string, minuto: number | null): ItemDia => ({ id, origen: 'casilla', texto, hecho: false, minuto, linea: 0 })
const ITEMS: ItemDia[] = [
  tarea('a', 'Rutina nueva a las 5:30: agua y creatina, luz, meditación, yoga y plancha (15 min)', 330),
  tarea('b', 'Clase de las 12:00 dada: la ecuación de valor y la Grand Slam Offer aplicadas a su consultoría', 720),
  tarea('c', 'Post de Wins publicado con la foto del perro, y aviso a Fulano y Zutano', null),
  tarea('d', 'Monterrey: lugar del encuentro publicado en SaaS Factory, hotel y coche comprados', null),
  tarea('e', 'Grupal 12:00: 5 min «todos conectamos su Arbrain» (generar código en miplataforma.com, pegarlo, prender compartir texto)', 720),
]
const EVENTO = new Map([['a', 'Ritual matutino'], ['b', 'Grupal'], ['e', 'Grupal']])
const BLOQUES = [
  { h: 5.5, d: 0.5, t: '🌅 5:30 Ritual matutino · luz, agua, yoga, respiración, plancha y ducha fría', c: '#8c27f1' },
  { h: 6, d: 3, t: '🧠 Trabajo fuerte · post de Wins y estudiar la clase de ofertas de 100 millones', c: '#8c27f1' },
  { h: 9.5, d: 2, t: 'GYM · Pecho, hombro y tríceps', c: '#c0504d' },
  { h: 12, d: 1, t: '👥 Grupal · Cerebro Artificial (cohorte fundadora)', c: '#8c27f1' },
]

function LineaDelTiempo() {
  const top = (h: number) => (h - 5) * 44
  return <div style={{ position: 'relative', height: 8 * 44, margin: '14px 0 0 0' }} aria-label="Línea del tiempo (dibujo)">
    {Array.from({ length: 9 }, (_, i) => <div key={i} style={{ position: 'absolute', top: i * 44, left: 0, right: 0, borderTop: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)', fontSize: 11, color: 'var(--muted)' }}><span style={{ position: 'relative', top: -8, background: 'var(--background)', paddingRight: 6 }}>{String(5 + i).padStart(2, '0')}</span></div>)}
    {BLOQUES.map(b => <div key={b.t} style={{ position: 'absolute', left: 34, right: 0, top: top(b.h) + 1, height: b.d * 44 - 3, borderRadius: 8, background: 'var(--card)', boxShadow: `inset 3px 0 0 ${b.c}, 0 0 0 1px color-mix(in srgb, var(--foreground) 8%, transparent)`, padding: '4px 10px', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{b.t}</div>)}
  </div>
}

function Hoy() {
  const b = useBandeja()
  const [Antes, setAntes] = React.useState<null | React.ComponentType>(null)
  React.useEffect(() => { if (antes) void import(/* @vite-ignore */ RUTA_ANTES + 'FranjaDecisiones.tsx').then((m: { FranjaDecisiones: React.ComponentType }) => setAntes(() => m.FranjaDecisiones)) }, [])
  const n = b.vista?.pendientes.length ?? 0
  // Lo mismo que DiaVivo: el aviso pide enfocar y la tarjeta se abre.
  const [abrir, setAbrir] = React.useState(0)
  React.useEffect(() => { const f = () => setAbrir(x => x + 1); window.addEventListener(EVENTO_ENFOCAR_DECISIONES, f); return () => window.removeEventListener(EVENTO_ENFOCAR_DECISIONES, f) }, [])
  const detalle = <>
    <Segmentos k={0} n={ITEMS.length} i={1} />
    <ListaDia items={ITEMS} alternar={() => {}} puede={() => true} evento={EVENTO} onAbrir={() => {}} onNueva={() => {}} />
    {!antes && b.vista && <SeccionDecisiones b={b} />}
  </>
  return <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 22px 40px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 0 14px', fontSize: 20, fontWeight: 650 }}>Mié 4 nov</div>
    {antes && Antes && <Antes />}
    <FranjaPlan rotulo="Hoy" titulo="Clase de ofertas de 100 millones: cada fundador sale con el primer borrador de su oferta" vacio="Sin objetivo del día."
      cuenta={{ k: 0, n: ITEMS.length }} detalle={detalle} {...(antes ? {} : { aviso: <AvisoDecisiones n={n} />, abrirSenal: abrir })} />
    <LineaDelTiempo />
  </div>
}

function Sync() {
  const [Pill, setPill] = React.useState<null | React.ComponentType>(null)
  React.useEffect(() => { if (antes) void import(/* @vite-ignore */ RUTA_ANTES + 'RuntimeStatusPill.tsx').then((m: { RuntimeStatusPill: React.ComponentType }) => setPill(() => m.RuntimeStatusPill)) }, [])
  return <div style={{ position: 'relative', minHeight: '100vh' }}>
    <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: '1px solid color-mix(in srgb, var(--foreground) 8%, transparent)', fontSize: 14, fontWeight: 600 }}>Calendario<span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 500 }}>Taller</span></div>
    {antes ? Pill && <Pill /> : <div style={{ maxWidth: 560, margin: '24px auto', padding: '0 16px' }}>
      <p style={{ fontSize: 13, fontWeight: 650, margin: '0 0 4px' }}>Ajustes › Mac y sistema › Sincronización</p>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>Corre sola: reintenta con espera creciente, resuelve conflictos (gana tu cambio local) y solo te avisa si algo no se pudo en 8 intentos. Esto es para revisar a mano.</p>
      <SincronizacionAvanzada />
    </div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>{vista === 'sync' ? <Sync /> : <Hoy />}</div>)
