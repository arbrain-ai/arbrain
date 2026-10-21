# Arbrain: mapa técnico de tu instalación

> Cómo está construido, qué proceso hace qué, dónde guarda las cosas y qué existe en tu edición.
> Para el concepto: `filosofia.md`. Para el vocabulario: `anatomia.md`. Para diagnosticar un
> síntoma: `medula.md`.

## Tres procesos, una máquina

| Proceso | Qué es | Qué hace |
|---|---|---|
| **La app** | Escritorio (Tauri), una ventana nativa | Lee tus llaves del llavero del sistema (Keychain, Credential Manager o Secret Service), elige puertos libres, lanza y supervisa al daemon y a la web, y los apaga al salir |
| **El daemon** | Servidor del agente (`arbrain/server`, Node embebido en la app) | Corre los turnos de Levy con el SDK de Claude, guarda el journal del chat, los despertadores y el uso en SQLite, aplica el freno y sirve las vistas del panel |
| **La web** | La interfaz (Next) en localhost | Chat, panel, lienzo y Ajustes. Guarda conversaciones y lienzo en su base local (JSON en `<datos>/web`) |

- Los tres escuchan solo en `127.0.0.1`. Los puertos se eligen libres la primera vez y se
  recuerdan entre aperturas. Nada abre puertos hacia afuera ni crea túneles.
- Daemon y web comparten un token interno aleatorio por instalación. Es plomería: el agente no lo
  necesita y no debe buscarlo.
- **Supervisión:** la app sondea `GET /health` del daemon cada 5 s. Proceso muerto o 3 sondas
  fallidas seguidas = reinicio (máximo 5 en 5 minutos; después se detiene y muestra el último
  error con «Reintentar»). Si el daemon sale con código 78 le falta configuración y no se reintenta.
- **Salud:** `/health` responde `ok`, `edicion: "cliente"`, `llaves` (si hay Anthropic, sesión de
  Claude u OpenRouter, y `chat`: si hay con qué hablar) y `workspace` (si tu carpeta de cerebro
  existe y se puede leer).
- **Cambiar una llave reinicia el daemon:** las llaves se leen al arrancar. La app lo hace sola.
- Carpetas de datos por sistema: ver `medula.md` § 2.

## Tu cerebro (el workspace)

`<datos>/cerebro` es tu `ARBRAIN_HOME` y la carpeta de trabajo de Levy:

- `CLAUDE.md`: el contrato de tu Levy (tono, criterio, reglas). Lo puedes editar.
- `.claude/memory/`: memoria curada (`MEMORY.md` esencia, `MEMORY-indice.md` índice y carpetas
  `user/`, `feedback/`, `project/`, `reference/`).
- `.claude/knowledge/`: conocimiento compilado de conversaciones (`knowledge-search`).
- `.claude/skills/`: capacidades empaquetadas, una carpeta por dominio.
- `.claude/hooks/` y `.claude/settings.json`: lo que corre sin que nadie lo invoque (recall de
  memoria al escribir, captura de conversación, candado del freno).
- `arbrain/cerebro/`: el estándar del cerebro en cinco partes (meta, sentidos, memoria, manos,
  dolor).

**Siembra:** la primera vez, el daemon copia la plantilla del cerebro a esta carpeta sin pisar
nada que exista y deja la marca `.arbrain-sembrado.json`. Después nunca vuelve a copiar: lo que
borres no resucita.

## Qué existe en la edición cliente

| Superficie | Estado |
|---|---|
| Chat (`/chat`) | Funciona local: daemon + base local. Ver `chat.md` |
| Panel derecho, botón «+» | Lienzo, Explorador y Taller |
| Vistas que Levy abre con `mostrar` | Lienzo, Explorador, Documento, Memoria y las de archivos (imagen, HTML, markdown, texto, video, web) |
| Lienzo (`/lienzo`) | Funciona local; tablas `draw` y `draw_folders` en la base local. Ver `canvas/SKILL.md` |
| Ajustes | Apariencia, Modelos, Atajos, Panel, Esta computadora, Llaves, Privacidad y monitoreo, Cuenta |
| Taller › terminal | Donde haya motor de terminales (macOS y Linux) |
| Primer arranque (`/bienvenida`) | Aviso de privacidad, términos, llaves y (macOS y Windows) computer use |
| Calendario y tareas | Ocultos en esta versión («conectar» más adelante) |
| Grafo del cerebro, Rutinas, voz, avisos push, biblioteca | Ocultos en esta versión |

Lo que no está en la lista blanca redirige a `/chat` (páginas) o responde 404 (APIs). Las rutas del
daemon que solo existen en otra edición responden `{"error":"No disponible en esta edición."}`:
eso es lo esperado, no un fallo.

## Trabajo en el tiempo: despertadores

En la edición cliente el programador del daemon no siembra tareas: solo corre las que tú crees.
La vía para pedir trabajo futuro es la herramienta **`despertador`** de Levy:

- `crear` con un texto (qué revisar y qué hacer al despertar) y UNA forma: `enMinutos`, `aLas`
  o `cadaMinutos` (mínimo 5, con `veces` opcional). También `listar` y `cancelar`.
- Al vencer, el daemon escribe en esa misma conversación y Levy retoma, aunque la app se haya
  reiniciado en medio (si la app estaba cerrada, corre al volver a abrirla).
- Topes: 10 pendientes por conversación, 8 días de horizonte, 48 repeticiones, 12 despertares
  por hora.
- **Zona horaria:** en esta versión, `aLas` con «HH:MM» se interpreta en hora del centro de
  México. Si vives en otra zona, usa `enMinutos` o una fecha ISO con zona explícita.

## El freno (confirmación humana)

Todo lo que envía, paga, borra o publica (por ejemplo `git push`, `npm publish`, `rm`, un `curl`
que hace POST, herramientas cuyo nombre dice send, publish, delete o pay) no corre con la palabra
del modelo: crea una confirmación pendiente y la app te muestra «Permitir esta acción» o
«Rechazar». El turno espera hasta 90 s; si nadie la aprueba, se niega y Levy recibe el motivo.
El modelo puede pedir confirmaciones, nunca aprobarlas.

## Lo que está apagado por diseño

- **Monitoreo de cohorte:** apagado. Solo envía algo con tu consentimiento explícito y un
  receptor configurado, y aun así solo cifras diarias (sesiones, acciones de venta, cierres,
  facturación), nunca texto. Ajustes › Privacidad y monitoreo muestra exactamente qué se enviaría.
- **Computer use (`manos`):** solo macOS y Windows; apagado en cada apertura de la app y se enciende en Ajustes ›
  Esta computadora. Sin `encargar`, recetas ni extensión de Chrome en esta versión. En Linux no existe.
- **Sin `git pull` automático ni auto-commit.** Lo que se publique, lo publicas tú.
- **Codex:** solo si lo tienes instalado en tu `PATH`.
- **Actualizaciones:** por instalador nuevo, no por la web.

## Gotchas que no conviene desaprender

- El daemon es uno por carpeta de datos: un candado (`store/claudeclaw.pid`) impide dos a la vez.
  Si ves «ya corre», cierra la otra instancia de la app.
- Una vista o API que responde 404 en cliente no es un bug: revisa la lista de arriba antes de
  depurar.
- La base local de la web no tiene tiempo real: el stream del chat pinta la respuesta; otra
  pestaña se entera al recargar.
- El costo por turno que reporta el SDK solo es dinero real si usas API key. Con sesión de Claude
  (suscripción) lo escaso es la cuota de tu plan.
