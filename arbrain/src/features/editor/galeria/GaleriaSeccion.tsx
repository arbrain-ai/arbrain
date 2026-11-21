'use client'
/**
 * La galería fuera del editor: sección `/youtube/galeria` (Contenido › Tu canal › Tus videos). `?video=<id>` abre una
 * ficha directo. «Abrir en el editor» avisa al editor si está abierto en otra ventana (evento `editor:abrir` por el
 * canal `arbrain:editor`) y, si nadie lo atiende, se lo pide a Levy en el chat.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { Galeria } from './Galeria'

export function GaleriaSeccion() {
  const video = useSearchParams().get('video')
  const abrir = useCallback((id: string) => {
    const atendido = !window.dispatchEvent(new CustomEvent('editor:abrir', { detail: { id }, cancelable: true }))
    if (atendido) return
    try { const bc = new BroadcastChannel('arbrain:editor'); bc.postMessage({ tipo: 'abrir', id }); bc.close() } catch { /* sin canal */ }
    pedirALevy(`Abre en el editor el video ${id} en la segunda pantalla (lo pedí desde la galería).`)
  }, [])
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}><Galeria onAbrir={abrir} inicial={video} /></div>
}
