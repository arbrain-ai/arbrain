# Operar las cuatro salas

Procedimientos bajo demanda. Las salas son preguntas, no pantallas: en esta versión de la app no
hay una página por sala. Levy las responde por conversación con tus archivos, sus herramientas y
las vistas del panel. Abre solo la sección que toca.

| Sala | Pregunta | Dónde mira Levy hoy |
|---|---|---|
| Neuronas (SABE) | ¿Qué sé de esto? | `.claude/memory/`, `.claude/knowledge/`, vista Memoria |
| Acciones (OPERA) | ¿Qué hizo mi cerebro y qué falló? | Despertadores, subagentes, `/usage`, `<datos>/logs/daemon.log` |
| Plasticidad (LO FORMA) | ¿Qué patrón ve en mí? | Tu diario y hábitos, si usas `habit-system` |
| Metabolismo (SE REGULA) | ¿Qué rinde y qué conviene podar? | Skills, despertadores, hooks y memorias, con el libro de rentas |

### Neuronas (SABE): corte y síntesis

Cuando pides un artefacto de tu conocimiento («brief de X», «sintetiza Y», «qué sé de Z»):

1. **Corte:** elige de 5 a 10 archivos de `.claude/memory` y `.claude/knowledge` por relevancia.
   Empieza por `MEMORY-indice.md` (o por lo que el hook de recall ya inyectó), sigue los enlaces
   y las líneas de linaje entre memorias. Foco antes que volumen. Si hace falta lo compilado,
   usa `knowledge-search`.
2. **Artefacto** (lee ENTERO el corte, solo lectura):
   - **`brief`** (por defecto para «qué hago»): `## Contexto` (3 a 5 viñetas) · `## La decisión` ·
     `## Opciones` (tabla: opción | a favor | en contra) · `## Recomendación` (UNA, anclada al
     material) · `## Riesgos` · `## Siguiente acción` (1 a 3 pasos esta semana).
   - **`simple`** («explícame simple»): un HTML autocontenido con analogías, fondo oscuro, texto
     claro, tarjetas con borde fino y esquinas redondeadas, ancho máximo de lectura cómodo, que
     cierra con «¿Y ahora qué?». Cero recursos externos.
   - **`journey`** («arma la historia de...»): línea de tiempo con fechas REALES, qué cambió y por
     qué, arco completo, cierra en acción.
   - **`contenido`** («dame un ángulo para publicar»): `## Título` (3 variantes) · `## Gancho`
     (los primeros 15 s, literal) · `## Tesis` · `## Estructura` · `## Evidencia` (fuente por
     bloque) · `## Llamado a la acción`.
3. **Entrega** en el chat citando las fuentes (`memory/project/lanzamiento.md`). Puedes mostrar
   un documento con `mostrar` vista `documento`. Todo artefacto termina en acción: si solo se
   admira, falló.

Los nodos aislados (memorias que nada enlaza) son aprendizaje que todavía no paga renta: vale la
pena mencionarlos cuando aparezcan.

### Acciones (OPERA): el cuerpo en movimiento

Preguntas de «¿qué corrió, qué falló, cuánto gastó?»:

- **Despertadores:** `despertador` con `listar` en la conversación; cada disparo queda como turno
  en esa conversación, con su resultado. Un despertador que llegó tarde lo dice en su encabezado.
- **Subagentes:** si delegaste trabajo, su estado y su salida.
- **Uso:** `/usage` en el chat da costo y tokens de 7 y 30 días medidos por el daemon.
- **Errores del cuerpo:** `<datos>/logs/daemon.log`.

Responde con datos reales. Lo que no se midió es «sin dato», nunca cero ni una reconstrucción.
Con API key propia el costo se acerca a tu factura; con sesión de Claude es precio nocional y lo
escaso es la cuota.

### Plasticidad (LO FORMA): el espejo del carácter

No hay órgano automático de Plasticidad en esta versión. Si usas `habit-system` (diario,
hábitos, objetivo del día) y preguntas «¿qué patrón ves en mí?», Levy lee esos registros y
CONVERSA sobre ellos. Reglas de esta sala:

- Historia corta se dice tal cual: «apenas te estoy conociendo, N días de datos» ES la lectura
  correcta.
- Un día sin registro rompe la racha. No se inventa.
- Compara lo decidido con lo ejecutado: lo que declaraste para un día contra lo que marcaste ese
  día.
- Cuando la lectura te devuelva una pregunta o una contradicción con evidencia, es legítima:
  ayúdate a contestarla, no la entierres. Evidencia real no es regaño gratuito.

### Metabolismo (SE REGULA): el libro de rentas y la firma

La sala de la poda. Su moneda son los recursos escasos de tu instalación: tokens y cuota (o
dinero, si usas API key), tu atención y la claridad del sistema. Libro de rentas por clase:

| Clase | En tu Arbrain | Paga renta si | Si no paga |
|---|---|---|---|
| Reflejo | un despertador recurrente, un hook | su salida cambia una decisión o alimenta a otro proceso que decide | proponer cancelarlo |
| Programa motor | una skill | se usa, o es el único camino a una capacidad que importa | proponer fusionarla o archivarla |
| Memoria | un archivo de `.claude/memory` | se cita, se carga en sesiones, se enlaza | CONSOLIDAR, jamás borrar |
| Centinela | un candado o guardia (el freno, un hook que bloquea) | el riesgo que vigila sigue vigente y todavía dispara cuando lo pruebas | probarlo, nunca podarlo por poco uso |

El contrato: **el órgano PROPONE, tú FIRMAS hablando con Levy, Levy EJECUTA.** Nada muere solo.
Cuando digas «apruebo la propuesta», Levy ejecuta la poda o la consolidación (cancela el
despertador, archiva la skill con una nota de por qué murió, fusiona memorias vía
`memory-manager`) y te reporta. Si dices «rechazada», lo registra y no insiste.

Candados que Levy defiende aunque la propuesta se equivoque:

- La memoria se consolida, jamás se borra.
- Los centinelas no se juzgan por frecuencia de uso: son un seguro.
- Un veredicto sin evidencia es un dato fabricado.
- El auditor se audita: si una revisión cuesta más de lo que ahorra, también paga renta.
