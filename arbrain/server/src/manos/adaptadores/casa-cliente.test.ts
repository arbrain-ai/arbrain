import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:net'
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClienteCasa, rutaAppCasa, rutaSocketCasa, rutaTokenCasa } from './casa.js'

/**
 * Edición cliente del adaptador `casa` (0.1.2, red team 3 M-10): app empaquetada, socket de la carpeta de la app y
 * token por conexión. La ArbrainManos falsa se comporta como Edicion.swift: sin el token en la primera línea, cierra.
 */
const previo = { ed: process.env.ARBRAIN_EDICION, cfg: process.env.ARBRAIN_CONFIG_DIR }
const config = mkdtempSync(join(tmpdir(), 'manos-casa-cliente-'))
const ruta = join(config, 'manos.sock')
const app = join(config, 'ArbrainManos.app')
mkdirSync(app)
const lineas: any[] = []
let servidor: Server

beforeAll(async () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_CONFIG_DIR = config
  servidor = createServer(s => {
    let bufer = '', autenticada = false
    s.setEncoding('utf8')
    s.on('data', (d: string) => {
      bufer += d
      let i: number
      while ((i = bufer.indexOf('\n')) >= 0) {
        const p = JSON.parse(bufer.slice(0, i)); bufer = bufer.slice(i + 1)
        lineas.push(p)
        if (!autenticada) {
          let vigente = ''
          try { vigente = readFileSync(rutaTokenCasa(), 'utf8').trim() } catch { /* sin token */ }
          if (!vigente || p.token !== vigente) { s.end(JSON.stringify({ id: p.id, ok: false, error: 'no autorizado' }) + '\n'); return }
          autenticada = true
        }
        s.write(JSON.stringify({ id: p.id, ok: true, r: p.op === 'hola' ? { hola: true } : { pong: true } }) + '\n')
      }
    })
  })
  await new Promise<void>(ok => servidor.listen(ruta, ok))
})
afterAll(() => {
  servidor.close()
  if (previo.ed === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo.ed
  if (previo.cfg === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo.cfg
})

describe('adaptador casa · edición cliente', () => {
  it('nunca usa la app ni el socket de la instalación original', () => {
    const env = { ARBRAIN_EDICION: 'cliente', ARBRAIN_CONFIG_DIR: config } as NodeJS.ProcessEnv
    expect(rutaAppCasa(env)).toMatch(/manos[/\\]ArbrainManos\.app$/)
    expect(rutaAppCasa(env)).not.toBe(join(homedir(), 'Applications/ArbrainManos.app'))
    expect(rutaSocketCasa(env)).toBe(join(config, 'manos.sock'))
    expect(rutaSocketCasa(env)).not.toContain(join('.config', 'arbrain', 'manos.sock'))
    // La instalación original no cambia.
    expect(rutaAppCasa({ ARBRAIN_EDICION: 'original' } as NodeJS.ProcessEnv)).toBe(join(homedir(), 'Applications/ArbrainManos.app'))
  })

  it('saluda con el token (0600) antes del primer pedido y la app lo acepta', async () => {
    const c = new ClienteCasa(ruta, app, 'sesion-prueba', 'prueba')
    expect(await c.llamar('ping')).toEqual({ pong: true })
    c.cerrar()
    const hola = lineas.find(l => l.op === 'hola')
    expect(hola?.token).toMatch(/^[0-9a-f]{64}$/)
    expect(lineas.find(l => l.op === 'ping')?.token).toBeUndefined()
    expect(statSync(rutaTokenCasa()).mode & 0o777).toBe(0o600)
  })

  it('sin la app empaquetada falla con un mensaje claro y sin abrir nada', async () => {
    const c = new ClienteCasa(ruta, join(config, 'no-esta.app'), 's2', 'prueba')
    await expect(c.llamar('ping')).rejects.toThrow(/no trae ArbrainManos/)
  })
})
