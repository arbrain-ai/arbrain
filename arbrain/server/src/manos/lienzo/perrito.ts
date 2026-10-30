/**
 * El perrito de la demo como trazos de lápiz (caja de 600×600, origen arriba-izquierda), en el orden
 * en que lo haría un dibujante: cabeza, orejas, cara, collar, cuerpo, patas, cola y piso.
 * Gemelo de `manos-casa/scripts/perrito.py` (el que se previsualiza con PIL).
 */
type P = [number, number]

function elipse(cx: number, cy: number, rx: number, ry: number, desde = 0, hasta = 360, n = 28, giro = 0): P[] {
  const g = (giro * Math.PI) / 180
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((desde + ((hasta - desde) * i) / n) * Math.PI) / 180
    const x = rx * Math.cos(a), y = ry * Math.sin(a)
    return [cx + x * Math.cos(g) - y * Math.sin(g), cy + x * Math.sin(g) + y * Math.cos(g)] as P
  })
}

/** Un punto relleno a mano: espiral hacia dentro. */
function relleno(cx: number, cy: number, r: number, vueltas = 3): P[] {
  const n = 14 * vueltas
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, a = 2 * Math.PI * vueltas * t, rr = r * (1 - t) + 0.6
    return [cx + rr * Math.cos(a), cy + rr * 0.85 * Math.sin(a)] as P
  })
}

export function trazosPerrito(): P[][] {
  return [
    elipse(300, 190, 105, 92, -100, 275, 34),
    [[222, 130], [190, 140], [165, 185], [160, 240], [172, 282], [195, 290], [212, 262], [215, 215], [228, 168]],
    [[378, 130], [410, 140], [435, 185], [440, 240], [428, 282], [405, 290], [388, 262], [385, 215], [372, 168]],
    relleno(262, 182, 9, 5),
    relleno(338, 182, 9, 5),
    [[246, 158], [262, 153], [277, 157]],
    [[323, 157], [338, 153], [354, 158]],
    elipse(300, 238, 50, 36, 200, 560, 26),
    elipse(300, 222, 17, 11, 0, 360, 16),
    relleno(300, 222, 13, 6),
    [[300, 233], [300, 247], [288, 256], [276, 252]],
    [[300, 247], [312, 256], [324, 252]],
    [[292, 256], [293, 270], [300, 276], [307, 270], [308, 256]],
    [[228, 268], [262, 284], [300, 289], [338, 284], [372, 268]],
    elipse(300, 302, 11, 11, -90, 275, 14),
    [[232, 280], [212, 330], [200, 390], [198, 450], [210, 500], [240, 520]],
    [[368, 280], [388, 330], [400, 390], [402, 450], [390, 500], [360, 520]],
    [[198, 452], [168, 470], [158, 505], [178, 524], [236, 524]],
    [[402, 452], [432, 470], [442, 505], [422, 524], [364, 524]],
    [[262, 330], [258, 400], [256, 470], [254, 515]],
    [[338, 330], [342, 400], [344, 470], [346, 515]],
    [[236, 524], [240, 510], [256, 506], [272, 512], [276, 524], [236, 524]],
    [[324, 524], [328, 512], [344, 506], [360, 510], [364, 524], [324, 524]],
    [[249, 524], [250, 516]], [[263, 524], [263, 515]], [[337, 524], [337, 515]], [[351, 524], [350, 516]],
    [[282, 360], [300, 372], [318, 360]],
    elipse(388, 400, 18, 28, -90, 280, 18, 12),
    [[436, 480], [470, 455], [492, 418], [500, 380], [494, 352]],
    [[512, 360], [522, 372]],
    [[516, 395], [528, 400]],
    [[130, 530], [230, 534], [370, 533], [470, 529]],
  ]
}

/** Colocado: centro (cx, cy) de la ventana y escala (1 ≈ 440 pt de alto). */
export function perritoEn(cx: number, cy: number, k = 1): P[][] {
  return trazosPerrito().map(t => t.map(([x, y]) => [Math.round((cx + (x - 300) * k) * 10) / 10, Math.round((cy + (y - 330) * k) * 10) / 10] as P))
}

export function largo(trazos: P[][]): number {
  let l = 0
  for (const t of trazos) for (let i = 1; i < t.length; i++) l += Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1])
  return l
}
