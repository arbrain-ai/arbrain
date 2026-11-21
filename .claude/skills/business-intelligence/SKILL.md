---
name: business-intelligence
description: "Los números del negocio del dueño, medidos con evidencia: cuánto vendió, cuánto cobró, MRR, cancelaciones, conversión del embudo, de dónde vienen sus ventas y cómo va contra el mes o la semana anterior. Conecta SU fuente (Stripe, Polar, Hotmart, una hoja de cálculo o un CSV exportado) y nunca inventa una cifra. Usar ante «mis números», «cuánto vendí», «cuánto vendí este mes», «cómo van mis ventas», «compara con el mes pasado», «cuál es mi MRR», «cuántos cancelaron», «mi tasa de conversión», «dónde se me cae el embudo», «de dónde vienen mis ventas», «conecta Stripe», «conecta Polar», «te paso mi hoja de ventas» o «arma mi reporte de la semana». El dinero que ya aterrizó en sus cuentas (gastos, saldos, runway) es de finance-os."
metadata:
  resumen: "Mide tus ventas, tu MRR y tu embudo con tus datos reales: sin cifras inventadas y comparando lo comparable."
---

# Números del negocio: medir con evidencia

Un número sin fuente es una opinión con decimales. Tu trabajo aquí no es «dar cifras», es que el dueño decida con
números que aguantan una auditoría: de dónde salió cada uno, qué ventana cubre y qué no sabemos todavía.

**Antes de reportar cualquier cifra, lee `references/precision.md`.** Son pocas reglas y casi todos los errores
caros salen de romper una de ellas.

## Dónde vive

- `.claude/memory/project/mi-negocio/numeros.md`: el registro de fuentes. Qué fuente manda para cada número, cómo se
  consulta, desde qué fecha tiene datos y qué se sabe que le falta. Lo creas tú la primera vez desde
  `references/fuentes.md` (sección «La ficha de fuentes»). Ahí no se guardan cifras del día: se consultan en vivo.
- `store/numeros/`: exportaciones crudas (CSV de la pasarela, copia de la hoja). Git ignora `store/`, así que los
  correos y nombres de sus clientes no se versionan.
- Una lectura que el dueño quiera conservar (el reporte del mes, la línea base antes de un cambio) va a
  `.claude/memory/project/mi-negocio/reportes/AAAA-MM-DD-<tema>.md`, con su fecha, su fuente y su ventana.

## Qué hacer

| El dueño dice | Hacer |
|---|---|
| «conecta Stripe / Polar / Hotmart», «te paso mi hoja», primera vez | `references/fuentes.md`: elige con él la vía (exportar un CSV, el conector oficial o la API) y crea la ficha de fuentes. Él conecta sus cuentas; tú lo guías. Nunca le pidas una llave en el chat |
| «cuánto vendí», «cuánto cobré este mes» | Consulta la fuente que manda para dinero (la pasarela, no una copia). Responde con la cifra, la ventana exacta, la zona horaria y la fuente. Separa bruto, reembolsos, comisiones y neto si la fuente los trae |
| «compara con el mes pasado», «cómo voy contra la semana anterior» | Ventanas del mismo largo y ambas dentro de los datos: `scripts/numeros.py comparar`. «Mes a la fecha» se compara con los mismos días del mes anterior, nunca con el mes completo |
| «cuál es mi MRR», «cuántos cancelaron», «mi churn» | `references/metricas.md`: define cada número antes de darlo (MRR no es lo cobrado; cancelado al final del período no es perdido todavía) |
| «dónde se me cae el embudo», «de dónde vienen mis ventas» | `references/embudo.md`: el método de seis pasos, empezando por el dinero real y terminando con lo que no se puede atribuir dicho en voz alta |
| «arma mi reporte de la semana / del mes» | Formato de `references/embudo.md` («El reporte»). Cada número con su fuente y su ventana; al final, una decisión o una pregunta para el dueño, no un resumen |
| «cuánto tengo», «registra un gasto», «mi runway» | Eso es dinero en cuentas: skill `finance-os` |

## Con CSV o con API: el script

`scripts/numeros.py` lee cualquier CSV de cobros (exportado de Stripe, Polar, Hotmart, Gumroad, Lemon Squeezy o su
hoja) sin adivinar columnas: primero `columnas` para ver qué trae, después tú dices cuál es la fecha, el monto y la
moneda. Solo biblioteca estándar de Python 3.

```bash
N=".claude/skills/business-intelligence/scripts/numeros.py"
python3 $N columnas store/numeros/pagos.csv
python3 $N resumen store/numeros/pagos.csv --fecha "Created date (UTC)" --monto Amount --moneda Currency \
        --estado Status --estado-ok paid,succeeded --zona America/Mexico_City --por mes
python3 $N comparar store/numeros/pagos.csv --fecha ... --monto ... --dias 30
```

Te devuelve JSON con la **cobertura** (primera y última fecha, filas leídas y descartadas con su motivo), totales por
moneda (nunca suma pesos con dólares) y, en `comparar`, «no comparable» cuando una ventana se sale de los datos. Esa
salida es la que citas; no la redondees a algo que no dice.

## Reglas

1. **Nunca inventes una cifra.** Si la consulta falla, no hay acceso o la fuente no trae ese dato, dilo así: «no lo
   tengo; se consulta en X». Un número aproximado sin fuente no es mejor que ninguno: es peor, porque se decide con él.
2. **Falta de dato no es cero.** «Sin ventas registradas en la exportación» no es «cero ventas» si la exportación
   termina antes. Di hasta qué fecha llega lo que viste.
3. **Una fuente manda por número.** Para dinero, la pasarela que cobra (Stripe, Polar, Hotmart…), no la base de datos
   de la app ni una hoja copiada a mano: las copias pierden renovaciones, reembolsos y webhooks fallidos. Si usas una
   copia, compárala con la fuente y di la diferencia.
4. **Ventanas comparables.** Mismo largo, misma zona horaria, ambas dentro de los datos. Nunca dividas el total de dos
   años de vistas entre una semana de visitas a la página.
5. **Consulta en vivo.** Una cifra escrita en un documento o en la memoria es una foto con fecha. Si tiene más de unos
   días, vuelve a consultar antes de repetirla.
6. **Muestras chicas, conclusiones chicas.** Con menos de cinco ventas no hay tasa ni causa: hay conteos. Dilo.
7. **Todo número termina en algo accionable:** una decisión, una pregunta o el siguiente dato que conviene medir.
8. **Privado.** Correos, nombres y montos por cliente no salen del cerebro: ni a contenido, ni a clases, ni a un lienzo
   público. En público, solo totales que el dueño apruebe.
