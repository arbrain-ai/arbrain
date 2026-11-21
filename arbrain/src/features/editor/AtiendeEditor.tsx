'use client'
/**
 * Lo que la ventana principal atiende del editor (19 nov 2026), montado en el armazón de la app:
 * - ⌘⌥E (Ctrl+Alt+E fuera de Mac) abre el editor en la otra pantalla; se compara `e.code`: en macOS ⌥E es tecla muerta.
 * - «Abrir en el editor» de la galería (`/youtube/galeria`, evento `editor:abrir`): un proyecto del motor (`m/prj_…`) se
 *   abre directo en la ventana del editor. Lo demás (una carpeta o un video del canal sin proyecto) lo deja pasar: la
 *   galería se lo pide a Levy, que crea el proyecto desde la toma.
 */
import { useEffect } from 'react'
import { abrirEditor } from './ventana'

export const proyectoDeVideo = (id: string) => (/^m\/prj_[A-Za-z0-9]+$/.test(id) ? id.slice(2) : null)

export function AtiendeEditor() {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.code === 'KeyE' && (e.metaKey || e.ctrlKey) && e.altKey && !e.repeat) { e.preventDefault(); void abrirEditor() } }
    const abrir = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id
      const p = id ? proyectoDeVideo(id) : null
      if (!p) return
      e.preventDefault()
      void abrirEditor(p)
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('editor:abrir', abrir)
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('editor:abrir', abrir) }
  }, [])
  return null
}
