# Arbrain: datos locales

Dónde guarda la app cada cosa en esta edición. Todo vive en tu máquina.

| Qué | Dónde | Quién lo escribe |
|---|---|---|
| Tu cerebro: contrato de Levy, memoria, skills | `${ARBRAIN_HOME}` (`CLAUDE.md`, `.claude/`, `arbrain/cerebro/`) | Levy y tú, por conversación o editando archivos |
| Base local de la web | Carpeta de datos de la app, `base/<tabla>.json` (un arreglo de filas por tabla) | Solo la app, por su API |
| Datos del daemon | Carpeta de datos de la app: `store/` (SQLite), `config/` (panel, confirmaciones), `uploads/` (adjuntos), `claude/` (configuración del agente, aislada de la tuya), `cohorte/` (consentimiento del monitoreo) | Solo el daemon |
| Llaves | Llavero del sistema | Ajustes › Llaves |

La carpeta de datos depende del sistema (en macOS, dentro de `~/Library/Application Support/` con el identificador
de la app). La app la elige; no la cambies a mano.

## Tablas de la base local que usa esta edición

| Tabla | Para qué | Referencia |
|---|---|---|
| `chat_sessions` | Conversaciones (título, fechas) | [chat.md](chat.md) |
| `chat_messages` | Mensajes de cada conversación | [chat.md](chat.md) |
| `draw` | Páginas del lienzo (`page_id`, `name`, `folder_id`, `page_elements`, `agent_version`, `is_deleted`, `settings`) | [canvas-diagram/pages.md](canvas-diagram/pages.md) |
| `draw_folders` | Carpetas del lienzo (`id`, `name`, `position`, `parent_id`, `archived_at`) | [canvas-diagram/pages.md](canvas-diagram/pages.md) |

El usuario de la instalación es uno solo, local («Tú»). No hay perfiles, equipos ni asignaciones.

## Reglas

1. **No edites los JSON ni el SQLite a mano.** Lee y escribe por la API de la app; los archivos se reescriben de
   forma atómica y una edición manual puede perderse o romper la tabla.
2. **No copies la carpeta de datos a otra máquina** esperando que «sincronice»: no hay sincronización.
3. **Respaldo:** tu cerebro está en `${ARBRAIN_HOME}`, que puedes versionar con git si quieres. La carpeta de datos
   se respalda copiándola con la app cerrada.
