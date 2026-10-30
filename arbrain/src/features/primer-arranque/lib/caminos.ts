/**
 * Los tres caminos para tener tu Arbrain (29 oct 2026, Daniel: «la versión espejo del VPS debería también poder ser una
 * forma de instalación desde el principio… ambos deberían estar», y 08:37: «un paso a paso en el onboarding para cada
 * uno de los tres caminos, con prompts listos para copiar y pegar en Claude Code»).
 *
 * Módulo puro: lo pinta el primer arranque (paso «Dónde vive») y sus prompts son, letra por letra, los de la guía
 * `INSTALAR.md` › «Para la persona» y de `INSTALAR-NUBE.md` (tests/edicion/caminos.test.ts lo comprueba). Si cambias
 * un prompt aquí, cámbialo allá en el mismo commit.
 */
export type Camino = 'computadora' | 'servidor' | 'espejo'

export const GUIA_INSTALAR = 'https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md'
export const GUIA_NUBE = 'https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR-NUBE.md'
/** Lo que la persona cambia en el prompt por la dirección de su servidor. */
export const SERVIDOR_EJEMPLO = 'root@IP-DE-TU-SERVIDOR'

export interface DatosCamino {
  id: Camino
  titulo: string
  resumen: string
  pasos: readonly string[]
  /** Lo que se pega en Claude Code, tal cual. */
  prompt: string
  /** Pedidos para después de instalar, también para pegar en Claude Code. */
  despues: readonly { para: string; prompt: string }[]
}

export const CAMINOS: Record<Camino, DatosCamino> = {
  computadora: {
    id: 'computadora',
    titulo: 'En tu computadora',
    resumen: 'Arbrain vive en tu Mac, Windows o Linux. Levy usa tus apps y la voz de tu sistema; funciona mientras tu computadora esté prendida.',
    pasos: [
      'Abre Claude Code (la app de Claude, pestaña Code) con tu cuenta Pro o Max.',
      'Pega el prompt de abajo y acepta los permisos que te pida.',
      'Espera de 5 a 15 minutos: la app Arbrain se abre sola, ya con tu cuenta.',
    ],
    prompt: `Instala Arbrain siguiendo ${GUIA_INSTALAR}`,
    despues: [{ para: 'Después: tu Arbrain en el teléfono (con tu computadora prendida)', prompt: 'Pon mi cerebro en mi teléfono' }],
  },
  servidor: {
    id: 'servidor',
    titulo: 'Solo en tu servidor (beta)',
    resumen: 'Arbrain vive en un servidor tuyo en la nube, prendido siempre. Entras desde el navegador de cualquier computadora o desde tu teléfono por tu red privada de Tailscale, aunque tu computadora esté apagada.',
    pasos: [
      'Renta un servidor con Ubuntu 24.04 (recomendado: Hostinger KVM 2; revisa el precio el día que compres) y, al crearlo, pega la llave SSH de tu computadora.',
      'Pega el prompt en Claude Code de tu computadora, con la dirección de tu servidor. Si ya tienes Claude Code dentro del servidor, pega ahí solo la primera línea.',
      'Entra a Tailscale con el enlace que te da Claude, con la misma cuenta de tu teléfono.',
      'Abre una terminal una sola vez: entras con tu cuenta de Claude (para el chat), pegas tu llave de OpenRouter con tope (para las rutinas) y recibes tu código para entrar. Nada de eso pasa por el chat.',
      'En tu teléfono o en otra computadora con Tailscale, abre la dirección que termina en .ts.net, escribe el código y agrégala a tu pantalla de inicio.',
    ],
    prompt: `Instala Arbrain solo en mi servidor siguiendo ${GUIA_INSTALAR}\nMi servidor: ${SERVIDOR_EJEMPLO}`,
    despues: [
      { para: 'Después: un código para entrar desde otro dispositivo', prompt: `Dame un código para entrar a mi Arbrain siguiendo ${GUIA_NUBE}\nMi servidor: ${SERVIDOR_EJEMPLO}` },
      { para: 'Después: que el chat use tu cuenta de Claude', prompt: `Conecta mi cuenta de Claude en mi servidor siguiendo ${GUIA_NUBE}\nMi servidor: ${SERVIDOR_EJEMPLO}` },
    ],
  },
  espejo: {
    id: 'espejo',
    titulo: 'Los dos (espejo, beta)',
    resumen: 'Arbrain en tu computadora y en tu servidor, con la misma memoria y el mismo plan por tu GitHub privado. Una sola máquina corre las rutinas: la eliges tú.',
    pasos: [
      'Renta el servidor como en «Solo en tu servidor» (paso 1).',
      'Pega el prompt en Claude Code de tu computadora, con la dirección de tu servidor y la máquina que manda.',
      'Acepta lo que te pida: tu respaldo privado en GitHub, Tailscale y tu llave de OpenRouter con tope.',
      'Listo: tu computadora y tu servidor se ponen al día cada 5 minutos.',
    ],
    prompt: `Instala Arbrain en mi computadora y en mi servidor, en modo espejo, siguiendo ${GUIA_INSTALAR}\nMi servidor: ${SERVIDOR_EJEMPLO}\nQue mande: mi servidor`,
    despues: [],
  },
}

export const ORDEN_CAMINOS: readonly Camino[] = ['computadora', 'servidor', 'espejo']

/** Dónde corre esta instalación: el servidor de la persona (unidad de `nube.sh`) o una computadora. */
export const caminoActual = (enServidor: boolean): Camino => (enServidor ? 'servidor' : 'computadora')
