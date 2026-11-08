/**
 * Arranque del servidor web (Next llama `register` una vez por proceso). Solo la edición del alumno y solo en Node: el
 * ciclo periódico del espejo de conversaciones (5 nov 2026; docs/builds/espejo-conversaciones-2026-11-05/DISENO.md), para
 * que una máquina desatendida (un VPS) exporte y una lo suyo sin esperar a que alguien abra la app. Con el espejo apagado
 * no hace nada. La instalación de Daniel sale en la primera línea.
 */
export async function register() {
  // La rama con `=== 'nodejs'` (no un `return` temprano) es la que webpack elimina al compilar para edge (guía de
  // instrumentación de Next); con el `return`, el import de abajo seguía en el grafo de edge y rompía `next dev --webpack`.
  if (process.env.NEXT_RUNTIME === 'nodejs') await (await import('./instrumentation-node')).arrancarNodo()
}
