/**
 * Subir un archivo a una web sin el panel «Abrir» de macOS (5 nov 2026, canal «Levy Arbrain»: cuatro intentos
 * fallidos operando el panel a ciegas y una ruta tecleada mal). Las guardas viven en el agent-server y no las apaga
 * nada: la ruta tiene que estar textual en el pedido o la cita, la pestaña en el sitio del encargo, y nunca
 * carpetas ni archivos de llaves (tampoco por un enlace simbólico).
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { juzgarArchivo, juzgarSubidas, textoGuardado, type ImagenPagina } from './archivo-web.js'
import { SesionWeb, ejecutarWeb, sostenerMarcoWeb, MANOS_WEB_TOOLS } from './herramientas-web.js'
import type { PasoBitacora } from '../bitacora.js'

let home: string
let banner: string
beforeAll(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'archivo-web-')))
  mkdirSync(join(home, 'Developer'))
  banner = join(home, 'Developer', 'banner-levy.png')
  writeFileSync(banner, 'PNG!')
  mkdirSync(join(home, '.ssh'))
  writeFileSync(join(home, '.ssh', 'id_ed25519'), 'secreto')
  writeFileSync(join(home, 'Developer', 'llave.pem'), 'secreto')
  writeFileSync(join(home, 'Developer', '.env'), 'X=1')
  symlinkSync(join(home, '.ssh', 'id_ed25519'), join(home, 'Developer', 'foto.png'))
  mkdirSync(join(home, 'Developer', 'carpeta.png'))
})

const STUDIO = 'https://studio.youtube.com/channel/UCvnAZTnuozAuan2RN4Y7OjA/editing/profile'

describe('juzgarArchivo: guardas de la subida', () => {
  it('pasa: la ruta está textual en el pedido y la pestaña en el sitio que el pedido nombra', () => {
    const j = juzgarArchivo(banner, { textos: [`Sube ${banner} como banner en ${STUDIO}`], url: STUDIO, home })
    expect(j).toMatchObject({ ok: true, real: banner, nombre: 'banner-levy.png', bytes: 4 })
  })

  it('una ruta que no aparece textual en el pedido ni en la cita no sale (el modelo no elige qué archivo sale de la Mac)', () => {
    const j = juzgarArchivo(join(home, 'Developer', 'otro.png'), { textos: [`Sube ${banner} como banner en YouTube Studio`], url: STUDIO, home })
    expect(j.ok).toBe(false)
    expect(!j.ok && j.motivo).toMatch(/no aparece/)
    // y le dice cuál sí nombra el encargo, para que corrija a la primera
    expect(!j.ok && j.motivo).toContain(banner)
  })

  it('la ruta del pedido con ~ vale igual que la absoluta', () => {
    expect(juzgarArchivo(banner, { textos: ['sube ~/Developer/banner-levy.png al banner de YouTube'], url: STUDIO, home }).ok).toBe(true)
    expect(juzgarArchivo('~/Developer/banner-levy.png', { textos: [`sube ${banner} al banner de YouTube`], url: STUDIO, home }).ok).toBe(true)
  })

  it('un prefijo no cuenta: /x/banner.png no está autorizada porque el pedido diga /x/banner.png.bak', () => {
    const j = juzgarArchivo(banner, { textos: [`sube ${banner}.bak a YouTube`], url: STUDIO, home })
    expect(j.ok).toBe(false)
  })

  it('nunca carpetas de llaves ni archivos de llaves, aunque el pedido los nombre', () => {
    for (const r of [join(home, '.ssh', 'id_ed25519'), join(home, 'Developer', 'llave.pem'), join(home, 'Developer', '.env')]) {
      const j = juzgarArchivo(r, { textos: [`sube ${r} a YouTube`], url: STUDIO, home })
      expect(j.ok, r).toBe(false)
      expect(!j.ok && j.motivo).toMatch(/llave/)
    }
  })

  it('un enlace simbólico que apunta a ~/.ssh tampoco sale', () => {
    const r = join(home, 'Developer', 'foto.png')
    const j = juzgarArchivo(r, { textos: [`sube ${r} a YouTube`], url: STUDIO, home })
    expect(j.ok).toBe(false)
    expect(!j.ok && j.motivo).toMatch(/llave/)
  })

  it('solo en el sitio del encargo: la misma ruta no sale hacia otro dominio', () => {
    const j = juzgarArchivo(banner, { textos: [`sube ${banner} al banner de YouTube Studio`], url: 'https://subidas.ejemplo-malo.com/upload', home })
    expect(j.ok).toBe(false)
    expect(!j.ok && j.motivo).toMatch(/sitio/)
  })

  it('el sitio vale por su dominio en una URL o por su marca nombrada («YouTube Studio» → studio.youtube.com)', () => {
    expect(juzgarArchivo(banner, { textos: [`sube ${banner} al banner de YouTube Studio`], url: STUDIO, home }).ok).toBe(true)
    expect(juzgarArchivo(banner, { textos: [`sube ${banner} en http://127.0.0.1:4100/subir`], url: 'http://127.0.0.1:4100/subir', home }).ok).toBe(true)
  })

  it('tiene que ser un archivo que existe (ni carpeta ni ruta inventada) y absoluta', () => {
    const c = join(home, 'Developer', 'carpeta.png')
    expect(juzgarArchivo(c, { textos: [`sube ${c} a YouTube`], url: STUDIO, home }).ok).toBe(false)
    const n = join(home, 'Developer', 'no-existe.png')
    expect(juzgarArchivo(n, { textos: [`sube ${n} a YouTube`], url: STUDIO, home }).ok).toBe(false)
    expect(juzgarArchivo('banner-levy.png', { textos: ['sube banner-levy.png a YouTube'], url: STUDIO, home }).ok).toBe(false)
  })
})

/** Lo que YouTube Studio muestra antes de subir: la ilustración del banner y la «L» por defecto. */
const PLACEHOLDER = 'https://www.gstatic.com/youtube/img/creator/banner_placeholder.svg'
const AVATAR_L = 'https://yt3.ggpht.com/ytc/AIdro_letra_L'
const ZONA_BANNER = 'Para obtener los mejores resultados en todos los dispositivos, usa una imagen de 2048 × 1152 píxeles'

/**
 * Canal falso de la extensión: una pestaña en YouTube Studio con un botón «Subir». `aceptado` es lo que la página hizo al
 * recibir el archivo (por defecto, abrió el recorte); `imagenes`, lo que muestra al leerla; `guardado`, los envíos de un clic.
 */
function canalFalso(url = STUDIO, op: { aceptado?: any; imagenes?: ImagenPagina[]; guardado?: any } = {}) {
  const llamadas: { metodo: string; args: any }[] = []
  const nodos = [
    { b: 101, rol: 'button', nombre: 'Subir', prof: 0 },
    { b: 102, rol: 'button', nombre: 'Publicar', prof: 0 },
    { b: 103, rol: 'textbox', nombre: 'Descripción', prof: 0 },
    { b: 104, rol: 'link', nombre: 'Personalización', prof: 0 },
    { b: 105, rol: 'button', nombre: 'Cancelar', prof: 0 },
  ]
  const canal = {
    llamar: async (metodo: string, args: any): Promise<any> => {
      llamadas.push({ metodo, args })
      if (metodo === 'pestanas') return [{ pestana: 5 }]
      if (metodo === 'observar') return { nodos, url, titulo: 'Personalización del canal', total_ax: 40, ms_ax: 1 }
      if (metodo === 'contexto') return { tag: 'button', nombre: 'Subir', url }
      if (metodo === 'archivo') return { ok: true, como: 'el selector que abrió el botón (sin panel)', archivos: [{ nombre: 'banner-levy.png', bytes: 4 }], aceptado: 'aceptado' in op ? op.aceptado : { senal: 'dialogo', detalle: 'Personalizar material gráfico del banner' }, zonas: [ZONA_BANNER], imagenes_antes: [PLACEHOLDER, AVATAR_L], url_antes: url, url, titulo: 'Personalización del canal' }
      if (metodo === 'actuar') return { ok: true, como: 'ratón', url_antes: url, url, titulo: 'x', selector: { pidio_archivo: true, input: true }, ...(op.guardado ? { guardado: op.guardado } : {}) }
      if (metodo === 'evaluar_estado') return { url, titulo: 'Personalización del canal', texto: 'Personalización del canal', medios: [] }
      if (metodo === 'imagenes') return { url, imagenes: op.imagenes ?? [{ src: PLACEHOLDER, tipo: 'url', zona: ZONA_BANNER }, { src: AVATAR_L, tipo: 'url', zona: 'Tu canal' }] }
      if (metodo === 'marco') return { ok: true, detenida: null }
      return {}
    },
    cerrar: async () => {},
  }
  return { canal, llamadas }
}

describe('web_actuar · accion «archivo»', () => {
  it('el esquema de web_actuar ofrece archivo con su ruta', () => {
    const t = MANOS_WEB_TOOLS.find(x => x.name === 'web_actuar')!
    const props = t.inputSchema.properties as any
    expect(props.accion.enum).toContain('archivo')
    expect(props.ruta.type).toBe('string')
    expect(t.description).toMatch(/archivo/)
  })

  it('con la ruta del pedido y en su sitio: la extensión recibe la ruta real y el host juzgado, y queda en la bitácora', async () => {
    const { canal, llamadas } = canalFalso()
    const s = new SesionWeb(canal)
    const pasos: Omit<PasoBitacora, 't'>[] = []
    const sink = { paso: (p: Omit<PasoBitacora, 't'>) => { pasos.push(p) } }
    s.textosEncargo = [`Sube ${banner} como banner del canal en YouTube Studio`]
    const lectura = await ejecutarWeb('web_observar', {}, s, sink)
    const idx = Number(lectura.text.match(/\[(\d+)\] button «Subir»/)![1])
    const r = await ejecutarWeb('web_actuar', { accion: 'archivo', indice: idx, ruta: banner }, s, sink)
    expect(r.error).toBeFalsy()
    const a = llamadas.find(l => l.metodo === 'archivo')
    expect(a?.args).toMatchObject({ pestana: 5, b: 101, rutas: [banner], host: 'studio.youtube.com' })
    expect(r.text).toMatch(/banner-levy\.png/)
    expect(r.text).toMatch(/sin panel/)
    expect(r.text).toMatch(/la página lo aceptó \(dialogo/)
    expect(pasos).toContainEqual(expect.objectContaining({ herramienta: 'web_actuar', accion: 'archivo', resultado: 'ok', archivo: banner }))
    expect(s.subidas).toEqual([expect.objectContaining({ nombre: 'banner-levy.png', zonas: [ZONA_BANNER], antes: [PLACEHOLDER, AVATAR_L] })])
  })

  // Falso positivo del 6 nov (enc-mw4dqzyo-74eb8d): el archivo quedó en el campo, la página no hizo nada y se dijo ok.
  it('el archivo en el campo sin reacción de la página NO es ok: falla, lo dice y no cuenta como subida', async () => {
    const { canal } = canalFalso(STUDIO, { aceptado: null })
    const s = new SesionWeb(canal)
    const pasos: Omit<PasoBitacora, 't'>[] = []
    s.textosEncargo = [`Sube ${banner} como banner del canal en YouTube Studio`]
    const lectura = await ejecutarWeb('web_observar', {}, s)
    const idx = Number(lectura.text.match(/\[(\d+)\] button «Subir»/)![1])
    const r = await ejecutarWeb('web_actuar', { accion: 'archivo', indice: idx, ruta: banner }, s, { paso: p => { pasos.push(p) } })
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/NO aceptó el archivo/)
    expect(pasos).toContainEqual(expect.objectContaining({ accion: 'archivo', resultado: 'fallo', efecto: 'sin_efecto' }))
    expect(s.subidas).toHaveLength(0)
  })

  it('una extensión que no dice si la página aceptó el archivo no da ok: pide recargarla', async () => {
    const { canal } = canalFalso(STUDIO, { aceptado: undefined })
    const s = new SesionWeb(canal)
    s.textosEncargo = [`Sube ${banner} como banner del canal en YouTube Studio`]
    const r = await ejecutarWeb('web_actuar', { accion: 'archivo', ruta: banner }, s)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/recárgala/)
  })

  it('una ruta que el encargo no nombra ni llega a la extensión', async () => {
    const { canal, llamadas } = canalFalso()
    const s = new SesionWeb(canal)
    const pasos: Omit<PasoBitacora, 't'>[] = []
    const r = await ejecutarWeb('web_actuar', { accion: 'archivo', ruta: join(home, 'Developer', 'otro.png'), pedido: `sube ${banner} al banner de YouTube` }, s, { paso: p => { pasos.push(p) } })
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/no aparece/)
    expect(llamadas.some(l => l.metodo === 'archivo')).toBe(false)
    expect(pasos).toContainEqual(expect.objectContaining({ accion: 'archivo', resultado: 'bloqueado' }))
  })

  it('en otro sitio no se sube aunque la ruta esté en el pedido', async () => {
    const { canal, llamadas } = canalFalso('https://subidas.ejemplo-malo.com/upload')
    const s = new SesionWeb(canal)
    const r = await ejecutarWeb('web_actuar', { accion: 'archivo', ruta: banner, pedido: `sube ${banner} al banner de YouTube Studio` }, s)
    expect(r.error).toBe(true)
    expect(llamadas.some(l => l.metodo === 'archivo')).toBe(false)
  })

  it('un clic que hizo que la página pidiera un archivo lo dice y manda a accion «archivo» (el panel de macOS no se abrió)', async () => {
    const { canal } = canalFalso()
    const s = new SesionWeb(canal)
    const lectura = await ejecutarWeb('web_observar', { pedido: `sube ${banner} a YouTube` }, s)
    const idx = Number(lectura.text.match(/\[(\d+)\] button «Subir»/)![1])
    const r = await ejecutarWeb('web_actuar', { accion: 'click', indice: idx }, s)
    expect(r.text).toMatch(/pidió un archivo/)
    expect(r.text).toMatch(/accion «archivo»/)
  })
})

describe('web_verificar · imagenes_subidas: la subida quedó guardada, leída por el src', () => {
  async function subirBanner(op: Parameters<typeof canalFalso>[1]) {
    const { canal } = canalFalso(STUDIO, op)
    const s = new SesionWeb(canal)
    const pasos: Omit<PasoBitacora, 't'>[] = []
    const sink = { paso: (p: Omit<PasoBitacora, 't'>) => { pasos.push(p) } }
    s.textosEncargo = [`Sube ${banner} como banner del canal en YouTube Studio`]
    const lectura = await ejecutarWeb('web_observar', {}, s, sink)
    const idx = Number(lectura.text.match(/\[(\d+)\] button «Subir»/)![1])
    await ejecutarWeb('web_actuar', { accion: 'archivo', indice: idx, ruta: banner }, s, sink)
    const r = await ejecutarWeb('web_verificar', { imagenes_subidas: true }, s, sink)
    return { j: JSON.parse(r.text), pasos }
  }

  it('si la vista previa sigue siendo la de antes (lo que vio la verificación del 6 nov), no cumple y dice qué src hay', async () => {
    const { j, pasos } = await subirBanner({})
    expect(j.cumple).toBe(false)
    expect(j.detalle).toMatch(/banner-levy\.png: NO está/)
    expect(j.detalle).toContain(PLACEHOLDER)
    expect(pasos).toContainEqual(expect.objectContaining({ herramienta: 'web_verificar', accion: 'imagenes', detalle: expect.stringMatching(/^no cumple/) }))
  })

  it('una vista previa local (blob) no es «guardada»: falta Publicar o se recargó antes de terminar', async () => {
    const { j } = await subirBanner({ imagenes: [{ src: 'blob:https://studio.youtube.com/1234', tipo: 'blob', zona: ZONA_BANNER }] })
    expect(j.cumple).toBe(false)
    expect(j.detalle).toMatch(/solo vista previa local/)
  })

  it('una imagen guardada nueva en la zona del banner cumple, con su src', async () => {
    const nueva = 'https://yt3.googleusercontent.com/banner_nuevo_levy'
    const { j, pasos } = await subirBanner({ imagenes: [{ src: nueva, tipo: 'url', zona: ZONA_BANNER }, { src: AVATAR_L, tipo: 'url', zona: 'Tu canal' }] })
    expect(j.cumple).toBe(true)
    expect(j.imagenes.join(' ')).toContain(nueva)
    expect(pasos).toContainEqual(expect.objectContaining({ herramienta: 'web_verificar', accion: 'imagenes', detalle: expect.stringMatching(/^cumple · banner-levy\.png=guardada/) }))
  })

  it('sin subidas en la sesión no cumple (no hay nada que dar por guardado)', async () => {
    const { canal } = canalFalso()
    const s = new SesionWeb(canal)
    const j = JSON.parse((await ejecutarWeb('web_verificar', { imagenes_subidas: true, pestana: 5 }, s)).text)
    expect(j.cumple).toBe(false)
  })

  it('juzgarSubidas: banner y foto por zona; la misma imagen nueva no cuenta para dos archivos', () => {
    const subidas = [
      { nombre: 'levy-banner.jpg', real: '/x/levy-banner.jpg', pestana: 1, zonas: [ZONA_BANNER], antes: [PLACEHOLDER, AVATAR_L] },
      { nombre: 'levy-foto-perfil.png', real: '/x/levy-foto-perfil.png', pestana: 1, zonas: ['Te recomendamos que uses una foto de 98 × 98 píxeles'], antes: [PLACEHOLDER, AVATAR_L] },
    ]
    const soloBanner = juzgarSubidas(subidas, [{ src: 'https://yt3/banner', tipo: 'url', zona: ZONA_BANNER }, { src: AVATAR_L, tipo: 'url', zona: 'Te recomendamos que uses una foto de 98 × 98 píxeles' }])
    expect(soloBanner.estados).toEqual(['guardada', 'sin_cambio'])
    expect(soloBanner.cumple).toBe(false)
    const ambas = juzgarSubidas(subidas, [{ src: 'https://yt3/banner', tipo: 'url', zona: ZONA_BANNER }, { src: 'https://yt3/foto', tipo: 'url', zona: 'Te recomendamos que uses una foto de 98 × 98 píxeles' }])
    expect(ambas).toMatchObject({ cumple: true, estados: ['guardada', 'guardada'] })
    // Sin zona reconocible: toda la página, y una imagen nueva no se reparte entre dos archivos.
    const sinZona = juzgarSubidas(subidas.map(x => ({ ...x, zonas: [] })), [{ src: 'https://yt3/una', tipo: 'url', zona: '' }])
    expect(sinZona.estados).toEqual(['guardada', 'sin_cambio'])
  })

  it('juzgarSubidas: tras recargar, una imagen data: nueva en la zona es la guardada (Studio pinta así el banner)', () => {
    const banner = { nombre: 'levy-banner.jpg', real: '/x/levy-banner.jpg', pestana: 1, zonas: [ZONA_BANNER], antes: [PLACEHOLDER] }
    const vista = [{ src: 'data:2548446:AwBPz', tipo: 'data' as const, zona: ZONA_BANNER }]
    expect(juzgarSubidas([banner], vista).estados).toEqual(['vista_previa'])
    expect(juzgarSubidas([{ ...banner, recargada: true }], vista)).toMatchObject({ cumple: true, estados: ['guardada'] })
    // Recargar no inventa nada: si en la zona sigue la imagen de antes, no está.
    expect(juzgarSubidas([{ ...banner, recargada: true }], [{ src: PLACEHOLDER, tipo: 'url', zona: ZONA_BANNER }]).estados).toEqual(['sin_cambio'])
  })

  it('web_navegar después de subir marca la subida como recargada', async () => {
    const { canal } = canalFalso(STUDIO, { imagenes: [{ src: 'data:99:abc', tipo: 'data', zona: ZONA_BANNER }] })
    const s = new SesionWeb(canal)
    s.textosEncargo = [`Sube ${banner} como banner del canal en YouTube Studio ${STUDIO}`]
    await ejecutarWeb('web_actuar', { accion: 'archivo', ruta: banner, pestana: 5 }, s)
    expect(JSON.parse((await ejecutarWeb('web_verificar', { imagenes_subidas: true, pestana: 5 }, s)).text).cumple).toBe(false)
    await ejecutarWeb('web_navegar', { url: STUDIO, pestana: 5 }, s)
    expect(s.subidas[0].recargada).toBe(true)
    expect(JSON.parse((await ejecutarWeb('web_verificar', { imagenes_subidas: true, pestana: 5 }, s)).text).cumple).toBe(true)
  })

  it('juzgarSubidas: el mismo archivo subido otra vez cuenta como guardado si la página reusa el src que ya se vio guardado', () => {
    const base = { nombre: 'foto.png', real: '/x/foto.png', pestana: 1, zonas: ['Foto'] }
    const primera = { ...base, antes: [AVATAR_L] }
    expect(juzgarSubidas([primera], [{ src: 'https://yt3/foto', tipo: 'url', zona: 'Foto' }]).cumple).toBe(true)
    expect(primera).toMatchObject({ guardadaEn: 'https://yt3/foto' })
    const segunda = { ...base, antes: ['https://yt3/foto'] }
    expect(juzgarSubidas([primera, segunda], [{ src: 'https://yt3/foto', tipo: 'url', zona: 'Foto' }, { src: 'https://yt3/foto', tipo: 'url', zona: 'Foto' }]).estados).toEqual(['guardada', 'guardada'])
    // Sin una verificación previa que la viera guardada, el mismo src de antes NO cuenta.
    expect(juzgarSubidas([{ ...base, antes: ['https://yt3/foto'] }], [{ src: 'https://yt3/foto', tipo: 'url', zona: 'Foto' }]).estados).toEqual(['sin_cambio'])
  })
})

describe('el clic que guarda espera a que la página termine de enviar', () => {
  it('el informe del clic dice cuántas peticiones hubo y avisa si alguna sigue en curso o falló', async () => {
    const { canal } = canalFalso(STUDIO, { guardado: { envios: 3, fallidos: 0, pendientes: 0, ms: 4200 } })
    const s = new SesionWeb(canal)
    const lectura = await ejecutarWeb('web_observar', { pedido: 'publica los cambios del canal en YouTube Studio' }, s)
    const idx = Number(lectura.text.match(/\[(\d+)\] button «Cancelar»/)![1])
    const r = await ejecutarWeb('web_actuar', { accion: 'click', indice: idx }, s)
    expect(r.text).toMatch(/envió 3 peticiones y esperé 4\.2 s/)
    expect(textoGuardado({ envios: 2, fallidos: 1, pendientes: 1, ms: 30000 })).toMatch(/1 falló.*1 sigue en curso: no navegues/)
    expect(textoGuardado({ envios: 0, fallidos: 0, pendientes: 0, ms: 600 })).toBe('')
  })
})

describe('reloj en el marco de la pestaña', () => {
  it('el latido lleva desde cuándo trabaja y el paso actual; un paso nuevo se ve sin esperar el latido', async () => {
    const { canal, llamadas } = canalFalso()
    const s = new SesionWeb(canal)
    const antes = Date.now()
    const m = sostenerMarcoWeb(s)
    await new Promise(r => setTimeout(r, 20))
    const primero = llamadas.find(l => l.metodo === 'marco')!.args
    expect(primero.inicio).toBeGreaterThanOrEqual(antes)
    m.fijarPaso('tocando «Subir»')
    await new Promise(r => setTimeout(r, 20))
    const ultimo = llamadas.filter(l => l.metodo === 'marco').pop()!.args
    expect(ultimo).toMatchObject({ paso: 'tocando «Subir»', inicio: primero.inicio })
    m.parar()
  })
})
