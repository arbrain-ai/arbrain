import type { ReactNode } from 'react'

/**
 * Marco único de las dos barras de audio del chat (GlobalAudioBar y ChatSpeechBar).
 *
 * 1 oct 2026 · Daniel: «me gustaba más como lucía anteriormente, bien centrada… los botones
 * bien centrados y un poquito más grandes». El 30 sep (bd29a747) las barras pasaron de dos
 * renglones (progreso arriba, controles centrados abajo) a uno solo con todo apilado a la
 * izquierda y la ✕ pegada al borde derecho: ahorraba alto pero rompía la simetría.
 *
 * Ahora sigue siendo UN renglón (no se roba alto a la conversación) pero en tres carriles
 * iguales: contador a la izquierda · controles con el ▶ en el CENTRO del hilo · ✕ a la
 * derecha. Los carriles laterales miden lo mismo (1fr), así la ✕ y el contador no desplazan
 * el eje. El progreso es una línea fina a todo el ancho en el borde inferior (como el
 * renglón de arriba del diseño anterior, pero sin gastar un renglón). Vive en un solo
 * archivo para que las dos barras no vuelvan a divergir.
 */

// Blancos táctiles ≥44 px en teléfono (w-11 / h-11) y un poco menos en escritorio, ambos
// más grandes que antes (play 36→44/48, saltos ~28→40/44). `sm:` = 640 px, el corte del chat.
// El play no lleva shadow-depth-*: su halo de 42 px ensucia el texto bajo la barra.
export const BTN_SALTO =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-card-hover hover:text-foreground/75 sm:h-10 sm:w-10'

export const BTN_PLAY =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand-ink ring-1 ring-inset ring-brand/30 transition-colors hover:bg-brand/30 sm:h-11 sm:w-11'

// Ancho fijo (= el hueco espejo del marco, w-14): «1x» y «1.75x» no deben mover el centro
// de los controles al ciclar la velocidad.
export const BTN_VELOCIDAD =
  'flex h-11 w-14 shrink-0 items-center justify-center gap-0.5 rounded-full text-[11px] font-medium tabular-nums transition-colors hover:bg-card-hover sm:h-9'

export const BTN_CERRAR =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-card-hover hover:text-red-400/70 sm:h-10 sm:w-10'

export const TXT_CONTADOR = 'text-[11px] font-mono text-muted tabular-nums whitespace-nowrap'

export function AudioBarFrame({
  izquierda,
  velocidad,
  controles,
  derecha,
  progreso,
  aviso,
}: {
  /** Contador (párrafo n/N o tiempo). */
  izquierda: ReactNode
  /** Botón de velocidad: queda a la izquierda de los saltos. */
  velocidad: ReactNode
  /** Anterior · play/pausa · siguiente: el play cae exactamente en el eje del hilo. */
  controles: ReactNode
  /** ✕ cerrar. */
  derecha: ReactNode
  /** Línea de progreso, posicionada absoluta en el borde inferior de la barra. */
  progreso: ReactNode
  aviso?: ReactNode
}) {
  return (
    <div
      data-tts-barra
      className="relative shrink-0 border-b border-border-subtle bg-card/40 backdrop-blur-sm"
      style={{ animation: 'audioBarIn 200ms ease-out' }}
    >
      {/* Carriles laterales 1fr iguales: el centro queda en el eje del hilo pase lo que pase
          con el contador o la ✕. pb mayor que pt porque la línea de progreso ocupa el borde
          inferior. `z-10` en los carriles con botones: la zona de arrastre de la línea
          (GlobalAudioBar) se superpone a su padding y no debe tapar los botones. */}
      <div className="chat-prose grid grid-cols-[1fr_auto_1fr] items-center px-3 pb-2.5 pt-1.5">
        <div className="flex min-w-0 items-center justify-start pl-1">{izquierda}</div>
        {/* El hueco `w-14` a la derecha mide lo que el botón de velocidad: así ▶ queda en el
            eje exacto y ⏮/⏭ simétricos (sin él, la velocidad lo corría ~30 px a la derecha). */}
        <div className="relative z-10 flex items-center gap-1">
          {velocidad}
          {controles}
          <span aria-hidden className="w-14 shrink-0" />
        </div>
        <div className="relative z-10 flex min-w-0 items-center justify-end">{derecha}</div>
      </div>

      {progreso}
      {aviso}
    </div>
  )
}
