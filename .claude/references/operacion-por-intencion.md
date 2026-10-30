# Operar hablando: carga progresiva de contexto

Contrato entre tú y Levy. Tú expresas resultado, dudas o correcciones; Levy localiza fuentes, opera y verifica. No pedir rutas que el agente pueda encontrar. No prometer memoria perfecta: una ausencia o contradicción se reconoce y se resuelve.

## Un recorrido de principio a fin

1. **Entender el pedido.** Distinguir consultar, explorar opciones, decidir y ejecutar. Una cita de otro modelo o una tarea escrita por un agente no es una decisión del dueño.
2. **Localizar la entrada.** El hook compartido sugiere hasta dos rutas; abrir la skill/canónico indicado. Las rutas son ayudas léxicas, no sustituyen entender el contexto ni aplican acciones automáticamente.
3. **Cargar detalle a demanda.** Abrir la referencia específica completa cuando fundamente la decisión o escritura. No leer el árbol entero, corpus completos por costumbre, todos los archivos de un dominio ni los antecedentes si el vigente basta.
4. **Resolver vigencia.** Mensaje actual del dueño > canónico vigente > memoria específica > índice/resumen. Separar propuesta, decisión, implementación y resultado. Datos cambiantes: sensor/API vigente, no cifra de memoria. Calendario y tareas: sus fuentes únicas (`habit-system`).
5. **Ejecutar dentro del encargo.** Reutilizar el artefacto/tarea que ya existe. Escribir la decisión en su fuente y enlazarla; no crear planes paralelos. Confirmaciones solo cuando falte una decisión real o las reglas aplicables las requieran.
6. **Verificar lo recibido.** Releer la escritura o hacer GET; comprobar enlace/destino y, si es código, comportamiento relevante. Producido no es entregado; guion no es video publicado.
7. **Cerrar breve.** Resultado, ubicación solo si ayuda y siguiente decisión pendiente. El usuario recibe claridad, no el recorrido interno de búsquedas.

## Recuperación cuando la entrada no basta

Levy puede ejecutar `python3 .claude/hooks/intent-context.py --find 'tema o intención'`.
Busca los encabezados reales de skills y los índices de memoria existentes. Devuelve como máximo seis rutas, sin copiar los archivos ni escribir otro índice. Es búsqueda léxica; puede fallar con paráfrasis.

Si no encuentra: `rg` en las fuentes del dominio; para pasado, seguir `knowledge-search` y la referencia de historial. Para repo externo, leer sus instrucciones (AGENTS.md o CLAUDE.md) antes de tocarlo. Pedir aclaración solo si persiste una ambigüedad que cambia la acción. Nunca inventar que un artefacto no existe por un match vacío.

## Una pluma por clase de información

- Decisión y motivo duraderos: memory-manager. Corregir la frase falsa y enlazar antecedente, no apilar negaciones al final.
- Estrategia y condiciones: canónico del dominio (la memoria `project/` que lo documenta).
- Ideas y acciones: tareas vía habit-system; candidato sin fecha no es compromiso.
- Hora comprometida: el calendario del dueño; no asignar horas por inferencia.
- Materiales: carpeta del proyecto; la tarea apunta a ella.
- Evidencia histórica: corpus/auditoría con fecha y límites; no reinyectarla entera como reglas vigentes.

## Mantenimiento integrado al trabajo

Si cambia una fuente, actualizar el puntero que se usó. Mantener vigencia al inicio; mover antecedentes de un documento operativo a un archivo enlazado solo con preservación reversible. Los generadores deben leer o apuntar al estándar, no perpetuar su copia antigua.

`intent-context.py --check` verifica destinos. `memory-recall.py --selftest` incluye esta verificación y sigue en el sensor existente. No hay cron nuevo, cambios automáticos del árbol, nuevas cuentas ni limpieza destructiva. Las pruebas de ambos CLI contra servidor local comprueban recepción de la orientación sin enviar una consulta a otro modelo.

## Límites honestos

La orientación se integra a los entornos que ejecutan el hook compartido. Un consumidor que no ejecute hooks conserva este contrato por CLAUDE.md, pero no recibe rutas automáticas. No se afirma despliegue en otras máquinas. El agente conserva responsabilidad por leer y verificar; este mecanismo reduce errores de recuperación, no garantiza que ningún documento del repositorio contenga contradicciones.
