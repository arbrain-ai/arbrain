#!/usr/bin/env node
/**
 * La mano de Levy en Business Intelligence (7 nov 2026). El dueño pregunta en el panel; la pregunta llega al chat; Levy elige
 * una consulta del catálogo y la escribe aquí como gráfica. El panel la pinta y la recalcula cada vez que se abre.
 * Contrato completo: arbrain/docs/bi/README.md.
 *
 *   npm --prefix arbrain run bi -- catalogo
 *   npm --prefix arbrain run bi -- responder --pregunta "¿Qué es lo que más vendo?" --consulta lo-mas-vendido \
 *       [--ventana 30] [--tipo barras] [--lectura "lo que vi"] [--propone "lo que haría"] [--fijar] [--por Levy]
 *   npm --prefix arbrain run bi -- listar
 *   npm --prefix arbrain run bi -- validar
 *   npm --prefix arbrain run bi -- fuentes                       # catálogo genérico: qué consulta ya tiene fuente
 *   npm --prefix arbrain run bi -- leer --consulta ventas [--ventana 30]   # corre la consulta y dice lo que ve
 *   npm --prefix arbrain run bi -- ejemplo                       # siembra el café de ejemplo para practicar
 *
 * `responder` deja la gráfica como «respuesta» (el panel ofrece Fijar); con --fijar entra directo al tablero.
 * Catálogo: el del autor en su instalación; en cualquier otra, el genérico conectado a `bi-fuentes.json`.
 * BI_RAIZ fija la raíz del cerebro (por defecto: la primera carpeta hacia arriba con .claude/memory/MEMORY.md).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogoEnTexto, consultaEn, esVentana, type Consulta, type Tipo, type Ventana } from '../src/features/bi/catalogo.ts'
import { catalogoGenerico, RUTA_FUENTES, RUTA_LLAVES } from '../src/features/bi/generico.ts'
import { ejecutarGenerico, leerArchivoFuentes } from '../src/features/bi/motor.ts'
import { errorDeGrafica, ESQUEMA_BI, idDePregunta, leer as leerLectura, RUTA_BI, validarBI, type ArchivoBI, type Grafica } from '../src/features/bi/modelo.ts'
import { CATALOGO_AUTOR } from '../src/features/bi/autor/catalogo.ts'
import { esEdicionCliente } from '../src/lib/edicion.ts'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const EJEMPLO = path.join(AQUI, '..', 'docs', 'bi', 'ejemplo')

function raiz(): string {
  if (process.env.BI_RAIZ) return process.env.BI_RAIZ
  for (const inicio of [process.cwd(), AQUI]) {
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

/** El catálogo vigente: el del autor en su instalación; si no, el genérico con las fuentes del dueño. */
async function catalogo(base: string): Promise<{ catalogo: Consulta[]; generico: boolean }> {
  if (CATALOGO_AUTOR.length > 0 && !esEdicionCliente()) return { catalogo: [...CATALOGO_AUTOR], generico: false }
  return { catalogo: catalogoGenerico((await leerArchivoFuentes(base)).archivo), generico: true }
}

function leer(ruta: string, cat: readonly Consulta[]): ArchivoBI & { crudo: unknown } {
  if (!existsSync(ruta)) return { esquema: ESQUEMA_BI, graficas: [], crudo: null }
  const crudo = JSON.parse(readFileSync(ruta, 'utf8'))
  const v = validarBI(crudo, cat)
  if (v.errores.length) console.error(`Aviso: el archivo trae ${v.errores.length} error(es):\n- ${v.errores.join('\n- ')}`)
  return { esquema: ESQUEMA_BI, graficas: v.graficas, crudo }
}

function escribir(ruta: string, a: ArchivoBI) {
  mkdirSync(path.dirname(ruta), { recursive: true })
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

/** Siembra el café de ejemplo: los CSV en `mi-negocio/datos/ejemplo/` y los archivos de «Mi negocio» que todavía no existan. */
function sembrarEjemplo(base: string) {
  const datos = path.join(base, 'mi-negocio', 'datos', 'ejemplo')
  mkdirSync(datos, { recursive: true })
  for (const f of readdirSync(path.join(EJEMPLO, 'datos'))) copyFileSync(path.join(EJEMPLO, 'datos', f), path.join(datos, f))
  const carpeta = path.join(base, path.dirname(RUTA_FUENTES))
  mkdirSync(carpeta, { recursive: true })
  const hechos: string[] = [], respetados: string[] = []
  for (const f of ['bi-fuentes.json', 'bi.json', 'embudo.json', 'voz-del-cliente.json']) {
    const destino = path.join(carpeta, f)
    if (existsSync(destino)) { respetados.push(f); continue }
    copyFileSync(path.join(EJEMPLO, f), destino)
    hechos.push(f)
  }
  console.log(`Datos del café de ejemplo en ${path.relative(base, datos)}/.`)
  if (hechos.length) console.log(`Sembré en ${path.dirname(RUTA_FUENTES)}/: ${hechos.join(', ')}.`)
  if (respetados.length) console.log(`No toqué los que ya tenías: ${respetados.join(', ')} (bórralos tú si quieres el ejemplo completo).`)
}

async function main() {
  const [cmd, ...resto] = process.argv.slice(2)
  const o = opciones(resto)
  if (!cmd || cmd === 'ayuda') {
    console.log('Uso: bi catalogo | fuentes | leer --consulta <id> [--ventana 7|30|90] | listar | validar | ejemplo | responder --pregunta "…" --consulta <id> [--ventana 7|30|90] [--tipo …] [--lectura "…"] [--propone "…"] [--fijar]')
    process.exitCode = cmd ? 0 : 1
    return
  }
  const base = raiz()
  const ruta = path.join(base, RUTA_BI)
  if (cmd === 'ejemplo') { sembrarEjemplo(base); return }
  const { catalogo: cat, generico } = await catalogo(base)
  if (cmd === 'catalogo') { console.log(catalogoEnTexto(cat)); return }
  if (cmd === 'fuentes') {
    if (!generico) { console.log('Esta instalación usa el catálogo del autor: sus consultas leen sus fuentes fijas.'); return }
    const e = await leerArchivoFuentes(base)
    if (!e.existe) console.log(`Todavía no hay ${RUTA_FUENTES}: el motor está vacío. Contrato: arbrain/docs/bi/README.md (o «bi -- ejemplo» para practicar).`)
    for (const err of e.errores) console.log(`Error: ${err}`)
    for (const f of e.archivo?.fuentes ?? []) console.log(`fuente ${f.id} · ${f.tipo} · ${f.ruta ?? f.tabla} (fecha: ${f.fecha})`)
    for (const c of cat) console.log(`${c.conectada ? '■' : '□'} ${c.id} · ${c.nombre}${c.conectada ? ` ← ${c.fuente}` : ` · falta: ${c.falta}`}`)
    console.log(`Llaves de las bases: en el entorno o en ${RUTA_LLAVES} (BI_…), nunca en la memoria.`)
    return
  }
  if (cmd === 'leer') {
    if (!generico) throw new Error('En esta instalación las consultas se leen desde el panel (catálogo del autor).')
    const c = typeof o.consulta === 'string' ? consultaEn(cat, o.consulta) : null
    if (!c) throw new Error('Falta --consulta del catálogo. Míralo con: npm --prefix arbrain run bi -- catalogo')
    const ventana = (o.ventana === undefined ? (c.ventanas.includes(30) ? 30 : c.ventanas[0]) : Number(o.ventana)) as Ventana
    if (!esVentana(ventana)) throw new Error('--ventana es 7, 30 o 90.')
    const r = await ejecutarGenerico(base, c.id, ventana)
    const l = leerLectura(c, (typeof o.tipo === 'string' ? o.tipo : c.tipo) as Tipo, ventana, r.datos)
    console.log(`${c.nombre} · ${ventana} días · al ${r.hasta} · ${c.fuente}`)
    console.log(l.frase)
    if (l.detalle && l.detalle !== l.frase) console.log(l.detalle)
    if (r.aviso) console.log(`Aviso: ${r.aviso}`)
    if (r.datos.forma === 'serie') console.log(r.datos.puntos.slice(-Math.min(ventana, 14)).map(p => `${p.fecha} ${p.valor ?? '—'}`).join('\n'))
    else if (r.datos.forma === 'barras') console.log([...r.datos.barras, ...(r.datos.resto ? [r.datos.resto] : [])].map(b => `${b.etiqueta}: ${b.valor}`).join('\n'))
    else console.log(r.datos.pasos.map(p => `${p.etiqueta}: ${p.valor}`).join('\n'))
    return
  }
  if (cmd === 'listar') {
    const a = leer(ruta, cat)
    for (const g of a.graficas) console.log(`${g.estado === 'fijada' ? '■' : '□'} ${g.id} · ${g.consulta.id}/${g.consulta.ventana} · ${g.tipo} · «${g.pregunta}»`)
    return
  }
  if (cmd === 'validar') {
    let errores = 0
    if (!existsSync(ruta)) console.log('Todavía no hay archivo de gráficas.')
    else {
      const v = validarBI(JSON.parse(readFileSync(ruta, 'utf8')), cat)
      errores += v.errores.length
      console.log(v.errores.length ? `Gráficas: ${v.errores.length} error(es):\n- ${v.errores.join('\n- ')}` : `Gráficas OK: ${v.graficas.length} válidas.`)
    }
    if (generico) {
      const e = await leerArchivoFuentes(base)
      errores += e.errores.length
      if (e.existe) console.log(e.errores.length ? `Fuentes: ${e.errores.length} error(es):\n- ${e.errores.join('\n- ')}` : `Fuentes OK: ${e.archivo?.fuentes.length ?? 0} fuentes, ${cat.filter(c => c.conectada).length} de ${cat.length} consultas conectadas.`)
    }
    process.exitCode = errores ? 1 : 0
    return
  }
  if (cmd === 'responder') {
    const consulta = typeof o.consulta === 'string' ? consultaEn(cat, o.consulta) : null
    if (!consulta) throw new Error('Falta --consulta del catálogo. Míralo con: npm --prefix arbrain run bi -- catalogo')
    const ventana = (o.ventana === undefined ? (consulta.ventanas.includes(30) ? 30 : consulta.ventanas[0]) : Number(o.ventana)) as Ventana
    if (!esVentana(ventana)) throw new Error('--ventana es 7, 30 o 90.')
    const a = leer(ruta, cat)
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
    const e = errorDeGrafica(g, 'La gráfica', cat)
    if (e.length) throw new Error(e.join('\n'))
    // Una respuesta nueva reemplaza a la respuesta suelta anterior (el panel muestra una a la vez); lo fijado no se toca.
    const graficas = a.graficas.filter(x => x.estado === 'fijada')
    escribir(ruta, { esquema: ESQUEMA_BI, graficas: g.estado === 'fijada' ? [g, ...graficas] : [...graficas, g] })
    console.log(JSON.stringify(g, null, 2))
    console.error(`Listo: «${g.pregunta}» quedó ${g.estado === 'fijada' ? 'fijada en el tablero' : 'como respuesta en el panel (el dueño decide si la fija)'}.`)
    if (consulta.conectada === false) console.error(`Ojo: «${consulta.nombre}» todavía no tiene fuente; el panel dirá «conecta tu fuente». ${consulta.falta ?? ''}`)
    return
  }
  console.log('Uso: bi catalogo | fuentes | leer | listar | validar | ejemplo | responder (ver arbrain/docs/bi/README.md)')
  process.exitCode = 1
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
