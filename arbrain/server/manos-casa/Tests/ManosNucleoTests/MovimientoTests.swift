import CoreGraphics
import XCTest
@testable import ManosNucleo

/// Modelo de movimiento humano (Trazado.swift): continuo, aterriza exacto, perfil asimétrico y reproducible.
final class MovimientoTests: XCTestCase {
    let a = CGPoint(x: 100, y: 700), b = CGPoint(x: 900, y: 250)

    func testAterrizaExactoYEmpiezaDondeEsta() {
        for s in UInt64(1)...200 {
            let m = Movimiento(desde: a, hasta: b, semilla: s)
            XCTAssertEqual(m.punto(enMs: 0), a)
            XCTAssertEqual(m.punto(enMs: m.duracionMs), b)
            XCTAssertEqual(m.muestras().last!.0, b)
        }
    }

    func testNuncaSeTeletransporta() {
        // Tope físico medido en 101 apuntados humanos limpios (Balabit): rapidez pico ≤ 12.3·D por segundo y ≤ 6800 px/s
        // (D ≤ 900). Con margen: ningún cuadro a 120 Hz salta más de 0.13·D ni más de 90 pt.
        let d = hypot(b.x - a.x, b.y - a.y)
        for s in UInt64(1)...200 {
            let ps = Movimiento(desde: a, hasta: b, semilla: s).muestras(hz: 120)
            for (p, q) in zip(ps, ps.dropFirst()) {
                let paso = hypot(q.0.x - p.0.x, q.0.y - p.0.y)
                XCTAssertLessThan(paso, min(90, 0.13 * d), "semilla \(s)")
            }
        }
    }

    func testDuracionSigueFittsConDispersionHumanaYTecho() {
        // Ronda 3: la duración tiene la dispersión humana medida (no siempre 500–700 ms) y un techo para trabajar.
        let cortos = (UInt64(1)...200).map { Movimiento(desde: a, hasta: CGPoint(x: a.x + 120, y: a.y), semilla: $0).duracionMs }
        let medios = (UInt64(1)...200).map { Movimiento(desde: a, hasta: CGPoint(x: a.x + 400, y: a.y - 150), semilla: $0).duracionMs }
        let largos = (UInt64(1)...200).map { Movimiento(desde: a, hasta: b, semilla: $0).duracionMs }
        let mediana = { (x: [Double]) in x.sorted()[x.count / 2] }
        XCTAssertLessThan(mediana(cortos), mediana(medios)); XCTAssertLessThan(mediana(medios), mediana(largos))
        XCTAssertGreaterThan(mediana(medios), 450); XCTAssertLessThan(mediana(medios), 1000, "no se vuelve lenta")
        let logs = medios.map { log($0) }, m = logs.reduce(0, +) / Double(logs.count)
        let sd = (logs.map { ($0 - m) * ($0 - m) }.reduce(0, +) / Double(logs.count)).squareRoot()
        XCTAssertGreaterThan(sd, 0.2, "dos gestos iguales no tardan lo mismo (humano medido: σ log ≈ 0.34)")
        XCTAssertLessThanOrEqual(largos.max()!, ParametrosMovimiento.estandar.techoMs + 1e-6)
    }

    func testPicoDeVelocidadTempranoYFrenadoLargo() {
        var picos: [Double] = []
        for s in UInt64(1)...100 {
            let m = Movimiento(desde: a, hasta: b, semilla: s)
            let ps = m.muestras(hz: 240)
            var mejor = 0.0, cuando = 0.0
            for (p, q) in zip(ps, ps.dropFirst()) {
                let v = hypot(q.0.x - p.0.x, q.0.y - p.0.y) / max(1e-6, q.1 - p.1)
                if v > mejor { mejor = v; cuando = p.1 / m.duracionMs }
            }
            picos.append(cuando)
        }
        let mediana = picos.sorted()[picos.count / 2]
        XCTAssertGreaterThan(mediana, 0.06); XCTAssertLessThan(mediana, 0.38, "asimétrico: el pico llega antes de la mitad (humano: p25 0.11, mediana 0.16)")
    }

    func testCurvaNoEsRectaPeroNoDivaga() {
        var laterales: [Double] = []
        let d = hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / d, uy = (b.y - a.y) / d
        for s in UInt64(1)...100 {
            let ps = Movimiento(desde: a, hasta: b, semilla: s).muestras()
            laterales.append(ps.map { abs(-($0.0.x - a.x) * uy + ($0.0.y - a.y) * ux) }.max()! / d)
        }
        let mediana = laterales.sorted()[50]
        XCTAssertGreaterThan(mediana, 0.04); XCTAssertLessThan(mediana, 0.25)
    }

    func testNingunViajePasaDelTechoNiSeEternizaEnViajesCortos() {
        // Regresión (3 oct): el tope de rapidez estiraba los viajes cortos (7 pt → 70 pt/s) y uno duró 13 332 ms.
        var r = Azar(7)
        for i in 0..<3000 {
            let d = [7.0, 8, 12, 20, 39, 41, 45, 100, 300, 900, 1500, 2500][i % 12]
            let ang = r.uniforme() * 2 * .pi
            let m = Movimiento(desde: a, hasta: CGPoint(x: a.x + d * cos(ang), y: a.y + d * sin(ang)), semilla: UInt64(i + 1))
            XCTAssertLessThanOrEqual(m.duracionMs, ParametrosMovimiento.estandar.techoMs + 1e-6, "d \(d) semilla \(i + 1)")
            XCTAssertLessThanOrEqual(m.duracionMs, Movimiento.techoMs(d) + 1e-6, "más de 2× Fitts: d \(d) semilla \(i + 1)")
            if d <= 45 { XCTAssertLessThan(m.duracionMs, 850, "viaje corto lento: d \(d) semilla \(i + 1)") }
            XCTAssertEqual(m.punto(enMs: m.duracionMs), m.hasta)
        }
    }

    func testNingunViajeRebasaElTopeDeRapidezEnNingunaDistancia() {
        // Regresión (3 oct): los viajes largos comprimidos al techo no podían estirarse y llegaban a 28 000 pt/s
        // (saltos de ~230 pt por cuadro). Ahora se retemporizan con la misma ruta y la misma duración.
        var r = Azar(11)
        for i in 0..<1500 {
            let d = 7 + r.uniforme() * r.uniforme() * 2600, ang = r.uniforme() * 2 * .pi
            let m = Movimiento(desde: a, hasta: CGPoint(x: a.x + d * cos(ang), y: a.y + d * sin(ang)), semilla: UInt64(i + 1))
            let lim = min(max(10 * d, 2000), 7000)
            let ps = m.muestras(hz: 240)
            for (p, q) in zip(ps, ps.dropFirst()) where q.1 - p.1 > 2 {
                XCTAssertLessThan(hypot(q.0.x - p.0.x, q.0.y - p.0.y) / (q.1 - p.1) * 1000, lim * 1.08, "d \(Int(d)) semilla \(i + 1)")
            }
            XCTAssertLessThanOrEqual(m.duracionMs, ParametrosMovimiento.estandar.techoMs + 1e-6)
            XCTAssertEqual(m.punto(enMs: m.duracionMs), m.hasta)
        }
    }

    func testRaraVezSePasaComoElHumano() {
        // Humano limpio (Balabit): el p75 del sobrepaso es 0; pasarse existe pero es minoría.
        let d = hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / d, uy = (b.y - a.y) / d
        let pasados = (UInt64(1)...300).filter { s in
            Movimiento(desde: a, hasta: b, semilla: s).muestras().contains { ($0.0.x - a.x) * ux + ($0.0.y - a.y) * uy > d + 0.01 * d }
        }.count
        XCTAssertGreaterThan(pasados, 3); XCTAssertLessThan(pasados, 120)
    }

    func testRapidezConSubPicosNoUnaCampana() {
        // El crítico ciego delataba la campana limpia: la mayoría de los viajes tiene ≥ 2 sub-picos de rapidez.
        var conVarios = 0
        for s in UInt64(1)...100 {
            let ps = Movimiento(desde: a, hasta: CGPoint(x: a.x + 450, y: a.y - 200), semilla: s).muestras(hz: 60)
            let v = zip(ps, ps.dropFirst()).map { hypot($1.0.x - $0.0.x, $1.0.y - $0.0.y) / max(1e-6, $1.1 - $0.1) }
            let vmax = v.max() ?? 0
            var picos = 0
            for i in 1..<max(1, v.count - 1) {
                let sube = v[i] > v[i - 1], baja = v[i] >= v[i + 1], alto = v[i] > 0.2 * vmax
                if sube && baja && alto { picos += 1 }
            }
            if picos >= 2 { conVarios += 1 }
        }
        XCTAssertGreaterThan(conVarios, 50)
    }

    func testTrazoLognormalVaDeCeroAUnoSinRetroceder() {
        let t = TrazoLognormal(CGPoint(x: 300, y: -40), giro: 0.8, sigma: 0.35, inicio: 0.1, lapso: 0.4, z0: -2)
        XCTAssertEqual(t.avance(0.1), 0); XCTAssertEqual(t.avance(0.5), 1)
        var antes = 0.0
        for k in 0...400 { let s = t.avance(0.1 + 0.4 * Double(k) / 400); XCTAssertGreaterThanOrEqual(s, antes - 1e-12); antes = s }
        let fin = t.desplazamiento(1)
        XCTAssertEqual(fin.x, 300, accuracy: 1e-9); XCTAssertEqual(fin.y, -40, accuracy: 1e-9)
    }

    func testMismaSemillaMismaTrayectoriaYZonaQuietaNoViaja() {
        let m1 = Movimiento(desde: a, hasta: b, semilla: 42), m2 = Movimiento(desde: a, hasta: b, semilla: 42)
        XCTAssertEqual(m1.punto(enMs: 200), m2.punto(enMs: 200))
        XCTAssertEqual(Movimiento(desde: a, hasta: CGPoint(x: a.x + 3, y: a.y), semilla: 1).duracionMs, 0)
    }
}
