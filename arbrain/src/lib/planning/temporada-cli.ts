#!/usr/bin/env -S npx tsx
/**
 * El CLI de la temporada para Levy (24 oct 2026): escribe en el MISMO almacén que lee el calendario (lib/planning/temporada-store.ts),
 * así que la temporada que arma con la persona aparece en la franja («Día N de X»), en «Hábitos de hoy» y en el primero de los tres
 * números al recargar o volver a la app. Una línea, desde `arbrain/` (tsx lee los alias de tsconfig.json):
 *
 *   npx tsx src/lib/planning/temporada-cli.ts ver
 *   npx tsx src/lib/planning/temporada-cli.ts fijar --desde 2026-11-02 --hasta 2026-12-01 --premio "Una semana en la playa" \
 *     --meta "Mis primeros 3 clientes" [--nombre "Modo enfoque"] [--arranque 2026-11-02] \
 *     [--premio-desde 2026-12-01 --premio-hasta 2026-12-07] [--por-firmar] [--cumplir "Oferta lista"] [--cumplir "…"]
 *   npx tsx src/lib/planning/temporada-cli.ts quitar          # sin temporada: la franja vuelve a invitar a armarla
 *
 * `--desde` es el día 1; `--hasta`, el día del cierre (ya no cuenta: del 2 nov al 1 dic son 29 días). `--cumplir` se repite (hasta 6).
 * Edición del alumno (`ARBRAIN_EDICION=cliente` o el marcador `arbrain/EDICION`): `<ARBRAIN_HOME>/.claude/plan/temporada.json`.
 * Instalación original: manda `src/config/instalacion.ts` (este CLI solo la lee). `ARBRAIN_TEMPORADA_ARCHIVO=/ruta.json` fuerza un archivo.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { diaDelPeriodo, textoPeriodo } from '@/features/planning/periodo-premio'
import { fijarTemporada, sinTemporada, temporadaVigente } from '@/features/planning/temporada'
import { dondeTemporada, escribirArchivoTemporada, leerArchivoTemporada } from './temporada-store'

const aqui = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(aqui, '../../../..')

const opcion = (args: string[], nombre: string) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : undefined }
const todas = (args: string[], nombre: string) => args.flatMap((a, i) => a === nombre && args[i + 1] !== undefined ? [args[i + 1]] : [])
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date())

async function main(argv: string[]) {
  const [orden, ...args] = argv
  const d = dondeTemporada({ cliente: esEdicionCliente(), raiz: () => process.env.ARBRAIN_HOME?.trim() || RAIZ })
  const i = instalacion()
  const lugar = d.tipo === 'archivo' ? d.ruta : 'src/config/instalacion.ts (esta instalación no usa almacén)'
  const soloLectura = () => { throw new Error('En esta instalación la temporada vive en src/config/instalacion.ts: edítala ahí.') }
  switch (orden) {
    case 'ver': {
      const doc = d.tipo === 'archivo' ? leerArchivoTemporada(d.ruta) : null
      const v = temporadaVigente(doc, { periodo: i.periodo, temporadaHabitos: i.temporadaHabitos })
      console.log(`Temporada: ${lugar}${d.tipo === 'archivo' && !doc ? ' (aún no existe)' : ''}`)
      if (!v.periodo) { console.log('Sin temporada. Ármala con: fijar --desde AAAA-MM-DD --hasta AAAA-MM-DD --premio "…" --meta "…"'); return }
      const p = v.periodo, dia = diaDelPeriodo(hoy(), p)
      console.log(`${v.temporadaHabitos?.nombre ?? 'Temporada'} · ${textoPeriodo(dia)} · ${p.desde} → ${p.hasta} (${dia.total} días)`)
      console.log(`Premio: ${p.premio}${p.viaje ? ` (${p.viaje.desde} a ${p.viaje.hasta}${p.viaje.firmado ? '' : ', por firmar'})` : ''}`)
      if (p.meta) console.log(`Meta: ${p.meta}`)
      if (v.temporadaHabitos) console.log(`Hábitos cuentan desde: ${v.temporadaHabitos.arranque}`)
      for (const c of p.cumplir) console.log(`  antes del cierre: ${c}`)
      return
    }
    case 'fijar': {
      if (d.tipo !== 'archivo') return soloLectura()
      const pd = opcion(args, '--premio-desde'), ph = opcion(args, '--premio-hasta')
      if (Boolean(pd) !== Boolean(ph)) throw new Error('Las fechas del premio van juntas: --premio-desde y --premio-hasta.')
      const doc = fijarTemporada({
        nombre: opcion(args, '--nombre'), arranque: opcion(args, '--arranque'),
        periodo: { desde: opcion(args, '--desde'), hasta: opcion(args, '--hasta'), premio: opcion(args, '--premio'), meta: opcion(args, '--meta'),
          viaje: pd && ph ? { desde: pd, hasta: ph, firmado: !args.includes('--por-firmar') } : undefined, cumplir: todas(args, '--cumplir') },
      })
      if (typeof doc === 'string') throw new Error(doc)
      escribirArchivoTemporada(d.ruta, doc)
      console.log(`Temporada fijada: ${doc.periodo!.desde} → ${doc.periodo!.hasta} · ${textoPeriodo(diaDelPeriodo(hoy(), doc.periodo!))} · premio: ${doc.periodo!.premio}.\n(${d.ruta})`)
      return
    }
    case 'quitar': {
      if (d.tipo !== 'archivo') return soloLectura()
      escribirArchivoTemporada(d.ruta, sinTemporada())
      console.log(`Sin temporada: la franja vuelve a invitar a armarla.\n(${d.ruta})`)
      return
    }
    default:
      console.log('Uso: temporada-cli.ts ver | fijar --desde AAAA-MM-DD --hasta AAAA-MM-DD --premio "…" [--meta "…"] [--nombre "…"] [--arranque AAAA-MM-DD] [--premio-desde … --premio-hasta …] [--por-firmar] [--cumplir "…"]… | quitar')
      process.exitCode = orden ? 1 : 0
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
}
export { main as correrCliTemporada }
