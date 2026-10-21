interface Props {
  date: Date
}

function getLabel(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = Math.floor((today.getTime() - target.getTime()) / 86_400_000)

  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff < 7) {
    return target.toLocaleDateString('es-MX', { weekday: 'long' })
  }
  return target.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
  })
}

export function DateSeparator({ date }: Props) {
  return (
    <div aria-hidden className="flex items-center justify-center py-2 select-none">
      <span className="px-3 py-1 rounded-lg bg-card-hover text-[11px] text-muted font-medium">
        {getLabel(date)}
      </span>
    </div>
  )
}
