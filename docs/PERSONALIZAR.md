# Personalizar Arbrain sin perder las actualizaciones

**El principio: extender, no editar.** Arbrain tiene dos capas. La del autor (el código, `CLAUDE.md`, las skills que
vienen con Arbrain) llega nueva con cada versión. La tuya (tu memoria, tu marca, tus skills, tu negocio) nace una vez y
vive en tu rama `mi-arbrain`. Si todo lo tuyo está en tu capa, actualizar nunca choca y Arbrain usa el programa ya
compilado de cada versión, sin compilar nada en tu computadora.

La lista exacta de qué es tuyo está en `CAPAS.json › alumno`.

## Dónde va cada cosa

| Quiero… | Dónde | Notas |
|---|---|---|
| Mis colores | `mi-marca/tema.css` | Variables CSS que pisan las del autor. Trae un ejemplo comentado. |
| Mi logo | `mi-marca/logo.svg`, `logo.png` o `logo.webp` | Cuadrado, fondo transparente. Es el icono de la pestaña. |
| Mi nombre en el título | `mi-marca/marca.json` | `{ "nombre": "Mi negocio" }` (hasta 40 letras): reemplaza «Arbrain» en el título de la pestaña o ventana. |
| Que Levy sepa o haga algo distinto | `.claude/memory/MEMORY.md` | Se carga en el chat de la app y en Claude Code. |
| Reglas solo para Claude Code | `CLAUDE.local.md` (raíz) | Claude Code lo lee junto con `CLAUDE.md`. El chat de la app no lo lee. |
| Una habilidad nueva | `.claude/skills/<tu-prefijo>-<nombre>/SKILL.md` | Con prefijo propio (`mi-`, el nombre de tu negocio) para no chocar con una skill futura del autor. |
| Permisos o ganchos de Claude Code en esta máquina | `.claude/settings.local.json` | Pisa a `.claude/settings.json`. Es de esta máquina: no viaja a tus otras computadoras. |
| Mis documentos, procesos, clientes y material | `mi-negocio/` | Lo que quieras, con la forma que quieras. |
| Mi plan, mi agenda y mi diario | `.claude/plan/`, `.claude/now.md`, `.claude/diario/` | Los llena Levy contigo. |

Todo lo de esta tabla se ve sin compilar: los colores, el logo y el nombre, al recargar la ventana (Cmd+R o Ctrl+R);
memoria, skills y `CLAUDE.local.md`, en la siguiente conversación.

Lo más fácil es pedírselo a tu Levy: «cambia mis colores a verde», «pon este logo», «que se llame Acme». Sabe que va en
`mi-marca/`.

## Tus colores, paso a paso

`mi-marca/tema.css` trae dos bloques, uno para el modo claro y otro para el oscuro:

```css
html:root:not(.dark) {
  --primary: #0E7C66;
  --primary-rgb: 14, 124, 102;
}

html.dark:root {
  --primary: #2BB89A;
  --primary-rgb: 43, 184, 154;
}
```

- Usa los dos selectores tal cual: están escritos para ganarles a los del autor en todos los estilos de la interfaz.
- Las variables que no pongas se quedan con el color del autor.
- Cada color que termina en `-rgb` es el mismo color en números (rojo, verde, azul) para las transparencias: si cambias
  `--primary`, cambia también `--primary-rgb`.
- Las variables disponibles están al principio de `arbrain/src/app/globals.css` (léelo, no lo edites).

Cómo funciona: la app sirve `mi-marca/` en tiempo de ejecución (`/api/mi-marca/tema`) y la carga después de sus propios
estilos. Por eso no hace falta recompilar ni tocar la fuente del autor.

## Si de todos modos editas código del autor

Se puede: es tu copia. Lo que pasa:

1. **Solo choca en las mismas líneas.** Al actualizar, Git junta lo nuevo del autor con lo tuyo. Si los dos cambiaron
   cosas distintas, aunque sea en el mismo archivo, se junta solo. Choca únicamente si el autor cambió el mismo renglón
   que tú.
2. **Cómo se resuelve.** «Actualiza mi Arbrain» guarda antes una rama de respaldo (`respaldo/antes-de-actualizar-…`). Si
   algo choca, Levy te enseña qué cambió el autor y qué habías cambiado tú, se queda con la estructura nueva del autor y
   vuelve a poner tus líneas; si se contradicen, te pregunta. Si prefieres pensarlo, `git merge --abort` deja todo como
   estaba. Si el choque es por colores, logo o nombre, la salida es pasarlos a `mi-marca/` y no vuelve a pasar.
3. **Pierdes el programa ya compilado.** Cada versión publica el programa listo para cada sistema, firmado. Si tu
   copia cambió el código de la app (`arbrain/src/`, `arbrain/public/`, `arbrain/server/src/`, sus `package.json` y
   configuración), ese programa ya no es el tuyo y Arbrain compila el suyo en tu computadora después de cada
   actualización. Tarda varios minutos, más en Windows. Editar `CLAUDE.md` o una skill del autor no obliga a compilar,
   pero sí puede chocar.

Antes de editar algo del autor, pregúntate si cabe en uno de los lugares de la tabla. Si no cabe y crees que a otros
también les serviría, propónselo al autor: lo que entra al repo llega a todos sin choques.
