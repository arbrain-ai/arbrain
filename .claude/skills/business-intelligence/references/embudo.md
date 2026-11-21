# Investigar el embudo: seis pasos y el reporte

Cuando el dueño pregunta «dónde se me cae», «por qué bajaron las ventas» o «qué contenido me vende», no adivines
desde el final. Empieza por el dinero real y camina hacia atrás. Cada paso usa lo que de verdad existe en sus
fuentes; si un paso no tiene datos, el hallazgo es ese.

## El mapa de etapas

Si el dueño ya tiene su mapa (`embudo.json`, estándar `arbrain.embudo/v1`, el de las skills `radiografia` y
`mapa-vivo`), usa sus seis etapas: Adquisición, Nutrición, Conversión, Bienvenida, Entrega y Expansión. Para medir,
cada una se vuelve pasos con número:

```
Adquisición (vistas, alcance) → Nutrición (visita a la página, lista) → Conversión (intención: elige plan, abre el
checkout; y pago) → Bienvenida (activación) → Entrega (uso, resultado) → Expansión (renovación, recompra, referidos)
```

Solo cuentan como etapas los pasos que van en secuencia. Un registro o un perfil completado son eventos, no etapas.

## Los seis pasos

1. **Dinero real.** Ventas, reembolsos y neto de la pasarela en la ventana, por día, con su zona horaria
   (`numeros.py resumen --por dia`). Separa lanzamientos de días normales.
2. **Lo que se publicó.** Qué contenido, oferta o campaña salió en la ventana y en qué fecha. Si hay transcripts o
   textos, tenlos a mano para el paso 6.
3. **Tráfico a la página por origen.** Visitas únicas por enlace etiquetado, UTM o referencia, por día. Si no hay
   seguimiento por origen, dilo y propón el siguiente arreglo (enlaces etiquetados por pieza de contenido).
4. **Atribución de pagos.** Cruza los pagos con su origen. Reporta cuántos pagos tienen origen y cuántos no, en
   conteo y porcentaje. Las renovaciones no se atribuyen a contenido nuevo.
5. **Embudo por día.** Únicos en cada etapa, misma ventana. Busca la etapa donde cae más gente y compárala con su
   propio histórico, no con promedios de internet. Si una etapa tiene más gente que la anterior, revisa la medición
   antes de concluir nada.
6. **Lectura del contenido.** Para lo que sí vende o sí trae tráfico, qué dice y cómo pide la acción (la llamada a la
   acción, dónde está el enlace, qué promete). Esto es hipótesis con evidencia, no causa probada.

Al terminar, el cuello es **una** etapa, con su evidencia. Si los datos no alcanzan para saberlo, el primer hallazgo
es «no sabemos dónde se cae porque falta medir X», y la recomendación es medirlo.

## Las fugas típicas (para saber dónde mirar)

| Fuga | Señal |
|---|---|
| Mucho alcance, pocas visitas | El contenido no pide la acción o el enlace está escondido |
| Visitas, poca intención | La página no conecta con quien llega (otra promesa, otro avatar) |
| Intención, pocos pagos | Fricción en el pago: precio sorpresa, métodos de pago, errores del checkout |
| Pagos, poca activación | El cliente compra y no empieza: bienvenida y primer resultado |
| Activación, poca renovación | La entrega no sostiene el valor: churn |

## El reporte

```markdown
# Reporte · <tema> · <ventana exacta> · zona <zona>

## Dinero real (fuente: <pasarela>)
Bruto, reembolsos, comisiones y neto, por moneda. Contra la ventana anterior del mismo largo.

## Qué se publicó
Lista con fechas.

## Embudo
Etapa por etapa: únicos y conversión. La etapa que más cae, marcada.

## De dónde vinieron las ventas
Con origen: N (X %). Sin atribuir: M (Y %).

## Lo que no sabemos
Huecos de medición, campos que empezaron tarde, muestras chicas.

## La decisión
Una recomendación cerrada (o una pregunta para el dueño) y el siguiente dato que conviene medir.
```

Si el dueño quiere guardarlo, va a `.claude/memory/project/mi-negocio/reportes/AAAA-MM-DD-<tema>.md`.
