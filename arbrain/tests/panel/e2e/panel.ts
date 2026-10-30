// Ventana aparte de la prueba (/panel?ventana=N): su propia tira, con la lógica REAL.
import './wkwebview'
import { vidaDeVentana } from '../../../src/features/cabina/panel/ventanas'
import { soyVentana, usePanelFijadas } from '../../../src/features/cabina/panel/fijadas'
import { ventanaDeParametro } from '../../../src/features/cabina/panel/pestanas-fuera'
import { montar } from './maqueta'

const w = window as unknown as Record<string, unknown>
const id = ventanaDeParametro(new URLSearchParams(location.search).get('ventana'))!
soyVentana(id)
usePanelFijadas.getState().cargar()
montar(id, document.querySelector<HTMLElement>('[data-panel-derecho]')!)
vidaDeVentana(id)
w.__store = usePanelFijadas
w.__listo = true
