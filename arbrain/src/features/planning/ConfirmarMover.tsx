'use client'
import { useEffect, useRef } from 'react'
import { Users } from 'lucide-react'
import styles from './planning.module.css'
import { tr } from '@/shared/i18n'

/**
 * La guarda de invitados al soltar (11 nov 2026, arrastre-dia.ts › `guardaInvitados`): el aviso del calendario con dos salidas.
 * «Mover» escribe por la misma pluma; «Dejarlo» (o Esc) no escribe nada y el evento sigue a su hora. Nunca `window.confirm`
 * (en el webview de la app no existe). El foco cae en «Dejarlo»: un Enter de más no mueve una llamada con otras personas.
 */
export function ConfirmarMover({ texto, onMover, onDejar }: { texto: string; onMover: () => void; onDejar: () => void }) {
  const dejar = useRef<HTMLButtonElement>(null)
  const onDejarRef = useRef(onDejar); onDejarRef.current = onDejar
  useEffect(() => {
    dejar.current?.focus({ preventScroll: true })
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDejarRef.current() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [])
  return <div className={styles.notice} role="alertdialog" aria-label={tr('Mover un evento con invitados')} data-hoja-ignora data-confirmar-mover
    style={{ width: 'min(560px, calc(100% - 32px))', alignItems: 'center', cursor: 'default', lineHeight: 1.4 }}>
    <Users size={14} aria-hidden style={{ flex: 'none' }} /> <span>{texto}</span>
    <button className={styles.noticeUndo} style={{ flex: 'none' }} onClick={onMover}>{tr('Mover')}</button>
    <button ref={dejar} className={styles.noticeUndo} style={{ flex: 'none' }} onClick={onDejar}>{tr('Dejarlo')}</button>
  </div>
}
