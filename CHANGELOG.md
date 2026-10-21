# Cambios de Arbrain

Cada versión dice qué trae y qué tienes que hacer tú. Para actualizar, abre Claude Code en `~/Arbrain` y dile
«jala los últimos cambios». Las versiones siguen `MAYOR.MENOR.PARCHE`: un cambio en MENOR trae funciones
nuevas; uno en PARCHE, arreglos.

## v0.2.0 · 21 oct 2026 · Arbrain por GitHub

La primera versión de Arbrain como repositorio público con el código completo, en lugar de un archivo descargable.
Código abierto con licencia Apache-2.0: lo clonas, lo usas, lo modificas y recibes cada mejora con un prompt.

**Qué trae**
- **Código abierto (Apache-2.0).** `LICENSE` y `NOTICE` en la raíz. El código es tuyo: tu clon y tu capa se quedan
  contigo pase lo que pase.
- **Repositorio en lugar de descargable.** Clonas una vez en `~/Arbrain` y actualizas con «jala los últimos
  cambios».
- **Modo servidor.** `npm run servidor` corre Arbrain desde el código en macOS, Windows y Linux, sin app de
  escritorio: instala, compila, arranca y abre tu navegador con sesión. Probado en la CI de los tres sistemas.
- **Calendario, hábitos y lienzos locales.** Tu calendario (`.claude/plan/calendario.json`) y tus hábitos
  (`.claude/plan/habitos.json`) nacen de la semilla; el primer arranque crea los lienzos «Mi plan» y «Calendario de
  12 semanas».
- **Voz.** Dictado con tu llave gratuita de Groq (Ajustes › Voz) y «Escuchar» con la voz de tu dispositivo.
- **Tu capa separada de la del autor.** Tu memoria, tu plan, tu diario y tus skills propias ya no vienen en el repo:
  nacen de la semilla (`arbrain/cerebro/semilla/`) y viven en tu rama `mi-arbrain`. Las actualizaciones nunca las
  pisan. La lista exacta está en `CAPAS.json`.
- **Todas las mejoras de la plataforma desde la 0.1.x**: calendario, lienzos, chat y paneles con lo construido
  estas semanas.
- **Tu plan de Claude, solo en tu Claude Code.** Arbrain ya no ofrece ni guarda credenciales de tu plan Pro o
  Max: lo usas en TU Claude Code, con tu sesión. El chat de la
  app usa tu propia llave (OpenRouter o API de Anthropic). Así lo piden las condiciones de Anthropic.

**Qué tienes que hacer**
- Si ya tenías la app 0.1.x: pega el prompt de instalación nuevo. Respalda tu cerebro de la app, copia tu memoria a
  `~/Arbrain` y deja intacta la instalación anterior.
- Si es tu primera vez: pega el mismo prompt. Siembra tu capa vacía y te pregunta tus objetivos.
