<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/hero-oscuro.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/hero-claro.svg">
  <img alt="Arbrain: tu cerebro artificial, un bucle hacia tu meta" src=".github/assets/hero-oscuro.svg" width="100%">
</picture>

<br>

[![Licencia Apache-2.0](https://img.shields.io/badge/licencia-Apache--2.0-8C27F1?style=flat-square)](LICENSE)
[![Versión](https://img.shields.io/github/v/release/arbrain-ai/arbrain?style=flat-square&color=ff9101&label=versi%C3%B3n)](https://github.com/arbrain-ai/arbrain/releases)
[![Node 22+](https://img.shields.io/badge/node-22%2B-27272a?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![macOS, Windows y Linux](https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-27272a?style=flat-square)](#instalar)
[![Hecho para Claude Code](https://img.shields.io/badge/hecho%20para-Claude%20Code-27272a?style=flat-square&logo=claude&logoColor=D97757)](https://claude.com/claude-code)

**[arbrain.ai](https://arbrain.ai)** · **[YouTube](https://www.youtube.com/channel/UCX4AjkMDukOaj0eqr0FIS5g)** · **[Instalar](#instalar)** · **[Cambios](CHANGELOG.md)** · **[Contribuir](#contribuir)**

</div>

<br>

## Qué es

**Arbrain es tu cerebro artificial: un bucle hacia tu meta.** Le dices a dónde quieres llegar y tu agente, **Levy**,
lo convierte en un plan de mes, semana y día; lo agenda, lo ejecuta contigo, revisa qué se cumplió y ajusta. Cada
vuelta del bucle sabe más de ti, porque todo lo que aprende queda escrito en tu memoria.

No es un chat más. El chat es la punta del iceberg. Debajo hay un sistema nervioso completo que corre en **tu**
computadora: memoria, habilidades, rutinas y manos, conectados al mejor modelo disponible.

## Por qué

- **La punta mejora sola.** El modelo (Claude u otro) mejora cada pocos meses y Arbrain lo usa el mismo día. No tienes
  que reconstruir nada.
- **Lo de abajo es tuyo.** Tu memoria, tus habilidades y tus rutinas son archivos de texto en tu disco, versionados
  en git. Los puedes leer, editar, respaldar y llevar a otro lado. Nadie te los puede quitar.
- **Crece con la IA.** Cuanto mejor es el modelo, más rinde lo que construiste alrededor. Lo que hoy le enseñas a tu
  Levy sigue sirviendo con el modelo de dentro de cinco años.

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/arquitectura-oscuro.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/arquitectura-claro.svg">
  <img alt="Arquitectura de Arbrain: el modelo al centro; memoria, habilidades, rutinas y manos alrededor; todo dentro de tu computadora o tu servidor" src=".github/assets/arquitectura-oscuro.svg" width="100%">
</picture>

## Funciones

<table>
<tr>
<td width="50%" valign="top">
<img src=".github/assets/iconos/memoria.svg" width="44" align="left" alt="">
<b>Memoria</b><br>
Lo que Levy sabe de ti, de tu negocio y de tu meta, en archivos Markdown. Recuerda decisiones y correcciones entre
conversaciones.
</td>
<td width="50%" valign="top">
<img src=".github/assets/iconos/habilidades.svg" width="44" align="left" alt="">
<b>Habilidades</b><br>
Skills que enseñan a Levy a hacer un trabajo de principio a fin. Vienen varias y creas las tuyas hablando.
</td>
</tr>
<tr>
<td valign="top">
<img src=".github/assets/iconos/rutinas.svg" width="44" align="left" alt="">
<b>Rutinas</b><br>
Revisiones del día, la semana y el mes que Levy corre contigo, y ganchos que en cada sesión le cargan tu agenda y tu
memoria.
</td>
<td valign="top">
<img src=".github/assets/iconos/calendario.svg" width="44" align="left" alt="">
<b>Calendario y hábitos</b><br>
Día, semana y mes en tu panel. «Agéndame…» o «agrega el hábito…» y Levy lo escribe en tu plan local, con rachas.
</td>
</tr>
<tr>
<td valign="top">
<img src=".github/assets/iconos/voz.svg" width="44" align="left" alt="">
<b>Voz</b><br>
Dicta en lugar de escribir (con tu llave gratuita de Groq) y escucha las respuestas con la voz de tu dispositivo.
</td>
<td valign="top">
<img src=".github/assets/iconos/lienzos.svg" width="44" align="left" alt="">
<b>Lienzos</b><br>
Una pizarra donde Levy dibuja mapas, planes y diagramas que tú editas a mano. Arranca con «Mi plan» y «12 semanas».
</td>
</tr>
<tr>
<td valign="top">
<img src=".github/assets/iconos/panel.svg" width="44" align="left" alt="">
<b>Panel</b><br>
Chat, calendario, lienzo, explorador de archivos y taller en una sola ventana del navegador.
</td>
<td valign="top">
<img src=".github/assets/iconos/manos.svg" width="44" align="left" alt="">
<b>Manos</b><br>
Levy usa tu computadora y la web por ti en macOS y Windows. Viene apagado y siempre pide permiso para lo irreversible.
</td>
</tr>
</table>

## Instalar

Funciona en macOS, Windows y Linux. **No tienes que instalar nada antes:** Claude Code se encarga de Git, Node y
Python, sin pedirte comandos.

1. **¿Ya tienes Claude Code?** Si sí, ábrelo. Si no: descarga la app de Claude de
   [claude.ai/download](https://claude.ai/download), entra con tu cuenta (Pro o Max) y abre la pestaña **Code**. No
   necesitas una terminal.
2. Pega este mensaje y envíalo:

   ```text
   Instala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
   ```

3. Acepta los permisos que te pida (los de Claude Code y, si aparece, la ventana de tu sistema). En unos minutos se
   abre la app **Arbrain** con Levy listo.

Tu Claude Code verifica la firma de la versión, instala lo que falte, respalda lo que ya tengas (la app 0.1.x, tu
Business OS o tu propio repo) y te pregunta una sola vez si lo copia o lo unifica, baja Arbrain ya compilado para tu
sistema, deja la app de escritorio abierta y conecta a Levy con tu cuenta de Claude. El guion completo está en
[`INSTALAR.md`](INSTALAR.md).

> **Antes de pegar cualquier prompt, revisa de dónde viene.** Un prompt le da órdenes a un agente que puede usar tu
> computadora. Este sale de arbrain.ai y apunta solo a `github.com/arbrain-ai/arbrain`. Si alguien te pasa uno
> parecido con otra dirección, no lo pegues.

**Desinstalar o empezar desde cero:** pega
`Desinstala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md`. Guarda todo en
`~/Arbrain-respaldos` (no borra nada); luego el prompt de instalación lo deja como nuevo.

<details>
<summary>Para quien programa: a mano</summary>

```bash
git clone --origin dani https://github.com/arbrain-ai/arbrain.git ~/Arbrain
cd ~/Arbrain
git switch -c mi-arbrain                # tu rama: aquí vive todo lo tuyo
python3 arbrain/cerebro/sembrar.py      # siembra tu capa sin pisar nada
cd arbrain && npm run servidor          # baja el programa ya compilado (o compila) y abre tu navegador
node scripts/escritorio.mjs instalar    # la app de escritorio, verificada con la firma de la versión
```

Necesitas Git 2.34+, Node 22+ y Python 3. Arbrain queda en `http://127.0.0.1` (solo en tu computadora). Comandos
útiles, desde `~/Arbrain/arbrain`:

| Comando | Qué hace |
|---|---|
| `npm run servidor` | Arranca Arbrain y abre el navegador con tu sesión |
| `npm run servidor -- estado` | Dice si está corriendo y en qué dirección |
| `npm run servidor -- detener` | Lo apaga |
| `npm run servidor -- contrasena` | Muestra la contraseña para entrar desde otro navegador |
| `npm run servidor -- arranque-automatico activar` | Lo arranca solo al encender la computadora |

El remoto se llama `dani` a propósito: es de donde llegan las versiones nuevas. Tu respaldo en tu propio GitHub
privado va como `origin` (el instalador te lo ofrece al final).

</details>

## Actualizar

Pega el mismo prompt de instalación, o abre Claude Code en `~/Arbrain` y dile **«actualiza mi Arbrain»**. Verifica
la firma de la versión nueva, guarda tus cambios en una rama de respaldo, te explica en cinco líneas qué trae según el
[`CHANGELOG.md`](CHANGELOG.md), la integra en `mi-arbrain` sin tocar tu capa y reinicia Arbrain y su app. Solo te
pregunta si un archivo que editaste choca con uno del autor.

## Tu cuenta de Claude

Cada cuenta de Claude es **individual** y se usa en **tu propio Claude Code**, con tu sesión (Pro, Max o tu asiento
de Team). Es la forma principal de trabajar con tu cerebro.

El chat dentro de Arbrain usa **tu Claude Code** solo: si ya iniciaste sesión, Arbrain lo conecta sin pedirte nada. Si
no, en Ajustes › Llaves basta el botón **«Iniciar sesión con Claude»**, que abre tu navegador en la página de
Anthropic. Con este motor Arbrain no le pasa ninguna llave de API a Claude Code (aunque tengas `ANTHROPIC_API_KEY` en
tu sistema), así que no se cobra aparte; las rutinas automáticas no corren con tu plan.

Si no tienes Pro o Max, el chat usa **tu propia llave**: OpenRouter («Conectar con OpenRouter», un clic) o una API key
de Anthropic, en Ajustes. En ningún caso Arbrain pide, ve, guarda ni reenvía las credenciales de tu cuenta: el inicio
de sesión es el de Anthropic, en tu propio Claude Code, y no se comparten cuentas entre personas
([condiciones de Anthropic](https://code.claude.com/docs/en/legal-and-compliance)).

## Estructura de capas

Hay dos capas y nunca se pisan. La del autor llega con cada versión; la tuya nace una sola vez de la semilla y vive
en tu rama.

| Capa | Rutas | Quién la cambia |
|---|---|---|
| **Tuya** | `.claude/memory/`, `.claude/plan/` (objetivos, calendario, hábitos), `.claude/now.md`, `.claude/diario/`, `.claude/daily/`, `.claude/knowledge/`, tus skills en `.claude/skills/`, `CLAUDE.local.md`, `mi-negocio/` | Tú y tu Levy, en `mi-arbrain` |
| **Del autor** | `CLAUDE.md`, las skills que vienen con Arbrain, los ganchos, `arbrain/` (el código) y la semilla | Cada versión, en `main` |

```text
~/Arbrain
├── CLAUDE.md                 contrato de Levy (importa tu memoria)
├── CAPAS.json                la lista exacta de qué es tuyo y qué del autor
├── .claude/
│   ├── memory/               tu memoria            ← tuya
│   ├── plan/                 objetivos, calendario y hábitos  ← tuya
│   ├── skills/               habilidades del autor y las tuyas
│   └── hooks/                rutinas que cuidan tu memoria
└── arbrain/
    ├── cerebro/semilla/      de aquí nace tu capa la primera vez
    ├── scripts/servidor.mjs  npm run servidor
    ├── server/               el servicio local de Levy
    └── src/                  el panel (Next.js)
```

Si quieres que tu Levy sepa o haga algo distinto, escríbelo en tu memoria (`.claude/memory/MEMORY.md`) o en una skill
tuya, no en `CLAUDE.md`: así las actualizaciones nunca chocan con lo tuyo.

## Seguridad por defecto

- Todo escucha solo en `127.0.0.1`. No hay túneles ni puertos abiertos hacia afuera.
- Tus llaves viven en un archivo privado de tu carpeta de datos, nunca en el repositorio.
- Enviar, borrar, pagar o publicar siempre pide tu confirmación.
- El control de la computadora viene apagado y se enciende en Ajustes.
- La telemetría está apagada salvo que tú la aceptes.

## Contribuir

Las ideas, los reportes y los PR son bienvenidos.

1. Abre un [issue](https://github.com/arbrain-ai/arbrain/issues) con lo que viste o lo que propones.
2. Para código: haz un fork, crea una rama desde `main` y abre un PR pequeño y con una sola idea.
3. No incluyas datos personales, llaves ni archivos de la capa del usuario (`CAPAS.json`); la CI revisa esto último.

Este repositorio se publica por versiones: los PR aceptados se integran en la siguiente versión y aparecen en el
[`CHANGELOG.md`](CHANGELOG.md). Si encuentras una vulnerabilidad, repórtala en privado desde la pestaña
**Security** del repositorio, no en un issue público.

## Licencia

[Apache-2.0](LICENSE). Puedes usar, modificar y distribuir Arbrain, también con fines comerciales, conservando el
aviso de licencia y el [`NOTICE`](NOTICE). El nombre y el logo de Arbrain son marcas de su autor.

<br>

<div align="center">

**[arbrain.ai](https://arbrain.ai)** · **[YouTube](https://www.youtube.com/channel/UCX4AjkMDukOaj0eqr0FIS5g)**

<sub>Hecho con Claude Code, para quien quiere un cerebro propio y no uno rentado.</sub>

</div>
