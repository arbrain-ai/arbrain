// Arbrain brain mark (monograma RB = dos hemisferios). Usa el LOGO REAL de Daniel
// como máscara CSS: pixel-fiel a su arte (conserva la costura central), y se tiñe con
// el color de texto del sidebar via `currentColor` (gris inactivo, morado activo) —
// igual que los iconos Lucide. Un trace vectorial perdía la costura fina a 15-24px.
export function ArbrainMark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        backgroundColor: 'currentColor',
        WebkitMaskImage: 'url(/brand/arbrain-mark-mask.png)',
        maskImage: 'url(/brand/arbrain-mark-mask.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  )
}
