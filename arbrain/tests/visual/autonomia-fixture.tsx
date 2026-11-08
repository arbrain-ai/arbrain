import './process-shim'
import './dirname-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ModalAjustes } from '../../src/features/configuracion/components/ModalAjustes'
import { Bandeja } from '../../src/features/decisiones/Bandeja'
import { useAjustes } from '../../src/shared/stores/ajustes-store'
import type { Clase, Modo, PoliticaApp, VistaBandeja } from '../../src/features/decisiones/lib/bandeja'
import '../../src/app/globals.css'

// Ajustes › Autonomía con la clase «Soporte técnico a la cohorte» (4 nov 2026). La política sale del daemon de esta rama
// (`politicaParaLaApp()`): el script de capturas la escribe en autonomia-politica.json (sin commitear) antes de abrir esto.
// ?vista=ajustes (el modal real, sección Autonomía) · ?vista=bandeja («Lo que hice solo» con el enlace de la respuesta).
const q = new URLSearchParams(location.search)
const vista = q.get('vista') ?? 'ajustes'
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')

const politica = await (await fetch('/autonomia-politica.json')).json() as PoliticaApp
const hecho = q.get('encendida') === '1'
  ? [{ ts: '2026-11-04T19:52:10.000Z', clase: 'soporte' as Clase, que: 'Respondí a Perengano en miplataforma.com: «Perengano, se resuelve con un clic: Ajustes › Llaves → «Usar una llave en su lugar». Levy se reinicia en unos segundos y ya responde con tu llave.»', donde: 'miplataforma.com', enlace: 'https://miplataforma.com/community?post=00000000-0000-4000-8000-000000000000', deshacer: 'borrando el comentario de Levy en el hilo', origen: 'levy' }]
  : []
const estado = { politica, hecho }
const vistaDe = (): VistaBandeja => ({ pendientes: [], decididasHoy: [], vencidasHoy: [], espera: { hoy: { dia: '2026-11-04', minutos: 0, tarjetas: 0, abiertas: 0 }, ayer: { dia: '2026-11-03', minutos: 0, tarjetas: 0, abiertas: 0 } }, hechoSolo: { hoy: estado.hecho, ayer: [] }, politica: estado.politica })
const real = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/decisiones') {
    if (init?.method === 'POST') {
      // Lo mismo que el daemon con el secreto de la web: preset y ajustes; lo irreversible no baja de «tocar».
      const c = JSON.parse(String(init.body)) as { preset: PoliticaApp['preset']; ajustes: Partial<Record<Clase, Modo>> }
      const p = estado.politica
      const clases = p.clases.map(x => ({ ...x, modo: (c.ajustes[x.id] && !(x.irreversible && c.ajustes[x.id] === 'hacer') ? c.ajustes[x.id]! : x.modo) }))
      estado.politica = { ...p, preset: c.preset, ajustes: c.ajustes, clases, vigente: Object.fromEntries(clases.map(x => [x.id, x.modo])) as Record<Clase, Modo> }
      ;(window as unknown as { __ultimoPost: unknown }).__ultimoPost = c
    }
    return new Response(JSON.stringify(vistaDe()), { headers: { 'Content-Type': 'application/json' } })
  }
  if (url.pathname.startsWith('/api/')) return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  return real(input, init)
}

function App() {
  React.useEffect(() => { if (vista === 'ajustes') useAjustes.setState({ abierto: true, seccion: 'autonomia', enLista: false }) }, [])
  return vista === 'ajustes' ? <ModalAjustes /> : <div style={{ maxWidth: 520, margin: '24px auto', padding: '0 12px' }}><Bandeja /></div>
}
createRoot(document.getElementById('root')!).render(<App />)
