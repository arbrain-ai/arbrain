/**
 * Taller › Computadora (T16, 29 oct 2026). Todo con muestras fijas y comandos simulados: ninguna prueba cierra ni lee un
 * proceso real.
 */
import { describe, expect, it } from 'vitest'
import {
  agrupar, atenderComputadora, bundleDe, cerrarApp, consejos, leerComputadora, leerPmset, leerPowercfg, leerVmStat,
  parsearGetProcess, parsearPsMac, parsearTasklist, pidsProtegidos, semaforoMemoria, type Deps, type Proceso,
} from './computadora.js'
import { rutaSoloApp } from './cofre.js'

const UID = 501
const PS_MAC = [
  '    1     0    0  12000 /sbin/launchd',
  '  150     1    0 900000 /System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer',
  '  400     1  501 300000 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
  ' 1000     1  501 600000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ' 1001  1000  501 700000 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/130/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)',
  ' 1002  1000  501 500000 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/130/Helpers/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU)',
  ' 2000     1  501 800000 /Applications/Arbrain.app/Contents/MacOS/Arbrain',
  ' 2001  2000  501 200000 /Applications/Arbrain.app/Contents/Resources/node',
  ' 2002  2001  501 400000 /Users/usuario/.local/bin/claude',
  ' 2003  2001  501  90000 /Users/usuario/Library/Caches/ms-playwright/chromium/Chromium.app/Contents/MacOS/Chromium',
  ' 3000     1  501 450000 /Applications/zoom.us.app/Contents/MacOS/zoom.us',
  ' 3100     1  502 350000 /Applications/Spotify.app/Contents/MacOS/Spotify',
  ' 3200     1  501  50000 /usr/local/bin/python3',
].join('\n')

const ctxMac = (procesos: Proceso[]) => ({ plataforma: 'mac' as const, uid: UID, protegidos: pidsProtegidos(procesos, 2001, 2000) })

describe('lectura en Mac', () => {
  it('ps: pid, padre, dueño, memoria y ruta con espacios', () => {
    const l = parsearPsMac(PS_MAC)
    expect(l).toHaveLength(13)
    expect(l[3]).toEqual({ pid: 1000, ppid: 1, uid: 501, memoriaKb: 600000, ruta: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  })
  it('vm_stat: libre + inactiva + especulativa + purgable', () => {
    const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                               1000.\nPages active:                             9000.\nPages inactive:                           2000.\nPages speculative:                         500.\nPages purgeable:                           100.\n'
    expect(leerVmStat(vm)).toBe(3600 * 16384)
    expect(leerVmStat('basura')).toBeNull()
  })
  it('pmset: puede dormirse, a cuántos minutos y quién lo impide ahora', () => {
    const g = 'System-wide power settings:\nCurrently in use:\n standby              1\n disksleep            10\n sleep                1 (sleep prevented by sharingd, powerd)\n displaysleep         10\n'
    const a = '   pid 321(caffeinate): [0x0001] 00:10:00 PreventUserIdleSystemSleep named: "caffeinate command-line tool"\n'
    expect(leerPmset(g, a)).toEqual({ puedeDormirse: true, minutos: 1, impidenAhora: ['sharingd', 'powerd', 'caffeinate'] })
    expect(leerPmset('Currently in use:\n sleep                0\n').puedeDormirse).toBe(false)
    expect(leerPmset('System-wide power settings:\n SleepDisabled\t\t1\nCurrently in use:\n sleep                10\n').puedeDormirse).toBe(false)
    expect(leerPmset('nada').puedeDormirse).toBeNull()
  })
  it('bundle: la primera carpeta .app, aunque el ayudante esté anidado', () => {
    expect(bundleDe('/Applications/Google Chrome.app/Contents/Frameworks/X.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/H')).toBe('/Applications/Google Chrome.app')
    expect(bundleDe('/usr/bin/python3')).toBeNull()
  })
})

describe('agrupar por app (Mac)', () => {
  const procesos = parsearPsMac(PS_MAC)
  const grupos = agrupar(procesos, ctxMac(procesos))
  const por = (n: string) => grupos.find(g => g.nombre === n)!

  it('Chrome y sus ayudantes son una sola app con su memoria sumada', () => {
    const c = por('Google Chrome')
    expect(c.procesos).toBe(3)
    expect(c.memoriaMb).toBe(Math.round(1_800_000 / 1024))
    expect(c.cerrable).toBe(true)
    expect(c.bundle).toBe('/Applications/Google Chrome.app')
  })
  it('ordenado de más a menos memoria', () => {
    for (let i = 1; i < grupos.length; i++) expect(grupos[i - 1].memoriaMb).toBeGreaterThanOrEqual(grupos[i].memoriaMb)
  })
  it('Arbrain (app, daemon y todo lo que vive en Arbrain.app) no se cierra', () => {
    const a = por('Arbrain')
    expect(a.cerrable).toBe(false)
    expect(a.pids.sort()).toEqual([2000, 2001])
    expect(a.motivo).toMatch(/Levy/)
  })
  it('claude no se cierra, ni lo que lanzó el daemon (el Chromium de las manos)', () => {
    expect(por('Claude Code').cerrable).toBe(false)
    expect(por('Chromium').cerrable).toBe(false)
  })
  it('del sistema, de otro usuario y procesos de fondo: no se cierran', () => {
    expect(por('WindowServer').cerrable).toBe(false)
    expect(por('Finder').cerrable).toBe(false)
    expect(por('Spotify').motivo).toMatch(/otro usuario/)
    expect(por('python3').cerrable).toBe(false)
    expect(por('zoom.us').cerrable).toBe(true)
  })
  it('protegidos: el daemon, su cadena de padres y sus descendientes', () => {
    const p = pidsProtegidos(procesos, 2001, 2000)
    for (const pid of [2000, 2001, 2002, 2003]) expect(p.has(pid)).toBe(true)
    expect(p.has(1)).toBe(false)
    expect(p.has(1000)).toBe(false)
  })
})

const GET_PROCESS = JSON.stringify([
  { Id: 4, ProcessName: 'System', WorkingSet64: 1000000, Path: null, SessionId: 0, Description: null },
  { Id: 800, ProcessName: 'svchost', WorkingSet64: 30000000, Path: 'C:\\Windows\\System32\\svchost.exe', SessionId: 1, Description: 'Host Process' },
  { Id: 900, ProcessName: 'explorer', WorkingSet64: 200000000, Path: 'C:\\Windows\\explorer.exe', SessionId: 1, Description: 'Windows Explorer' },
  { Id: 1000, ProcessName: 'chrome', WorkingSet64: 500000000, Path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', SessionId: 1, Description: 'Google Chrome' },
  { Id: 1001, ProcessName: 'chrome', WorkingSet64: 400000000, Path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', SessionId: 1, Description: 'Google Chrome' },
  { Id: 2000, ProcessName: 'Arbrain', WorkingSet64: 300000000, Path: 'C:\\Users\\usuario\\AppData\\Local\\Arbrain\\Arbrain.exe', SessionId: 1, Description: 'Arbrain' },
  { Id: 2001, ProcessName: 'node', WorkingSet64: 250000000, Path: 'C:\\Users\\usuario\\AppData\\Local\\Arbrain\\resources\\node.exe', SessionId: 1, Description: 'Node.js' },
  { Id: 2100, ProcessName: 'msedgewebview2', WorkingSet64: 150000000, Path: 'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\msedgewebview2.exe', SessionId: 1, Description: 'WebView2' },
  { Id: 3000, ProcessName: 'Zoom', WorkingSet64: 350000000, Path: 'C:\\Users\\usuario\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe', SessionId: 1, Description: 'Zoom Meetings' },
  { Id: 3100, ProcessName: 'Slack', WorkingSet64: 100000000, Path: 'C:\\Users\\otra\\AppData\\Local\\slack\\slack.exe', SessionId: 2, Description: 'Slack' },
])

describe('Windows', () => {
  it('Get-Process: lista u objeto suelto', () => {
    expect(parsearGetProcess(GET_PROCESS)).toHaveLength(10)
    expect(parsearGetProcess(JSON.stringify({ Id: 5, ProcessName: 'x', WorkingSet64: 2048, Path: null, SessionId: 1 }))).toEqual([{ pid: 5, sesion: 1, memoriaKb: 2, ruta: null, nombre: 'x', descripcion: undefined }])
    expect(parsearGetProcess('no es json')).toEqual([])
  })
  it('tasklist CSV con miles en coma o punto', () => {
    const csv = '"chrome.exe","1000","Console","1","512,000 K"\r\n"chrome.exe","1001","Console","1","100.000 K"\r\n"System Idle Process","0","Services","0","8 K"\r\n'
    const l = parsearTasklist(csv)
    expect(l).toEqual([
      { pid: 1000, sesion: 1, memoriaKb: 512000, ruta: null, nombre: 'chrome' },
      { pid: 1001, sesion: 1, memoriaKb: 100000, ruta: null, nombre: 'chrome' },
    ])
    // Sin ruta no se sabe si es del sistema: nada se cierra con esta lectura.
    expect(agrupar(l, { plataforma: 'windows', sesion: 1, protegidos: new Set() })[0].cerrable).toBe(false)
  })
  it('agrupa por imagen, nombra con la descripción y protege sistema, Arbrain, WebView2 y otra sesión', () => {
    const procesos = parsearGetProcess(GET_PROCESS)
    const grupos = agrupar(procesos, { plataforma: 'windows', sesion: 1, protegidos: pidsProtegidos(procesos, 2001) })
    const por = (n: string) => grupos.find(g => g.nombre === n)!
    expect(por('Google Chrome')).toMatchObject({ procesos: 2, cerrable: true })
    expect(por('Zoom')).toMatchObject({ cerrable: true })
    expect(por('Arbrain')).toMatchObject({ cerrable: false })
    expect(por('Arbrain').pids.sort()).toEqual([2000, 2001])
    expect(por('Host Process').cerrable).toBe(false)
    expect(por('Windows Explorer').cerrable).toBe(false)
    expect(por('WebView2').cerrable).toBe(false)
    expect(por('Slack').cerrable).toBe(false)
    expect(por('System').cerrable).toBe(false)
  })
  it('powercfg: el penúltimo hexadecimal es «conectada», en segundos', () => {
    const salida = 'Power Scheme GUID: 381b4222\n  Subgroup GUID: 238c9fa8\n    Power Setting GUID: 29f6c1db\n      Minimum Possible Setting: 0x00000000\n      Maximum Possible Setting: 0xffffffff\n      Possible Settings increment: 0x00000001\n      Possible Settings units: Seconds\n    Índice de configuración de corriente alterna actual: 0x00000708\n    Índice de configuración de corriente continua actual: 0x00000384\n'
    expect(leerPowercfg(salida)).toEqual({ puedeDormirse: true, minutos: 30, impidenAhora: [] })
    expect(leerPowercfg(salida.replace('0x00000708', '0x00000000')).puedeDormirse).toBe(false)
    expect(leerPowercfg('sin datos').puedeDormirse).toBeNull()
  })
})

describe('semáforo y consejos', () => {
  const GB = 1024 ** 3
  it('semáforo por memoria usada', () => {
    expect(semaforoMemoria(4 * GB, 8 * GB)).toBe('verde')
    expect(semaforoMemoria(1.5 * GB, 8 * GB)).toBe('amarillo')
    expect(semaforoMemoria(0.5 * GB, 8 * GB)).toBe('rojo')
  })
  const chrome = { id: 'c', nombre: 'Google Chrome', memoriaMb: 2000, procesos: 9, pids: [1], cerrable: true }
  it('8 GB apretados: pestañas de Chrome y una sola app pesada', () => {
    const c = consejos({ plataforma: 'mac', memoria: { total: 8 * GB, semaforo: 'rojo' }, discoLibre: 50 * GB, procesador: 20, sueno: { puedeDormirse: false, minutos: null, impidenAhora: [] }, apps: [chrome], tieneRutinas: false })
    expect(c.some(x => /pestañas de Google Chrome/.test(x))).toBe(true)
    expect(c.some(x => /Con 8 GB/.test(x))).toBe(true)
  })
  it('puede dormirse y hay rutinas: cómo evitarlo en Ajustes, por plataforma; sin rutinas, nada', () => {
    const base = { memoria: { total: 16 * GB, semaforo: 'verde' as const }, discoLibre: 50 * GB, procesador: 10, sueno: { puedeDormirse: true, minutos: 10, impidenAhora: [] }, apps: [] }
    expect(consejos({ ...base, plataforma: 'mac', tieneRutinas: true }).join(' ')).toMatch(/Ajustes del Sistema/)
    expect(consejos({ ...base, plataforma: 'windows', tieneRutinas: true }).join(' ')).toMatch(/Nunca/)
    expect(consejos({ ...base, plataforma: 'mac', tieneRutinas: false })).toEqual([])
  })
  it('poco disco y procesador al tope', () => {
    const c = consejos({ plataforma: 'mac', memoria: null, discoLibre: 3 * GB, procesador: 95, sueno: { puedeDormirse: null, minutos: null, impidenAhora: [] }, apps: [], tieneRutinas: true })
    expect(c).toHaveLength(2)
  })
})

/** Un Mac simulado: `ps` devuelve lo que diga `vivos`; registra cada comando y nunca toca nada real. */
function macSimulado(opciones: { cierraAmable?: boolean; cierraForzado?: boolean } = {}) {
  let vivos = parsearPsMac(PS_MAC)
  const comandos: string[][] = []
  const anotadas: string[] = []
  const aPs = () => vivos.map(p => `${p.pid} ${p.ppid} ${p.uid} ${p.memoriaKb} ${p.ruta}`).join('\n')
  const quitar = (pids: number[]) => { vivos = vivos.filter(p => !pids.includes(p.pid)) }
  const deps: Deps = {
    plataforma: 'mac', pid: 2001, ppid: 2000, uid: UID,
    ejecutar: async (cmd, args) => {
      comandos.push([cmd, ...args])
      if (cmd === 'ps') return aPs()
      if (cmd === 'vm_stat') return 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 10000.\nPages inactive: 10000.\n'
      if (cmd === 'pmset') return args.includes('assertions') ? '' : 'Currently in use:\n sleep                10\n'
      if (cmd === 'osascript' && opciones.cierraAmable) quitar(vivos.filter(p => (p.ruta ?? '').startsWith(args.at(-1)!)).map(p => p.pid))
      if (cmd === 'kill' && args[0] === '-9' && opciones.cierraForzado !== false) quitar(args.slice(1).map(Number))
      return ''
    },
    memoriaTotal: () => 8 * 1024 ** 3, memoriaLibre: () => 0, discoLibre: () => 40 * 1024 ** 3,
    procesador: async () => 30, tieneRutinas: () => true, esperar: async () => {},
    anotar: (que, motivo) => anotadas.push(`${que} | ${motivo}`),
  }
  return { deps, comandos, anotadas }
}

describe('cerrar (comandos simulados)', () => {
  const chromeId = '/Applications/Google Chrome.app'
  it('cierre amable con AppleScript, la ruta va como argumento (sin armar código) y queda en la bitácora', async () => {
    const s = macSimulado({ cierraAmable: true })
    const r = await cerrarApp(s.deps, chromeId, { forzar: false })
    expect(r).toMatchObject({ ok: true, cerrada: true })
    const osa = s.comandos.find(c => c[0] === 'osascript')!
    expect(osa.at(-1)).toBe(chromeId)
    expect(osa.slice(1, -1).join(' ')).not.toContain('Chrome')
    expect(s.comandos.some(c => c[0] === 'kill')).toBe(false)
    expect(s.anotadas[0]).toMatch(/^Cerrar «Google Chrome» \(3 procesos/)
    expect(s.anotadas[0]).toMatch(/Taller › Computadora/)
  })
  it('si no cierra en unos segundos, ofrece forzar; forzar usa kill -9 solo con sus pids', async () => {
    const s = macSimulado({ cierraAmable: false })
    const r = await cerrarApp(s.deps, chromeId, { forzar: false })
    expect(r).toMatchObject({ ok: true, cerrada: false, puedeForzar: true })
    const f = await cerrarApp(s.deps, chromeId, { forzar: true })
    expect(f).toMatchObject({ ok: true, cerrada: true })
    const kill = s.comandos.find(c => c[0] === 'kill')!
    expect(kill.slice(2).map(Number).sort()).toEqual([1000, 1001, 1002])
  })
  it('lista negra: Arbrain, claude, el sistema y otro usuario se niegan sin correr ningún comando de cierre', async () => {
    const s = macSimulado()
    for (const id of ['arbrain', 'motor:claude', '/System/Library/CoreServices/Finder.app', '/Applications/Spotify.app', '/sbin/launchd']) {
      const r = await cerrarApp(s.deps, id, { forzar: true })
      expect(r.ok, id).toBe(false)
      if (!r.ok) expect(r.status).toBe(403)
    }
    expect(s.comandos.some(c => c[0] === 'kill' || c[0] === 'osascript')).toBe(false)
    expect(s.anotadas).toEqual([])
  })
  it('una app que ya no existe: nada que hacer', async () => {
    const s = macSimulado()
    expect(await cerrarApp(s.deps, '/Applications/Nada.app', { forzar: false })).toMatchObject({ ok: true, cerrada: true })
    expect(await cerrarApp(s.deps, 42, { forzar: false })).toMatchObject({ ok: false, status: 400 })
  })
  it('Windows: amable es taskkill sin /F; forzar lleva /F', async () => {
    const comandos: string[][] = []
    let vivos = parsearGetProcess(GET_PROCESS)
    const deps: Deps = {
      plataforma: 'windows', pid: 2001, ppid: 2000, ejecutar: async (cmd, args) => {
        comandos.push([cmd, ...args])
        if (cmd === 'powershell.exe') return JSON.stringify(vivos.map(p => ({ Id: p.pid, ProcessName: p.nombre, WorkingSet64: p.memoriaKb * 1024, Path: p.ruta, SessionId: p.sesion, Description: p.descripcion })))
        if (cmd === 'taskkill' && args[0] === '/F') vivos = vivos.filter(p => p.nombre !== 'chrome')
        return ''
      },
      memoriaTotal: () => 8 * 1024 ** 3, memoriaLibre: () => 1024 ** 3, discoLibre: () => null, procesador: async () => null,
      tieneRutinas: () => false, esperar: async () => {},
    }
    expect(await cerrarApp(deps, 'chrome', { forzar: false })).toMatchObject({ cerrada: false, puedeForzar: true })
    expect(comandos.find(c => c[0] === 'taskkill')).toEqual(['taskkill', '/PID', '1000', '/PID', '1001'])
    expect(await cerrarApp(deps, 'chrome', { forzar: true })).toMatchObject({ cerrada: true })
    expect(comandos.filter(c => c[0] === 'taskkill')[1]).toEqual(['taskkill', '/F', '/PID', '1000', '/PID', '1001'])
    expect(await cerrarApp(deps, 'arbrain', { forzar: true })).toMatchObject({ ok: false, status: 403 })
    expect(await cerrarApp(deps, 'explorer', { forzar: true })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('rutas', () => {
  it('la foto: memoria con semáforo, 8 apps como máximo, reposo y consejos', async () => {
    const s = macSimulado()
    const r = await atenderComputadora('GET', '/computadora', {}, { secretoApp: false, deps: s.deps })
    const f = r!.cuerpo as unknown as Awaited<ReturnType<typeof leerComputadora>>
    expect(r!.status).toBe(200)
    expect(f.memoria!.disponible).toBe(20000 * 16384)
    expect(f.memoria!.semaforo).toBe('rojo')
    expect(f.apps.length).toBeLessThanOrEqual(8)
    expect(f.sueno.puedeDormirse).toBe(true)
    expect(f.consejos.some(c => /rutinas no corren/.test(c))).toBe(true)
  })
  it('cerrar y forzar exigen el secreto de la app', async () => {
    const s = macSimulado({ cierraAmable: true })
    expect((await atenderComputadora('POST', '/computadora/cerrar', { id: '/Applications/zoom.us.app' }, { secretoApp: false, deps: s.deps }))!.status).toBe(403)
    expect((await atenderComputadora('POST', '/computadora/forzar', { id: '/Applications/zoom.us.app' }, { secretoApp: false, deps: s.deps }))!.status).toBe(403)
    expect(s.comandos.some(c => c[0] === 'osascript' || c[0] === 'kill')).toBe(false)
    expect((await atenderComputadora('POST', '/computadora/cerrar', { id: '/Applications/zoom.us.app' }, { secretoApp: true, deps: s.deps }))!.status).toBe(200)
    expect(await atenderComputadora('DELETE', '/computadora', {}, { secretoApp: true, deps: s.deps })).toBeNull()
  })
  it('el pase de agente no abre ninguna ruta de Computadora', () => {
    for (const [m, r] of [['GET', '/computadora'], ['POST', '/computadora/cerrar'], ['POST', '/computadora/forzar']] as const) expect(rutaSoloApp(m, r)).toBe(true)
  })
})
