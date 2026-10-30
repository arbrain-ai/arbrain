# Programas de crisis — pre-armados en la calma (cap 12: arousal = reprogramar, no acelerar)

> Plantillas para escribir en la calma, como manda el modelo. La respuesta a una alarma NUNCA se
> improvisa: se saca el modo normal y se mete el programa. Cada programa dice qué se suspende,
> qué se activa y quién decide. Adaptarlos al negocio real del dueño en su primera sesión de
> variables vitales (los umbrales viven en `docs/vsm/mapa-negocio.md`) y revisarlos cada
> trimestre o tras usarse una vez.
> Regla transversal: **durante un programa de crisis NO se toman decisiones de identidad**
> (vehículo, plataforma, modelo de negocio). La crisis es OPERACIÓN. La identidad se discute en
> la calma, con el multinodo completo.

## Programa A · Caída del sistema de pagos / checkout roto

**Detección:** compras nuevas = 0 por 48h con tráfico normal, una alerta del embudo, o el reporte
de un cliente que no puede pagar.

1. Levy verifica el flujo de compra E2E como usuario real (3*), el estado del proveedor de pagos y los logs.
2. Clasificar: ¿bug propio (fix inmediato vía sesión de código) o caída del proveedor (esperar + comunicar)?
3. Si >24h caído: aviso transparente a clientes + link de pago alterno si existe.
4. SE SUSPENDE: cualquier deploy no relacionado, cualquier cambio de precios, cualquier campaña.
5. Decide: Levy diagnostica y propone; el dueño aprueba la comunicación pública (freno: publicar requiere su pedido).
6. Post-mortem de 5 líneas al cerrar: ¿qué canal mintió o faltó? → nueva variable o fix.

## Programa B · Churn disparado

**Detección:** la variable de cancelaciones fuera de su rango por 2 semanas, o caída del ingreso
recurrente por debajo del umbral pactado dos semanas seguidas.

1. 3* inmediato: leer las razones de cancelación CRUDAS (sin resumen de nadie) + las últimas 20
   conversaciones de soporte de quienes cancelaron.
2. Buscar el trigger con fecha: ¿subida de precio, bug, silencio prolongado del dueño, entrega
   caída, competencia? (El churn casi nunca es "el mercado": casi siempre tiene fecha.)
3. Winback 1-1 a los últimos 10 que cancelaron, operado por quien el dueño designe (escuchar, no rogar).
4. El dueño: UNA acción de puro valor para sus clientes esa semana (sesión en vivo, recurso), sin pitch.
5. SE SUSPENDE: campañas de urgencia (pedir en pleno sangrado quema la confianza).
6. Decide: el dueño con el reporte crudo de Levy en mano, a las 72h, no antes (dato > pánico).

## Programa C · Clientes o audiencia fríos (reanimación)

**Detección:** la variable de participación (respuestas, uso, autores activos) fuera de rango por 2 semanas.

- **Versión mayor (fondo real):** la reanimación de fondo es CADENCIA sostenida (dar valor visible
  varias veces por semana) + mecánicas de participación diseñadas en la calma. Si ya existe un plan
  escrito, se relee; no se improvisa uno nuevo en plena crisis.
- **Versión menor (bache):** (1) una sesión en vivo extra de día fijo esa semana; (2) un empujón a
  la mecánica de participación que ya funciona; (3) el dueño presente 3 días seguidos, 20 min/día,
  respondiendo el trabajo de sus clientes (no anunciando); (4) el equipo activa sus propias sesiones.
- SE SUSPENDE: la culpa difusa. La reanimación es un programa de 7 días, no un estado de ánimo.

## Programa D · El dueño fuera de combate (enfermedad / energía / sensor sucio)

**Detección:** la variable de energía o sueño fuera de rango 5 días, enfermedad o evento personal mayor.

1. Cambio explícito a **modo BASE**: 1 bloque de output de 60-90 min al día, o CERO sin culpa. Se
   declara en voz alta a Levy ("modo base esta semana").
2. Lo automático (procesos, agentes, ventas evergreen) sostiene el negocio; el equipo, si existe,
   sostiene la atención a clientes.
3. REGLA DURA: no se decide NADA grande en la ventana (el multinodo tiene el volante; toda "nueva
   dirección" que aparezca aquí se anota y se re-evalúa con el sensor limpio).
4. Prioridad única: dormir, comer, moverse. El negocio debe estar diseñado para sobrevivir semanas así.
5. Salida: 2 días consecutivos con sueño y energía en rango → volver por fases (primero contenido
   ya hecho, luego presencia, luego construcción).

## Programa E · Crisis financiera (runway < 6 meses)

**Detección:** el corte mensual muestra runway < 6 meses.

1. Congelar TODO gasto no esencial el mismo día (suscripciones, herramientas, servicios).
2. Sesión de emergencia del dueño con Levy (y su socio o contador si existe): mapa completo del gasto.
3. Palanca de ingreso inmediata y honesta: una oferta real a los clientes actuales (anual, upgrade, servicio).
4. SE SUSPENDE: toda inversión en construcción de latencia (proyectos nuevos, hardware, viajes) hasta runway > 12m.
5. Este programa existe para no ejecutarse nunca: medir el runway cada mes lo hace casi imposible.
