# El método: la báscula, el ritual mensual y los estados de cuenta

## Por qué la báscula

Contar calorías de cada comida o subirse a la báscula. Casi nadie sostiene anotar cada ticket: a las pocas semanas
el registro tiene cuatro gastos y el dueño cree que gasta poco. Lo único que no miente son los saldos. Así que el
corazón del sistema no son los gastos, son las **fotos de saldos**:

```
gasto del período = ingresos del período − (patrimonio de hoy − patrimonio de la foto anterior)
```

El script lo hace por moneda y suma las transferencias que entraron o salieron de cada una (cambiar dólares a pesos
no es gasto). Préstamos y lo que le deben son cuentas `por_cobrar`: van en la foto como cualquier otra, así que
prestar no aparece como gasto.

**Las capas** (el total es la verdad; las capas lo explican, no lo suman):

```
Gasto derivado (báscula)      ← exacto si los ingresos están completos
  ├─ Registrado               ← lo grande que él dictó o lo que salió de un estado de cuenta
  ├─ Fijos esperados          ← sus cobros que se repiten, según su día
  └─ Hormiga                  ← el resto, por diferencia; nadie la anota
```

**La hormiga es la señal.** Si un mes sale mucho más grande que su normal, esa es la alerta que importa: «la hormiga
de este mes fue X contra Y de costumbre; ¿qué pasó?». Si sale negativa, algo falta: un ingreso sin registrar, una
cuenta fuera de la foto, un fijo que ya no corre o un gasto duplicado. Se busca antes de cerrar.

**Condición dura: los ingresos tienen que estar completos.** Un ingreso que falta infla el gasto en el mismo monto.
Por eso en el cierre se repasan los ingresos uno por uno antes de leer la báscula. Si cobra por una pasarela, el
ingreso es lo que la pasarela le acreditó (neto de comisiones si así lo registra); el dato de ventas está en
`business-intelligence`.

## El umbral

Por defecto, 5,000 en su moneda base (lo cambia en `config.json` o con `iniciar --umbral`). Debajo del umbral no se
registra nada: cae en la hormiga y la báscula lo captura. El umbral no es una obligación de anotar, es la pregunta
«¿vale la pena nombrarlo?»: una mudanza, un equipo, un viaje, un cobro grande. Tres a cinco cosas al mes. Si menciona
algo chico: «Debajo del umbral: la báscula lo captura en el cierre». Si insiste, se anota.

## Arranque (primera vez)

1. Moneda base: en la que vive y paga sus cuentas.
2. Sus cuentas, una por una, con tipo y moneda: bancos (`banco`), tarjetas (`credito`), efectivo (`efectivo`),
   pasarelas donde se queda dinero antes de pasar al banco (`pasarela`), inversiones (`inversion`), cripto (`cripto`),
   lo que le deben (`por_cobrar`) y lo que debe a largo plazo (`deuda`). Nombres que él reconozca.
3. La primera foto: el saldo de cada cuenta hoy. Tarjetas y deudas en negativo. Si tiene dólares u otra moneda,
   el tipo de cambio de hoy (`--tc USD=…`), dicho por él o leído de su banco; nunca supuesto.
4. Sus cobros fijos: suscripciones, renta, servicios, con su día y su cuenta. **No los adivines de memoria: léelos de
   su estado de cuenta.** Casi siempre aparecen fijos que nadie recordaba y otros que ya no corren.
5. Con una sola foto se sabe lo que tiene, no lo que gasta. La báscula empieza en el siguiente cierre.

## El ritual mensual (el único momento en que se tocan las finanzas)

El día 1 de cada mes (o el que él elija; si quiere, que sea una rutina: `arbrain/cerebro/manuales/rutinas.md`):

1. `resumen` para ver la foto anterior y sus cuentas activas.
2. Pídele los saldos de todas las cuentas activas, de jalón o una por una. Tarjetas en negativo. Si hay otra moneda,
   el tipo de cambio de ese día.
3. Repasa los ingresos del mes: ¿entró algo que no esté registrado? Regístralo antes de seguir.
4. `foto` y `bascula`.
5. Lee la hormiga. Si es normal, no digas nada. Si se disparó o salió negativa, una pregunta.
6. Revisa sus fijos: ¿alguno ya no lo usa? Una línea con el total al mes y el candidato a cortar.
7. Escribe `reportes/AAAA-MM.md`: lo que tiene, lo que entró, lo que salió, la hormiga, sus decisiones del mes («esto
   se corta», «esto es de la casa») y si se cumplieron las del mes anterior.

Cinco minutos para él. El resto es trabajo tuyo.

## Modo detalle: estados de cuenta cargo por cargo

Cuando quiere ver **en qué** se le va, no solo cuánto, se cargan sus estados de cuenta:

1. Él te pasa el PDF o el CSV de su banco (guárdalo en `store/finanzas/estados/`). Léelo completo.
2. **Cada cargo con su fecha real**, nunca un total por mes: así la vista por día dice la verdad.
3. Arma un lote CSV (columnas `fecha,tipo,cuenta,monto,categoria,nota,fuente`, con `fuente` = `estado-de-cuenta`) y
   córrelo primero con `--probar`. El script rechaza duplicados y no escribe nada si una sola fila falla.
4. **No mezcles total e individuales**: si ese mes y esa cuenta ya tenían un total, se corrige ese total con
   `--tipo anula` en la misma tanda en que entran los cargos.
5. Pagos a la tarjeta desde el banco son `transferencia`, no gasto: el gasto real son los cargos de la tarjeta.
6. Devoluciones y reembolsos: corrigen el cargo original (`--corrige <id>` con el monto neto, o `anula` si fue total).
7. Lo dudoso se pregunta en una sola tanda (cinco a ocho por vez), con fecha, monto y concepto. Lo claro se carga sin
   preguntar.
8. Si le pasa dinero a otra persona de su casa para que pague gastos comunes, esa transferencia no es gasto si los
   cargos de esa persona también se cargan; si no se cargan, el envío es el único dato y va como gasto. Nunca las dos.

Con estados de cuenta cargados, los fijos de esa cuenta ya están dentro de los cargos: el script deja de contarlos
como esperados para no duplicarlos.

## Divisas: el tipo de cambio se observa, no se estima

Si cobra en dólares y vive en pesos, hay tres eventos en tres momentos:

| Evento | Cuándo | Moneda |
|---|---|---|
| La venta | El día que le pagan | Dólares brutos |
| Comisión de la pasarela | Ese mismo día | Quedan dólares netos en la pasarela |
| El cambio a pesos | El día del retiro, a veces meses después | El tipo de cambio de ese día, que el día de la venta no existe |

- La cuenta de la pasarela va en su moneda. El ingreso entra en dólares y es exacto.
- El retiro a su banco es una `transferencia` entre monedas con `--monto` (lo que salió) y `--contramonto` (lo que
  llegó). El tipo de cambio real es contramonto ÷ monto, y ya trae el margen del banco. Se lee, no se calcula.
- La diferencia entre el tipo de cambio del día de la venta y el del retiro es ganancia o pérdida cambiaria: es
  resultado de **tener** dólares, no parte del precio.
- Tener dólares guardados mientras vive en pesos es una posición. Si pregunta «cómo calculo el tipo de cambio», la
  pregunta útil es otra: «¿cuántos dólares quiero tener guardados y cuándo los cambio?». Esa decisión es suya.

## Runway

`resumen` calcula runway = dinero líquido ÷ gasto mensual promedio derivado de la báscula (hasta los últimos tres
tramos). Con un solo tramo, la confianza es baja y se dice. Lo que le deben (`por_cobrar`) no es líquido. Es la única
cifra que proyecta: preséntala como «si sigues gastando como en los últimos N meses».
