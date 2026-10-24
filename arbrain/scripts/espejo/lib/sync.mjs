/**
 * Un ciclo de sincronización del espejo (cada ≈ 5 min): guarda lo propio, recibe lo ajeno, sube. Patrón de
 * `sync-bajada.sh`: nunca `--force`, nunca `reset`, nunca `stash`; si algo no se puede unir sin perder, no toca nada y
 * lo anota. Un choque real en un archivo del cerebro deja la versión ajena como `<archivo>.conflicto-<host>-<fecha>`.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { escanearArchivo, escanearSalida } from './escaner.mjs'
import { ahora, asegurarExclusion, avisar, avisosDelProceso, dirEstado, guardarEstado, leerEstado, sello } from './estado.mjs'
import { cambios, contar, existeRef, git, hayFusionEnCurso, identidad, mostrar, ramaActual } from './git.mjs'
import { liderLocal, rolPara } from './lider.mjs'
import { cargarCapas, esSoloLider, LATIDOS_DIR, porQueNunca, rutaConflicto, viaja } from './viaja.mjs'

const MAX_BYTES = 50 * 1024 * 1024
const minutos = (env, k, d) => { const n = Number(env[k]); return Number.isFinite(n) && n >= 0 ? n : d }

function apartar(cerebro, ruta, t) {
  const abs = join(cerebro, ruta)
  const destino = join(dirEstado(cerebro), 'apartados', `${ruta}.${sello(t)}`)
  mkdirSync(dirname(destino), { recursive: true })
  const enHead = git(cerebro, ['cat-file', '-e', `HEAD:${ruta}`]).ok
  if (enHead) {
    if (existsSync(abs)) copyFileSync(abs, destino)
    git(cerebro, ['checkout', '-q', 'HEAD', '--', ruta])
  } else if (existsSync(abs)) {
    renameSync(abs, destino)
  }
  return destino
}

function hostDelCommit(cerebro, ref, ruta) {
  const r = git(cerebro, ['log', '-1', '--format=%B', ref, '--', ruta])
  return /Espejo-Host:\s*([a-z0-9-]+)/.exec(r.out)?.[1] ?? 'otra-maquina'
}

/** Resuelve un choque sin perder nada. → { ruta, copia | null, quedo } */
function resolverChoque(cerebro, ruta, t) {
  const etapas = new Map()
  for (const l of git(cerebro, ['ls-files', '-u', '-z', '--', ruta]).out.split('\0').filter(Boolean)) {
    const [meta] = l.split('\t')
    const [, sha, etapa] = meta.split(' ')
    etapas.set(Number(etapa), sha)
  }
  const ajeno = hostDelCommit(cerebro, 'MERGE_HEAD', ruta)
  if (etapas.has(2) && etapas.has(3)) {
    let copia = rutaConflicto(ruta, ajeno, sello(t))
    for (let i = 2; existsSync(join(cerebro, copia)); i++) copia = rutaConflicto(ruta, ajeno, `${sello(t)}-${i}`)
    const blob = git(cerebro, ['cat-file', 'blob', etapas.get(3)], { binario: true })
    mkdirSync(dirname(join(cerebro, copia)), { recursive: true })
    writeFileSync(join(cerebro, copia), blob.out)
    git(cerebro, ['checkout', '-q', '--ours', '--', ruta])
    git(cerebro, ['add', '--', ruta, copia])
    return { ruta, copia, ajeno, quedo: 'la tuya en el archivo, la ajena en la copia' }
  }
  if (etapas.has(3)) { // aquí se borró y allá se editó: gana la edición
    git(cerebro, ['checkout', '-q', '--theirs', '--', ruta])
    git(cerebro, ['add', '--', ruta])
    return { ruta, copia: null, ajeno, quedo: 'la edición de la otra máquina (aquí estaba borrado)' }
  }
  git(cerebro, ['add', '--', ruta]) // allá se borró y aquí se editó: gana la edición
  return { ruta, copia: null, ajeno, quedo: 'tu edición (allá estaba borrado)' }
}

/** Un ciclo completo. Se llama dentro del candado (sincronizar() en espejo.mjs o cerca()). */
export function ciclo(cerebro, maquina, env = process.env) {
  const { host, rama } = maquina
  const t = ahora(env)
  const r = { ok: true, codigo: 'ok', host, rama, subidos: 0, recibidos: 0, choques: [], rechazados: [], apartados: [], motivo: '' }
  const desde = avisosDelProceso.length
  const terminar = (codigo, motivo, ok = codigo === 'ok') => {
    Object.assign(r, { codigo, motivo, ok, avisos: avisosDelProceso.slice(desde) })
    const lider = liderLocal(cerebro)
    r.lider = lider?.lider ?? null
    r.rol = rolPara(host, lider)
    guardarEstado(cerebro, { ultimaSync: { en: t.toISOString(), codigo, motivo, subidos: r.subidos, recibidos: r.recibidos }, rol: r.rol, lider: r.lider })
    return r
  }
  asegurarExclusion(cerebro)
  const actual = ramaActual(cerebro)
  if (actual !== rama) return terminar('otra_rama', `Tu Arbrain está en la rama «${actual || '(ninguna)'}», no en «${rama}»: no toco nada.`, false)
  if (hayFusionEnCurso(cerebro)) return terminar('fusion_en_curso', 'Hay una fusión a medias en tu Arbrain: no toco nada hasta que se termine.', false)

  const capas = cargarCapas(cerebro)
  const soyLider = rolPara(host, liderLocal(cerebro)) === 'full'
  const previos = new Set((leerEstado(cerebro).rechazados ?? []).map((x) => x.ruta))

  // 1. Los archivos del líder escritos aquí sin mandar se apartan (nada se pierde) y vuelve la versión del líder.
  if (!soyLider) {
    const lider = liderLocal(cerebro)?.lider ?? 'tu líder'
    for (const c of cambios(cerebro)) {
      if (!esSoloLider(c.ruta)) continue
      const destino = apartar(cerebro, c.ruta, t)
      r.apartados.push(c.ruta)
      avisar(cerebro, 'solo_lider', `${c.ruta} lo genera tu cerebro que manda (${lider}); tu versión quedó en ${destino.slice(cerebro.length + 1)}.`, { ruta: c.ruta })
    }
  }

  // 2. Lo propio que viaja, revisado archivo por archivo antes de entrar al commit.
  const subir = []
  for (const c of cambios(cerebro)) {
    for (const ruta of [c.ruta, c.origen].filter(Boolean)) {
      const nunca = porQueNunca(ruta)
      if (nunca) {
        if (viaja(ruta.replace(/[^/]+$/, 'x.md'), capas)) { // dentro del cerebro: se reporta
          r.rechazados.push({ ruta, regla: 'nombre-prohibido', porque: nunca })
        }
        continue
      }
      if (!viaja(ruta, capas)) continue
      if (!soyLider && esSoloLider(ruta)) continue
      const abs = join(cerebro, ruta)
      if (existsSync(abs)) {
        const st = lstatSync(abs)
        if (st.isSymbolicLink()) continue
        if (st.size > MAX_BYTES) { r.rechazados.push({ ruta, regla: 'demasiado-grande' }); continue }
        const h = escanearArchivo(ruta, readFileSync(abs))
        if (h.length) { r.rechazados.push({ ruta, regla: h[0].regla, linea: h[0].linea }); continue }
      }
      subir.push(ruta)
    }
  }

  // 3. Latido del líder (para que la otra máquina sepa si sigue vivo). Archivo por máquina.
  if (soyLider) {
    const ruta = `${LATIDOS_DIR}/${host}.json`
    let ultimo = 0
    try { ultimo = new Date(JSON.parse(readFileSync(join(cerebro, ruta), 'utf8')).en).getTime() || 0 } catch { /* primero */ }
    if (t.getTime() - ultimo >= minutos(env, 'ARBRAIN_ESPEJO_LATIDO_MIN', 60) * 60_000) {
      mkdirSync(join(cerebro, LATIDOS_DIR), { recursive: true })
      writeFileSync(join(cerebro, ruta), JSON.stringify({ host, en: t.toISOString() }, null, 1) + '\n')
      subir.push(ruta)
    }
  }

  for (const x of r.rechazados) {
    if (!previos.has(x.ruta)) avisar(cerebro, 'secreto_rechazado', `No subí ${x.ruta} a tu GitHub: ${x.porque ?? `parece tener una llave (${x.regla}${x.linea ? `, línea ${x.linea}` : ''})`}. Sigue en esta máquina.`, { ruta: x.ruta, regla: x.regla })
  }
  guardarEstado(cerebro, { rechazados: r.rechazados })

  if (subir.length) {
    const lista = [...new Set(subir)].join('\0')
    git(cerebro, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { entrada: lista })
    const preparados = new Set(git(cerebro, ['diff', '--cached', '--name-only', '--no-renames', '-z']).out.split('\0').filter(Boolean))
    if (subir.some((p) => preparados.has(p))) {
      const c = git(cerebro, [...identidad(cerebro, host), 'commit', '-q', '-m', `espejo: ${host} guarda sus cambios\n\nEspejo-Host: ${host}`, '--pathspec-from-file=-', '--pathspec-file-nul'], { entrada: lista })
      if (!c.ok) return terminar('commit', `No pude guardar los cambios: ${c.err.slice(0, 200)}`, false)
    }
  }

  // 4. Recibir.
  const f = git(cerebro, ['fetch', '-q', 'origin', `+refs/heads/${rama}:refs/remotes/origin/${rama}`], { plazo: 60_000 })
  if (!f.ok) return terminar('sin_red', `No alcancé tu GitHub (${f.err.split('\n')[0].slice(0, 120)}). Lo propio queda en cola y sube en el siguiente ciclo.`, false)
  const remoto = `refs/remotes/origin/${rama}`
  if (existeRef(cerebro, remoto)) {
    const atras = contar(cerebro, `HEAD..${remoto}`)
    const adelante = contar(cerebro, `${remoto}..HEAD`)
    if (atras > 0 && adelante === 0) {
      const m = git(cerebro, ['merge', '-q', '--ff-only', remoto])
      if (!m.ok) { avisar(cerebro, 'no_toque', `Llegaron cambios de tu otra máquina pero chocan con algo sin guardar aquí; no toqué nada. (${m.err.split('\n')[0].slice(0, 160)})`); return terminar('no_toque', 'Cambios locales sin guardar bloquean la bajada: no toqué nada.', false) }
    } else if (atras > 0) {
      const m = git(cerebro, [...identidad(cerebro, host), 'merge', '-q', '--no-ff', '--no-edit', '-m', `espejo: ${host} une con su otra máquina\n\nEspejo-Host: ${host}`, remoto])
      if (!m.ok) {
        if (!hayFusionEnCurso(cerebro)) { avisar(cerebro, 'no_toque', `No pude unir con tu otra máquina sin pisar algo de aquí; no toqué nada. (${m.err.split('\n')[0].slice(0, 160)})`); return terminar('no_toque', 'La unión no arrancó: no toqué nada.', false) }
        const enChoque = git(cerebro, ['diff', '--name-only', '--diff-filter=U', '-z']).out.split('\0').filter(Boolean)
        const ajenos = enChoque.filter((p) => !viaja(p, capas))
        if (ajenos.length) {
          git(cerebro, ['merge', '--abort'])
          avisar(cerebro, 'choque_codigo', `Tus dos máquinas tienen cambios distintos en ${ajenos.slice(0, 3).join(', ')} (no es tu cerebro, es código): no toqué nada.`)
          return terminar('choque_codigo', 'Choque fuera del cerebro: fusión cancelada, nada cambió.', false)
        }
        for (const p of enChoque) {
          const x = resolverChoque(cerebro, p, t)
          r.choques.push(x)
          avisar(cerebro, 'choque', x.copia ? `Tus dos máquinas editaron ${p}. Quedó ${x.quedo}: ${x.copia}. Levy te propone la fusión.` : `Choque en ${p}: quedó ${x.quedo}.`, { ruta: p, copia: x.copia })
        }
        const c = git(cerebro, [...identidad(cerebro, host), 'commit', '-q', '--no-edit'])
        if (!c.ok) { git(cerebro, ['merge', '--abort']); return terminar('choque', `No pude cerrar la unión: ${c.err.slice(0, 160)}`, false) }
      }
    }
    r.recibidos = atras
  }

  // 5. Subir: todo lo propio pasa otra vez por el escáner (incluye commits que la persona hizo a mano).
  const pendientes = existeRef(cerebro, remoto) ? contar(cerebro, `${remoto}..HEAD`) : contar(cerebro, 'HEAD')
  if (pendientes > 0) {
    const h = escanearSalida(cerebro)
    if (h.length) {
      const lista = h.slice(0, 5).map((x) => `${x.ruta} (${x.regla}, commit ${x.commit.slice(0, 7)})`).join('; ')
      avisar(cerebro, 'secreto_en_salida', `No subí nada: hay commits con algo que parece una llave: ${lista}. Hay que sacarlo de esos commits antes de subir.`, { hallazgos: h.map(({ commit, ruta, regla }) => ({ commit, ruta, regla })) })
      return terminar('secreto', `Subida bloqueada: ${h.length} posible(s) secreto(s) en commits propios.`, false)
    }
    const p = git(cerebro, ['push', '-q', 'origin', `HEAD:refs/heads/${rama}`], { plazo: 120_000 })
    if (!p.ok) return terminar('reintento', `La subida no entró (${p.err.split('\n')[0].slice(0, 120)}); se reintenta en el siguiente ciclo.`, false)
    r.subidos = pendientes
  }

  // 6. ¿Quien manda sigue vivo? Nadie se autopromueve: solo se avisa.
  const lider = liderLocal(cerebro)
  if (!lider) {
    if (!leerEstado(cerebro).avisoSinLider) { avisar(cerebro, 'sin_lider', 'El espejo está encendido pero nadie manda todavía: ninguna máquina corre rutinas. Elige cuál («que la nube mande» o «que mi compu mande»).'); guardarEstado(cerebro, { avisoSinLider: t.toISOString() }) }
  } else if (lider.lider !== host) {
    let ultimo = null
    try { ultimo = new Date(JSON.parse(mostrar(cerebro, 'HEAD', `${LATIDOS_DIR}/${lider.lider}.json`)).en) } catch { /* sin latido */ }
    const silencio = minutos(env, 'ARBRAIN_ESPEJO_SILENCIO_MIN', 180) * 60_000
    const base = ultimo ?? (lider.desde ? new Date(lider.desde) : null)
    if (base && t.getTime() - base.getTime() > silencio) {
      const e = leerEstado(cerebro)
      const previo = e.avisoSilencio ? new Date(e.avisoSilencio).getTime() : 0
      if (t.getTime() - previo > 60 * 60_000) {
        const horas = Math.round((t.getTime() - base.getTime()) / 3_600_000)
        avisar(cerebro, 'lider_sin_latido', `Tu cerebro que manda (${lider.lider}) no da señales desde hace ${horas} h. Esta máquina no toma el mando sola: ¿quieres que mande ${host}?`, { lider: lider.lider })
        guardarEstado(cerebro, { avisoSilencio: t.toISOString() })
      }
      r.liderSinLatido = true
    }
  }
  return terminar('ok', `${r.subidos} commit(s) subidos, ${r.recibidos} recibidos${r.choques.length ? `, ${r.choques.length} choque(s) guardados como copia` : ''}.`)
}
