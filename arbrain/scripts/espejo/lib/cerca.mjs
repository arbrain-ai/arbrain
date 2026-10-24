/**
 * Cerca antes de cada rutina del líder (DISENO §2.2–2.3). En orden:
 *   1. ¿Sigo mandando? Se pregunta a origin (git fetch), no a la copia local. Si origin dice otro líder, no corre nada.
 *      Sin red: una rutina con efecto externo solo corre si el mando se confirmó hace menos de 15 min; si no, se pospone.
 *      Las internas (lista `internas` de arbrain/cerebro/espejo.json) corren si la copia local dice que mando.
 *   2. Tope: la llave con que corre la rutina tiene tope verificado (tope.mjs). Sin tope, no corre y lo dice.
 *   3. Folio `<rutina>:<fecha>:<objetivo>`: si ya está en `arbrain/cerebro/enviados/*.jsonl` de cualquier máquina (en
 *      origin o aquí), no se repite. Si no, se reserva en el archivo de esta máquina y se sube antes de correr.
 * Con el espejo apagado devuelve { correr: true } sin tocar nada: la edición cliente se comporta como hoy.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ahora, conCandado, fechaLocal, guardarEstado, leerEstado, leerMaquina } from './estado.mjs'
import { git, identidad, mostrar } from './git.mjs'
import { liderEn, liderLocal, rolPara } from './lider.mjs'
import { ciclo } from './sync.mjs'
import { verificarTope } from './tope.mjs'
import { CONFIG_VERSIONADA, ENVIADOS_DIR } from './viaja.mjs'

export const VENTANA_CONFIRMACION_MS = 15 * 60_000

export function configVersionada(cerebro) {
  try { const j = JSON.parse(readFileSync(join(cerebro, CONFIG_VERSIONADA), 'utf8')); return j && typeof j === 'object' ? j : {} } catch { return {} }
}

const lineasFolio = (texto) => String(texto ?? '').split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter((x) => x?.folio)

/** ¿Quién registró ya este folio? Busca en origin y en la copia local. → host o null */
export function buscarFolio(cerebro, folio, remoto) {
  if (remoto) {
    const ls = git(cerebro, ['ls-tree', '-r', '--name-only', '-z', remoto, '--', ENVIADOS_DIR])
    for (const ruta of ls.out.split('\0').filter((p) => p.endsWith('.jsonl'))) {
      const hit = lineasFolio(mostrar(cerebro, remoto, ruta)).find((x) => x.folio === folio)
      if (hit) return hit.host ?? ruta
    }
  }
  const dir = join(cerebro, ENVIADOS_DIR)
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
    const hit = lineasFolio(readFileSync(join(dir, f), 'utf8')).find((x) => x.folio === folio)
    if (hit) return hit.host ?? f
  }
  return null
}

export async function cerca(cerebro, { rutina, externa, objetivo, llave, env = process.env, fetchFn } = {}) {
  const m = leerMaquina(cerebro)
  if (!m.activo) return { correr: true, codigo: 'apagado', motivo: 'Espejo apagado: la rutina corre como siempre.' }
  if (!rutina || !/^[A-Za-z0-9:_.-]{1,80}$/.test(rutina)) return { correr: false, tipo: 'aviso', codigo: 'sin_rutina', motivo: 'Falta el nombre de la rutina.' }
  const { host, rama } = m
  const esExterna = externa ?? !(configVersionada(cerebro).internas ?? []).includes(rutina)
  const r = await conCandado(cerebro, async () => {
    const t = ahora(env)
    const remoto = `refs/remotes/origin/${rama}`
    // 1. Mando, confirmado en origin.
    const f = git(cerebro, ['fetch', '-q', 'origin', `+refs/heads/${rama}:${remoto}`], { plazo: 30_000 })
    if (f.ok) {
      const lider = liderEn(cerebro, remoto)
      guardarEstado(cerebro, { confirmado: { en: t.toISOString(), lider: lider?.lider ?? null } })
      if (rolPara(host, lider) !== 'full') {
        return { correr: false, tipo: 'aviso', codigo: 'no_mandas', motivo: lider ? `Esta rutina no corre en ${host}: en tu GitHub manda ${lider.lider}.` : 'Nadie manda todavía en tu espejo: ninguna máquina corre rutinas hasta que elijas cuál.' }
      }
    } else {
      const c = leerEstado(cerebro).confirmado
      const fresca = c?.lider === host && t.getTime() - new Date(c.en).getTime() < VENTANA_CONFIRMACION_MS
      if (esExterna && !fresca) return { correr: false, tipo: 'aviso', codigo: 'sin_confirmar', motivo: 'No pude confirmar con tu GitHub que esta máquina sigue al mando. Pospongo esta rutina porque tiene efecto afuera (correo, calendario, publicar); las internas siguen.' }
      if (!esExterna && rolPara(host, liderLocal(cerebro)) !== 'full') return { correr: false, tipo: 'aviso', codigo: 'no_mandas', motivo: `Esta rutina no corre en ${host}: no es la máquina que manda.` }
    }
    // 2. Tope de la llave.
    const tope = await verificarTope(llave, { env, fetchFn })
    if (!tope.ok) return { correr: false, tipo: 'aviso', codigo: tope.codigo, motivo: tope.motivo }
    if (!esExterna) return { correr: true, codigo: 'ok', externa: false, tope: { limite: tope.limite, restante: tope.restante } }
    // 3. Folio.
    const folio = `${rutina}:${fechaLocal(t)}:${objetivo || '-'}`
    const dueno = buscarFolio(cerebro, folio, f.ok ? remoto : null)
    if (dueno) return { correr: false, tipo: 'omitir', codigo: 'folio', folio, motivo: `Ya salió hoy: el folio ${folio} lo registró ${dueno}. No lo repito.` }
    const archivo = `${ENVIADOS_DIR}/${host}.jsonl`
    mkdirSync(join(cerebro, ENVIADOS_DIR), { recursive: true })
    appendFileSync(join(cerebro, archivo), JSON.stringify({ folio, host, en: t.toISOString() }) + '\n')
    git(cerebro, ['add', '--', archivo])
    git(cerebro, [...identidad(cerebro, host), 'commit', '-q', '-m', `espejo: folio ${folio}\n\nEspejo-Host: ${host}`, '--', archivo])
    const s = ciclo(cerebro, m, env)
    return { correr: true, codigo: 'ok', externa: true, folio, subido: s.ok, tope: { limite: tope.limite, restante: tope.restante } }
  })
  return r.correr === undefined ? { correr: false, tipo: 'aviso', ...r } : r
}
