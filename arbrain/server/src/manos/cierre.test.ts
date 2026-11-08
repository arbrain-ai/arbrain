/**
 * Cerrar «hecho» exige haber verificado el resultado pedido (6 nov 2026, enc-mw4dqzyo-74eb8d: «banner y foto
 * subidos» sin una sola lectura de las imágenes). Las secuencias son las de la bitácora real.
 */
import { describe, expect, it } from 'vitest'
import { faltaParaHecho } from './cierre.js'

const archivo = (ruta: string) => ({ herramienta: 'web_actuar', accion: 'archivo', resultado: 'ok' as const, efecto: 'confirmado', archivo: ruta })
const clic = { herramienta: 'web_actuar', accion: 'click', resultado: 'ok' as const, efecto: 'sin_verificar' }
const verificaTexto = { herramienta: 'web_verificar', resultado: 'lectura' as const, detalle: 'cumple' }
const navegar = { herramienta: 'web_navegar', accion: 'navegar', resultado: 'ok' as const }
const imagenes = (detalle: string) => ({ herramienta: 'web_verificar', accion: 'imagenes', resultado: 'lectura' as const, detalle })

describe('faltaParaHecho', () => {
  it('la secuencia del 6 nov (subir, Listo, Publicar, verificar solo la descripción) no puede cerrar «hecho»', () => {
    const pasos = [
      { herramienta: 'web_abrir', accion: 'abrir', resultado: 'ok' as const },
      archivo('/Users/usuario/Developer/levy-banner.jpg'), clic, { herramienta: 'web_observar', resultado: 'lectura' as const },
      archivo('/Users/usuario/Developer/levy-foto-perfil.png'), clic, { herramienta: 'web_verificar', resultado: 'lectura' as const, detalle: 'no cumple' },
      { ...clic, accion: 'valor' }, clic, navegar, { ...verificaTexto, detalle: 'no cumple' }, navegar,
      { ...clic, accion: 'escribir' }, clic, navegar, verificaTexto,
    ]
    const f = faltaParaHecho(pasos)
    expect(f).toMatch(/levy-banner\.jpg, levy-foto-perfil\.png/)
    expect(f).toMatch(/imagenes_subidas/)
  })

  it('con la lectura de imágenes que cumple después de Publicar, sí', () => {
    expect(faltaParaHecho([archivo('/x/banner.jpg'), clic, archivo('/x/foto.png'), clic, clic, navegar, imagenes('cumple · banner.jpg=guardada foto.png=guardada')])).toBeNull()
  })

  it('una lectura de imágenes ANTES de Publicar no vale: lo que cuenta es lo que se ve después de la última acción', () => {
    expect(faltaParaHecho([archivo('/x/banner.jpg'), clic, imagenes('cumple · banner.jpg=guardada'), clic, navegar])).toMatch(/no comprobaste/)
  })

  it('una lectura de imágenes que no cumple no vale', () => {
    expect(faltaParaHecho([archivo('/x/banner.jpg'), clic, navegar, imagenes('no cumple · banner.jpg=sin_cambio')])).toMatch(/no comprobaste/)
  })

  it('sin archivos: un clic sin verificar al final pide una lectura; con ella (o efecto confirmado) cierra', () => {
    expect(faltaParaHecho([navegar, clic])).toMatch(/sin verificar/)
    expect(faltaParaHecho([navegar, clic, verificaTexto])).toBeNull()
    expect(faltaParaHecho([{ herramienta: 'actuar', accion: 'escribir', resultado: 'ok', efecto: 'confirmado' }])).toBeNull()
    expect(faltaParaHecho([{ herramienta: 'observar', resultado: 'lectura' }])).toBeNull()
    // Una subida que falló (la página no la aceptó) no exige lectura de imágenes, pero tampoco cuenta como acción hecha.
    expect(faltaParaHecho([{ ...archivo('/x/a.png'), resultado: 'fallo' }, verificaTexto])).toBeNull()
  })
})
