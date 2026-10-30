// Maqueta mínima de una tira de pestañas (la principal o una ventana aparte) con la lógica REAL de arrastre.ts,
// ventanas.ts, fijadas.ts y pestanas-fuera.ts. Solo el pintado es de mentira (sin React).
import { arrastrarPestana } from '../../../src/features/cabina/panel/arrastre'
import { atenderVentana, seguirLlegadas, useHueco, useVentanas } from '../../../src/features/cabina/panel/ventanas'
import { fijarFuenteGeometria } from '../../../src/features/cabina/panel/geometria-ventana'
import { clavesDe, usePanelFijadas } from '../../../src/features/cabina/panel/fijadas'
import { indiceEnOrden, pestanaActiva, tiraDe, TALLER } from '../../../src/features/cabina/panel/pestanas-fuera'

const NOMBRES: Record<string, string> = { tareas: 'Tareas', taller: 'Taller', 'vista-1': 'Agenda', 'vista-2': 'Documento' }

export function montar(ventana: string, panel: HTMLElement) {
  const w = window as unknown as Record<string, unknown>
  // En la app de escritorio la mide Tauri (ventanas.ts); aquí, el Chrome real que se esconde tras wkwebview.ts.
  fijarFuenteGeometria(async () => (w.__geomReal as () => never)())
  const nav = panel.querySelector<HTMLElement>('[data-tira]')!, fuera = panel.querySelector<HTMLElement>('#fuera-de-tira')!
  const clics: string[] = []
  w.__clics = clics
  const boton = (c: string) => {
    const span = document.createElement('span')
    span.dataset.clave = c
    if (usePanelFijadas.getState().ancladas.includes(c)) span.dataset.anclada = ''
    const b = document.createElement('button')
    b.textContent = NOMBRES[c] ?? c
    b.onclick = () => { clics.push(c); usePanelFijadas.getState().activar(c) }
    b.onpointerdown = e => arrastrarPestana(e as never, c, 'fantasma', {
      ventana, alReordenar: i => { const st = usePanelFijadas.getState(); st.reordenar(c, indiceEnOrden(st.orden, tira().filter(x => x !== TALLER), c, i)) },
    })
    span.append(b)
    return span
  }
  const tira = () => tiraDe(clavesDe(usePanelFijadas.getState()), usePanelFijadas.getState().enVentana, ventana)
  function pintar() {
    const t = tira()
    nav.replaceChildren(...t.filter(c => c !== TALLER).map(boton))
    fuera.replaceChildren(...t.filter(c => c === TALLER).map(boton))
  }
  w.__estado = () => {
    const st = usePanelFijadas.getState()
    return {
      tabs: tira(), orden: st.orden, enVentana: st.enVentana, ancladas: st.ancladas, activa: pestanaActiva(st.activa, tira()), error: useVentanas.getState().error,
      hueco: useHueco.getState().clave ? useHueco.getState().indice : null,
      ventana: (w.__geomReal as () => unknown)(),
    }
  }
  usePanelFijadas.subscribe(pintar)
  atenderVentana(); seguirLlegadas()
  pintar()
  return pintar
}
