# Playbook de diagnóstico VSM

> El método completo síntoma→órgano→capítulo→jugada. Usar DESPUÉS de declarar el nivel de
> recursión y el POSIWID del sistema en foco (pasos 1-2 del método, en SKILL.md).
> Regla de cierre: todo diagnóstico termina en decisión, rango o acción con dueño.

## Las 3 declaraciones obligatorias (antes de cualquier diagnóstico)

1. **Sistema en foco:** ¿qué estamos modelando? (¿el negocio entero? ¿solo un producto? ¿la vida del dueño?)
2. **Contenidos:** ¿qué sistemas viables contiene?
3. **Contenedor:** ¿de qué sistema viable mayor es parte?

Si el dolor sigue ambiguo tras declararlas, el problema casi siempre vive UN NIVEL ARRIBA del
sospechado (patrón del cap 4: "no crece el producto" suele ser el negocio no alimentándolo).

## Tabla maestra: síntoma → diagnóstico → capítulo → jugada

| Síntoma observable | Hipótesis de órgano/principio | Cap | Jugada prescrita |
|---|---|---|---|
| "Estoy desbordado, no me alcanza el tiempo, soy un desastre" | Déficit de variedad V(R)<V(D); lectura moral de un problema estructural | 2-3 | Medir el déficit del frente en bits (grueso); decidir atenuador o amplificador por lazo; prohibido resolverlo con "más horas" |
| El dueño aprueba/decide cosas que una unidad podía resolver | Reflejo local roto; autonomía S1 violada; el dueño = atenuador involuntario | 5 | Censo S1: sensor/decisión/acción local por unidad; cerrar el lazo que más variedad le sube |
| Dos frentes en bandazos (semanas de X, luego semanas de Y, ambos resienten) | Oscilación por acoplamiento con retardo; S2 ausente | 6 | Mecanismo humilde de información mutua: automático, simultáneo, no-emotivo. NUNCA resolver centralizando |
| Los mismos pleitos por los mismos recursos; "reorganizaciones" periódicas | S2 ausente crónico (patología del Dos) | 6, 13 | Ídem + revisar si la "reorganización" reacomoda cajitas sin instalar el semáforo |
| Sorpresa desagradable ("¿cómo no lo vi venir?") | Canal/transductor mintiendo hace meses (Principios 2-3); falta 3* | 3, 7 | Instalar/ritualizar el 3*: canal esporádico, legítimo, de alta variedad, directo a las operaciones crudas |
| Reportes verdes + realidad podrida | Transducción comprimida por el interesado (P3) | 3, 7 | 3* + rediseñar el reporte: índices con función por nivel, no narrativa |
| Todo KPI verde pero huele a estancamiento; cero conversación de futuro | S4 hambreado; S3 dominante; riesgo "morir sano" | 8 | Inventario del radar; cada pieza de intel → consecuencia en backlog o se declara turismo; re-fondear el S4 en el trato de recursos |
| Pivote eterno, shiny objects, presente que nadie ordeña | S4 dominante sin contrapeso; homeostato 3-4 desbalanceado | 8, 9 | Contrapeso al S3 (rituales, candados); el árbitro (S5) decide con identidad, no con más análisis |
| Decisión grande empantanada; los datos no la resuelven | Pleito S3↔S4 legítimo; falta arbitraje de identidad (Tercer Axioma) | 9 | Formular la decisión como pregunta de identidad ("¿qué juego jugamos y a qué plazo?"); consultar candados/memoria (el multinodo) antes que generar más análisis |
| El dueño recibe TODO; silla de identidad vacía; crisis perpetua | S5 colapsado en S3 | 9, 13 | Redefinir qué es residuo (lo único que le sube); devolver lo demás a S1/S3 con tratos explícitos |
| Una función parcial (finanzas, ego, un tercero) dicta decisiones existenciales | S5 secuestrado | 13 | Nombrarlo; restituir la pregunta de identidad al multinodo completo |
| Métrica/dashboard que nadie usa; junta que no decide | Museo de datos; índice sin lazo; POSIWID violado | 1, 10 | Por cada índice: ¿qué decisión cambia? Sin respuesta → podar. Con respuesta → umbral + dueño |
| "¿Voy bien o voy mal?" con drama | Falta el triple índice; se compara actualidad contra fantasías | 10 | Declarar A/C/P de la unidad; leer productividad (exprimir) vs latencia (construir); responder al índice correcto |
| Sube productividad recortando desarrollo/gente/apuestas | La trampa del recortador: canibaliza capacidad | 10 | Mirar latencia: si se desploma, se está quemando futuro para calentar presente |
| El dueño revisando gráficas cada mañana; reacciona a cada fluctuación | Humano haciendo trabajo de máquina; regulador histérico oscilando con su ruido | 11 | Filtro por trama: banda de normalidad + disparo sostenido; el humano recibe EXCEPCIONES; silencio = salud |
| Alerta que suena tarde, o alarmas que ya nadie escucha | Algedónico mal calibrado (umbral alto por miedo o bajo por histeria); P4 roto | 12 | Rangos + ventanas de recuperación pactadas por variable vital; escalada automática por niveles |
| Crisis manejada improvisando, más juntas, "todo más rápido" | Arousal mal entendido: acelerar en vez de reprogramar | 12 | Programas de crisis pre-escritos en la calma (3-4 incendios plausibles: qué se suspende, qué se activa, quién decide) |
| Corrección que llega cuando el problema ya mutó | Barrera del tiempo: T_regulación > T_perturbación | 12 | Auditar sincronía por lazo; acortar el ciclo del regulador o atenuar la fuente, no "apurarse" |
| Ansiedad difusa, muchos "debería" gritando a la vez | Variables vitales sin rango ⇒ todo grita ⇒ nada grita | 12 | Sesión de variables: lista corta de vitales, rango sano, ventana, destino de escalada (actualizar `docs/vsm/mapa-negocio.md`) |
| Cron/proceso/ritual que sobrevivió a su propósito; "por si acaso" | Autopoiesis patológica (burocracia) en función de servicio | 13 | Test del derecho: ¿es sistema viable (total/S1)? Si es servicio: ¿a quién sirve su energía? Sin respuesta → poda |
| "¿Matar/cambiar X me traiciona o solo me duele?" | Confusión estructura vs organización | 13 | Clasificar: ¿relación definitoria (identidad) o componente que la encarna? Estructura se cambia sin duelo; organización solo se toca sabiendo que es refundar |
| Reforma interna asimilada/diluida por el sistema viejo | Establishment: acepta cambio estructural, rechaza organizacional | 13, 14 | Marco separado: construir la entidad nueva fuera del alcance metabólico; instalación silenciosa |
| Se planea instalar algo grande "de golpe" y anunciado | Errores 4-5 de instalación (gran anuncio, cuarto del rediseño) | 14 | Un lazo por semana, funcionando, sin bombo; no declarar terminado; absolutum obsoletum |

## Checklist de los 4 Principios (auditoría rápida de cualquier lazo)

1. **Balance:** ¿el regulador de este lazo tiene variedad requisita, por diseño y al menor costo?
2. **Canal:** ¿la capacidad del canal supera la variedad que la fuente genera en el tiempo disponible?
3. **Transducción:** en cada frontera (persona↔máquina, nivel↔nivel, lenguaje↔lenguaje), ¿se traduce sin atenuar ni amplificar? ¿Quién comprime y a favor de quién?
4. **Sincronía:** ¿el ciclo del lazo es al menos tan rápido como el de la perturbación? ¿Late a tiempo con los lazos vecinos?

## Test de autopoiesis (para poda y para admisión de órganos nuevos)

- ¿El candidato es un sistema viable (el total o un S1)? → tiene derecho a mantenerse a sí mismo.
- ¿Es función de servicio (S2-S5, staff, proceso, cron, ritual)? → responde: **¿a quién sirve su
  energía?** Nombrar el lazo que cierra y la decisión que alimenta. Sin respuesta concreta → es
  burocracia naciente: podar o no construir.
- Señal de alarma: defiende su presupuesto/existencia como FIN ("¿y si algún día se necesita?").

## Los 5 errores de instalación (memorizar; vetan planes enteros)

1. Calcar el organigrama (mapear puestos, no funciones)
2. Leerlo como pirámide de poder (el eje vertical es logística de variedad)
3. Instalar el museo (métricas sin lazos que decidan)
4. El gran anuncio (convoca los anticuerpos; instalar en silencio, lazo por lazo)
5. Declarar victoria al cuarto del rediseño (quedar a medio recablear = peor que antes)

## El orden de instalación (para secuenciar cualquier trabajo de estructura)

Identidad y recursión → censo S1 con reflejos completos → S2 antes que el mando → homeostatos
(trato de recursos, 3*, radar, balanza con árbitro) → medición en 3 niveles + filtros → cables del
dolor (rangos, ventanas, programas de crisis). Cada paso crea las condiciones del siguiente.
