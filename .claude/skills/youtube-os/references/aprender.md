# Aprender de cada video: referentes con fecha y el lazo del delta

## Los referentes, con fecha de caducidad

A quién mira el dueño como referencia no cambia por video, cambia por trimestre. Por eso vive **una sola vez**, en
`.claude/memory/project/youtube/referentes.md`, y no en cada proyecto.

```markdown
# Mis referentes

| Dimensión | Referente (enlace) | Qué se le aprende | Medido | Caduca |
|---|---|---|---|---|
| Títulos | … | los moldes, la longitud | AAAA-MM-DD (sus 10 últimos con vistas) | +90 días |
| Miniaturas | … | jerarquía de logos, texto distinto al título | … | … |
| Estructura del guion | … | dónde pone la llamada, el matiz, el cierre | … | … |
| Series | … | qué tema exprimió en serie y cómo le fue | … | … |

## Lo medido

(la tabla de cada medición: título, vistas, duración, fecha de publicación, y lo que se concluyó)
```

- **Un referente sin fecha es folklore.** Si la medición tiene más de 90 días, se vuelve a medir antes de citarla.
- Se miden los últimos 10 a 20 videos largos con vistas (método en `ideas.md` › paso 1), no los que uno recuerda.
- Se aprende la estructura, no la materia: lo que el referente hace bien se adapta a la voz y los activos del dueño,
  nunca se copia su escena, su frase o su diseño.

## Pico contra renta

Las vistas del primer día miden el pico; los clientes y los clics al destino semanas después miden la renta. Cuando el
dueño tenga datos (sus estadísticas de YouTube, los clics de sus enlaces, sus ventas por origen), compara por video en
una ventana de 2 a 4 semanas. Sin datos, dilo; no estimes.

## El lazo: cómo el video siguiente necesita menos vueltas

La trampa es archivar todo: un registro de cada decisión de cada video es un museo que nadie abre. **El activo no es
el archivo, es el delta entre lo que propusiste y lo que el dueño publicó.** Ese delta es su criterio.

Tres capas, ninguna duplica a la otra:

| Capa | Dónde | Qué guarda | Vida |
|---|---|---|---|
| Estado | `publicacion/` del proyecto | lo elegido y lo publicado | la del video |
| Delta | `publicacion/decisiones.md` del proyecto | por activo (guion, corte, título, miniatura, descripción): propuesto → final → motivo en sus palabras → cuántas rondas | desechable |
| Regla | su memoria: `canal.md` › Decisiones, `voz.md`, `miniaturas.md`, o su ficha de marca | lo que se repite, destilado como regla con su fecha | el activo |

**Regla de oro entre capas:** un delta que no se volvió regla en 30 días no valía guardarlo. Cuando el dueño corrige
lo mismo dos veces (por ejemplo, «sin caras de asombro» o «capítulos más cortos»), se escribe como regla en su memoria
ese mismo día, con `memory-manager`, y deja de corregirse.

**El sensor:** rondas por activo. Anota cuántas vueltas llevó cada activo en cada video. La vara no es que el archivo
crezca: es que ese número baje. Si después de varios videos sigue igual, el mecanismo no está aprendiendo y hay que
cambiarlo, no seguir alimentándolo.

## Lo que pasa después de publicar

A las 48 horas ya hay datos reales de la miniatura (porcentaje de clics) y de retención, si el dueño te los da o tiene
cómo consultarlos. Engancharlos convierte «¿cuál te gustó?» en «¿cuál funcionó?». Con menos de 5 videos publicados no
hay muestra que leer: se anota y se espera, sin sacar conclusiones de un solo dato.

Al cerrar cada video, una línea en `canal.md` › Decisiones solo si salió una regla nueva. Lo demás se queda en el
proyecto.
