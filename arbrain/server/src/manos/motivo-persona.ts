/**
 * El motivo del freno, en el idioma de la persona (13 nov 2026, «Arbrain en inglés»). Los motivos de `juzgar()`,
 * `juzgarCliente()` y `juzgarUrl()` se quedan en español donde nacen: el código los compara (`DATO_DE_DINERO`,
 * `categoriaDe`) y el modelo los lee en el detalle del FRENO. Lo que sí ve la persona es el motivo que viaja a su tarjeta
 * (el «motivo que declaró quien la pidió» de la bandeja): ese pasa por aquí justo antes de salir, sin tocar el juicio.
 *
 * Con español devuelve el motivo tal cual. Con inglés busca el motivo en el catálogo (los fijos, marcados con
 * `trMarca` donde nacen) o lo reconoce por su forma y lo arma con `tr()` y sus variables. Quien lee la tarjeta es el
 * dueño: lo que el motivo dice «de la persona» aquí se dice «tu». Lo que no reconoce sale como llegó.
 */
import { idiomaActual, tr, trMarca } from '../i18n/tr.js'

/** Lo que `datoSensible` dice que se escribe (escribir {dato} en un formulario lo transmite). */
function dato(d: string): string {
  const campo = /^campo de (.+)$/s.exec(d)
  return campo ? tr('campo de {pistas}', { pistas: campo[1] }) : tr(d)
}

/** Cómo se acciona un botón en `juzgarBoton` («Enter sobre», o el rol: «button», «menuitem»…). */
const COMO = /^(Espacio sobre|Enter sobre|Enter presiona el botón por defecto|[a-z]+)$/

/** Las señales de `senalExfiltracion` (cliente/url.ts) que no llevan número. */
const SENALES: readonly string[] = [
  trMarca('la URL lleva datos que parecen codificados (base64)'),
  trMarca('la URL lleva datos que parecen codificados (hex)'),
  trMarca('la ruta de la URL lleva datos que parecen codificados'),
  trMarca('la URL lleva usuario o contraseña'),
]

type Regla = [RegExp, (m: RegExpExecArray) => string]

const REGLAS: readonly Regla[] = [
  // juzgar(): pestañas, datos, teclas y botones.
  [/^la ventana (.+) del navegador no la abrieron las manos: son pestañas de .+$/s, m => tr('la ventana {ventana} del navegador no la abrieron las manos: son tus pestañas', { ventana: tr(m[1]) })],
  [/^escribir (.+) en un formulario lo transmite$/s, m => tr('escribir {dato} en un formulario lo transmite', { dato: dato(m[1]) })],
  [/^⌘([A-Z]) esconde la app de .+$/s, m => tr('⌘{tecla} esconde tu app', { tecla: m[1] })],
  [/^⌘([A-Z]) minimiza la ventana de .+$/s, m => tr('⌘{tecla} minimiza tu ventana', { tecla: m[1] })],
  [/^(\S+) sobre un (AX\w+) borra el elemento seleccionado$/, m => tr('{tecla} sobre un {rol} borra el elemento seleccionado', { tecla: m[1], rol: m[2] })],
  [/^(⌘Enter|Enter) en un campo de chat lo envía$/, m => tr('{tecla} en un campo de chat lo envía', { tecla: m[1] })],
  [/^(⌘Enter|Enter) en un campo de mensaje lo envía$/, m => tr('{tecla} en un campo de mensaje lo envía', { tecla: m[1] })],
  [/^el botón de cerrar actuaría sobre una ventana de .+$/s, () => tr('el botón de cerrar actuaría sobre una de tus ventanas')],
  [/^el botón de minimizar actuaría sobre una ventana de .+$/s, () => tr('el botón de minimizar actuaría sobre una de tus ventanas')],
  [/^el botón de tamaño actuaría sobre una ventana de .+$/s, () => tr('el botón de tamaño actuaría sobre una de tus ventanas')],
  [/^botón sin texto cuyo identificador dice «(.*)»$/s, m => tr('botón sin texto cuyo identificador dice «{pista}»', { pista: m[1] })],
  [/^botón sin texto en un diálogo: puede enviar$/, () => tr('botón sin texto en un diálogo: puede enviar')],
  [/^botón sin texto en un chat o compositor: puede enviar$/, () => tr('botón sin texto en un chat o compositor: puede enviar')],
  [/^(.+?) «(.*)» confirma un diálogo que dice «(.*)»$/s, m => COMO.test(m[1]) ? tr('{como} «{etiqueta}» confirma un diálogo que dice «{texto}»', { como: tr(m[1]), etiqueta: m[2], texto: m[3] }) : m[0]],
  [/^(.+?) «(.*)»$/s, m => COMO.test(m[1]) ? tr('{como} «{etiqueta}»', { como: tr(m[1]), etiqueta: m[2] }) : m[0]],
  // juzgarCliente(): abrir o escribir lo que ejecuta.
  [/^abrir «(.*)» desde el Explorador puede ejecutarlo$/s, m => tr('abrir «{elemento}» desde el Explorador puede ejecutarlo', { elemento: tr(m[1]) })],
  [/^abrir «(.*)» desde Finder puede ejecutarlo$/s, m => tr('abrir «{elemento}» desde Finder puede ejecutarlo', { elemento: m[1] })],
  [/^el texto tiene forma de comando \(«(.*)»\): escribirlo puede ser la mitad de ejecutarlo$/s, m => tr('el texto tiene forma de comando («{texto}»): escribirlo puede ser la mitad de ejecutarlo', { texto: m[1] })],
  // juzgarUrl(): acciones por enlace, sitios nuevos y datos que salen en la URL.
  [/^abrir (.+) hace algo \(salir, borrar, pagar, publicar o enviar\)$/s, m => tr('abrir {url} hace algo (salir, borrar, pagar, publicar o enviar)', { url: m[1] })],
  [/^abrir (.+), un sitio que no aprobaste en esta sesión$/s, m => tr('abrir {sitio}, un sitio que no aprobaste en esta sesión', { sitio: m[1] })],
  [/^la URL lleva (\d+) caracteres de ruta y datos hacia (.+)$/s, m => tr('la URL lleva {n} caracteres de ruta y datos hacia {sitio}', { n: m[1], sitio: m[2] })],
  [/^ya van (\d+) caracteres de ruta y datos hacia (.+) en esta sesión$/s, m => tr('ya van {n} caracteres de ruta y datos hacia {sitio} en esta sesión', { n: m[1], sitio: m[2] })],
  [/^la URL lleva (\d+) caracteres de datos en la query hacia (.+)$/s, m => tr('la URL lleva {n} caracteres de datos en la query hacia {sitio}', { n: m[1], sitio: m[2] })],
  [/^la URL lleva (\d+) caracteres de datos en el fragmento hacia (.+)$/s, m => tr('la URL lleva {n} caracteres de datos en el fragmento hacia {sitio}', { n: m[1], sitio: m[2] })],
  [/^(.+) hacia (.+)$/s, m => SENALES.includes(m[1]) ? tr('{senal} hacia {sitio}', { senal: tr(m[1]), sitio: m[2] }) : m[0]],
]

/** El motivo de un freno tal como lo lee la persona en su tarjeta. Puro salvo por el idioma de Ajustes. */
export function motivoParaPersona(motivo: string): string {
  if (idiomaActual() !== 'en') return motivo
  const fijo = tr(motivo)
  if (fijo !== motivo) return fijo
  for (const [re, armar] of REGLAS) {
    const m = re.exec(motivo)
    if (m) return armar(m)
  }
  return motivo
}

/**
 * Lo que la tarjeta de las manos dice que se va a hacer: el motivo y, si se sabe, la app (`freno.ts`, edición cliente).
 * `regla`: por qué pide el clic en Autónomo (R5, R6 o algo que la persona no pidió en el chat).
 */
export function resumenTarjetaManos(motivo: string, op: { regla?: 'pedido' | 'R5' | 'R6' | null; grupo?: string | null; app?: string | null } = {}): string {
  const m = motivoParaPersona(motivo)
  const conRegla = op.regla === 'R5' ? tr('envío a un grupo o lista ({grupo}): {motivo}', { grupo: op.grupo ?? '', motivo: m })
    : op.regla === 'R6' ? tr('destino que no salió de tu mensaje tras leer la pantalla: {motivo}', { motivo: m })
      : op.regla === 'pedido' ? tr('no lo pediste en el chat: {motivo}', { motivo: m })
        : m
  return op.app ? tr('{motivo} en {app}', { motivo: conRegla, app: op.app }) : conRegla
}
