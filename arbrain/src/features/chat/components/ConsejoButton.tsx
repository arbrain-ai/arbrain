'use client'
import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import styles from './consejo-button.module.css'

/** Shared entry: navigation stays immediate; the destination carries the light sweep. */
export function ConsejoButton({ active = false, onActivate }: { active?: boolean; onActivate?: () => void }) {
  const [pulse, setPulse] = useState(active ? 1 : 0)
  const navigation = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (navigation.current) clearTimeout(navigation.current) }, [])
  const activate = () => {
    setPulse(n => n + 1)
    if (navigation.current) clearTimeout(navigation.current)
    // On phones the drawer closes on navigation. Let the pressed bezel register first.
    const showPress = !active && window.matchMedia('(max-width: 767px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (showPress) navigation.current = setTimeout(() => onActivate?.(), 400)
    else onActivate?.()
  }
  return <button type="button" className={styles.button} aria-current={active ? 'page' : undefined}
    onClick={activate} title="Claude principal + OpenAI .gz">
    <span className={styles.icon} aria-hidden><Sparkles size={16}/></span>
    <span className={styles.name}>Consejo</span>
    <span className={styles.providers}>Claude + OpenAI</span>
    {pulse > 0 && <span key={pulse} aria-hidden className={styles.sweep}/>}
  </button>
}
