'use client'
/**
 * `/artefacto?v=…` (14 oct 2026): una pieza sola con su enlace propio, como los artefactos de Claude. La vista viva (lienzo,
 * documento, video, calendario, salud…) a pantalla completa, leída de su fuente con la sesión de Daniel; no toca el panel.
 * Arriba, su nombre y dos acciones: llevarla al panel (como pestaña, en todos sus aparatos) y compartir el enlace.
 */
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Link2, PanelRight } from 'lucide-react'
import { titulo } from '../Cabina'
import { IconoVista } from './Secciones'
import { VistaFijada } from './PanelDerecho'
import { enlaceTelefono, leerVista } from './artefacto-enlace'
import s from './artefacto.module.css'

export function Artefacto() {
  const params = useSearchParams()
  const router = useRouter()
  const crudo = params.get('v')
  const input = useMemo(() => leerVista(crudo), [crudo])
  const [copiado, setCopiado] = useState(false)
  // Una pestaña de mentira (no vive en el panel): misma vista y mismo cuerpo que una pestaña de verdad.
  const f = useMemo(() => input ? { id: 'artefacto', input, en: 0 } : null, [input])
  if (!input || !f) return <main className={s.error}><h1>Este enlace no abre ninguna vista</h1><p>Pídele a Levy que te lo mande otra vez.</p></main>
  const compartir = async () => {
    const url = window.location.href
    try {
      if (navigator.share) { await navigator.share({ title: titulo(input), url }); return }
      await navigator.clipboard.writeText(url)
      setCopiado(true); setTimeout(() => setCopiado(false), 1600)
    } catch { /* cancelado */ }
  }
  return <div className={s.pagina}>
    <header className={s.barra}>
      <span className={s.icono}><IconoVista vista={input.vista} size={15} /></span>
      <h1 className={s.titulo}>{titulo(input)}</h1>
      <button className={s.accion} onClick={() => router.push(enlaceTelefono(input))} title="Abrirla como pestaña en tu panel (en todos tus aparatos)">
        <PanelRight size={16} aria-hidden /><span>Al panel</span>
      </button>
      <button className={s.accion} onClick={() => void compartir()} title="Copiar el enlace (solo abre con tu sesión)" aria-label="Compartir el enlace">
        {copiado ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
      </button>
    </header>
    <div className={s.cuerpo}><VistaFijada f={f} /></div>
  </div>
}
