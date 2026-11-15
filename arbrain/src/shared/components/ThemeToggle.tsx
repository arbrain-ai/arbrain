'use client'

import { Clock, Moon, Sparkles, Sun } from 'lucide-react'
import { useTheme } from '@/shared/contexts/theme-context'
import { tr, trMarca } from '@/shared/i18n'

const iconByTheme = {
  dark: Moon,
  light: Sun,
  auto: Clock,
}

const labelByTheme = {
  dark: trMarca('Oscuro'),
  light: trMarca('Claro'),
  auto: trMarca('Automático por hora'),
}

export function ThemeToggle({ compact = false, binary = false, ghost = false }: { compact?: boolean; binary?: boolean; ghost?: boolean }) {
  const { theme, resolvedTheme, cycleTheme, toggleTheme } = useTheme()
  // En modo binario el boton refleja el tema RESUELTO (dark/light) y alterna entre
  // ambos — identico al atajo Cmd+Option+T. En modo ciclo muestra los 3 estados.
  const displayKey = binary ? resolvedTheme : theme
  const Icon = iconByTheme[displayKey]
  const label = tr(labelByTheme[displayKey])

  return (
    <button
      type="button"
      onClick={binary ? toggleTheme : cycleTheme}
      className={compact ? `${ghost ? 'icon-btn-ghost' : 'icon-btn'} size-9` : 'nav-item w-full'}
      title={binary ? tr('Tema: {tema} · T / ⌘⌥T', { tema: label }) : tr('Tema: {tema} ({resuelto}) · toca para cambiar', { tema: label, resuelto: tr(labelByTheme[resolvedTheme]) })}
      aria-label={tr('Tema: {tema}', { tema: label })}
    >
      <Icon className="size-[18px] md:size-[15px]" />
      {!compact && <span>{label}</span>}
    </button>
  )
}

/** Estilo de la interfaz (27 oct 2026): el de hoy o el lenguaje unificado. También con ⇧T. */
export function EstiloToggle() {
  const { estilo, toggleEstilo } = useTheme()
  const unificado = estilo === 'unificado'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={unificado}
      onClick={toggleEstilo}
      className="nav-item w-full"
      title={tr('Estilo de la interfaz · ⇧T')}
    >
      <Sparkles className="size-[18px] md:size-[15px]" />
      <span>{unificado ? tr('Unificado') : tr('Actual')}</span>
    </button>
  )
}
