/**
 * Cerrar «hecho» exige haber verificado el resultado pedido (6 nov 2026, canal «Levy Arbrain»). El encargo
 * enc-mw4dqzyo-74eb8d cerró «hecho» con banner y foto «subidos»: comprobó la descripción en la página pública y nunca
 * miró las imágenes, que no se habían guardado. La regla estaba en el prompt («si no lo comprobaste, es fallo») y el
 * modelo la saltó; ahora la cumple el código, leyendo la bitácora del encargo:
 *
 *   1. Cada archivo subido necesita una lectura de imágenes que cumpla (web_verificar `imagenes_subidas`) DESPUÉS de la
 *      subida y de la última acción (Publicar o Guardar pueden fallar: lo que vale es lo que se ve tras ellos).
 *   2. Si la última acción quedó sin verificar (un clic en la web), tiene que haber una lectura después.
 */
import type { PasoBitacora } from './bitacora.js'

type Paso = Pick<PasoBitacora, 'herramienta' | 'accion' | 'resultado' | 'efecto' | 'detalle' | 'archivo'>

const ACCIONES = new Set(['actuar', 'web_actuar', 'clic_xy', 'pegar', 'trazar', 'rueda'])
const LECTURAS = new Set(['observar', 'web_observar', 'verificar', 'web_verificar', 'leer_ajuste', 'web_navegar', 'web_abrir'])

const esAccion = (p: Paso) => ACCIONES.has(p.herramienta) && p.resultado === 'ok'
const esSubida = (p: Paso) => p.herramienta === 'web_actuar' && p.accion === 'archivo' && p.resultado === 'ok'
const esLectura = (p: Paso) => LECTURAS.has(p.herramienta) && (p.resultado === 'lectura' || p.resultado === 'ok')
const esLecturaImagenes = (p: Paso) => p.herramienta === 'web_verificar' && p.accion === 'imagenes' && /^cumple\b/.test(p.detalle ?? '')

/** Qué falta verificar para poder cerrar «hecho» (null = nada). */
export function faltaParaHecho(pasos: Paso[]): string | null {
  const ultimaAccion = pasos.reduce((k, p, i) => (esAccion(p) ? i : k), -1)
  const subidas = pasos.map((p, i) => ({ p, i })).filter(x => esSubida(x.p))
  if (subidas.length) {
    const ultimaSubida = subidas[subidas.length - 1].i
    const desde = Math.max(ultimaAccion, ultimaSubida)
    if (!pasos.slice(desde + 1).some(esLecturaImagenes)) {
      const nombres = [...new Set(subidas.map(x => (x.p.archivo ?? '').split('/').pop()).filter(Boolean))].join(', ')
      return `subiste ${nombres || 'archivos'} y no comprobaste que quedaron guardados después de tu última acción: recarga la página (web_navegar a la misma URL) y llama a web_verificar con imagenes_subidas: true; cierra «hecho» solo si cumple (si no, repite la subida o cierra con fallo diciendo qué se ve)`
    }
  }
  if (ultimaAccion >= 0 && pasos[ultimaAccion].efecto !== 'confirmado' && !pasos.slice(ultimaAccion + 1).some(esLectura)) {
    return 'tu última acción quedó sin verificar: lee el resultado (web_verificar, web_observar u observar) y pon esa evidencia en terminar'
  }
  return null
}
