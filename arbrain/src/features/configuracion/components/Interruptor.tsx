'use client'

/**
 * Interruptor accesible (2 oct 2026): `role="switch"` con blanco táctil de 44 px (el trazo visible es de 44x24).
 * Mismo aspecto que el de «Conversaciones de crons» en Ajustes.
 */
export function Interruptor({ activo, onCambio, etiqueta, disabled = false }: { activo: boolean; onCambio: (activo: boolean) => void; etiqueta: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={() => onCambio(!activo)}
      className="group flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand disabled:opacity-40"
    >
      <span className={`relative h-6 w-11 rounded-full border transition-colors ${activo ? 'border-primary/60 bg-primary/80' : 'border-border-subtle bg-card-hover'}`}>
        <span className={`absolute left-0.5 top-0.5 size-[18px] rounded-full bg-foreground/85 transition-transform ${activo ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}
