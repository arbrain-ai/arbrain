/** «Voz con SFlow»: estado, persistencia, dónde está SFlow y ubicación del transcript de una sesión. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { _vozSFlowParaPruebas, conNarracion, DEMO_JSON, estadoVozSFlow, fijarVozSFlow, narrarAntesDeAccion, raicesDeTranscripts, transcriptDe, VOZ_PY } from './voz-sflow.js'

let raiz = ''
const previo = process.env.ARBRAIN_CONFIG_DIR
beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-voz-')))
  process.env.ARBRAIN_CONFIG_DIR = join(raiz, 'config')
  _vozSFlowParaPruebas(null)
})
afterAll(() => {
  _vozSFlowParaPruebas(null)
  if (previo === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo
  rmSync(raiz, { recursive: true, force: true })
})

describe('Voz con SFlow', () => {
  it('nace encendida (como el gancho de Claude Code) y se puede apagar y persiste', () => {
    expect(estadoVozSFlow().encendido).toBe(true)
    fijarVozSFlow(false)
    const archivo = join(process.env.ARBRAIN_CONFIG_DIR!, 'voz-sflow.json')
    expect(existsSync(archivo) && JSON.parse(readFileSync(archivo, 'utf8')).encendido).toBe(false)
    _vozSFlowParaPruebas(null)
    expect(estadoVozSFlow().encendido).toBe(false)
    fijarVozSFlow(true)
    expect(estadoVozSFlow().encendido).toBe(true)
  })

  it('encuentra el transcript de la sesión sin suponer la carpeta del proyecto', () => {
    const proyectos = join(raiz, 'projects')
    const sesion = '862307b5-8261-4e8a-b4a1-8b2d21f179bd'
    mkdirSync(join(proyectos, '-Users-alguien-Arbrain'), { recursive: true })
    mkdirSync(join(proyectos, '-Users-alguien-otro'), { recursive: true })
    writeFileSync(join(proyectos, '-Users-alguien-Arbrain', `${sesion}.jsonl`), '{}\n')
    expect(transcriptDe(sesion, proyectos)).toBe(join(proyectos, '-Users-alguien-Arbrain', `${sesion}.jsonl`))
    expect(transcriptDe('00000000-0000-0000-0000-000000000000', proyectos)).toBeNull()
  })

  it('busca en varias raíces (la cuenta en uso y ~/.claude) sin repetir', () => {
    const otra = join(raiz, 'otra-cuenta', 'projects')
    const sesion = 'a1b2c3d4-0000-4e8a-b4a1-8b2d21f179bd'
    mkdirSync(join(otra, '-Users-alguien-Arbrain'), { recursive: true })
    writeFileSync(join(otra, '-Users-alguien-Arbrain', `${sesion}.jsonl`), '{}\n')
    expect(transcriptDe(sesion, [join(raiz, 'projects'), otra])).toBe(join(otra, '-Users-alguien-Arbrain', `${sesion}.jsonl`))
    const previa = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(raiz, 'otra-cuenta')
    expect(raicesDeTranscripts()[0]).toBe(otra)
    if (previa === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previa
  })

  it('busca a SFlow en su carpeta de datos (la misma en cualquier Mac) y respeta ARBRAIN_VOZ_SFLOW', () => {
    const previa = process.env.ARBRAIN_VOZ_SFLOW
    delete process.env.ARBRAIN_VOZ_SFLOW
    expect(VOZ_PY()).toMatch(/Library\/Application Support\/SFlow\/voz\.py$/)
    expect(DEMO_JSON()).toMatch(/Library\/Application Support\/SFlow\/demo\.json$/)
    process.env.ARBRAIN_VOZ_SFLOW = join(raiz, 'no-existe.py')
    expect(VOZ_PY()).toBe(join(raiz, 'no-existe.py'))
    expect(estadoVozSFlow().disponible).toBe(false)
    if (previa === undefined) delete process.env.ARBRAIN_VOZ_SFLOW; else process.env.ARBRAIN_VOZ_SFLOW = previa
  })

  it('rechaza ids de sesión que no parecen ids (nada de rutas)', () => {
    expect(transcriptDe('../../etc/passwd', join(raiz, 'projects'))).toBeNull()
    expect(transcriptDe('', join(raiz, 'projects'))).toBeNull()
  })

  it('la narración se suma a los avisos sin quitar los demás, y solo en el chat', () => {
    const otro = { hooks: [async () => ({ continue: true })] }
    const base = { PreToolUse: [otro] }
    expect(conNarracion(base, false)).toBe(base)
    const con = conNarracion(base, true)
    expect(con.PreToolUse).toHaveLength(2)
    expect(con.PreToolUse[0]).toBe(otro)
  })

  it('con la voz apagada, la narración no hace esperar nada', async () => {
    fijarVozSFlow(false)
    const t0 = Date.now()
    await narrarAntesDeAccion({ hook_event_name: 'PreToolUse', session_id: 's', transcript_path: '/no', cwd: '/', tool_name: 'Bash', tool_input: {}, tool_use_id: 't' } as never)
    expect(Date.now() - t0).toBeLessThan(200)
    fijarVozSFlow(true)
  })
})

