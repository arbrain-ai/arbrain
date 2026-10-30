/**
 * Servicios del Studio en palabras de dueño (5 oct 2026, Daniel: «con falla, siempre arriba y explicada en español llano;
 * corriendo, agrupados por área con nombres humanos»). Puro: el nombre y el área salen del label de launchd, y la
 * explicación de una falla, de su código de salida, de la última línea de su log y de si su app hermana sí corre.
 *
 * El caso que lo motivó: `com.arbrain.neewerbridge` salía con 1 cada 3 min. No estaba caído: el LaunchAgent corre
 * `open -a NeewerBridge.app` y la app (`application.com.arbrain.neewerbridge.*`, el puente de la luz en :8085) ya
 * estaba abierta; `open` espera la respuesta de una app que no contesta eventos (error -1712) y sale con 1.
 */
export type AreaServicio = 'Casa' | 'Voz' | 'Salud' | 'Arbrain' | 'Levy' | 'Túneles' | 'Datos' | 'Manos' | 'Apps'
export const AREAS: AreaServicio[] = ['Levy', 'Arbrain', 'Casa', 'Voz', 'Salud', 'Túneles', 'Datos', 'Manos', 'Apps']

const FICHA: Record<string, [string, AreaServicio]> = {
  'com.claudeclaw.app': ['Servidor de Levy', 'Levy'],
  'com.claudeclaw.now-snapshot': ['Agenda de ahora (now.md)', 'Levy'],
  'com.levy.remote-control': ['Control remoto de Claude', 'Levy'],
  'com.claudeclaw.auto-deploy': ['Despliegue automático', 'Arbrain'],
  'com.levy.arbrain-web': ['Arbrain web', 'Arbrain'],
  'com.levy.arbrain-web-deploy': ['Despliegue de Arbrain web', 'Arbrain'],
  'com.levy.arbrain-web-vigia': ['Vigía de Arbrain web', 'Arbrain'],
  'com.arbrain.motor': ['Motor de terminales', 'Arbrain'],
  'com.claudeclaw.software-sync': ['Sincronización de apps', 'Arbrain'],
  'com.claudeclaw.sync-bajada': ['Sincronización entre máquinas', 'Arbrain'],
  'com.claudeclaw.sistema-janitor': ['Limpieza del sistema', 'Arbrain'],
  'com.claudeclaw.cortesia-cpu': ['Cortesía de CPU', 'Arbrain'],
  'com.claudeclaw.sfterm-aviso': ['Aviso de SFTerm', 'Arbrain'],
  'com.arbrain.panel': ['Panel de la Casa', 'Casa'],
  'com.arbrain.neewerbridge': ['Luz Neewer (lanzador)', 'Casa'],
  'com.arbrain.wiz': ['Focos WiZ', 'Casa'],
  'com.arbrain.shure': ['Micrófono Shure', 'Casa'],
  'com.arbrain.pixoo': ['Pantalla Pixoo', 'Casa'],
  'com.arbrain.shelly': ['Enchufes Shelly', 'Casa'],
  'com.levy.obs-vigia': ['Vigía de OBS', 'Casa'],
  'com.claudeclaw.voz-agentes': ['Voz de los agentes', 'Voz'],
  'com.claudeclaw.video-agente-pausa': ['Pausa de videos del agente', 'Manos'],
  'com.claudeclaw.health-receiver': ['Receptor del reloj', 'Salud'],
  'com.claudeclaw.health-ingest': ['Ingesta de Salud', 'Salud'],
  'com.claudeclaw.health-sentinel': ['Vigía de Salud', 'Salud'],
  'com.claudeclaw.ngrok': ['Túnel ngrok', 'Túneles'],
  'com.claudeclaw.cloudflared': ['Túnel Cloudflare', 'Túneles'],
  'com.claudeclaw.tunnel-sync': ['Sincronización de túneles', 'Túneles'],
  'com.claudeclaw.primary-url-sync': ['URL pública de Levy', 'Túneles'],
  'com.levy.mc-sql-gateway': ['Puerta SQL de Mission Control', 'Datos'],
  'com.levy.mc-backup': ['Respaldo de Mission Control', 'Datos'],
  'com.levy.mc-watchdog': ['Vigía de Mission Control', 'Datos'],
  'com.arbrain.ht-backup': ['Respaldo del HT', 'Datos'],
  'com.arbrain.ht-watch': ['Vigía del HT', 'Datos'],
  'com.arbrain.ht-agenda-confirmar': ['Confirmación de llamadas del HT', 'Datos'],
  'com.arbrain.ht-agenda-huecos': ['Huecos de la agenda del HT', 'Datos'],
  'com.arbrain.ht-agenda-recordatorios': ['Recordatorios de llamadas del HT', 'Datos'],
  'com.arbrain.ht-diagnostico-confirmar': ['Confirmación de diagnósticos del HT', 'Datos'],
  'com.arbrain.ht-diagnostico-huecos': ['Huecos de diagnóstico del HT', 'Datos'],
  'com.arbrain.ht-diagnostico-recordatorios': ['Recordatorios de diagnósticos del HT', 'Datos'],
  'com.saasfactory.sfremote': ['SF Remote', 'Apps'],
  'so.saasfactory.sfkeys': ['SF Keys', 'Apps'],
}

/** Labels del negocio que el Taller muestra. */
export const ES_DEL_NEGOCIO = /^(com\.(claudeclaw|levy|arbrain|saasfactory)|so\.saasfactory)\./

/** Nombre y área. Sin ficha: el label sin prefijo, con mayúscula, en Arbrain (el área por defecto del Studio). */
export function ficha(label: string): { nombre: string; area: AreaServicio } {
  const f = FICHA[label]
  if (f) return { nombre: f[0], area: f[1] }
  const n = label.replace(ES_DEL_NEGOCIO, '').replace(/[-_.]/g, ' ')
  return { nombre: n.charAt(0).toUpperCase() + n.slice(1), area: 'Arbrain' }
}

const CODIGO: Record<number, string> = {
  1: 'Terminó con un error.',
  2: 'Lo llamaron mal: un argumento o archivo de configuración no es el que espera.',
  78: 'Su configuración no es válida.',
  126: 'El programa existe pero no tiene permiso para ejecutarse.',
  127: 'No encuentra el programa que tiene que correr (la ruta cambió o no está instalado).',
  137: 'Lo cerraron a la fuerza (se quedó sin memoria o alguien lo mató).',
}
const SENAL: Record<number, string> = { 9: 'Lo cerraron a la fuerza.', 15: 'Lo detuvieron con la señal de apagado.', 6: 'Se cayó por un error interno.', 11: 'Se cayó por un error de memoria.' }

/** Lo que dice la última línea del log, traducido cuando es un error conocido de macOS. */
const PISTAS: [RegExp, string][] = [
  [/-1712\b/, 'macOS esperó respuesta de la app y no llegó a tiempo (error -1712).'],
  [/-10810\b/, 'macOS no pudo abrir la app (error -10810).'],
  [/EADDRINUSE|address already in use/i, 'Su puerto ya lo usa otro proceso.'],
  [/ENOENT|No such file/i, 'Falta un archivo o carpeta que necesita.'],
  [/EACCES|Permission denied|Operation not permitted/i, 'macOS le negó un permiso.'],
  [/ModuleNotFoundError|Cannot find module/i, 'Le falta una dependencia instalada.'],
  [/ECONNREFUSED/i, 'Lo que necesita para trabajar no está encendido.'],
]

export interface Explicacion { explicacion: string; /** «La app sí corre»: la falla no la apaga. */ menor?: boolean }

/**
 * Por qué falla, en una o dos frases. `hermana` = pid de su `application.<id>.*` corriendo (la app que el label abre).
 * `ultimaLinea` = la última línea de su log de errores (ya tachada).
 */
export function explicar(label: string, codigo: number | null, o: { hermana?: number | null; ultimaLinea?: string | null; abreApp?: boolean } = {}): Explicacion {
  const pista = o.ultimaLinea ? PISTAS.find(([re]) => re.test(o.ultimaLinea!))?.[1] : undefined
  if (o.hermana && o.abreApp) {
    return { menor: true, explicacion: `No está caído: la app ya está abierta y trabaja (pid ${o.hermana}). Lo que falla es el lanzador que intenta reabrirla cada pocos minutos${pista ? `: ${pista.charAt(0).toLowerCase()}${pista.slice(1)}` : '.'} Se arregla haciendo que solo la abra si está cerrada.` }
  }
  const base = codigo == null ? 'Se detuvo.' : codigo < 0 ? (SENAL[-codigo] ?? `Lo detuvo la señal ${-codigo}.`) : (CODIGO[codigo] ?? `Terminó con el código ${codigo}.`)
  return { explicacion: pista ? `${base} ${pista}` : base }
}
