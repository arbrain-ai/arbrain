// Ventana principal de la prueba: el panel derecho de mentira con la lógica REAL.
import './wkwebview'
import { coordinarPrincipal, medirVentanas } from '../../../src/features/cabina/panel/ventanas'
import { elegirVentana } from '../../../src/features/cabina/panel/destino-levy'
import { usePanelFijadas } from '../../../src/features/cabina/panel/fijadas'
import { PRINCIPAL } from '../../../src/features/cabina/panel/pestanas-fuera'
import { montar } from './maqueta'

const w = window as unknown as Record<string, unknown>
usePanelFijadas.getState().cargar()
if (!usePanelFijadas.getState().fijadas.length) {
  usePanelFijadas.getState().fijar('vista-1', { vista: 'calendario' } as never, false)
  usePanelFijadas.getState().fijar('vista-2', { vista: 'documento', ruta: 'a.md' } as never, false)
}
montar(PRINCIPAL, document.querySelector<HTMLElement>('[data-panel-derecho]')!)
coordinarPrincipal()
w.__store = usePanelFijadas
// «Dónde abre Levy» (7 oct 2026): lo mismo que hace bus.ts → resolverDestino, sin React ni el resto de la app.
w.__destino = async (donde: 'izquierda' | 'derecha' | 'principal') => { const medidas = await medirVentanas(); return { medidas, ventana: elegirVentana(donde, medidas) } }
w.__fijarLevy = (id: string, ventana: string) => usePanelFijadas.getState().fijar(id, { vista: 'documento', ruta: `${id}.md` } as never, true, { deLevy: true, ventana })
w.__listo = true
