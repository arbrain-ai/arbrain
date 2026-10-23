'use client'
import { useEffect } from 'react'
import { accionCtrl, cedeAlCampo, EVENTO_SELECTOR_LIENZO, type CampoTexto } from '@/shared/navigation/atajos-ctrl'
import { calendarioEn, cerrarPestanaActiva } from '@/features/cabina/panel/atajos-panel'
import { pedirHabitos } from '@/features/planning/habitos-pedido'

/** ¿Alguna pizarra lo tomó? Primero la que tiene el foco (o la de la sección); si nadie, la del panel que se vea. Se mide por
 *  `defaultPrevented`: la que lo toma llama a `preventDefault`. */
function pedirSelectorLienzo(): boolean {
  for (const detail of [{ alguna: false }, { alguna: true }]) {
    const ev = new CustomEvent(EVENTO_SELECTOR_LIENZO, { cancelable: true, detail })
    window.dispatchEvent(ev)
    if (ev.defaultPrevented) return true
  }
  return false
}

const TIPOS_TEXTO = new Set(['text', 'search', 'url', 'tel', 'password', 'email', ''])

/** El campo de texto con el foco: dónde está el cursor y cuánto texto hay. null si el foco no está escribiendo. */
function campoConFoco(): CampoTexto | null {
  const el = document.activeElement
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TIPOS_TEXTO.has(el.type))) {
    if (el.selectionStart == null) return null
    return { inicio: el.selectionStart, fin: el.selectionEnd ?? el.selectionStart, largo: el.value.length }
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return null
    const r = sel.getRangeAt(0)
    if (!r.collapsed) return { inicio: 0, fin: 1, largo: 1 }
    // Lo que hay antes del cursor (Ctrl+H borra hacia atrás) y lo que queda después hasta el final (Ctrl+D, hacia adelante).
    const antes = document.createRange(), resto = document.createRange()
    antes.selectNodeContents(el)
    antes.setEnd(r.startContainer, r.startOffset)
    resto.selectNodeContents(el)
    resto.setStart(r.endContainer, r.endOffset)
    const inicio = antes.toString().length
    return { inicio, fin: inicio, largo: inicio + resto.toString().length }
  }
  return null
}

/**
 * Ctrl+D/W/M (Calendario en Día, Semana, Mes), Ctrl+H (Hábitos de hoy), Ctrl+Q (cerrar la pestaña activa) y Ctrl+L (selector de lienzos). Reglas en `atajos-ctrl.ts`.
 * En CAPTURA sobre `window` y cortando la propagación: ganan al chat, al panel y al lienzo, que leía Ctrl como ⌘
 * (Ctrl+D duplicaba y Ctrl+X cortaba). `soloCerrar`: una ventana aparte solo atiende Ctrl+Q (el Calendario es del panel).
 */
export function useAtajosCtrl({ soloCerrar = false }: { soloCerrar?: boolean } = {}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const accion = accionCtrl(e)
      if (!accion || (soloCerrar && accion.tipo !== 'cerrar-pestana')) return
      if ((e.target as Element | null)?.closest?.('.xterm')) return
      if (cedeAlCampo(accion, campoConFoco())) return
      // Ctrl+L es del lienzo que esté a la vista: si ninguno lo toma, la tecla no se roba (sigue siendo de quien la tenga).
      if (accion.tipo === 'selector-lienzo' && !pedirSelectorLienzo()) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (accion.tipo === 'calendario') calendarioEn(accion.modo)
      else if (accion.tipo === 'habitos') { calendarioEn('day'); pedirHabitos() }
      else if (accion.tipo === 'cerrar-pestana') cerrarPestanaActiva()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [soloCerrar])
}
