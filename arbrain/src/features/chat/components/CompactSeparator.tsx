import { Layers } from 'lucide-react'

interface Props {
  tokensBefore?: number
  tokensAfter?: number
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n)
}

export function CompactSeparator({ tokensBefore, tokensAfter }: Props) {
  const label =
    tokensBefore && tokensAfter
      ? `Contexto comprimido: ${fmt(tokensBefore)} → ${fmt(tokensAfter)} tokens`
      : 'Contexto comprimido'

  return (
    <div aria-hidden className="flex items-center gap-2 py-1 select-none">
      <div className="flex-1 h-px bg-violet-500/10" />
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/[0.07] border border-violet-500/[0.12]">
        <Layers size={10} className="text-violet-400/50" />
        <span className="text-[10px] text-violet-300/50 font-medium">{label}</span>
      </div>
      <div className="flex-1 h-px bg-violet-500/10" />
    </div>
  )
}
