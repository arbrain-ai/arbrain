import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cwd } from 'node:process'
import { buscarFugas, envDelRepo, esEdicionCliente, limpiarSecretos, memoriaVacia, resumen, secretosDe } from './paquete-seguro.mjs'

const root = cwd()
const standaloneSource = join(root, '.next', 'standalone')
const staticSource = join(root, '.next', 'static')
const publicSource = join(root, 'public')
const resourceRoot = join(root, 'src-tauri', 'resources', 'next')
const standaloneTarget = join(resourceRoot, 'standalone')

if (!existsSync(standaloneSource)) {
  throw new Error('Missing .next/standalone. next.config.ts must keep output: "standalone".')
}

rmSync(standaloneTarget, { recursive: true, force: true })
mkdirSync(standaloneTarget, { recursive: true })

cpSync(standaloneSource, standaloneTarget, { recursive: true })

for (const relativePath of ['src-tauri', '.git', '.next/cache', 'coverage']) {
  rmSync(join(standaloneTarget, relativePath), { recursive: true, force: true })
}

if (existsSync(staticSource)) {
  cpSync(staticSource, join(standaloneTarget, '.next', 'static'), { recursive: true })
}

if (existsSync(publicSource)) {
  cpSync(publicSource, join(standaloneTarget, 'public'), { recursive: true })
}

// Seguridad (AUDITORIA I1, 10 oct 2026): `.next/standalone` trae los .env del repo. En la edición para clientes se
// quitan y cualquier llave que quede (valor de un .env del repo o formato conocido) hace fallar el build.
// En la instalación de Daniel no se toca nada: su app usa ese .env de respaldo; solo se avisa.
const secretos = secretosDe(envDelRepo(root))
if (esEdicionCliente()) {
  const quitados = limpiarSecretos(standaloneTarget)
  if (quitados.length) console.log(`[desktop] Edición cliente: ${quitados.length} archivo(s) con secretos fuera del paquete:\n${quitados.map(q => `  - ${q}`).join('\n')}`)
  const { fugas } = buscarFugas(standaloneTarget, { secretos })
  if (fugas.length) {
    throw new Error(`[desktop] Edición cliente: el paquete lleva ${fugas.length} secreto(s). Build detenido:\n${resumen(fugas)}`)
  }
  console.log('[desktop] Edición cliente: paquete revisado, sin .env ni llaves.')
} else {
  const { fugas } = buscarFugas(standaloneTarget, { secretos })
  if (fugas.length) console.warn(`[desktop] Aviso: este paquete lleva ${fugas.length} secreto(s) de la instalación original (no se reparte). Para clientes: ARBRAIN_EDICION=cliente.`)
}

console.log(`[desktop] Prepared Tauri Next resources at ${standaloneTarget}`)

/**
 * Plantilla del workspace del alumno (`resources/plantilla-cerebro` → `ARBRAIN_PLANTILLA_DIR` del daemon, que la
 * siembra en `ARBRAIN_HOME` la primera vez). El workspace es su cerebro COMPLETO, nunca código de producto:
 *
 *   CLAUDE.md, AGENTS.md (copia real, no enlace: Windows), .claude/** (memoria vacía, skills, hooks, settings,
 *   referencias, plan), arbrain/cerebro/** (la plantilla estándar; misma ruta que citan CLAUDE.md y las skills),
 *   .gitignore y README.md.
 *
 * Origen, en orden:
 *   1. `ARBRAIN_PLANTILLA_DIR` (un workspace ya armado; se copia tal cual).
 *   2. La raíz de la copia del alumno (la reconoce por `MANIFIESTO.json`, que escribe el generador).
 *   3. Fuera de la copia (worktree de Daniel): solo `cerebro-artificial/estandar`, con aviso. Su `.claude` NUNCA viaja.
 * Los enlaces simbólicos se resuelven a copias reales y la memoria debe venir vacía (solo índices y README).
 */
const WORKSPACE = ['CLAUDE.md', '.claude', join('arbrain', 'cerebro'), '.gitignore']
/** En `.claude` del alumno no viaja nada local de una sesión, aunque el generador lo dejara pasar. */
const FUERA_DE_CLAUDE = new Set(['settings.local.json', 'worktrees', 'projects', 'todos', 'shell-snapshots', 'statsig'])
const README_WORKSPACE = `# Tu cerebro artificial

Esta carpeta es el cerebro de tu Levy. Es tuya: texto plano en tu computadora.

| Qué | Dónde |
|---|---|
| Quién es Levy y cómo trabaja | \`CLAUDE.md\` (\`AGENTS.md\` es la misma copia, para Codex) |
| Tu memoria (empieza vacía) | \`.claude/memory/\` |
| Habilidades, ganchos y ajustes | \`.claude/skills/\`, \`.claude/hooks/\`, \`.claude/settings.json\` |
| Tus objetivos | \`.claude/plan/objetivos.md\` |
| La plantilla estándar del cerebro artificial | \`arbrain/cerebro/\` (empieza por su README) |

Puedes versionarla con git si quieres: \`.gitignore\` deja fuera llaves, bases de datos y registros.
`

function prepararPlantilla() {
  const destino = join(root, 'src-tauri', 'resources', 'plantilla-cerebro')
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  const raizCopia = resolve(root, '..')
  let origen
  if (process.env.ARBRAIN_PLANTILLA_DIR && existsSync(process.env.ARBRAIN_PLANTILLA_DIR)) {
    origen = process.env.ARBRAIN_PLANTILLA_DIR
    cpSync(origen, destino, { recursive: true, dereference: true })
  } else if (existsSync(join(raizCopia, 'MANIFIESTO.json'))) {
    origen = raizCopia
    for (const rel of WORKSPACE) {
      const de = join(raizCopia, rel)
      if (!existsSync(de)) throw new Error(`[desktop] La copia del alumno no trae ${rel}: el workspace saldría incompleto.`)
      cpSync(de, join(destino, rel), {
        recursive: true,
        dereference: true,
        filter: f => !(rel === '.claude' && FUERA_DE_CLAUDE.has(f.slice(de.length + 1).split(/[/\\]/)[0])),
      })
    }
    // Desde la v0.2 (distribución por GitHub, 21 oct 2026) la capa del alumno (memoria vacía, plan, now.md…) no está
    // en su lugar en la copia: viaja como semilla en arbrain/cerebro/semilla/. El workspace de la app la lleva puesta.
    const semilla = join(raizCopia, 'arbrain', 'cerebro', 'semilla')
    if (existsSync(semilla)) cpSync(semilla, destino, { recursive: true, dereference: true, force: false, errorOnExist: false })
    // AGENTS.md es un enlace en la copia; en la plantilla va como archivo (los enlaces no sobreviven a Windows).
    cpSync(join(raizCopia, 'CLAUDE.md'), join(destino, 'AGENTS.md'))
    writeFileSync(join(destino, 'README.md'), README_WORKSPACE)
    memoriaVacia(join(destino, '.claude', 'memory'))
  } else {
    origen = resolve(root, '..', 'cerebro-artificial', 'estandar')
    if (!existsSync(origen)) {
      writeFileSync(join(destino, 'LEEME.md'), '# Plantilla vacía\n\nEste build no encontró la plantilla del cerebro del alumno.\n')
      console.warn('[desktop] Edición cliente: sin plantilla del cerebro; viaja una carpeta vacía.')
      return
    }
    cpSync(origen, join(destino, 'arbrain', 'cerebro'), { recursive: true, dereference: true })
    console.warn(`[desktop] Aviso: fuera de la copia del alumno solo viaja ${origen} (sin CLAUDE.md ni .claude). Para el alumno, generar la copia.`)
  }
  limpiarSecretos(destino)
  const { fugas } = buscarFugas(destino, { secretos })
  if (fugas.length) throw new Error(`[desktop] La plantilla del cerebro lleva ${fugas.length} secreto(s):\n${resumen(fugas)}`)
  console.log(`[desktop] Edición cliente: plantilla del cerebro desde ${origen}`)
}

// Edición cliente (empaquetado alumno, 11 oct 2026): además de la web viajan el Node embebido, el daemon y la
// plantilla del workspace del alumno. La app de Daniel no los lleva (su daemon es el de launchd).
// `ARBRAIN_SIN_DAEMON=1`: solo la web (pruebas del propio script).
if (esEdicionCliente() && process.env.ARBRAIN_SIN_DAEMON !== '1') {
  const { asegurarNode, tripleDeEstaMaquina } = await import('./fetch-node.mjs')
  const { empaquetarDaemon } = await import('./empaquetar-daemon.mjs')
  // Tauri expone el triple del build a beforeBuildCommand; ARBRAIN_TARGET_TRIPLE lo fuerza a mano.
  const triple = process.env.ARBRAIN_TARGET_TRIPLE || process.env.TAURI_ENV_TARGET_TRIPLE || tripleDeEstaMaquina()
  await asegurarNode(triple)
  empaquetarDaemon({ triple })
  // 0.1.2: computer use en cliente. macOS lleva ArbrainManos.app (Swift); los demás, solo un LEEME en resources/manos.
  const { empaquetarManosMac } = await import('./empaquetar-manos-mac.mjs')
  empaquetarManosMac({ triple })
  prepararPlantilla()
}
