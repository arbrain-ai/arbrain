import './process-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ColaMemoriaTaller } from '../../src/features/cabina/panel/ColaMemoriaTaller'
import { demoCola, type VistaCola } from '../../src/features/cabina/panel/cola-memoria-modelo'
import w from '../../src/features/cabina/panel/taller.module.css'
import '../../src/app/globals.css'

// Taller › Agentes › En cola por memoria (5 nov 2026). El bloque REAL con la ruta de la web simulada: una MacBook Air de 8 GB
// con 1.1 GB libres y tres encargos formados (demoCola). Los POST de «Subir», arrastrar y «Lanzar ya» pasan por el mismo
// fetch que en la app y la respuesta es la cola reordenada, como la devuelve el daemon. `?tema=oscuro`.
const q = new URLSearchParams(location.search)
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')
let vista: VistaCola = demoCola()
;(window as unknown as { __posts: unknown[] }).__posts = []
const real = window.fetch.bind(window)
const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/taller/cola-memoria') {
    if (init?.method === 'POST') {
      const b = JSON.parse(String(init.body)) as { accion: string; id: string; posicion?: number }
      ;(window as unknown as { __posts: unknown[] }).__posts.push(b)
      const esperan = vista.esperando.filter(e => e.estado === 'esperando')
      const i = esperan.findIndex(e => e.id === b.id)
      if (b.accion === 'forzar') esperan[i] = { ...esperan[i], forzar: true }
      if (b.accion === 'mover') { const [e] = esperan.splice(i, 1); esperan.splice(b.posicion!, 0, e) }
      vista = { ...vista, esperando: esperan.map((e, k) => ({ ...e, posicion: k + 1 })) }
    }
    return json(vista)
  }
  if (url.pathname.startsWith('/api/')) return json({})
  return real(input, init)
}

function Pagina() {
  return <main style={{ maxWidth: 560, margin: '0 auto', padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div className={w.cabecera}><h3 className={w.ceja}>Trabajando para ti</h3></div>
    <ColaMemoriaTaller />
  </main>
}
createRoot(document.getElementById('root')!).render(<Pagina />)
