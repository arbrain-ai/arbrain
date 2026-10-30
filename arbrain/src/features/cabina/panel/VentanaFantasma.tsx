'use client'
/**
 * La ventana fantasma (5 oct 2026): `/panel/fantasma`, cargada una sola vez en la ventana nativa sin bordes,
 * transparente y siempre encima que la app mueve con el cursor mientras se arrastra una pestaña (fantasma.ts,
 * ventanas.rs). No es una ventana del panel: no conteste blancos ni tiene vida propia; solo pinta lo que le
 * manda la ventana de donde sale la pestaña.
 *
 * Modo 'ventana': la ventana que nacería al soltar, translúcida, con su barra, su tira y la vista VIVA
 * (Calendario, Tareas, un documento…). Modo 'pestana': solo la pestaña, bajo el cursor, para dejarla en la
 * tira de otra ventana. Entre uno y otro, la pestaña se desliza entre su lugar en la cabecera y el cursor.
 */
import { useEffect, useState } from 'react'
import { pestanaEnFantasma, MARGEN_FANTASMA, BARRA_TITULO, ALTO_CABECERA, type EstadoFantasma } from './arrastre-geom'
import { soyVentana, usePanelFijadas } from './fijadas'
import { escuchar } from './ventanas'
import { CuerpoDelFantasma, PestanaDelFantasma } from './PanelDerecho'
import s from './panel.module.css'

export function FantasmaPanel() {
  soyVentana('fantasma')
  const cargar = usePanelFijadas(st => st.cargar)
  const [e, setE] = useState<EstadoFantasma | null>(null)
  useEffect(() => {
    cargar()
    // La ventana es transparente: solo se ve lo que se pinta aquí.
    for (const el of [document.documentElement, document.body]) { el.style.background = 'transparent'; el.style.overflow = 'hidden' }
    return escuchar(m => { if (m.tipo === 'fantasma') setE(m.estado) })
  }, [cargar])
  if (!e) return null
  const p = pestanaEnFantasma(e)
  return <div className={s.fantasmaRaiz} data-modo={e.modo ?? 'nada'} aria-hidden>
    <div className={s.fantasmaMarco} style={{ left: MARGEN_FANTASMA, top: MARGEN_FANTASMA, width: e.ancho, height: e.alto }}>
      <div className={s.fantasmaBarra} style={{ height: BARRA_TITULO }}><i /><i /><i /></div>
      <div className={s.fantasmaCabecera} style={{ height: ALTO_CABECERA }} />
      {/* La vista viva, sin ratón ni foco: es solo un reflejo de lo que se lleva. */}
      <div className={s.fantasmaCuerpo} inert><CuerpoDelFantasma key={e.clave} clave={e.clave} /></div>
    </div>
    <div className={s.fantasmaPestana} style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}><PestanaDelFantasma clave={e.clave} /></div>
  </div>
}
