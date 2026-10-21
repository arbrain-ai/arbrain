/**
 * Freno de las herramientas de lienzo que no pasaban por ninguno (seguridad, 10 oct 2026; AUDITORIA riesgo 5 e I7):
 * `pegar`, `portapapeles`, `rueda`, `pasar_encima`, `grabar` y `clic_xy` sin elemento de accesibilidad debajo.
 *
 * Juicio puro (sin tocar nada). Lo irreversible necesita la cita textual de la persona (`confirmacionValida`, que en
 * la edición cliente exige que la cita salga de lo que escribió de verdad). En la instalación de Daniel el juicio se
 * anota en la bitácora como «sombra» y no detiene nada: su operación de hoy no cambia.
 */
import { existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { resolve, sep } from 'node:path'
import { APPS_CHAT, confirmacionValida, datoSensible, type Juicio } from '../freno.js'
import type { ContextoAccion } from '../contrato.js'
import { DIR_ARBRAIN } from '../../edicion.js'

/** Terminales: pegar ahí (sobre todo con salto de línea) ejecuta comandos en la Mac de la persona. */
export const APPS_TERMINAL = new Set([
  'com.apple.terminal', 'com.googlecode.iterm2', 'dev.warp.warp-stable', 'com.mitchellh.ghostty', 'net.kovidgoyal.kitty',
  'org.alacritty', 'io.alacritty', 'com.github.wez.wezterm', 'co.zeit.hyper', 'com.raggesilver.blackbox',
  'terminal', 'iterm', 'iterm2', 'warp', 'ghostty', 'kitty', 'alacritty', 'wezterm', 'hyper',
])

export function esTerminal(c: Pick<ContextoAccion, 'app' | 'bundle'>): boolean {
  return [c.app, c.bundle].some(x => typeof x === 'string' && APPS_TERMINAL.has(x.toLowerCase()))
}

const enChatApp = (c: Pick<ContextoAccion, 'app' | 'bundle'>) => [c.app, c.bundle].some(x => typeof x === 'string' && APPS_CHAT.has(x.toLowerCase()))

/** Carpetas donde `grabar` puede escribir (ArbrainManos borra la ruta antes de grabar: nunca un archivo ajeno). */
export function rutaGrabacionSegura(ruta: unknown): { ok: boolean; motivo?: string } {
  if (ruta == null || ruta === '') return { ok: true }
  if (typeof ruta !== 'string') return { ok: false, motivo: 'ruta inválida' }
  const abs = resolve(ruta.replace(/^~(?=\/|$)/, homedir()))
  const permitidas = [resolve(tmpdir()), '/tmp', '/private/tmp', resolve(DIR_ARBRAIN(), 'manos', 'grabaciones'), resolve(homedir(), 'Movies', 'Arbrain')]
  if (!permitidas.some(d => abs === d || abs.startsWith(d + sep))) return { ok: false, motivo: `grabar solo escribe en ${permitidas[3]}, ~/Movies/Arbrain o la carpeta temporal` }
  if (!/\.(mp4|mov)$/i.test(abs)) return { ok: false, motivo: 'grabar solo crea archivos .mp4 o .mov' }
  if (existsSync(abs)) return { ok: false, motivo: 'la ruta ya existe y grabar la borraría' }
  return { ok: true }
}

const PASA = (motivo: string): Juicio => ({ irreversible: false, motivo })

/**
 * ¿Este gesto de lienzo es irreversible o invasivo? `ctx`: lo que hay en el destino (app y, si se pudo leer, el
 * elemento bajo el punto). `hayElemento`: si `clic_xy` encontró un elemento de accesibilidad (ese ya lo juzga `frenar`).
 */
export function juzgarLienzo(nombre: string, a: any, ctx: ContextoAccion, op: { hayElemento?: boolean } = {}): Juicio & { duro?: boolean } {
  switch (nombre) {
    case 'pegar': {
      const texto = typeof a?.texto === 'string' ? a.texto : ''
      if (esTerminal(ctx)) return { irreversible: true, categoria: 'enviar', motivo: 'pegar en una terminal puede ejecutar un comando en esta Mac' }
      const sensible = texto ? datoSensible(texto, ctx) : undefined
      if (sensible) return { irreversible: true, categoria: 'transmitir_datos', motivo: `pegar ${sensible} lo transmite` }
      if (/[\r\n]\s*$/.test(texto) && (enChatApp(ctx) || ctx.dentro_de?.includes('web'))) return { irreversible: true, categoria: 'enviar', motivo: 'el texto pegado termina en salto de línea en un chat o una página: lo envía' }
      return PASA('pegar deja el contenido escrito sin enviarlo')
    }
    case 'portapapeles':
      // Lo que la persona copió puede ser una contraseña o un dato de un tercero: leerlo es privado.
      if (a?.accion === 'leer') return { irreversible: true, categoria: 'transmitir_datos', motivo: 'leer el portapapeles de la persona (puede tener contraseñas o datos de terceros)' }
      return PASA(`portapapeles ${a?.accion ?? ''}: se guarda y se puede restaurar`)
    case 'grabar': {
      if (a?.accion !== 'iniciar') return PASA(`grabar ${a?.accion ?? ''}`)
      const ruta = rutaGrabacionSegura(a?.ruta)
      if (!ruta.ok) return { irreversible: true, categoria: 'borrar', motivo: ruta.motivo!, duro: true }
      return { irreversible: true, categoria: 'transmitir_datos', motivo: 'grabar en video una ventana de la persona' }
    }
    case 'clic_xy':
      if (a?.solo_mirar || op.hayElemento) return PASA('clic_xy con elemento: lo juzga el freno de siempre')
      return { irreversible: true, categoria: 'boton_sin_texto', motivo: `clic a ciegas en (${a?.x},${a?.y}): no hay elemento de accesibilidad que diga qué hace` }
    case 'rueda':
      return PASA('desplazar no cambia nada')
    case 'pasar_encima':
      return PASA('pasar el puntero encima no cambia nada')
    default:
      return PASA('sin juicio')
  }
}

/** ¿La cita deja pasar este juicio? Los bloqueos duros (borrar un archivo ajeno) no se desbloquean con nada. */
export function pasaLienzo(j: Juicio & { duro?: boolean }, confirmacion: unknown): boolean {
  if (!j.irreversible) return true
  if (j.duro) return false
  return typeof confirmacion === 'string' && confirmacionValida(confirmacion)
}
