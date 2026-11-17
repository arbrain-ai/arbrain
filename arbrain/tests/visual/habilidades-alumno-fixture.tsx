import './process-shim'
import './dirname-shim'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoriaTaller } from '../../src/features/cabina/panel/MemoriaTaller'
import '../../src/app/globals.css'

// Taller › Habilidades en la copia del alumno (16 nov 2026, un alumno en Windows). `/api/cabina/archivos` responde lo que
// devuelve lib/cabina/archivos-cerebro.ts sobre una copia generada leída como en Windows; el script de capturas
// (scripts/qa/capturas-habilidades-alumno.mjs) lo escribe en habilidades-alumno-datos.json (sin commitear).
const q = new URLSearchParams(location.search)
if (q.get('tema') === 'oscuro') document.documentElement.classList.add('dark')
try { localStorage.setItem('arbrain.taller.memoria', 'skills') } catch { /* */ }
const datos = await (await fetch('/habilidades-alumno-datos.json')).json() as { lista: unknown; textos: Record<string, string> }
const real = window.fetch.bind(window)
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/cabina/archivos') {
    const ruta = url.searchParams.get('ruta')
    if (!ruta) return json(datos.lista)
    return datos.textos[ruta] ? json({ ruta, texto: datos.textos[ruta], editado: new Date().toISOString() }) : json({ error: 'Ese archivo no es del cerebro.' }, 403)
  }
  // Cifra de memorias del encabezado: las mismas de la copia (la vista Memorias no se monta aquí).
  // ?memoria=caida: el daemon no responde la memoria (la tarjeta debe mostrar el número real, no «—»).
  if (url.pathname === '/api/cabina/memoria' && q.get('memoria') === 'caida') return json({ error: 'El servidor respondió 500' }, 500)
  if (url.pathname === '/api/cabina/memoria' && q.get('memoria') === 'vacia') return json({})
  if (url.pathname === '/api/cabina/memoria') return json({ archivos: (datos.lista as { archivos: { grupo: string; ruta: string; editado: string }[] }).archivos.filter(a => a.grupo === 'memoria').map(a => ({ ruta: a.ruta, fecha: a.editado })), raiz: 'Arbrain', leidoEn: new Date().toISOString() })
  if (url.pathname.startsWith('/api/')) return json({})
  return real(input, init)
}
createRoot(document.getElementById('root')!).render(<div style={{ width: 460, margin: '0 auto', padding: 16 }}><MemoriaTaller /></div>)
