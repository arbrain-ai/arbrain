import { permanentRedirect } from 'next/navigation'

// La vieja sección «Artificial Brain» se repartió en el Taller el 5 oct 2026 (Daniel, 18:14): la constelación de
// neuronas vive en Taller › Memoria («Ver tu cerebro»), Acciones y Metabolismo en Taller › Rutinas (la vista viva, «Qué rinde») y
// Plasticidad en el reporte semanal («Lo que veo en ti esta semana»). Esta ruta lleva al chat con el Taller del panel
// en Memoria (dashboard-shell consume el parámetro). CerebroPage y sus salas se conservan como linaje (preservación).
export default function SegundoCerebroRoute() {
  permanentRedirect('/chat?panel=taller&taller=memoria&cerebro=1')
}
