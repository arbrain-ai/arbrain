/**
 * Los textos automáticos del motor, en español. Copia de `arbrain/server/src/editor/textos.ts › aEspanol` (pura, sin
 * dependencias: así lo pide el contrato §12.5) más las frases que la interfaz encontró en la vuelta 1 (versiones, ramas,
 * revisiones). Lo que no reconoce lo deja tal cual: los textos del agente ya salen en español por la skill.
 */
const segundos = (s: string) => s.replace('.', ',')
const plural = (n: string, uno: string, varios: string) => (n === '1' ? uno : varios)

const REGLAS: [RegExp, (...m: string[]) => string][] = [
  [/^Removed ([\d.]+) s across (\d+) cuts\.?/, (_, s, n) => `Quité ${segundos(s)} s en ${n} cortes.`],
  [/^Removed ([\d.]+) s at ([\d:]+)\.?/, (_, s, t) => `Quité ${segundos(s)} s en ${t}.`],
  [/^Removed ([\d.]+ ?\w*) of footage in (\d+) cuts?\.?/, (_, s, n) => `Quité ${s} de material en ${n} ${plural(n, 'corte', 'cortes')}.`],
  [/^Review (\d+) optional dialogue cuts?/, (_, n) => `Revisar ${n} ${plural(n, 'corte opcional', 'cortes opcionales')} de diálogo`],
  [/^Optional dialogue cuts · /, () => 'Cortes opcionales de diálogo · '],
  [/^Empty timeline$/, () => 'Línea de tiempo vacía'],
  [/^Checked out version (\w+)/, (_, v) => `Vuelta a la versión ${v.slice(0, 8)}`],
  [/^Reverted (?:version )?(\w+)/, (_, v) => `Deshecha la edición ${v.slice(0, 8)}`],
  [/^Restored (?:version )?(\w+)/, (_, v) => `Restaurada la versión ${v.slice(0, 8)}`],
  [/^Put back (\d+) edits?/, (_, n) => `Devueltas ${n} ${plural(n, 'edición', 'ediciones')}`],
  // Las fórmulas fijas del pase de diálogo del motor (`/dialogue-pass` sin la skill de estilo, que ya escribe en español).
  [/^Tightened the pause (before|after|inside) /, (_, d) => `Acorté la pausa ${({ before: 'antes de', after: 'después de', inside: 'dentro de' } as Record<string, string>)[d]} `],
  [/^Cut the wait and breath (before|after) /, (_, d) => `Quité la espera y la respiración ${d === 'before' ? 'antes de' : 'después de'} `],
  [/^Cut the (?:pause|wait) (before|after) /, (_, d) => `Quité la pausa ${d === 'before' ? 'antes de' : 'después de'} `],
]
const FRASES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/\s*Dialogue cuts are pending review\.?/g, ' Hay cortes de diálogo esperando tu revisión.'],
  [/\s*Nothing to review\.?/g, ' Nada que revisar.'],
  [/(\d+) restored/g, (_: string, n: string) => `${n} ${plural(n, 'mantenido', 'mantenidos')}`],
]

/** «Removed 441 s across 61 cuts.» → «Quité 441 s en 61 cortes.» (y el resto de frases conocidas). */
export function aEspanol(texto: string | null | undefined): string {
  if (!texto) return ''
  let t = texto
  for (const [re, fn] of REGLAS) {
    const m = re.exec(t)
    if (m) { t = fn(...m) + t.slice(m[0].length); break }
  }
  for (const [re, es] of FRASES) t = typeof es === 'string' ? t.replace(re, es) : t.replace(re, es as (...m: string[]) => string)
  return t.trim()
}

/** Estados del motor en palabras de Daniel. */
export const ESTADO_CAMBIO: Record<string, string> = {
  proposed: 'Propuesto', rendering: 'Preparando', ready: 'Esperando tu decisión', approved: 'Aplicado', rejected: 'Rechazado', revising: 'Revisando…', failed: 'Falló',
}
