import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decidirAviso, revisarSubagentes, type Observacion, type PuertoAviso } from './aviso-subagentes.js'
import type { Subagente } from './cuerpo.js'
import { ADAPTADORES } from './harness/index.js'
import { leerEstiloClaude } from './harness/claude.js'
import { num } from './harness/tipos.js'
import { PASTOR } from './sin-pantalla.js'

/*
 * Un CLI falso con el dialecto stream-json de claude: dice su sesión, duerme FALSO_SLEEP s y responde con el
 * texto que recibió. Corre como proceso desacoplado de verdad (setsid), con su bitácora en una carpeta temporal.
 */
const dir = mkdtempSync(join(tmpdir(), 'arbrain-sin-pantalla-'))
const bin = join(dir, 'bin')
const cwd = join('/tmp', `arbrain-sp-prueba-${process.pid}`)
const env0 = { ...process.env }

beforeAll(() => {
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'cli-falso-arbrain'), `#!/bin/sh
if [ "$1" = "--resume" ]; then S="$2"; shift 2; else S="s-falsa-1"; fi
echo '{"type":"system","subtype":"init","session_id":"'"$S"'"}'
P=$(printf '%s' "$1" | head -1)
sleep "\${FALSO_SLEEP:-0}"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write"}]}}'
printf '{"type":"result","subtype":"success","session_id":"%s","result":"eco: %s","usage":{"input_tokens":10,"output_tokens":5}}\\n' "$S" "$P"
[ "$P" = "falla" ] && exit 3
exit 0
`)
  chmodSync(join(bin, 'cli-falso-arbrain'), 0o755)
  ADAPTADORES.falso = {
    nombre: 'falso', binario: 'cli-falso-arbrain', modeloDefault: () => null, modeloOk: () => true, sesionPropia: false,
    lanzar: p => [p.encargo], reanudar: p => ['--resume', p.sesion, p.texto],
    leerEvento: l => leerEstiloClaude(l, u => num(u.input_tokens) + num(u.output_tokens)),
    entorno: { FALSO_SLEEP: { fuentes: ['FALSO_SLEEP_PRUEBA'], valor: '0' } },
    interactivo: s => ['--resume', s],
  }
  Object.assign(process.env, {
    PATH: `${bin}:${process.env.PATH}`, ARBRAIN_CONFIG_DIR: join(dir, 'config'), ARBRAIN_MOTOR_SOCK: join(dir, 'no-hay-motor.sock'),
    ARBRAIN_REPO: join(dir, 'sin-repo'), CABINA_MAX_SUBAGENTES: '3', CABINA_TOPE_TOKENS_DIA: '1000000', CABINA_DELEGAR_MODO: 'sin-pantalla',
  })
})
afterAll(() => { delete ADAPTADORES.falso; process.env = env0 })

const esperar = async (cond: () => Promise<boolean>, ms = 8000) => {
  const fin = Date.now() + ms
  while (Date.now() < fin) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)) }
  return false
}

describe('delegar sin pantalla: proceso desacoplado de punta a punta (CLI falso)', () => {
  it('lanza, termina al salir, reanuda con la misma sesión, encola mientras trabaja y cierra', async () => {
    const sp = await import('./sin-pantalla.js')
    const { leerRegistro, cerrar } = await import('./cuerpo.js')
    const sub = await sp.delegarSinPantalla({ nombre: 'prueba', harness: 'falso', encargo: 'hola', cwd })
    expect(sub).toMatchObject({ id: sp.PRIMER_ID, modo: 'sin-pantalla', turno: 1, entrega: 'entregado' })
    expect(await esperar(async () => !(await sp.observarSinPantalla(sub)).trabajando)).toBe(true)
    let obs = await sp.observarSinPantalla(sub)
    expect(obs).toMatchObject({ trabajando: false, ultimaRespuesta: 'eco: hola', error: null, tokens: 15, sesion: 's-falsa-1' })
    expect(obs.motivo).toMatch(/salió con código 0/)

    // segundo turno lento: retomar mientras trabaja ENCOLA
    process.env.FALSO_SLEEP_PRUEBA = '2'
    expect(await sp.retomarSinPantalla(sub.id, 'segunda')).toEqual({ encolado: false, confirmado: true })
    delete process.env.FALSO_SLEEP_PRUEBA
    expect((await sp.observarSinPantalla((await leerRegistro()).find(s => s.id === sub.id)!)).trabajando).toBe(true)
    expect(await sp.retomarSinPantalla(sub.id, 'tercera')).toEqual({ encolado: true, confirmado: true })
    let reg = (await leerRegistro()).find(s => s.id === sub.id)!
    expect(reg.cola).toEqual(['tercera'])
    expect(await esperar(async () => !(await sp.observarSinPantalla((await leerRegistro()).find(s => s.id === sub.id)!)).trabajando)).toBe(true)
    expect(await sp.entregarCola(sub.id)).toBe(true)
    reg = (await leerRegistro()).find(s => s.id === sub.id)!
    expect(reg).toMatchObject({ turno: 3, cola: [], sesion: 's-falsa-1' })
    expect(await esperar(async () => (await sp.observarSinPantalla((await leerRegistro()).find(s => s.id === sub.id)!)).ultimaRespuesta === 'eco: tercera')).toBe(true)
    const bit = readFileSync(sp.rutaBitacora(sub.id), 'utf8')
    expect(bit.match(/"arbrain":"salida","codigo":0/g)).toHaveLength(3)
    expect(bit).toContain('"session_id":"s-falsa-1"')

    // vista trabajos: tarjeta desde la bitácora, sin motor
    const [t] = await sp.terminalesSinPantalla([reg], 4)
    expect(t).toMatchObject({ id: sub.id, origen: 'sin-pantalla', soloLectura: true, estado: 'esperando', conversacion: { turno: 'terminado', tokens: 45 } })
    expect(t.conversacion!.mensajes.at(-1)).toMatchObject({ rol: 'assistant', texto: 'eco: tercera', herramientas: ['escribió'] })

    await cerrar(sub.id)
    reg = (await leerRegistro()).find(s => s.id === sub.id)!
    expect(reg).toMatchObject({ tokens: 45 })
    expect(reg.cerrado).toBeTruthy()
  }, 30_000)

  it('cerrar mata el grupo de un subagente que sigue trabajando; la falla trae su código', async () => {
    const sp = await import('./sin-pantalla.js')
    const { cerrar } = await import('./cuerpo.js')
    process.env.FALSO_SLEEP_PRUEBA = '30'
    const sub = await sp.delegarSinPantalla({ nombre: 'largo', harness: 'falso', encargo: 'tarda', cwd })
    delete process.env.FALSO_SLEEP_PRUEBA
    expect(sub.id).toBe(sp.PRIMER_ID + 1)
    expect(await sp.estaVivo(sub.pid)).toBe(true)
    await cerrar(sub.id)
    expect(await esperar(async () => !(await sp.estaVivo(sub.pid)))).toBe(true)

    const f = await sp.delegarSinPantalla({ nombre: 'falla', harness: 'falso', encargo: 'falla', cwd })
    expect(await esperar(async () => !(await sp.observarSinPantalla(f)).trabajando)).toBe(true)
    const obs = await sp.observarSinPantalla(f)
    expect(obs.error).toMatch(/código 3/)
    expect(obs.motivo).toMatch(/salió con código 3/)
    await cerrar(f.id)
  }, 30_000)

  it('rechaza harness sin adaptador, cwd fuera de lo permitido y modelo inválido', async () => {
    const sp = await import('./sin-pantalla.js')
    await expect(sp.delegarSinPantalla({ nombre: 'x', harness: 'bash', encargo: 'y', cwd })).rejects.toThrow(/Harness no registrado/)
    await expect(sp.delegarSinPantalla({ nombre: 'x', harness: 'falso', encargo: 'y', cwd: '/etc' })).rejects.toThrow(/Directorio no permitido/)
    await expect(sp.delegarSinPantalla({ nombre: 'x', harness: 'opencode', encargo: 'y', cwd, modelo: 'x; rm' })).rejects.toThrow(/Modelo inválido/)
  })
})

/*
 * Entrada en vivo (ajuste de Levy, 6 oct): un CLI falso en Python con el protocolo stream-json de claude. Lee stdin
 * en un hilo; cada mensaje «trabaja» FALSO_SLEEP s (interrumpible por `control_request` interrupt) y los mensajes que
 * llegaron mientras tanto entran al MISMO turno, como hace claude.
 */
const FALSO_VIVO = `#!/usr/bin/env python3
import sys, json, threading, os, queue
a = sys.argv[1:]
sid = a[a.index('--resume') + 1] if '--resume' in a else (a[a.index('--session-id') + 1] if '--session-id' in a else 's-viva')
out = lambda o: print(json.dumps(o), flush=True)
out({"type": "system", "subtype": "init", "session_id": sid})
q = queue.Queue(); corte = threading.Event()
def lector():
    for l in sys.stdin:
        d = json.loads(l)
        if d.get("type") == "control_request": corte.set(); out({"type": "control_response", "response": {"subtype": "success"}})
        else: q.put(d["message"]["content"].splitlines()[0])
    q.put(None)
threading.Thread(target=lector, daemon=True).start()
while True:
    m = q.get()
    if m is None: break
    corte.clear()
    out({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash"}]}})
    if corte.wait(float(os.environ.get("FALSO_SLEEP", "0"))):
        out({"type": "result", "subtype": "error_during_execution", "is_error": True, "session_id": sid, "usage": {"input_tokens": 1, "output_tokens": 1}}); continue
    textos = [m]
    while not q.empty():
        x = q.get()
        if x is None: q.put(None); break
        textos.append(x)
    out({"type": "result", "subtype": "success", "session_id": sid, "result": "eco: " + " + ".join(textos), "usage": {"input_tokens": 10, "output_tokens": 5}})
`

describe.skipIf(!existsSync(PASTOR()))('entrada en vivo: pastor con stdin abierto (CLI falso stream-json)', () => {
  beforeAll(() => {
    writeFileSync(join(bin, 'cli-falso-vivo'), FALSO_VIVO)
    chmodSync(join(bin, 'cli-falso-vivo'), 0o755)
    ADAPTADORES.falsovivo = {
      ...ADAPTADORES.falso, nombre: 'falsovivo', binario: 'cli-falso-vivo', sesionPropia: true,
      vivo: { protocolo: 'claude-stream', argv: p => p.sesion ? [p.reanudar ? '--resume' : '--session-id', p.sesion] : [] },
    }
    process.env.CABINA_PASTOR_OCIO_MS = '400'
  })
  afterAll(() => { delete ADAPTADORES.falsovivo })

  it('retomar mientras trabaja entra al MISMO turno; el proceso sale al quedar ocioso; retomar después reanuda', async () => {
    const sp = await import('./sin-pantalla.js')
    const { leerRegistro, cerrar } = await import('./cuerpo.js')
    process.env.FALSO_SLEEP_PRUEBA = '2'
    const sub = await sp.delegarSinPantalla({ nombre: 'vivo', harness: 'falsovivo', encargo: 'uno', cwd })
    expect(await sp.estaVivo(sub.pid)).toBe(true)
    const r = await sp.retomarSinPantalla(sub.id, 'dos')
    expect(r).toEqual({ encolado: false, confirmado: true, enVivo: true })
    expect((await leerRegistro()).find(s => s.id === sub.id)!.cola).toBeUndefined()
    expect(await esperar(async () => !(await sp.estaVivo(sub.pid)), 15_000)).toBe(true)
    delete process.env.FALSO_SLEEP_PRUEBA
    let obs = await sp.observarSinPantalla(sub)
    expect(obs).toMatchObject({ trabajando: false, ultimaRespuesta: 'eco: uno + dos', error: null, turno: 1 })
    const t = (await sp.terminalesSinPantalla([(await leerRegistro()).find(s => s.id === sub.id)!], 4))[0]
    expect(t.conversacion!.mensajes.map(m => m.texto.split('\n')[0])).toEqual(['uno', 'dos', 'eco: uno + dos'])
    // sin pastor vivo, la FIFO ya no existe: retomar reanuda con la misma sesión
    expect(await sp.retomarSinPantalla(sub.id, 'tres')).toEqual({ encolado: false, confirmado: true })
    const reg = (await leerRegistro()).find(s => s.id === sub.id)!
    expect(await esperar(async () => (await sp.observarSinPantalla(reg)).ultimaRespuesta === 'eco: tres', 10_000)).toBe(true)
    expect(readFileSync(sp.rutaBitacora(sub.id), 'utf8')).toMatch(/"arbrain":"entrada","id":"[0-9a-f]{8}","texto":"dos","entregado":true/)
    await cerrar(sub.id)
  }, 40_000)

  it('detener corta el paso sin perder la sesión, no cuenta como falla y el siguiente retomar la reanuda', async () => {
    const sp = await import('./sin-pantalla.js')
    const { leerRegistro, cerrar } = await import('./cuerpo.js')
    process.env.FALSO_SLEEP_PRUEBA = '30'
    const sub = await sp.delegarSinPantalla({ nombre: 'largo vivo', harness: 'falsovivo', encargo: 'tarda', cwd })
    delete process.env.FALSO_SLEEP_PRUEBA
    await esperar(async () => (await sp.bitacora(sub)).b.turnos[0]?.herramientas.length > 0)
    const d = await sp.detenerSubagente(sub.id)
    expect(d).toMatchObject({ estaba: true, como: 'protocolo' })
    expect(await sp.estaVivo(sub.pid)).toBe(false)
    const reg = (await leerRegistro()).find(s => s.id === sub.id)!
    const obs = await sp.observarSinPantalla(reg)
    expect(obs.error).toBeNull()
    expect(obs.motivo).toMatch(/Levy detuvo el paso/)
    expect(reg.avisadoHasta).toBe(obs.ultimaActividad)
    expect(await sp.retomarSinPantalla(sub.id, 'otra cosa')).toEqual({ encolado: false, confirmado: true })
    expect(await esperar(async () => (await sp.observarSinPantalla((await leerRegistro()).find(s => s.id === sub.id)!)).ultimaRespuesta === 'eco: otra cosa', 10_000)).toBe(true)
    expect((await sp.bitacora(sub)).b.sesion).toBe(reg.sesion)
    expect(await sp.detenerSubagente(sub.id)).toMatchObject({ estaba: false })
    await cerrar(sub.id)
  }, 60_000)
})

describe('entorno del subagente', () => {
  it('no hereda las marcas de la sesión padre y mapea credenciales de la casa', async () => {
    const { entornoPara, comandoInteractivo } = await import('./sin-pantalla.js')
    const env = entornoPara(ADAPTADORES.gemini, { PATH: '/usr/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'sdk', ARBRAIN_CABINA_SCOPE: '{}', HOME: '/x', NODE_ENV: 'production', ANTHROPIC_API_KEY: 'k' }, { GOOGLE_API_KEY: 'g' })
    expect(env).toMatchObject({ GEMINI_API_KEY: 'g', HOME: '/x' })
    expect(env.CLAUDECODE).toBeUndefined()
    expect(env.ARBRAIN_CABINA_SCOPE).toBeUndefined()
    expect(env.NODE_ENV).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.PATH.split(':')).toContain('/opt/homebrew/bin')
    const q = entornoPara(ADAPTADORES.qwen, { OPENAI_API_KEY: 'de-otro-lado' }, { OPENROUTER_API_KEY: 'or' })
    expect(q).toMatchObject({ OPENAI_API_KEY: 'or', OPENAI_BASE_URL: 'https://openrouter.ai/api/v1' })
    // la terminal interactiva lee el secreto del .env en el momento (con-entorno.sh): el comando no lo contiene,
    // y el binario va por ruta absoluta (en la shell de Daniel `qwen` es un alias de llama-cli)
    const cmd = comandoInteractivo(ADAPTADORES.qwen, '/opt/homebrew/bin/qwen', 'ses-1', 'qwen/qwen3-coder', { OPENROUTER_API_KEY: 'secreto-xyz' }, { rutaEnv: '/r/.env', script: '/s/con-entorno.sh' })
    expect(cmd).not.toContain('secreto-xyz')
    expect(cmd).toBe('/s/con-entorno.sh /r/.env OPENAI_API_KEY=OPENROUTER_API_KEY -- env OPENAI_BASE_URL=https://openrouter.ai/api/v1 QWEN_CODE_SUPPRESS_YOLO_WARNING=1 /opt/homebrew/bin/qwen --auth-type openai -r ses-1 -m qwen/qwen3-coder --yolo')
    expect(comandoInteractivo(ADAPTADORES.claude, '/opt/homebrew/bin/claude', 'u-1', null, {})).toBe('/opt/homebrew/bin/claude --resume u-1 --permission-mode bypassPermissions')
  })
})

describe('aviso: terminar = el proceso sale', () => {
  const origen = { owner: 'daniel', account: 'default', conversationId: 'chat-levy' }
  const T0 = Date.parse('2026-10-06T20:00:00Z')
  const sub: Subagente = { id: 900001, nombre: 'qa', harness: 'opencode', encargo: 'corre la QA', cwd: '/tmp/qa', creado: new Date(T0).toISOString(), modo: 'sin-pantalla', pid: 70, entrega: 'entregado', avisarA: origen }
  const fin: Observacion = { vivo: true, trabajando: false, ultimaActividad: T0, ultimaRespuesta: 'Listo: 12/12.', pregunta: null, motivo: 'su proceso terminó el turno 1 (salió con código 0)' }
  it('avisa en cuanto sale, sin esperar quietud, una sola vez', () => {
    const d = decidirAviso(sub, fin, T0 + 1)
    expect(d).toMatchObject({ avisar: true, cambio: { avisadoHasta: T0 } })
    if (d.avisar) expect(d.texto).toMatch(/agenteId 900001, opencode\) · estado: TERMINÓ · su proceso terminó el turno 1 \(salió con código 0\)\.[\s\S]*12\/12/)
    expect(decidirAviso({ ...sub, avisadoHasta: T0 }, fin, T0 + 60_000)).toEqual({ avisar: false })
    expect(decidirAviso(sub, { ...fin, trabajando: true }, T0 + 60_000)).toEqual({ avisar: false })
  })
  it('una respuesta que termina en pregunta va al coordinador; un error dice su código', () => {
    const d = decidirAviso(sub, { ...fin, ultimaRespuesta: '¿Uso la rama A o la B?', pregunta: '¿Uso la rama A o la B?' }, T0 + 1)
    if (d.avisar) expect(d.texto).toMatch(new RegExp(String.raw`Dejó una pregunta para ti \(no para ${DUENO}\)`))
    const e = decidirAviso(sub, { ...fin, error: 'el CLI salió con código 3', motivo: 'su proceso salió con código 3 en el turno 1' }, T0 + 1)
    if (e.avisar) expect(e.texto).toMatch(/FALLÓ · su último turno cerró con error: el CLI salió con código 3/)
  })
  it('con mensajes en cola, al terminar los entrega en vez de avisar', async () => {
    const avisos: string[] = [], anotados: Partial<Subagente>[] = [], entregados: number[] = []
    const p: PuertoAviso = {
      registro: async () => [{ ...sub, cola: ['y ahora esto'] }],
      observar: async () => ({ ...fin, tokens: 99 }),
      anotar: async (_s, c) => { anotados.push(c) },
      avisar: (_o, t) => { avisos.push(t) },
      entregarCola: async s => { entregados.push(s.id); return true },
    }
    expect(await revisarSubagentes(p, T0 + 1)).toBe(0)
    expect(entregados).toEqual([900001])
    expect(avisos).toEqual([])
    expect(anotados).toEqual([{ tokens: 99 }, { avisadoHasta: T0 }])
  })
})
