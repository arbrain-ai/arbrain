'use client'

import { Clock, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/shared/contexts/theme-context'

const iconByTheme = {
  dark: Moon,
  light: Sun,
  auto: Clock,
}

const labelByTheme = {
  dark: 'Oscuro',
  light: 'Claro',
  auto: 'Automático por hora',
}

export function ThemeToggle({ compact = false, binary = false, ghost = false }: { compact?: boolean; binary?: boolean; ghost?: boolean }) {
  const { theme, resolvedTheme, cycleTheme, toggleTheme } = useTheme()
  // En modo binario el boton refleja el tema RESUELTO (dark/light) y alterna entre
  // ambos — identico al atajo Cmd+Option+T. En modo ciclo muestra los 3 estados.
  const displayKey = binary ? resolvedTheme : theme
  const Icon = iconByTheme[displayKey]
  const label = labelByTheme[displayKey]

  return (
    <button
      type="button"
      onClick={binary ? toggleTheme : cycleTheme}
      className={compact ? `${ghost ? 'icon-btn-ghost' : 'icon-btn'} size-9` : 'nav-item w-full'}
      title={binary ? `Tema: ${label} · T / ⌘⌥T` : `Tema: ${label} (${labelByTheme[resolvedTheme]}) · toca para cambiar`}
      aria-label={`Tema: ${label}`}
    >
      <Icon className="size-[18px] md:size-[15px]" />
      {!compact && <span>{label}</span>}
    </button>
  )
}
