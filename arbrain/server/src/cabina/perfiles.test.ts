// Perfiles por subagente y lista negra que le gana al bypass (29 oct 2026, idea 1 del reporte de Warp).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decidirPerfil, pushForzado, rutasEscritas, type Perfil } from './perfiles.js'
import { responderGuardia } from './guardia-perfil.js'
import { claude } from './harness/claude.js'
import { codex } from './harness/codex.js'
import { gemini } from './harness/gemini.js'
import { comandoGuardia, conPastor, perfilPara } from './sin-pantalla.js'

const RAIZ = '/Users/usuario/Developer/wt-algo'
const ctx = { raiz: RAIZ, home: '/Users/usuario', temporales: ['/tmp'] }
const bash = (perfil: Perfil, command: string) => decidirPerfil(perfil, 'Bash', { command }, ctx)

describe('lista negra (todos los perfiles, también total = bypass)', () => {
  it('git push forzado en todas sus formas', () => {
    for (const c of ['git push --force', 'git push -f origin main', 'git push --force-with-lease', 'git push origin +main', 'git push -fu origin x',
      'git -C ../otro push --force', 'cd /tmp && git push --mirror', 'git push origin :rama-vieja', 'bash -c "git push -f"', 'sudo git push --force',
      'git push --force-with-lease=main:abc origin main', 'echo $(git push --force)']) {
      expect(bash('total', c), c).toMatch(/lista negra: git push forzado/)
    }
    expect(pushForzado(['origin', 'main'])).toBeNull()
  })
  it('un push normal sí pasa en total y en código (así se despliega por git)', () => {
    expect(bash('total', 'git push origin main')).toBeNull()
    expect(bash('codigo', 'git push -u origin mi-rama')).toBeNull()
    expect(bash('total', 'git push production main')).toMatch(/desplegar a producción/)
  })
  it('rm -r fuera de su carpeta, o la carpeta entera; dentro y en /tmp, pasa', () => {
    expect(bash('total', 'rm -rf /Users/usuario/Developer/artificial-brain')).toMatch(/rm -r fuera de su carpeta/)
    expect(bash('total', 'rm -rf ~/')).toMatch(/fuera de su carpeta/)
    expect(bash('total', 'rm -rf ../hermano')).toMatch(/fuera de su carpeta/)
    expect(bash('total', 'rm -rf .')).toMatch(/la carpeta entera/)
    expect(bash('total', 'cd / && rm -rf usr')).toMatch(/fuera de su carpeta/)
    expect(bash('total', 'rm -rf "$HOME/x"')).toMatch(/no puedo verificar/)
    expect(bash('total', 'rm -rf ~/foo/*')).toMatch(/fuera de su carpeta/)
    expect(bash('total', 'find /Users/usuario -name x -delete')).toMatch(/find que borra/)
    expect(bash('total', 'rm -rf dist node_modules/.cache')).toBeNull()
    expect(bash('total', `rm -rf ${RAIZ}/build`)).toBeNull()
    expect(bash('total', 'rm -rf /tmp/mi-prueba')).toBeNull()
    expect(bash('total', 'rm -rf "$TMPDIR/x" && echo $PWD')).toBeNull()
    expect(bash('total', 'rm archivo.txt')).toBeNull()
  })
  it('deploy o publicación a producción', () => {
    for (const c of ['vercel --prod', 'npx vercel deploy --prod', 'netlify deploy --prod', 'firebase deploy', 'fly deploy', 'wrangler deploy', 'wrangler pages deploy dist',
      'supabase db push', 'npm publish', 'pnpm dlx vercel --prod', 'docker push repo/img:1', 'railway up']) {
      expect(bash('total', c), c).toMatch(/deploy o publicación a producción/)
    }
    for (const c of ['vercel', 'vercel deploy', 'wrangler pages deploy dist --branch preview', 'npm publish --dry-run', 'supabase db push --dry-run', 'npm run build']) expect(bash('total', c), c).toBeNull()
  })
  it('enviar, pagar o publicar por MCP; leer y borradores pasan; las de Arbrain traen su propio freno', () => {
    expect(decidirPerfil('total', 'mcp__gmail__send_email', {}, ctx)).toMatch(/enviar por MCP/)
    expect(decidirPerfil('total', 'mcp__slack__post_message', {}, ctx)).toMatch(/publicar por MCP/)
    expect(decidirPerfil('total', 'mcp__stripe__create_payment_link', {}, ctx)).toMatch(/pagar/)
    expect(decidirPerfil('total', 'mcp__polar__execute', {}, ctx)).toMatch(/pagar o mover dinero/)
    expect(decidirPerfil('total', 'mcp__claude_ai_Gmail__create_draft', {}, ctx)).toBeNull()
    expect(decidirPerfil('total', 'mcp__claude_ai_Gmail__search_threads', {}, ctx)).toBeNull()
    expect(decidirPerfil('total', 'mcp__manos__encargar', {}, ctx)).toBeNull()
  })
  it('total no agrega nada más: escribir donde sea y comandos normales pasan sin preguntar', () => {
    expect(decidirPerfil('total', 'Write', { file_path: '/Users/usuario/Developer/otro/a.md' }, ctx)).toBeNull()
    expect(bash('total', 'npm install && npm test')).toBeNull()
    expect(bash('total', 'curl -X POST https://api.example.com -d @x.json')).toBeNull()
  })
})

describe('perfil código', () => {
  it('las herramientas de archivos escriben solo en su carpeta o /tmp', () => {
    expect(decidirPerfil('codigo', 'Edit', { file_path: `${RAIZ}/src/a.ts` }, ctx)).toBeNull()
    expect(decidirPerfil('codigo', 'Write', { file_path: 'src/nuevo.ts' }, ctx)).toBeNull()
    expect(decidirPerfil('codigo', 'Write', { file_path: '/tmp/notas.md' }, ctx)).toBeNull()
    expect(decidirPerfil('codigo', 'Edit', { file_path: '/Users/usuario/Developer/artificial-brain/CLAUDE.md' }, ctx)).toMatch(/perfil código/)
    expect(decidirPerfil('codigo', 'Write', { file_path: '../fuera.ts' }, ctx)).toMatch(/perfil código/)
  })
  it('lee el parche de codex', () => {
    const parche = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** Add File: /Users/usuario/.zshrc\n+echo\n*** End Patch'
    expect(rutasEscritas({ command: parche })).toEqual(['src/a.ts', '/Users/usuario/.zshrc'])
    expect(decidirPerfil('codigo', 'apply_patch', { command: parche }, ctx)).toMatch(/\.zshrc/)
  })
})

describe('perfil lectura', () => {
  it('no hace push ni commit, ni con trucos', () => {
    for (const c of ['git push', 'git push origin main', 'git commit -am x', 'git -c alias.x=push x', 'git reset --hard', 'git checkout -b x', 'git fetch']) expect(bash('lectura', c), c).not.toBeNull()
    expect(bash('lectura', 'git push origin main')).toMatch(/no hace git push/)
  })
  it('lee y busca sin preguntar', () => {
    for (const c of ['rg -n "perfil" src', 'git log --oneline -5', 'git diff HEAD~1', 'ls -la && wc -l README.md', 'cat a.md | head -20', 'gh pr view 12', 'gh api repos/o/r',
      'curl -s https://docs.example.com', 'find . -name "*.ts" | xargs wc -l', 'git branch -a', 'sed -n 1,40p x.ts', 'mkdir -p /tmp/inv && rg x > /tmp/inv/hallazgos.txt']) expect(bash('lectura', c), c).toBeNull()
  })
  it('no escribe fuera de /tmp ni corre lo que no es de lectura', () => {
    expect(bash('lectura', 'echo x > notas.md')).toMatch(/fuera de \/tmp/)
    expect(bash('lectura', 'sed -i "" s/a/b/ x.ts')).toMatch(/sed -i/)
    expect(bash('lectura', 'npm install')).toMatch(/no es un programa de solo lectura/)
    expect(bash('lectura', 'python3 -c "print(1)"')).toMatch(/no es un programa/)
    expect(bash('lectura', 'gh api -X POST repos/o/r/issues -f title=x')).toMatch(/gh api/)
    expect(bash('lectura', 'curl -d x https://a.b')).toMatch(/curl/)
    expect(bash('lectura', 'echo $(whoami)')).toMatch(/no entiendo/)
    expect(decidirPerfil('lectura', 'Write', { file_path: `${RAIZ}/a.md` }, ctx)).toMatch(/fuera de \/tmp/)
    expect(decidirPerfil('lectura', 'Write', { file_path: '/tmp/reporte.md' }, ctx)).toBeNull()
    expect(decidirPerfil('lectura', 'mcp__claude_ai_Gmail__create_draft', {}, ctx)).toMatch(/no es de lectura/)
    expect(decidirPerfil('lectura', 'mcp__claude_ai_Gmail__search_threads', {}, ctx)).toBeNull()
    expect(decidirPerfil('lectura', 'Read', { file_path: '/etc/hosts' }, ctx)).toBeNull()
  })
})

describe('la guardia como gancho (mismo JSON en claude y codex)', () => {
  it('niega con el motivo, sin preguntar, y lo anota en la bitácora', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guardia-'))
    const bit = join(dir, 'b.jsonl')
    const r = responderGuardia('lectura', dir, JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: dir }), bit)
    expect(r.codigo).toBe(0)
    const s = JSON.parse(r.salida)
    expect(s.hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' })
    expect(s.hookSpecificOutput.permissionDecisionReason).toMatch(/no hace git push/)
    expect(JSON.parse(readFileSync(bit, 'utf8').trim())).toMatchObject({ arbrain: 'bloqueo', herramienta: 'Bash' })
    // permitir = no decir nada (no hay «ask»: el default sigue sin preguntas)
    expect(responderGuardia('total', dir, JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test' } }))).toEqual({ codigo: 0, salida: '', motivo: null })
    expect(responderGuardia('total', dir, 'no es json').codigo).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('adaptadores: la guardia viaja en el argv', () => {
  const guardia = "'/usr/bin/node' '/x/guardia-perfil.js' lectura '/tmp/w' '/tmp/b.jsonl'"
  it('claude: --settings con el gancho PreToolUse, también en vivo; sigue en bypassPermissions', () => {
    const argv = claude.lanzar({ encargo: 'hola', modelo: null, cwd: '/tmp/w', permisos: 'bypass', perfil: 'lectura', guardia })
    expect(argv).toContain('bypassPermissions')
    const settings = JSON.parse(argv[argv.indexOf('--settings') + 1])
    expect(settings.hooks.PreToolUse[0]).toMatchObject({ matcher: '*', hooks: [{ type: 'command', command: guardia }] })
    expect(claude.vivo!.argv({ reanudar: false, modelo: null, permisos: 'bypass', cwd: '/tmp/w', guardia })).toContain('--settings')
    expect(claude.lanzar({ encargo: 'hola', modelo: null, cwd: '/tmp/w', permisos: 'bypass' })).not.toContain('--settings')
  })
  it('codex: confía el gancho para esta invocación; lectura además sin bypass (sandbox sin red)', () => {
    const total = codex.lanzar({ encargo: 'x', modelo: null, cwd: '/tmp/w', permisos: 'bypass', perfil: 'total', guardia }).join(' ')
    expect(total).toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(total).toContain('--dangerously-bypass-hook-trust')
    expect(total).toMatch(/hooks\.PreToolUse=\[\{matcher="\*",hooks=\[\{type="command",command=".*guardia-perfil\.js.*",timeout=30\}\]\}\]/)
    const lectura = codex.lanzar({ encargo: 'x', modelo: null, cwd: '/tmp/w', permisos: 'bypass', perfil: 'lectura', guardia })
    expect(lectura).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(lectura.join(' ')).toContain('-s workspace-write')
    expect(codex.reanudar({ sesion: 's', texto: 'y', modelo: null, cwd: '/tmp/w', permisos: 'bypass', guardia }).join(' ')).toContain('--dangerously-bypass-hook-trust')
  })
  it('codex con guardia no usa el app-server (no la respeta); claude sí sigue en vivo', () => {
    expect(conPastor(codex)).toBe(false)
    expect(conPastor(claude)).toBe(true)
  })
  it('perfilPara: default total; código solo con un CLI que tenga guardia', () => {
    expect(perfilPara(claude, undefined)).toBe('total')
    expect(perfilPara(codex, 'codigo')).toBe('codigo')
    expect(perfilPara(gemini, 'lectura')).toBe('lectura')
    expect(gemini.lanzar({ encargo: 'x', modelo: null, cwd: '/tmp', permisos: 'bypass', perfil: 'lectura' })).toEqual(expect.arrayContaining(['--approval-mode', 'plan']))
    expect(() => perfilPara(gemini, 'codigo')).toThrow(/claude o codex/)
    expect(() => perfilPara(claude, 'admin')).toThrow(/Perfil desconocido/)
  })
  it('comandoGuardia: node + la guardia + perfil, carpeta y bitácora citados', () => {
    const c = comandoGuardia('lectura', '/tmp/mi carpeta', '/tmp/b.jsonl', 'file:///x/dist/cabina/sin-pantalla.js')
    expect(c).toContain("/x/dist/cabina/guardia-perfil.js lectura '/tmp/mi carpeta' /tmp/b.jsonl")
    expect(c.startsWith(process.execPath.includes(' ') ? "'" : process.execPath)).toBe(true)
  })
})

// La prueba que pidió Daniel: un subagente «lectura» no puede hacer push. Un repo real con su remoto: la guardia corre como
// proceso (igual que la corre el CLI), niega el push, y el remoto no cambia. En `total`, el mismo push normal sí pasa.
describe('un subagente «lectura» no puede hacer push (repo real)', () => {
  let base: string, remoto: string, repo: string
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim()
  const GUARDIA = fileURLToPath(new URL('./guardia-perfil.ts', import.meta.url))
  const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))
  /** Lo que haría el CLI: pasarle la herramienta por stdin a la guardia y, si no la niega, ejecutarla. */
  const intentar = (perfil: Perfil, command: string) => {
    const g = spawnSync(TSX, [GUARDIA, perfil, repo], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: repo }), encoding: 'utf8' })
    const negado = g.stdout.trim() ? JSON.parse(g.stdout).hookSpecificOutput?.permissionDecision === 'deny' : false
    if (!negado) execFileSync('/bin/sh', ['-c', command], { cwd: repo, stdio: 'ignore' })
    return { negado, motivo: g.stdout.trim() ? JSON.parse(g.stdout).hookSpecificOutput.permissionDecisionReason as string : null }
  }
  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'perfil-push-')))
    remoto = join(base, 'remoto.git'); repo = join(base, 'repo')
    execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remoto])
    mkdirSync(repo); git(repo, 'init', '-q', '-b', 'main'); git(repo, 'remote', 'add', 'origin', remoto)
    writeFileSync(join(repo, 'a.md'), 'uno\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'uno'); git(repo, 'push', '-q', 'origin', 'main')
    writeFileSync(join(repo, 'a.md'), 'dos\n'); git(repo, 'commit', '-qam', 'dos')
  })
  afterAll(() => { if (base && existsSync(base)) rmSync(base, { recursive: true, force: true }) })

  it('lectura: el push se niega y el remoto sigue en «uno»', () => {
    const antes = git(remoto, 'rev-parse', 'main')
    const r = intentar('lectura', 'git push origin main')
    expect(r.negado).toBe(true)
    expect(r.motivo).toMatch(/perfil lectura: no hace git push/)
    expect(git(remoto, 'rev-parse', 'main')).toBe(antes)
    expect(git(remoto, 'log', '-1', '--format=%s', 'main')).toBe('uno')
  })
  it('lectura: tampoco con el push escondido en bash -c ni forzado', () => {
    const antes = git(remoto, 'rev-parse', 'main')
    expect(intentar('lectura', 'bash -c "git push origin main"').negado).toBe(true)
    expect(intentar('lectura', 'git push --force origin main').negado).toBe(true)
    expect(git(remoto, 'rev-parse', 'main')).toBe(antes)
  })
  it('total (el default, bypass): el push forzado se niega; el normal pasa', () => {
    expect(intentar('total', 'git push --force origin main').negado).toBe(true)
    expect(intentar('total', 'git push -q origin main').negado).toBe(false)
    expect(git(remoto, 'log', '-1', '--format=%s', 'main')).toBe('dos')
  })
})
