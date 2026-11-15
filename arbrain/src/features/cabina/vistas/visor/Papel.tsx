'use client'
/**
 * Papel del lector (14 nov 2026): claro (fiel al documento), sepia (cálido para leer largo) y noche (invertido, para leer a
 * oscuras sin que la página encandile). Lo comparten el PDF y el Word, y se recuerda en este dispositivo.
 */
import { useSyncExternalStore } from 'react'
import { Moon, Sun, Sunset } from 'lucide-react'
import { tr } from '@/shared/i18n'

export type Papel = 'claro' | 'sepia' | 'noche'
const LLAVE = 'arbrain-papel'
const EVENTO = 'arbrain-papel'
const PAPELES: Papel[] = ['claro', 'sepia', 'noche']

function leer(): Papel {
  try { const v = window.localStorage.getItem(LLAVE); return PAPELES.includes(v as Papel) ? v as Papel : 'claro' } catch { return 'claro' }
}
function suscribir(fn: () => void) {
  const al = (e: Event) => { if (e instanceof StorageEvent && e.key !== LLAVE) return; fn() }
  window.addEventListener('storage', al); window.addEventListener(EVENTO, al)
  return () => { window.removeEventListener('storage', al); window.removeEventListener(EVENTO, al) }
}
export function usePapel(): [Papel, (p: Papel) => void] {
  const papel = useSyncExternalStore(suscribir, leer, () => 'claro' as Papel)
  const poner = (p: Papel) => { try { window.localStorage.setItem(LLAVE, p) } catch { /* modo privado */ } window.dispatchEvent(new Event(EVENTO)) }
  return [papel, poner]
}

const ICONO = { claro: Sun, sepia: Sunset, noche: Moon }
const NOMBRE = { claro: 'Papel claro', sepia: 'Papel sepia', noche: 'Papel de noche' }

/** Tres botones juntos; la luz marca el elegido. */
export function SelectorPapel({ papel, alCambiar, className }: { papel: Papel; alCambiar: (p: Papel) => void; className?: string }) {
  return <div className={className} role="radiogroup" aria-label={tr('Papel')} data-papel={papel}>
    {PAPELES.map(p => { const I = ICONO[p]; return <button key={p} type="button" role="radio" aria-checked={papel === p} onClick={() => alCambiar(p)} title={tr(NOMBRE[p])} aria-label={tr(NOMBRE[p])}><I size={13} aria-hidden /></button> })}
  </div>
}
