// «La historia de tu cerebro», ronda 2 (27 oct 2026): vocabulario sin jerga de git, trailer de autor, el día en una
// frase, «Hecho» y nombres legibles de los trabajos. Contrato: docs/builds/harness-noche-2026-10-27/nodos/historia.md.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  NOMBRE_CORRE, NOMBRE_ESTADO, NOMBRE_HECHO, NOMBRE_QUIEN, cuerpo, estadoCarril, eventoDe, firmaDe, fraseDe, fraseEnCurso, nombreCarril, nombreTrabajo,
  ordenarHecho, quienDe, resumenDia, sinGuardarPorArea, textoLugar, tipoHecho, tituloEncargo, tituloHecho, type Evento,
} from '../../src/features/historia/modelo'
import { leerCarriles, leerHistoria } from '../../src/features/historia/servidor'

/** Palabras de git que el avatar (profesional de 40 a 55 años, no técnico) no debe leer. */
const JERGA = /\b(main|master|merge\w*|ramas?|worktrees?|commit\w*|branch\w*)\b/i
const IA = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const yo = { autor: 'Autora Ejemplo', correo: 'autora@example.com' }
const raizRepo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

// ── Vocabulario ──

/** Lo que se ve en la pantalla: texto JSX y cadenas con espacio, acento o mayúscula inicial. Sin comentarios ni la tira técnica. */
function textosVisibles(fuente: string): string[] {
  let s = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  // La tira técnica de Daniel está marcada (data-tecnico) y puede usar palabras técnicas.
  const i = s.indexOf('function TiraTecnica')
  if (i >= 0) { const j = s.indexOf('\nfunction ', i + 10); s = s.slice(0, i) + s.slice(j) }
  s = s.replace(/^import .*$/gm, '')
  const out: string[] = []
  for (const m of s.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
    const t = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    if (/\s|[áéíóúñ¿«»]|^[A-ZÁÉÍÓÚ]/.test(t) && !/^[\w-]+(\s[\w-]+)*$/.test(t.trim()) || /\s/.test(t.trim())) out.push(t)
  }
  for (const m of s.matchAll(/>([^<>{}\n]*[A-Za-zÁÉÍÓÚáéíóúñ][^<>{}\n]*)</g)) out.push(m[1])
  return out.filter(t => t.trim() && !/^(var\(|\/api|M\d|translate|rgba?\()/.test(t.trim()))
}

test('vocabulario: ningún texto visible de la vista dice main, merge, rama, worktree ni commit', () => {
  // HistoriaSeccion.tsx salió el 28 oct 2026 (/historia redirige a Taller › Historia). La capa técnica (GrafoGit.tsx) sí usa
  // esas palabras a propósito: es para aprender git, y cada una trae su «qué significa» (tests/historia/taller.test.ts).
  for (const f of ['Historia.tsx']) {
    const fuente = readFileSync(path.join(__dirname, '../../src/features/historia', f), 'utf8')
    const textos = textosVisibles(fuente)
    assert.ok(textos.length > 60, `se leyeron los textos de ${f}`)
    const malos = textos.filter(t => JERGA.test(t))
    assert.deepEqual(malos, [], `${f} muestra jerga: ${malos.join(' | ')}`)
  }
  // La tira técnica existe y está marcada como tal.
  assert.match(readFileSync(path.join(__dirname, '../../src/features/historia/Historia.tsx'), 'utf8'), /data-tecnico aria-label="Para ti: qué corre/)
})

test('vocabulario: estados, nombres y frases fijas sin jerga', () => {
  const fijas = [...Object.values(NOMBRE_ESTADO), ...Object.values(NOMBRE_CORRE), ...Object.values(NOMBRE_QUIEN), ...Object.values(NOMBRE_HECHO),
    fraseEnCurso({}, 0), fraseEnCurso({ memoria: 3, producto: 136 }, 139),
    textoLugar({ estado: 'al-dia' }), textoLugar({ estado: 'faltan', faltan: 3 }), textoLugar({ estado: 'sin-verificar', faltan: 4, estimado: true })]
  for (const t of fijas) assert.doesNotMatch(t, JERGA, t)
  assert.equal(NOMBRE_ESTADO.listo, 'Listo para incorporar')
  assert.equal(NOMBRE_ESTADO['en-main'], 'Ya incorporado')
})

test('vocabulario: los mensajes reales de este repo se leen sin jerga', () => {
  const asuntos = execFileSync('git', ['-C', raizRepo, 'log', '-n', '500', '--format=%s', '--all'], { encoding: 'utf8', maxBuffer: 32 << 20 }).split('\n').filter(Boolean)
  assert.ok(asuntos.length > 50)
  const malos = asuntos.map(a => fraseDe(a)).filter(f => JERGA.test(f.frase) || (f.tema && JERGA.test(f.tema)))
  assert.deepEqual(malos.slice(0, 5), [], 'frases con jerga')
  const ramas = execFileSync('git', ['-C', raizRepo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  for (const r of ramas) {
    const n = nombreTrabajo(r)
    assert.doesNotMatch(n, /^[a-z0-9]+([-_][a-z0-9]+)+$/i, `«${r}» no se muestra crudo`)
    assert.doesNotMatch(n, /\bdiseno\b/i, 'la ñ regresa')
  }
})

test('nombre del trabajo: la nota del encargo, el tema de sus cambios o la carpeta legible; nunca el nombre crudo', () => {
  assert.equal(tituloEncargo('# Nodo historia · «La historia de tu cerebro» (27 oct 2026)'), 'La historia de tu cerebro')
  assert.equal(tituloEncargo('# Nodo deshacer: Ver y deshacer (SPEC C.3, BRECHA filas 5 y 6)'), 'Ver y deshacer')
  assert.equal(tituloEncargo('# Nodo C.1 · Dieta de contexto de la Cabina (27 oct 2026)'), 'Dieta de contexto de la Cabina')
  assert.equal(tituloEncargo('# Manos para Windows — Spec (17 oct 2026)'), 'Manos para Windows')
  assert.equal(tituloEncargo('# Noche del harness: superar en UX a T3 Code (27-28 oct 2026)'), 'Noche del harness')
  assert.equal(nombreTrabajo('hn-historia', { titulo: '# Nodo historia · «La historia de tu cerebro»' }), 'La historia de tu cerebro')
  assert.equal(nombreTrabajo('ht-runtime', { asuntos: ['Soporte fundadores: borrador de un fundador', 'Soporte fundadores 28 oct: reporte', 'CI: ganchos en Windows'] }), 'Soporte fundadores')
  assert.equal(nombreTrabajo('hn-competencia', { asuntos: ['harness-noche: investigación competitiva con fuentes'] }), 'Investigación competitiva con fuentes')
  assert.equal(nombreTrabajo('fundador-chat-navegador', { asuntos: ['Chat por navegador fuera de loopback (un fundador)'] }), 'Chat por navegador desde otros equipos')
  assert.equal(nombreTrabajo('diseno-unificado'), 'Diseño unificado')
  assert.equal(nombreTrabajo('ht-runtime'), 'Acompañamiento runtime')
  assert.equal(nombreCarril('wt-goal-ux'), 'Goal UX')
  const j = fraseDe("Merge branch 'diseno-unificado'")
  assert.equal(j.frase, 'Se incorporó «Diseño unificado» a tu cerebro principal')
  assert.equal(fraseDe("Merge remote-tracking branch 'origin/main' into casa-realista").frase, '«Casa realista» se puso al día con tu cerebro principal')
  assert.equal(fraseDe('harness-noche: SPEC de la noche').tema, 'Harness noche')
})

// ── Quién, verificable ──

test('trailer de autor: «Agente:» y «Subagente:» mandan sobre la regla por carril', () => {
  assert.deepEqual(firmaDe(`Perro: algo\n\nAgente: levy\n${IA}`), { quien: 'levy', nombre: 'Levy' })
  assert.deepEqual(firmaDe('Notas\n\nSubagente: hn-historia'), { quien: 'subagente', nombre: 'hn-historia' })
  assert.deepEqual(firmaDe('Notas\n\nAgente: persona'), { quien: 'persona', nombre: 'Tú' })
  assert.equal(firmaDe('Sin firma\n\nEl agente: hizo algo en medio del texto'), null, 'solo un renglón propio cuenta')
  // Levy trabajando en un carril que no es el principal: sin trailer sería «agente»; con trailer, Levy.
  assert.equal(quienDe({ ...yo, mensaje: `Perro: algo\n\nAgente: levy\n${IA}` }, { carril: 'hn-historia' }), 'levy')
  // Un subagente que trabajó directo en el cerebro principal: sin trailer se contaría como Levy.
  assert.equal(quienDe({ ...yo, mensaje: `Perro: algo\n\nSubagente: hn-dieta\n${IA}` }, { carril: 'main' }), 'subagente')
  // Daniel firmando aunque haya coautor de IA.
  assert.equal(quienDe({ ...yo, mensaje: `Mi nota\n\nAgente: persona\n${IA}` }), 'persona')
  // Las rutinas siguen ganando por su prefijo.
  assert.equal(quienDe({ ...yo, mensaje: 'auto(tareas-espejo): 1 file(s) updated\n\nAgente: levy' }), 'rutina')
  const base = { sha: 'a'.repeat(40), padres: ['b'.repeat(40)], ...yo, fecha: '2026-10-27T18:00:00-06:00', archivos: [] }
  const ev = eventoDe({ ...base, mensaje: `Historia: una línea por evento\n\nPor qué.\n\nSubagente: hn-historia\n${IA}` }, { carril: 'main', nombres: new Map([['hn-historia', 'La historia de tu cerebro']]) })
  assert.equal(ev.quien, 'subagente'); assert.equal(ev.quienNombre, 'Agente · La historia de tu cerebro'); assert.equal(ev.firmado, true)
  assert.equal(eventoDe({ ...base, mensaje: `X\n\nSubagente: hn-dieta\n${IA}` }).quienNombre, 'Agente · Dieta')
  assert.equal(eventoDe({ ...base, mensaje: `X\n\nSubagente: Investigador de mercado\n${IA}` }).quienNombre, 'Agente · Investigador de mercado')
  assert.equal(cuerpo(`Título\n\nPor qué.\n\nSubagente: hn-historia\nAgente: levy\n${IA}`), 'Por qué.', 'los trailers no se leen como «por qué»')
})

// ── El día en una frase ──

const ev = (cuando: string, areas: [Evento['areas'][number]['area'], number][]): Evento => ({
  sha: cuando, corto: 'x', tipo: 'cambio', quien: 'levy', quienNombre: 'Levy', cuando, frase: 'x', corre: 'al-instante',
  areas: areas.map(([area, archivos]) => ({ area, archivos, mas: 1, menos: 0 })), total: { archivos: 1, mas: 1, menos: 0 },
})

test('resumen del día: cuántas veces cambió y en qué parte, y los trabajos en una frase humana', () => {
  const ahora = Date.parse('2026-10-27T20:00:00-06:00')
  const eventos = [
    ev('2026-10-27T19:00:00-06:00', [['memoria', 2]]), ev('2026-10-27T18:00:00-06:00', [['memoria', 1], ['producto', 3]]),
    ev('2026-10-27T17:00:00-06:00', [['producto', 9], ['memoria', 1]]), ev('2026-10-27T09:00:00-06:00', [['skills', 1]]),
    ev('2026-10-26T09:00:00-06:00', [['skills', 1]]),
  ]
  const r = resumenDia(eventos, ahora, [{ estado: 'trabajando' }, { estado: 'trabajando' }, { estado: 'listo' }, { estado: 'en-main' }])
  assert.equal(r.titular, 'Hoy tu cerebro cambió 4 veces')
  assert.equal(r.detalle, '1 en memoria, 1 en habilidades y 2 en el producto.', 'cada cambio cuenta una vez, por su parte principal')
  assert.equal(r.trabajos, '2 trabajos en curso y 1 listo para incorporar.')
  assert.equal(resumenDia(eventos, ahora).trabajos, null, 'sin trabajos leídos no se inventa nada')
  assert.equal(resumenDia([], ahora, []).titular, 'Hoy tu cerebro no ha cambiado todavía')
  assert.equal(resumenDia([], ahora, []).trabajos, 'Ningún trabajo en curso.')
  assert.equal(resumenDia(eventos.slice(0, 1), ahora, [{ estado: 'trabajando' }]).titular, 'Hoy tu cerebro cambió 1 vez')
})

test('cambios abiertos: estado sin cifra que asuste; «Todo está respaldado» cuando no hay', () => {
  assert.equal(fraseEnCurso({}, 0), 'Todo está respaldado.')
  const f = fraseEnCurso(sinGuardarPorArea(['.claude/memory/a.md', 'arbrain/src/x.ts', 'docs/a.md']), 3)
  assert.match(f, /^Levy y las rutinas tienen cambios abiertos en memoria, el producto y contenido\. Es normal/)
  assert.doesNotMatch(f, /\d/, 'sin número')
})

test('estado: un trabajo sin copia que lleva más de un día quieto se guardó aparte; no espera tu sí', () => {
  const ahora = Date.parse('2026-10-27T20:00:00-06:00')
  const u = (h: number) => ({ cuando: new Date(ahora - h * 3600_000).toISOString(), mensaje: 'x', autor: 'D', correo: 'd@x' })
  assert.equal(estadoCarril({ adelante: 2, sinGuardar: 0, ultimo: u(30), copia: 'wt-x' }, ahora), 'listo')
  assert.equal(estadoCarril({ adelante: 2, sinGuardar: 0, ultimo: u(30) }, ahora), 'quieto')
  assert.equal(estadoCarril({ adelante: 2, sinGuardar: 0, ultimo: u(6) }, ahora), 'listo')
})

// ── Hecho ──

test('hecho: qué es un entregable y cómo se titula', () => {
  assert.equal(tipoHecho('docs/builds/harness-noche-2026-10-27/SPEC.md'), 'documento')
  assert.equal(tipoHecho('docs/builds/harness-noche-2026-10-27/nodos/historia.md'), 'documento')
  assert.equal(tipoHecho('docs/builds/x/capturas/INDICE.md'), null, 'las capturas no son entregable')
  assert.equal(tipoHecho('docs/builds/x/nodos/capturar.mjs'), null)
  assert.equal(tipoHecho('arbrain/src/app/(main)/historia/page.tsx'), 'seccion')
  assert.equal(tipoHecho('arbrain/src/app/(main)/historia/otra.tsx'), null)
  assert.equal(tipoHecho('.claude/memory/a.md'), null)
  assert.equal(tituloHecho('docs/builds/x/SPEC.md', '# La **historia** de tu `cerebro`\n\ntexto'), 'La historia de tu cerebro')
  assert.equal(tituloHecho('arbrain/src/app/(main)/historia/page.tsx', "export const metadata = { title: 'Historia · Arbrain' }"), 'Historia')
  assert.equal(tituloHecho('docs/builds/perro-noche/reporte-final.md', null), 'Reporte final')
  const h = ordenarHecho([
    { tipo: 'documento', titulo: 'A', cuando: '2026-10-26T10:00:00-06:00', quienNombre: 'Levy', sha: '1', ruta: 'docs/builds/a.md' },
    { tipo: 'documento', titulo: 'A', cuando: '2026-10-27T10:00:00-06:00', quienNombre: 'Levy', sha: '2', ruta: 'docs/builds/a.md' },
    { tipo: 'trabajo', titulo: 'B', cuando: '2026-10-27T11:00:00-06:00', quienNombre: 'Agente · B', sha: '3' },
  ])
  assert.deepEqual(h.map(x => x.sha), ['3', '2'], 'lo más nuevo primero; un documento recreado cuenta una vez')
})

function repoTemporal() {
  const dir = mkdtempSync(path.join(tmpdir(), 'historia-r2-'))
  const g = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 'Autora Prueba'); g('config', 'user.email', 'prueba@example.com'); g('config', 'commit.gpgsign', 'false')
  const escribir = (rel: string, texto: string) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), texto) }
  return { dir, g, escribir }
}

test('repo temporal: «Hecho», la tira, el resumen y los nombres legibles salen de git', async () => {
  const { dir, g, escribir } = repoTemporal()
  escribir('.claude/memory/a.md', 'uno\n'); g('add', '-A'); g('commit', '-q', '-m', 'Inicio')
  g('checkout', '-q', '-b', 'hn-mapa')
  escribir('docs/builds/obra-2026-10-27/nodos/mapa.md', '# Nodo mapa · «El mapa de los trabajos» (27 oct)\n')
  escribir('docs/builds/obra-2026-10-27/REPORTE.md', '# Reporte de la noche\n\nTexto.\n')
  escribir('arbrain/src/app/(main)/mapa/page.tsx', "export const metadata = { title: 'Mapa · Arbrain' }\n")
  g('add', '-A'); g('commit', '-q', '-m', `Mapa: la sección y su reporte\n\nSubagente: hn-mapa\n${IA}`)
  g('checkout', '-q', 'main'); g('merge', '-q', '--no-ff', '-m', `Merge branch 'hn-mapa'\n\n${IA}`, 'hn-mapa')
  g('checkout', '-q', '-b', 'diseno-tinta'); escribir('arbrain/src/b.ts', 'export const b = 1\n'); g('add', '-A'); g('commit', '-q', '-m', `Tinta: colores con significado\n\n${IA}`)
  g('checkout', '-q', 'main')

  const h = await leerHistoria(dir, { limite: 10 })
  assert.match(h.eventos[0].frase, /^Se incorporó «El mapa de los trabajos» a tu cerebro principal/, 'la junta usa el nombre del encargo')
  assert.equal(h.eventos[0].quienNombre, 'Agente · El mapa de los trabajos')
  assert.equal(h.eventos[0].dentro?.[0].firmado, true)
  const hecho = h.hecho ?? []
  assert.deepEqual(hecho.filter(x => x.tipo !== 'trabajo').map(x => [x.tipo, x.titulo]).sort(), [['documento', 'Nodo mapa · «El mapa de los trabajos» (27 oct)'], ['documento', 'Reporte de la noche'], ['seccion', 'Mapa']])
  assert.ok(hecho.some(x => x.tipo === 'trabajo' && x.titulo === 'El mapa de los trabajos'))
  assert.ok(hecho.every(x => /^[0-9a-f]{40}$/.test(x.sha)), 'cada entregable apunta a su cambio')
  assert.equal(hecho.find(x => x.tipo === 'seccion')?.quienNombre, 'Agente · Mapa', 'quien lo escribió, no la junta')
  assert.equal(h.tira?.principal.corto, g('rev-parse', '--short=7', 'HEAD'))
  assert.equal(h.tira?.web.estado, 'sin-verificar', 'sin copia de despliegue no se adivina')
  assert.equal(h.sinGuardar, 0); assert.match(fraseEnCurso(h.sinGuardarAreas, h.sinGuardar), /Todo está respaldado/)
  for (const e of h.eventos) assert.doesNotMatch(`${e.frase} ${e.quienNombre}`, JERGA)

  const { carriles } = await leerCarriles(dir)
  const tinta = carriles.find(c => c.rama === 'diseno-tinta')!
  assert.equal(tinta.nombre, 'Tinta'); assert.ok(tinta.salio); assert.equal(tinta.recientes?.[0].frase, 'Colores con significado')
  const mapa = carriles.find(c => c.rama === 'hn-mapa')!
  assert.equal(mapa.nombre, 'El mapa de los trabajos'); assert.equal(mapa.estado, 'en-main'); assert.ok(mapa.juntado && mapa.salio)
  assert.ok(Date.parse(mapa.salio!) <= Date.parse(mapa.juntado!), 'salió antes de incorporarse')
})
