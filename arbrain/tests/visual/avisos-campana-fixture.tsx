import './process-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { NotificationBell } from '../../src/features/notifications/components/NotificationBell'
import { armarBandeja, type AvisoFila, type EstadoDecision } from '../../src/features/avisos/bandeja'
import '../../src/app/globals.css'

// La campana «Avisos» (13 nov 2026, Daniel 08:09: «doy clic en ver … pero no abre nada»). El NotificationBell REAL con la
// bandeja que arma la librería REAL (armarBandeja) sobre las filas de esa mañana (nombres ficticios: el escáner de fugas):
// tres respuestas de la comunidad por decidir y la tarjeta de /decisiones de las 07:38 (publicar el video de @levyarbrain).
// `?plataforma=escritorio` simula el WKWebView de Tauri: `window.open` no abre nada y el opener de Tauri registra la URL.
// `navegador` y `telefono` (PWA) usan `window.open`. Cada clic queda en `window.__registro` para el script de capturas.
const q = new URLSearchParams(location.search)
const plataforma = q.get('plataforma') ?? 'escritorio'
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')

type Registro = { opener: string[]; windowOpen: string[]; router: string[]; decisiones: unknown[]; accion: unknown[] }
const registro: Registro = { opener: [], windowOpen: [], router: [], decisiones: [], accion: [] }
;(window as unknown as { __registro: Registro }).__registro = registro
window.open = ((url?: string | URL) => { registro.windowOpen.push(String(url)); return null }) as typeof window.open
if (plataforma === 'escritorio') {
  ;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: { url?: string }) => { if (cmd === 'plugin:opener|open_url') registro.opener.push(String(args?.url)); return null },
    transformCallback: () => 0,
  }
}

const ahora = Date.now()
const hace = (min: number) => new Date(ahora - min * 60_000).toISOString()
const TOK = ['AAAAAAAAAAAAAAAAAAAAAAAA1', 'BBBBBBBBBBBBBBBBBBBBBBBB2', 'CCCCCCCCCCCCCCCCCCCCCCCC3']
const POST = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const comunidad = (i: number, nombre: string, escribio: string, min: number): AvisoFila => ({
  id: `00000000-0000-4000-8000-00000000000${i}`, created_at: hace(min), kind: 'persona', source: 'ht-pipeline',
  title: `¿Publico la respuesta de Levy a ${nombre}?`, body: `${nombre} escribió: «${escribio}»`,
  url: `https://miplataforma.com/decidir/${TOK[i]}`, read_at: null, clave: `comunidad:post:${POST[i]}`,
})
const filas: AvisoFila[] = [
  comunidad(0, 'Mengano', '¿Cómo le pongo precio a mi diagnóstico si el cliente ya tiene agencia?', 52),
  comunidad(1, 'Zutano', 'No me abre la lección 3 de Supernova desde el teléfono', 44),
  comunidad(2, 'Perengano', 'Ya tengo mi oferta, ¿la reviso contigo en la grupal o aquí?', 38),
  // Lo que el daemon manda a la campana al subir una tarjeta (server/src/autonomia/bandeja.ts, avisarTarjetaAlTelefono).
  { id: '55ff0ec7-0ffe-40e3-b064-339491abafd7', created_at: hace(31), kind: 'agente', source: 'bandeja:decisiones',
    title: 'Levy espera tu toque: publicar', body: 'Publicar en @levyarbrain: «Dejé a Fable 5.2 trabajando solo una noche: este fue el resultado» (video largo). Levy recomienda Sí: Es noticia y caduca. Sin tu toque no sale.',
    url: '/telefono/decisiones?id=cf_f293bf9d2c33', read_at: null, clave: 'decision-cf_f293bf9d2c33' },
  { id: '66ff0ec7-0ffe-40e3-b064-339491abafd8', created_at: hace(300), kind: 'agenda', source: 'rutina:morning-briefing',
    title: 'Tu día está listo', body: 'Tres bloques fuertes y la grupal a las 12:00.', url: '/', read_at: null },
]
const estados = new Map<string, EstadoDecision>(TOK.map((t, i) => [t, {
  estado: 'pendiente', categoria: 'comunidad', borrador: 'Va una respuesta corta y concreta de Levy, con el paso exacto.',
  origen: `https://miplataforma.com/community?post=${POST[i]}`,
}]))
// La tarjeta viva de /decisiones (la misma de la mañana), pendiente.
const tarjetas = [{
  id: 'cf_f293bf9d2c33', estado: 'en_cola' as const, tipo: 'decision' as const, categoria: 'publicar' as const, origen: 'agente' as const,
  titulo: 'Publicar en @levyarbrain: «Dejé a Fable 5.2 trabajando solo una noche: este fue el resultado» (video largo)',
  recomienda: 'si' as const, recomendacion: 'Es noticia y caduca: Fable 5.2 es el modelo nuevo y el video cuenta una noche real de Levy.',
  creada: ahora - 31 * 60_000, irreversible: true,
}]
const respuesta = () => {
  const b = armarBandeja(filas, estados, new Date(ahora), 20, new Set(), tarjetas)
  return { decidir: b.decidir, urgente: b.urgente, saber: b.saber, pendientes: b.pendientes }
}

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  const cuerpo = init?.body ? JSON.parse(String(init.body)) : null
  if (url.pathname === '/api/avisos' && (!init?.method || init.method === 'GET')) return json(respuesta())
  if (url.pathname === '/api/avisos/accion') { registro.accion.push(cuerpo); return json({ ok: true }) }
  if (url.pathname === '/api/decisiones' && init?.method === 'POST') { registro.decisiones.push(cuerpo); return json({ ...tarjetas[0], estado: cuerpo?.respuesta === 'si' ? 'permitida' : 'rechazada' }) }
  return json({})
}

function Fixture() {
  React.useEffect(() => { setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')?.click(), 50) }, [])
  return <main className="min-h-dvh bg-background text-foreground" style={{ padding: '0 0 24px 16px', display: 'flex', alignItems: 'flex-end', minHeight: '100dvh' }}>
    <NotificationBell placement="top" />
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
