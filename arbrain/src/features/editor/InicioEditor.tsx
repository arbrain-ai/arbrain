'use client'
/**
 * El inicio del editor es la Galería de `editor-galeria` (`./galeria`, contrato `<Galeria onAbrir={id => …} />`).
 * Un proyecto del motor (`m/prj_…`) se abre aquí mismo; una carpeta del pipeline o un video del canal todavía no tiene
 * proyecto en el motor: se le pide a Levy por el chat que lo cree desde la toma (la ingesta es de la ola 2).
 */
import { Galeria } from './galeria'
import { enviarAlChat } from './al-chat'
import { proyectoDeVideo } from './AtiendeEditor'
import s from './editor.module.css'

export function InicioEditor({ onAbrir, alAviso }: { onAbrir: (id: string) => void; alAviso?: (texto: string) => void }) {
  return <div className={s.galeria} data-testid="inicio-editor">
    <Galeria onAbrir={id => {
      const p = proyectoDeVideo(id)
      if (p) { onAbrir(p); return }
      void enviarAlChat(`Abre en el editor el video ${id}: crea su proyecto en el motor desde su toma.`)
        .then(via => alAviso?.(via === 'chat' ? 'Ese video aún no está en el motor: se lo pedí a Levy en el chat' : 'Abriendo el chat para pedírselo a Levy'))
    }} />
  </div>
}
