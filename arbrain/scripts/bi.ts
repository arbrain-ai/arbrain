#!/usr/bin/env node
/**
 * La mano de Levy en Business Intelligence (7 nov 2026). El dueño pregunta en el panel; la pregunta llega al chat; Levy elige
 * una consulta del catálogo y la escribe aquí como gráfica. El panel la pinta y la recalcula cada vez que se abre.
 * Contrato completo: arbrain/docs/bi/README.md.
 *
 *   npm --prefix arbrain run bi -- catalogo
 *   npm --prefix arbrain run bi -- responder --pregunta "¿Qué video trajo más pagos este mes?" --consulta ventas-por-video \
 *       [--ventana 30] [--tipo barras] [--lectura "lo que vi"] [--propone "lo que haría"] [--fijar] [--por Levy]
 *   npm --prefix arbrain run bi -- listar
 *   npm --prefix arbrain run bi -- validar
 *
 * `responder` deja la gráfica como «respuesta» (el panel ofrece Fijar); con --fijar entra directo al tablero.
 * BI_RAIZ fija la raíz del cerebro (por defecto: la primera carpeta hacia arriba con .claude/memory/MEMORY.md).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogoEnTexto, consultaDe, esVentana, type Tipo, type Ventana } from '../src/features/bi/catalogo.ts'
import { errorDeGrafica, ESQUEMA_BI, idDePregunta, RUTA_BI, validarBI, type ArchivoBI, type Grafica } from '../src/features/bi/modelo.ts'

function raiz(): string {
  if (process.env.BI_RAIZ) return process.env.BI_RAIZ
  for (const inicio of [process.cwd(), path.dirname(fileURLToPath(import.meta.url))]) {
    let d = path.resolve(inicio)
    for (let i = 0; i < 10; i++) {
      if (existsSync(path.join(d, '.claude', 'memory', 'MEMORY.md'))) return d
      const p = path.dirname(d)
      if (p === d) break
      d = p
    }
  }
  throw new Error('No encontré la raíz del cerebro (.claude/memory/MEMORY.md). Usa BI_RAIZ.')
}

function opciones(argv: string[]) {
  const o: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const sig = argv[i + 1]
    if (sig === undefined || sig.startsWith('--')) o[a.slice(2)] = true
    else { o[a.slice(2)] = sig; i++ }
  }
  return o
}

function leer(ruta: string): ArchivoBI & { crudo: unknown } {
  if (!existsSync(ruta)) return { esquema: ESQUEMA_BI, graficas: [], crudo: null }
  const crudo = JSON.parse(readFileSync(ruta, 'utf8'))
  const v = validarBI(crudo)
  if (v.errores.length) console.error(`Aviso: el archivo trae ${v.errores.length} error(es):\n- ${v.errores.join('\n- ')}`)
  return { esquema: ESQUEMA_BI, graficas: v.graficas, crudo }
}

function escribir(ruta: string, a: ArchivoBI) {
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ esquema: ESQUEMA_BI, graficas: a.graficas }, null, 2)}\n`, 'utf8')
  renameSync(tmp, ruta)
}

/** Fecha ISO con la zona de CDMX (−06:00), como las demás fechas del cerebro. */
function ahoraCDMX(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const v = (t: string) => p.find(x => x.type === t)?.value
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}-06:00`
}

function main() {
  const [cmd, ...resto] = process.argv.slice(2)
  const o = opciones(resto)
  if (cmd === 'catalogo') { console.log(catalogoEnTexto()); return }
  const ruta = path.join(raiz(), RUTA_BI)
  if (cmd === 'listar') {
    const a = leer(ruta)
    for (const g of a.graficas) console.log(`${g.estado === 'fijada' ? '■' : '□'} ${g.id} · ${g.consulta.id}/${g.consulta.ventana} · ${g.tipo} · «${g.pregunta}»`)
    return
  }
  if (cmd === 'validar') {
    if (!existsSync(ruta)) { console.log('Todavía no hay archivo de gráficas.'); return }
    const v = validarBI(JSON.parse(readFileSync(ruta, 'utf8')))
    console.log(v.errores.length ? `${v.errores.length} error(es):\n- ${v.errores.join('\n- ')}` : `OK: ${v.graficas.length} gráficas válidas.`)
    process.exitCode = v.errores.length ? 1 : 0
    return
  }
  if (cmd === 'responder') {
    const consulta = typeof o.consulta === 'string' ? consultaDe(o.consulta) : null
    if (!consulta) throw new Error('Falta --consulta del catálogo. Míralo con: npm --prefix arbrain run bi -- catalogo')
    const ventana = (o.ventana === undefined ? (consulta.ventanas.includes(30) ? 30 : consulta.ventanas[0]) : Number(o.ventana)) as Ventana
    if (!esVentana(ventana)) throw new Error('--ventana es 7, 30 o 90.')
    const a = leer(ruta)
    const g: Grafica = {
      id: idDePregunta(String(o.pregunta ?? ''), a.graficas.map(x => x.id)),
      pregunta: String(o.pregunta ?? '').trim(),
      consulta: { id: consulta.id, ventana },
      tipo: (typeof o.tipo === 'string' ? o.tipo : consulta.tipo) as Tipo,
      fuente: consulta.fuente,
      creada: ahoraCDMX(),
      por: typeof o.por === 'string' ? o.por : 'Levy',
      estado: o.fijar ? 'fijada' : 'respuesta',
      ...(typeof o.lectura === 'string' ? { lectura: o.lectura.trim() } : {}),
      ...(typeof o.propone === 'string' ? { propone: o.propone.trim() } : {}),
    }
    const e = errorDeGrafica(g)
    if (e.length) throw new Error(e.join('\n'))
    // Una respuesta nueva reemplaza a la respuesta suelta anterior (el panel muestra una a la vez); lo fijado no se toca.
    const graficas = a.graficas.filter(x => x.estado === 'fijada')
    escribir(ruta, { esquema: ESQUEMA_BI, graficas: g.estado === 'fijada' ? [g, ...graficas] : [...graficas, g] })
    console.log(JSON.stringify(g, null, 2))
    console.error(`Listo: «${g.pregunta}» quedó ${g.estado === 'fijada' ? 'fijada en el tablero' : 'como respuesta en el panel (el dueño decide si la fija)'}.`)
    return
  }
  console.log('Uso: bi catalogo | listar | validar | responder --pregunta "…" --consulta <id> [--ventana 7|30|90] [--tipo …] [--lectura "…"] [--propone "…"] [--fijar]')
  process.exitCode = cmd ? 1 : 0
}

try { main() } catch (e) { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 }
