import type { CalendarMode } from '@/features/planning/types'

/**
 * Ctrl + letra en toda la app (5 oct 2026, Daniel): D · W · M llevan al Calendario del panel en Día, Semana y Mes, en hoy; Q cierra la pestaña activa del panel; L abre el selector de lienzos del título. Es Ctrl, no ⌘: en Mac ni Chrome ni el menú de la app de escritorio usan
 * Ctrl con estas letras (sus Cerrar, Salir, Minimizar y Cortar son con ⌘), así que no chocan con nada.
 *
 * Ganan siempre, con dos excepciones a propósito:
 *  · Ctrl+D dentro de un campo de texto, con texto seleccionado o el cursor antes del final: es «borrar hacia adelante» de
 *    macOS y Daniel lo usa al escribir. Con el cursor al final no borra nada, así que ahí el atajo no le quita nada.
 *    Las otras letras no hacen nada en un campo de macOS (Ctrl+A/E/K, los que sí, no son de esta lista).
 *  · Dentro de una terminal (xterm) todas son de la shell: Ctrl+D cierra la sesión, Ctrl+W borra la palabra, Ctrl+M es Enter
 *    y Ctrl+Q es control de flujo. Robárselas rompería la terminal.
 * Lo puro vive aquí para probarlo con `node --test`; el escuchador está en `useAtajosCtrl`.
 */
export type AccionCtrl = { tipo: 'calendario'; modo: CalendarMode } | { tipo: 'cerrar-pestana' } | { tipo: 'selector-lienzo' } | { tipo: 'habitos' }

/** Por `code` (la tecla física), no por `key`: así funciona igual con el teclado en español o en inglés.
 *  Ctrl+X quedó libre (5 oct 2026, 17:51): la vista de 4 días se retiró y Daniel pidió no reasignarla. */
const TECLAS: Record<string, AccionCtrl> = {
  KeyD: { tipo: 'calendario', modo: 'day' },
  KeyW: { tipo: 'calendario', modo: 'week' },
  KeyM: { tipo: 'calendario', modo: 'month' },
  KeyQ: { tipo: 'cerrar-pestana' },
  // 6 oct 2026: saltar de un lienzo a otro desde el mismo lienzo (el selector del título). Sin lienzo a la vista no hace nada.
  KeyL: { tipo: 'selector-lienzo' },
  // 22 oct 2026 (monk mode hasta Monterrey): «Hábitos de hoy» al pie del Día, con el foco listo para 1 · 2 · 3.
  KeyH: { tipo: 'habitos' },
}

/** Evento con que una pizarra a la vista toma Ctrl+L (lo despacha `useAtajosCtrl`). `detail.alguna`: segunda vuelta, cualquier pizarra visible. */
export const EVENTO_SELECTOR_LIENZO = 'lienzo:selector'

export interface TeclaCtrl { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }

/** Solo Ctrl, sin ⌘, ⌥ ni ⇧ (⌘D sigue siendo duplicar en el lienzo y ⌘X cortar). */
export function accionCtrl(e: TeclaCtrl): AccionCtrl | null {
  if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return null
  return TECLAS[e.code] ?? null
}

/** El campo de texto con el foco, reducido a lo que importa: ¿hay algo que Ctrl+D borraría? */
export interface CampoTexto { inicio: number; fin: number; largo: number }

/** ¿La tecla es del campo de texto y no del atajo? Ctrl+D con selección o con texto delante del cursor; Ctrl+H (borrar hacia
 *  atrás en macOS) con selección o con texto detrás del cursor. Con el campo vacío o sin nada que borrar, gana el atajo. */
export function cedeAlCampo(accion: AccionCtrl, campo: CampoTexto | null): boolean {
  if (!campo) return false
  if (accion.tipo === 'habitos') return campo.inicio !== campo.fin || campo.inicio > 0
  if (accion.tipo !== 'calendario' || accion.modo !== 'day') return false
  return campo.inicio !== campo.fin || campo.fin < campo.largo
}

export const ATAJOS_CTRL: { teclas: string[]; accion: string }[] = [
  { teclas: ['Ctrl', 'D'], accion: 'Calendario en Día, hoy (en un campo con texto delante del cursor, borra hacia adelante)' },
  { teclas: ['Ctrl', 'W'], accion: 'Calendario en Semana, la de hoy' },
  { teclas: ['Ctrl', 'M'], accion: 'Calendario en Mes, el de hoy' },
  { teclas: ['Ctrl', 'Q'], accion: 'Cerrar la pestaña activa del panel' },
  { teclas: ['Ctrl', 'L'], accion: 'Lienzo: cambiar de lienzo desde el mismo lienzo (recientes arriba; flechas y Enter)' },
  { teclas: ['Ctrl', 'H'], accion: 'Hábitos de hoy: el Día del panel con el foco en las casillas; luego 1 · 2 · 3 marcan (en un campo con texto detrás del cursor, borra hacia atrás)' },
]
