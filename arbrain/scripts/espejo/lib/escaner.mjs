/**
 * Escáner de secretos previo al push del espejo. Nunca devuelve ni imprime el valor encontrado: solo la regla, el
 * archivo y la línea. Dos pasadas: (1) cada archivo antes de entrar al commit, (2) todo lo que se va a empujar
 * (`git log -p` de los commits propios que origin no tiene) antes del push.
 */
import { git } from './git.mjs'
import { porQueNunca } from './viaja.mjs'

export const REGLAS = [
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
  // VARIABLE_KEY=valor con pinta de llave (letras y dígitos, 16+); «=tu-llave-aqui» no cuenta.
  { id: 'asignacion-secreta', re: /^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*[=:]\s*['"]?(?=[^\s'"]*\d)(?=[^\s'"]*[A-Za-z])[^\s'"]{16,}/m },
]

/** Hallazgos en un texto: [{ regla, linea }]. */
export function escanearTexto(texto) {
  const hallazgos = []
  const lineas = String(texto).split(/\r?\n/)
  for (let i = 0; i < lineas.length; i++) {
    for (const r of REGLAS) if (r.re.test(lineas[i])) { hallazgos.push({ regla: r.id, linea: i + 1 }); break }
  }
  return hallazgos
}

/** Un archivo a punto de subir: nombre prohibido o contenido con secreto. Buffer o texto. */
export function escanearArchivo(ruta, contenido) {
  const nombre = porQueNunca(ruta)
  if (nombre) return [{ regla: 'nombre-prohibido', linea: 0, porque: nombre }]
  if (contenido == null) return []
  const texto = Buffer.isBuffer(contenido) ? contenido.toString('latin1') : String(contenido)
  return escanearTexto(texto)
}

/**
 * Todo lo que se va a empujar: los commits de HEAD que no están en origin ni vienen de Arbrain (remoto «dani» y
 * etiquetas firmadas). Revisa nombres de archivo y líneas agregadas. → [{ commit, ruta, regla, linea }]
 */
export function escanearSalida(dir, { remoto = 'origin' } = {}) {
  const excluir = ['--not', `--remotes=${remoto}`, '--remotes=dani', '--tags']
  const hallazgos = []
  const nombres = git(dir, ['log', '--no-merges', '--format=@@%H', '--name-only', '--diff-filter=ACMR', 'HEAD', ...excluir])
  let commit = ''
  for (const l of nombres.out.split('\n')) {
    if (l.startsWith('@@')) { commit = l.slice(2); continue }
    if (l && porQueNunca(l)) hallazgos.push({ commit, ruta: l, regla: 'nombre-prohibido', linea: 0 })
  }
  const p = git(dir, ['log', '--no-merges', '-p', '--no-color', '--no-ext-diff', '--unified=0', '--format=@@%H', 'HEAD', ...excluir])
  let ruta = ''
  let n = 0
  for (const l of p.out.split('\n')) {
    if (l.startsWith('@@') && !l.startsWith('@@ ')) { commit = l.slice(2); continue }
    if (l.startsWith('+++ ')) { ruta = l.replace(/^\+\+\+ (b\/)?/, ''); continue }
    if (l.startsWith('@@ ')) { const m = /\+(\d+)/.exec(l); n = m ? Number(m[1]) - 1 : 0; continue }
    if (l.startsWith('+')) {
      n++
      for (const r of REGLAS) if (r.re.test(l.slice(1))) { hallazgos.push({ commit, ruta, regla: r.id, linea: n }); break }
    }
  }
  return hallazgos
}
