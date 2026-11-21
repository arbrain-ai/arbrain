'use client'
/**
 * La pestaña «Editor» del panel (19 nov 2026). El editor no se pinta aquí: vive a pantalla completa en el otro monitor.
 * Al aparecer la pestaña (Levy la muestra, o el dueño la abre) se abre esa ventana una vez por sesión y proyecto; después,
 * el botón la trae al frente.
 */
import { useEffect, useState } from 'react'
import { Film } from 'lucide-react'
import { abrirEditor } from './ventana'

export function VistaEditor({ proyecto }: { proyecto?: string }) {
  const [donde, setDonde] = useState<'ventana' | 'pestana' | null>(null)
  useEffect(() => {
    const clave = `arbrain.editor.abierto:${proyecto ?? 'galeria'}`
    try { if (sessionStorage.getItem(clave)) return; sessionStorage.setItem(clave, '1') } catch { /* sin almacenamiento */ }
    void abrirEditor(proyecto).then(setDonde)
  }, [proyecto])
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, alignItems: 'flex-start' }}>
    <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}><Film size={16} aria-hidden />Editor de video</p>
    <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
      {donde === 'ventana' ? 'Abierto a pantalla completa en tu otra pantalla.' : 'El editor se abre a pantalla completa en tu otra pantalla; el chat se queda aquí.'}
    </p>
    <button type="button" onClick={() => void abrirEditor(proyecto).then(setDonde)}
      style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--brand)', color: '#fff', fontWeight: 600 }}>
      Abrir el editor
    </button>
  </div>
}
