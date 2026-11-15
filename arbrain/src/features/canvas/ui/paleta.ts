/**
 * Canvas v4 — la paleta de la mano.
 *
 * DOS DECISIONES QUE NO SON COSMETICAS:
 *
 * 1. La primera casilla NUNCA es un color. Es "lo que diga el tema" — el unico
 *    valor que sobrevive un cambio de claro a oscuro. Todo lo demas es un
 *    literal, y un literal es una EXCEPCION explicita que la mano firma. Sin
 *    esa casilla no habria forma de deshacer una eleccion de color: solo de
 *    sustituirla por otra.
 *
 * 2. Los colores de marca van PRIMERO y con nombre. Miro tiene ahi un
 *    "+ Agregar colores" vacio que nadie llena nunca; los de Daniel ya existen
 *    (morado #8C27F1 y oro #ff9101, sistema Luminorphism) y estar en la primera
 *    fila es lo que hace que un diagrama suyo se vea suyo sin disciplina.
 *
 * Los tonos generales son de rango MEDIO a proposito: tienen que leerse sobre
 * el lienzo claro y sobre el oscuro, porque un literal no cambia con el tema.
 * Un pastel elegido en claro desaparece en oscuro, y esa es exactamente la
 * clase de fallo que la doctrina del rol existe para evitar.
 */

import { trMarca } from '@/shared/i18n'

export interface Muestra { id: string; color?: string; label: string }

/** `color: undefined` = manda el rol/tema. Es el default y el unico reversible. */
export const SIN_COLOR: Muestra = { id: 'tema', label: trMarca('Del tema (sigue al claro/oscuro)') }

export const MARCA: Muestra[] = [
  { id: 'morado', color: '#8C27F1', label: trMarca('Morado de marca') },
  { id: 'oro',    color: '#ff9101', label: trMarca('Oro de marca') },
]

export const PALETA: Muestra[] = [
  { id: 'rojo',      color: '#e5484d', label: trMarca('Rojo') },
  { id: 'naranja',   color: '#f76b15', label: trMarca('Naranja') },
  { id: 'ambar',     color: '#e0a90a', label: trMarca('Ámbar') },
  { id: 'lima',      color: '#8ab917', label: trMarca('Lima') },
  { id: 'verde',     color: '#26a769', label: trMarca('Verde') },
  { id: 'turquesa',  color: '#0eaa9b', label: trMarca('Turquesa') },
  { id: 'cian',      color: '#0d9bd4', label: trMarca('Cian') },
  { id: 'azul',      color: '#3a6ff0', label: trMarca('Azul') },
  { id: 'indigo',    color: '#6355e0', label: trMarca('Índigo') },
  { id: 'violeta',   color: '#9333ea', label: trMarca('Violeta') },
  { id: 'rosa',      color: '#e2429b', label: trMarca('Rosa') },
  { id: 'carmin',    color: '#c02456', label: trMarca('Carmín') },
  { id: 'cafe',      color: '#95653b', label: trMarca('Café') },
  { id: 'pizarra',   color: '#64748b', label: trMarca('Pizarra') },
  { id: 'grafito',   color: '#3f3f4a', label: trMarca('Grafito') },
  { id: 'negro',     color: '#101014', label: trMarca('Negro') },
  { id: 'gris',      color: '#a8a8b3', label: trMarca('Gris') },
  { id: 'blanco',    color: '#ffffff', label: trMarca('Blanco') },
]

/**
 * Los mismos tonos, aclarados, para RELLENOS.
 *
 * Un relleno saturado se come el texto que lleva encima: el juez mide contraste
 * y una tarjeta #e5484d con titulo oscuro reprueba. Estos son la version que
 * puede llevar texto, derivada una sola vez aqui en vez de a ojo por quien
 * elija el color.
 */
export const RELLENOS: Muestra[] = [
  { id: 'rojo',      color: '#fde8e8', label: trMarca('Rojo') },
  { id: 'naranja',   color: '#feeade', label: trMarca('Naranja') },
  { id: 'ambar',     color: '#fdf3d6', label: trMarca('Ámbar') },
  { id: 'lima',      color: '#eef7d8', label: trMarca('Lima') },
  { id: 'verde',     color: '#e0f5ea', label: trMarca('Verde') },
  { id: 'turquesa',  color: '#dcf4f2', label: trMarca('Turquesa') },
  { id: 'cian',      color: '#ddf0fa', label: trMarca('Cian') },
  { id: 'azul',      color: '#e4ecfd', label: trMarca('Azul') },
  { id: 'indigo',    color: '#e7e5fb', label: trMarca('Índigo') },
  { id: 'violeta',   color: '#f3e6fe', label: trMarca('Violeta') },
  { id: 'rosa',      color: '#fce3f0', label: trMarca('Rosa') },
  { id: 'carmin',    color: '#fbe0e8', label: trMarca('Carmín') },
  { id: 'cafe',      color: '#f2e8df', label: trMarca('Café') },
  { id: 'pizarra',   color: '#e9edf2', label: trMarca('Pizarra') },
  { id: 'grafito',   color: '#e4e4e8', label: trMarca('Grafito') },
  { id: 'negro',     color: '#d6d6dc', label: trMarca('Negro') },
  { id: 'gris',      color: '#f0f0f3', label: trMarca('Gris') },
  { id: 'blanco',    color: '#ffffff', label: trMarca('Blanco') },
]

/** Los tonos de RESALTADO: translucidos, para que el texto siga encima. */
export const RESALTADOS: Muestra[] = [
  { id: 'amarillo', color: 'rgba(255,224,80,.62)',  label: trMarca('Amarillo') },
  { id: 'verde',    color: 'rgba(120,231,160,.55)', label: trMarca('Verde') },
  { id: 'cian',     color: 'rgba(120,210,255,.55)', label: trMarca('Cian') },
  { id: 'rosa',     color: 'rgba(255,150,205,.55)', label: trMarca('Rosa') },
  { id: 'morado',   color: 'rgba(180,130,255,.50)', label: trMarca('Morado') },
  { id: 'oro',      color: 'rgba(255,175,60,.55)',  label: trMarca('Oro') },
]
