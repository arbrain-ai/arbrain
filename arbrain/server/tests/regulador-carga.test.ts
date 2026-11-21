import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REGULADOR = resolve(__dirname, '../scripts/system/regulador-carga.mjs')
// El regulador es del Studio de la instalación original; la copia del alumno no lo trae.
const HAY = existsSync(REGULADOR)
const { agruparRenders, decidirRegulador, esRaizDeRender, etimeASeg, idleDeTop } = HAY ? await import(REGULADOR) : ({} as Record<string, any>)

const cfg = { webLentoMs: 1500, webAgilMs: 800, idleSaturado: 8, idleHolgura: 25, esperaReanudarMs: 30_000 }
const grupo = (raiz: number, detenida = false, pesada = true) => ({ raiz, pids: [raiz], etimeS: 1000 - raiz, detenida, rezagados: [], pesada, etiqueta: String(raiz) })
const base = { webOk: true, webMs: 50, idle: 50, presionMem: 1, ahora: 1_000_000, ultimoReanudar: 0 }

describe.skipIf(!HAY)('regulador de carga', () => {
  it('reconoce renders y no confunde al shell del agente', () => {
    expect(esRaizDeRender({ cmd: 'node src/render.js video a b', nice: 10 })).toBe(true)
    expect(esRaizDeRender({ cmd: 'bash /tmp/render-slots/turno.sh node x', nice: 0 })).toBe(true)
    expect(esRaizDeRender({ cmd: '/bin/zsh -c node src/render.js video', nice: 0 })).toBe(false)
    expect(esRaizDeRender({ cmd: 'ffmpeg -i a b', nice: 0 })).toBe(false)
    expect(esRaizDeRender({ cmd: '/opt/homebrew/bin/ffmpeg -i a b', nice: 10 })).toBe(true)
  })

  it('agrupa descendientes bajo su raíz, más viejos primero', () => {
    const g = agruparRenders([
      { pid: 10, ppid: 1, nice: 0, stat: 'S', etimeS: 100, cmd: 'bash /tmp/render-slots/turno.sh node src/render.js video' },
      { pid: 11, ppid: 10, nice: 10, stat: 'S', etimeS: 90, cmd: 'node src/render.js video' },
      { pid: 12, ppid: 11, nice: 10, stat: 'R', etimeS: 80, cmd: 'ffmpeg -y -i -' },
      { pid: 20, ppid: 1, nice: 0, stat: 'S', etimeS: 500, cmd: 'bash /tmp/render-slots/turno.sh node src/render.js video' },
      { pid: 21, ppid: 20, nice: 0, stat: 'S', etimeS: 1, cmd: 'sleep 30' },
      { pid: 30, ppid: 1, nice: 0, stat: 'R', etimeS: 900, cmd: 'next-server (v16)' },
    ])
    expect(g.map((x: any) => x.raiz)).toEqual([20, 10])
    expect(g[1].pids.sort()).toEqual([10, 11, 12])
    expect(g[1].pesada).toBe(true)
    expect(g[0].pesada).toBe(false) // solo espera turno
  })

  it('con el web caído y la CPU saturada, congela todo menos el más viejo', () => {
    const d = decidirRegulador({ ...base, webOk: false, idle: 0, grupos: [grupo(1), grupo(2), grupo(3)] }, cfg)
    expect(d.congelar.map((g: any) => g.raiz)).toEqual([2, 3])
    expect(d.reanudar).toEqual([])
  })

  it('si el web sigue caído con un solo render, también lo congela', () => {
    expect(decidirRegulador({ ...base, webOk: false, idle: 1, grupos: [grupo(1)] }, cfg).congelar).toHaveLength(1)
  })

  it('no congela si el web cae con la CPU libre: el problema es otro', () => {
    expect(decidirRegulador({ ...base, webOk: false, idle: 60, grupos: [grupo(1), grupo(2)] }, cfg).congelar).toEqual([])
  })

  it('CPU al tope con el web ágil es buen uso: no toca nada', () => {
    const d = decidirRegulador({ ...base, webMs: 40, idle: 0, grupos: [grupo(1), grupo(2)] }, cfg)
    expect(d.congelar).toEqual([])
  })

  it('con el web lento congela solo al más nuevo y nunca al último', () => {
    const d = decidirRegulador({ ...base, webMs: 2500, idle: 2, grupos: [grupo(1), grupo(2)] }, cfg)
    expect(d.congelar.map((g: any) => g.raiz)).toEqual([2])
    expect(decidirRegulador({ ...base, webMs: 2500, idle: 2, grupos: [grupo(1)] }, cfg).congelar).toEqual([])
  })

  it('reanuda de uno en uno, el más viejo, con holgura y respetando la espera', () => {
    const grupos = [grupo(1, true), grupo(2, true)]
    expect(decidirRegulador({ ...base, grupos }, cfg).reanudar.map((g: any) => g.raiz)).toEqual([1])
    expect(decidirRegulador({ ...base, grupos, ultimoReanudar: base.ahora - 5000 }, cfg).reanudar).toEqual([])
    expect(decidirRegulador({ ...base, idle: 10, grupos: [grupo(9), grupo(1, true)] }, cfg).reanudar).toEqual([])
  })

  it('si no corre ningún render, reanuda aunque haya poca holgura', () => {
    expect(decidirRegulador({ ...base, idle: 10, grupos: [grupo(1, true)] }, cfg).reanudar).toHaveLength(1)
  })

  it('lee etime y top', () => {
    expect(etimeASeg('02-20:59:29')).toBe(2 * 86400 + 20 * 3600 + 59 * 60 + 29)
    expect(etimeASeg('11:05')).toBe(665)
    expect(idleDeTop('CPU usage: 9% user, 1% sys, 90.0% idle\nCPU usage: 78.65% user, 21.34% sys, 0.1% idle')).toBe(0.1)
  })
})
