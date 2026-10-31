import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { argsFfmpegLector } from './voice.js'
import { ARCHIVO_ACTIVIDAD_LECTOR, marcarLectorActivo, reiniciarActividadLector } from './lector-actividad.js'

// 31 oct 2026: el auto-deploy reinició el daemon a las 08:31:22 en el mismo segundo en que el iPhone pedía un tramo del
// lector (500 → voz del navegador → frases perdidas). Desde hoy el daemon deja la hora de cada pedido del lector y el
// auto-deploy no reinicia si el último fue hace menos de 2 minutos.
const SCRIPT = resolve(__dirname, '../scripts/lector-reposo.sh')

function diferir(env: Record<string, string>): { rc: number; log: string } {
  const out = execFileSync('bash', ['-c', `log(){ echo "LOG $*"; }; . "${SCRIPT}"; if lector_diferir; then echo RC=0; else echo RC=1; fi`], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
  }).toString()
  return { rc: Number(/RC=(\d)/.exec(out)![1]), log: out }
}

describe('el auto-deploy deja el reinicio para el reposo si el lector sonó hace poco', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lector-reposo-'))
  const marca = join(dir, '.lector-tts')
  const desde = join(dir, 'desde')
  const base = { LECTOR_MARCA: marca, LECTOR_DESDE: desde }

  it('sin marca (nadie ha escuchado) reinicia', () => {
    expect(diferir({ ...base, LECTOR_AHORA: '1000' }).rc).toBe(1)
  })

  it('un tramo hace 30 s difiere y lo dice una vez en el log; a los 2 min ya reinicia', () => {
    writeFileSync(marca, '1000')
    const a = diferir({ ...base, LECTOR_AHORA: '1030' })
    expect(a.rc).toBe(0)
    expect(a.log).toMatch(/LOG Lector sonando \(último tramo hace 30s\)/)
    const b = diferir({ ...base, LECTOR_AHORA: '1060' })
    expect(b.rc).toBe(0)
    expect(b.log).not.toMatch(/LOG/) // la espera ya se anunció
    expect(diferir({ ...base, LECTOR_AHORA: '1120' }).rc).toBe(1)
    expect(existsSync(desde)).toBe(false) // la espera terminó: el siguiente episodio se vuelve a anunciar
  })

  it('una lectura de más de hora y media no detiene el deploy para siempre', () => {
    writeFileSync(marca, '9000')
    expect(diferir({ ...base, LECTOR_AHORA: '9010' }).rc).toBe(0)
    writeFileSync(marca, '14400')
    const tope = diferir({ ...base, LECTOR_AHORA: String(9010 + 5400) })
    expect(tope.rc).toBe(1)
    expect(tope.log).toMatch(/tope de espera/)
  })

  it('auto-deploy.sh lo consulta antes de construir y otra vez antes del kickstart, y un diferido no es error', () => {
    const s = readFileSync(resolve(__dirname, '../scripts/auto-deploy.sh'), 'utf8')
    const funcion = s.slice(s.indexOf('do_build_and_kickstart() {'), s.indexOf('# ── Rebuild por commits LOCALES'))
    expect(funcion.indexOf('lector_diferir')).toBeLessThan(funcion.indexOf('npm run build'))
    expect(funcion.lastIndexOf('lector_diferir')).toBeLessThan(funcion.indexOf('launchctl kickstart -k'))
    expect(funcion.lastIndexOf('lector_diferir')).toBeGreaterThan(funcion.indexOf('chat_runtime_turns'))
    expect(s).toMatch(/\[ "\$RC" -eq 2 \] && exit 0/)
    expect(s).toMatch(/LECTOR_MARCA="\$CLAUDECLAW_DIR\/store\/\.lector-tts"/)
  })
})

describe('marca de actividad del lector', () => {
  it('escribe la hora en segundos, una vez cada 5 s como mucho, en store/.lector-tts', async () => {
    reiniciarActividadLector()
    const escritas: Array<[string, string]> = []
    const escribir = async (f: string, s: string) => { escritas.push([f, s]) }
    expect(marcarLectorActivo(1_000_000, escribir)).toBe(true)
    expect(marcarLectorActivo(1_003_000, escribir)).toBe(false)
    expect(marcarLectorActivo(1_005_000, escribir)).toBe(true)
    expect(escritas).toEqual([[ARCHIVO_ACTIVIDAD_LECTOR, '1000'], [ARCHIVO_ACTIVIDAD_LECTOR, '1005']])
    expect(ARCHIVO_ACTIVIDAD_LECTOR.endsWith('/store/.lector-tts') || ARCHIVO_ACTIVIDAD_LECTOR.endsWith('.lector-tts')).toBe(true)
  })
})

describe('audio ligero del lector (31 oct 2026)', () => {
  it('un solo ffmpeg hace atempo y Opus; a 1x en WAV no hace falta ffmpeg y el filtro no aparece', () => {
    const opus2x = argsFfmpegLector(22050, 2, 'opus')
    expect(opus2x).toEqual(expect.arrayContaining(['atempo=2', 'libopus', '40k', 'ogg', 'pipe:0', 'pipe:1']))
    expect(opus2x.indexOf('atempo=2')).toBeLessThan(opus2x.indexOf('libopus'))
    expect(argsFfmpegLector(22050, 1, 'opus')).not.toContain('-filter:a')
    expect(argsFfmpegLector(22050, 1.5, 'wav')).toEqual(expect.arrayContaining(['atempo=1.5', 's16le']))
    expect(argsFfmpegLector(22050, 1.5, 'wav')).not.toContain('libopus')
  })
})
