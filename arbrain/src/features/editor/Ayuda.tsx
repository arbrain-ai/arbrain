'use client'
/** El panel de atajos (?): los de la sala vieja del dueño, más los de la tarjeta de revisión (que manda mientras está abierta). */
import s from './editor.module.css'

export const ATAJOS: [string, string][] = [
  ['Espacio', 'Reproducir / pausar (el video suena ya cortado)'],
  ['S', 'Partir la pieza de la cámara en el playhead'],
  ['A', 'Recortar a la izquierda: quita desde el inicio de la pieza hasta el playhead'],
  ['D', 'Recortar a la derecha: quita desde el playhead hasta el final de la pieza'],
  ['Q / E', 'Seleccionar todas las piezas a la izquierda / derecha del playhead'],
  ['Supr', 'Quitar las piezas seleccionadas'],
  ['M', 'Marcador con nota (se guarda en el motor)'],
  ['C', 'Comentario para Levy: viaja al chat con el instante'],
  ['↑ / ↓', 'Pieza siguiente / anterior (como CapCut)'],
  ['← / →', 'Un cuadro (⇧ diez), saltando lo cortado'],
  ['⌥← / ⌥→', 'Mover el clip seleccionado (gráfico, subtítulo…) un cuadro (⇧ diez)'],
  [', / .', 'Más lento / más rápido'],
  ['V', 'Vista compuesta (todas las pistas, como el export) o la toma cruda (para revisar cortes)'],
  ['Arrastrar el rojo', 'Mover un borde del corte: hacia adentro devuelve material, hacia afuera corta más (avisa si cae dentro de una palabra)'],
  ['A / D con un clip elegido', 'Recortan ese clip (gráfico, subtítulo, música) hasta el playhead'],
  ['F', 'Pantalla completa'],
  ['⌘Z / ⇧⌘Z', 'Deshacer / rehacer (vuelve a la versión anterior del motor)'],
  ['⌘⌥G', 'Galería'],
  ['⌘⌥E', 'Desde el chat: abrir el editor en la otra pantalla'],
  ['?', 'Este panel'],
]

export const ATAJOS_TARJETA: [string, string][] = [
  ['A', 'Aprobar: hacer el corte'],
  ['K', 'Mantener: el material se queda'],
  ['S', 'Saltar a la siguiente sin decidir'],
  ['R', 'Revisar: escribirle al agente qué cambiar'],
  ['\\', 'Antes / después: escuchar con o sin lo cortado'],
  ['↑ / ↓', 'Llamada anterior / siguiente'],
  ['Esc', 'Cerrar la tarjeta (S, A y D vuelven a ser herramientas)'],
]

export function Ayuda({ alCerrar }: { alCerrar: () => void }) {
  return <div className={s.ayuda} role="dialog" aria-label="Atajos del editor">
    <h2>Atajos</h2>
    <table><tbody>{ATAJOS.map(([k, d]) => <tr key={k}><td><span className={s.kbd}>{k}</span></td><td>{d}</td></tr>)}</tbody></table>
    <h2 style={{ marginTop: 16 }}>Con una llamada abierta (la tarjeta manda)</h2>
    <table><tbody>{ATAJOS_TARJETA.map(([k, d]) => <tr key={k}><td><span className={s.kbd}>{k}</span></td><td>{d}</td></tr>)}</tbody></table>
    <p>Rueda: desplazar la línea de tiempo · ⌘ + rueda o pellizco: zoom anclado al cursor · clic en lo rojo: escuchar lo que se quitó.</p>
    <button className={s.boton} onClick={alCerrar}>Cerrar (Esc)</button>
  </div>
}
