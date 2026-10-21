import React from 'react'
import { createRoot } from 'react-dom/client'
import { VistaExplorador } from '../../src/features/cabina/vistas/Explorador'
import { Codigo } from '../../src/features/cabina/vistas/visor/Codigo'
import { absoluta, buscar, esCarpeta, hijosDe, relativaSegura, visible } from '../../src/features/cabina/explorador/arbol'
import { ThemeProvider } from '../../src/shared/contexts/theme-context'
import { CLAVE_TEMA, CLAVE_TEMA_HASTA } from '../../src/shared/lib/tema-por-hora'
// @ts-expect-error Vite entrega el texto del archivo con ?raw (el visor de código se prueba con código real).
import FUENTE from '../../src/features/cabina/explorador/arbol.ts?raw'
import '../../src/shared/movimiento/movimiento.css'

// Banco aislado del explorador (8 oct 2026): el componente real contra una lista fija con la forma del repo, cero escrituras.
// Parámetros: ?ancho=520 (panel) · ?claro · ?abiertas=docs,arbrain/src (carpetas desplegadas) · ?buscar=arbol · ?codigo (el visor de código).
const q = new URLSearchParams(location.search)
const RAIZ = '/Users/tu-usuario/Developer/artificial-brain'
const LISTA = [
  'CLAUDE.md', 'AGENTS.md', 'README.md', '.gitignore', 'package.json',
  '.claude/memory/MEMORY.md', '.claude/memory/feedback/levy-actuador.md', '.claude/skills/canvas/SKILL.md', '.claude/now.md',
  'arbrain/server/src/server.ts', 'arbrain/server/src/cabina/tools.ts', 'arbrain/server/src/cabina/panel-ajustes.ts', 'arbrain/server/package.json', 'arbrain/server/.env',
  'arbrain/src/features/cabina/Cabina.tsx', 'arbrain/src/features/cabina/vistas/Explorador.tsx', 'arbrain/src/features/cabina/vistas/explorador.module.css',
  'arbrain/src/features/cabina/explorador/arbol.ts', 'arbrain/src/app/layout.tsx', 'arbrain/package.json', 'arbrain/next.config.ts', 'arbrain/node_modules/react/index.js',
  'docs/business-os/MAPA-FUENTES-DE-VERDAD.md', 'docs/business-os/lanzamiento-ht-15-oct/masterclass/masterclass-17-oct.json', 'docs/builds/vista-masterclass-2026-10-07.md',
  'docs/builds/vista-masterclass-2026-10-07/ancho-claro.png', 'docs/pizarron/OFICIO.md', 'docs/Árbol de decisiones.md',
  'biblioteca/pergaminos/mapa/index.html', 'biblioteca/libros/corazon-empresa.pdf', 'contenido/youtube/2026-10/video-ht/final.mp4', 'contenido/youtube/2026-10/video-ht/voz.m4a',
  'entorno-fisico/Brewfile', 'ops/deploy.sh', 'ops/config.toml',
].filter(visible)
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href)
  if (url.pathname === '/api/cabina/explorador') {
    await new Promise(r => setTimeout(r, 160))
    const cabeza = { raiz: { nombre: 'artificial-brain', ruta: RAIZ }, total: 30587, deGit: true }
    const b = url.searchParams.get('buscar')
    if (b != null) return Response.json({ ...cabeza, consulta: b, ...buscar(LISTA, b) })
    const p = relativaSegura(url.searchParams.get('dir'))
    if ('error' in p) return Response.json({ error: p.error }, { status: 403 })
    if (!esCarpeta(LISTA, p.rel)) return Response.json({ error: 'Esa carpeta no existe en el explorador.' }, { status: 404 })
    return Response.json({ ...cabeza, dir: p.rel, abs: absoluta(RAIZ, p.rel), entradas: hijosDe(LISTA, p.rel) })
  }
  return originalFetch(input, init)
}
try {
  localStorage.setItem(CLAVE_TEMA, q.has('claro') ? 'light' : 'dark'); localStorage.setItem(CLAVE_TEMA_HASTA, String(Date.now() + 864e5))
  const abiertas = q.get('abiertas')
  localStorage.setItem('arbrain.explorador.abiertas', JSON.stringify({ raiz: RAIZ, abiertas: abiertas ? abiertas.split(',') : [] }))
  // Un archivo abierto en el panel para ver su punto y el oro del que está a la vista.
  localStorage.setItem('arbrain.panelDerecho.fijadas', JSON.stringify([{ id: 'mano-documento-x', en: Date.now(), input: { vista: 'documento', ruta: `${RAIZ}/arbrain/src/features/cabina/vistas/Explorador.tsx`, titulo: 'Explorador.tsx', explorador: 'previa' } }]))
} catch { /* sin almacenamiento */ }
if (!q.has('claro')) document.documentElement.classList.add('dark')
for (const hoja of Array.from(document.styleSheets)) {
  try { for (const r of Array.from(hoja.cssRules)) { const m = /^\.(__variable_[a-z0-9]+)$/.exec((r as CSSStyleRule).selectorText ?? ''); if (m) document.documentElement.classList.add(m[1]) } } catch { /* hoja ajena */ }
}
document.body.style.fontFamily = 'var(--font-sans)'
const ancho = Number(q.get('ancho')) || 520
createRoot(document.getElementById('root')!).render(<ThemeProvider>
  <div style={{ minHeight: '100dvh', background: 'var(--background)', color: 'var(--foreground)' }}>
    <div style={{ maxWidth: ancho, margin: '0 auto', padding: '20px 16px' }}>
      {q.has('codigo') ? <Codigo texto={FUENTE} archivo="arbol.ts" bytes={FUENTE.length} /> : <VistaExplorador grande={ancho > 700} />}
    </div>
  </div>
</ThemeProvider>)
setTimeout(() => {
  const b = q.get('buscar')
  if (b) { const i = document.querySelector<HTMLInputElement>('input[aria-label="Buscar archivos por nombre"]'); if (i) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(i, b); i.dispatchEvent(new Event('input', { bubbles: true })) } }
}, 700)
