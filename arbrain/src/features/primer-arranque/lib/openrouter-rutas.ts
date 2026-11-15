/**
 * Ruta y CSP del regreso de OpenRouter, sin imports (13 nov 2026): `next.config.ts` las carga al arrancar Next, y ahí
 * el alias `@/` no se resuelve (un `import … from '@/shared/i18n'` tumbaba `next dev` y `next build`). El resto del flujo
 * vive en `openrouter-pkce.ts`, que las reexporta. Prueba: tests/i18n/next-config-imports.test.ts.
 */
export const RUTA_CALLBACK = '/api/llaves/openrouter/callback'
/** CSP de la página de regreso: ni scripts ni nada externo (ver CABECERAS_CALLBACK en openrouter-pkce.ts). */
export const CSP_CALLBACK = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
