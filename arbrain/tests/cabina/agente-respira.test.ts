// El agente que respira (28 oct 2026, Daniel: «un icono de agentes… que cumpla la misma animación… ámbar clarito»):
// solo en los renglones «Trabajando» del Taller (28 oct 07:54); ámbar claro, AA y quieta con reduced-motion.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const leer = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
const css = leer('src/features/cabina/panel/agente-respira.module.css')

const lum = (hex: string) => {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

test('el agente que respira vive SOLO en los renglones «Trabajando» del Taller; el resto, punto morado quieto', () => {
  // 28 oct 07:54, Daniel: «Lo único que quería de cambio eran los subagentes trabajando, justo en la sección "Trabajando para ti"».
  assert.match(leer('src/features/cabina/panel/TableroAgentes.tsx'), /<AgenteRespira tam=\{12\} late=\{laten\(f, ahora\)\} \/>/)
  for (const rel of ['src/features/cabina/panel/Taller.tsx', 'src/features/cabina/panel/AgentesTrabajando.tsx',
    'src/features/chat/components/RastroTurno.tsx', 'src/features/chat/components/AgentTaskCard.tsx']) {
    assert.doesNotMatch(leer(rel), /AgenteRespira|mov\.late|animate-spin/, rel)
  }
  assert.match(leer('src/features/cabina/panel/Taller.tsx'), /tb\.luzSobria\}`\} data-vivo=\{n\.trabajando > 0/)
  assert.match(leer('src/features/cabina/panel/AgentesTrabajando.tsx'), /puntoVivo/)
  const panel = leer('src/features/cabina/panel/panel.module.css')
  assert.match(panel, /\.puntoVivo \{ background: var\(--l-tinta-morado/)
  assert.doesNotMatch(panel, /puntoVivo[^{]*\{[^}]*animation/)
  const herr = leer('src/features/chat/components/herramientas.module.css')
  assert.match(herr, /\.puntoEstado\[data-estado='corriendo'\] \{ background: rgb\(var\(--primary-rgb\)\); \}/)
  assert.doesNotMatch(herr, /\.puntoEstado\[data-estado='corriendo'\]\s*\{[^}]*animation/)
})

test('ámbar claro con contraste AA de gráfico (3:1) en claro y oscuro', () => {
  const claro = /--trazo: var\(--l-ambar-5, (#[0-9a-f]{6})\)/.exec(css)?.[1]
  const oscuro = /\.dark\) \.agente \{ --trazo: var\(--l-ambar-2, (#[0-9a-f]{6})\)/.exec(css)?.[1]
  assert.ok(claro && oscuro)
  for (const fondo of ['#ffffff', '#f4f4f5']) assert.ok(contraste(claro, fondo) >= 3, `claro sobre ${fondo}`)
  for (const fondo of ['#141418', '#09090b', '#18181b']) assert.ok(contraste(oscuro, fondo) >= 3, `oscuro sobre ${fondo}`)
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /morado|brand/)
})

test('respira como el anillo y se queda quieto con movimiento reducido', () => {
  assert.match(css, /@keyframes respira \{ 0%, 100% \{ transform: scale\(1\); opacity: 1; \} 50% \{ transform: scale\(1\.3\); opacity: 0\.5; \} \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.agente\[data-late\], \.agente\[data-late\]::before \{ animation: none; \} \}/)
})
