/**
 * Regresión del 3 nov, 07:33: `navegar` lanzó `open -g -n -a "Google Chrome" --args --new-window <url>` con el Chrome de
 * Daniel vivo. La segunda instancia esperó ~20 s el ACK del singleton (Studio usando disco como memoria) y le mandó
 * SIGKILL (runningboardd: «termination reported by launchd (2, 9, 9)» a las 07:33:56). Se perdieron Meet y YouTube Music.
 */
import { describe, expect, it } from 'vitest'
import { argumentosAbrir, navegar } from './navegador.js'
import type { Adaptador, App, Ventana } from './contrato.js'

function falso(corre: boolean) {
  const apps: App[] = corre ? [{ nombre: 'Google Chrome', bundle: 'com.google.Chrome', pid: 652, activa: true }] : []
  const ventanas: Ventana[] = []
  const adoptadas: number[] = []
  const a = {
    nombre: 'falso',
    apps: async () => apps,
    ventanas: async ({ pid }: { pid?: number } = {}) => ventanas.filter(() => pid === 777),
    adoptar: (id: number) => adoptadas.push(id),
  } as unknown as Adaptador & { adoptar: (id: number) => void }
  // Lanzar Chrome «de verdad» en la prueba: aparece el proceso con una ventana nueva.
  const lanzar = () => { apps.push({ nombre: 'Google Chrome', bundle: 'com.google.Chrome', pid: 777, activa: false }); ventanas.push({ id: 91, titulo: 'x', en_pantalla: true, marco: { x: 0, y: 0, w: 1200, h: 800 }, z: 1 } as Ventana) }
  return { a, adoptadas, lanzar }
}

describe('navegar no toca un navegador vivo', () => {
  it('nunca usa `open -n` (segunda instancia que puede matar a la de Daniel)', () => {
    const args = argumentosAbrir('Google Chrome', 'https://abliteration.ai')
    expect(args).not.toContain('-n')
    expect(args).not.toContain('-na')
    expect(args.slice(0, 3)).toEqual(['-g', '-a', 'Google Chrome'])
  })

  it('con Chrome abierto no lanza nada y manda a web_abrir', async () => {
    const { a } = falso(true)
    const llamadas: string[][] = []
    const r = await navegar(a, { url: 'https://abliteration.ai' }, async (app, url) => { llamadas.push([app, url]) })
    expect(llamadas).toHaveLength(0)
    expect(r.ok).toBe(false)
    expect(r.detalle).toMatch(/web_abrir/)
    expect(r.detalle).toMatch(/3 nov/)
  })

  it('con Chrome cerrado lo lanza en segundo plano y adopta su ventana', async () => {
    const { a, adoptadas, lanzar } = falso(false)
    const llamadas: string[][] = []
    const r = await navegar(a, { url: 'https://example.com' }, async (app, url) => { llamadas.push([app, url]); lanzar() })
    expect(llamadas).toEqual([['Google Chrome', 'https://example.com/']])
    expect(r).toMatchObject({ ok: true, pid: 777, ventana: 91 })
    expect(adoptadas).toEqual([91])
  })
})
