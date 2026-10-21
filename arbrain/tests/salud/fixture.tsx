import React from 'react'
import { createRoot } from 'react-dom/client'
import { VistaSalud } from '../../src/features/cabina/vistas/Salud'
import { ThemeProvider } from '../../src/shared/contexts/theme-context'
import { sumarDias, type DatosSalud, type Dia, type Marca } from '../../src/features/salud/modelo'
import { CLAVE_TEMA, CLAVE_TEMA_HASTA } from '../../src/shared/lib/tema-por-hora'
import '../../src/shared/movimiento/movimiento.css'

// Banco aislado de la vista Salud (5 oct 2026): componentes reales, datos SINTÉTICOS, cero escrituras. Los datos reales
// de Daniel no entran al repo: sus capturas se toman en su panel. Parámetros: ?ancho=520 (panel) · ?claro ·
// ?conecta (usuario sin reloj) · ?studio (la ruta propia de Daniel) · ?estado=calma|vigila|sin · ?llego (el primer envío llegó).
const q = new URLSearchParams(location.search)
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const onda = (i: number, a: number, p: number) => Math.sin(i / p) * a
const dias: Dia[] = []
for (let i = 64; i >= 1; i--) {
  if ([33, 34, 35, 18, 9].includes(i)) continue // días sin medir: el reloj no se usó
  const fecha = sumarDias(hoy, -i)
  dias.push({
    fecha, sueno_horas: +(7.25 + onda(i, 0.55, 2.3) + (i % 7 === 5 ? -0.9 : 0)).toFixed(2), sueno_deep_h: +(0.85 + onda(i, 0.18, 3)).toFixed(2), sueno_rem_h: +(1.8 + onda(i, 0.35, 2.7)).toFixed(2),
    sueno_core_h: +(4.4 + onda(i, 0.4, 3.3)).toFixed(2), sueno_awake_h: +(0.35 + onda(i, 0.12, 1.9)).toFixed(2), hrv_ms: +(40 + onda(i, 5.5, 2.1) + (i < 8 ? 4 : 0)).toFixed(2),
    resting_hr: Math.round(62.5 + onda(i, 1.6, 2.6)), pasos: Math.round(8200 + onda(i, 2600, 1.7)), vo2max: i % 9 === 0 ? 40.4 : null,
    resp_rate: +(17.1 + onda(i, 0.25, 2.2)).toFixed(2), temp_muneca: i % 6 === 0 ? null : +(35.65 + onda(i, 0.15, 2.4)).toFixed(2),
  })
}
const estado = q.get('estado')
const deHoy: Dia = estado === 'sin' ? { fecha: hoy, pasos: 2100 }
  : estado === 'calma' ? { fecha: hoy, sueno_horas: 5.6, sueno_deep_h: 0.5, sueno_rem_h: 1.0, sueno_core_h: 3.7, sueno_awake_h: 0.4, hrv_ms: 31, resting_hr: 67, pasos: 3400, resp_rate: 17.3, temp_muneca: 35.7 }
  : estado === 'vigila' ? { fecha: hoy, sueno_horas: 7.0, sueno_deep_h: 0.7, sueno_rem_h: 1.6, sueno_core_h: 4.3, sueno_awake_h: 0.4, hrv_ms: 33, resting_hr: 66, pasos: 2900, resp_rate: 18.9, temp_muneca: 36.35 }
  : { fecha: hoy, sueno_horas: 7.5, sueno_deep_h: 1.0, sueno_rem_h: 2.0, sueno_core_h: 4.0, sueno_awake_h: 0.5, hrv_ms: 50, resting_hr: 60, pasos: 5000, resp_rate: 16.5, temp_muneca: null }
dias.push(deHoy)
const noches = dias.slice(-10).filter(d => d.sueno_horas).map(d => ({ fecha: d.fecha, inicio: `${sumarDias(d.fecha, -1)} 21:${String(10 + (d.fecha.charCodeAt(9) % 40)).padStart(2, '0')}:00 -0600`, fin: `${d.fecha} 06:${String(5 + (d.fecha.charCodeAt(8) % 30)).padStart(2, '0')}:00 -0600` }))
// Hábitos: «Rutina matutina» con marcas de los dos lados (compara); «Leer 20 min» solo con cumplidos (faltan muestras).
const marcas: Marca[] = []
for (let i = 1; i <= 40; i++) {
  const f = sumarDias(hoy, -i)
  if (i % 3 !== 0) marcas.push({ fecha: f, clave: 'rutina_matutina', hecho: i % 4 !== 1 })
  if (i < 9) marcas.push({ fecha: f, clave: 'lectura', hecho: true })
}
marcas.push({ fecha: hoy, clave: 'rutina_matutina', hecho: true })
const conecta = q.has('conecta'), studio = q.has('studio')
let llego = q.has('llego')
const datos = (): DatosSalud => ({
  fuente: studio ? 'studio' : 'arbrain', hoy, dias: conecta ? [] : dias, noches: conecta ? [] : noches,
  ultimoEnvio: conecta ? null : new Date(Date.now() - (estado === 'sin' ? 30 * 3600_000 : 47 * 60_000)).toISOString(),
  pacto: studio ? [
    { key: 'sueno_horas', nombre: 'Sueño', unidad: 'h', verde: 7, amarillo: 6, mejor: 'alto', valor: 7.78, n: 7, ultima: hoy, color: 'verde' },
    { key: 'hrv_ms', nombre: 'HRV (SDNN)', unidad: 'ms', verde: 38.5, amarillo: 33, mejor: 'alto', valor: 46.84, n: 7, ultima: hoy, color: 'verde' },
    { key: 'resting_hr', nombre: 'Resting HR', unidad: 'bpm', verde: 62, amarillo: 66, mejor: 'bajo', valor: 63.1, n: 7, ultima: hoy, color: 'amarillo' },
    { key: 'energia_am', nombre: 'Energía AM', unidad: '/10', verde: 8, amarillo: 5, mejor: 'alto', valor: null, n: 0, ultima: null, color: null },
  ] : null,
  habitos: conecta ? [] : [{ clave: 'objetivo_dia', nombre: 'Objetivo del día' }, { clave: 'lectura', nombre: 'Leer 20 min' }, { clave: 'rutina_matutina', nombre: 'Rutina matutina' }],
  marcas: conecta ? [] : marcas, prioridad: conecta ? null : 'Grabar el video 3 de la masterclass',
  conexion: { tieneToken: conecta ? llego : true, pista: 'x7Qa', ultimoEnvio: conecta ? (llego ? new Date(Date.now() - 40_000).toISOString() : null) : new Date(Date.now() - 47 * 60_000).toISOString(), muestras: llego || !conecta ? 3893 : null, error: null, url: 'https://estudio.ejemplo.ts.net/api/salud/ingest' },
  planPersonal: false, leidoEn: new Date().toISOString(), errores: [],
})
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = String(input)
  await new Promise(r => setTimeout(r, 250))
  if (url.startsWith('/api/salud/conexion')) {
    if (init?.method === 'POST') { llego = false; return Response.json({ token: 'arb_salud_ejemplo_no_es_un_token_real', conexion: { ...datos().conexion, tieneToken: true, ultimoEnvio: null } }) }
    return Response.json({ conexion: datos().conexion })
  }
  if (url.startsWith('/api/salud')) return Response.json(datos())
  return originalFetch(input, init)
}
// El tema lo decide el ThemeProvider desde localStorage: se fija ahí (con vigencia) para que no lo pise la hora.
try { localStorage.setItem(CLAVE_TEMA, q.has('claro') ? 'light' : 'dark'); localStorage.setItem(CLAVE_TEMA_HASTA, String(Date.now() + 864e5)) } catch { /* sin almacenamiento */ }
if (!q.has('claro')) document.documentElement.classList.add('dark')
const ancho = Number(q.get('ancho')) || 1120
createRoot(document.getElementById('root')!).render(<ThemeProvider>
  <div style={{ minHeight: '100dvh', background: 'var(--background)', color: 'var(--foreground)' }}>
    <div style={{ maxWidth: ancho, margin: '0 auto', padding: '20px 16px' }}><VistaSalud grande={ancho > 700} /></div>
  </div>
</ThemeProvider>)
