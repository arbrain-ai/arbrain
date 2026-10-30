import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  areaDe, carrilDe, claveDia, correDe, cuandoAbsoluto, cuandoRelativo, estadoCarril, eventoDe, fraseDe, FORMATO_LOG, mensajeVolver, motivoNoRegresable,
  ordenarCarriles, palabras, parsearDiff, parsearLog, porArea, porDia, quienDe, resumenCodigo, resumenTexto, rutaNueva, SEP_CAMPO, SEP_REG, tipoArchivo,
} from '../../src/features/historia/modelo'
import { contarSinGuardar, hacerVolver, leerCarriles, leerDiff, leerHistoria, parsearWorktrees, previaVolver } from '../../src/features/historia/servidor'

const IA = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const yo = { autor: 'Autora Ejemplo', correo: 'autora@example.com' }

// ── Quién ──

test('autor: rutina, Levy, subagente y la persona según mensaje, coautor y carril', () => {
  assert.equal(quienDe({ ...yo, mensaje: 'auto(tareas-espejo): 1 file(s) updated' }), 'rutina')
  assert.equal(quienDe({ ...yo, mensaje: 'memoria(macbook): 15 archivo(s) sincronizados' }), 'rutina')
  assert.equal(quienDe({ ...yo, mensaje: `Perro: algo\n\n${IA}` }, { carril: 'main' }), 'levy')
  assert.equal(quienDe({ ...yo, mensaje: `Perro: algo\n\n${IA}` }), 'levy')
  assert.equal(quienDe({ ...yo, mensaje: `Perro: algo\n\n${IA}` }, { carril: 'hn-historia' }), 'subagente')
  assert.equal(quienDe({ ...yo, mensaje: `Perro: algo\n\n${IA}` }, { carril: 'wt-casa' }), 'subagente')
  assert.equal(quienDe({ ...yo, mensaje: 'Co-Authored-By: Codex <noreply@openai.com>\n' }, { carril: 'espejo' }), 'subagente')
  assert.equal(quienDe({ ...yo, mensaje: 'Notas del día' }), 'persona')
  assert.equal(quienDe({ ...yo, mensaje: 'Notas\n\nCo-Authored-By: Coautora Ejemplo <coautora@example.com>' }), 'persona', 'un coautor humano no es IA')
  assert.equal(quienDe({ autor: 'dependabot[bot]', correo: 'x@y', mensaje: 'bump' }), 'levy')
})

test('evento: sincronía con GitHub sin coautor es rutina; con coautor es Levy', () => {
  const base = { sha: 'a'.repeat(40), padres: ['b'.repeat(40), 'c'.repeat(40)], ...yo, fecha: '2026-10-27T18:00:00-06:00', archivos: [] }
  assert.equal(eventoDe({ ...base, mensaje: "Merge remote-tracking branch 'origin/main'" }).quienNombre, 'Sincronía con GitHub')
  assert.equal(eventoDe({ ...base, mensaje: `Merge origin/main en main (v0.2.12)\n\n${IA}` }).quien, 'levy')
})

// ── Áreas ──

test('áreas: memoria, skills, producto, contenido y sistema', () => {
  assert.equal(areaDe('.claude/memory/user/x.md'), 'memoria')
  assert.equal(areaDe('.claude/diario/2026-10-27.md'), 'memoria')
  assert.equal(areaDe('.claude/skills/perro/SKILL.md'), 'skills')
  assert.equal(areaDe('.claude/skills-archive/x/SKILL.md'), 'skills')
  assert.equal(areaDe('arbrain/src/app/page.tsx'), 'producto')
  assert.equal(areaDe('arbrain/server/src/agent.ts'), 'producto')
  assert.equal(areaDe('docs/builds/x/SPEC.md'), 'producto')
  assert.equal(areaDe('contenido/biblioteca/a.html'), 'contenido')
  assert.equal(areaDe('docs/business-os/MAPA.md'), 'contenido')
  assert.equal(areaDe('.claude/hooks/x.py'), 'sistema')
  assert.equal(areaDe('CLAUDE.md'), 'sistema')
  const r = porArea([{ ruta: 'arbrain/a.ts', mas: 10, menos: 2, binario: false }, { ruta: '.claude/memory/a.md', mas: 3, menos: 0, binario: false }, { ruta: 'arbrain/b.ts', mas: 1, menos: 1, binario: false }])
  assert.deepEqual(r, [{ area: 'memoria', archivos: 1, mas: 3, menos: 0 }, { area: 'producto', archivos: 2, mas: 11, menos: 3 }], 'en el orden fijo de las áreas')
})

// ── Del log a eventos humanos ──

test('parsearLog: registros, numstat, binarios y renombres', () => {
  const r = (sha: string, padres: string, msg: string, num: string) => `${SEP_REG}${sha}${SEP_CAMPO}${padres}${SEP_CAMPO}Autora${SEP_CAMPO}d@x${SEP_CAMPO}2026-10-27T18:41:10-06:00${SEP_CAMPO}${msg}${SEP_CAMPO}\n\n${num}\n`
  const texto = r('1'.repeat(40), '2'.repeat(40), `Perro: aprendizajes\n\nCuerpo largo.\n\n${IA}\n`, '3\t1\t.claude/skills/perro/SKILL.md\n-\t-\tarbrain/public/a.png\n2\t2\tdocs/{viejo => nuevo}/x.md')
    + r('3'.repeat(40), '4'.repeat(40) + ' ' + '5'.repeat(40), "Merge branch 'hn-historia'", '') + `${SEP_REG}roto`
  const cs = parsearLog(texto)
  assert.equal(cs.length, 2)
  assert.deepEqual(cs[0].archivos, [
    { ruta: '.claude/skills/perro/SKILL.md', mas: 3, menos: 1, binario: false },
    { ruta: 'arbrain/public/a.png', mas: 0, menos: 0, binario: true },
    { ruta: 'docs/nuevo/x.md', mas: 2, menos: 2, binario: false },
  ])
  assert.equal(cs[1].padres.length, 2)
  assert.equal(rutaNueva('a.md => b.md'), 'b.md')
  const ev = eventoDe(cs[0], { carril: 'main' })
  assert.equal(ev.quien, 'levy'); assert.equal(ev.tema, 'Perro'); assert.equal(ev.frase, 'Aprendizajes')
  assert.equal(ev.detalle, 'Cuerpo largo.', 'el cuerpo sin trailers')
  assert.deepEqual(ev.total, { archivos: 3, mas: 5, menos: 3 })
  assert.ok(FORMATO_LOG.includes('%B'))
})

test('frase humana: prefijos, juntas, sincronías, convencionales y jerga', () => {
  assert.deepEqual(fraseDe('Perro: el LiDAR se calla echado.'), { tipo: 'cambio', tema: 'Perro', frase: 'El LiDAR se calla echado' })
  assert.equal(fraseDe('auto(tareas-espejo): 1 file(s) updated').frase, 'Se puso al día sola: 1 archivo (tareas espejo)')
  assert.equal(fraseDe('memoria(macbook): 15 archivo(s) sincronizados').frase, 'Llegaron 15 archivos de memoria desde Macbook')
  const j = fraseDe('Merge fundador-chat-navegador: arreglo de fundador para v0.2.12')
  assert.equal(j.tipo, 'junta'); assert.equal(j.rama, 'fundador-chat-navegador')
  assert.equal(j.frase, 'Se incorporó «Fundador chat navegador» a tu cerebro principal: arreglo de fundador para v0.2.12')
  assert.equal(fraseDe("Merge branch 'hn-historia'").rama, 'hn-historia')
  assert.equal(fraseDe("Merge branch 'main' of https://github.com/x/y").tipo, 'sincroniza')
  assert.equal(fraseDe("Merge remote-tracking branch 'origin/main'").tipo, 'sincroniza')
  const t = fraseDe("Merge remote-tracking branch 'origin/main' into casa-realista")
  assert.equal(t.tipo, 'trae'); assert.equal(t.en, 'casa-realista')
  assert.equal(fraseDe('Merge main en perro-telemetria (conexion.md: dos secciones)').en, 'perro-telemetria')
  assert.deepEqual(fraseDe('fix(chat): the composer returns'), { tipo: 'cambio', tema: 'Chat', frase: 'Arreglo: The composer returns' })
  assert.equal(fraseDe('Refactor del merge de worktrees').frase, 'Reorganiza del incorporar de copia de trabajo')
  assert.equal(fraseDe('Ya funciona. Ahora: el resto').tema, undefined, 'un tema con punto no es tema')
  assert.equal(fraseDe('').frase, 'Cambio sin descripción')
  const v = fraseDe(`Volver: el LiDAR se calla\n\nArbrain-Volver: ${'a'.repeat(40)}`)
  assert.equal(v.tipo, 'volver'); assert.equal(v.volverDe, 'a'.repeat(40)); assert.match(v.frase, /^Volvió a como estaba: el LiDAR/)
})

test('cuándo: relativo y absoluto en Ciudad de México', () => {
  const ahora = Date.parse('2026-10-27T20:00:00-06:00')
  assert.equal(cuandoRelativo('2026-10-27T19:59:30-06:00', ahora), 'hace un momento')
  assert.equal(cuandoRelativo('2026-10-27T19:40:00-06:00', ahora), 'hace 20 min')
  assert.equal(cuandoRelativo('2026-10-27T17:00:00-06:00', ahora), 'hace 3 h')
  assert.equal(cuandoRelativo('2026-10-27T09:05:00-06:00', ahora), 'hoy 09:05')
  assert.equal(cuandoRelativo('2026-10-26T18:41:00-06:00', ahora), 'ayer 18:41')
  assert.match(cuandoRelativo('2026-10-23T10:00:00-06:00', ahora), /^vie 23 oct 10:00$/)
  assert.equal(cuandoRelativo('2026-09-12T10:00:00-06:00', ahora), '12 sep')
  assert.equal(cuandoAbsoluto('2026-10-27T18:41:10-06:00'), 'martes, 27 de octubre de 2026, 18:41')
  // 23:30 en México es otro día en UTC: manda México.
  assert.equal(claveDia('2026-10-27T23:30:00-06:00'), '2026-10-27')
  const dias = porDia([{ cuando: '2026-10-27T19:00:00-06:00' }, { cuando: '2026-10-27T08:00:00-06:00' }, { cuando: '2026-10-26T08:00:00-06:00' }], ahora)
  assert.deepEqual(dias.map(d => [d.titulo, d.eventos.length]), [['Hoy', 2], ['Ayer', 1]])
})

test('ya corre: memoria al instante, la app según la copia que sirve, el servidor sin verificar', () => {
  assert.equal(correDe([{ ruta: '.claude/memory/a.md' }], null), 'al-instante')
  assert.equal(correDe([{ ruta: 'arbrain/src/a.tsx' }], true), 'si')
  assert.equal(correDe([{ ruta: 'arbrain/src/a.tsx' }], false), 'no')
  assert.equal(correDe([{ ruta: 'arbrain/src/a.tsx' }], null), 'sin-verificar')
  assert.equal(correDe([{ ruta: 'arbrain/server/src/a.ts' }], true), 'sin-verificar')
})

// ── Carriles ──

test('carriles: trabajando, listo, en main, detenido; ordenados por estado y frescura', () => {
  const ahora = Date.parse('2026-10-27T20:00:00-06:00')
  const u = (h: number) => ({ cuando: new Date(ahora - h * 3600_000).toISOString(), mensaje: `x: algo\n\n${IA}`, ...yo })
  assert.equal(estadoCarril({ adelante: 0, sinGuardar: 3, ultimo: u(50) }, ahora), 'trabajando')
  assert.equal(estadoCarril({ adelante: 2, sinGuardar: 0, ultimo: u(1) }, ahora), 'trabajando')
  assert.equal(estadoCarril({ adelante: 2, sinGuardar: 0, ultimo: u(5) }, ahora), 'listo')
  assert.equal(estadoCarril({ adelante: 0, sinGuardar: 0, ultimo: u(5) }, ahora), 'en-main')
  assert.equal(estadoCarril({ adelante: 2, sinGuardar: 0, ultimo: u(24 * 9) }, ahora), 'quieto')
  const cs = ordenarCarriles([
    carrilDe({ rama: 'viejo', adelante: 0, atras: 9, sinGuardar: 0, ultimo: u(30) }, ahora),
    carrilDe({ rama: 'hn-historia', copia: 'wt-hn-historia', adelante: 1, atras: 0, sinGuardar: 2, ultimo: u(2) }, ahora),
    carrilDe({ rama: 'hn-dieta', adelante: 1, atras: 0, sinGuardar: 1, ultimo: u(1) }, ahora),
    carrilDe({ rama: 'listo-ya', adelante: 3, atras: 0, sinGuardar: 0, ultimo: u(4) }, ahora),
  ])
  assert.deepEqual(cs.map(c => [c.rama, c.estado]), [['hn-dieta', 'trabajando'], ['hn-historia', 'trabajando'], ['listo-ya', 'listo'], ['viejo', 'en-main']])
  assert.equal(cs[1].quien, 'subagente'); assert.equal(cs[1].nombre, 'Historia')
})

test('cambios sin guardar: cuenta lo tocado y lo nuevo, no el ruido de cada copia', () => {
  assert.equal(contarSinGuardar('?? arbrain/server/node_modules\0'), 0)
  assert.equal(contarSinGuardar('?? arbrain/.env.local\0 M a.md\0?? nuevo.md\0R  b.md\0viejo.md\0'), 3)
  assert.deepEqual(parsearWorktrees('worktree /a\nHEAD 1111\nbranch refs/heads/main\n\nworktree /b\nHEAD 2222\ndetached\n\n'), [{ ruta: '/a', head: '1111', rama: 'main' }, { ruta: '/b', head: '2222', rama: null }])
})

// ── Diffs legibles ──

test('diff: memorias en prosa con palabras cambiadas; código plegado con su resumen', () => {
  const diff = ['diff --git a/x.md b/x.md', '@@ -1,4 +1,5 @@', ' # Título', '-El perro camina lento.', '+El perro camina rápido.', ' ', '+Una línea nueva.', '-Algo totalmente distinto que se fue', '+Zzz', '\\ No newline at end of file'].join('\n')
  const [b] = parsearDiff(diff)
  assert.equal(b.desde, 1)
  assert.equal(b.lineas[0].tipo, 'igual')
  const c = b.lineas[1]
  assert.equal(c.tipo, 'cambio')
  if (c.tipo === 'cambio') assert.deepEqual(c.partes.filter(p => p.tipo !== 'igual'), [{ tipo: 'menos', texto: 'lento.' }, { tipo: 'mas', texto: 'rápido.' }])
  assert.ok(b.lineas.some(l => l.tipo === 'mas' && l.texto === 'Una línea nueva.'))
  assert.ok(b.lineas.some(l => l.tipo === 'menos' && l.texto.startsWith('Algo totalmente')), 'lo que no se parece no es «cambio»')
  assert.equal(resumenTexto([b]), '2 renglones nuevos, 1 corregido, 1 quitado')
  assert.equal(resumenCodigo([{ mas: 100, menos: 30 }, { mas: 20, menos: 10 }, { mas: 0, menos: 0 }]), '3 archivos de código, +120 −40')
  assert.equal(tipoArchivo('a/SKILL.md', false), 'texto'); assert.equal(tipoArchivo('a.ts', false), 'codigo'); assert.equal(tipoArchivo('a.png', true), 'binario')
  assert.deepEqual(palabras('a b', 'a b'), [{ tipo: 'igual', texto: 'a b' }])
})

// ── Volver: reglas puras ──

test('volver: solo memoria y skills, nunca fuera ni hacia arriba', () => {
  assert.equal(motivoNoRegresable('.claude/memory/user/x.md'), null)
  assert.equal(motivoNoRegresable('.claude/skills/perro/SKILL.md'), null)
  for (const r of ['arbrain/src/a.ts', 'CLAUDE.md', '.claude/settings.json', '.claude/memory/../../etc/passwd', '/etc/passwd', '~/.ssh/id', '.claude/memory\\x', '.claude/memory//x', 'C:/x', '', '.claude/memoryx/a.md'])
    assert.ok(motivoNoRegresable(r), `debió rechazar ${r}`)
  const m = mensajeVolver({ frase: 'El perro camina', sha: 'a'.repeat(40), cuando: '2026-10-27T18:41:10-06:00', rutas: ['.claude/memory/a.md'] })
  assert.match(m, /^Volver: El perro camina\n/); assert.match(m, /Arbrain-Volver: a{40}$/); assert.ok(!/co-authored-by/i.test(m), 'el regreso es de quien hizo clic')
})

// ── Contra un repo temporal (nunca el repo real) ──

function repoTemporal() {
  const dir = mkdtempSync(path.join(tmpdir(), 'historia-'))
  const g = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '', GIT_COMMITTER_DATE: '' } }).trim()
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 'Autora Prueba'); g('config', 'user.email', 'prueba@example.com'); g('config', 'commit.gpgsign', 'false')
  const escribir = (rel: string, texto: string) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), texto) }
  const leer = (rel: string) => readFileSync(path.join(dir, rel), 'utf8')
  return { dir, g, escribir, leer }
}

test('repo temporal: historia, carriles, diff y volver de punta a punta', async () => {
  const { dir, g, escribir, leer } = repoTemporal()
  escribir('.claude/memory/user/perro.md', '# Perro\n\nEl perro camina lento.\n')
  escribir('arbrain/src/a.ts', 'export const a = 1\n')
  g('add', '-A'); g('commit', '-q', '-m', 'Inicio: el cerebro nace')
  escribir('.claude/memory/user/perro.md', '# Perro\n\nEl perro camina rápido.\n\nYa sube escaleras.\n')
  escribir('.claude/skills/perro/SKILL.md', '# Skill del perro\n')
  escribir('arbrain/src/a.ts', 'export const a = 2\nexport const b = 3\n')
  g('add', '-A'); g('commit', '-q', '-m', `Perro: aprendió a subir escaleras\n\nLo vimos en la sala.\n\n${IA}`)
  const cambio = g('rev-parse', 'HEAD')
  // Un agente en su carril, juntado con merge.
  g('checkout', '-q', '-b', 'hn-memoria')
  escribir('.claude/memory/user/agente.md', 'Nota del agente\n')
  g('add', '-A'); g('commit', '-q', '-m', `Memoria: nota del agente\n\n${IA}`)
  g('checkout', '-q', 'main'); g('merge', '-q', '--no-ff', '-m', "Merge branch 'hn-memoria'", 'hn-memoria')
  // Otro carril que sigue trabajando, en su propia copia.
  const copia = path.join(path.dirname(dir), `${path.basename(dir)}-wt`)
  g('worktree', 'add', '-q', '-b', 'hn-vivo', copia)
  writeFileSync(path.join(copia, 'borrador.md'), 'a medias\n')

  const h = await leerHistoria(dir, { limite: 20 })
  assert.equal(h.rama, 'main')
  assert.deepEqual(h.eventos.map(e => e.tipo), ['junta', 'cambio', 'cambio'])
  const [junta, perro] = h.eventos
  assert.equal(junta.quien, 'subagente'); assert.equal(junta.dentroTotal, 1); assert.equal(junta.dentro?.[0].quienNombre, 'Agente · Memoria')
  assert.equal(perro.quien, 'levy'); assert.equal(perro.tema, 'Perro'); assert.equal(perro.detalle, 'Lo vimos en la sala.')
  assert.deepEqual(perro.areas.map(a => a.area), ['memoria', 'skills', 'producto'])
  assert.equal(h.eventos[2].quien, 'persona')

  const { carriles } = await leerCarriles(dir)
  const vivo = carriles.find(c => c.rama === 'hn-vivo')!
  assert.equal(vivo.estado, 'trabajando'); assert.equal(vivo.sinGuardar, 1); assert.equal(vivo.copia, path.basename(copia))
  const agente = carriles.find(c => c.rama === 'hn-memoria')!
  assert.equal(agente.estado, 'en-main'); assert.ok(agente.juntado)

  const d = await leerDiff(dir, cambio)
  const mem = d.archivos.find(a => a.ruta === '.claude/memory/user/perro.md')!
  assert.equal(mem.tipo, 'texto'); assert.equal(mem.regresable, true); assert.ok(mem.bloques?.length)
  const cod = d.archivos.find(a => a.ruta === 'arbrain/src/a.ts')!
  assert.equal(cod.tipo, 'codigo'); assert.equal(cod.bloques, undefined, 'el código llega plegado'); assert.equal(cod.regresable, false)
  const nueva = d.archivos.find(a => a.ruta === '.claude/skills/perro/SKILL.md')!
  assert.equal(nueva.estado, 'nuevo')

  // Vista previa: no escribe nada.
  const antesHead = g('rev-parse', 'HEAD')
  const p = await previaVolver(dir, cambio)
  assert.equal(g('rev-parse', 'HEAD'), antesHead)
  assert.deepEqual(p.archivos.map(a => [a.ruta, a.accion]), [['.claude/memory/user/perro.md', 'restaura'], ['.claude/skills/perro/SKILL.md', 'borra']])
  assert.deepEqual(p.rechazados.map(r => r.ruta), ['arbrain/src/a.ts'])

  // Todo o nada: con el código dentro se rechaza y no se toca ningún archivo.
  await assert.rejects(hacerVolver(dir, cambio), /solo está disponible para memorias y habilidades/)
  assert.equal(g('rev-parse', 'HEAD'), antesHead)
  assert.match(leer('.claude/memory/user/perro.md'), /rápido/)

  // Fuera de lo permitido y rutas tramposas.
  await assert.rejects(hacerVolver(dir, cambio, ['arbrain/src/a.ts']), /memorias y habilidades/)
  await assert.rejects(hacerVolver(dir, cambio, ['.claude/memory/../../x']), /Ruta inválida/)
  await assert.rejects(hacerVolver(dir, cambio, ['.claude/memory/user/otro.md']), /no cambió en este cambio/)
  await assert.rejects(hacerVolver(dir, 'zzz'), /no existe/)

  // Archivo sucio: se rechaza.
  escribir('.claude/memory/user/perro.md', '# Perro\n\nEditado a mano sin guardar.\n')
  await assert.rejects(hacerVolver(dir, cambio, ['.claude/memory/user/perro.md']), /cambios sin guardar/)
  assert.match(leer('.claude/memory/user/perro.md'), /a mano/, 'lo de la persona queda intacto')
  g('checkout', '-q', '--', '.claude/memory/user/perro.md')

  // Volver de verdad: commit NUEVO, historia intacta.
  const r = await hacerVolver(dir, cambio, ['.claude/memory/user/perro.md', '.claude/skills/perro/SKILL.md'])
  assert.equal(g('rev-parse', 'HEAD^'), antesHead, 'el regreso se apila encima, no reescribe')
  assert.equal(g('rev-list', '--count', 'HEAD'), '5')
  assert.equal(leer('.claude/memory/user/perro.md'), '# Perro\n\nEl perro camina lento.\n')
  assert.ok(!existsSync(path.join(dir, '.claude/skills/perro/SKILL.md')))
  assert.match(leer('arbrain/src/a.ts'), /b = 3/, 'lo que no se pidió no se toca')
  const msg = g('log', '-1', '--format=%B')
  assert.match(msg, /^Volver: Aprendió a subir escaleras/); assert.match(msg, new RegExp(`Arbrain-Volver: ${cambio}`))
  assert.equal(g('status', '--porcelain', '--untracked-files=no'), '')
  const h2 = await leerHistoria(dir, { limite: 5 })
  assert.equal(h2.eventos[0].tipo, 'volver'); assert.equal(h2.eventos[0].quien, 'persona'); assert.equal(h2.eventos[0].volverDe, cambio)

  // Y el regreso se deshace con otro regreso.
  await assert.rejects(hacerVolver(dir, cambio, ['.claude/memory/user/perro.md']), /Ya está como estaba/)
  const r2 = await hacerVolver(dir, r.sha)
  assert.equal(leer('.claude/memory/user/perro.md'), '# Perro\n\nEl perro camina rápido.\n\nYa sube escaleras.\n')
  assert.equal(leer('.claude/skills/perro/SKILL.md'), '# Skill del perro\n')
  assert.match(g('log', '-1', '--format=%s'), /^Volver: deshacer el regreso de/)
  assert.equal(g('rev-list', '--count', 'HEAD'), '6')
  assert.notEqual(r2.sha, r.sha)
})

test('repo temporal: enlaces y HEAD suelto se rechazan', async () => {
  const { dir, g, escribir } = repoTemporal()
  escribir('.claude/memory/a.md', 'uno\n'); escribir('fuera.md', 'secreto\n')
  g('add', '-A'); g('commit', '-q', '-m', 'Inicio')
  symlinkSync('../../fuera.md', path.join(dir, '.claude/memory/enlace.md'))
  escribir('.claude/memory/a.md', 'dos\n')
  g('add', '-A'); g('commit', '-q', '-m', 'Cambio con enlace')
  const sha = g('rev-parse', 'HEAD')
  const p = await previaVolver(dir, sha)
  assert.deepEqual(p.rechazados.map(r => r.ruta), ['.claude/memory/enlace.md'])
  g('checkout', '-q', '--detach')
  await assert.rejects(hacerVolver(dir, sha, ['.claude/memory/a.md']), /no está en un trabajo con nombre/)
})
