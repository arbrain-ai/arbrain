# Precisión: las reglas y los errores que no se repiten

Se lee siempre antes de reportar un número. Cuatro reglas de oro y un catálogo de errores típicos: cada uno es un
error real de negocios que medían con prisa, contado sin sus cifras para que lo reconozcas cuando aparezca.

## Las cuatro reglas de oro

1. **Nunca fabricar.** Si no tienes el dato, «no tengo ese dato» y dónde se consulta. No armes tablas de «fuentes de
   tráfico» o «dispositivos» si la fuente no registra esos campos: primero comprueba que el campo existe y desde
   cuándo se llena.
2. **Nunca mezclar ventanas.** Cada fuente empieza en una fecha distinta: el canal de video puede tener años, el
   seguimiento de la página semanas y los cobros meses. Una tasa que divide datos de ventanas distintas no es una
   tasa, es ruido con forma de porcentaje.
3. **Verificar con la fuente viva.** Antes de repetir un número, consúltalo. Un documento con más de unos días es
   historia, no estado.
4. **Una fuente de verdad por número**, escrita en la ficha de fuentes (`numeros.md`):

| Número | Manda | Apoyo (no manda) |
|---|---|---|
| Cobrado, reembolsos, comisiones, órdenes | La pasarela que cobra (su API, su conector o su exportación) | La base de la app, la hoja a mano |
| Suscripciones activas, MRR, cancelaciones | La pasarela de suscripciones | Conteos de la app |
| Visitas, clics, pasos del embudo | La herramienta de seguimiento que registra cada evento | Reportes resumidos |
| Vistas y retención de contenido | La analítica de la plataforma (YouTube Studio, Instagram, etc.) | Capturas viejas |
| Dinero en cuentas, gastos, runway | `finance-os` (saldos reales) | El MRR |

## Reglas de cada consulta

- **Zona horaria explícita** en todo lo que agrupa por día. La pasarela suele guardar en UTC; el dueño vive en la suya.
  Una venta a las 11 de la noche puede caer en el día siguiente. Pon la zona en cada respuesta.
- **El mes en curso, por días.** Algunas pasarelas agregan raro cuando pides el mes que no ha terminado: pide por día y
  suma tú.
- **Únicos, no eventos.** Diez clics de la misma persona son una persona. Cuenta por sesión o por visitante cuando la
  fuente lo permita, y di qué contaste.
- **Monedas por separado.** Nunca sumes pesos con dólares. Si el dueño quiere un total, convierte con un tipo de cambio
  dicho y fechado, y marca que es conversión contable.
- **Documenta los huecos.** Si el 30 % de las ventas no tiene origen, dilo junto al número que sí tiene.

## Errores típicos (y cómo reconocerlos)

| Error | Cómo se ve | Qué pasaba de verdad |
|---|---|---|
| Ventanas incompatibles | «Casi nadie de los que ven mis videos llega a la página» | Se dividieron años de vistas entre días de visitas medidas |
| Campo que no existía | Tabla de «fuentes de tráfico» o «dispositivo» con porcentajes exactos | El campo empezó a registrarse después; antes no hay dato, no un 0 ni un reparto |
| Verificación tomada por venta | «Esta semana entraron muchísimos pagos» | El evento era la app revisando que un cliente ya pagado siguiera activo (cada renovación y cada revisión lo disparan). Ventas son órdenes pagadas de la pasarela |
| Copia que pierde filas | MRR o ventas de la base de la app distintos a la pasarela | La copia guarda el primer pago y no las renovaciones, o perdió webhooks. Manda la pasarela |
| Checkouts abandonados como «dinero en riesgo» | «Tengo X dólares por recuperar» | Eran checkouts abiertos, no pagos pendientes. Dinero pendiente es solo lo que la pasarela marca pendiente |
| Acumulados sumados | Vistas del panel varias veces más altas que las reales | Se sumaron fotos acumuladas de cada día en lugar de tomar la diferencia |
| Pasos que no son del embudo | Conversión de más de 100 % entre dos etapas | Se metieron eventos que no van en secuencia (registro, perfil) como si fueran etapas |
| Más en la etapa 3 que en la 2 | «Más gente eligió plan de la que vio la página» | Llegaban con el plan ya elegido en el enlace y el evento solo se registraba en un camino. Bug de medición, no conducta |
| Cancelaciones subcontadas | «Casi nadie cancela» | Las «canceladas al final del período» siguen activas hasta su fecha; la copia no las veía. Pregunta a la pasarela |
| Atribución sin origen | «Una cuarta parte de mis ventas viene de YouTube» | Sin enlaces etiquetados ni UTM no se sabe el origen. Sin origen medido, «sin atribuir» |
| MRR como caja | «Me entran X al mes» citando el MRR | El MRR prorratea los anuales; lo cobrado ese mes puede ser mucho menos o mucho más. Para caja, lo cobrado |

Cuando encuentres un error nuevo en sus datos (un bug de seguimiento, un campo que empezó tarde, una copia que no
cuadra), anótalo en la ficha de fuentes, sección «Lo que se sabe que falla», con fecha. Así no se vuelve a citar.

## Muestras chicas

Con menos de cinco ventas en una ventana, reporta conteos e importes, no tasas ni causas. «Dos ventas esta semana,
las dos del mismo video» es un hecho; «ese video convierte al 40 %» no lo es todavía.
