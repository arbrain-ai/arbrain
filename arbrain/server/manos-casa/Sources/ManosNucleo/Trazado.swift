import CoreGraphics
import Foundation

/// La geometría y el tiempo de un trazo de mano (pura, se prueba sin permisos). La usa `Pluma` en ManosCasa.
public enum Trazado {
    /// Catmull-Rom centrípeta por los puntos dados, muestreada cada ~`paso` puntos.
    public static func curva(_ p: [CGPoint], paso: Double) -> [CGPoint] {
        guard p.count > 2 else {
            guard p.count == 2 else { return p }
            let d = hypot(p[1].x - p[0].x, p[1].y - p[0].y), n = max(1, Int(d / paso))
            return (0...n).map { i in let t = Double(i) / Double(n); return CGPoint(x: p[0].x + (p[1].x - p[0].x) * t, y: p[0].y + (p[1].y - p[0].y) * t) }
        }
        var r: [CGPoint] = [p[0]]
        for i in 0..<(p.count - 1) {
            let p0 = i > 0 ? p[i - 1] : p[i], p1 = p[i], p2 = p[i + 1], p3 = i + 2 < p.count ? p[i + 2] : p[i + 1]
            let d = hypot(p2.x - p1.x, p2.y - p1.y), n = max(1, Int(d / paso))
            for k in 1...n {
                let t = Double(k) / Double(n), t2 = t * t, t3 = t2 * t
                let x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
                let y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
                r.append(CGPoint(x: x, y: y))
            }
        }
        return r
    }

    /// Reparte la curva en el tiempo como una mano: arranca lento, crucero, frena; más lento en las curvas cerradas.
    /// Devuelve (punto, ms desde el inicio, presión).
    /// `parejo`: ancho constante para rellenos. Las apps de tinta (sfmap) solo creen en la presión si VARÍA (>0.03):
    /// se alterna presion y presion−0.05, ambas arriba del tope, y el ancho no cambia a lo largo del trazo.
    public static func cronograma(_ c: [CGPoint], velocidad: Double, presion: Double, natural: Bool, parejo: Bool = false) -> [(CGPoint, Double, Double)] {
        guard c.count > 1 else { return c.map { ($0, 0, presion) } }
        var largo: [Double] = [0]
        for i in 1..<c.count { largo.append(largo[i - 1] + hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y)) }
        let total = max(1, largo.last!)
        var r: [(CGPoint, Double, Double)] = []
        var t = 0.0
        let fase = Double.random(in: 0...(2 * .pi))
        for i in 0..<c.count {
            let u = largo[i] / total
            if i > 0 {
                let d = largo[i] - largo[i - 1]
                var v = velocidad
                if natural {
                    // Rampa de entrada y salida (30 % de la velocidad en los extremos).
                    v *= 0.3 + 0.7 * min(1, min(u, 1 - u) * 5)
                    // Curvatura: frena donde la dirección cambia.
                    if i + 1 < c.count {
                        let a = atan2(c[i].y - c[i - 1].y, c[i].x - c[i - 1].x), b = atan2(c[i + 1].y - c[i].y, c[i + 1].x - c[i].x)
                        var g = abs(b - a); if g > .pi { g = 2 * .pi - g }
                        v *= max(0.35, 1 - g * 1.5)
                    }
                }
                t += d / max(30, v) * 1000
            }
            var q = c[i]
            if natural {
                // Temblor mínimo y suave (no ruido blanco): ±0.35 pt.
                q.x += 0.35 * sin(u * 23 + fase); q.y += 0.35 * cos(u * 19 + fase * 1.3)
            }
            let p = parejo ? presion - 0.05 * Double(i % 2) : natural ? presion * (0.55 + 0.45 * sin(.pi * min(1, u * 1.15))) : presion
            r.append((q, t, max(0.05, min(1, p))))
        }
        return r
    }

}

// MARK: - Movimiento humano del puntero (ronda 3, nodo A3, 3 oct 2026)
//
// UN modelo para todo lo que se mueve: el cursor Halo (fantasma), la mano real en modo «quiero verte» (HID)
// y, portado a JS con los MISMOS parámetros, el cursor de la extensión web (nodo B2).
// Contrato para portar: docs/builds/manos-noche-2026-10-02/MOVIMIENTO.md (y el espejo Python exacto en
// docs/builds/manos-noche-2026-10-02/evidencia/A3/lab/modelo.py).
//
// Ronda 3: modelo sigma-lognormal (Plamondon 1995; Plamondon et al. 2014, «Recent developments in the study of rapid
// human movements with the kinematic theory»). Un apuntado es la SUMA de submovimientos lognormales que se solapan en
// el tiempo, cada uno un arco circular con su propio rumbo y giro:
//   - el viaje primario se reparte en 1–2 trazos (sub-picos de rapidez y quiebres de rumbo, no un arco perfecto),
//   - cae corto o pasado y lo arreglan 0–N correcciones con su propio perfil, giro y error (ganchos irregulares, no una
//     campana redonda de mínimo jerk),
//   - la duración sigue a Fitts con dispersión lognormal real (σ ≈ 0.35, medida), no 500–700 ms siempre.
// Los números se ajustaron contra 70 apuntados humanos limpios de Balabit (búsqueda local que minimiza la distancia KS
// de 16 rasgos visibles tras un canal de captura igualado) y se validaron con un crítico ciego sobre OTROS 31.

/// Parámetros publicados del modelo. Cambiarlos aquí = cambiarlos en MOVIMIENTO.md, en lab/modelo.py y en la extensión.
public struct ParametrosMovimiento: Sendable {
    /// Presupuesto de tiempo: T(ms) = fittsA + fittsB · log2(D / anchoObjetivo + 1), acotado, × exp(duracionDesv · N).
    public var fittsA = 151.085
    public var fittsB = 142.703
    public var anchoObjetivo = 24.0
    public var minimoMs = 160.0
    public var maximoMs = 1500.0
    public var duracionDesv = 0.367
    /// Debajo de esto (pt) no hay viaje: es la misma zona.
    public var mismaZona = 6.0
    /// Debajo de esto (pt) el viaje es un solo trazo lognormal recto, sin error ni correcciones.
    public var gestoCorto = 40.0
    /// Lapso del primer trazo = fraccionPrimario · T si el primario es un solo trazo; si se reparte, T · U(primLapsoMin, primLapsoMax).
    public var fraccionPrimario = 0.978
    /// σ del primer trazo (el lanzamiento) y de los demás, uniformes en [min, max]: σ grande = pico temprano y frenado largo.
    public var sigmaPrimMin = 0.242
    public var sigmaPrimMax = 0.614
    public var sigmaMin = 0.1
    public var sigmaMax = 0.627
    /// La mano ya va lanzada: el primer trazo arranca en z0 ∈ [min, max] de su lognormal (z = −3 sería desde quieto).
    public var arranqueZMin = -2.854
    public var arranqueZMax = -1.815
    /// Error del primario: a lo largo N(media, desv)·D (negativo = cae corto) y de lado N(0, desv)·D, con tope (pt).
    public var gananciaMedia = -0.103
    public var gananciaDesv = 0.118
    public var lateralDesv = 0.04
    public var errorMaximo = 90.0
    /// Giro (rad) del arco del primer trazo: signo por dirección (mano derecha) y magnitud giroMedia·exp(giroDesv·N)
    /// (cola larga: casi recto a veces, muy arqueado otras), invertido con prob. giroInvertir.
    public var giroMedia = 0.943
    public var giroDesv = 0.687
    public var giroInvertir = 0.2
    /// Trazos extra del primario (primExtraMin…primExtraMax): el primero lleva peso U(pesoMin, pesoMax) del viaje.
    public var primExtraMin = 0
    public var primExtraMax = 1
    public var primPesoMin = 0.357
    public var primPesoMax = 0.673
    /// Desvío de rumbo de los trazos extra (rad, N(0, σ)), su lapso relativo y cuándo arrancan (fracción del anterior).
    public var primRumbo = 0.36
    public var primLapsoMin = 0.262
    public var primLapsoMax = 0.691
    /// Lapso de cada trazo extra del primario: T · U(min, max) (el humano sigue avanzando lento tras el lanzamiento).
    public var extraLapsoMin = 0.15
    public var extraLapsoMax = 0.688
    public var primInicioMin = 0.242
    public var primInicioMax = 0.396
    public var primGiroK = 0.602
    /// Onda de baja frecuencia en el primer trazo (×D), k ciclos.
    public var onda = 0.006
    public var ondaKMin = 1.0
    public var ondaKMax = 3.5
    /// Correcciones (hasta corrMax): apuntan a lo que falta con error relativo N(media, desv) a lo largo y N(0, lat) de lado;
    /// la última es exacta. Giro N(0, corrGiro). Lapso (ms) = (corrA + corrB·log2(resto/4 + 1))·exp(corrDesv·N).
    public var corrMax = 2
    public var corrGananciaMedia = -0.137
    public var corrGanancia = 0.321
    public var corrLateral = 0.307
    public var corrGiro = 0.894
    public var corrA = 32.093
    public var corrB = 54.453
    public var corrDesv = 0.3
    /// Arranca cuando el trazo anterior lleva esta fracción de su lapso (> 1 = pausa breve antes de corregir).
    public var corrInicioMin = 0.359
    public var corrInicioMax = 0.85
    /// Debajo de este resto (pt) no se corrige más.
    public var umbral = 1.5
    /// Temblor fisiológico (pt) a ~9 Hz y ~3.5 Hz, nulo en los extremos (aterriza exacto).
    public var temblorPt = 0.095
    public var temblorHz = 9.0
    /// Rapidez irregular (control intermitente): tres ondas de frecuencia U(velHzMin, velHzMax) cuyas amplitudes suman
    /// ~velRuido (tope 0.8) modulan el reloj de los trazos. La mitad en gestos cortos.
    public var velRuido = 0.564
    public var velHzMin = 5.351
    public var velHzMax = 10.602
    /// Ningún viaje dura más que esto (ms, × ritmo): los saltos de pantalla completa no se vuelven lentos.
    public var techoMs = 1300.0
    public var techoFitts = 2.0
    /// Tope de rapidez pico: min(rapidezMaxD·D por segundo, rapidezMaxPt) pt/s. Si el plan lo pasa, se estira (gana al techo).
    public var rapidezMaxD = 10.0
    public var rapidezMinPt = 2000.0
    public var rapidezMaxPt = 7000.0
    /// Multiplica todas las duraciones (1 = normal; 0.5 = el agente va adelantado; 1.4 = demo pausada).
    public var ritmo = 1.0
    public init() {}
    public static let estandar = ParametrosMovimiento()
}

/// Generador reproducible (SplitMix64): misma semilla = misma trayectoria (pruebas, A/B, portado a JS).
public struct Azar: Sendable {
    var s: UInt64
    public init(_ semilla: UInt64) { s = semilla }
    public mutating func uniforme() -> Double {
        s &+= 0x9E37_79B9_7F4A_7C15
        var z = s
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return Double(z >> 11) / 9_007_199_254_740_992.0
    }
    /// Normal estándar (Box–Muller).
    public mutating func normal() -> Double {
        let u = max(1e-12, uniforme()), v = uniforme()
        return (-2 * log(u)).squareRoot() * cos(2 * .pi * v)
    }
}

/// Un submovimiento lognormal: desplazamiento `c` recorrido como arco circular de giro `giro` (rad), con el avance
/// s(t) = (Φ(z) − Φ(z0)) / (Φ(3) − Φ(z0)), z = (ln(t − t0) − μ)/σ, que cubre z ∈ [z0, 3] en [inicio, inicio + lapso].
public struct TrazoLognormal: Sendable {
    public let c: CGPoint
    public let giro: Double, sigma: Double, inicio: Double, lapso: Double, z0: Double
    let mu: Double, t0: Double, f0: Double, largo: Double, rumbo0: Double
    let onda: (amp: Double, k: Double, fase: Double)?
    public var fin: Double { inicio + lapso }
    static let zFin = 3.0
    static func phi(_ z: Double) -> Double { 0.5 * (1 + erf(z / 2.0.squareRoot())) }
    static let phiFin = phi(zFin)

    init(_ c: CGPoint, giro: Double, sigma: Double, inicio: Double, lapso: Double, z0: Double = -3, onda: (Double, Double, Double)? = nil) {
        self.c = c; self.giro = giro; self.sigma = sigma; self.inicio = inicio; self.lapso = lapso; self.z0 = z0
        self.onda = onda.map { (amp: $0.0, k: $0.1, fase: $0.2) }
        mu = log(lapso / (exp(sigma * TrazoLognormal.zFin) - exp(sigma * z0)))
        t0 = inicio - exp(mu + sigma * z0)
        f0 = TrazoLognormal.phi(z0)
        let d = hypot(c.x, c.y)
        largo = abs(giro) > 1e-6 ? d * (giro / 2) / sin(giro / 2) : d
        rumbo0 = atan2(c.y, c.x) - giro / 2
    }

    /// Avance en [0, 1] en el instante t (s).
    func avance(_ t: Double) -> Double {
        if t <= inicio { return 0 }
        if t >= fin { return 1 }
        let z = (log(t - t0) - mu) / sigma
        return (TrazoLognormal.phi(z) - f0) / (TrazoLognormal.phiFin - f0)
    }

    /// Desplazamiento recorrido con avance s (arco circular de cuerda c).
    func desplazamiento(_ s: Double) -> CGPoint {
        var x: Double, y: Double
        if abs(giro) < 1e-6 {
            x = largo * s * cos(rumbo0); y = largo * s * sin(rumbo0)
        } else {
            let r = largo / giro, a = rumbo0 + giro * s
            x = r * (sin(a) - sin(rumbo0)); y = -r * (cos(a) - cos(rumbo0))
        }
        if let o = onda {
            let w = o.amp * sin(.pi * s) * sin(2 * .pi * o.k * s + o.fase), d = max(1e-9, hypot(c.x, c.y))
            x += -c.y / d * w; y += c.x / d * w
        }
        return CGPoint(x: x, y: y)
    }
}

/// Un viaje del puntero de `desde` a `hasta`. Puro: `punto(enMs:)` se evalúa a cualquier cadencia
/// (120 Hz el Halo, 125 Hz la mano HID, 60 Hz el navegador) y aterriza EXACTO en `hasta` a `duracionMs`.
public struct Movimiento: Sendable {
    public let desde: CGPoint
    public let hasta: CGPoint
    public private(set) var duracionMs: Double = 0
    /// Los submovimientos (tiempos en segundos). El primero es el primario.
    public private(set) var trazos: [TrazoLognormal] = []
    let fase1: Double, fase2: Double, temblorHz: Double
    var temblor = 0.0
    /// Ondas del reloj (amplitud, Hz, fase) y g(0), g(T) para que tau(0) = 0 y tau(T) = T.
    var ondas: [(a: Double, f: Double, fase: Double)] = []
    var g0 = 0.0, gT = 0.0
    /// Retemporización con tope (vacía casi siempre): ver `aplanar`.
    var reloj: [Double] = []

    public static func duracionFittsMs(_ d: Double, _ p: ParametrosMovimiento = .estandar) -> Double {
        guard d > p.mismaZona else { return 0 }
        return min(p.maximoMs, max(p.minimoMs, p.fittsA + p.fittsB * log2(d / p.anchoObjetivo + 1))) * p.ritmo
    }

    /// Techo (ms): techoMs y, además, techoFitts × Fitts(D) (≈ +2σ de la dispersión humana): un viaje corto no dura
    /// como uno largo.
    public static func techoMs(_ d: Double, _ p: ParametrosMovimiento = .estandar) -> Double {
        min(p.techoMs * p.ritmo, p.techoFitts * duracionFittsMs(d, p))
    }

    public init(desde a: CGPoint, hasta b: CGPoint, parametros p: ParametrosMovimiento = .estandar, semilla: UInt64 = UInt64.random(in: 0...UInt64.max)) {
        var r = Azar(semilla)
        desde = a; hasta = b
        let dx = b.x - a.x, dy = b.y - a.y
        let d = (dx * dx + dy * dy).squareRoot()
        let ux = d > 0 ? dx / d : 1, uy = d > 0 ? dy / d : 0
        let nx = -uy, ny = ux
        fase1 = r.uniforme() * 2 * .pi; fase2 = r.uniforme() * 2 * .pi
        temblorHz = p.temblorHz * (0.85 + 0.3 * r.uniforme())
        guard d > p.mismaZona else { return }
        let total = Movimiento.duracionFittsMs(d, p) * exp(p.duracionDesv * max(-2, min(2, r.normal()))) / 1000
        let sig = p.sigmaPrimMin + (p.sigmaPrimMax - p.sigmaPrimMin) * r.uniforme()
        let z0 = p.arranqueZMin + (p.arranqueZMax - p.arranqueZMin) * r.uniforme()
        if d <= p.gestoCorto {
            let corto = min(total, Movimiento.techoMs(d, p) / 1000)
            trazos = [TrazoLognormal(CGPoint(x: dx, y: dy), giro: 0, sigma: sig, inicio: 0, lapso: corto, z0: z0)]
            temblor = p.temblorPt * 0.5
            duracionMs = corto * 1000
            ritmoIrregular(&r, p, escala: 0.5)
            return
        }
        temblor = p.temblorPt
        // Error del primario: a lo largo (corto o pasado) y de lado, acotado.
        var eA = (p.gananciaMedia + p.gananciaDesv * r.normal()) * d
        var eL = p.lateralDesv * r.normal() * d
        let e = hypot(eA, eL)
        if e > p.errorMaximo { eA *= p.errorMaximo / e; eL *= p.errorMaximo / e }
        // Giro con signo por dirección: la muñeca derecha arquea los barridos horizontales hacia arriba y los verticales
        // hacia afuera; a veces al revés. Magnitud con cola larga.
        var signo: Double = (dx >= 0) == (abs(dx) >= abs(dy)) ? -1 : 1
        if r.uniforme() < p.giroInvertir { signo = -signo }
        let giro = signo * min(2.6, p.giroMedia * exp(p.giroDesv * r.normal()))
        let k = p.ondaKMin + (p.ondaKMax - p.ondaKMin) * r.uniforme()
        let onda = (p.onda * r.normal() * d, k, r.uniforme() * 2 * .pi)
        let c1 = CGPoint(x: dx + ux * eA + nx * eL, y: dy + uy * eA + ny * eL)
        // Primario repartido en n trazos solapados.
        let lo = min(p.primExtraMin, p.primExtraMax)
        let n = min(1 + lo + Int(r.uniforme() * Double(p.primExtraMax - lo + 1)), 1 + p.primExtraMax)
        let w1 = p.primPesoMin + (p.primPesoMax - p.primPesoMin) * r.uniforme()
        var pesos: [Double] = n > 1 ? [w1] : [1]
        if n > 1 {
            let rs = (1..<n).map { _ in 0.3 + r.uniforme() }
            let suma = rs.reduce(0, +)
            pesos += rs.map { (1 - w1) * $0 / suma }
        }
        let uA = r.uniforme()
        let lap1 = total * (n == 1 ? p.fraccionPrimario : p.primLapsoMin + (p.primLapsoMax - p.primLapsoMin) * uA)
        var acum = CGPoint.zero
        for (i, w) in pesos.enumerated() {
            let ang = i > 0 ? p.primRumbo * r.normal() : 0
            let c: CGPoint
            if i == n - 1 { c = CGPoint(x: c1.x - acum.x, y: c1.y - acum.y) }
            else { c = CGPoint(x: w * (c1.x * cos(ang) - c1.y * sin(ang)), y: w * (c1.x * sin(ang) + c1.y * cos(ang))) }
            let t: TrazoLognormal
            if i == 0 {
                t = TrazoLognormal(c, giro: giro, sigma: sig, inicio: 0, lapso: lap1, z0: z0, onda: onda)
            } else {
                let sk = p.sigmaMin + (p.sigmaMax - p.sigmaMin) * r.uniforme()
                let f = p.primInicioMin + (p.primInicioMax - p.primInicioMin) * r.uniforme()
                let prev = trazos[trazos.count - 1]
                let lap = max(0.06, total * (p.extraLapsoMin + (p.extraLapsoMax - p.extraLapsoMin) * r.uniforme()))
                // Giro acotado a ±2.5 rad: sin tope, un giro cercano a 2π convertía el arco en un lazo enorme (picos de 100 000 pt/s).
                t = TrazoLognormal(c, giro: max(-2.5, min(2.5, giro * p.primGiroK * r.normal())), sigma: sk, inicio: prev.inicio + prev.lapso * f, lapso: lap)
            }
            trazos.append(t)
            acum = CGPoint(x: acum.x + c.x, y: acum.y + c.y)
        }
        // Correcciones: cada una apunta a lo que falta con su propio error, giro y perfil; la última es exacta.
        for i in 0..<p.corrMax {
            let rx = dx - acum.x, ry = dy - acum.y, resto = hypot(rx, ry)
            if resto < p.umbral { break }
            var ga = p.corrGananciaMedia + p.corrGanancia * r.normal(), gl = p.corrLateral * r.normal()
            let vx = rx / resto, vy = ry / resto
            if i == p.corrMax - 1 || resto * hypot(ga, gl) < p.umbral { ga = 0; gl = 0 }
            let c = CGPoint(x: rx + (vx * ga - vy * gl) * resto, y: ry + (vy * ga + vx * gl) * resto)
            let gk = p.corrGiro * r.normal()
            let sk = p.sigmaMin + (p.sigmaMax - p.sigmaMin) * r.uniforme()
            let lap = (p.corrA + p.corrB * log2(resto / 4 + 1)) * exp(p.corrDesv * max(-2, min(2, r.normal()))) * p.ritmo / 1000
            let f = p.corrInicioMin + (p.corrInicioMax - p.corrInicioMin) * r.uniforme()
            let prev = trazos[trazos.count - 1]
            trazos.append(TrazoLognormal(c, giro: max(-2.5, min(2.5, gk)), sigma: sk, inicio: prev.inicio + prev.lapso * f, lapso: lap))
            acum = CGPoint(x: acum.x + c.x, y: acum.y + c.y)
            if ga == 0 && gl == 0 { break }
        }
        // Cierre exacto: lo que falte (menos que el umbral) se suma al último trazo.
        let rx = dx - acum.x, ry = dy - acum.y
        if hypot(rx, ry) > 1e-9 {
            let u = trazos[trazos.count - 1]
            trazos[trazos.count - 1] = TrazoLognormal(CGPoint(x: u.c.x + rx, y: u.c.y + ry), giro: u.giro, sigma: u.sigma, inicio: u.inicio,
                                                      lapso: u.lapso, z0: u.z0, onda: u.onda.map { ($0.amp, $0.k, $0.fase) })
        }
        duracionMs = (trazos.map(\.fin).max() ?? 0) * 1000
        // Techo: un viaje largo nunca pasa de techoMs (se comprime todo el plan en el tiempo, sin cambiar la forma).
        let techo = Movimiento.techoMs(d, p)
        if duracionMs > techo {
            let k = techo / duracionMs
            trazos = trazos.map { TrazoLognormal($0.c, giro: $0.giro, sigma: $0.sigma, inicio: $0.inicio * k, lapso: $0.lapso * k, z0: $0.z0,
                                                 onda: $0.onda.map { ($0.amp, $0.k, $0.fase) }) }
            duracionMs = (trazos.map(\.fin).max() ?? 0) * 1000
        }
        ritmoIrregular(&r, p, escala: 1)
        topeRapidez(p, d)
    }

    /// Tope físico (humano limpio: rapidez pico ≤ ~10·D por segundo, p95): si el plan lo pasa, se estira en el tiempo.
    /// Sin sorteos nuevos (no cambia el orden del azar). Se mide a 240 Hz con el reloj deformado incluido.
    mutating func topeRapidez(_ p: ParametrosMovimiento, _ d: Double) {
        // Piso de rapidezMinPt: en viajes cortos la razón pico/D humana es mayor (sin piso, 7 pt de viaje = 70 pt/s y el
        // plan se estiraba a segundos: un viaje llegó a durar 13 s). El estiramiento NUNCA pasa del techo.
        let lim = min(max(p.rapidezMaxD * d, p.rapidezMinPt), p.rapidezMaxPt)
        let vp = picoRapidez()
        let k = min(vp / lim, Movimiento.techoMs(d, p) / duracionMs)
        if k > 1 {
            trazos = trazos.map { TrazoLognormal($0.c, giro: $0.giro, sigma: $0.sigma, inicio: $0.inicio * k, lapso: $0.lapso * k, z0: $0.z0,
                                                 onda: $0.onda.map { ($0.amp, $0.k, $0.fase) }) }
            duracionMs = (trazos.map(\.fin).max() ?? 0) * 1000
            g0 = g(0); gT = g(duracionMs / 1000)
        }
        // El reloj irregular no escala con el plan: se vuelve a medir.
        if k > 1, picoRapidez() > lim * 1.001 { aplanar(lim) } else if k <= 1, vp > lim * 1.001 { aplanar(lim) }
    }

    /// Cantidad de tramos (≥ 2) para medir o retemporizar: ⌊x⌋ o ⌈x⌉ con un margen de 1e-9. Cuando el techo amarra,
    /// T·240 y T·480 caen justo en un entero (1.3 s → 312 y 624) y un ulp de diferencia en exp/cos entre libm y V8
    /// cambiaba el número de tramos (paridad Swift↔JS rota por 0.1 pt). Con el margen, ese ulp ya no decide.
    static func tramos(_ x: Double, arriba: Bool) -> Int {
        max(2, arriba ? Int((x - 1e-9).rounded(.up)) : Int(x + 1e-9))
    }

    /// Rapidez pico (pt/s) medida a 240 Hz, reloj deformado incluido.
    func picoRapidez() -> Double {
        let T = duracionMs / 1000, n = Movimiento.tramos(T * 240, arriba: false)
        var vp = 0.0, prev = punto(enMs: 0)
        for k in 1...n {
            let q = punto(enMs: duracionMs * Double(k) / Double(n))
            vp = max(vp, hypot(q.x - prev.x, q.y - prev.y)); prev = q
        }
        return vp / (T / Double(n))
    }

    /// Si el techo no dejó estirar lo suficiente (viajes largos comprimidos a techoMs), se retemporiza la MISMA ruta con
    /// la MISMA duración: cada tramo de 1/480 s dura max(dt/c, ℓ/lim), con c tal que la suma dé T. Lo lento acelera
    /// un poco, el pico se aplana al tope. Sin esto un trazo de 1500 pt en 0.24 s daba picos de 28 000 pt/s (saltos de
    /// 230 pt por cuadro). `reloj[i]` = instante nuevo (ms) del instante viejo T·i/n.
    mutating func aplanar(_ lim: Double) {
        let T = duracionMs / 1000, n = Movimiento.tramos(T * 480, arriba: true), dt = T / Double(n)
        var l = [Double](), prev = punto(enMs: 0)
        for i in 1...n { let q = punto(enMs: duracionMs * Double(i) / Double(n)); l.append(hypot(q.x - prev.x, q.y - prev.y)); prev = q }
        let suma = { (c: Double) in l.reduce(0) { $0 + max(dt / c, $1 / lim) } }
        var lo = 1.0, hi = 1e6
        let posible = suma(hi) < T   // si no cabe en T, el pico manda y el viaje se alarga lo justo
        if posible { for _ in 0..<100 { let c = (lo + hi) / 2; if suma(c) > T { lo = c } else { hi = c } } }
        var t = 0.0, r = [0.0]
        for x in l { t += max(dt / hi, x / lim); r.append(t * 1000) }
        if posible { let k = duracionMs / r[n]; r = r.map { $0 * k } }
        reloj = r
        duracionMs = r[n]
    }

    /// Rapidez irregular (~6–11 Hz): tau(t) = t + g(t) − g(0) − (g(T) − g(0))·t/T con g(t) = Σ aᵢ·sin(2π fᵢ t + φᵢ)/(2π fᵢ).
    /// La rapidez se multiplica por 1 + Σ aᵢ cos(…) − cte, monótona (Σ aᵢ ≤ 0.8), y tau(0) = 0, tau(T) = T.
    mutating func ritmoIrregular(_ r: inout Azar, _ p: ParametrosMovimiento, escala: Double) {
        ondas = []
        for _ in 0..<3 {
            let f = p.velHzMin + (p.velHzMax - p.velHzMin) * r.uniforme()
            let fase = r.uniforme() * 2 * .pi
            let a = p.velRuido * escala * (0.5 + r.uniforme()) / 3
            ondas.append((a, f, fase))
        }
        let tot = ondas.reduce(0) { $0 + $1.a }
        if tot > 0.8 { ondas = ondas.map { ($0.a * 0.8 / tot, $0.f, $0.fase) } }
        g0 = g(0); gT = g(duracionMs / 1000)
    }

    func g(_ t: Double) -> Double { ondas.reduce(0) { $0 + $1.a * sin(2 * .pi * $1.f * t + $1.fase) / (2 * .pi * $1.f) } }

    /// Reloj deformado de los trazos (s).
    func tau(_ t: Double) -> Double {
        let T = baseMs / 1000
        guard !ondas.isEmpty, T > 0 else { return t }
        return t + g(t) - g0 - (gT - g0) * t / T
    }

    /// Posición en el instante `t` (ms desde que arranca). Fuera de [0, duracion] devuelve los extremos exactos.
    public func punto(enMs t: Double) -> CGPoint {
        if duracionMs <= 0 || t >= duracionMs { return hasta }
        if t <= 0 { return desde }
        guard reloj.count > 1 else { return base(t, duracionMs) }
        // Instante viejo del instante nuevo t (reloj es creciente): búsqueda binaria e interpolación lineal.
        let n = reloj.count - 1, T0 = baseMs
        var lo = 0, hi = n
        while hi - lo > 1 { let m = (lo + hi) / 2; if reloj[m] <= t { lo = m } else { hi = m } }
        let f = reloj[hi] > reloj[lo] ? (t - reloj[lo]) / (reloj[hi] - reloj[lo]) : 0
        return base(T0 * (Double(lo) + f) / Double(n), T0)
    }

    /// Duración del plan antes de retemporizar (ms).
    var baseMs: Double { (trazos.map(\.fin).max() ?? 0) * 1000 }

    /// La ruta en el reloj del plan (t y T en ms).
    func base(_ t: Double, _ T: Double) -> CGPoint {
        if t >= T { return hasta }
        if t <= 0 { return desde }
        let s = t / 1000
        var x = desde.x, y = desde.y
        let st = tau(s)
        for tr in trazos { let q = tr.desplazamiento(tr.avance(st)); x += q.x; y += q.y }
        // Temblor: envolvente sin(π·t/T), nulo al salir y al llegar.
        if temblor > 0 {
            let env = sin(.pi * t / T)
            x += temblor * env * (0.7 * sin(2 * .pi * temblorHz * s + fase1) + 0.3 * sin(2 * .pi * 3.5 * s + fase2))
            y += temblor * env * (0.7 * cos(2 * .pi * temblorHz * 1.13 * s + fase2) + 0.3 * sin(2 * .pi * 3.1 * s + fase1))
        }
        return CGPoint(x: x, y: y)
    }

    /// Muestras a `hz` (incluye el inicio y el final exactos): (punto, ms).
    public func muestras(hz: Double = 120) -> [(CGPoint, Double)] {
        guard duracionMs > 0 else { return [(hasta, 0)] }
        let paso = 1000 / hz
        var r: [(CGPoint, Double)] = []
        var t = 0.0
        while t < duracionMs { r.append((punto(enMs: t), t)); t += paso }
        r.append((hasta, duracionMs))
        return r
    }
}
