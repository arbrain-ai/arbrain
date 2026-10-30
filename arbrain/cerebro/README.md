# Tu cerebro artificial: la plantilla estándar

Esta carpeta es la forma que recibe cada dueño. Viene casi vacía a propósito: no trae el contenido de nadie.
Tu Levy la llena contigo, conversación a conversación.

## Qué es un cerebro artificial

Tu negocio genera más de lo que una persona puede atender. Un cerebro artificial hace dos cosas a la vez:
**filtra** lo que te llega para que solo pase lo que importa, y **multiplica** lo que haces. Es un actuador contra
el desorden: corrige, ordena y empuja hacia tu meta.

Por dentro funciona como un buen regulador: **un lazo que te mantiene en el rumbo y un mapa que mejora cada vez
que se equivoca**. El lazo rápido corrige lo que haces esta semana; el lento corrige el mapa que tu cerebro tiene
de ti y de tu negocio. Cualquiera puede copiar la app. Nadie puede copiar el mapa de tu negocio: ese es tuyo.

## Las cinco partes

| Carpeta | Qué guarda | Pregunta que responde |
|---|---|---|
| `meta/` | Lo que persigue tu cerebro | ¿Hacia dónde vamos y cómo sabremos que llegamos? |
| `sentidos/` | Lo que vigila por ti | ¿Qué me cambia algo y qué es ruido? |
| `memoria/` | El mapa de ti y de tu negocio | ¿Quién soy, qué decidí, qué aprendí? |
| `manos/` | Lo que hace, con límites y revisión | ¿Qué puede hacer sin mí y qué siempre me pregunta? |
| `dolor/` | La alarma que llega directo | ¿Qué se rompió que no puede esperar? |

Sin meta, exprimir la IA se vuelve ruido: más cosas, más rápido, sin dirección. Por eso la meta va primero y
decide qué miran los sentidos y qué hacen las manos.

### Lo que ya trae

- `meta/libertad-medida-en-dinero.md`: la meta por defecto. La libertad es el fin; el dinero es cómo se mide.
- `memoria/el-contexto-es-tuyo.md`: tu memoria vive en archivos de texto que son tuyos.
- `manos/edicion-por-voz.md` y `manos/edicion-por-voz/`: editas tus videos hablándole a tu cerebro (también es
  la skill `edicion-por-voz`).
- `manuales/`: cómo conectar tus cuentas (Google Calendar y Gmail, iCloud, Todoist), qué computer use existe en tu
  sistema y el modo monje opcional. Tu Levy te guía con ellos; tú conectas.
- `sentidos/` y `dolor/`: vacías. Se llenan cuando decidas qué debe vigilar tu cerebro y qué debe despertarte.

### Dónde vive cada parte en la práctica

- **Memoria:** el mapa completo está en `.claude/memory/` (esencia en `MEMORY.md`). Aquí, en `memoria/`, van las
  ideas sobre cómo se arma ese mapa.
- **Meta:** tus objetivos de mes, semana y día en `.claude/plan/objetivos.md`; aquí, el porqué de fondo.
- **Manos:** las skills de `.claude/skills/`, las herramientas de la app y lo que conectes siguiendo `manuales/`.
  En macOS y Windows la app trae computer use (que Levy use tu pantalla y tus apps), apagado en cada apertura: lo
  enciendes en Ajustes › Esta computadora. En Linux no; ahí el computer use oficial de Claude o de ChatGPT se
  enciende en sus propias apps (`manuales/computer-use.md`).
- **Sentidos y dolor:** avisos de la app y lo que conectes (calendario, correo, métricas; ver `manuales/`).

## Cómo se escribe aquí

Un archivo por idea; el nombre del archivo es la idea (`meta/diez-clientes-antes-de-marzo.md`). Cada archivo dice:

- **La frase:** la idea en una línea.
- **De dónde salió:** fecha y conversación.
- **Por qué importa.**
- **Dónde se usa.**
- **Estado:** semilla (idea) o firmado por ti (decisión).

El test de todo lo que vive en esta plantilla: **«¿le sirve a cualquier dueño?»**. Lo que solo te sirve a ti va
en tu memoria (`.claude/memory/`), no aquí.
