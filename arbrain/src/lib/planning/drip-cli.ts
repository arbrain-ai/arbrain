#!/usr/bin/env -S npx tsx
/**
 * El CLI DRIP para Levy (24 oct 2026): escribe en el MISMO almacén que el calendario (lib/planning/drip-store.ts), así que lo que
 * Levy corrige se ve en la app al recargar, y lo que la persona corrige en la app, Levy lo lee aquí. Una línea, desde la raíz del repo (tsx lee los alias de arbrain/tsconfig.json):
 *
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts ver
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts inferir "📋 Brief del diagnóstico"     # qué diría Levy, sin escribir
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts corregir "GYM" invertir [--serie <recurringEventId>]
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts corregir "GYM" levy                   # quita la corrección: vuelve a lo inferido
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts delegar "Responder correos" [--a Levy] [--quitar] [--serie <id>]
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts tarifa 25 USD                         # Buyback Rate por hora
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts tarifa --ingreso <al año> USD           # lo que te paga tu empresa al año ÷ 8,000
 *   cd arbrain && npx tsx src/lib/planning/drip-cli.ts tarifa ninguna
 *
 * Instalación de Daniel: Supabase `app_config` (`planning:drip`) con la llave de servicio de `arbrain/.env.local`.
 * Edición del alumno (`ARBRAIN_EDICION=cliente` o el marcador `arbrain/EDICION`): `<ARBRAIN_HOME>/.claude/plan/drip.json`.
 * `ARBRAIN_DRIP_ARCHIVO=/ruta.json` fuerza un archivo (pruebas). Escribe con `por: levy`: la app lo muestra como «corregido por Levy».
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarCambioDrip, clavesDe, DRIP, esCuadrante, inferirDrip, type DocDrip } from '@/features/planning/drip'
import { esEdicionCliente } from '@/lib/edicion'
import { docDeValor, dondeDrip, escribirArchivoDrip, leerArchivoDrip, type DondeDrip } from './drip-store'

const aqui = dirname(fileURLToPath(import.meta.url))
const ARBRAIN = resolve(aqui, '../../..'), RAIZ = resolve(ARBRAIN, '..')

function entornoSupabase(): { url: string; key: string } {
  const env: Record<string, string> = {}
  const archivo = process.env.ARBRAIN_ENV_FILE ?? join(ARBRAIN, '.env.local')
  if (existsSync(archivo)) for (const l of readFileSync(archivo, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(l); if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Sin Supabase: falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (${archivo}).`)
  return { url: url.replace(/\/$/, ''), key }
}

async function leer(d: DondeDrip): Promise<DocDrip> {
  if (d.tipo === 'archivo') return leerArchivoDrip(d.ruta)
  const { url, key } = entornoSupabase()
  const r = await fetch(`${url}/rest/v1/app_config?key=eq.${encodeURIComponent(d.clave)}&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`Supabase respondió ${r.status} al leer.`)
  const filas = await r.json() as { value: string }[]
  return docDeValor(filas[0]?.value)
}

async function guardar(d: DondeDrip, doc: DocDrip) {
  if (d.tipo === 'archivo') return escribirArchivoDrip(d.ruta, doc)
  const { url, key } = entornoSupabase()
  const r = await fetch(`${url}/rest/v1/app_config?on_conflict=key`, { method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: d.clave, value: JSON.stringify(doc), updated_at: doc.actualizado }) })
  if (!r.ok) throw new Error(`Supabase respondió ${r.status} al guardar.`)
}

const opcion = (args: string[], nombre: string) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : undefined }

async function main(argv: string[]) {
  const [orden, ...args] = argv
  const d = dondeDrip({ cliente: esEdicionCliente(), raiz: () => process.env.ARBRAIN_HOME?.trim() || RAIZ })
  const lugar = d.tipo === 'archivo' ? d.ruta : `Supabase app_config «${d.clave}»`
  const claves = (titulo: string) => { const k = clavesDe({ title: titulo, recurringEventId: opcion(args, '--serie') ?? null }); return [k.serie, k.titulo].filter((x): x is string => !!x) }
  const escribir = async (cambio: unknown, aviso: string) => {
    const doc = aplicarCambioDrip(await leer(d), cambio)
    if (typeof doc === 'string') throw new Error(doc)
    await guardar(d, doc); console.log(`${aviso}\n(${lugar})`)
  }
  switch (orden) {
    case 'ver': {
      const doc = await leer(d)
      console.log(`Almacén DRIP: ${lugar}`)
      console.log(`Tarifa: ${doc.tarifa ? `${doc.tarifa.monto} ${doc.tarifa.moneda}/h` : 'sin tarifa'}`)
      for (const [k, c] of Object.entries(doc.correcciones)) console.log(`  corrección  ${DRIP[c.cuadrante].nombre.padEnd(10)} ${c.titulo || k}  (${c.por})`)
      for (const [k, x] of Object.entries(doc.delegados)) console.log(`  delegado    a ${x.a.padEnd(8)} ${x.titulo || k}  desde ${x.desde.slice(0, 10)}`)
      console.log(`Fotos del plan: ${Object.keys(doc.fotos).sort().join(', ') || 'ninguna'}`)
      console.log(`Semana perfecta: ${doc.semana ? `${doc.semana.bloques.length} bloques (semana-perfecta-cli.ts ver)` : 'sin diseñar'}`)
      return
    }
    case 'inferir': {
      const titulo = args[0]; if (!titulo) throw new Error('Uso: inferir "<título>"')
      const r = inferirDrip({ id: 'cli', title: titulo, start: '', end: '' }, opcion(args, '--calendario') ?? null)
      console.log(`${DRIP[r.cuadrante].nombre} · ${r.porque} (${r.origen})`); return
    }
    case 'corregir': {
      const [titulo, c] = args
      if (!titulo || !c || !(esCuadrante(c) || c === 'levy')) throw new Error('Uso: corregir "<título>" producir|invertir|reemplazar|delegar|levy [--serie <id>]')
      return escribir({ accion: 'corregir', claves: claves(titulo), titulo, cuadrante: c === 'levy' ? null : c, por: 'levy' },
        c === 'levy' ? `«${titulo}» vuelve a lo que Levy infiere.` : `«${titulo}» → ${DRIP[c].nombre}.`)
    }
    case 'delegar': {
      const titulo = args[0]; if (!titulo) throw new Error('Uso: delegar "<título>" [--a Levy] [--quitar] [--serie <id>]')
      const quitar = args.includes('--quitar'), a = opcion(args, '--a') ?? 'Levy'
      return escribir({ accion: 'delegar', claves: claves(titulo), titulo, a, activo: !quitar, por: 'levy' }, quitar ? `«${titulo}» vuelve a ser tuyo.` : `«${titulo}» delegado a ${a}.`)
    }
    case 'tarifa': {
      if (args[0] === 'ninguna') return escribir({ accion: 'tarifa', monto: null }, 'Sin tarifa de recompra.')
      const ingreso = opcion(args, '--ingreso')
      const monto = ingreso ? Number(ingreso) / 8000 : Number(args[0])
      const moneda = (ingreso ? args[args.indexOf('--ingreso') + 2] : args[1]) ?? 'USD'
      return escribir({ accion: 'tarifa', monto, moneda }, `Tarifa de recompra: ${Math.round(monto * 100) / 100} ${moneda}/h${ingreso ? ` (${ingreso} ÷ 8,000)` : ''}.`)
    }
    default:
      console.log('Uso: drip-cli.ts ver | inferir "<título>" | corregir "<título>" <cuadrante|levy> | delegar "<título>" [--quitar] | tarifa <monto> [moneda] | tarifa --ingreso <anual> [moneda] | tarifa ninguna')
      process.exitCode = orden ? 1 : 0
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
}
export { main as correrCliDrip, leer as leerDocDrip, guardar as guardarDocDrip, RAIZ as RAIZ_CEREBRO }
