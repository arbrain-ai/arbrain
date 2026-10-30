# La Médula Espinal: rutas y sensores de tu Arbrain

> Esta referencia apunta a fuentes y sensores. Elige según el síntoma; no cargues todo el sistema
> por defecto.

## 1. Selección de fuente por síntoma

Localiza el componente, abre su fuente y comprueba el sensor vivo. Expande a otras capas solo si
la primera lectura revela una dependencia o una contradicción.

| Síntoma | Abrir | Verificar |
|---|---|---|
| Levy responde «Falta tu llave de Claude» | Ajustes › Llaves | El estado dice «presente» para la API key de Anthropic o para «Iniciar sesión con Claude». Tras guardar, el daemon se reinicia solo; espera unos segundos |
| La llave está puesta pero el chat falla | La prueba de conexión (el daemon la expone en `POST /llaves/probar`; la app la muestra junto a las llaves cuando tu versión la trae) o el mensaje de error del chat | El código: `llave_invalida`, `sin_saldo`, `saturado`, `sin_red`, `tiempo`. Cada uno tiene su arreglo (§3) |
| La app abre pero no conecta, o muestra «Reintentar» | El log del daemon (§2) | Última línea `ARBRAIN_DAEMON_ERROR` o el error de arranque. «Reintentar» relanza el daemon |
| Una respuesta se cortó o quedó a medias | [Chat](chat.md) | El turno es durable: recarga la conversación; el resultado vive en el journal aunque el stream se haya caído |
| Levy no recuerda algo que le dijiste | `.claude/memory/` y la vista Memoria (`mostrar` vista `memoria`) | ¿Existe el archivo? ¿Está enlazado desde `MEMORY.md` o `MEMORY-indice.md`? Escribir memoria es de `memory-manager` |
| ¿Qué entra en la ventana de Levy?, contexto lleno | Comando `/status` en el chat y vista Contexto | Desglose medido por turno; nunca estimar |
| Pidió permiso y no pasó nada | Diálogo «Permitir esta acción» | Las confirmaciones vencen en 90 s de espera del turno; si venció, pídela de nuevo |
| Levy no puede usar mi pantalla ni mis apps | Ajustes › Esta computadora y `arbrain/cerebro/manuales/computer-use.md` | En macOS y Windows: ¿está encendido en esta apertura? (se apaga al cerrar la app). En Mac: Accesibilidad y Grabación de pantalla para «ArbrainManos». En Linux no existe; el oficial de Claude o ChatGPT se enciende en sus apps (tabla en el manual) |
| Conectar calendario, correo o Todoist | `arbrain/cerebro/manuales/README.md` | El dueño conecta; Levy guía y corre la verificación del manual |
| Un aviso programado no llegó | Herramienta `despertador` (`listar`) | Que siga pendiente, su hora y su zona (ver [Técnica](tecnica.md)) |
| El lienzo no guarda | [Canvas](canvas/SKILL.md) | Que la escritura haya devuelto ok; el lienzo vive en la base local de la web |
| Un hook no corre (recall, captura, freno) | `.claude/settings.json` y `.claude/hooks/` | Que el intérprete exista en tu sistema (varios hooks usan Python 3) y que el hook no falle en silencio |

**Conflictos:** el estado observado manda sobre cualquier documento. Si una referencia contradice
lo que ves en la app o en el código, dilo, corrige la referencia y cita la evidencia.

## 2. Dónde vive cada cosa en tu máquina

La app guarda todo dentro de su carpeta de datos (`<datos>`):

| Sistema | `<datos>` |
|---|---|
| macOS | `~/Library/Application Support/ai.arbrain.app` |
| Windows | `%APPDATA%\ai.arbrain.app` |
| Linux | `~/.local/share/ai.arbrain.app` |

Dentro:

- `cerebro/`: tu workspace (`ARBRAIN_HOME`). Aquí viven `CLAUDE.md`, `.claude/` (memoria, skills,
  hooks) y `arbrain/cerebro/`. Es la carpeta de trabajo de Levy, así que desde una conversación
  las demás quedan en `../`.
- `daemon/`: datos del daemon. `store/` (SQLite con el journal del chat, despertadores y uso),
  `config/` (panel, archivero), `uploads/`, `claude/` (configuración del agente,
  aislada de la tuya), `cohorte/` (consentimiento del monitoreo, apagado por defecto).
- `web/`: la base local de la web (conversaciones y lienzo, en JSON).
- `logs/daemon.log`: todo lo que imprime el daemon (rota a `.1` sobre 5 MB).

Leer el log es diagnóstico legítimo. Nunca leas ni imprimas archivos de llaves o tokens: no
existen en disco por diseño (las llaves están en el llavero) y el token interno del daemon no se
toca.

## 3. Códigos de la prueba de conexión

| Código | Qué significa | Qué hacer |
|---|---|---|
| `falta_llave` | No hay llave de Claude | Ajustes › Llaves |
| `llave_invalida` | La llave no es válida o venció | Pegar una nueva o volver a iniciar sesión |
| `sin_saldo` | La cuenta no tiene crédito o cuota | Revisar facturación en tu proveedor |
| `saturado` | El proveedor está ocupado | Esperar y reintentar |
| `sin_red` | No hay salida a internet | Revisar la conexión |
| `tiempo` | La prueba tardó demasiado | Reintentar; si persiste, revisar red o proxy |

## 4. Reglas de operación

1. **Pregunta de sistema:** elige la fuente con la sección 1 y verifícala. La respuesta cita
   evidencia (archivo, línea del log, pantalla) y termina en una acción.
2. **Conteo o número:** a la fuente viva, siempre. Si no se puede medir, se dice «sin dato».
   Lo no medible jamás se reporta como cero: una base vacía puede ser un sensor ciego.
3. **AI-first:** si preguntas «¿cómo está mi sistema?», la respuesta es el estado real más una
   acción, no un manual de botones.
4. **Función inmune:** si detectas un documento que contradice al código o a la app, dilo,
   propone la cura y aplícala en el mismo trabajo.
5. **Un hook que bloquea** se prueba con el caso que debe bloquear y con el que debe dejar pasar,
   y ante la duda falla abierto. Si no, un error suyo te deja sin poder trabajar y el síntoma no
   apunta al hook.

## 5. Por qué el sistema tiene esta forma

- **Variedad requerida (Ashby):** tu atención es finita; el cerebro artificial absorbe la variedad
  (sentir, recordar, ejecutar, vigilar) y te sube solo señal destilada. Ver `filosofia.md`.
- **Excepciones, no tramas (Beer):** el dueño no vigila cada proceso; recibe lo que se salió de lo
  normal. El silencio bien diseñado prueba que los filtros trabajan.
- **Libro de rentas:** todo órgano paga renta (cambió una decisión, produjo algo, ahorró minutos)
  o se propone podar. El órgano propone, tú firmas, Levy ejecuta.

## 6. Mantenimiento

- Esta médula cambia poco: solo cuando cambia el orden de lectura, una fuente o una regla de
  operación. Si crece con contenido copiado, está fallando su propio diseño.
- Si cambias cómo se cablea algo (una skill nueva, un hook, una carpeta), actualiza en el mismo
  trabajo la referencia que lo describe.
