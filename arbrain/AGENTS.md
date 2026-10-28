<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Verificación

Desde `arbrain/` (no correr `desktop:*` ni `next build` mientras la app o el dev server usan `.next`):

- Types: `npx tsc --noEmit` (también `npm run typecheck`).
- Test: `npm test` (`tsx --test 'tests/**/*.test.ts'`, ~15 s).
- Rust del shell: `cd src-tauri && cargo check --locked`.
- Lint: no hay ESLint ni script `lint` configurado; el typecheck es el filtro.
- Build web: `npm run build` (`next build --webpack`); build de escritorio solo con `desktop:install`.
- Guardia del Studio (25 oct 2026): con menos de 15 GB libres, o con src-tauri fuera del checkout designado (`$HOME/Developer/artificial-brain/arbrain`), `desktop:*`, `npm run build` y `cargo` abortan (código 75). Las compilaciones pesadas esperan su turno (semáforo) y se congelan si `com.levy.vigia-disco` pausa. Ver `scripts/compilacion-pesada.mjs`.
- Memoria del Studio (28 oct 2026): el semáforo detiene un build si un proceso pasa de 12 GB (código 137, queda en la bitácora). En una copia de agente, `npm run dev` (`scripts/dev-agente.mjs`) toma el mismo semáforo, corre con heap de 4 GB y tope de 8 GB, y se apaga tras 15 min sin uso; para capturas, `npm run dev -- --capturas <comando>` (recibe `ARBRAIN_DEV_URL`). `next dev` crudo en una copia de agente lo niega `next.config.ts`. Buscar con `rg`, nunca `grep -r` sobre el repo.

Estado 10 oct 2026: types verde (0 errores); `src-tauri` cargo check verde (9 oct); tests 933/933 (los tests de masterclass validan el contrato del archivo real, no su estado vivo); build web no corrido (pisaría `.next`).
