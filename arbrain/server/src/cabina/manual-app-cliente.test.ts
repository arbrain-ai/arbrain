// El manual de la app del alumno contra lo que su edición trae de verdad (1 nov 2026, sistema nervioso S2): decía que
// no existían calendario, hábitos, avisos ni voz, y no nombraba panel, archivero, conversacion ni ayuda.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cabinaToolsCliente, VISTAS_CLIENTE } from './tools.js'

const raiz = (r: string) => readFileSync(fileURLToPath(new URL(`../../../${r}`, import.meta.url)), 'utf8')
const manual = raiz('empaquetado/plantillas/skills/artificial-brain/references/app/SKILL.md')
const chat = raiz('empaquetado/plantillas/skills/artificial-brain/references/app/references/chat.md')
const noExiste = manual.split('Lo que **no** existe en esta edición')[1]?.split('Si el dueño lo pide')[0] ?? ''

describe('manual de la app del alumno', () => {
  it('nombra cada herramienta de su Cabina y cada vista de mostrar', () => {
    for (const t of cabinaToolsCliente('el dueño')) expect(manual, t.name).toContain(`\`${t.name}\``)
    for (const v of VISTAS_CLIENTE) expect(manual, v).toContain(`\`${v}\``)
  })

  it('nombra cada sección del «+» de su panel (lib/edicion.ts)', () => {
    const web = raiz('src/lib/edicion.ts')
    const secciones = JSON.parse((/SECCIONES_PANEL_CLIENTE = (\[[^\]]+\])/.exec(web)?.[1] ?? '[]').replace(/'/g, '"')) as string[]
    expect(secciones.length).toBeGreaterThan(2)
    const nombre: Record<string, string> = { calendario: 'Calendario', lienzo: 'Lienzo', explorador: 'Archivos', taller: 'Taller' }
    for (const s of secciones) expect(manual, s).toContain(nombre[s] ?? s)
  })

  it('no niega lo que su edición sí trae', () => {
    expect(noExiste.length).toBeGreaterThan(20)
    for (const si of [/calendario,/i, /hábitos/i, /notificaciones push/i, /\bvoz y\b/i]) expect(noExiste).not.toMatch(si)
    expect(chat).not.toMatch(/Voz, Live y Consejo no existen/)
    expect(manual).toMatch(/Ajustes › Notificaciones/)
    expect(manual).toMatch(/Escuchar/)
  })
})
