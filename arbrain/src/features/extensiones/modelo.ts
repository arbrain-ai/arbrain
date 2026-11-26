// El modelo puro de las extensiones vive con el daemon (que no puede importar fuera de su carpeta) y lo comparten los dos
// programas, como el catálogo inglés: una sola regla para el manifiesto, la fuente `ext:` y las acciones del panel.
export * from '../../../server/src/extensiones/modelo'
