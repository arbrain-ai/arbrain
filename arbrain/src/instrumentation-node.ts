/**
 * La parte Node del arranque (ver `instrumentation.ts`): solo la edición del alumno arranca el ciclo periódico del espejo.
 * Vive aparte porque webpack también compila `instrumentation.ts` para edge, y un `node:child_process` alcanzable desde ahí
 * rompe `next dev --webpack` (7 nov 2026: «Reading from "node:child_process" is not handled by plugins»).
 */
export async function arrancarNodo() {
  const { esEdicionCliente } = await import('@/lib/edicion')
  if (!esEdicionCliente()) return
  const [{ arrancarPeriodico }, { almacenCrudoDeLaInstalacion }] = await Promise.all([
    import('@/lib/espejo-conversaciones/pulso'),
    import('@/lib/base-local/archivos'),
  ])
  arrancarPeriodico(almacenCrudoDeLaInstalacion)
}
