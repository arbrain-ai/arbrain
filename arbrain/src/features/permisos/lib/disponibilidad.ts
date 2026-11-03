/**
 * Computer use en la edición cliente, por sistema (0.1.2, 17 oct 2026; revierte DECISIONES #11 con su red team:
 * docs/builds/alumno-0.1.2-computer-use-2026-10-17). La v1 (0.1.0/0.1.1) salió sin computer use; desde la 0.1.2 el
 * alumno lo tiene en macOS (ArbrainManos) y en Windows, y no en Linux. Misma regla que el servidor de manos
 * (`arbrain/server/src/manos/politica.ts › computerUseDisponible`). Nace APAGADO en cada apertura de la app: el
 * daemon no lo enciende al arrancar; la persona lo enciende en Ajustes (o en el primer arranque) y lo irreversible
 * siempre pide su clic. La instalación original no cambia.
 *
 * Modo servidor (1 nov 2026; docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md): en un servidor Linux donde root
 * instaló la pantalla virtual (`nube.sh pantalla`, marcador /etc/arbrain/pantalla-virtual.json) computer use SÍ existe:
 * Levy trabaja en esa pantalla y la persona la mira en vivo en `/pantalla`. Linux sin ese marcador, como antes.
 *
 * Módulo puro (sin node:*, sin React): lo usan la ruta `/api/manos/interruptor`, el primer arranque, Ajustes y las
 * pruebas. La plataforma y si hay pantalla virtual los pasa quien llama (en el servidor, `plataformaServidor()` y
 * `pantallaVirtualServidor()` de `pantalla-server.ts`).
 */

/** Sistemas donde la edición cliente trae computer use (valores de `process.platform`). */
export const PLATAFORMAS_COMPUTER_USE: ReadonlyArray<string> = ['darwin', 'win32']

/** ¿Esta instalación ofrece computer use? Original: siempre. Cliente: en macOS y Windows, y en Linux con pantalla virtual. */
export function computerUseDisponible(cliente: boolean, plataforma: string, pantallaVirtual = false): boolean {
  return !cliente || PLATAFORMAS_COMPUTER_USE.includes(plataforma) || (plataforma === 'linux' && pantallaVirtual)
}

/** Marcador que deja el instalador de la pantalla virtual (de root). Mismo que `server/src/manos/adaptadores/linux.ts`. */
export function rutaMarcadorPantalla(env: Record<string, string | undefined>): string {
  return env.ARBRAIN_PANTALLA_MARCADOR?.trim() || '/etc/arbrain/pantalla-virtual.json'
}

/**
 * Plataforma del servidor web (la misma máquina que el daemon y las manos). `ARBRAIN_PLATAFORMA_PRUEBA` existe solo
 * para las pruebas, igual que en el servidor de manos.
 */
export function plataformaServidor(env: Record<string, string | undefined>, plataforma: string): string {
  return env.ARBRAIN_PLATAFORMA_PRUEBA?.trim() || plataforma
}

/** Lo que ve la persona en Linux sin pantalla virtual, donde estaba el interruptor. */
export const COMPUTER_USE_NO_DISPONIBLE =
  'Computer use (que Levy use tu pantalla, haga clic y escriba en tus apps) no está disponible en Linux: Arbrain lo trae ' +
  'en macOS y Windows. En Linux Levy trabaja con tus archivos, tus comandos y en el chat. Si este Linux es tu servidor, ' +
  'instala su pantalla virtual con «nube.sh pantalla» y Levy podrá usar un navegador ahí.'

/** Error de la API si alguien intenta encenderlo donde no existe. */
export const COMPUTER_USE_NO_INCLUIDO = 'Computer use no está disponible en Linux: Arbrain lo trae en macOS y Windows.'

/**
 * Explicación junto al interruptor y en el primer arranque de la edición cliente. Nombra lo que el alumno necesita
 * saber antes de encenderlo: qué hace, que se apaga en cada apertura, que lo irreversible pide su clic y qué permisos
 * pide su sistema.
 */
export function explicacionComputerUse(plataforma: string, autonomo = false): string {
  const permisos = plataforma === 'darwin'
    ? 'La primera vez, macOS te pide dos permisos para «ArbrainManos»: Accesibilidad y Grabación de pantalla.'
    : plataforma === 'win32'
      ? 'En Windows no hay permisos extra que dar.'
      : plataforma === 'linux'
        ? 'Tú la ves en vivo, solo por tu red privada, en «Ver la pantalla de tu servidor».'
        : ''
  return [
    plataforma === 'linux'
      ? 'Deja que Levy use la pantalla virtual de tu servidor: abre sitios en su propio Chrome, los lee y llena formularios con tu compu apagada.'
      : 'Deja que Levy mire tu pantalla, haga clic y escriba en tus apps, sin mover tu ratón ni tu teclado.',
    autonomo
      ? 'En modo Autónomo queda como lo dejes entre aperturas; en los demás niveles se apaga cada vez que cierras Arbrain.'
      : 'Viene apagado y se apaga cada vez que cierras Arbrain: lo enciendes en cada apertura, cuando lo necesites.',
    autonomo
      ? 'Hace lo que le pediste en el chat sin pedirte clic; lo que no pediste te lo enseña antes. Nunca con tu banco, pagos, impuestos ni cripto.'
      : 'Antes de enviar, pagar, borrar o publicar se detiene y te pide tu clic. No lo uses con tu banco, pagos, impuestos ni cripto.',
    permisos,
  ].filter(Boolean).join(' ')
}

/**
 * Decisión de la ruta en cliente SIN computer use (Linux) ante `POST { encendido }`. Encender: 403 siempre. Apagar:
 * se acepta (dirección segura) y el estado sigue siendo apagado. Lo demás: 400.
 */
export function decisionInterruptorCliente(encendido: unknown): { status: 200 | 400 | 403; error?: string } {
  if (typeof encendido !== 'boolean') return { status: 400, error: 'encendido debe ser true o false' }
  if (encendido) return { status: 403, error: COMPUTER_USE_NO_INCLUIDO }
  return { status: 200 }
}

/** Estado fijo que la web reporta en cliente donde no hay computer use (Linux): apagado, no disponible. */
export const ESTADO_CLIENTE_SIN_COMPUTER_USE = { edicion: 'cliente', encendido: false, decidido: true, disponible: false } as const
