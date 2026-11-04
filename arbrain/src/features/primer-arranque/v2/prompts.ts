/**
 * Pedidos de un clic de «Tu socio estratega» (onboarding v2, 3 nov 2026). Módulo puro.
 *
 * Cloudroom v140 pone cuatro chips bajo la caja («Find security holes», «Check for leaked keys»…): la etiqueta es corta,
 * el pedido completo va por dentro y el clic lo ENVÍA. Aquí los cuatro son de negocio y cada uno se apoya en el
 * expediente que armó el paso «Trae tu negocio». La línea `como` es lo que dice la tarjeta al pasar el ratón.
 * «Diagnostica a un cliente» es el método del programa: el onboarding que vive el alumno es la plantilla que le aplica
 * a su cliente.
 */
export interface PedidoSocio { id: string; etiqueta: string; como: string; pedido: string }

export const PEDIDOS_SOCIO: readonly PedidoSocio[] = [
  {
    id: 'cuello',
    etiqueta: 'Encuentra el cuello de botella de mi negocio',
    como: 'Lee tu expediente · una sola respuesta · ~3 min',
    pedido: 'Lee mi expediente y mi meta. Dime cuál es EL cuello de botella que hoy frena mi meta del mes (uno solo), con el número que lo demuestra o el dato que te falta para medirlo, y la acción de esta semana para soltarlo. Si te falta información, hazme máximo tres preguntas antes de responder.',
  },
  {
    id: 'oferta',
    etiqueta: 'Arma mi oferta',
    como: 'Con tu industria y tu cliente ideal · ~5 min',
    pedido: 'Con mi expediente, arma mi oferta para el cliente ideal de mi industria: el resultado que le prometo, para quién es, en cuánto tiempo, qué incluye, mi garantía y el precio con su razón. Dame también la versión de una línea para decirla en voz alta y lo que tendría que probar para cobrarla.',
  },
  {
    id: 'diagnostico',
    etiqueta: 'Diagnostica a un cliente',
    como: 'Te entrevista y te da su cuello de botella · ~10 min',
    pedido: 'Quiero diagnosticar a un cliente. Hazme las preguntas del diagnóstico una por una (su negocio, su meta, sus números y el proceso que más odia) y al final dame su cuello de botella, el primer proceso que le automatizaría y cuánto le vale al mes en horas o en dinero.',
  },
  {
    id: 'fugas',
    etiqueta: '¿Dónde se me fuga el dinero?',
    como: 'Ordenado por cuánto te cuesta al mes · ~5 min',
    pedido: 'Revisa lo que sabes de mi negocio (mi expediente, nuestras conversaciones y lo que tengo conectado) y dime dónde se me fuga el dinero: horas mías que no deberían ser mías, clientes que no regresan, cobros pendientes o precios bajos. Ordénalo por cuánto me cuesta al mes y dime qué tapo primero.',
  },
] as const

/** Lo que dice la caja de escribir vacía de «Tu socio estratega» (Cloudroom: «Build anything...» y «@ to tag an Agent»). */
export const PLACEHOLDER_SOCIO = '¿Qué movemos hoy en tu negocio?'
export const PISTA_SOCIO = '/ para tus comandos'
