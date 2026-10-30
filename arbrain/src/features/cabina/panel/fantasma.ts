'use client'
/**
 * El fantasma que cruza monitores (5 oct 2026). Daniel: «arrastrarla y ver la animación entera desde que
 * arrastro el componente hasta que lo pego en la pestaña del segundo monitor».
 *
 * Antes el fantasma era un elemento de la página de origen: al salir el cursor de esa ventana desaparecía.
 * Ahora, en la app de escritorio que lo trae (`ventanas_pestanas` ≥ 3), una ventana nativa sin bordes,
 * transparente, siempre encima y sin ratón (ventanas.rs, `fantasma`) sigue al cursor por toda la pantalla.
 * La ventana de origen la mueve: mientras el botón sigue apretado recibe el arrastre aunque el cursor esté
 * sobre otro monitor, con el punto de pantalla. Lo que pinta (la ventana nueva translúcida o solo la
 * pestaña) va por el canal (VentanaFantasma.tsx lo escucha).
 *
 * Como Chrome: fuera de toda ventana se ve la ventana que nacería, con la vista viva; sobre otra ventana
 * Arbrain se reduce a la pestaña y esa tira le abre hueco; al soltar ahí, aterriza en el hueco y se
 * desvanece; soltada en el vacío, la ventana real nace donde estaba el fantasma y este se apaga.
 */
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { esquinaDelFantasma, interpolar, MARGEN_FANTASMA, suavizar, type EstadoFantasma, type ModoFantasma, type Punto } from './arrastre-geom'
import { publicar, useVentanas } from './ventanas'

/** Cuánto dura el aterrizaje en el hueco de otra tira, y el desvanecido al nacer la ventana real. */
export const ATERRIZAJE_MS = 200
export const DESVANECER_MS = 160

/**
 * La app rechazó el comando (9 oct 2026). Del 5 al 9 oct `fantasma` no estaba concedido en el ACL (la UI es un origen
 * remoto para Tauri, permissions/local-first.toml): cada llamada fallaba en silencio, la página escondía su fantasma al
 * salir el cursor y Daniel no veía nada en el otro monitor. Ahora un rechazo se anota y el arrastre se queda con el
 * fantasma de la página, como antes de existir el nativo.
 */
let rechazado = false
const rechazo = (e: unknown) => {
  if (!rechazado) console.warn('[fantasma] la app rechazó el fantasma nativo; sigue el de la página', e)
  rechazado = true
}

/** ¿La app instalada trae el fantasma nativo y lo deja usar? (Antes de reinstalar, el arrastre sigue como antes.) */
export const hayFantasma = () => isDesktopRuntime() && useVentanas.getState().protocolo >= 3 && !rechazado

async function invocar(accion: string, args: Record<string, number> = {}) {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('fantasma', { accion, ...args })
}

/** Lo crea oculto la primera vez (al apretar una pestaña), para que al arrastrar ya esté cargado. */
export function prepararFantasma() {
  if (hayFantasma()) void invocar('preparar').catch(rechazo)
}

export interface Fantasma {
  /** Cada movimiento: dónde está el cursor (pantalla) y qué se ve (null = nada). */
  seguir: (cursor: Punto, modo: ModoFantasma | null) => void
  /** Soltada sobre otra tira: la pestaña viaja `desplazamiento` px hasta su hueco y el fantasma se va. */
  aterrizar: (desplazamiento: Punto) => Promise<void>
  /** Nació la ventana real (o no hay dónde aterrizar): se desvanece en su lugar. */
  desvanecer: () => Promise<void>
  /** Reordenar o cancelar: se va de inmediato. */
  quitar: () => void
}

/**
 * Un arrastre. `agarre`: dónde se tomó la pestaña, en px de pantalla desde su esquina; `tamano`: la ventana
 * que nacería al soltarla en el vacío (la de origen, como Chrome).
 */
export function fantasmaDelArrastre(clave: string, agarre: Punto, tamano: { ancho: number; alto: number }): Fantasma {
  const estado: EstadoFantasma = { clave, modo: null, agarre, ancho: tamano.ancho, alto: tamano.alto }
  const ventana = { ancho: tamano.ancho + 2 * MARGEN_FANTASMA, alto: tamano.alto + 2 * MARGEN_FANTASMA }
  let esquina: Punto | null = null
  let mostrado = false, cuadro = 0, vivo = true
  const decir = () => publicar({ tipo: 'fantasma', estado: { ...estado } })

  // Un movimiento por cuadro: el último punto gana (pointermove llega más rápido que lo que conviene mover una ventana).
  const enviar = () => {
    cuadro = 0
    if (!vivo || !esquina || !estado.modo) return
    if (mostrado) void invocar('mover', { x: esquina.x, y: esquina.y }).catch(() => {})
    else { mostrado = true; void invocar('mostrar', { x: esquina.x, y: esquina.y, ancho: ventana.ancho, alto: ventana.alto }).catch(rechazo) }
  }
  const ocultar = () => {
    if (cuadro) { cancelAnimationFrame(cuadro); cuadro = 0 }
    if (mostrado) { mostrado = false; void invocar('ocultar').catch(() => {}) }
  }
  const apagar = () => {
    if (!vivo) return
    vivo = false
    if (estado.modo) { estado.modo = null; decir() }
    ocultar()
  }

  return {
    seguir(cursor, modo) {
      if (!vivo) return
      if (modo !== estado.modo) { estado.modo = modo; decir() }
      if (!modo) { ocultar(); return }
      esquina = esquinaDelFantasma(cursor)
      if (!cuadro) cuadro = requestAnimationFrame(enviar)
    },
    aterrizar(desplazamiento) {
      if (!vivo || !mostrado || !esquina) { apagar(); return Promise.resolve() }
      if (cuadro) { cancelAnimationFrame(cuadro); cuadro = 0 }
      if (estado.modo !== 'pestana') { estado.modo = 'pestana'; decir() }
      const desde = esquina, hasta = { x: desde.x + desplazamiento.x, y: desde.y + desplazamiento.y }
      const t0 = performance.now()
      return new Promise<void>(listo => {
        const paso = (t: number) => {
          const k = suavizar((t - t0) / ATERRIZAJE_MS)
          const p = interpolar(desde, hasta, k)
          void invocar('mover', { x: p.x, y: p.y }).catch(() => {})
          if (k < 1) requestAnimationFrame(paso)
          else listo()
        }
        requestAnimationFrame(paso)
      }).then(() => apagar())
    },
    desvanecer() {
      if (!vivo) return Promise.resolve()
      if (cuadro) { cancelAnimationFrame(cuadro); cuadro = 0 }
      // La página apaga el marco con su transición; luego la ventana se retira.
      if (estado.modo) { estado.modo = null; decir() }
      return new Promise<void>(listo => setTimeout(() => { vivo = false; ocultar(); listo() }, DESVANECER_MS))
    },
    quitar: apagar,
  }
}
