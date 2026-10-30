import type { CSSProperties } from 'react'
import type { Theme } from '../../theme/tokens'

/** Los colores de la lista de lienzos (`--lz-*`) a partir del tema del lienzo: el riel y el selector del título se visten igual. */
export function varsDeTema(t: Theme): CSSProperties {
  const oscuro = t.name === 'oscuro'
  return {
    '--lz-borde': t.roles.card.stroke.color, '--lz-texto': t.text.body, '--lz-quieto': t.text.caption,
    '--lz-suave': oscuro ? 'rgba(255,255,255,.07)' : 'rgba(15,15,25,.05)',
    '--lz-acento': t.accent, '--lz-acento-suave': oscuro ? 'rgba(169,92,255,.18)' : 'rgba(140,39,241,.10)',
    '--lz-riesgo': t.roles.risk.stroke.color, '--lz-menu': t.roles.card.fill, '--lz-fondo': t.canvas,
    '--lz-fuente': 'CanvasSans, system-ui',
  } as CSSProperties
}
