/**
 * Un solo líder, declarado (DISENO §2.2): `arbrain/cerebro/lider.json` en mi-arbrain es el `server_host.py` del
 * alumno. El líder corre el scheduler (`CLAUDECLAW_ROLE=full`) y escribe now.md y los reportes; el resto es ventana
 * (`chat`). Solo `elegir` cambia el archivo, y solo con la cita de la persona: ningún camino del código se autopromueve.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { git, identidad, mostrar } from './git.mjs'
import { ahora } from './estado.mjs'
import { hostValido, LIDER, MAQUINAS_DIR } from './viaja.mjs'

export function parsearLider(texto) {
  if (texto == null) return null
  try {
    const j = JSON.parse(texto)
    return j && hostValido(j.lider) ? { lider: j.lider, desde: j.desde ?? null, firma: j.firma ?? null, cita: j.cita ?? null, por: j.por ?? null } : null
  } catch { return null }
}

export function liderLocal(cerebro) {
  const r = join(cerebro, LIDER)
  return existsSync(r) ? parsearLider(readFileSync(r, 'utf8')) : null
}
export const liderEn = (cerebro, ref) => parsearLider(mostrar(cerebro, ref, LIDER))

/** Rol que se deriva: `full` solo si esta máquina es la declarada. Sin líder declarado, nadie corre rutinas. */
export const rolPara = (host, lider) => (lider && host && lider.lider === host ? 'full' : 'chat')

/** Máquinas que se dieron de alta con `activar` (archivos por máquina, nunca chocan). */
export function maquinasConocidas(cerebro) {
  const r = git(cerebro, ['ls-files', '-z', '--', MAQUINAS_DIR])
  const desdeGit = r.out.split('\0').filter(Boolean).map((p) => p.split('/').pop().replace(/\.json$/, ''))
  return [...new Set(desdeGit)].filter(hostValido)
}

export function registrarMaquina(cerebro, host, extra = {}) {
  const ruta = join(cerebro, MAQUINAS_DIR, `${host}.json`)
  mkdirSync(dirname(ruta), { recursive: true })
  if (!existsSync(ruta)) writeFileSync(ruta, JSON.stringify({ host, desde: ahora().toISOString(), ...extra }, null, 1) + '\n')
  return `${MAQUINAS_DIR}/${host}.json`
}

/**
 * Elección explícita de la persona («que la nube mande», «que mi compu mande»). Escribe lider.json y hace commit; el
 * push lo hace el ciclo que sigue (sincronizar). → { ok, motivo }
 */
export function elegir(cerebro, { lider, cita, por }) {
  if (!hostValido(lider)) return { ok: false, codigo: 'host_invalido', motivo: `«${lider}» no es un nombre de máquina válido.` }
  if (!cita || String(cita).trim().length < 3) return { ok: false, codigo: 'sin_cita', motivo: 'Cambiar quién manda necesita la elección de la persona: pasa --cita con sus palabras.' }
  const conocidas = maquinasConocidas(cerebro)
  if (!conocidas.includes(lider)) return { ok: false, codigo: 'maquina_desconocida', motivo: `«${lider}» no está dada de alta en el espejo (conocidas: ${conocidas.join(', ') || 'ninguna'}). Corre «activar» en esa máquina primero.` }
  const actual = liderLocal(cerebro)
  if (actual?.lider === lider) return { ok: true, codigo: 'sin_cambio', motivo: `${lider} ya manda.` }
  const doc = { lider, desde: ahora().toISOString(), firma: 'elegido por la persona', cita: String(cita).trim().slice(0, 500), por }
  mkdirSync(dirname(join(cerebro, LIDER)), { recursive: true })
  writeFileSync(join(cerebro, LIDER), JSON.stringify(doc, null, 1) + '\n')
  git(cerebro, ['add', '--', LIDER])
  const c = git(cerebro, [...identidad(cerebro, por), 'commit', '-q', '-m', `espejo: manda ${lider} (elegido por la persona)\n\nEspejo-Host: ${por}`, '--', LIDER])
  if (!c.ok) return { ok: false, codigo: 'commit', motivo: `No pude guardar la elección: ${c.err.slice(0, 200)}` }
  return { ok: true, codigo: 'elegido', motivo: `Ahora manda ${lider}${actual ? ` (antes ${actual.lider})` : ''}.` }
}
