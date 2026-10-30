import Foundation

/// Movimiento humano del cursor fantasma (pedido de Daniel, 2 oct 18:18: «no es un proceso natural»).
///
///   - Duración por la ley de Fitts: crece con el logaritmo de la distancia, entre 250 y 600 ms.
///   - Curva Bézier cúbica con un arco leve (la mano no va en línea recta) y aceleración/frenado.
///   - Distancias mínimas no se recorren: el fantasma se queda donde está.
public enum Trayectoria {
    public static let minimoMs = 250.0, maximoMs = 600.0
    /// Debajo de esto (puntos) el fantasma no se mueve: es «la misma zona».
    public static let mismaZona = 6.0

    public static func duracionMs(distancia d: Double) -> Double {
        guard d > mismaZona else { return 0 }
        // Fitts: T = a + b·log2(1 + D/W), con W ≈ 24 pt (un botón).
        return min(maximoMs, max(minimoMs, 150 + 75 * log2(1 + d / 24)))
    }

    /// Aceleración y frenado suaves (cúbica simétrica).
    public static func suavizar(_ t: Double) -> Double {
        let x = min(1, max(0, t))
        return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
    }

    /// Punto de la curva en t ∈ [0, 1]. `arco` (−1…1) curva hacia un lado; el control se aparta un 12 % de la distancia.
    public static func punto(desde a: (x: Double, y: Double), hasta b: (x: Double, y: Double), t: Double, arco: Double) -> (x: Double, y: Double) {
        let s = suavizar(t)
        let dx = b.x - a.x, dy = b.y - a.y
        let d = max(1, (dx * dx + dy * dy).squareRoot())
        let nx = -dy / d, ny = dx / d                 // normal unitaria
        let off = 0.12 * d * arco
        let c1 = (x: a.x + dx * 0.3 + nx * off, y: a.y + dy * 0.3 + ny * off)
        let c2 = (x: a.x + dx * 0.75 + nx * off * 0.6, y: a.y + dy * 0.75 + ny * off * 0.6)
        let u = 1 - s
        let x = u * u * u * a.x + 3 * u * u * s * c1.x + 3 * u * s * s * c2.x + s * s * s * b.x
        let y = u * u * u * a.y + 3 * u * u * s * c1.y + 3 * u * s * s * c2.y + s * s * s * b.y
        return (x, y)
    }

    /// Pausa humana entre letras en modo de escritura visible: 30–80 ms, más tras espacios y signos.
    public static func pausaLetraMs(_ c: Character, azar: Double) -> Double {
        let base = 30 + 50 * min(1, max(0, azar))
        return c == " " || ",.;:!?".contains(c) ? base + 40 : base
    }
}
