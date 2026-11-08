// El arnés corre en el navegador: los módulos que leen process.env (edición, instalación) ven uno vacío.
;(globalThis as { process?: unknown }).process ??= { env: {} }
export {}
