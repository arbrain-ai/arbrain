// Las lápidas de la poda del 10 oct 2026 (docs/builds/censo-crons-2026-10-10/LAPIDAS.md): lo que ya no corre, con su porqué.
// Las filas completas, para revivir una, están en lapidas-filas.json. Aquí solo se cuentan, al fondo de Rutinas.

export interface Lapida { id: string; nombre: string; queHacia: string; ultima: string; porque: string }

export const LAPIDAS_FECHA = '10 oct 2026'

export const LAPIDAS: Lapida[] = [
  { id: 'sfpublish-watch', nombre: 'Vigía de lanzamientos', queHacia: 'Publicaba el post de comunidad cuando el video programado ya estaba público.', ultima: '13 sep', porque: 'En pausa desde el 13 sep; un modelo lo envolvía sin aportar nada y no había lanzamientos pendientes.' },
  { id: 'evening-reflection', nombre: 'Cierre del día por aviso', queHacia: 'Te avisaba a las 20:00 para cerrar el día.', ultima: '30 sep', porque: 'Lo apagaste el 1 oct: «nunca lo lleno y solo añade ruido».' },
  { id: 'plasticidad-lectura', nombre: 'Repaso de hábitos', queHacia: 'Leía de noche los patrones de tus hábitos.', ultima: '13 sep', porque: 'Vive como «Lo que veo en ti esta semana» del reporte semanal.' },
  { id: 'calendar-mirror-sync', nombre: 'Copia del calendario', queHacia: 'Copiaba tu calendario de Google cada 3 horas.', ultima: '16 ago', porque: 'Arbrain lee y escribe Google directo.' },
  { id: 'churn-email-sequence', nombre: 'Correos para no perder miembros', queHacia: 'Escribiría a miembros en riesgo de irse.', ultima: '26 abr', porque: 'Nunca envió: faltaba configurar el envío de correos.' },
  { id: 'intel-enrich', nombre: 'Análisis de la competencia', queHacia: 'Estudiaba a fondo videos de otros canales.', ultima: '13 sep', porque: 'Murió el 13 sep sin acceso al modelo; el radar de competencia sigue y clasifica solo.' },
  { id: 'morning-habits', nombre: 'Recordatorio de hábitos', queHacia: 'Te recordaba en la mañana qué hábitos tocaban.', ultima: '2 may', porque: 'Los hábitos van en físico y en el Día.' },
  { id: 'video-feature-engineering', nombre: 'Análisis de tus videos', queHacia: 'Buscaba qué tienen en común tus videos que más venden.', ultima: '13 sep', porque: 'Murió el 13 sep; los modelos que lo usaban ya se habían retirado.' },
  { id: 'state-snapshot', nombre: 'Estado para Levy', queHacia: 'Actualizaba el resumen que Levy leía al empezar.', ultima: '13 sep', porque: 'Lo reemplazó la agenda automática.' },
  { id: 'reporte-diario-html', nombre: 'Página del reporte diario', queHacia: 'Armaba la página HTML del reporte a las 8:50.', ultima: '4 oct', porque: 'Fusionado en el reporte diario.' },
  { id: 'autoresearch-trinity', nombre: 'Mejora de Trinity', queHacia: 'Probaba de noche mejores instrucciones para Trinity.', ultima: '2 ago', porque: 'En pausa desde agosto, sin nadie que usara el resultado.' },
  { id: 'autoresearch-sensei', nombre: 'Mejora de Sensei', queHacia: 'Probaba de noche mejores instrucciones para Sensei.', ultima: '2 ago', porque: 'En pausa desde agosto, sin nadie que usara el resultado.' },
  { id: 'autoresearch-levy', nombre: 'Mejora de Levy', queHacia: 'Probaba de noche mejores instrucciones para Levy.', ultima: '2 ago', porque: 'En pausa desde agosto, sin nadie que usara el resultado.' },
]
