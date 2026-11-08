/**
 * Lo que el diario de conversaciones nunca sube a GitHub (5 nov 2026; docs/builds/espejo-conversaciones-2026-11-05).
 *
 * Las MISMAS reglas del escáner del espejo (`arbrain/scripts/espejo/lib/escaner.mjs › REGLAS`); la prueba de paridad
 * (tests/espejo-conversaciones) falla si alguna cambia de un lado y no del otro. Aquí no se rechaza el archivo: se tapa
 * el valor, así una llave pegada en el chat no frena el espejo de nadie y la conversación sigue viajando.
 */

export const REGLAS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'llave-openrouter', re: /sk-or-(?:v1-)?[A-Za-z0-9_-]{20,}/ },
  { id: 'llave-anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'llave-openai', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'token-github', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { id: 'llave-privada', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'llave-aws', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'token-google', re: /\bya29\.[A-Za-z0-9_-]{20,}/ },
  { id: 'refresh-google', re: /\b1\/\/0[A-Za-z0-9_-]{20,}/ },
  { id: 'llave-google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'token-slack', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: 'llave-groq', re: /\bgsk_[A-Za-z0-9]{20,}/ },
  { id: 'token-telegram', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'campo-secreto-json', re: /"(?:refresh_token|access_token|id_token|client_secret|api_key|apiKey|private_key|password)"\s*:\s*"[^"\s]{12,}"/ },
  { id: 'asignacion-secreta', re: /^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*[=:]\s*['"]?(?=[^\s'"]*\d)(?=[^\s'"]*[A-Za-z])[^\s'"]{16,}/m },
]

export const TAPADO = '[llave omitida por el espejo]'

/** Campos JSON que el escáner considera secretos si traen un valor largo. */
const CAMPOS_SECRETOS = new Set(['refresh_token', 'access_token', 'id_token', 'client_secret', 'api_key', 'apiKey', 'private_key', 'password'])

/** El bloque PEM completo, no solo su encabezado: la llave está en el cuerpo. */
const PEM = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/g

/** Tapa en un texto todo lo que tenga forma de llave. Devuelve el mismo string si no había nada. */
export function taparTexto(texto: string): string {
  let t = texto.replace(PEM, TAPADO)
  for (const { id, re } of REGLAS) {
    if (id === 'llave-privada') continue
    if (id === 'asignacion-secreta') {
      // Por línea: tapa el valor y deja el nombre de la variable (sirve para seguir la conversación).
      t = t.replace(/^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*[=:]\s*['"]?)(?=[^\s'"]*\d)(?=[^\s'"]*[A-Za-z])[^\s'"]{16,}/gm, `$1${TAPADO}`)
      continue
    }
    if (id === 'campo-secreto-json') {
      t = t.replace(/("(?:refresh_token|access_token|id_token|client_secret|api_key|apiKey|private_key|password)"\s*:\s*")[^"\s]{12,}"/g, `$1${TAPADO}"`)
      continue
    }
    t = t.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), TAPADO)
  }
  return t
}

/** Copia profunda de una fila con todo valor sospechoso tapado (textos y campos con nombre de secreto). */
export function taparValor<T>(v: T, clave?: string): T {
  if (typeof v === 'string') {
    if (clave && CAMPOS_SECRETOS.has(clave) && /^[^"\s]{12,}$/.test(v)) return TAPADO as unknown as T
    return taparTexto(v) as unknown as T
  }
  if (Array.isArray(v)) return v.map((x) => taparValor(x)) as unknown as T
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = taparValor(x, k)
    return o as T
  }
  return v
}

/** ¿El escáner del espejo rechazaría esta línea? (mismo recorrido: línea por línea, primera regla que pega). */
export function pareceSecreto(texto: string): string | null {
  for (const linea of texto.split(/\r?\n/)) {
    for (const { id, re } of REGLAS) if (re.test(linea)) return id
  }
  return null
}
