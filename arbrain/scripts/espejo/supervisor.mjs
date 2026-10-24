/**
 * Enganche del espejo con el modo servidor (`arbrain/scripts/servidor.mjs`). Toda la lógica vive aquí; servidor.mjs
 * solo pide el entorno del daemon y arranca el ciclo.
 *
 *   entornoDaemon(cerebro)  → { CLAUDECLAW_ROLE, ARBRAIN_ESPEJO_GUARDA? }
 *       Espejo apagado (de fábrica): { CLAUDECLAW_ROLE: 'full' }, exactamente lo de hoy.
 *       Encendido: el rol sale de lider.json (`full` el líder, `chat` el resto) y el daemon recibe la ruta de la cerca
 *       (`ARBRAIN_ESPEJO_GUARDA`), que consulta antes de cada rutina (server/src/cliente/espejo.ts).
 *   arrancarCiclo({ cerebro, node, registrar, alCambiarRol, intervaloMs })
 *       Cada ≈ 5 min corre `espejo.mjs sincronizar` en un proceso aparte (nunca bloquea al supervisor) y registra sus
 *       avisos nuevos. Si el rol que
 *       sale de lider.json cambia (la persona eligió otro líder), llama alCambiarRol(nuevo): el supervisor relanza el
 *       daemon y el viejo líder apaga su scheduler. Devuelve detener().
 */
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerMaquina } from './lib/estado.mjs'
import { liderLocal, rolPara } from './lib/lider.mjs'

export const ESPEJO_MJS = join(fileURLToPath(new URL('.', import.meta.url)), 'espejo.mjs')
export const INTERVALO_MS = 5 * 60_000

export function rolDe(cerebro) {
  const m = leerMaquina(cerebro)
  return m.activo ? rolPara(m.host, liderLocal(cerebro)) : 'full'
}

export function entornoDaemon(cerebro) {
  const m = leerMaquina(cerebro)
  if (!m.activo) return { CLAUDECLAW_ROLE: 'full' }
  return { CLAUDECLAW_ROLE: rolPara(m.host, liderLocal(cerebro)), ARBRAIN_ESPEJO_GUARDA: ESPEJO_MJS }
}

export function arrancarCiclo({ cerebro, node = process.execPath, registrar = () => {}, alCambiarRol = () => {}, intervaloMs, env = process.env } = {}) {
  if (!leerMaquina(cerebro).activo) return { activo: false, detener() {} }
  const cada = intervaloMs ?? (Number(env.ARBRAIN_ESPEJO_INTERVALO_MS) > 0 ? Number(env.ARBRAIN_ESPEJO_INTERVALO_MS) : INTERVALO_MS)
  let rol = rolDe(cerebro)
  let corriendo = false
  let detenido = false
  const vuelta = () => {
    if (corriendo || detenido) return
    corriendo = true
    execFile(node, [ESPEJO_MJS, 'sincronizar', '--json', '--cerebro', cerebro], { cwd: cerebro, timeout: 4 * 60_000, env }, (_err, stdout) => {
      corriendo = false
      let r = null
      try { r = JSON.parse(String(stdout).trim().split('\n').pop()) } catch { /* sin salida */ }
      if (r && r.codigo !== 'ok') registrar(`Espejo: ${r.motivo}`)
      // Los avisos para la persona (líder sin señales, choque guardado como copia, secreto que no subió…) quedan en
      // el registro del servidor además de en .arbrain-espejo/avisos.jsonl, que es de donde los cuenta Levy.
      for (const a of r?.avisos ?? []) registrar(`Espejo · aviso (${a.tipo}): ${a.texto}`)
      const nuevo = rolDe(cerebro)
      if (!detenido && nuevo !== rol) {
        registrar(`Espejo: cambió quién manda; esta máquina pasa de ${rol} a ${nuevo}.`)
        rol = nuevo
        alCambiarRol(nuevo)
      }
    })
  }
  const timer = setInterval(vuelta, cada)
  timer.unref?.()
  setTimeout(vuelta, 5_000).unref?.()
  return { activo: true, rol: () => rol, vuelta, detener() { detenido = true; clearInterval(timer) } }
}
