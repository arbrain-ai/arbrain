#!/usr/bin/env -S npx tsx
/**
 * La Semana Perfecta por CLI (25 oct 2026, Daniel: «editable por CLI para que Levy la llene con Daniel hoy en la revisión»). Escribe
 * en el MISMO almacén DRIP que el calendario (`DocDrip.semana`, lib/planning/drip-store.ts): lo que Levy agrega aquí se ve en la
 * Semana como bloques fantasma al recargar (engrane › DRIP › «Semana perfecta»). Desde `arbrain/`:
 *
 *   npx tsx src/lib/planning/semana-perfecta-cli.ts ver
 *   npx tsx src/lib/planning/semana-perfecta-cli.ts agregar lun-vie 06:00-08:00 "Deep work: grabar" [producir]
 *   npx tsx src/lib/planning/semana-perfecta-cli.ts agregar lun,mie,vie 09:30-11:00 "GYM"          # sin cuadrante: Levy lo infiere
 *   npx tsx src/lib/planning/semana-perfecta-cli.ts quitar 3 [5 …]                                  # números de `ver`
 *   npx tsx src/lib/planning/semana-perfecta-cli.ts importar plantilla.json                         # [{dia, desde:"06:00", hasta:"08:00", titulo, cuadrante?}]
 *   npx tsx src/lib/planning/semana-perfecta-cli.ts vaciar
 *
 * Días: lun mar mie jue vie sab dom, rangos (lun-vie), listas (lun,jue), «todos», «laborables», «finde». Un bloque no cruza la
 * medianoche. Mismo lugar que `drip-cli.ts`: Supabase `app_config` `planning:drip` (Daniel) o `<ARBRAIN_HOME>/.claude/plan/drip.json`
 * (alumno); `ARBRAIN_DRIP_ARCHIVO=/ruta.json` fuerza un archivo (pruebas).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarCambioDrip, DRIP, esCuadrante } from '@/features/planning/drip'
import { DIAS_CORTOS, hhmm, horasDePlantilla, leerDias, leerTramo, type CambioSemana } from '@/features/planning/semana-perfecta'
import { esEdicionCliente } from '@/lib/edicion'
import { dondeDrip } from './drip-store'
import { guardarDocDrip, leerDocDrip, RAIZ_CEREBRO } from './drip-cli'

const USO = 'Uso: semana-perfecta-cli.ts ver | agregar <días> <HH:MM-HH:MM> "<título>" [cuadrante] | quitar <n…> | importar <archivo.json> | vaciar'

function aMinutos(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : v
}

async function main(argv: string[]) {
  const [orden, ...args] = argv
  const d = dondeDrip({ cliente: esEdicionCliente(), raiz: () => process.env.ARBRAIN_HOME?.trim() || RAIZ_CEREBRO })
  const lugar = d.tipo === 'archivo' ? d.ruta : `Supabase app_config «${d.clave}»`
  const escribir = async (cambio: CambioSemana, aviso: string) => {
    const doc = aplicarCambioDrip(await leerDocDrip(d), { accion: 'semana', cambio })
    if (typeof doc === 'string') throw new Error(doc)
    await guardarDocDrip(d, doc)
    console.log(`${aviso} La plantilla tiene ${doc.semana?.bloques.length ?? 0} bloques.\n(${lugar})`)
  }
  switch (orden) {
    case 'ver': {
      const s = (await leerDocDrip(d)).semana
      console.log(`Semana perfecta (${lugar})`)
      if (!s) { console.log('Sin diseñar. Empieza con: agregar lun-vie 06:00-08:00 "Deep work" producir'); return }
      s.bloques.forEach((b, i) => console.log(`  ${String(i + 1).padStart(3)}  ${DIAS_CORTOS[b.dia - 1]}  ${hhmm(b.desde)}–${hhmm(b.hasta)}  ${DRIP[b.cuadrante].nombre.padEnd(10)} ${b.titulo}`))
      const h = horasDePlantilla(s)
      console.log(`Horas a la semana: ${Object.entries(h).map(([c, x]) => `${DRIP[c as keyof typeof DRIP].nombre} ${Math.round(x * 10) / 10} h`).join(' · ')}`)
      return
    }
    case 'agregar': {
      const [diasS, tramoS, titulo, cuadS] = args
      if (!diasS || !tramoS || !titulo) throw new Error(USO)
      const dias = leerDias(diasS); if (typeof dias === 'string') throw new Error(dias)
      const tramo = leerTramo(tramoS); if (typeof tramo === 'string') throw new Error(tramo)
      if (cuadS && !esCuadrante(cuadS)) throw new Error('Cuadrante inválido: producir, invertir, reemplazar o delegar (o nada, y Levy lo infiere).')
      return escribir({ op: 'agregar', dias, ...tramo, titulo, cuadrante: cuadS && esCuadrante(cuadS) ? cuadS : null },
        `«${titulo}» ${dias.map(x => DIAS_CORTOS[x - 1]).join(',')} ${hhmm(tramo.desde)}–${hhmm(tramo.hasta)}.`)
    }
    case 'quitar': {
      const indices = args.map(Number).filter(n => Number.isInteger(n) && n > 0)
      if (!indices.length) throw new Error('Uso: quitar <n…> (los números de `ver`).')
      return escribir({ op: 'quitar', indices }, `Quitados: ${indices.join(', ')}.`)
    }
    case 'importar': {
      if (!args[0]) throw new Error('Uso: importar <archivo.json>')
      const crudo = JSON.parse(readFileSync(args[0], 'utf8')) as unknown
      const lista = Array.isArray(crudo) ? crudo : (crudo as { bloques?: unknown[] })?.bloques
      if (!Array.isArray(lista)) throw new Error('El archivo es una lista de bloques o { bloques: [...] }.')
      return escribir({ op: 'reemplazar', bloques: lista.map(b => b && typeof b === 'object' ? { ...b, desde: aMinutos((b as Record<string, unknown>).desde), hasta: aMinutos((b as Record<string, unknown>).hasta) } : b) }, 'Plantilla reemplazada.')
    }
    case 'vaciar': return escribir({ op: 'vaciar' }, 'Semana perfecta vacía.')
    default:
      console.log(USO)
      process.exitCode = orden ? 1 : 0
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
}
export { main as correrCliSemanaPerfecta }
