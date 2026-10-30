import { describe, expect, it } from 'vitest'
import { clasificar, nombreWorktree, parsearLaunchctl, parsearLsof, parsearPs, sesionDeScratchpad, worktreeDe, type Contexto, type ProcCrudo } from './procesos.js'
import { explicar, ficha } from './servicios-legibles.js'

const HOME = '/Users/alumno'
const AHORA = Date.parse('2026-10-05T18:00:00-06:00')
const hace = (h: number) => AHORA - h * 3600_000
const SESION = '0c0c0c0c-3d3d-4e4e-8f5f-6a6a6a6a6a6a'

function ctx(procs: ProcCrudo[], escuchas: Contexto['escuchas'], extra: Partial<Contexto> = {}): Contexto {
  return {
    escuchas, procesos: new Map(procs.map(p => [p.pid, p])), launchd: new Map(), subagentes: [], terminales: [],
    publicados: new Set(), sesiones: new Map(), yo: 100, ahora: AHORA, home: HOME, ...extra,
  }
}
const uno = (c: Contexto) => clasificar(c)[0]

describe('procesos · de quién es cada puerto', () => {
  it('el corredor del chat que sobrevivió a un reinicio (ppid 1) es del servicio, nunca huérfano', () => {
    const c = ctx([{ pid: 16162, ppid: 1, inicio: hace(1), comando: '/opt/homebrew/bin/node /Users/alumno/Developer/artificial-brain/arbrain/server/dist/chat-runtime/corredor.js' }],
      [{ pid: 16162, proceso: 'node', puertos: [56972] }])
    expect(uno(c).clase).toBe('oculto')
  })
  it('lo del sistema operativo no se muestra (ControlCenter :5000/:7000, limactl :53)', () => {
    const c = ctx([
      { pid: 1080, ppid: 1, inicio: hace(90), comando: '/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter' },
      { pid: 19367, ppid: 1, inicio: hace(80), comando: '/opt/homebrew/bin/limactl hostagent --pidfile x' },
    ], [{ pid: 1080, proceso: 'ControlCe', puertos: [5000, 7000] }, { pid: 19367, proceso: 'limactl', puertos: [53] }], { launchd: new Map([[1080, 'com.apple.controlcenter']]) })
    expect(clasificar(c).every(p => p.clase === 'oculto')).toBe(true)
  })

  it('la Casa: los puentes de entorno-fisico con nombre humano, aunque los abra una app', () => {
    const c = ctx([{ pid: 20823, ppid: 1, inicio: hace(80), comando: `/opt/homebrew/Python ${HOME}/Developer/business-os/entorno-fisico/cb60b_server.py` },
      { pid: 18994, ppid: 1, inicio: hace(80), comando: `/opt/homebrew/Python -u ${HOME}/Developer/artificial-brain/entorno-fisico/pixoo_server.py` }],
    [{ pid: 20823, proceso: 'Python', puertos: [8085] }, { pid: 18994, proceso: 'Python', puertos: [8086] }],
    { launchd: new Map([[20823, 'application.com.arbrain.neewerbridge.1.2'], [18994, 'com.arbrain.pixoo']]) })
    const [luz, pixoo] = clasificar(c)
    expect(luz).toMatchObject({ clase: 'casa', area: 'Casa', nombre: 'Luz Neewer CB60B', puertos: [8085] })
    expect(pixoo).toMatchObject({ clase: 'casa', nombre: 'Pantalla Pixoo' })
  })

  it('un servicio conocido lleva nombre y área; su puerto alto se conserva y su hijo efímero se oculta', () => {
    const c = ctx([
      { pid: 68395, ppid: 1, inicio: hace(1), comando: '/opt/homebrew/opt/node@22/bin/node /x/arbrain/server/dist/index.js' },
      { pid: 74702, ppid: 68395, inicio: hace(1), comando: 'node /x/arbrain/server/dist/chat-runtime/corredor.js' },
      { pid: 89719, ppid: 1, inicio: hace(90), comando: '/opt/homebrew/bin/node server.js', cwd: `${HOME}/Servers/mission-control/sql-gateway` },
    ], [{ pid: 68395, proceso: 'node', puertos: [3099] }, { pid: 74702, proceso: 'node', puertos: [59058] }, { pid: 89719, proceso: 'node', puertos: [54390] }],
    { launchd: new Map([[68395, 'com.claudeclaw.app'], [89719, 'com.levy.mc-sql-gateway']]), yo: 68395 })
    const l = clasificar(c)
    expect(l.find(p => p.pid === 68395)).toMatchObject({ clase: 'sistema', area: 'Levy', nombre: 'Servidor de Levy' })
    expect(l.find(p => p.pid === 89719)).toMatchObject({ clase: 'sistema', area: 'Datos', puertos: [54390], web: false })
    expect(l.find(p => p.pid === 74702)?.clase).toBe('oculto')
  })

  it('el puente de manos no es huérfano aunque su padre sea launchd: está en el catálogo', () => {
    const c = ctx([{ pid: 33396, ppid: 33379, inicio: hace(70), comando: 'node --require tsx/preflight.cjs src/manos/web/puente.ts' }, { pid: 33379, ppid: 1, inicio: hace(70), comando: 'npm exec tsx src/manos/web/puente.ts' }],
      [{ pid: 33396, proceso: 'node', puertos: [47917] }])
    expect(uno(c)).toMatchObject({ clase: 'sistema', area: 'Manos' })
  })

  it('lo que levantó una sesión viva va bajo esa conversación, con su título', () => {
    const c = ctx([
      { pid: 500, ppid: 400, inicio: hace(0.2), comando: 'node node_modules/.bin/next dev -p 3405', cwd: `${HOME}/Developer/wt-hoy-bonito/arbrain` },
      { pid: 400, ppid: 300, inicio: hace(0.5), comando: `claude --model claude-opus-5-5 --session-id ${SESION}`, cwd: `${HOME}/Developer/wt-hoy-bonito` },
      { pid: 300, ppid: 1, inicio: hace(1), comando: 'arbrain-motor' },
    ], [{ pid: 500, proceso: 'node', puertos: [3405] }], { launchd: new Map([[300, 'com.arbrain.motor']]), sesiones: new Map([[SESION, { titulo: 'Hoy bonito', mtime: hace(0.01) }]]) })
    expect(uno(c)).toMatchObject({ clase: 'conversacion', nombre: 'Servidor de prueba de Arbrain', dueno: { tipo: 'sesion', nombre: 'Hoy bonito', sesion: SESION, vivo: true } })
  })

  it('subagente de Levy en una terminal del motor: el dueño es el agente con su conversación', () => {
    const c = ctx([
      { pid: 510, ppid: 410, inicio: hace(0.1), comando: 'python3 -m http.server 8123', cwd: `${HOME}/Developer/wt-x` },
      { pid: 410, ppid: 310, inicio: hace(0.2), comando: 'claude --dangerously-skip-permissions' },
      { pid: 310, ppid: 1, inicio: hace(0.2), comando: '/bin/zsh -l' },
    ], [{ pid: 510, proceso: 'Python', puertos: [8123] }], { terminales: [{ id: 7, pid: 310, titulo: 'zsh', cwd: '~/Developer/wt-x', subagente: { nombre: 'Lienzo rápido', origen: 'conv-1' } }] })
    expect(uno(c)).toMatchObject({ clase: 'conversacion', dueno: { tipo: 'agente', nombre: 'Lienzo rápido', conversacion: 'conv-1', vivo: true } })
  })

  it('scratchpad de una sesión que ya no se mueve: huérfano con su razón y su hora', () => {
    const cwd = `/private/tmp/claude-501/-Users-d-Developer-artificial-brain/${SESION}/scratchpad`
    const c = ctx([{ pid: 77832, ppid: 1, inicio: hace(5), comando: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --remote-debugging-port=0', cwd }],
      [{ pid: 77832, proceso: 'Google', puertos: [60259] }], { sesiones: new Map([[SESION, { titulo: 'Invitación a Meet', mtime: hace(4.6) }]]) })
    const p = uno(c)
    expect(p).toMatchObject({ clase: 'huerfano', nombre: 'Chrome invisible', puertos: [60259], dueno: { tipo: 'sesion', nombre: 'Invitación a Meet', vivo: false } })
    expect(p.razon).toMatch(/La sesión «Invitación a Meet» no se mueve desde hace 5 h/)
    expect(p.firma).toBe(`77832:${hace(5)}`)
  })

  it('worktree de un agente cerrado: huérfano; su propio SDK hijo no lo revive', () => {
    const raiz = `${HOME}/Developer/artificial-brain/.claude/worktrees/agent-aef7e4503e8d1fb59`
    const c = ctx([
      { pid: 76609, ppid: 1, inicio: hace(58), comando: '/opt/homebrew/opt/node@22/bin/node dist/index.js', cwd: `${raiz}/arbrain/server` },
      { pid: 76612, ppid: 76609, inicio: hace(58), comando: `${raiz}/arbrain/server/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, cwd: `${raiz}/arbrain/server` },
    ], [{ pid: 76609, proceso: 'node', puertos: [3199] }], { subagentes: [{ id: 3, nombre: 'Chat vivo', cwd: raiz, cerrado: new Date(hace(50)).toISOString() }] })
    const p = uno(c)
    expect(p).toMatchObject({ clase: 'huerfano', nombre: 'Copia de prueba del servidor de Levy', dueno: { tipo: 'agente', nombre: 'Chat vivo', vivo: false } })
    expect(p.razon).toMatch(/Su agente «Chat vivo» ya cerró hace 2 días/)
  })

  it('worktree con un agente trabajando: es de esa conversación, no huérfano', () => {
    const raiz = `${HOME}/Developer/wt-calendario`
    const c = ctx([
      { pid: 600, ppid: 1, inicio: hace(1), comando: 'node node_modules/.bin/next dev -p 3410', cwd: `${raiz}/arbrain` },
      { pid: 601, ppid: 1, inicio: hace(1), comando: 'claude --model claude-opus-5-5', cwd: raiz },
    ], [{ pid: 600, proceso: 'node', puertos: [3410] }])
    expect(uno(c)).toMatchObject({ clase: 'conversacion', dueno: { tipo: 'worktree', nombre: 'Calendario', vivo: true } })
  })

  it('sin dueño identificable y con el padre muerto: huérfano «nadie lo administra»', () => {
    const c = ctx([{ pid: 87099, ppid: 87086, inicio: hace(29), comando: 'node tools/serve.mjs', cwd: '/Volumes/K/lab/unified-v6' }, { pid: 87086, ppid: 1, inicio: hace(29), comando: 'npm run dev' }],
      [{ pid: 87099, proceso: 'node', puertos: [4191, 24192] }])
    expect(uno(c)).toMatchObject({ clase: 'huerfano', dueno: { tipo: 'nadie' }, puertos: [4191, 24192] })
    expect(uno(c).razon).toMatch(/Nadie lo administra/)
  })

  it('lo que abre una app tuya (su raíz es de launchd) no se toca ni se muestra', () => {
    const c = ctx([{ pid: 700, ppid: 650, inicio: hace(2), comando: 'node server.js', cwd: `${HOME}/x` }, { pid: 650, ppid: 1, inicio: hace(30), comando: '/Applications/Algo.app/Contents/MacOS/Algo' }],
      [{ pid: 700, proceso: 'node', puertos: [4500] }], { launchd: new Map([[650, 'application.com.algo.1']]) })
    expect(uno(c).clase).toBe('oculto')
  })

  it('marca lo que publica Tailscale', () => {
    const c = ctx([{ pid: 14371, ppid: 1, inicio: hace(1), comando: 'next-server (v16.3.4)', cwd: `${HOME}/Servers/arbrain-web/slots/a` }], [{ pid: 14371, proceso: 'node', puertos: [3300] }],
      { launchd: new Map([[14371, 'com.levy.arbrain-web']]), publicados: new Set([3300]) })
    expect(uno(c)).toMatchObject({ clase: 'sistema', nombre: 'Arbrain web', publicado: true, web: true })
  })
})

describe('procesos · lectura cruda', () => {
  it('lsof -F, ps con lstart en C y launchctl', () => {
    expect(parsearLsof('p68395\ncnode\nn127.0.0.1:3099\np19428\ncssh\nn*:5432\nn*:8000\nn*:5432\n')).toEqual([{ pid: 68395, proceso: 'node', puertos: [3099] }, { pid: 19428, proceso: 'ssh', puertos: [5432, 8000] }])
    const ps = parsearPs('  68395     1 Mon Oct  5 17:31:57 2026     /opt/homebrew/opt/node@22/bin/node /x/dist/index.js\n')
    expect(ps.get(68395)).toMatchObject({ ppid: 1, comando: '/opt/homebrew/opt/node@22/bin/node /x/dist/index.js' })
    expect(ps.get(68395)!.inicio).toBe(Date.parse('Mon Oct  5 17:31:57 2026'))
    expect(parsearLaunchctl('PID\tStatus\tLabel\n68395\t0\tcom.claudeclaw.app\n-\t1\tcom.arbrain.neewerbridge\n')).toEqual(new Map([[68395, 'com.claudeclaw.app']]))
  })
  it('scratchpad, worktrees y sus nombres', () => {
    expect(sesionDeScratchpad(`/private/tmp/claude-501/-Users-d/${SESION}/scratchpad/x`)).toBe(SESION)
    expect(worktreeDe(`${HOME}/Developer/wt-taller-minimalista/arbrain`)).toEqual({ raiz: `${HOME}/Developer/wt-taller-minimalista`, nombre: 'wt-taller-minimalista' })
    expect(nombreWorktree('wt-taller-minimalista')).toBe('Taller minimalista')
    expect(nombreWorktree('agent-aef7e4503e8d1fb59')).toBe('Agente aef7e4')
  })
})

describe('servicios en palabras', () => {
  it('nombre y área por label; sin ficha, el label legible en Arbrain', () => {
    expect(ficha('com.claudeclaw.voz-agentes')).toEqual({ nombre: 'Voz de los agentes', area: 'Voz' })
    expect(ficha('com.claudeclaw.algo-nuevo')).toEqual({ nombre: 'Algo nuevo', area: 'Arbrain' })
  })
  it('neewerbridge (5 oct): el lanzador falla con -1712 porque la app ya corre; no está caído', () => {
    const e = explicar('com.arbrain.neewerbridge', 1, { hermana: 20823, abreApp: true, ultimaLinea: '_LSOpenURLsWithCompletionHandler() failed … with error -1712.' })
    expect(e.menor).toBe(true)
    expect(e.explicacion).toMatch(/No está caído: la app ya está abierta y trabaja \(pid 20823\)/)
    expect(e.explicacion).toMatch(/-1712/)
  })
  it('códigos y pistas del log en español llano', () => {
    expect(explicar('x', 127, {}).explicacion).toMatch(/No encuentra el programa/)
    expect(explicar('x', 1, { ultimaLinea: 'Error: listen EADDRINUSE: address already in use :::3099' }).explicacion).toBe('Terminó con un error. Su puerto ya lo usa otro proceso.')
    expect(explicar('x', -9, {}).explicacion).toBe('Lo cerraron a la fuerza.')
  })
})
