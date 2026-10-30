# agent-server (TypeScript, paquete `claudeclaw`)

## Verificación

Desde `arbrain/server/`:

- Types: `npm run typecheck` (`tsc --noEmit`)
- Test: `npm test` (`vitest run`, ~25 s)
- Build: `npm run build` (`tsc` a `dist/`; `dist/` es el que corren los servicios, no compilar sin motivo ni reiniciar)
- Lint: no hay linter configurado; el typecheck es el filtro.

Estado 9 oct 2026: types verde (0 errores); tests verde (973 pasan, 1 skipped, 116 archivos); build no corrido (escribe en `dist/` vivo).

## Edición cliente (app del alumno, 11 oct 2026)

- Contrato de lanzamiento, entorno, salud, I8 y cohorte: `docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md`.
  Todo lo del alumno se activa solo con `ARBRAIN_EDICION=cliente`; sin ella el daemon de la instalación original no cambia.
- Código propio de la edición: `src/cliente/` (arranque, llaves, rutas, confirmaciones, cohorte). `src/index.ts`
  importa `cliente/arranque.js` primero.
- Datos y crons de la instalación original: la subcarpeta de `src/` con `instalacion.json` (crons, prompts, scripts
  directos, identidades de Consejo, nombre del dueño). El núcleo la descubre (`src/dueno.ts`) y no la importa
  estáticamente; la copia del alumno no la lleva (`empaquetado.json`).
- Nombre del dueño en cualquier texto para el agente o la persona: `DUENO`/`DUENO_M` de `src/dueno.ts`, nunca literal.
- Paquete del daemon: `npm run build:cliente -- <carpeta nueva>` (compila a esa carpeta, nunca al `dist/` vivo).
