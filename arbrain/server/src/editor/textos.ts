/**
 * Los textos automáticos del motor, en español (19 nov 2026). El motor Scarlet arma sus resúmenes en inglés
 * (packages/timeline/src/cutReview.ts › describeDialogueRemovals y compañía). Se traducen aquí, del lado de Arbrain,
 * en vez de parchar el motor: un parche obliga a recompilar y repetir el examen del español en cada salto de versión.
 * Lo que no reconoce lo deja tal cual (los textos del agente ya salen en español por la skill daniel-talking-head).
 * La interfaz (arbrain/src/features/editor) puede copiar esta función tal cual: es pura y sin dependencias.
 */

const segundos = (s: string) => s.replace('.', ',')

const REGLAS: [RegExp, (...m: string[]) => string][] = [
  [/^Removed ([\d.]+) s across (\d+) cuts\.?/, (_, s, n) => `Quité ${segundos(s)} s en ${n} cortes.`],
  [/^Removed ([\d.]+) s at ([\d:]+)\.?/, (_, s, t) => `Quité ${segundos(s)} s en ${t}.`],
  [/^Removed ([\d.]+ ?\w*) of footage in (\d+) cuts?\.?/, (_, s, n) => `Quité ${s} de material en ${n} ${n === '1' ? 'corte' : 'cortes'}.`],
  [/^Review (\d+) optional dialogue cuts?/, (_, n) => `Revisar ${n} ${n === '1' ? 'corte opcional' : 'cortes opcionales'} de diálogo`],
  [/^Optional dialogue cuts · /, () => 'Cortes opcionales de diálogo · '],
  [/^Toma cruda desde OBS/, () => 'Toma cruda desde OBS'],
]
const FRASES: [RegExp, string][] = [
  [/\s*Dialogue cuts are pending review\.?/g, ' Hay cortes de diálogo esperando tu revisión.'],
  [/\s*Nothing to review\.?/g, ' Nada que revisar.'],
]

/** «Removed 441 s across 61 cuts.» → «Quité 441 s en 61 cortes.» (y el resto de frases conocidas). */
export function aEspanol(texto: string | null | undefined): string {
  if (!texto) return ''
  let t = texto
  for (const [re, fn] of REGLAS) {
    const m = re.exec(t)
    if (m) { t = fn(...m) + t.slice(m[0].length); break }
  }
  for (const [re, es] of FRASES) t = t.replace(re, es)
  return t.trim()
}

/** Segundos → «m:ss» (o «h:mm:ss»). */
export function reloj(s: number | null | undefined): string {
  const t = Math.max(0, Math.round(s ?? 0))
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, ss = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
