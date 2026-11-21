# Métricas: qué es cada número antes de darlo

Define el número en la misma respuesta en que lo das, en una línea. Dos personas que dicen «vendí 50 mil» casi nunca
están midiendo lo mismo.

## Dinero

| Número | Qué es | Cuidado |
|---|---|---|
| **Bruto** | Lo que pagaron los clientes en la ventana | Incluye impuestos si la pasarela los cobra; dilo |
| **Reembolsos** | Lo devuelto en la ventana | Se restan en la fecha del reembolso, no en la de la venta original, salvo que el dueño pida «por cohorte» |
| **Comisiones** | Lo que se queda la pasarela y el procesador | Muchas veces no aparece en lo que cae al banco: es un gasto real que no se ve. Nómbralo |
| **Neto** | Bruto − reembolsos − comisiones | Es lo que la pasarela le debe o ya le pagó |
| **Cobrado en su moneda** | Lo que llegó a su banco tras el cambio de divisa | Eso ya es de `finance-os`: el tipo de cambio real se ve en el depósito, no se estima en la venta |

## Suscripciones

| Número | Qué es | Cuidado |
|---|---|---|
| **MRR** | Ingreso mensual recurrente: la suma de lo que pagan las suscripciones activas, llevado a mes | Los anuales se prorratean (un anual de 1,200 suma 100 al mes). Por eso el MRR no es caja: un mes puede cobrar mucho más o mucho menos que su MRR |
| **Activas** | Suscripciones con acceso hoy | Incluye las que ya pidieron cancelar pero siguen pagadas hasta su fecha |
| **Cancelan al final del período** | Avisaron que se van, pero conservan acceso hasta su fecha | Son señal de churn, no churn todavía. Repórtalas aparte |
| **Churn del mes** | Las que terminaron en el mes ÷ las activas al inicio del mes | Misma ventana arriba y abajo. Las altas del mes no van en el denominador |
| **Altas y renovaciones** | Altas = primer pago; renovaciones = pagos siguientes | Nunca presentes renovaciones como clientes nuevos |
| **LTV** | Cuánto deja un cliente en toda su vida | Con pocos meses de historia es una proyección, no un dato: dilo y muestra la cuenta |

## Embudo y conversión

| Número | Qué es | Cuidado |
|---|---|---|
| **Conversión entre etapas** | Únicos que llegan a la etapa B ÷ únicos en la etapa A, misma ventana | Solo entre etapas que van en secuencia. Si B > A, el problema es la medición |
| **Conversión total** | Ventas ÷ visitantes únicos de la página, misma ventana | Ventas de la pasarela, visitantes de la herramienta de seguimiento, mismas fechas y zona |
| **Atribución** | De qué contenido o canal vino cada venta | Solo con enlaces etiquetados, UTM o una pregunta en el checkout. Lo demás es «sin atribuir», con su porcentaje |
| **CAC** | Lo que costó conseguir un cliente | Solo si hay gasto medido (anuncios, comisiones de afiliado, horas con costo). Sin gasto medido, no hay CAC |

## Comparar en el tiempo

- **Semana contra semana:** siete días contra los siete anteriores, mismos días de la semana si el negocio tiene ritmo
  semanal.
- **Mes a la fecha:** del 1 al día de hoy contra los mismos días del mes anterior. Nunca contra el mes completo.
- **Antes y después de un cambio** (precio, página, oferta): la línea base se guarda el día del cambio en
  `reportes/`, y el «después» se mide con la misma ventana y la misma fuente.
- **Un lanzamiento no es la línea base.** Los días de lanzamiento se reportan aparte; compararlos con días normales
  hace que todo lo demás parezca caída.
