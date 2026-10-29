/**
 * Guardián de disco del VPS (29 oct 2026). Daniel: «cuando el vps esté digamos al 95%, podamos sin estar yo en el medio
 * activarte y que hagas una limpieza similar como esta».
 *
 * El vigía de seguridad (negocio/ops/seguridad/vigia.py, Studio, cada 10 min) mide el disco y, al ≥ 90 % (aviso) o
 * ≥ 95 % (acción), pide aquí (`POST /cabina {que:"guardian-disco"}`) un subagente por la vía de siempre (`delegar`,
 * Opus por default del adaptador). El oficio vive en
 * `.claude/skills/agentic-server/references/limpieza-disco-vps.md`; este módulo solo arma el encargo y pone el candado
 * del lado del motor: si ya hay un guardián trabajando, no se lanza otro (409). El tope de una vez cada 6 h y el aviso
 * único a Daniel los lleva el vigía, que es quien lee el resultado.
 *
 * El encargo lo arma el servidor, nunca quien llama: la ruta solo acepta fase, porcentaje, id, la ruta del resultado
 * (dentro de la carpeta del vigía o de /tmp) y `simulacro`, que deja al agente en seco (solo `--plan`, nada se borra).
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DUENO, instalacionOriginal } from '../dueno.js'
import { repoPrincipal } from './aislamiento.js'

export const GUARDIAN_NOMBRE = 'Guardián de disco del VPS'
export const REFERENCIA = '.claude/skills/agentic-server/references/limpieza-disco-vps.md'
export const SCRIPT = 'negocio/ops/seguridad/vps/limpieza-disco-segura'
/** Un guardián que no terminó en este plazo ya no bloquea (el vigía lo da por perdido a las 3 h y avisa). */
export const PLAZO_MS = 3 * 3600_000
/** El VPS por SSH: `ARBRAIN_VPS_SSH` > `vps_ssh` de la instalación original > marcador (la copia del alumno no tiene VPS). */
export const vpsSsh = (env: NodeJS.ProcessEnv = process.env): string =>
  (env.ARBRAIN_VPS_SSH ?? '').trim() || (instalacionOriginal().vps_ssh ?? '').trim() || 'root@tu-vps'

export interface PedidoGuardian { fase: 'aviso' | 'accion'; pct: number; id: string; resultado: string; simulacro: boolean }

const dirVigia = () => join(homedir(), 'Library/Application Support/ArbrainSeguridad/guardian')

/** Valida lo que llega del vigía. Devuelve el pedido limpio o el error en palabras. */
export function pedidoGuardian(p: Record<string, unknown>, dir = dirVigia()): PedidoGuardian | { error: string } {
  const fase = p.fase
  if (fase !== 'aviso' && fase !== 'accion') return { error: 'Fase desconocida (aviso o accion).' }
  const pct = Number(p.pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: 'Porcentaje de disco inválido.' }
  const id = typeof p.id === 'string' ? p.id : ''
  if (!/^[a-z0-9-]{4,40}$/.test(id)) return { error: 'Falta el id de la corrida.' }
  const r = typeof p.resultado === 'string' ? resolve(p.resultado) : ''
  const dentro = (base: string) => r.startsWith(resolve(base) + '/')
  if (!r.endsWith('.json') || !(dentro(dir) || dentro('/tmp') || dentro('/private/tmp'))) return { error: 'La ruta del resultado debe ir en la carpeta del vigía o en /tmp.' }
  return { fase, pct: Math.round(pct * 10) / 10, id, resultado: r, simulacro: p.simulacro === true }
}

/** El encargo completo, con su Definición de Terminado. Pura. */
export function encargoGuardian(p: PedidoGuardian, repo: string): string {
  const ref = `${repo}/${REFERENCIA}`, script = `${repo}/${SCRIPT}`
  const nivel = p.fase === 'accion'
    ? `Fase ACCIÓN (disco ≥ 95 %): aplica el nivel A y, solo si después de A sigue en 90 % o más, el nivel B (respaldos con copia verificada a la Studio). Nunca el nivel C.`
    : `Fase AVISO (disco entre 90 y 95 %): aplica solo el nivel A. El nivel B queda como recomendación en «pendiente», sin tocarlo.`
  const seco = p.simulacro
    ? `\n\nSIMULACRO: esto es una prueba del disparador. NO borres ni muevas nada. Corre el script solo con --plan, mide y escribe el resultado con "simulacro": true y "despues_pct" igual al disco real medido.`
    : ''
  const vps = vpsSsh()
  return `Eres el ${GUARDIAN_NOMBRE}. El vigía de seguridad midió el disco del VPS (${vps}) al ${p.pct} % y te lanzó sin ${DUENO} en medio.

Lee COMPLETO el oficio antes de tocar nada: ${ref}. Manda sobre cualquier otra idea tuya: nivel A sin preguntar, nivel B solo con copia verificada por checksum, nivel C prohibido.

${nivel}${seco}

Pasos:
1. Mide: \`ssh ${vps} 'df -h /; du -xh --max-depth=2 /opt 2>/dev/null | sort -rh | head -25'\`.
2. Nivel A en seco: \`ssh ${vps} 'python3 - --plan' < ${script}\`. Revisa que cada paso tenga sentido.
3. ${p.simulacro ? 'Simulacro: no apliques nada.' : `Aplica: \`ssh ${vps} 'python3 - --aplicar' < ${script}\`.`}
4. Si sigue alto, diagnostica qué creció (el oficio lista los grandes conocidos y sus dueños). Lo que no sea nivel A o B no lo borras: va a «pendiente» como decisión para ${DUENO} (sí o no, con tu recomendación).
5. Escribe UN archivo JSON en ${p.resultado} con exactamente estas llaves:
   {"id": "${p.id}", "fase": "${p.fase}", "simulacro": ${p.simulacro}, "antes_pct": <número>, "despues_pct": <número>, "liberado_gb": <número>, "acciones": ["<qué borraste y cuánto, una línea cada una>"], "pendiente": "<la decisión que necesita ${DUENO}, o null>"}

Tu carpeta de trabajo es /tmp: no edites el repo. No le escribas a nadie ni mandes avisos: el vigía lee tu archivo y le manda a ${DUENO} un solo aviso. No reinicies servicios ni contenedores. No hagas commits.

Definición de Terminado:
- Existe ${p.resultado} con JSON válido y las 8 llaves, y despues_pct es una medición real de \`df /\` tomada al final.
- Cada línea de «acciones» corresponde a algo del nivel permitido (A, o B con su checksum anotado).
- Nada del nivel C se tocó.`
}

export interface PuertoGuardian {
  /** Guardianes del registro que no están cerrados, con su fecha de creación. */
  abiertos(): Promise<{ id: number; creado: string; corriendo: boolean }[]>
  delegar(p: import('./sin-pantalla.js').PedidoDelegar): Promise<{ id: number }>
  repo(): string
}

const puertoReal = (): PuertoGuardian => ({
  abiertos: async () => {
    const { leerRegistro } = await import('./cuerpo.js')
    const { estadoDe } = await import('./sin-pantalla.js')
    const subs = (await leerRegistro()).filter(s => s.nombre === GUARDIAN_NOMBRE && !s.cerrado)
    return Promise.all(subs.map(async s => ({ id: s.id, creado: s.creado, corriendo: s.modo === 'sin-pantalla' ? (await estadoDe(s)).corriendo : true })))
  },
  delegar: async p => (await import('./cuerpo.js')).delegar(p),
  // El repo principal del Studio (no el worktree de quien construyó esto): ahí están el oficio y el script.
  repo: repoPrincipal,
})

/** Candado + lanzamiento. 409 si ya hay un guardián trabajando (creado hace menos del plazo). */
export async function lanzarGuardian(p: PedidoGuardian, puerto: PuertoGuardian = puertoReal(), ahora = Date.now()): Promise<{ ok: true; agente: number } | { ok: false; status: number; error: string }> {
  const vivos = (await puerto.abiertos()).filter(s => s.corriendo && ahora - Date.parse(s.creado) < PLAZO_MS)
  if (vivos.length) return { ok: false, status: 409, error: `Ya hay un guardián trabajando (agente ${vivos[0].id}).` }
  try {
    const sub = await puerto.delegar({
      // Trabaja en su carpeta de /tmp: el motor no deja a un subagente en el checkout principal, y el guardián no
      // escribe código. Lee el oficio y el script por ruta absoluta del repo.
      nombre: GUARDIAN_NOMBRE, harness: 'claude', encargo: encargoGuardian(p, puerto.repo()), cwd: `/tmp/guardian-disco-${p.id}`,
      aislamiento: 'carpeta', perfil: 'total', esfuerzo: 'high',
    })
    return { ok: true, agente: sub.id }
  } catch (e) {
    return { ok: false, status: 503, error: e instanceof Error ? e.message : 'No se pudo lanzar.' }
  }
}
