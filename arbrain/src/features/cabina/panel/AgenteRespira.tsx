/**
 * El agente que respira (28 oct 2026): el ícono de la pestaña Agentes (`Bot`), pequeño, en ámbar claro, que respira
 * mientras trabaja. Solo en los renglones de «Trabajando» del Taller › Agentes (28 oct, Daniel: «lo único que quería de
 * cambio eran los subagentes trabajando»); encabezado, píldora del chat y rastro siguen con el punto morado quieto.
 * `late` = respira (con señal reciente); sin él queda quieto, como el anillo de antes. Respeta reduced-motion.
 */
import { Bot } from 'lucide-react'
import type { CSSProperties } from 'react'
import r from './agente-respira.module.css'

export function AgenteRespira({ tam = 14, late = true }: { tam?: number; late?: boolean }) {
  return <span className={r.agente} style={{ '--tam': `${tam}px` } as CSSProperties} data-late={late || undefined} data-testid="agente-respira" aria-hidden>
    <Bot size={Math.round(tam * 0.86)} strokeWidth={2.25} />
  </span>
}
