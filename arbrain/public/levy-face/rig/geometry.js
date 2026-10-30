// geometry.js — LA TABLA DE MEDIDAS de LEVY.
//
// Generado por tools/measure.py sobre levy.png el 2026-09-03.
// NO se edita a mano: si algo está mal, se corrige el medidor y se vuelve a medir.
//
// Todo en píxeles del arte (1080², origen arriba-izquierda), que es el espacio en
// el que trabaja el shader. Procedencia de cada número:
//
//   dónde está cada rasgo  Vision (detector de rostros del sistema), confianza 1.00
//   dónde empieza y acaba  clasificador de color en Lab dentro de esa ventana
//   eje de simetría        correlación de la banda facial con su espejo, r=0.9059
//   techo de mandíbula     barrido de aperturas sobre esta misma cara (tools/sweep-jaw.mjs)
//
//   L = ojo IZQUIERDO DE LA IMAGEN (el derecho del personaje), igual que en Trinity.

export const GEO = {
  name: 'levy',
  art: 'levy.png',
  axis: 538,

  // --- ojos: apertura medida, no supuesta ---
  //   levy: 27.0 px de apertura en el ojo izq · 27.0 px en el der
  eyeL: { cx: 443.1, cy: 441.5, rx: 41.8,
           top: 428.0, bot: 455.0,
           corner: 443.5, crease: 410.8 },
  eyeR: { cx: 638.6, cy: 441.5, rx: 41.4,
           top: 428.0, bot: 455.0,
           corner: 443.5, crease: 410.8 },

  // --- mirada: amplitud del desplazamiento del iris, en px del arte ---
  //   Es el 16.5 % de rx y el 13.7 % de la apertura — las razones de Trinity
  //   aplicadas a ESTE ojo. uGaze es directamente a dónde va el iris en la
  //   pantalla: +x a la derecha, +y hacia abajo (medido, no deducido).
  gaze: { ampX: 6.87, ampY: 3.7 },
  pupilL: { cx: 436.9, cy: 440.9 },
  pupilR: { cx: 638.0, cy: 432.7 },

  // --- boca: la fila del sello y el medio ancho entre comisuras ---
  mouth: { y: 656.5, cx: 546.5, halfW: 72.1,
            top: 623.3, bottom: 678.6,
            // color de la cavidad: el quinto más oscuro del propio sello
            cavity: [0.0307, 0.0073, 0.0687],
            // recorrido de la mandíbula a apertura 1.0, en px del arte.
            //
            // Se ancla a la ESCALA DE LA CARA (distancia interpupilar), no al
            // grosor del labio. Estaba anclado al alto de los labios y salió mal:
            // Sensei tiene labios finos (45 px) y boca ancha (155 px), así que le
            // tocaban 28 px de recorrido y su boca abierta se leía como una
            // RANURA plana en vez de una cavidad — con el labio de arriba clavado,
            // que es el gesto de títere. Lo detectó el crítico del gauntlet.
            //
            // El razonamiento correcto es anatómico: la mandíbula es un hueso que
            // ROTA, y su recorrido en los labios va con el largo de la mandíbula,
            // o sea con el tamaño de la cara. El grosor del labio no interviene.
            // Referencia: 40 px en Trinity, cuya interpupilar mide 230.9 px.
            // (alto de labios medido aquí: 55.3 px, solo de control)
            jawTravel: 34.9 },

  // --- iris: el radio del limbo. La pupila se dilata en proporción a ESTO ---
  //   medido (caída de croma al 50 %)
  iris: { r: 16.0 },

  // --- alas de la nariz: de aquí NACE el surco nasogeniano al sonreír ---
  //   Vision (extremos del contorno de nariz)
  nose: { xL: 494.0, xR: 581.6, y: 592.8 },

  // --- cejas: el rig las mueve por lado y frunce el extremo interno ---
  brow: { y: 407.1, xLo: 363.4, xHi: 719.7 },

  // --- cabeza: pivote del cuello, parallax y por dónde sube el bolo al tragar ---
  head: { cx: 540.9, cy: 433.2, rx: 199.9, ry: 339.3 },

  // --- techo de apertura de mandíbula (lo calibra tools/sweep-jaw.mjs) ---
  jaw: { knee: 0.714, ceil: 1.0 },

  // --- BLOQUE DECLARADO (tools/anat.json): manda sobre lo derivado ---
  // irisL/irisR: centro del iris para el warp de pupila (Y corregida el 3 ago 2026 sobre el arte P2; trasladada al arte del 2 sep por el corrimiento del centroide de croma). cupidLift: frontera de labios calibrada con lips-check el 3 ago; re-verificada el 2 sep. emoGain 1.6: ganancia expresiva (gauntlet 3 sep: 0/5 emociones legibles con ganancia 1; ronda 2).
  anat: {
    irisL: [439.60, 442.10],
    irisR: [632.10, 442.90],
    cupidLift: -3.31,
    emoGain: 1.6,
  },
};

export default GEO;
