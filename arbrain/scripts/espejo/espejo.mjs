#!/usr/bin/env node
/**
 * Modo espejo (beta, apagado por defecto): tu cerebro en dos máquinas, tu compu y un servidor Linux tuyo, en espejo
 * por git sobre tu repo privado mi-arbrain. Un líder declarado corre las rutinas; las llaves nunca viajan.
 * Diseño: docs/builds/cerebro-24-7-2026-10-23/DISENO.md §2. Contrato: docs/builds/modo-espejo-2026-10-23/motor/CONTRATO.md.
 *
 *   node arbrain/scripts/espejo/espejo.mjs activar [--host <nombre>]     enciende el espejo en esta máquina
 *   node arbrain/scripts/espejo/espejo.mjs desactivar                    lo apaga (no borra nada)
 *   node arbrain/scripts/espejo/espejo.mjs estado [--json]
 *   node arbrain/scripts/espejo/espejo.mjs rol                           full | chat (lo usa el modo servidor)
 *   node arbrain/scripts/espejo/espejo.mjs sincronizar [--json]          un ciclo (cada ≈ 5 min)
 *   node arbrain/scripts/espejo/espejo.mjs lider                         quién manda
 *   node arbrain/scripts/espejo/espejo.mjs lider elegir <host> --cita "<palabras de la persona>"   (o --cita-stdin)
 *   node arbrain/scripts/espejo/espejo.mjs cerca --rutina <id> [--externa|--interna] [--objetivo <x>] [--llave-stdin] [--json]
 *   node arbrain/scripts/espejo/espejo.mjs escanear <archivo>…           ¿tiene algo que parezca una llave?
 *   node arbrain/scripts/espejo/espejo.mjs por-maquina <ruta>            nombre por máquina de un archivo por evento
 *
 * Opción común: --cerebro <carpeta> (por defecto, la copia donde vive este archivo).
 * Salida: una línea `ESPEJO_<CÓDIGO> <motivo>` (o JSON con --json). Código de salida 0 = bien / la rutina corre.
 */
import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { cerca } from './lib/cerca.mjs'
import { escanearArchivo } from './lib/escaner.mjs'
import { asegurarExclusion, conCandado, guardarMaquina, leerEstado, leerMaquina } from './lib/estado.mjs'
import { esRepo, git, identidad, ramaActual } from './lib/git.mjs'
import { elegir, liderLocal, registrarMaquina, rolPara } from './lib/lider.mjs'
import { ciclo } from './lib/sync.mjs'
import { hostValido, RAMA_POR_DEFECTO, rutaPorMaquina } from './lib/viaja.mjs'

const argv = process.argv.slice(2)
const CON_VALOR = new Set(['--cerebro', '--host', '--rama', '--cita', '--rutina', '--objetivo'])
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const bandera = (n) => argv.includes(n)
const pos = argv.filter((a, i) => !a.startsWith('--') && !CON_VALOR.has(argv[i - 1]))
const JSON_SALIDA = bandera('--json')
const CEREBRO = resolve(opcion('--cerebro') ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..'))

function salir(r, codigoSalida) {
  if (JSON_SALIDA) process.stdout.write(JSON.stringify(r) + '\n')
  else process.stdout.write(`ESPEJO_${String(r.codigo ?? 'ok').toUpperCase()} ${r.motivo ?? ''}\n`)
  process.exit(codigoSalida ?? (r.ok === false ? 1 : 0))
}

function hostPorDefecto() {
  const base = hostname().toLowerCase().replace(/\.local$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'maquina'
  return `${base.length >= 2 ? base : 'maquina'}-${randomBytes(2).toString('hex')}`
}

async function activar() {
  if (!esRepo(CEREBRO)) return salir({ ok: false, codigo: 'sin_repo', motivo: `${CEREBRO} no es tu Arbrain (no es un repositorio git).` })
  const previa = leerMaquina(CEREBRO)
  const rama = opcion('--rama') ?? previa.rama ?? RAMA_POR_DEFECTO
  const host = opcion('--host') ?? previa.host ?? hostPorDefecto()
  if (!hostValido(host)) return salir({ ok: false, codigo: 'host_invalido', motivo: `«${host}»: usa minúsculas, números y guiones (3 a 40).` })
  if (ramaActual(CEREBRO) !== rama) return salir({ ok: false, codigo: 'otra_rama', motivo: `Tu Arbrain debe estar en la rama ${rama}.` })
  if (!git(CEREBRO, ['remote', 'get-url', 'origin']).ok) return salir({ ok: false, codigo: 'sin_respaldo', motivo: 'Falta tu repo privado mi-arbrain (remoto origin): corre primero arbrain/scripts/instalar/respaldo-github.sh.' })
  if (previa.host && previa.host !== host) return salir({ ok: false, codigo: 'ya_tiene_nombre', motivo: `Esta máquina ya se llama ${previa.host} en el espejo; no le cambio el nombre.` })
  asegurarExclusion(CEREBRO)
  guardarMaquina(CEREBRO, { activo: true, host, rama, desde: previa.desde ?? new Date().toISOString() })
  const r = await conCandado(CEREBRO, () => {
    const ruta = registrarMaquina(CEREBRO, host, { sistema: process.platform })
    git(CEREBRO, ['add', '--', ruta])
    git(CEREBRO, [...identidad(CEREBRO, host), 'commit', '-q', '-m', `espejo: ${host} entra al espejo\n\nEspejo-Host: ${host}`, '--', ruta])
    return ciclo(CEREBRO, { host, rama }, process.env)
  })
  const lider = liderLocal(CEREBRO)
  salir({ ...r, ok: true, codigo: 'activo', host, rol: rolPara(host, lider), motivo: `${host} está en el espejo (${lider ? `manda ${lider.lider}` : 'nadie manda todavía'}; sincronización: ${r.codigo}).` })
}

async function principal() {
  const orden = pos[0] ?? 'estado'
  if (orden === 'activar') return activar()
  if (orden === 'desactivar') {
    const m = leerMaquina(CEREBRO)
    if (m.host) guardarMaquina(CEREBRO, { ...m, activo: false })
    return salir({ ok: true, codigo: 'apagado', motivo: 'Espejo apagado en esta máquina. Nada se borró; tu GitHub conserva todo.' })
  }
  if (orden === 'estado') {
    const m = leerMaquina(CEREBRO)
    const lider = liderLocal(CEREBRO)
    const e = leerEstado(CEREBRO)
    return salir({ ok: true, codigo: m.activo ? 'activo' : 'apagado', activo: m.activo, host: m.host ?? null, rama: m.rama, lider: lider?.lider ?? null, rol: m.activo ? rolPara(m.host, lider) : 'full', ultimaSync: e.ultimaSync ?? null, avisos: (e.avisos ?? []).slice(-5), motivo: m.activo ? `${m.host}: ${rolPara(m.host, lider) === 'full' ? 'manda' : `ventana (manda ${lider?.lider ?? 'nadie'})`}.` : 'Espejo apagado.' })
  }
  if (orden === 'rol') {
    const m = leerMaquina(CEREBRO)
    process.stdout.write(`${m.activo ? rolPara(m.host, liderLocal(CEREBRO)) : 'full'}\n`)
    return process.exit(0)
  }
  if (orden === 'sincronizar') {
    const m = leerMaquina(CEREBRO)
    if (!m.activo) return salir({ ok: true, codigo: 'apagado', motivo: 'Espejo apagado en esta máquina.' })
    return salir(await conCandado(CEREBRO, () => ciclo(CEREBRO, m, process.env)))
  }
  if (orden === 'lider') {
    const m = leerMaquina(CEREBRO)
    if (pos[1] === 'elegir') {
      if (!m.activo) return salir({ ok: false, codigo: 'apagado', motivo: 'Enciende el espejo en esta máquina antes de elegir quién manda.' })
      const r = await conCandado(CEREBRO, () => {
        // --cita-stdin: el instalador pasa las palabras de la persona sin armarlas dentro de un comando de shell.
        const cita = bandera('--cita-stdin') ? readFileSync(0, 'utf8').trim() : opcion('--cita')
        const e = elegir(CEREBRO, { lider: pos[2], cita, por: m.host })
        if (!e.ok || e.codigo === 'sin_cambio') return e
        const s = ciclo(CEREBRO, m, process.env)
        return { ...e, subido: s.ok, motivo: `${e.motivo}${s.ok ? ' Ya está en tu GitHub.' : ` Queda en cola: ${s.motivo}`}` }
      })
      return salir(r)
    }
    const lider = liderLocal(CEREBRO)
    return salir({ ok: true, codigo: lider ? 'lider' : 'sin_lider', lider, motivo: lider ? `Manda ${lider.lider} desde ${lider.desde} (${lider.firma}).` : 'Nadie manda todavía.' })
  }
  if (orden === 'cerca') {
    const llave = bandera('--llave-stdin') ? (readFileSync(0, 'utf8').split(/\r?\n/)[0] ?? '') : ''
    const r = await cerca(CEREBRO, { rutina: opcion('--rutina'), externa: bandera('--externa') ? true : bandera('--interna') ? false : undefined, objetivo: opcion('--objetivo'), llave })
    return salir({ ...r, ok: r.correr }, r.correr ? 0 : 3)
  }
  if (orden === 'escanear') {
    const hallazgos = []
    for (const p of pos.slice(1)) { let b = null; try { b = readFileSync(p) } catch { /* */ } for (const h of escanearArchivo(p, b)) hallazgos.push({ ruta: p, ...h }) }
    return salir({ ok: hallazgos.length === 0, codigo: hallazgos.length ? 'secreto' : 'limpio', hallazgos, motivo: hallazgos.length ? hallazgos.map((h) => `${h.ruta}:${h.linea} ${h.regla}`).join('; ') : 'Nada que parezca una llave.' })
  }
  if (orden === 'por-maquina') {
    const m = leerMaquina(CEREBRO)
    if (!m.host || !pos[1]) return salir({ ok: false, codigo: 'sin_host', motivo: 'Falta la ruta o esta máquina no está en el espejo.' })
    process.stdout.write(rutaPorMaquina(pos[1], m.host) + '\n')
    return process.exit(0)
  }
  salir({ ok: false, codigo: 'orden_desconocida', motivo: `No conozco «${orden}». Mira la ayuda al inicio de este archivo.` })
}

principal().catch((e) => salir({ ok: false, codigo: 'error', motivo: String(e?.message ?? e).slice(0, 300) }))
