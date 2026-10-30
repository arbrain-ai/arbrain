import CoreGraphics
import XCTest
@testable import ManosNucleo

final class TrazadoTests: XCTestCase {
    func testCurvaPasaPorLosPuntosYEsDensa() {
        let p = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0), CGPoint(x: 100, y: 100)]
        let c = Trazado.curva(p, paso: 2)
        XCTAssertEqual(c.first, p.first)
        XCTAssertEqual(c.last!.x, 100, accuracy: 0.01); XCTAssertEqual(c.last!.y, 100, accuracy: 0.01)
        XCTAssertTrue(c.contains { abs($0.x - 100) < 0.01 && abs($0.y) < 0.01 }, "pasa por el punto de control")
        for (a, b) in zip(c, c.dropFirst()) { XCTAssertLessThan(hypot(b.x - a.x, b.y - a.y), 4) }
    }

    func testCronogramaAceleraFrenaYTardaLoQueDebe() {
        let c = Trazado.curva([CGPoint(x: 0, y: 0), CGPoint(x: 600, y: 0)], paso: 2)
        let plan = Trazado.cronograma(c, velocidad: 600, presion: 0.7, natural: true)
        let total = plan.last!.1
        XCTAssertGreaterThan(total, 1000, "600 pt a 600 pt/s con rampas: más de 1 s")
        XCTAssertLessThan(total, 2500)
        // Velocidad al inicio (primer 5 %) menor que en el centro: arranca lento.
        func vel(_ i: Int) -> Double { let a = plan[i], b = plan[i + 5]; return hypot(b.0.x - a.0.x, b.0.y - a.0.y) / max(0.001, b.1 - a.1) }
        XCTAssertLessThan(vel(1), vel(plan.count / 2) * 0.7)
        XCTAssertLessThan(vel(plan.count - 7), vel(plan.count / 2) * 0.7)
        // Tiempos crecientes.
        for (a, b) in zip(plan, plan.dropFirst()) { XCTAssertGreaterThanOrEqual(b.1, a.1) }
    }

    func testTemblorEsMinimoYPresionRespira() {
        let c = Trazado.curva([CGPoint(x: 0, y: 50), CGPoint(x: 300, y: 50)], paso: 2)
        let plan = Trazado.cronograma(c, velocidad: 700, presion: 0.8, natural: true)
        XCTAssertLessThan(plan.map { abs($0.0.y - 50) }.max()!, 0.5)
        let ps = plan.map(\.2)
        XCTAssertLessThan(ps.first!, ps[ps.count / 2])
        XCTAssertLessThanOrEqual(ps.max()!, 0.8 + 1e-9)
    }

    func testParejoVariaLoJustoParaQueLaTintaCreaEnLaPresion() {
        let c = Trazado.curva([CGPoint(x: 0, y: 0), CGPoint(x: 200, y: 0)], paso: 2)
        let ps = Trazado.cronograma(c, velocidad: 1100, presion: 0.95, natural: true, parejo: true).map(\.2)
        XCTAssertEqual(ps.max()! - ps.min()!, 0.05, accuracy: 1e-9)   // > 0.03: sfmap la toma como presión real
        XCTAssertGreaterThan(ps.min()!, 0.62)                         // sobre el tope: ancho constante
    }

    func testSinNaturalEsRectoYConstante() {
        let c = Trazado.curva([CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0)], paso: 2)
        let plan = Trazado.cronograma(c, velocidad: 500, presion: 0.6, natural: false)
        XCTAssertTrue(plan.allSatisfy { $0.0.y == 0 && $0.2 == 0.6 })
        XCTAssertEqual(plan.last!.1, 200, accuracy: 1)
    }
}
